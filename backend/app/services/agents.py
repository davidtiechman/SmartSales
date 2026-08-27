from backend.app.core.settings import AGENT_ACTIVE_FIELD, USERNAME_FIELD, USERS_TABLE
from backend.app.core.timing import timed_action
from backend.app.db.supabase import get_supabase_admin


def resolve_active_agent(agent_name):
    with timed_action("agent active check"):
        response = (
            get_supabase_admin()
            .table(USERS_TABLE)
            .select(f"id, {USERNAME_FIELD}")
            .eq(USERNAME_FIELD, agent_name)
            .eq(AGENT_ACTIVE_FIELD, True)
            .limit(1)
            .execute()
        )
    if getattr(response, "error", None):
        raise RuntimeError(response.error.message)

    agent = (response.data or [None])[0]
    if not agent:
        raise LookupError("Active agent not found")
    return agent
