import { useEffect, useState } from "react";

import { api } from "../../api/client.js";
import { InventoryBrowser } from "./InventoryBrowser.jsx";

export function AgentInventory({ agent }) {
  const [state, setState] = useState({ loading: true, error: "", items: [] });

  useEffect(() => {
    let active = true;
    api
      .inventory(agent)
      .then((data) => active && setState({ loading: false, error: "", items: data.items || [] }))
      .catch((error) => active && setState({ loading: false, error: error.message, items: [] }));
    return () => {
      active = false;
    };
  }, [agent]);

  if (state.loading) return <p>טוען מלאי...</p>;
  if (state.error) return <p className="message">{state.error}</p>;

  return <InventoryBrowser title={agent} label="המלאי שלי" items={state.items} />;
}

