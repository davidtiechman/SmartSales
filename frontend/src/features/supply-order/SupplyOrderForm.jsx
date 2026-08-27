import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, Download, FileSpreadsheet, Pencil, RefreshCw } from "lucide-react";

import { api } from "../../api/client.js";
import { Message } from "../../components/Message.jsx";
import { useToast } from "../../components/ToastProvider.jsx";
import { categoryProducts, categorySizes } from "../../constants/catalog.js";
import { formatDateTime, formatNumber } from "../../utils/format.js";

const categories = Object.keys(categorySizes);
const closedStatuses = new Set(["received", "cancelled"]);
const temporaryOrderStoragePrefix = "sales_outfit_supply_order_failed_submit";
const statusLabels = {
  submitted: "ממתינה לאישור",
  approved: "אושרה - בדרך לסוכן",
  received: "התקבלה",
  cancelled: "בוטלה",
};

function createEmptyLine() {
  const category = categories[0];
  return {
    category,
    product_name: categoryProducts[category]?.[0] || "",
    size: categorySizes[category]?.[0] || "",
    quantity: 1,
    notes: "",
  };
}

function itemKey(category, productName, size) {
  return `${category}::${productName}::${size}`;
}

function rowKey(category, productName) {
  return `${category}::${productName}`;
}

function buildOrderQuantityMap(order) {
  const quantities = {};
  (order?.items || []).forEach((item) => {
    quantities[itemKey(item.category, item.product_name, item.size)] = String(item.quantity || "");
  });
  return quantities;
}

function buildOrderNotesMap(order) {
  const notes = {};
  (order?.items || []).forEach((item) => {
    const key = rowKey(item.category, item.product_name);
    if (!notes[key] && item.notes) {
      notes[key] = item.notes;
    }
  });
  return notes;
}

function buildBulkCatalog() {
  return categories.map((category) => ({
    category,
    sizes: categorySizes[category] || [],
    rows: (categoryProducts[category] || []).map((productName) => ({
      productName,
    })),
  })).filter(
    (categoryGroup) => categoryGroup.rows.length && categoryGroup.sizes.length
  );
}

function temporaryOrderStorageKey(agent, mode = "standard") {
  return `${temporaryOrderStoragePrefix}:${mode}:${agent || "unknown"}`;
}

function saveTemporaryOrder(key, payload) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        ...payload,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    // Local backup is best-effort only.
  }
}

function readTemporaryOrder(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function clearTemporaryOrder(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore localStorage cleanup errors.
  }
}

function formatDownloadDate() {
  return new Date().toLocaleDateString("he-IL");
}

function buildDownloadRows(items) {
  return (items || []).map((item) => ({
    category: item.category || "",
    product_name: item.product_name || "",
    size: item.size || "",
    quantity: Number(item.quantity || 0),
    notes: item.notes || "",
  }));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildOrderHtml({ agent, date, items, totalQuantity }) {
  const rows = buildDownloadRows(items);
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>הזמנת סחורה</title>
  <style>
    body { font-family: Arial, sans-serif; direction: rtl; color: #222; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #999; padding: 8px; text-align: right; }
    th { background: #f2f2f2; }
  </style>
</head>
<body>
  <h1>הזמנת סחורה</h1>
  <p><strong>שם הסוכן:</strong> ${escapeHtml(agent)}</p>
  <p><strong>תאריך:</strong> ${escapeHtml(date)}</p>
  <table>
    <thead>
      <tr>
        <th>קטגוריה</th>
        <th>מוצר</th>
        <th>מידה</th>
        <th>כמות</th>
        <th>הערה</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((item) => `
        <tr>
          <td>${escapeHtml(item.category)}</td>
          <td>${escapeHtml(item.product_name)}</td>
          <td>${escapeHtml(item.size)}</td>
          <td>${escapeHtml(item.quantity)}</td>
          <td>${escapeHtml(item.notes)}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
  <p><strong>סך כל הכמויות:</strong> ${escapeHtml(totalQuantity)}</p>
</body>
</html>`;
}

function downloadOrderExcel({ agent, items, totalQuantity }) {
  const date = formatDownloadDate();
  const html = buildOrderHtml({ agent, date, items, totalQuantity });
  downloadBlob(
    new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" }),
    `supply-order-${agent || "agent"}-${new Date().toISOString().slice(0, 10)}.xls`
  );
}

function downloadOrderPdf({ agent, items, totalQuantity }) {
  const date = formatDownloadDate();
  const html = buildOrderHtml({ agent, date, items, totalQuantity });
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("לא ניתן לפתוח חלון PDF. יש לאפשר חלונות קופצים בדפדפן ולנסות שוב.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
}

function OrderDownloadButton({ agent, items, totalQuantity, disabled = false }) {
  const [open, setOpen] = useState(false);
  const downloadItems = Array.isArray(items) ? items : [];

  return (
    <div className="order-download">
      <button
        className="button ghost icon-button"
        type="button"
        disabled={disabled || !downloadItems.length}
        onClick={() => setOpen((current) => !current)}
      >
        <Download aria-hidden="true" />
        הורדת ההזמנה
      </button>
      {open ? (
        <div className="order-download__menu">
          <button
            className="link-button"
            type="button"
            onClick={() => {
              setOpen(false);
              downloadOrderPdf({ agent, items: downloadItems, totalQuantity });
            }}
          >
            הורדה כ-PDF
          </button>
          <button
            className="link-button"
            type="button"
            onClick={() => {
              setOpen(false);
              downloadOrderExcel({ agent, items: downloadItems, totalQuantity });
            }}
          >
            הורדה כ-Excel
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function SupplyOrderForm({ agent }) {
  const showToast = useToast();
  const temporaryStorageKey = temporaryOrderStorageKey(agent, "standard");
  const [draftLine, setDraftLine] = useState(createEmptyLine);
  const [items, setItems] = useState([]);
  const [orderDocument, setOrderDocument] = useState(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ordersPanelOpen, setOrdersPanelOpen] = useState(false);
  const [bulkFormOpen, setBulkFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [ordersState, setOrdersState] = useState({
    loading: false,
    error: "",
    items: [],
  });

  const products = useMemo(
    () => categoryProducts[draftLine.category] || [],
    [draftLine.category]
  );
  const sizes = useMemo(
    () => categorySizes[draftLine.category] || [],
    [draftLine.category]
  );
  const totalQuantity = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );
  const openOrders = ordersState.items.filter(
    (order) => !closedStatuses.has(order.status)
  );
  const bulkOrderPortal =
    bulkFormOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="bulk-order-page"
            role="dialog"
            aria-modal="true"
            aria-label="מילוי טופס הזמנות למכירת 2026"
          >
            <BulkSupplyOrderForm
              agent={agent}
              order={editingOrder}
              submitting={submitting}
              onCancel={() => {
                setEditingOrder(null);
                setBulkFormOpen(false);
              }}
              onSubmit={submitBulkOrder}
            />
          </div>,
          document.body
        )
      : null;

  useEffect(() => {
    if (ordersPanelOpen) {
      loadOrders();
    }
  }, [ordersPanelOpen, agent]);

  useEffect(() => {
    const savedOrder = readTemporaryOrder(temporaryStorageKey);
    if (savedOrder?.items?.length) {
      setItems(savedOrder.items);
      setMessage("שוחזרה הזמנה שנשמרה זמנית לאחר ניסיון שליחה שלא הושלם.");
    }
  }, [temporaryStorageKey]);

  useEffect(() => {
    if (!bulkFormOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [bulkFormOpen]);

  async function loadOrders() {
    setOrdersState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const data = await api.supplyOrders(agent);
      setOrdersState({
        loading: false,
        error: "",
        items: data.items || [],
      });
    } catch (error) {
      setOrdersState({ loading: false, error: error.message, items: [] });
    }
  }

  function updateDraft(field, value) {
    setDraftLine((current) => {
      const updated = { ...current, [field]: value };
      if (field === "category") {
        updated.product_name = categoryProducts[value]?.[0] || "";
        updated.size = categorySizes[value]?.[0] || "";
      }
      return updated;
    });
  }

  function addItem(event) {
    event.preventDefault();
    const quantity = Number(draftLine.quantity || 0);
    if (quantity <= 0) {
      return;
    }

    setItems((current) => [
      ...current,
      {
        ...draftLine,
        quantity,
        id: `${Date.now()}-${current.length}`,
      },
    ]);
    setDraftLine((current) => ({ ...current, quantity: 1, notes: "" }));
    setOrderDocument(null);
    setMessage("");
  }

  function removeItem(id) {
    setItems((current) => current.filter((item) => item.id !== id));
    setOrderDocument(null);
    setMessage("");
  }

  async function submitOrder() {
    if (!items.length) {
      return;
    }
    setSubmitting(true);
    setMessage("");
    saveTemporaryOrder(temporaryStorageKey, {
      agent_name: agent,
      items,
    });
    showToast("שולח הזמנה...", "loading", 0);
    try {
      const result = await api.createSupplyOrder({
        agent_name: agent,
        items: items.map(({ id, ...item }) => item),
      });
      setOrderDocument({
        id: result.order?.order_id,
        agent,
        createdAt: result.order?.created_at
          ? formatDateTime(result.order.created_at)
          : formatDateTime(),
        items,
        totalQuantity,
        emailSent: Boolean(result.email?.sent),
        emailPending: Boolean(result.email?.pending),
        emailError: result.email?.error || "",
        status: result.order?.status || "submitted",
      });
      setItems([]);
      clearTemporaryOrder(temporaryStorageKey);
      if (ordersPanelOpen) {
        loadOrders();
      }
      const emailPending = Boolean(result.email?.pending);
      const emailSent = Boolean(result.email?.sent);
      setMessage(
        emailSent
          ? "ההזמנה נשמרה ונשלחה במייל לבעלים."
          : emailPending
            ? "ההזמנה נשמרה ומייל נשלח לבעלים."
            : `ההזמנה נשמרה, אך המייל לא נשלח: ${result.email?.error || "חסרות הגדרות מייל"}`
      );
      showToast(
        emailSent
          ? "ההזמנה נשמרה ונשלחה בהצלחה."
          : emailPending
            ? "ההזמנה נשמרה. מייל נשלח לבעלים."
            : "ההזמנה נשמרה, אך שליחת המייל נכשלה.",
        emailSent || emailPending ? "success" : "error"
      );
    } catch (error) {
      setMessage("ההזמנה לא נשלחה. כל הפריטים נשמרו זמנית וניתן לתקן ולנסות שוב.");
      showToast(error.message || "שמירת ההזמנה נכשלה", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitBulkOrder(payload, order = null) {
    if (!payload.items.length) {
      return false;
    }
    setSubmitting(true);
    setMessage("");
    showToast(order ? "שומר שינויים..." : "שולח הזמנה...", "loading", 0);
    try {
      const requestPayload = {
        agent_name: order?.agent_name || agent,
        notes: payload.notes,
        items: payload.items,
      };
      const result = order
        ? await api.updateSupplyOrder(order.order_id, requestPayload)
        : await api.createSupplyOrder(requestPayload);
      if (order) {
        setOrderDocument(null);
      } else {
        setOrderDocument({
          id: result.order?.order_id,
          agent,
          createdAt: result.order?.created_at
            ? formatDateTime(result.order.created_at)
            : formatDateTime(),
          items: result.items || payload.items,
          totalQuantity: payload.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
          emailSent: Boolean(result.email?.sent),
          emailPending: Boolean(result.email?.pending),
          emailError: result.email?.error || "",
          status: result.order?.status || "submitted",
        });
      }
      if (ordersPanelOpen) {
        loadOrders();
      }
      setEditingOrder(null);
      setBulkFormOpen(false);
      setMessage(order ? "השינויים נשמרו בהזמנה." : "ההזמנה נשמרה ונשלחה.");
      showToast(order ? "השינויים נשמרו." : "ההזמנה נשלחה.", "success");
      return true;
    } catch (error) {
      setMessage("ההזמנה לא נשלחה. כל הפריטים נשמרו זמנית וניתן לתקן ולנסות שוב.");
      showToast(error.message || "שמירת ההזמנה נכשלה", "error");
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  function startEditOrder(order) {
    setEditingOrder(order);
    setBulkFormOpen(true);
    setMessage("");
  }

  async function markReceived(orderId) {
    showToast("מעדכן סטטוס הזמנה...", "loading", 0);
    try {
      await api.markSupplyOrderReceived(orderId, agent);
      showToast("ההזמנה סומנה כהתקבלה.", "success");
      loadOrders();
    } catch (error) {
      showToast(error.message || "עדכון סטטוס ההזמנה נכשל", "error");
    }
  }

  return (
    <div className="supply-order">
      <section className="supply-order__toolbar" aria-label="פעולות הזמנת סחורה">
        <button
          className="button ghost icon-button"
          type="button"
          onClick={() => setOrdersPanelOpen((current) => !current)}
        >
          <ClipboardList aria-hidden="true" />
          {ordersPanelOpen ? "הסתר הזמנות פתוחות" : "הצג הזמנות פתוחות"}
        </button>
        <button
          className="button ghost icon-button annual-sale-button"
          type="button"
          title="פתוח עכשיו לפני המכירה השנתית"
          onClick={() => {
            setEditingOrder(null);
            setBulkFormOpen(true);
          }}
        >
          <FileSpreadsheet aria-hidden="true" />
          מילוי טופס הזמנות למכירת 2026
        </button>
      </section>

      {ordersPanelOpen ? (
        <OpenSupplyOrders
          loading={ordersState.loading}
          error={ordersState.error}
          orders={openOrders}
          onRefresh={loadOrders}
          onEditOrder={startEditOrder}
          onMarkReceived={markReceived}
        />
      ) : null}

      {bulkOrderPortal}

      <form className="form supply-order__form" onSubmit={addItem}>
        <label className="field">
          <span>קטגוריה</span>
          <select
            value={draftLine.category}
            onChange={(event) => updateDraft("category", event.target.value)}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>מוצר</span>
          <select
            value={draftLine.product_name}
            onChange={(event) => updateDraft("product_name", event.target.value)}
          >
            {products.map((product) => (
              <option key={product} value={product}>
                {product}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>מידה</span>
          <select
            value={draftLine.size}
            onChange={(event) => updateDraft("size", event.target.value)}
          >
            {sizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>כמות</span>
          <input
            type="number"
            min="1"
            value={draftLine.quantity}
            onChange={(event) => updateDraft("quantity", event.target.value)}
            required
          />
        </label>

        <label className="field supply-order__notes">
          <span>הערה</span>
          <input
            type="text"
            value={draftLine.notes}
            onChange={(event) => updateDraft("notes", event.target.value)}
            placeholder="אופציונלי"
          />
        </label>

        <button className="button ghost" type="submit">
          הוסף להזמנה
        </button>
      </form>

      <section className="order-cart">
        <header className="order-cart__header">
          <h2>פריטים בהזמנה</h2>
          <span>{formatNumber(totalQuantity)} פריטים</span>
        </header>

        {!items.length ? (
          <p>עדיין לא נוספו פריטים להזמנה.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>קטגוריה</th>
                  <th>מוצר</th>
                  <th>מידה</th>
                  <th>כמות</th>
                  <th>הערה</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.category}</td>
                    <td>{item.product_name}</td>
                    <td>{item.size}</td>
                    <td>{formatNumber(item.quantity)}</td>
                    <td>{item.notes}</td>
                    <td>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => removeItem(item.id)}
                      >
                        הסר
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          className="button order-cart__submit"
          type="button"
          onClick={submitOrder}
          disabled={!items.length || submitting}
        >
          {submitting ? "שולח הזמנה..." : "שלח"}
        </button>
        {items.length ? (
          <OrderDownloadButton
            agent={agent}
            items={items}
            totalQuantity={totalQuantity}
            disabled={submitting}
          />
        ) : null}
        <Message>{message}</Message>
      </section>

      {orderDocument ? <OrderDocument order={orderDocument} /> : null}
    </div>
  );
}

function formatStatus(status) {
  return statusLabels[status] || status || "";
}

function BulkSupplyOrderForm({ agent, order, submitting, onCancel, onSubmit }) {
  const temporaryStorageKey = temporaryOrderStorageKey(agent, "bulk");
  const [quantities, setQuantities] = useState(() => buildOrderQuantityMap(order));
  const [rowNotes, setRowNotes] = useState(() => buildOrderNotesMap(order));
  const [notes, setNotes] = useState(order?.notes || "");
  const [localMessage, setLocalMessage] = useState("");
  const bulkCatalog = useMemo(() => buildBulkCatalog(), []);

  useEffect(() => {
    setQuantities(buildOrderQuantityMap(order));
    setRowNotes(buildOrderNotesMap(order));
    setNotes(order?.notes || "");
  }, [order]);

  useEffect(() => {
    if (order) return;
    const savedOrder = readTemporaryOrder(temporaryStorageKey);
    if (!savedOrder) return;
    setQuantities(savedOrder.quantities || {});
    setRowNotes(savedOrder.rowNotes || {});
    setNotes(savedOrder.notes || "");
    setLocalMessage("שוחזרה הזמנה שנשמרה זמנית לאחר ניסיון שליחה שלא הושלם.");
  }, [order, temporaryStorageKey]);

  const selectedItems = useMemo(() => {
    const items = [];
    bulkCatalog.forEach((categoryGroup) => {
      categoryGroup.rows.forEach((row) => {
        categoryGroup.sizes.forEach((size) => {
          const quantity = Number(quantities[itemKey(categoryGroup.category, row.productName, size)] || 0);
          if (quantity > 0) {
            items.push({
              category: categoryGroup.category,
              product_name: row.productName,
              size,
              quantity,
              notes: rowNotes[rowKey(categoryGroup.category, row.productName)] || "",
            });
          }
        });
      });
    });
    return items;
  }, [bulkCatalog, quantities, rowNotes]);

  const totalQuantity = selectedItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );

  function updateQuantity(category, productName, size, value) {
    setQuantities((current) => ({
      ...current,
      [itemKey(category, productName, size)]: value,
    }));
  }

  function updateRowNote(category, productName, value) {
    setRowNotes((current) => ({
      ...current,
      [rowKey(category, productName)]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!order) {
      saveTemporaryOrder(temporaryStorageKey, {
        agent_name: agent,
        notes,
        quantities,
        rowNotes,
        items: selectedItems,
      });
    }
    const saved = await onSubmit({ notes, items: selectedItems }, order);
    if (saved && !order) {
      setQuantities({});
      setRowNotes({});
      setNotes("");
      setLocalMessage("");
      clearTemporaryOrder(temporaryStorageKey);
    } else if (!saved && !order) {
      setLocalMessage("ההזמנה לא נשלחה. כל הפריטים נשמרו זמנית וניתן לתקן ולנסות שוב.");
    }
  }

  return (
    <section className="bulk-order" aria-label="טופס הזמנת סחורה מלא">
      <header className="bulk-order__header">
        <div>
          <p className="eyebrow">{order ? "עריכת הזמנה" : "מכירת 2026"}</p>
          <h2>{order ? `הזמנה #${order.order_id}` : "טופס הזמנות למכירת 2026"}</h2>
          <p className="subtle">פתוח עכשיו למילוי לפני המכירה השנתית.</p>
        </div>
        <div className="bulk-order__summary">
          <span>סוגי פריטים: {formatNumber(selectedItems.length)}</span>
          <strong>{formatNumber(totalQuantity)} פריטים</strong>
        </div>
        <OrderDownloadButton
          agent={agent}
          items={selectedItems}
          totalQuantity={totalQuantity}
          disabled={submitting}
        />
        <button className="button ghost" type="button" onClick={onCancel} disabled={submitting}>
          חזרה לאתר
        </button>
      </header>

      <form className="bulk-order__form" onSubmit={handleSubmit}>
        <Message>{localMessage}</Message>
        <label className="field bulk-order__notes">
          <span>הערה להזמנה</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="כאן אפשר להוסיף עוד מוצרים למכירה למשל שקיות, עטים, מחשבונים וכו'"
            rows={4}
          />
        </label>

        {bulkCatalog.map((categoryGroup) => {
          return (
            <section className="bulk-order__category" key={categoryGroup.category}>
              <header>
                <h3>{categoryGroup.category}</h3>
              </header>
              <div className="table-wrap">
                <table className="table bulk-order__table">
                  <thead>
                    <tr>
                      <th>מוצר</th>
                      {categoryGroup.sizes.map((size) => (
                        <th key={size}>{size}</th>
                      ))}
                      <th>הערות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryGroup.rows.map((row) => (
                      <tr key={row.productName}>
                        <td>{row.productName}</td>
                        {categoryGroup.sizes.map((size) => {
                          const key = itemKey(categoryGroup.category, row.productName, size);
                          return (
                            <td key={size}>
                              <input
                                aria-label={`${row.productName} מידה ${size}`}
                                className="bulk-order__quantity"
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                value={quantities[key] || ""}
                                onChange={(event) =>
                                  updateQuantity(categoryGroup.category, row.productName, size, event.target.value)
                                }
                              />
                            </td>
                          );
                        })}
                        <td>
                          <input
                            aria-label={`הערות עבור ${row.productName}`}
                            className="bulk-order__row-note"
                            type="text"
                            value={rowNotes[rowKey(categoryGroup.category, row.productName)] || ""}
                            onChange={(event) =>
                              updateRowNote(categoryGroup.category, row.productName, event.target.value)
                            }
                            placeholder="הערה לשורה"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        <div className="bulk-order__actions">
          <button className="button" type="submit" disabled={!selectedItems.length || submitting}>
            {submitting ? "שומר..." : "שלח"}
          </button>
          <button className="button ghost" type="button" onClick={onCancel} disabled={submitting}>
            ביטול
          </button>
        </div>
      </form>
    </section>
  );
}

function OpenSupplyOrders({ loading, error, orders, onRefresh, onEditOrder, onMarkReceived }) {
  return (
    <section className="open-orders" aria-label="הזמנות פתוחות">
      <header className="open-orders__header">
        <div>
          <h2>הזמנות פתוחות</h2>
          <p className="subtle">הזמנות שעדיין לא סומנו כהתקבלו או בוטלו.</p>
        </div>
        <button className="button ghost icon-button" type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCw aria-hidden="true" />
          {loading ? "מרענן..." : "רענון"}
        </button>
      </header>

      {error ? <p className="message">{error}</p> : null}
      {loading ? <p>טוען הזמנות...</p> : null}
      {!loading && !orders.length ? <p>אין הזמנות פתוחות כרגע.</p> : null}

      {!loading && orders.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>מספר הזמנה</th>
                <th>תאריך</th>
                <th>סה״כ פריטים</th>
                <th>סטטוס</th>
                <th>פעולה</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.order_id}>
                  <td>{order.order_id}</td>
                  <td>{order.created_at ? formatDateTime(order.created_at) : ""}</td>
                  <td>{formatNumber(order.total_quantity || 0)}</td>
                  <td>
                    <span className={`status-pill status-pill--${order.status}`}>
                      {formatStatus(order.status)}
                    </span>
                  </td>
                  <td>
                    {order.status === "submitted" ? (
                      <button
                        className="link-button icon-button"
                        type="button"
                        onClick={() => onEditOrder(order)}
                      >
                        <Pencil aria-hidden="true" />
                        עריכה
                      </button>
                    ) : order.status === "approved" ? (
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => onMarkReceived(order.order_id)}
                      >
                        סמן כהתקבל
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function OrderDocument({ order }) {
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const totalQuantity = order.totalQuantity || orderItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );

  return (
    <section className="order-document" aria-label="מסמך הזמנה">
      <header className="order-document__header">
        <div>
          <p className="eyebrow">מסמך הזמנת סחורה</p>
          <h2>הזמנה עבור {order.agent}</h2>
        </div>
        <span>{order.createdAt}</span>
      </header>

      <OrderDownloadButton
        agent={order.agent}
        items={orderItems}
        totalQuantity={totalQuantity}
      />

      <div className="order-document__meta">
        <p><strong>מספר הזמנה:</strong> {order.id}</p>
        <p><strong>סוכן:</strong> {order.agent}</p>
        <p><strong>סה״כ פריטים:</strong> {formatNumber(totalQuantity)}</p>
        <p><strong>סטטוס:</strong> {order.status}</p>
        <p>
          <strong>מייל לבעלים:</strong>{" "}
          {order.emailSent
            ? "נשלח"
            : order.emailPending
              ? "מייל נשלח לבעלים"
              : `לא נשלח - ${order.emailError}`}
        </p>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>קטגוריה</th>
              <th>מוצר</th>
              <th>מידה</th>
              <th>כמות</th>
              <th>הערה</th>
            </tr>
          </thead>
          <tbody>
            {orderItems.map((item, index) => (
              <tr key={item.id || `${item.category}-${item.product_name}-${item.size}-${index}`}>
                <td>{index + 1}</td>
                <td>{item.category}</td>
                <td>{item.product_name}</td>
                <td>{item.size}</td>
                <td>{formatNumber(item.quantity)}</td>
                <td>{item.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
