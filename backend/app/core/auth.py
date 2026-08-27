import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.app.core.settings import (
    ADMIN_API_KEY,
    ADMIN_USERNAME,
    AUTH_TOKEN_SECRET,
    AUTH_TOKEN_TTL_HOURS,
    USERNAME_FIELD,
)

security = HTTPBearer(auto_error=False)


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _json_bytes(value: dict) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def create_access_token(user: dict) -> str:
    username = user.get(USERNAME_FIELD)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "user_id": user.get("id"),
        "role": "admin" if username == ADMIN_USERNAME else "agent",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=AUTH_TOKEN_TTL_HOURS)).timestamp()),
    }
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = ".".join(
        [
            _base64url_encode(_json_bytes(header)),
            _base64url_encode(_json_bytes(payload)),
        ]
    )
    signature = hmac.new(
        AUTH_TOKEN_SECRET.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_base64url_encode(signature)}"


def decode_access_token(token: str) -> dict:
    try:
        header_part, payload_part, signature_part = token.split(".")
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    signing_input = f"{header_part}.{payload_part}"
    expected_signature = hmac.new(
        AUTH_TOKEN_SECRET.encode("utf-8"),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    actual_signature = _base64url_decode(signature_part)
    if not hmac.compare_digest(expected_signature, actual_signature):
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        header = json.loads(_base64url_decode(header_part))
        payload = json.loads(_base64url_decode(payload_part))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    if header.get("alg") != "HS256":
        raise HTTPException(status_code=401, detail="Invalid token")
    if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(status_code=401, detail="Session expired")
    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


def _admin_api_key_user() -> dict:
    return {
        "sub": ADMIN_USERNAME,
        "user_id": None,
        "role": "admin",
        "auth_type": "admin_api_key",
    }


def _is_valid_admin_api_key(value: str | None) -> bool:
    if not ADMIN_API_KEY or not value:
        return False
    return hmac.compare_digest(value, ADMIN_API_KEY)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    x_admin_api_key: str | None = Header(default=None, alias="X-Admin-API-Key"),
) -> dict:
    if _is_valid_admin_api_key(x_admin_api_key):
        return _admin_api_key_user()
    if credentials and _is_valid_admin_api_key(credentials.credentials):
        return _admin_api_key_user()
    if not credentials:
        raise HTTPException(status_code=403, detail="Not authenticated")
    return decode_access_token(credentials.credentials)


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_agent_access(agent_name: str, current_user: dict) -> None:
    if current_user.get("role") == "admin":
        return
    if current_user.get("sub") != agent_name:
        raise HTTPException(status_code=403, detail="Agent access denied")
