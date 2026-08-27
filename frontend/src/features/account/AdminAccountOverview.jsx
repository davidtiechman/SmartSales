import { useEffect, useMemo, useState } from "react";

import { api } from "../../api/client.js";
import { Table } from "../../components/Table.jsx";
import { formatCurrency, formatNumber } from "../../utils/format.js";
import { AccountStatus } from "./AccountStatus.jsx";

function getTotalsSummary(items) {
  return items.reduce(
    (summary, item) => {
      const balance = Number(item.balance || 0);
      summary.balance += balance;
      if (balance < 0) summary.debtAgents += 1;
      if (balance > 0) summary.creditAgents += 1;
      return summary;
    },
    {
      debtAgents: 0,
      creditAgents: 0,
      balance: 0,
    }
  );
}

export function AdminAccountOverview() {
  const [state, setState] = useState({ loading: true, error: "", items: [] });
  const [selectedAgent, setSelectedAgent] = useState("");

  async function loadSummaries({ resetSelection = false } = {}) {
    setState({ loading: true, error: "", items: [] });
    if (resetSelection) setSelectedAgent("");
    try {
      const data = await api.adminAccountSummaries();
      setState({ loading: false, error: "", items: data.items || [] });
    } catch (error) {
      setState({ loading: false, error: error.message, items: [] });
    }
  }

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: "", items: [] });
    setSelectedAgent("");

    api
      .adminAccountSummaries()
      .then((data) => {
        if (active) setState({ loading: false, error: "", items: data.items || [] });
      })
      .catch((error) => {
        if (active) setState({ loading: false, error: error.message, items: [] });
      });

    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => getTotalsSummary(state.items), [state.items]);

  if (state.loading) return <p>טוען מצבי חשבון...</p>;
  if (state.error) return <p className="message">{state.error}</p>;
  if (!state.items.length) return <p>אין סוכנים להצגה.</p>;

  return (
    <section className="admin-account-overview">
      <div className="inventory-summary">
        <div><span>סוכנים בחוב</span><strong>{formatNumber(summary.debtAgents)}</strong></div>
        <div><span>סוכנים בזכות</span><strong>{formatNumber(summary.creditAgents)}</strong></div>
        <div><span>יתרה כוללת</span><strong>{formatCurrency(summary.balance)}</strong></div>
      </div>

      <Table
        headers={[
          "סוכן",
          "יתרה",
          "סטטוס",
          "פירוט",
        ]}
        rows={state.items.map((item) => {
          const balance = Number(item.balance || 0);
          return [
            item.agent_name,
            formatCurrency(balance),
            balance >= 0 ? "בזכות" : "בחוב",
            <button
              className="button ghost compact-button"
              type="button"
              onClick={() => setSelectedAgent(item.agent_name)}
            >
              פתח
            </button>,
          ];
        })}
      />

      {selectedAgent ? (
        <section className="admin-account-overview__detail">
          <header className="admin-account-overview__detail-header">
            <div>
              <p className="eyebrow">פירוט סוכן</p>
              <h3>{selectedAgent}</h3>
            </div>
            <button className="button ghost" type="button" onClick={() => setSelectedAgent("")}>
              סגור
            </button>
          </header>
          <AccountStatus
            agent={selectedAgent}
            admin
            onAccountUpdated={() => loadSummaries()}
          />
        </section>
      ) : null}
    </section>
  );
}
