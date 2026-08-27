import { useEffect, useMemo, useState } from "react";

import { api } from "../../api/client.js";
import { Table } from "../../components/Table.jsx";
import { formatNumber } from "../../utils/format.js";
import { buildRows, buildSummary, summaryModes } from "./salesAnalysisUtils.js";
import ViewCharsPie from "./charts/viewCharsPie.jsx";

export function SalesAnalysis({ agent, admin = false }) {
  const [state, setState] = useState({ loading: true, error: "", items: [] });
  const [summaryMode, setSummaryMode] = useState("product");
  

  useEffect(() => {
    let active = true;
    const request = admin ? api.adminSales() : api.sales(agent);
    request
      .then((salesData) => {
        if (!active) return;
        setState({ loading: false, error: "", items: salesData.items || [] });
      })
      .catch((error) => {
        if (active) setState({ loading: false, error: error.message, items: [] });
      });

    return () => {
      active = false;
    };
  }, [admin, agent]);
  

  const summary = useMemo(
    () => buildSummary(state.items, summaryMode),
    [state.items, summaryMode]
  );
  const productLabels = useMemo(() => summary.map((item) => item.product_name), [summary]); 
  const productSalesNumbers = useMemo(() => summary.map((item) => item.quantity), [summary]);
  const totalQuantity = useMemo(
    () => state.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [state.items]
  );
  const modeConfig = summaryModes[summaryMode];

  return (
    <div className="sales-analysis-page">
      <section className="sales-analysis" aria-label="ניתוח מכירות">
        <header className="sales-section__header">
          <div>
            <p className="eyebrow">ניתוח מכירות</p>
            <h2>{modeConfig.title}</h2>
          </div>
          <div className="sales-analysis__totals">
            <span>{formatNumber(state.items.length)} מכירות</span>
            <strong>{formatNumber(totalQuantity)} יחידות</strong>
          </div>
          <div>
            {summaryMode === "product" ? (
            <ViewCharsPie 
            title="ניתוח מכירות"
            label={productLabels} 
            data={productSalesNumbers} 
            />
            ):null
            }
          </div>
        </header>

        <div className="sales-analysis__controls">
          <label className="field">
            <span>סוג סיכום</span>
            <select value={summaryMode} onChange={(event) => setSummaryMode(event.target.value)}>
              <option value="product">לפי מוצר</option>
              <option value="size">לפי מוצר ומידה</option>
              <option value="day">לפי יום</option>
            </select>
          </label>
        </div>

        {state.loading ? <p>טוען ניתוח מכירות...</p> : null}
        {state.error ? <p className="message">{state.error}</p> : null}
        {!state.loading && !state.error ? (
          <Table headers={modeConfig.headers} rows={buildRows(summary, summaryMode)} />
        ) : null}
      </section>
    </div>
  );
}
