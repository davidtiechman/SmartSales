import { useEffect, useRef, useState } from "react";

import { api } from "../../api/client.js";
import { Message } from "../../components/Message.jsx";
import { useToast } from "../../components/ToastProvider.jsx";
import { formatProductLabel } from "../../utils/format.js";
import { getVariantSortValue } from "../inventory/inventoryUtils.js";
import { NedarimPaymentFrame } from "../payments/NedarimPaymentFrame.jsx";

const CASH_PAYMENT_METHOD = "מזומן";
const CREDIT_PAYMENT_METHOD = "אשראי";
const NEDARIM_PAYMENT_SOURCE = "nedarim_iframe";

function sortedVariants(product) {
  return [...(product?.variants || [])].sort(
    (first, second) =>
      getVariantSortValue(product.category, first.size) -
        getVariantSortValue(product.category, second.size) ||
      String(first.size).localeCompare(String(second.size), "he")
  );
}

export function NewSaleForm({ agent }) {
  const showToast = useToast();
  const [state, setState] = useState({ loading: true, error: "", products: [] });
  const [saleItems, setSaleItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState(CASH_PAYMENT_METHOD);
  const [nedarimSession, setNedarimSession] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [preparingPayment, setPreparingPayment] = useState(false);
  const formRef = useRef(null);
  const successMessageTimerRef = useRef(null);
  const nextItemKeyRef = useRef(1);

  function makeSaleItem(products) {
    const product = products[0];
    return {
      key: nextItemKeyRef.current++,
      productId: String(product?.product_id || ""),
      variantId: String(sortedVariants(product)[0]?.variant_id || ""),
      quantity: 1,
    };
  }

  useEffect(() => {
    let active = true;
    api.products()
      .then((productsData) => {
        if (!active) return;
        const products = productsData.items || [];
        setState({ loading: false, error: "", products });
        setSaleItems(products.length ? [makeSaleItem(products)] : []);
      })
      .catch((error) => {
        if (active) setState({ loading: false, error: error.message, products: [] });
      });

    return () => {
      active = false;
      if (successMessageTimerRef.current) clearTimeout(successMessageTimerRef.current);
    };
  }, [agent]);

  function showTemporarySuccessMessage(text) {
    if (successMessageTimerRef.current) clearTimeout(successMessageTimerRef.current);
    setMessage(text);
    successMessageTimerRef.current = setTimeout(() => {
      setMessage("");
      successMessageTimerRef.current = null;
    }, 2500);
  }

  function updateSaleItem(key, changes) {
    setSaleItems((items) =>
      items.map((item) => {
        if (item.key !== key) return item;
        if (changes.productId !== undefined) {
          const product = state.products.find(
            (candidate) => String(candidate.product_id) === String(changes.productId)
          );
          return {
            ...item,
            productId: String(changes.productId),
            variantId: String(sortedVariants(product)[0]?.variant_id || ""),
          };
        }
        return { ...item, ...changes };
      })
    );
  }

  function buildSalePayloads(formElement, paymentSource) {
    const form = new FormData(formElement);
    const sharedFields = {
      client_name: form.get("client_name"),
      client_phone: form.get("client_phone")?.trim() || null,
      payment_method: paymentMethod,
      agent,
      ...(paymentSource ? { payment_source: paymentSource } : {}),
    };
    return saleItems.map((item) => ({
      product_id: Number(item.productId),
      variant_id: Number(item.variantId),
      quantity: Number(item.quantity),
      ...sharedFields,
    }));
  }

  function resetSaleForm(formElement) {
    formElement.reset();
    setSaleItems([makeSaleItem(state.products)]);
    setPaymentMethod(CASH_PAYMENT_METHOD);
    setNedarimSession(null);
  }

  async function saveSales(payloads) {
    for (const payload of payloads) await api.createSale(payload);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    const itemCount = saleItems.length;
    showToast(itemCount > 1 ? `שומר ${itemCount} פריטים...` : "שומר מכירה...", "loading", 0);

    const formElement = event.currentTarget;
    try {
      await saveSales(buildSalePayloads(formElement));
      resetSaleForm(formElement);
      const successText = itemCount > 1 ? `${itemCount} פריטים נשמרו בהצלחה.` : "המכירה נוספה בהצלחה.";
      showTemporarySuccessMessage(successText);
      showToast(successText, "success");
    } catch (error) {
      setMessage(error.message);
      showToast(error.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handlePrepareNedarimPayment() {
    const formElement = formRef.current;
    if (!formElement?.reportValidity()) return;

    const salePayloads = buildSalePayloads(formElement, NEDARIM_PAYMENT_SOURCE);
    setMessage("");
    setPreparingPayment(true);
    showToast("מכין תשלום מאובטח...", "loading", 0);

    try {
      const payment = await api.prepareNedarimPayment({
        items: salePayloads.map(({ product_id, variant_id, quantity }) => ({
          product_id,
          variant_id,
          quantity,
        })),
        client_name: salePayloads[0].client_name,
        agent,
      });
      setNedarimSession({ payment, salePayloads });
      showToast("אפשר לבצע תשלום מאובטח.", "success");
    } catch (error) {
      setMessage(error.message);
      showToast(error.message, "error");
    } finally {
      setPreparingPayment(false);
    }
  }

  async function handleNedarimSuccess() {
    const formElement = formRef.current;
    if (!nedarimSession || !formElement) return;
    setSaving(true);
    setMessage("");
    showToast("התשלום הצליח, שומר מכירה...", "loading", 0);
    try {
      await saveSales(nedarimSession.salePayloads);
      const itemCount = nedarimSession.salePayloads.length;
      resetSaleForm(formElement);
      const text = `התשלום התבצע בהצלחה, ${itemCount > 1 ? `${itemCount} פריטים נשמרו` : "המכירה נשמרה"}.`;
      showTemporarySuccessMessage(text);
      showToast(text, "success");
    } catch (error) {
      const text = `התשלום הצליח אך שמירת המכירה נכשלה: ${error.message}`;
      setMessage(text);
      showToast(text, "error");
    } finally {
      setSaving(false);
    }
  }

  if (state.loading) return <p>טוען מוצרים...</p>;
  if (state.error) return <p className="message">{state.error}</p>;
  if (!state.products.length) return <p>אין מוצרים להצגה.</p>;

  return (
    <form
      ref={formRef}
      className="form new-sale-form"
      onSubmit={handleSubmit}
      onChange={() => nedarimSession && setNedarimSession(null)}
    >
      <section className="new-sale-section">
        <header className="new-sale-section__header">
          <span className="new-sale-section__step">1</span>
          <div><h3>פרטי לקוח</h3><p>פרטי הלקוח יחולו על כל הפריטים בעסקה</p></div>
        </header>
        <div className="sale-customer-fields">
          <label className="field">
            <span>שם לקוח</span>
            <input type="text" name="client_name" required />
          </label>
          <label className="field">
            <span>פלאפון <small>(אופציונלי)</small></span>
            <input type="tel" name="client_phone" inputMode="tel" autoComplete="tel" dir="ltr" />
          </label>
        </div>
      </section>

      <section className="new-sale-section">
        <header className="new-sale-section__header">
          <span className="new-sale-section__step">2</span>
          <div><h3>מוצרים בעסקה</h3><p>אפשר להוסיף כמה מוצרים ומידות לפני השמירה</p></div>
        </header>
        <div className="sale-items-list">
          {saleItems.map((item, index) => {
            const product = state.products.find(
              (candidate) => String(candidate.product_id) === String(item.productId)
            );
            const variants = sortedVariants(product);
            return (
              <div className="sale-item-row" key={item.key}>
                <span className="sale-item-row__number">{index + 1}</span>
                <div className="sale-product-fields">
                  <label className="field sale-product-fields__product">
                    <span>מוצר</span>
                    <select value={item.productId} onChange={(event) => updateSaleItem(item.key, { productId: event.target.value })}>
                      {state.products.map((option) => <option key={option.product_id} value={option.product_id}>{formatProductLabel(option)}</option>)}
                    </select>
                  </label>
                  <label className="field sale-product-fields__size">
                    <span>מידה</span>
                    <select value={item.variantId} onChange={(event) => updateSaleItem(item.key, { variantId: event.target.value })} required>
                      {variants.map((variant) => <option key={variant.variant_id} value={variant.variant_id}>{variant.size}</option>)}
                    </select>
                  </label>
                  <label className="field sale-product-fields__quantity">
                    <span>כמות</span>
                    <input type="number" min="1" value={item.quantity} onChange={(event) => updateSaleItem(item.key, { quantity: event.target.value })} required />
                  </label>
                </div>
                <button
                  className="sale-item-row__remove"
                  type="button"
                  aria-label={`הסרת פריט ${index + 1}`}
                  title="הסרת פריט"
                  onClick={() => setSaleItems((items) => items.filter((candidate) => candidate.key !== item.key))}
                  disabled={saleItems.length === 1 || saving}
                >×</button>
              </div>
            );
          })}
        </div>
        <button className="button ghost add-sale-item-button" type="button" onClick={() => setSaleItems((items) => [...items, makeSaleItem(state.products)])} disabled={saving}>
          + הוספת מוצר נוסף
        </button>
      </section>

      <section className="new-sale-section">
        <header className="new-sale-section__header">
          <span className="new-sale-section__step">3</span>
          <div><h3>תשלום ושמירה</h3><p>אמצעי התשלום יחול על כל הפריטים בעסקה</p></div>
        </header>
        <fieldset className="payment-method-field">
          <legend>אמצעי תשלום</legend>
          <div className="payment-method-options">
            {[CASH_PAYMENT_METHOD, CREDIT_PAYMENT_METHOD, "העברה בנקאית"].map((method) => (
              <label className={`payment-method-option${paymentMethod === method ? " is-selected" : ""}`} key={method}>
                <input type="radio" name="payment_method" value={method} checked={paymentMethod === method} onChange={(event) => setPaymentMethod(event.target.value)} />
                <span>{method}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Message>{message}</Message>
        <div className="form-actions">
          <button className="button" type="submit" disabled={saving || preparingPayment || !saleItems.length}>
            {saving ? "שומר מכירה..." : `שמירת מכירה (${saleItems.length} ${saleItems.length === 1 ? "פריט" : "פריטים"})`}
          </button>
          {paymentMethod === CREDIT_PAYMENT_METHOD ? (
            <button className="button ghost" type="button" onClick={handlePrepareNedarimPayment} disabled={saving || preparingPayment || !saleItems.length}>
              {preparingPayment ? "מכין תשלום..." : "תשלום מאובטח בנדרים פלוס"}
            </button>
          ) : null}
        </div>
      </section>

      {nedarimSession ? <NedarimPaymentFrame payment={nedarimSession.payment} onCancel={() => setNedarimSession(null)} onError={setMessage} onSuccess={handleNedarimSuccess} /> : null}
    </form>
  );
}
