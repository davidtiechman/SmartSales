from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from backend.app.api.routes import account, auth, health, inventory, payments, sales, supply_orders
from backend.app.core.settings import FRONTEND_ORIGINS
from backend.app.db.supabase import (
    SUPABASE_YEAR_HEADER,
    reset_current_supabase_year,
    set_current_supabase_year,
    validate_supabase_year,
)
from backend.app.services.catalog_cache import refresh_cache

app = FastAPI(title="Sales Outfit API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(sales.router)
app.include_router(account.router)
app.include_router(inventory.router)
app.include_router(payments.router)
app.include_router(supply_orders.router)


@app.middleware("http")
async def select_supabase_project(request, call_next):
    requested_year = request.query_params.get("year") or request.headers.get(SUPABASE_YEAR_HEADER)
    try:
        year = validate_supabase_year(requested_year)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    token = set_current_supabase_year(year)
    try:
        return await call_next(request)
    finally:
        reset_current_supabase_year(token)


@app.on_event("startup")
def load_catalog_cache():
    try:
        refresh_cache()
    except Exception as exc:
        print(f"[startup] catalog cache was not preloaded: {exc}")

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")


def serve_frontend(path: str = ""):
    if not FRONTEND_DIST.exists():
        return {"status": "ok", "ui": "Run the React app from frontend with npm run dev."}

    requested_file = (FRONTEND_DIST / path).resolve()
    if requested_file.is_file() and FRONTEND_DIST in requested_file.parents:
        return FileResponse(requested_file)

    return FileResponse(FRONTEND_DIST / "index.html")


@app.get("/")
def ui_root():
    if FRONTEND_DIST.exists():
        return RedirectResponse(url="/ui/")
    return serve_frontend()


@app.get("/ui")
@app.get("/ui/")
@app.get("/ui/{full_path:path}")
def ui_route(full_path: str = ""):
    return serve_frontend(full_path)


@app.get("/login")
def login_route():
    return serve_frontend()


@app.get("/app")
@app.get("/app/{full_path:path}")
def app_route(full_path: str = ""):
    return serve_frontend()
