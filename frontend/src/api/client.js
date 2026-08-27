const API_BASE = import.meta.env.VITE_API_BASE || "";
const AUTH_TOKEN_KEY = "sales_outfit_access_token";
export const AUTH_EXPIRED_EVENT = "sales-outfit-auth-expired";
export const DEFAULT_SUPABASE_YEAR = "2026";
export const SUPABASE_YEARS = (import.meta.env.VITE_SUPABASE_YEARS || "2025,2026")
  .split(",")
  .map((year) => year.trim())
  .filter(Boolean);

let selectedSupabaseYear = DEFAULT_SUPABASE_YEAR;

export function setApiYear(year) {
  selectedSupabaseYear = String(year || DEFAULT_SUPABASE_YEAR);
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function hasAuthToken() {
  return Boolean(getAuthToken());
}

export async function fetchJson(path, options = {}) {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Supabase-Year": selectedSupabaseYear,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    if (response.status === 401) {
      setAuthToken(null);
      if (token && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
      }
    }
    let detail = "שגיאת שרת";
    try {
      const data = await response.json();
      detail = data.detail || detail;
    } catch {
      detail = "שגיאת שרת";
    }
    throw new Error(detail);
  }

  return response.json();
}

export const api = {
  login: (payload) =>
    fetchJson("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  changePassword: (payload) =>
    fetchJson("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  sales: (agent, filters = {}) => {
    const params = new URLSearchParams({ agent });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return fetchJson(`/sales?${params.toString()}`);
  },
  adminSales: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const query = params.toString();
    return fetchJson(`/admin/sales${query ? `?${query}` : ""}`);
  },
  createSale: (payload) =>
    fetchJson("/sales", { method: "POST", body: JSON.stringify(payload) }),
  currentPrices: () => fetchJson("/prices/current"),
  updateCurrentPrice: (payload) =>
    fetchJson("/admin/prices/current", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  prepareNedarimPayment: (payload) =>
    fetchJson("/payments/nedarim/prepare", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateSale: (saleId, payload) =>
    fetchJson(`/sales/${saleId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteSale: (saleId) =>
    fetchJson(`/sales/${saleId}`, {
      method: "DELETE",
    }),
  products: () => fetchJson("/products"),
  accountSummary: (agent) =>
    fetchJson(`/account/summary?agent=${encodeURIComponent(agent)}`),
  adminAccountSummaries: () => fetchJson("/account/admin/summaries"),
  accountTransactions: (agent) =>
    fetchJson(`/account?agent=${encodeURIComponent(agent)}&limit=0`),
  refreshAccount: (agent) =>
    fetchJson("/account/refresh", {
      method: "POST",
      body: JSON.stringify({ agent_name: agent }),
    }),
  recordAgentAccountTransaction: (payload) =>
    fetchJson("/account/admin/transactions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  inventory: (agent) => fetchJson(`/inventory?agent=${encodeURIComponent(agent)}`),
  adminAgents: () => fetchJson("/admin/agents"),
  adminInventory: () => fetchJson("/admin/inventory"),
  stockTransfer: (payload) =>
    fetchJson("/admin/stock-transfers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createSupplyOrder: (payload) =>
    fetchJson("/supply-orders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateSupplyOrder: (orderId, payload) =>
    fetchJson(`/supply-orders/${orderId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  supplyOrders: (agent, filters = {}) => {
    const params = new URLSearchParams();
    if (agent) params.set("agent", agent);
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const query = params.toString();
    return fetchJson(`/supply-orders${query ? `?${query}` : ""}`);
  },
  markSupplyOrderReceived: (orderId, agentName) =>
    fetchJson(`/supply-orders/${orderId}/received`, {
      method: "POST",
      body: JSON.stringify({ agent_name: agentName }),
    }),
  approveSupplyOrder: (orderId, payload = {}) =>
    fetchJson(`/admin/supply-orders/${orderId}/approve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  cancelSupplyOrder: (orderId, payload = {}) =>
    fetchJson(`/admin/supply-orders/${orderId}/cancel`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
