import { useEffect, useMemo, useState } from "react";

import { api } from "../../api/client.js";
import { Message } from "../../components/Message.jsx";
import { useToast } from "../../components/ToastProvider.jsx";
import { formatProductLabel } from "../../utils/format.js";
import { buildProductsFromInventory, getVariantSortValue } from "./inventoryUtils.js";

export function StockTransferForm() {
  const showToast = useToast();
  const [state, setState] = useState({ loading: true, error: "", agents: [], products: [] });
  const [productId, setProductId] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([api.adminAgents(), api.adminInventory()])
      .then(([agentsData, inventoryData]) => {
        if (!active) return;
        const products = buildProductsFromInventory(inventoryData.items || []).filter(
          (product) => (product.variants || []).length
        );
        setState({
          loading: false,
          error: "",
          agents: agentsData.items || [],
          products,
        });
        setProductId(String(products[0]?.product_id || ""));
      })
      .catch((error) => active && setState({ loading: false, error: error.message, agents: [], products: [] }));
    return () => {
      active = false;
    };
  }, []);

  const selectedProduct = state.products.find(
    (product) => String(product.product_id) === String(productId)
  );
  const variants = useMemo(() => {
    if (!selectedProduct) return [];
    return [...selectedProduct.variants].sort(
      (first, second) =>
        getVariantSortValue(selectedProduct.category, first.size) -
          getVariantSortValue(selectedProduct.category, second.size) ||
        String(first.size).localeCompare(String(second.size), "he")
    );
  }, [selectedProduct]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    showToast("מעדכן מלאי...", "loading", 0);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api.stockTransfer({
        user_id: Number(form.get("user_id")),
        variant_id: Number(form.get("variant_id")),
        quantity: Number(form.get("quantity") || 0),
        notes: form.get("notes")?.trim() || null,
      });
      formElement.reset();
      setMessage("המלאי עודכן בהצלחה.");
      showToast("המלאי עודכן בהצלחה.", "success");
    } catch (error) {
      setMessage(error.message);
      showToast(error.message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (state.loading) return <p>טוען נתוני מלאי...</p>;
  if (state.error) return <p className="message">{state.error}</p>;
  if (!state.agents.length || !state.products.length) {
    return <p>חסרים סוכנים או מוצרים עם מידות להצגה.</p>;
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label className="field">
        <span>סוכן</span>
        <select name="user_id">
          {state.agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.agent_name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>מוצר</span>
        <select value={productId} onChange={(event) => setProductId(event.target.value)}>
          {state.products.map((product) => (
            <option key={product.product_id} value={product.product_id}>
              {formatProductLabel(product)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>מידה</span>
        <select name="variant_id">
          {variants.map((variant) => (
            <option key={variant.variant_id} value={variant.variant_id}>
              {variant.size}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>כמות להוספה</span>
        <input type="number" name="quantity" defaultValue="1" min="1" required />
      </label>
      <label className="field">
        <span>הערה</span>
        <input type="text" name="notes" placeholder="אופציונלי" />
      </label>
      <Message>{message}</Message>
      <button className="button" type="submit" disabled={saving}>
        {saving ? "מעדכן מלאי..." : "עדכן מלאי"}
      </button>
    </form>
  );
}
