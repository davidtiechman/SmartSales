import json
import os
import re
from contextvars import ContextVar

from supabase import Client, create_client

from backend.app.core.settings import (
    SUPABASE_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
)

FALLBACK_SUPABASE_YEAR = "2026"
SUPABASE_YEAR_HEADER = "X-Supabase-Year"

_current_supabase_year = ContextVar("current_supabase_year", default=FALLBACK_SUPABASE_YEAR)
_client_cache: dict[tuple[str, bool], Client] = {}
_projects_cache: dict[str, dict] | None = None


def get_current_supabase_year() -> str:
    return _current_supabase_year.get()


def set_current_supabase_year(year: str):
    return _current_supabase_year.set(str(year))


def reset_current_supabase_year(token) -> None:
    _current_supabase_year.reset(token)


def _load_supabase_projects() -> dict[str, dict]:
    global _projects_cache
    if _projects_cache is not None:
        return _projects_cache

    raw_projects = os.getenv("SUPABASE_PROJECTS")
    if not raw_projects:
        _projects_cache = {}
        return _projects_cache

    try:
        projects = json.loads(raw_projects)
    except json.JSONDecodeError as exc:
        raise RuntimeError("SUPABASE_PROJECTS must be valid JSON") from exc

    if not isinstance(projects, dict):
        raise RuntimeError("SUPABASE_PROJECTS must be a JSON object")

    _projects_cache = {
        str(year): config
        for year, config in projects.items()
        if isinstance(config, dict)
    }
    return _projects_cache


def default_supabase_year() -> str:
    configured_default = _load_supabase_projects().get("default_year")
    if configured_default:
        return str(configured_default)
    return FALLBACK_SUPABASE_YEAR


def _configured_years() -> set[str]:
    years = {FALLBACK_SUPABASE_YEAR}
    years.update(
        year
        for year, config in _load_supabase_projects().items()
        if isinstance(config, dict)
    )
    for key in os.environ:
        match = re.fullmatch(r"SUPABASE_(\d{4})_URL", key)
        if match:
            years.add(match.group(1))
    return years


def available_supabase_years() -> list[str]:
    return sorted(_configured_years())


def validate_supabase_year(year: str | None) -> str:
    selected_year = str(year or default_supabase_year()).strip()
    if not re.fullmatch(r"\d{4}", selected_year):
        raise ValueError(f"Invalid Supabase year: {selected_year}")
    if selected_year not in _configured_years():
        raise ValueError(f"Unsupported Supabase year: {selected_year}")
    return selected_year


def _env_value(year: str, name: str, fallback: str | None = None) -> str | None:
    return os.getenv(f"SUPABASE_{year}_{name}") or fallback


def _clean_config_value(value: str | None) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    if not value or value == "...":
        return None
    return value


def _project_config(year: str, admin: bool = False) -> tuple[str, str]:
    year = validate_supabase_year(year)
    project = _load_supabase_projects().get(year, {})
    url = _clean_config_value(
        _env_value(year, "URL")
        or project.get("url")
        or (SUPABASE_URL if year == FALLBACK_SUPABASE_YEAR else None)
    )
    key_name = "SERVICE_ROLE_KEY" if admin else "KEY"
    project_key_name = "service_role_key" if admin else "anon_key"
    fallback_key = (
        SUPABASE_SERVICE_ROLE_KEY if admin and year == FALLBACK_SUPABASE_YEAR else
        SUPABASE_KEY if not admin and year == FALLBACK_SUPABASE_YEAR else
        None
    )
    key = _clean_config_value(
        _env_value(year, key_name) or project.get(project_key_name) or fallback_key
    )

    if not url:
        raise RuntimeError(f"SUPABASE_{year}_URL is missing")
    if not key:
        raise RuntimeError(f"SUPABASE_{year}_{key_name} is missing")
    return url, key


def get_supabase_client(year: str | None = None, *, admin: bool = False) -> Client:
    selected_year = validate_supabase_year(year or get_current_supabase_year())
    cache_key = (selected_year, admin)
    if cache_key not in _client_cache:
        url, key = _project_config(selected_year, admin=admin)
        _client_cache[cache_key] = create_client(url, key)
    return _client_cache[cache_key]


def get_supabase() -> Client:
    return get_supabase_client(admin=False)


def get_supabase_admin() -> Client:
    return get_supabase_client(admin=True)
