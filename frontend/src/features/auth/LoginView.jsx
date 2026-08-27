import { useEffect, useState } from "react";

import { api, setAuthToken } from "../../api/client.js";
import { Message } from "../../components/Message.jsx";
import { Panel } from "../../components/Panel.jsx";
import { useToast } from "../../components/ToastProvider.jsx";
import { ADMIN_USERNAME } from "../../constants/catalog.js";

export function LoginView({ message: initialMessage = "", onAgentLogin, onAdminLogin }) {
  const showToast = useToast();
  const [mode, setMode] = useState("agent");
  const [message, setMessage] = useState(initialMessage);
  const [loading, setLoading] = useState(false);

  const isAdmin = mode === "admin";

  useEffect(() => {
    setMessage(initialMessage);
  }, [initialMessage]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    showToast("מתחבר...", "loading", 0);

    const form = new FormData(event.currentTarget);
    const username = isAdmin ? form.get("adminName") : form.get("agentName");
    const password = isAdmin ? form.get("adminPassword") : form.get("password");

    try {
      const data = await api.login({ username, password });
      if (isAdmin) {
        if (username !== ADMIN_USERNAME) {
          const errorMessage = "שם המשתמש אינו משתמש מנהל.";
          setAuthToken(null);
          setMessage(errorMessage);
          showToast(errorMessage, "error");
          return;
        }
        showToast("נכנסת בהצלחה כמנהל.", "success");
        setAuthToken(data.access_token);
        onAdminLogin(username);
      } else {
        showToast("נכנסת בהצלחה.", "success");
        setAuthToken(data.access_token);
        onAgentLogin(username);
      }
    } catch (error) {
      setMessage(error.message);
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel
      eyebrow="Sales Outfit"
      title={isAdmin ? "כניסת מנהל" : "כניסת סוכן"}
      hint={
        isAdmin
          ? "כניסת מנהל לניהול הקצאות מלאי לסוכנים."
          : "התחבר כדי להגיע ללוח הבקרה שלך."
      }
    >
      <div className="segmented" role="tablist" aria-label="סוג כניסה">
        <button
          className={mode === "agent" ? "active" : ""}
          type="button"
          onClick={() => setMode("agent")}
        >
          סוכן
        </button>
        <button
          className={mode === "admin" ? "active" : ""}
          type="button"
          onClick={() => setMode("admin")}
        >
          מנהל
        </button>
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span>{isAdmin ? "שם מנהל" : "שם סוכן"}</span>
          <input
            type="text"
            name={isAdmin ? "adminName" : "agentName"}
            placeholder={isAdmin ? "הכנס שם מנהל" : "הכנס שם"}
            required
          />
        </label>
        <label className="field">
          <span>סיסמה</span>
          <input
            type="password"
            name={isAdmin ? "adminPassword" : "password"}
            placeholder="••••••••"
            required
          />
        </label>
        <Message>{message}</Message>
        <button className="button" type="submit" disabled={loading}>
          {loading ? "מתחבר..." : isAdmin ? "כניסת מנהל" : "כניסה"}
        </button>
      </form>
    </Panel>
  );
}

