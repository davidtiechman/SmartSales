import { useEffect, useState } from "react";

import { api } from "../../api/client.js";
import { formatCurrency, formatNumber } from "../../utils/format.js";
import { AccountStatus } from "./AccountStatus.jsx";

export function AdminAccountStatus() {
  const [state, setState] = useState({ loading: true, error: "", agents: [] });
  const [selectedAgent, setSelectedAgent] = useState(null);

  async function loadAccounts({ active = true } = {}) {
    try {
      const agentsData = await api.adminAgents();
      const agents = agentsData.items || [];
      const summaries = await Promise.all(
        agents.map((agent) =>
          api
            .accountSummary(agent.agent_name)
            .then((summary) => ({ ...agent, summary, error: "" }))
            .catch((error) => ({ ...agent, summary: null, error: error.message }))
        )
      );
      if (active) {
        setState({ loading: false, error: "", agents: summaries });
      }
    } catch (error) {
      if (active) {
        setState({ loading: false, error: error.message, agents: [] });
      }
    }
  }

  useEffect(() => {
    let active = true;
    loadAccounts({ active });
    return () => {
      active = false;
    };
  }, []);

  if (state.loading) return <p>טוען מצבי חשבון...</p>;
  if (state.error) return <p className="message">{state.error}</p>;

  if (selectedAgent) {
    return (
      <div className="admin-account-status">
        <button className="button ghost" type="button" onClick={() => setSelectedAgent(null)}>
          בחירת סוכן
        </button>
        <header className="sales-section__header">
          <div>
            <p className="eyebrow">מצב חשבון</p>
            <h2>{selectedAgent.agent_name}</h2>
          </div>
        </header>
        <AccountStatus
          agent={selectedAgent.agent_name}
          admin
          onAccountUpdated={() => loadAccounts()}
        />
      </div>
    );
  }

  if (!state.agents.length) return <p>אין סוכנים להצגה.</p>;

  return (
    <div className="agent-grid">
      {state.agents.map((agent) => {
        const summary = agent.summary || {};
        const totals = summary.totals || {};
        const transactionTotals = summary.transaction_totals || {};
        const balance = Number(summary.balance || 0);
        return (
          <button
            className="agent-card"
            type="button"
            key={agent.id}
            onClick={() => setSelectedAgent(agent)}
          >
            <h3>{agent.agent_name}</h3>
            {agent.error ? (
              <span>{agent.error}</span>
            ) : (
              <>
                <span>מכירות: {formatNumber(totals.sales_count)}</span>
                <span>סה"כ נמכר: {formatCurrency(totals.client_revenue)}</span>
                <span>זיכויים ידניים: {formatCurrency(transactionTotals.admin_credit)}</span>
                <span>חיובים ידניים: {formatCurrency(transactionTotals.admin_debit)}</span>
                <span>נותר להעברה: {formatCurrency(transactionTotals.remaining_to_owner)}</span>
                <span>יתרה: {formatCurrency(balance)}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
