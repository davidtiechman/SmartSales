import { useMemo, useState } from "react";

import { formatNumber, formatProductLabel } from "../../utils/format.js";
import { getInventorySummary, groupInventoryByProduct } from "./inventoryUtils.js";

export function InventoryBrowser({
  title,
  label,
  items,
  onBack,
  backText = "חזרה",
  mode = "stock",
}) {
  const products = useMemo(() => groupInventoryByProduct(items), [items]);
  const summary = useMemo(() => getInventorySummary(items, mode), [items, mode]);
  const [activeKey, setActiveKey] = useState(products[0]?.key || "");
  const activeProduct = products.find((product) => product.key === activeKey) || products[0];
  const isAllocations = mode === "allocations";

  return (
    <div className="inventory-browser">
      <div className="inventory-browser__header">
        <div>
          <span className="inventory-browser__label">{label || "מלאי"}</span>
          <h2>{title}</h2>
        </div>
        {onBack ? (
          <button className="button ghost" type="button" onClick={onBack}>
            {backText}
          </button>
        ) : null}
      </div>

      <div className="inventory-summary">
        <div><span>{isAllocations ? "סוגי מוצרים שהוקצו" : "סוגי מוצרים במלאי"}</span><strong>{formatNumber(summary.productsInStock)}</strong></div>
        <div><span>{isAllocations ? "סה״כ פריטים שהוקצו" : "סה״כ פריטים במלאי"}</span><strong>{formatNumber(summary.totalStock)}</strong></div>
        {!isAllocations ? <div><span>סה״כ הועבר</span><strong>{formatNumber(summary.totalTransferred)}</strong></div> : null}
      </div>

      {!products.length ? <p>{isAllocations ? "אין הקצאות להצגה." : "אין מלאי להצגה."}</p> : null}

      {products.length ? (
        <>
          <div className="product-tabs" role="tablist" aria-label="מוצרים">
            {products.map((product) => (
              <button
                className={product.key === activeProduct.key ? "product-tab active" : "product-tab"}
                type="button"
                key={product.key}
                onClick={() => setActiveKey(product.key)}
              >
                {formatProductLabel(product)}
              </button>
            ))}
          </div>

          <section className="product-inventory">
            <header className="product-inventory__header">
              <h3>{formatProductLabel(activeProduct)}</h3>
              <span>{formatNumber(activeProduct.sizes.length)} מידות</span>
            </header>
            <div className="size-grid">
              {activeProduct.sizes.map((item) => (
                <article className="size-card" key={`${item.user_id}-${item.variant_id}`}>
                  <strong>{item.size}</strong>
                  <dl>
                    <div><dt>הועבר</dt><dd>{formatNumber(item.total_transferred)}</dd></div>
                    {!isAllocations ? <div><dt>נמכר</dt><dd>{formatNumber(item.total_sold)}</dd></div> : null}
                    {!isAllocations ? <div><dt>מלאי</dt><dd>{formatNumber(item.current_stock)}</dd></div> : null}
                  </dl>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

