from fastapi import APIRouter, Depends, HTTPException

from backend.app.core.auth import create_access_token, get_current_user, require_agent_access
from backend.app.core.settings import (
    ADMIN_USERNAME,
    AGENT_ACTIVE_FIELD,
    PASSWORD_FIELD,
    USERNAME_FIELD,
    USERS_TABLE,
)
from backend.app.core.timing import timed_action
from backend.app.db.supabase import get_supabase
from backend.app.schemas.auth import ChangePasswordRequest, LoginRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginRequest):
    try:
        with timed_action("login credentials and active-agent lookup"):
            query = (
                get_supabase()
                .table(USERS_TABLE)
                .select("*")
                .eq(USERNAME_FIELD, payload.username)
            )
            if payload.username != ADMIN_USERNAME:
                query = query.eq(AGENT_ACTIVE_FIELD, True)
            response = query.limit(1).execute()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if getattr(response, "error", None):
        raise HTTPException(status_code=500, detail=response.error.message)

    with timed_action("login password validation"):
        user = (response.data or [None])[0]
        if not user or user.get(PASSWORD_FIELD) != payload.password:
            raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(user)
    user.pop(PASSWORD_FIELD, None)
    return {
        "agent": payload.username,
        "user": user,
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        require_agent_access(payload.agent_name, current_user)
        supabase = get_supabase()
        with timed_action("change-password user lookup"):
            query = (
                supabase.table(USERS_TABLE)
                .select("*")
            )
            if current_user.get("user_id") is not None:
                query = query.eq("id", current_user.get("user_id"))
            else:
                query = query.eq(USERNAME_FIELD, payload.agent_name)
            response = query.limit(1).execute()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if getattr(response, "error", None):
        raise HTTPException(status_code=500, detail=response.error.message)

    with timed_action("change-password current password validation"):
        user = (response.data or [None])[0]
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user.get(PASSWORD_FIELD) != payload.current_password:
            raise HTTPException(status_code=401, detail="Invalid credentials")

    try:
        with timed_action("change-password update"):
            update_res = (
                supabase.table(USERS_TABLE)
                .update({PASSWORD_FIELD: payload.new_password})
                .eq("id", user.get("id"))
                .execute()
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if getattr(update_res, "error", None):
        raise HTTPException(status_code=500, detail=update_res.error.message)

    return {"status": "updated"}
