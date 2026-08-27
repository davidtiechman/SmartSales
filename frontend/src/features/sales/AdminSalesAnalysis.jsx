import { useEffect, useMemo, useState } from "react";

import { api } from "../../api/client.js";
import { Table } from "../../components/Table.jsx";
import { formatNumber } from "../../utils/format.js";
import { buildRows, buildSummary, summaryModes } from "./salesAnalysisUtils.js";

export function AdminSalesAnalysis() {
  const [state, setState] = useState({ loading: true, error: "", items: [] });
  const [summaryMode, setSummaryMode] = useState("product");

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: "", items: [] });

    api
      .adminSales()
      .then((salesData) => {
        if (active) setState({ loading: false, error: "", items: salesData.items || [] });
      })
      .catch((error) => {
        if (active) setState({ loading: false, error: error.message, items: [] });
      });

    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(
    () => buildSummary(state.items, summaryMode),
    [state.items, summaryMode]
  );
  const totalQuantity = useMemo(
    () => state.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [state.items]
  );
  const modeConfig = summaryModes[summaryMode];

  return (
    <section className="sales-analysis" aria-label="ניתוח מכירות מנהל">
      <header className="sales-section__header">
        <div>
          <p className="eyebrow">ניתוח מכירות</p>
          <h2>{modeConfig.title}</h2>
        </div>
        <div className="sales-analysis__totals">
          <span>{formatNumber(state.items.length)} מכירות</span>
          <strong>{formatNumber(totalQuantity)} יחידות</strong>
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
  );
}
