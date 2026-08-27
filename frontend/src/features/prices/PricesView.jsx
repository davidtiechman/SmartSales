import { useEffect, useMemo, useState } from "react";

import { api } from "../../api/client.js";
import { Message } from "../../components/Message.jsx";
import { useToast } from "../../components/ToastProvider.jsx";
import { formatCurrency } from "../../utils/format.js";

const tierLabels = {
  base: "רגיל",
  large: "מידות גדולות",
  "extra large": "מידות גדולות במיוחד",
};

function priceKey(item) {
  return `${item.category}::${item.product_name}::${item.size_tier}`;
}

function calculateProfit(item) {
  return Number(item.client_price || 0) - Number(item.owner_price || 0);
}

function calculateProfitPercent(item) {
  const clientPrice = Number(item.client_price || 0);
  return clientPrice > 0 ? (calculateProfit(item) / clientPrice) * 100 : 0;
}

function localDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function PricesView({ admin = false }) {
  const showToast = useToast();
  const [state, setState] = useState({ loading: true, error: "", items: [] });
  const [editingKey, setEditingKey] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(localDateValue());

  async function loadPrices() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const data = await api.currentPrices();
      setState({ loading: false, error: "", items: data.items || [] });
    } catch (error) {
      setState({ loading: false, error: error.message, items: [] });
    }
  }

  useEffect(() => {
    loadPrices();
  }, []);

  const categories = useMemo(() => {
    const grouped = new Map();
    state.items.forEach((item) => {
      const category = item.category || "ללא קטגוריה";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(item);
    });
    return [...grouped.entries()];
  }, [state.items]);

  async function handleSave(event, item) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const key = priceKey(item);
    const isRetroactive = effectiveDate < localDateValue();
    setSavingKey(key);
    showToast("שומר מחירים...", "loading", 0);
    try {
      await api.updateCurrentPrice({
        category: item.category,
        product_name: item.product_name,
        size_tier: item.size_tier,
        owner_price: Number(form.get("owner_price")),
        client_price: Number(form.get("client_price")),
        effective_from: effectiveDate,
      });
      setEditingKey("");
      await loadPrices();
      showToast(
        isRetroactive
          ? "השינוי הרטרואקטיבי במחיר נשמר בהצלחה."
          : "המחירים נשמרו לתאריך התחולה שנבחר.",
        "success"
      );
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSavingKey("");
    }
  }

  if (state.loading) return <p>טוען מחירים...</p>;
  if (state.error) return <Message>{state.error}</Message>;
  if (!state.items.length) return <p>לא נמצאו מחירים פעילים.</p>;

  return (
    <div className="prices-view">
      <p className="prices-view__note">אחוז הרווח מחושב מתוך מחיר המכירה לצרכן.</p>
      {categories.map(([category, items]) => (
        <section className="prices-category" key={category}>
          <h2>{category}</h2>
          <div className="table-wrap">
            <table className="table prices-table">
              <thead>
                <tr>
                  <th>מוצר</th>
                  <th>קבוצת מידות</th>
                  <th>מחיר לבעלים</th>
                  <th>מחיר צרכן</th>
                  <th>רווח סוכן</th>
                  <th>אחוז רווח</th>
                  {admin ? <th>פעולות</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const key = priceKey(item);
                  const editing = admin && editingKey === key;
                  const isRetroactive = editing && effectiveDate < localDateValue();
                  const profit = calculateProfit(item);
                  return (
                    <tr key={key}>
                      <td><strong>{item.product_name}</strong></td>
                      <td>{tierLabels[item.size_tier] || item.size_tier}</td>
                      {editing ? (
                        <>
                          <td colSpan="2">
                            <form className={`price-edit-form${isRetroactive ? " is-retroactive" : ""}`} id={`price-form-${key}`} onSubmit={(event) => handleSave(event, item)}>
                              <label><span>מחיר לבעלים</span><input type="number" name="owner_price" min="0" step="0.01" defaultValue={item.owner_price} required /></label>
                              <label><span>מחיר צרכן</span><input type="number" name="client_price" min="0" step="0.01" defaultValue={item.client_price} required /></label>
                              <label><span>יחול החל מתאריך</span><input type="date" name="effective_from" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} required /></label>
                              {isRetroactive ? (
                                <p className="price-edit-form__retroactive-warning">
                                  שינוי רטרואקטיבי: המחיר יחול מתאריך שכבר עבר ועשוי לשנות חישובים של מכירות וחשבונות קודמים.
                                </p>
                              ) : null}
                            </form>
                          </td>
                          <td>{formatCurrency(profit)}</td>
                          <td>{calculateProfitPercent(item).toFixed(1)}%</td>
                          <td className="prices-table__actions">
                            <button className="button compact-button" type="submit" form={`price-form-${key}`} disabled={savingKey === key}>{savingKey === key ? "שומר..." : "שמירה"}</button>
                            <button className="link-button" type="button" onClick={() => setEditingKey("")}>ביטול</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{formatCurrency(item.owner_price)}</td>
                          <td>{formatCurrency(item.client_price)}</td>
                          <td className={profit >= 0 ? "price-profit" : "price-profit price-profit--negative"}>{formatCurrency(profit)}</td>
                          <td>{calculateProfitPercent(item).toFixed(1)}%</td>
                          {admin ? <td><button className="link-button" type="button" onClick={() => { setEffectiveDate(localDateValue()); setEditingKey(key); }}>עריכת מחירים</button></td> : null}
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
