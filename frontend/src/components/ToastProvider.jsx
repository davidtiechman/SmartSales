import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((message, type = "info", duration = 2600) => {
    window.clearTimeout(timerRef.current);
    setToast({ message, type });

    if (duration > 0) {
      timerRef.current = window.setTimeout(() => setToast(null), duration);
    }
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast ? (
        <div className={`toast toast--${toast.type}`} role="status" aria-live="polite">
          {toast.type === "loading" ? <span className="toast__spinner" aria-hidden="true" /> : null}
          <span>{toast.message}</span>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) throw new Error("useToast must be used inside ToastProvider");
  return showToast;
}
