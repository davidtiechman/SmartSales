import { useEffect, useMemo, useState } from "react";

import { api } from "../../api/client.js";
import { formatNumber } from "../../utils/format.js";
import { getInventorySummary } from "./inventoryUtils.js";
import { InventoryBrowser } from "./InventoryBrowser.jsx";

export function AdminInventoryOverview({ mode = "stock" }) {
  const [state, setState] = useState({ loading: true, error: "", agents: [], items: [] });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const isAllocations = mode === "allocations";

  useEffect(() => {
    let active = true;
    Promise.all([api.adminAgents(), api.adminInventory()])
      .then(([agentsData, inventoryData]) => {
        if (!active) return;
        setState({
          loading: false,
          error: "",
          agents: agentsData.items || [],
          items: inventoryData.items || [],
        });
      })
      .catch((error) => active && setState({ loading: false, error: error.message, agents: [], items: [] }));
    return () => {
      active = false;
    };
  }, []);

  const inventoryByAgent = useMemo(() => {
    const grouped = new Map();
    const items = isAllocations
      ? state.items.filter((item) => Number(item.total_transferred || 0) > 0)
      : state.items;

    items.forEach((item) => {
      const key = String(item.user_id);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    return grouped;
  }, [isAllocations, state.items]);

  if (state.loading) return <p>{isAllocations ? "טוען הקצאות..." : "טוען מלאי..."}</p>;
  if (state.error) return <p className="message">{state.error}</p>;

  if (selectedAgent) {
    return (
      <InventoryBrowser
        title={selectedAgent.agent_name}
        label={isAllocations ? "הקצאות לסוכן" : "סוכן"}
        items={inventoryByAgent.get(String(selectedAgent.id)) || []}
        onBack={() => setSelectedAgent(null)}
        backText="בחירת סוכן"
        mode={mode}
      />
    );
  }

  if (!state.agents.length) return <p>אין סוכנים להצגה.</p>;

  return (
    <div className="agent-grid">
      {state.agents.map((agent) => {
        const items = inventoryByAgent.get(String(agent.id)) || [];
        const summary = getInventorySummary(items, mode);
        return (
          <button
            className="agent-card"
            type="button"
            key={agent.id}
            onClick={() => setSelectedAgent(agent)}
          >
            <h3>{agent.agent_name}</h3>
            <span>{isAllocations ? "סוגי מוצרים שהוקצו" : "סוגי מוצרים במלאי"}: {formatNumber(summary.productsInStock)}</span>
            <span>{isAllocations ? "סה״כ הוקצה" : "סה״כ פריטים"}: {formatNumber(summary.totalStock)}</span>
            {!isAllocations ? <span>סה״כ הועבר: {formatNumber(summary.totalTransferred)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

