import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { api } from "../../api/client.js";
import { useToast } from "../../components/ToastProvider.jsx";
import { formatDateTime, formatNumber } from "../../utils/format.js";

const statusLabels = {
  all: "כל הסטטוסים",
  submitted: "ממתינה לאישור",
  approved: "נשלחה לסוכן",
  received: "התקבלה",
  cancelled: "בוטלה",
};

const statusOptions = ["all", "submitted", "approved", "received", "cancelled"];

function formatStatus(status) {
  return statusLabels[status] || status || "";
}

function compareSize(first, second) {
  const firstNumber = Number(first);
  const secondNumber = Number(second);
  if (!Number.isNaN(firstNumber) && !Number.isNaN(secondNumber)) {
    return firstNumber - secondNumber;
  }
  return String(first).localeCompare(String(second), "he");
}

function buildOrderMatrix(items = []) {
  const categories = new Map();
  items.forEach((item) => {
    const category = item.category || "";
    const productName = item.product_name || "";
    const size = item.size || "";
    if (!categories.has(category)) {
      categories.set(category, { category, sizes: new Set(), rows: new Map() });
    }
    const group = categories.get(category);
    group.sizes.add(size);
    if (!group.rows.has(productName)) {
      group.rows.set(productName, { productName, quantities: new Map(), notes: "" });
    }
    const row = group.rows.get(productName);
    row.quantities.set(size, Number(row.quantities.get(size) || 0) + Number(item.quantity || 0));
    if (!row.notes && item.notes) {
      row.notes = item.notes;
    }
  });

  return [...categories.values()].map((group) => ({
    category: group.category,
    sizes: [...group.sizes].sort(compareSize),
    rows: [...group.rows.values()],
  }));
}

export function AdminSupplyOrders({ adminName }) {
  const showToast = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [state, setState] = useState({ loading: true, error: "", items: [] });
  const [updatingOrderId, setUpdatingOrderId] = useState(null);

  const filteredOrders = useMemo(() => {
    if (statusFilter === "all") return state.items;
    return state.items.filter((order) => order.status === statusFilter);
  }, [state.items, statusFilter]);

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const data = await api.supplyOrders();
      setState({ loading: false, error: "", items: data.items || [] });
    } catch (error) {
      setState({ loading: false, error: error.message, items: [] });
    }
  }

  async function runOrderAction(order, action) {
    setUpdatingOrderId(order.order_id);
    try {
      if (action === "approve") {
        await api.approveSupplyOrder(order.order_id, {
          approved_by: adminName,
          notes: `נשלח לסוכן על ידי ${adminName}`,
        });
        showToast("ההזמנה סומנה כנשלחה לסוכן.", "success");
      }
      if (action === "received") {
        await api.markSupplyOrderReceived(order.order_id, order.agent_name);
        showToast("ההזמנה סומנה כהתקבלה.", "success");
      }
      if (action === "cancel") {
        await api.cancelSupplyOrder(order.order_id, {
          cancelled_by: adminName,
          notes: `בוטל על ידי ${adminName}`,
        });
        showToast("ההזמנה בוטלה.", "success");
      }
      await loadOrders();
    } catch (error) {
      showToast(error.message || "עדכון ההזמנה נכשל", "error");
    } finally {
      setUpdatingOrderId(null);
    }
  }

  return (
    <section className="admin-orders" aria-label="צפייה בהזמנות">
      <header className="admin-orders__header">
        <label className="field">
          <span>סטטוס</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <button className="button ghost icon-button" type="button" onClick={loadOrders} disabled={state.loading}>
          <RefreshCw aria-hidden="true" />
          {state.loading ? "מרענן..." : "רענון"}
        </button>
      </header>

      {state.error ? <p className="message">{state.error}</p> : null}
      {state.loading ? <p>טוען הזמנות...</p> : null}
      {!state.loading && !filteredOrders.length ? <p>אין הזמנות להצגה.</p> : null}

      {!state.loading && filteredOrders.length ? (
        <div className="admin-orders__list">
          {filteredOrders.map((order) => (
            <article className="admin-order" key={order.order_id}>
              <header className="admin-order__summary">
                <div>
                  <h2>הזמנה #{order.order_id}</h2>
                  <p className="subtle">
                    {order.agent_name} · {order.created_at ? formatDateTime(order.created_at) : ""}
                  </p>
                </div>
                <span className={`status-pill status-pill--${order.status}`}>
                  {formatStatus(order.status)}
                </span>
              </header>

              <div className="admin-order__meta">
                <p><strong>סה״כ פריטים:</strong> {formatNumber(order.total_quantity || 0)}</p>
                <p><strong>מייל:</strong> {order.email_sent_at ? "נשלח" : order.email_error ? "נכשל" : "לא נשלח"}</p>
                <p><strong>עודכן:</strong> {order.updated_at ? formatDateTime(order.updated_at) : ""}</p>
              </div>
              {order.notes ? (
                <p className="admin-order__note">
                  <strong>הערה להזמנה:</strong> {order.notes}
                </p>
              ) : null}

              <div className="admin-order__actions">
                {order.status === "submitted" ? (
                  <button
                    className="button"
                    type="button"
                    onClick={() => runOrderAction(order, "approve")}
                    disabled={updatingOrderId === order.order_id}
                  >
                    סמן כנשלח
                  </button>
                ) : null}
                {order.status === "approved" ? (
                  <button
                    className="button"
                    type="button"
                    onClick={() => runOrderAction(order, "received")}
                    disabled={updatingOrderId === order.order_id}
                  >
                    סמן כהתקבל
                  </button>
                ) : null}
                {["submitted", "approved"].includes(order.status) ? (
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => runOrderAction(order, "cancel")}
                    disabled={updatingOrderId === order.order_id}
                  >
                    בטל הזמנה
                  </button>
                ) : null}
              </div>

              <OrderMatrix items={order.items || []} />
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function OrderMatrix({ items }) {
  const matrix = buildOrderMatrix(items);
  if (!matrix.length) return null;

  return (
    <div className="admin-order-matrix">
      {matrix.map((group) => (
        <section className="admin-order-matrix__category" key={group.category}>
          <h3>{group.category}</h3>
          <div className="table-wrap">
            <table className="table admin-order-matrix__table">
              <thead>
                <tr>
                  <th>מוצר</th>
                  {group.sizes.map((size) => (
                    <th key={size}>{size}</th>
                  ))}
                  <th>הערות</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.productName}>
                    <td>{row.productName}</td>
                    {group.sizes.map((size) => (
                      <td key={size}>
                        {row.quantities.get(size) ? formatNumber(row.quantities.get(size)) : ""}
                      </td>
                    ))}
                    <td>{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
