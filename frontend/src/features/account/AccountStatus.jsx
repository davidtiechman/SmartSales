import { useEffect, useState } from "react";

import { api } from "../../api/client.js";
import { Table } from "../../components/Table.jsx";
import { useToast } from "../../components/ToastProvider.jsx";
import { formatCurrency, formatDateTime } from "../../utils/format.js";

const accountFieldHelp = {
  direct_to_owner: {
    title: "הועבר ישירות לבעלים",
    body: "חיובים של אשראי והעברה בנקאית.",
  },
  to_transfer_from_cash: {
    title: "להעברה לבעלים",
    body: "סכום הכסף שמגיע לבעלים ממכירות במזומן, לפני חישוב זיכוי הסוכן ממכירות באשראי.",
  },
  admin_credit: {
    title: "זיכויים ידניים",
    body: "הוצאות שהסוכן הוציא למכירה ויזוכה מהבעלים.",
  },
  admin_debit: {
    title: "חיובים ידניים",
    body: "עוד חיובים שהסוכן צריך להעביר לבעלים, למשל כסף לעודף שקיבל מהבעלים, וכן מכירות שלא הוכנסו למערכת.",
  },
  credit_from_direct: {
    title: "זכות מאשראי",
    body: "עמלות שנזקף לסוכן ממכירות.",
  },
};

function AccountHelpButton({ fieldKey, onOpen }) {
  const help = accountFieldHelp[fieldKey];
  if (!help) return null;

  return (
    <button
      className="account-help-button"
      type="button"
      aria-label={`הסבר על ${help.title}`}
      onClick={() => onOpen(help)}
    >
      ?
    </button>
  );
}

function AccountHelpModal({ help, onClose }) {
  if (!help) return null;

  return (
    <div className="account-help-modal" role="presentation" onClick={onClose}>
      <div
        className="account-help-modal__content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="account-help-title">{help.title}</h3>
        <p>{help.body}</p>
        <button className="button" type="button" onClick={onClose}>
          סגור
        </button>
      </div>
    </div>
  );
}

function AccountStat({ label, value, helpKey, onHelpOpen }) {
  return (
    <p>
      <strong>{label}:</strong>{" "}
      {helpKey ? <AccountHelpButton fieldKey={helpKey} onOpen={onHelpOpen} /> : null}
      {value}
    </p>
  );
}

export function AccountStatus({ agent, admin = false, onAccountUpdated }) {
  const showToast = useToast();
  const [state, setState] = useState({ loading: true, error: "", summary: null });
  const [transactions, setTransactions] = useState({
    loading: false,
    error: "",
    visible: false,
    items: [],
  });
  const [transactionFilter, setTransactionFilter] = useState("all");
  const [refreshState, setRefreshState] = useState({
    loading: false,
    message: "",
    error: "",
  });
  const [adminTransactionState, setAdminTransactionState] = useState({
    loading: false,
    message: "",
    error: "",
  });
  const [adminTransactionType, setAdminTransactionType] = useState("credit");
  const [activeHelp, setActiveHelp] = useState(null);

  async function loadSummary() {
    setState({ loading: true, error: "", summary: null });
    try {
      const summary = await api.accountSummary(agent);
      setState({ loading: false, error: "", summary });
    } catch (error) {
      setState({ loading: false, error: error.message, summary: null });
    }
  }

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: "", summary: null });
    setTransactions({ loading: false, error: "", visible: false, items: [] });
    setTransactionFilter("all");
    setRefreshState({ loading: false, message: "", error: "" });
    setAdminTransactionState({ loading: false, message: "", error: "" });
    setAdminTransactionType("credit");

    api
      .accountSummary(agent)
      .then((summary) => active && setState({ loading: false, error: "", summary }))
      .catch((error) => active && setState({ loading: false, error: error.message, summary: null }));

    return () => {
      active = false;
    };
  }, [agent]);

  async function handleRefresh() {
    setRefreshState({ loading: true, message: "", error: "" });
    showToast("מרענן חשבון...", "loading", 0);
    try {
      const result = await api.refreshAccount(agent);
      await loadSummary();
      setTransactions({ loading: false, error: "", visible: false, items: [] });
      setRefreshState({
        loading: false,
        error: "",
        message: `רענון הושלם. עודכנו ${result.rebuilt_transactions_count || 0} תנועות.`,
      });
      showToast("רענון החשבון הושלם.", "success");
    } catch (error) {
      setRefreshState({ loading: false, message: "", error: error.message });
      showToast(error.message, "error");
    }
  }

  async function handleShowTransactions() {
    setTransactions((current) => ({
      ...current,
      visible: true,
      loading: true,
      error: "",
    }));
    showToast("טוען תנועות...", "loading", 0);
    try {
      const data = await api.accountTransactions(agent);
      setTransactions({
        visible: true,
        loading: false,
        error: "",
        items: data.items || [],
      });
      showToast("התנועות נטענו.", "success");
    } catch (error) {
      setTransactions({
        visible: true,
        loading: false,
        error: error.message,
        items: [],
      });
      showToast(error.message, "error");
    }
  }

  async function handleHideTransactions() {
    setTransactions({ loading: false, error: "", visible: false, items: [] });
    setTransactionFilter("all");
    showToast("התנועות הוסתרו.", "success");
  }

  async function handleAdminTransaction(event) {
    event.preventDefault();
    setAdminTransactionState({ loading: true, message: "", error: "" });
    showToast("רושם פעולת חשבון...", "loading", 0);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api.recordAgentAccountTransaction({
        agent_name: agent,
        transaction_type: form.get("transaction_type"),
        amount: Number(form.get("amount") || 0),
        description: form.get("description") || undefined,
        note: form.get("note") || undefined,
      });
      formElement.reset();
      setAdminTransactionType("credit");
      await loadSummary();
      if (transactions.visible) {
        await handleShowTransactions();
      }
      if (onAccountUpdated) onAccountUpdated();
      setAdminTransactionState({
        loading: false,
        message: "פעולת החשבון נרשמה בהצלחה.",
        error: "",
      });
      showToast("פעולת החשבון נרשמה בהצלחה.", "success");
    } catch (error) {
      setAdminTransactionState({ loading: false, message: "", error: error.message });
      showToast(error.message, "error");
    }
  }

  if (state.loading) return <p>טוען יתרה...</p>;
  if (state.error) return <p className="message">{state.error}</p>;

  const balance = Number(state.summary?.balance || 0);
  const totals = state.summary?.totals || {};
  const transactionTotals = state.summary?.transaction_totals || {};
  const filteredTransactions =
    transactionFilter === "all"
      ? transactions.items
      : transactions.items.filter((item) => item.transaction_type === transactionFilter);
  const statusClass = balance >= 0 ? "positive" : "negative";
  const statusLabel = balance >= 0 ? "בזכות" : "בחוב";
  const adminTransactionClass =
    adminTransactionType === "credit" ? "admin-transaction--credit" : "admin-transaction--debit";

  return (
    <>
      <div className={`balance ${statusClass}`}>
        <span className="balance__label">יתרה מול הבעלים</span>
        <strong>
          {formatCurrency(balance)} ({statusLabel})
        </strong>
      </div>
      <div className="stats-list">
        <AccountStat label="כמות מכירות" value={totals.sales_count || 0} />
        <AccountStat label="פריטים שנמכרו" value={totals.items_count || 0} />
        <AccountStat label="סה״כ מכירות ללקוח" value={formatCurrency(totals.client_revenue)} />
        <AccountStat label="סכום לבעלים" value={formatCurrency(totals.owner_due)} />
        <AccountStat label="רווח סוכן" value={formatCurrency(totals.agent_profit)} />
        <AccountStat label="מזומן שנאסף" value={formatCurrency(totals.cash_collected)} />
        <AccountStat
          label="הועבר ישירות לבעלים"
          value={formatCurrency(totals.direct_to_owner)}
          helpKey="direct_to_owner"
          onHelpOpen={setActiveHelp}
        />
        <AccountStat
          label="להעברה לבעלים"
          value={formatCurrency(totals.to_transfer_from_cash)}
          helpKey="to_transfer_from_cash"
          onHelpOpen={setActiveHelp}
        />
        <AccountStat
          label="זיכויים ידניים"
          value={formatCurrency(transactionTotals.admin_credit)}
          helpKey="admin_credit"
          onHelpOpen={setActiveHelp}
        />
        <AccountStat
          label="חיובים ידניים"
          value={formatCurrency(transactionTotals.admin_debit)}
          helpKey="admin_debit"
          onHelpOpen={setActiveHelp}
        />
        <AccountStat label="נותר להעברה לבעלים" value={formatCurrency(transactionTotals.remaining_to_owner)} />
        <AccountStat
          label="זכות מאשראי"
          value={formatCurrency(totals.credit_from_direct)}
          helpKey="credit_from_direct"
          onHelpOpen={setActiveHelp}
        />
        <AccountStat label="חוב מאשראי" value={formatCurrency(totals.debt_from_direct)} />
      </div>
      <AccountHelpModal help={activeHelp} onClose={() => setActiveHelp(null)} />

      {admin ? (
        <form className={`form admin-transaction ${adminTransactionClass}`} onSubmit={handleAdminTransaction}>
          <label className="field">
            <span>סוג פעולה</span>
            <select
              name="transaction_type"
              value={adminTransactionType}
              onChange={(event) => setAdminTransactionType(event.target.value)}
              required
            >
              <option value="credit">זיכוי לסוכן - כסף שהעביר או הוצאה שמגיעה לו</option>
              <option value="debit">חיוב לסוכן - כסף שהבעלים העביר לסוכן</option>
            </select>
          </label>
          <p className="admin-transaction__hint">
            {adminTransactionType === "credit"
              ? "זיכוי יקטין את החוב של הסוכן לבעלים."
              : "חיוב יגדיל את החוב של הסוכן לבעלים."}
          </p>
          <label className="field">
            <span>סכום</span>
            <input type="number" name="amount" min="0.01" step="0.01" required />
          </label>
          <label className="field">
            <span>תיאור</span>
            <input type="text" name="description" placeholder="לדוגמה: העברת מזומן / הוצאות פרסום / כסף לעודף" />
          </label>
          <label className="field">
            <span>הערה</span>
            <input type="text" name="note" />
          </label>
          {adminTransactionState.message ? <p className="message success">{adminTransactionState.message}</p> : null}
          {adminTransactionState.error ? <p className="message">{adminTransactionState.error}</p> : null}
          <button className="button" type="submit" disabled={adminTransactionState.loading}>
            {adminTransactionState.loading ? "שומר..." : "רישום פעולת חשבון"}
          </button>
        </form>
      ) : null}

      <div className="account-actions">
        <button className="button" type="button" onClick={handleRefresh} disabled={refreshState.loading}>
          {refreshState.loading ? "מרענן חשבון..." : "רענן חשבון"}
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={transactions.visible ? handleHideTransactions : handleShowTransactions}
          disabled={transactions.loading}
        >
          {transactions.visible ? "הסתר עובר ושב" : "הצג כל הזיכויים והחיובים"}
        </button>
      </div>

      {refreshState.message ? <p className="message success">{refreshState.message}</p> : null}
      {refreshState.error ? <p className="message">{refreshState.error}</p> : null}

      {transactions.visible ? (
        <div className="transactions-panel">
          {transactions.loading ? <p>טוען תנועות...</p> : null}
          {transactions.error ? <p className="message">{transactions.error}</p> : null}
          {!transactions.loading && !transactions.error ? (
            <>
              <label className="field">
                <span>סינון תנועות</span>
                <select
                  value={transactionFilter}
                  onChange={(event) => setTransactionFilter(event.target.value)}
                >
                  <option value="all">הכול</option>
                  <option value="credit">זיכויים</option>
                  <option value="debit">חיובים</option>
                </select>
              </label>
              <Table
                headers={["תאריך", "סוג פעולה", "סכום", "תיאור"]}
                rows={filteredTransactions.map((item) => [
                  formatDateTime(item.created_at),
                  item.transaction_type,
                  formatCurrency(item.amount),
                  item.description,
                ])}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
