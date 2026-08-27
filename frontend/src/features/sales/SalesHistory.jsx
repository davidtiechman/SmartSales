import { useEffect, useMemo, useState } from "react";

import { api } from "../../api/client.js";
import { Table } from "../../components/Table.jsx";
import { useToast } from "../../components/ToastProvider.jsx";
import { formatDateTime, formatIsraelDateKey, formatProductLabel } from "../../utils/format.js";
import { getVariantSortValue } from "../inventory/inventoryUtils.js";

const emptyFilters = {
  agent: "",
  category: "",
  product_name: "",
  payment_method: "",
  dateMode: "all",
  date: "",
  date_from: "",
  date_to: "",
};

function getSaleDate(item) {
  return formatIsraelDateKey(item.sale_date);
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((first, second) =>
    String(first).localeCompare(String(second), "he")
  );
}

function formatPaymentSource(source) {
  if (source === "nedarim_iframe") return "נדרים פלוס iframe";
  return "רגיל";
}

function canManageSaleActions(item, admin) {
  return admin || item.can_edit;
}

function buildFilterOptions(items) {
  const categories = sortedUnique(items.map((item) => item.category));
  const products = Array.from(
    new Map(
      items
        .filter((item) => item.product_name)
        .map((item) => [
          `${item.category || ""}-${item.product_name}`,
          { category: item.category || "", product_name: item.product_name },
        ])
    ).values()
  ).sort((first, second) =>
    `${first.category}-${first.product_name}`.localeCompare(
      `${second.category}-${second.product_name}`,
      "he"
    )
  );
  const payment_methods = sortedUnique(items.map((item) => item.payment_method));
  const agents = sortedUnique(items.map((item) => item.agent));
  const availableDates = sortedUnique(items.map(getSaleDate));

  return {
    agents,
    categories,
    products,
    payment_methods,
    date_limits: {
      min: availableDates[0] || "",
      max: availableDates[availableDates.length - 1] || "",
    },
  };
}

function filterSales(items, filters) {
  return items.filter((item) => {
    const saleDate = getSaleDate(item);
    if (filters.agent && item.agent !== filters.agent) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.product_name && item.product_name !== filters.product_name) return false;
    if (filters.payment_method && item.payment_method !== filters.payment_method) return false;
    if (filters.dateMode === "single" && saleDate !== filters.date) return false;
    if (filters.dateMode === "range") {
      if (filters.date_from && saleDate < filters.date_from) return false;
      if (filters.date_to && saleDate > filters.date_to) return false;
    }
    return true;
  });
}

export function SalesHistory({ agent, admin = false }) {
  const showToast = useToast();
  const [state, setState] = useState({ loading: true, error: "", allItems: [], items: [] });
  const [productsState, setProductsState] = useState({ loading: false, error: "", items: [] });
  const [editingSale, setEditingSale] = useState(null);
  const [editProductId, setEditProductId] = useState("");
  const [editVariantId, setEditVariantId] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletingSaleId, setDeletingSaleId] = useState(null);
  const [expandedSaleId, setExpandedSaleId] = useState(null);
  const [openActionMenuSaleId, setOpenActionMenuSaleId] = useState(null);
  const [options, setOptions] = useState({
    agents: [],
    categories: [],
    products: [],
    payment_methods: [],
    date_limits: { min: "", max: "" },
  });
  const [filters, setFilters] = useState(emptyFilters);

  function loadSales({ active = true, nextFilters = filters } = {}) {
    const request = admin ? api.adminSales() : api.sales(agent);
    return request
      .then((salesData) => {
        if (!active) return;
        const items = salesData.items || [];
        setState({ loading: false, error: "", allItems: items, items: filterSales(items, nextFilters) });
        setOptions(buildFilterOptions(items));
      })
      .catch((error) => {
        if (active) setState({ loading: false, error: error.message, allItems: [], items: [] });
      });
  }

  useEffect(() => {
    let active = true;
    loadSales({ active });
    return () => {
      active = false;
    };
  }, [admin, agent]);

  useEffect(() => {
    let active = true;
    setProductsState({ loading: true, error: "", items: [] });
    api.products()
      .then((productsData) => {
        if (!active) return;
        setProductsState({ loading: false, error: "", items: productsData.items || [] });
      })
      .catch((error) => {
        if (active) setProductsState({ loading: false, error: error.message, items: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  const availableProducts = useMemo(
    () =>
      (options.products || []).filter(
        (product) => !filters.category || product.category === filters.category
      ),
    [options.products, filters.category]
  );
  const editProduct = productsState.items.find(
    (product) => String(product.product_id) === String(editProductId)
  );
  const editVariants = useMemo(() => {
    if (!editProduct) return [];
    return [...(editProduct.variants || [])].sort(
      (first, second) =>
        getVariantSortValue(editProduct.category, first.size) -
          getVariantSortValue(editProduct.category, second.size) ||
        String(first.size).localeCompare(String(second.size), "he")
    );
  }, [editProduct]);

  useEffect(() => {
    if (!editingSale || !editVariants.length) return;
    if (!editVariants.some((variant) => String(variant.variant_id) === String(editVariantId))) {
      setEditVariantId(String(editVariants[0].variant_id));
    }
  }, [editingSale, editVariants, editVariantId]);

  function updateFilter(name, value) {
    setFilters((current) => ({
      ...current,
      [name]: value,
      ...(name === "category" ? { product_name: "" } : {}),
    }));
  }

  function applyLocalFilters(nextFilters) {
    setState((current) => ({
      ...current,
      loading: false,
      error: "",
      items: filterSales(current.allItems, nextFilters),
    }));
    showToast("החיפוש הושלם.", "success");
  }

  function handleSubmit(event) {
    event.preventDefault();
    applyLocalFilters(filters);
  }

  function handleReset() {
    setFilters(emptyFilters);
    applyLocalFilters(emptyFilters);
  }

  function startEditSale(sale) {
    setEditingSale(sale);
    setEditProductId(String(sale.product_id || ""));
    setEditVariantId(String(sale.variant_id || ""));
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    if (!editingSale) return;

    const form = new FormData(event.currentTarget);
    setEditSaving(true);
    showToast("שומר עריכת מכירה...", "loading", 0);
    try {
      await api.updateSale(editingSale.id, {
        product_id: Number(editProductId),
        variant_id: Number(editVariantId),
        quantity: Number(form.get("quantity") || 0),
        client_name: form.get("client_name"),
        client_phone: form.get("client_phone")?.trim() || null,
        payment_method: form.get("payment_method"),
        agent: editingSale.agent || agent,
      });
      setEditingSale(null);
      await loadSales({ nextFilters: filters });
      showToast("המכירה עודכנה בהצלחה.", "success");
    } catch (error) {
      showToast(error.message || "עריכת המכירה נכשלה", "error");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteSale(sale) {
    if (!canManageSaleActions(sale, admin)) return;
    const confirmed = window.confirm("למחוק את המכירה לגמרי?");
    if (!confirmed) return;

    setDeletingSaleId(sale.id);
    showToast("מוחק מכירה...", "loading", 0);
    try {
      await api.deleteSale(sale.id);
      if (editingSale?.id === sale.id) {
        setEditingSale(null);
      }
      setExpandedSaleId(null);
      setOpenActionMenuSaleId(null);
      await loadSales({ nextFilters: filters });
      showToast("המכירה נמחקה בהצלחה.", "success");
    } catch (error) {
      showToast(error.message || "מחיקת המכירה נכשלה", "error");
    } finally {
      setDeletingSaleId(null);
    }
  }

  return (
    <div className="sales-history">
      <form className="sales-filters" onSubmit={handleSubmit}>
        {admin ? (
          <label className="field">
            <span>סוכן</span>
            <select value={filters.agent} onChange={(event) => updateFilter("agent", event.target.value)}>
              <option value="">הכול</option>
              {(options.agents || []).map((agentName) => (
                <option key={agentName} value={agentName}>{agentName}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="field">
          <span>קטגוריה</span>
          <select value={filters.category} onChange={(event) => updateFilter("category", event.target.value)}>
            <option value="">הכול</option>
            {(options.categories || []).map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>מוצר</span>
          <select value={filters.product_name} onChange={(event) => updateFilter("product_name", event.target.value)}>
            <option value="">הכול</option>
            {availableProducts.map((product) => (
              <option key={`${product.category}-${product.product_name}`} value={product.product_name}>
                {product.product_name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>סוג תשלום</span>
          <select value={filters.payment_method} onChange={(event) => updateFilter("payment_method", event.target.value)}>
            <option value="">הכול</option>
            {(options.payment_methods || []).map((method) => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>סינון תאריך</span>
          <select value={filters.dateMode} onChange={(event) => updateFilter("dateMode", event.target.value)}>
            <option value="all">כל התאריכים</option>
            <option value="single">תאריך מסוים</option>
            <option value="range">טווח תאריכים</option>
          </select>
        </label>

        {filters.dateMode === "single" ? (
          <label className="field">
            <span>תאריך</span>
            <input
              type="date"
              min={options.date_limits?.min || undefined}
              max={options.date_limits?.max || undefined}
              value={filters.date}
              onChange={(event) => updateFilter("date", event.target.value)}
              required
            />
          </label>
        ) : null}

        {filters.dateMode === "range" ? (
          <>
            <label className="field">
              <span>מתאריך</span>
              <input
                type="date"
                min={options.date_limits?.min || undefined}
                max={options.date_limits?.max || undefined}
                value={filters.date_from}
                onChange={(event) => updateFilter("date_from", event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>עד תאריך</span>
              <input
                type="date"
                min={filters.date_from || options.date_limits?.min || undefined}
                max={options.date_limits?.max || undefined}
                value={filters.date_to}
                onChange={(event) => updateFilter("date_to", event.target.value)}
                required
              />
            </label>
          </>
        ) : null}

        <div className="sales-filters__actions">
          <button className="button" type="submit" disabled={state.loading}>
            {state.loading ? "מחפש..." : "חיפוש"}
          </button>
          <button className="button ghost" type="button" onClick={handleReset} disabled={state.loading}>
            איפוס
          </button>
        </div>
      </form>

      {options.date_limits?.min || options.date_limits?.max ? (
        <p className="sales-filters__limits">
          טווח חיפוש זמין: {options.date_limits?.min || "ללא הגבלה"} עד {options.date_limits?.max || "ללא הגבלה"}
        </p>
      ) : null}

      {state.loading ? <p>טוען מכירות...</p> : null}
      {state.error ? <p className="message">{state.error}</p> : null}
      {!state.loading && !state.error ? (
        <>
          {editingSale ? (
            <form key={editingSale.id} className="form sale-edit-form" onSubmit={handleEditSubmit}>
              <header className="sales-section__header">
                <div>
                  <p className="eyebrow">עריכת מכירה</p>
                  <h2>מכירה #{editingSale.id}</h2>
                </div>
                <button className="button ghost" type="button" onClick={() => setEditingSale(null)} disabled={editSaving}>
                  ביטול
                </button>
              </header>

              {productsState.error ? <p className="message">{productsState.error}</p> : null}

              <label className="field">
                <span>מוצר</span>
                <select
                  value={editProductId}
                  onChange={(event) => setEditProductId(event.target.value)}
                  disabled={productsState.loading || editSaving}
                >
                  {productsState.items.map((product) => (
                    <option key={product.product_id} value={product.product_id}>
                      {formatProductLabel(product)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>מידה</span>
                <select
                  value={editVariantId}
                  onChange={(event) => setEditVariantId(event.target.value)}
                  disabled={productsState.loading || editSaving}
                  required
                >
                  {editVariants.map((variant) => (
                    <option key={variant.variant_id} value={variant.variant_id}>
                      {variant.size}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>כמות</span>
                <input type="number" name="quantity" min="1" defaultValue={editingSale.quantity || 1} disabled={editSaving} required />
              </label>

              <label className="field">
                <span>שם לקוח</span>
                <input type="text" name="client_name" defaultValue={editingSale.client_name || ""} disabled={editSaving} required />
              </label>

              <label className="field">
                <span>פלאפון <small>(אופציונלי)</small></span>
                <input type="tel" name="client_phone" inputMode="tel" dir="ltr" defaultValue={editingSale.client_phone || ""} disabled={editSaving} />
              </label>

              <label className="field">
                <span>אמצעי תשלום</span>
                <select name="payment_method" defaultValue={editingSale.payment_method || "מזומן"} disabled={editSaving}>
                  <option value="מזומן">מזומן</option>
                  <option value="אשראי">אשראי</option>
                  <option value="העברה בנקאית">העברה בנקאית</option>
                </select>
              </label>

              <button className="button" type="submit" disabled={editSaving || productsState.loading || !editVariants.length}>
                {editSaving ? "שומר..." : "שמירת שינויים"}
              </button>
            </form>
          ) : null}

          <section className="sales-board" aria-label="לוח מכירות">
            <header className="sales-section__header">
              <div>
                <p className="eyebrow">לוח מכירות</p>
                <h2>כל המכירות</h2>
              </div>
              <p className="sales-history__count">נמצאו {state.items.length} מכירות</p>
            </header>
            <Table
              columnWidths={
                admin
                  ? ["9%", "18%", "15%", "6%", "6%", "10%", "16%", "20%"]
                  : ["22%", "17%", "7%", "7%", "11%", "16%", "20%"]
              }
              headers={[
                ...(admin ? ["סוכן"] : []),
                "תאריך",
                "מוצר",
                "מידה",
                "כמות",
                "תשלום",
                "קטגוריה",
                "לקוח",
              ]}
              columnClassNames={[
                ...(admin ? ["sales-table__agent"] : []),
                "sales-table__date",
                "sales-table__product",
                "sales-table__size",
                "sales-table__quantity",
                "sales-table__payment",
                "sales-table__category",
                "sales-table__client",
              ]}
              rows={state.items.map((item) => ({
                key: item.id,
                className: expandedSaleId === item.id ? "table__row table__row--active" : "table__row",
                onClick: () => {
                  setOpenActionMenuSaleId(null);
                  setExpandedSaleId((current) => (current === item.id ? null : item.id));
                },
                expandedContent:
                  expandedSaleId === item.id ? (
                    <div className="sale-details-panel">
                      <div className="sale-details-panel__content">
                        <p><strong>מקור שמירה:</strong> {formatPaymentSource(item.payment_source)}</p>
                        <p><strong>מספר מכירה:</strong> {item.id}</p>
                        {item.client_phone ? <p><strong>פלאפון:</strong> <span dir="ltr">{item.client_phone}</span></p> : null}
                      </div>
                      <div className="sale-details-panel__actions">
                        <button
                          className={`sale-details-panel__menu${canManageSaleActions(item, admin) ? "" : " sale-details-panel__menu--disabled"}`}
                          type="button"
                          aria-label="פעולות רשומה"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenActionMenuSaleId((current) => (current === item.id ? null : item.id));
                          }}
                        >
                          ⋮
                        </button>
                        {openActionMenuSaleId === item.id ? (
                          <div className="sale-details-panel__menu-options">
                            <button
                              className="link-button"
                              type="button"
                              disabled={!canManageSaleActions(item, admin) || deletingSaleId === item.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (canManageSaleActions(item, admin)) startEditSale(item);
                              }}
                            >
                              עריכת הרשומה
                            </button>
                            <button
                              className="link-button link-button--danger"
                              type="button"
                              disabled={!canManageSaleActions(item, admin) || deletingSaleId === item.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (canManageSaleActions(item, admin)) handleDeleteSale(item);
                              }}
                            >
                              {deletingSaleId === item.id ? "מוחק..." : "מחיקת הרשומה"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null,
                cells: [
                  ...(admin ? [item.agent] : []),
                  <span className="sales-table__date-value" dir="ltr">
                    {formatDateTime(item.sale_date)}
                  </span>,
                  item.product_name,
                  item.size,
                  item.quantity,
                  item.payment_method,
                  item.category,
                  item.client_name,
                ],
              }))}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
