import os
from io import StringIO
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[3]


def load_app_env():
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return

    lines = env_path.read_text(encoding="utf-8").splitlines()
    sanitized_lines = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.startswith("SUPABASE_PROJECTS="):
            sanitized_lines.append(line)
            index += 1
            continue

        value = line.split("=", 1)[1].strip()
        block_lines = [value]
        balance = value.count("{") - value.count("}")
        index += 1
        while index < len(lines) and balance > 0:
            block_lines.append(lines[index])
            balance += lines[index].count("{") - lines[index].count("}")
            index += 1
        os.environ.setdefault("SUPABASE_PROJECTS", "\n".join(block_lines))

    load_dotenv(stream=StringIO("\n".join(sanitized_lines)))


load_app_env()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

USERS_TABLE = os.getenv("USERS_TABLE", "users")
SALES_TABLE = os.getenv("SALES_TABLE", "sales")
AGENTS_TRANSACTIONS_TABLE = os.getenv("AGENTS_TRANSACTIONS_TABLE", "agents_transactions")
PRODUCT_PRICES_TABLE = os.getenv("PRODUCT_PRICES_TABLE", "product_prices")
PRODUCT_NAMES_TABLE = os.getenv("PRODUCT_NAMES_TABLE", "product_names")
PRODUCT_VARIANTS_TABLE = os.getenv("PRODUCT_VARIANTS_TABLE", "product_variants")
STOCK_TRANSFERS_TABLE = os.getenv("STOCK_TRANSFERS_TABLE", "stock_transfers")
SUPPLY_ORDERS_TABLE = os.getenv("SUPPLY_ORDERS_TABLE", "supply_orders")
SUPPLY_ORDER_ITEMS_TABLE = os.getenv("SUPPLY_ORDER_ITEMS_TABLE", "supply_order_items")
AGENT_INVENTORY_VIEW = os.getenv("AGENT_INVENTORY_VIEW", "agent_inventory")

USERNAME_FIELD = os.getenv("USERNAME_FIELD", "agent_name")
PASSWORD_FIELD = os.getenv("PASSWORD_FIELD", "password")
AGENT_ACTIVE_FIELD = os.getenv("AGENT_ACTIVE_FIELD", "is_active")
SALE_DATE_FIELD = os.getenv("SALE_DATE_FIELD", "sale_date")
SALES_SEARCH_MIN_DATE = os.getenv("SALES_SEARCH_MIN_DATE", "").strip()
SALES_SEARCH_MAX_DATE = os.getenv("SALES_SEARCH_MAX_DATE", "").strip()
SALE_EDIT_WINDOW_MINUTES = int(os.getenv("SALE_EDIT_WINDOW_MINUTES", "15"))
ACCOUNT_ORDER_FIELD = os.getenv("ACCOUNT_ORDER_FIELD", "created_at")

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "מנהל")
CASH_PAYMENT_METHODS = {"מזומן"}
DIRECT_PAYMENT_METHODS = {"אשראי", "העברה בנקאית"}

FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "*").split(",")
    if origin.strip()
]
ENABLE_ACCOUNT_RECONCILE = os.getenv("ENABLE_ACCOUNT_RECONCILE", "false").strip().lower()
AUTH_TOKEN_SECRET = os.getenv("AUTH_TOKEN_SECRET") or SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY or "dev-auth-token-secret"
AUTH_TOKEN_TTL_HOURS = int(os.getenv("AUTH_TOKEN_TTL_HOURS", "12"))
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "").strip()

NEDARIM_MOSAD = os.getenv("NEDARIM_MOSAD", "").strip()
NEDARIM_API_VALID = os.getenv("NEDARIM_API_VALID", "").strip()
NEDARIM_API_PASSWORD = os.getenv("NEDARIM_API_PASSWORD", "").strip()
NEDARIM_CALLBACK_MAIL_ERROR = os.getenv("NEDARIM_CALLBACK_MAIL_ERROR", "").strip()

OWNER_EMAIL = os.getenv("OWNER_EMAIL")
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL") or SMTP_USERNAME
