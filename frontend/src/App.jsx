import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import {
  AUTH_EXPIRED_EVENT,
  DEFAULT_SUPABASE_YEAR,
  SUPABASE_YEARS,
  hasAuthToken,
  setApiYear,
  setAuthToken,
} from "./api/client.js";
import { AdminAccountOverview } from "./features/account/AdminAccountOverview.jsx";
import { AccountStatus } from "./features/account/AccountStatus.jsx";
import { AdminAccountStatus } from "./features/account/AdminAccountStatus.jsx";
import { ChangePasswordForm } from "./features/account/ChangePasswordForm.jsx";
import { LoginView } from "./features/auth/LoginView.jsx";
import { Dashboard } from "./features/dashboard/Dashboard.jsx";
import { DetailPanel } from "./features/dashboard/DetailPanel.jsx";
import { getActionsForMode } from "./features/dashboard/navigation.js";
import { AdminInventoryOverview } from "./features/inventory/AdminInventoryOverview.jsx";
import { AgentInventory } from "./features/inventory/AgentInventory.jsx";
import { StockTransferForm } from "./features/inventory/StockTransferForm.jsx";
import { PricesView } from "./features/prices/PricesView.jsx";
import { AdminSalesAnalysis } from "./features/sales/AdminSalesAnalysis.jsx";
import { SalesAnalysis } from "./features/sales/SalesAnalysis.jsx";
import { NewSaleForm } from "./features/sales/NewSaleForm.jsx";
import { SalesHistory } from "./features/sales/SalesHistory.jsx";
import { AdminSupplyOrders } from "./features/supply-order/AdminSupplyOrders.jsx";
import { SupplyOrderForm } from "./features/supply-order/SupplyOrderForm.jsx";

const SESSION_KEY = "sales_outfit_session";
const REDIRECT_KEY = "sales_outfit_redirect_path";
const LAST_APP_PATH_KEY = "sales_outfit_last_app_path";
const SUPABASE_YEAR_KEY = "sales_outfit_supabase_year";

const routes = {
  login: "/login",
  dashboard: "/app/dashboard",
  salesHistory: "/app/sales-history",
  salesAnalysis: "/app/sales-analysis",
  newSale: "/app/new-sale",
  accountStatus: "/app/account-status",
  inventory: "/app/inventory",
  supplyOrder: "/app/supply-order",
  prices: "/app/prices",
  changePassword: "/app/change-password",
  stockTransfer: "/app/stock-transfer",
  inventoryOverview: "/app/inventory-overview",
  allocationsOverview: "/app/allocations-overview",
  adminSupplyOrders: "/app/supply-orders",
  adminSalesBoard: "/app/admin-sales-board",
  adminAccountOverview: "/app/admin-account-overview",
  adminSalesAnalysis: "/app/admin-sales-analysis",
};

const sectionByPath = Object.fromEntries(
  Object.entries(routes)
    .filter(([id]) => !["login", "dashboard"].includes(id))
    .map(([id, path]) => [path, id])
);
const appPaths = new Set(Object.values(routes));

function normalizePath(path) {
  const cleanPath = (path || "/").replace(/\/+$/, "") || "/";
  if (cleanPath === "/") return routes.dashboard;
  return cleanPath;
}

function shouldRestoreLastAppPath(path) {
  return path === "/index.html";
}

function readLastAppPath() {
  const lastPath = localStorage.getItem(LAST_APP_PATH_KEY);
  return lastPath && lastPath !== routes.login && appPaths.has(lastPath) ? lastPath : null;
}

function storeLastAppPath(path) {
  const cleanPath = normalizePath(path);
  if (cleanPath !== routes.login && appPaths.has(cleanPath)) {
    localStorage.setItem(LAST_APP_PATH_KEY, cleanPath);
  }
}

function readStoredSession() {
  if (!hasAuthToken()) return null;
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function storeSession(session) {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function readStoredSupabaseYear() {
  const storedYear = localStorage.getItem(SUPABASE_YEAR_KEY);
  return SUPABASE_YEARS.includes(storedYear) ? storedYear : DEFAULT_SUPABASE_YEAR;
}

export function App() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [session, setSession] = useState(() => readStoredSession());
  const [supabaseYear, setSupabaseYear] = useState(() => readStoredSupabaseYear());
  const [loginMessage, setLoginMessage] = useState("");
  setApiYear(supabaseYear);
  const rawPath = location.pathname;
  const path = normalizePath(rawPath);
  const activeSection = sectionByPath[path] || null;

  function navigate(nextPath, { replace = false } = {}) {
    const cleanPath = normalizePath(nextPath);
    storeLastAppPath(cleanPath);
    routerNavigate(cleanPath, { replace });
  }

  useEffect(() => {
    setApiYear(supabaseYear);
    localStorage.setItem(SUPABASE_YEAR_KEY, supabaseYear);
  }, [supabaseYear]);

  useEffect(() => {
    function handleAuthExpired() {
      if (path !== routes.login) {
        sessionStorage.setItem(REDIRECT_KEY, path);
      }
      storeSession(null);
      setSession(null);
      setLoginMessage("פג תוקף ההתחברות. התחבר מחדש כדי להמשיך.");
      navigate(routes.login, { replace: true });
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [path, routerNavigate]);

  useEffect(() => {
    if (session && shouldRestoreLastAppPath(rawPath)) {
      const lastPath = readLastAppPath();
      if (lastPath && lastPath !== routes.dashboard) {
        navigate(lastPath, { replace: true });
        return;
      }
    }

    if (!session && path !== routes.login) {
      sessionStorage.setItem(REDIRECT_KEY, path);
      navigate(routes.login, { replace: true });
      return;
    }

    if (session && path === routes.login) {
      navigate(routes.dashboard, { replace: true });
      return;
    }

    if (session && activeSection) {
      const allowedSection = getActionsForMode(session.mode).some(
        (action) => action.id === activeSection
      );
      if (!allowedSection) {
        navigate(routes.dashboard, { replace: true });
      }
      return;
    }

    if (session && path !== routes.dashboard && !appPaths.has(path)) {
      navigate(routes.dashboard, { replace: true });
    }
  }, [session, rawPath, path, activeSection, routerNavigate]);

  function logout() {
    setAuthToken(null);
    storeSession(null);
    setSession(null);
    sessionStorage.removeItem(REDIRECT_KEY);
    localStorage.removeItem(LAST_APP_PATH_KEY);
    setLoginMessage("");
    navigate(routes.login, { replace: true });
  }

  function completeLogin(nextSession) {
    storeSession(nextSession);
    setSession(nextSession);
    const redirectPath = sessionStorage.getItem(REDIRECT_KEY);
    sessionStorage.removeItem(REDIRECT_KEY);
    navigate(redirectPath || routes.dashboard, { replace: true });
  }

  function handleAgentLogin(name) {
    setLoginMessage("");
    completeLogin({ name, mode: "agent" });
  }

  function handleAdminLogin(name) {
    setLoginMessage("");
    completeLogin({ name, mode: "admin" });
  }

  function renderDetail(sectionId) {
    if (!session) return null;

    if (sectionId === "salesHistory") return <SalesHistory agent={session.name} />;
    if (sectionId === "salesAnalysis") {
      return <SalesAnalysis agent={session.name} admin={session.mode === "admin"} />;
    }
    if (sectionId === "newSale") return <NewSaleForm agent={session.name} />;
    if (sectionId === "accountStatus") {
      return session.mode === "admin" ? (
        <AdminAccountStatus />
      ) : (
        <AccountStatus agent={session.name} />
      );
    }
    if (sectionId === "inventory") return <AgentInventory agent={session.name} />;
    if (sectionId === "supplyOrder") return <SupplyOrderForm agent={session.name} />;
    if (sectionId === "prices") return <PricesView admin={session.mode === "admin"} />;
    if (sectionId === "changePassword") return <ChangePasswordForm agent={session.name} />;
    if (sectionId === "stockTransfer") return <StockTransferForm />;
    if (sectionId === "inventoryOverview") return <AdminInventoryOverview />;
    if (sectionId === "allocationsOverview") {
      return <AdminInventoryOverview mode="allocations" />;
    }
    if (sectionId === "adminSupplyOrders") return <AdminSupplyOrders adminName={session.name} />;
    if (sectionId === "adminSalesBoard") return <SalesHistory admin />;
    if (sectionId === "adminAccountOverview") return <AdminAccountOverview />;
    if (sectionId === "adminSalesAnalysis") return <AdminSalesAnalysis />;
    return null;
  }

  function isSectionAllowed(sectionId) {
    return getActionsForMode(session.mode).some((action) => action.id === sectionId);
  }

  function renderWorkspace(sectionId) {
    if (!isSectionAllowed(sectionId)) {
      return <Navigate to={routes.dashboard} replace />;
    }

    return (
      <DetailPanel
        activeSection={sectionId}
        mode={session.mode}
        userName={session.name}
        onSelect={handleSelect}
        onBack={() => navigate(routes.dashboard)}
      >
        {renderDetail(sectionId)}
      </DetailPanel>
    );
  }

  function handleSelect(sectionId) {
    navigate(routes[sectionId] || routes.dashboard);
  }

  return (
    <main className="page">
      <label className="year-selector">
        <select
          aria-label="בחירת שנה"
          value={supabaseYear}
          onChange={(event) => setSupabaseYear(event.target.value)}
        >
          {SUPABASE_YEARS.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      {!session ? (
        <LoginView
          key={supabaseYear}
          message={loginMessage}
          onAgentLogin={handleAgentLogin}
          onAdminLogin={handleAdminLogin}
        />
      ) : (
        <>
          <button className="button ghost logout-button" type="button" onClick={logout}>
            יציאה
          </button>
          <Routes key={supabaseYear}>
            <Route path="/" element={<Navigate to={routes.dashboard} replace />} />
            <Route path={routes.login} element={<Navigate to={routes.dashboard} replace />} />
            <Route
              path={routes.dashboard}
              element={
                <Dashboard
                  userName={session.name}
                  mode={session.mode}
                  onSelect={handleSelect}
                />
              }
            />
            {Object.entries(sectionByPath).map(([routePath, sectionId]) => (
              <Route
                key={sectionId}
                path={routePath}
                element={renderWorkspace(sectionId)}
              />
            ))}
            <Route path="*" element={<Navigate to={routes.dashboard} replace />} />
          </Routes>
        </>
      )}
    </main>
  );
}
