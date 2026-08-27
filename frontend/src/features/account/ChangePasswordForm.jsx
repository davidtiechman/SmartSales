import { useState } from "react";

import { api } from "../../api/client.js";
import { Message } from "../../components/Message.jsx";
import { useToast } from "../../components/ToastProvider.jsx";

export function ChangePasswordForm({ agent }) {
  const showToast = useToast();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    showToast("מעדכן סיסמה...", "loading", 0);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api.changePassword({
        agent_name: agent,
        current_password: form.get("current_password"),
        new_password: form.get("new_password"),
      });
      formElement.reset();
      setMessage("הסיסמה עודכנה בהצלחה.");
      showToast("הסיסמה עודכנה בהצלחה.", "success");
    } catch (error) {
      setMessage(error.message);
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label className="field">
        <span>סיסמה נוכחית</span>
        <input type="password" name="current_password" required />
      </label>
      <label className="field">
        <span>סיסמה חדשה</span>
        <input type="password" name="new_password" required />
      </label>
      <Message>{message}</Message>
      <button className="button" type="submit" disabled={loading}>
        {loading ? "מעדכן סיסמה..." : "עדכון סיסמה"}
      </button>
    </form>
  );
}
