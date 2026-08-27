import { useEffect, useRef, useState } from "react";

const NEDARIM_FRAME_URL = "https://matara.pro/nedarimplus/iframe";
const NEDARIM_ORIGINS = new Set(["https://matara.pro", "https://www.matara.pro"]);

export function NedarimPaymentFrame({ payment, onCancel, onError, onSuccess }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(0);
  const [loadingFrame, setLoadingFrame] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  function postNedarim(data) {
    iframeRef.current?.contentWindow?.postMessage(data, "*");
  }

  useEffect(() => {
    function handleMessage(event) {
      if (!NEDARIM_ORIGINS.has(event.origin)) return;
      const data = event.data || {};

      if (data.Name === "Height") {
        setHeight((Number.parseInt(data.Value, 10) || 0) + 15);
        setLoadingFrame(false);
        return;
      }

      if (data.Name === "TransactionResponse") {
        const response = data.Value || {};
        setPaying(false);
        if (response.Status === "Error") {
          const message = response.Message || "התשלום לא בוצע";
          setError(message);
          onError?.(message, response);
          return;
        }
        onSuccess?.(response);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onError, onSuccess]);

  function handleFrameLoad() {
    postNedarim({ Name: "GetHeight" });
  }

  function handlePayClick() {
    setError("");
    setPaying(true);
    postNedarim({
      Name: "FinishTransaction2",
      Value: payment.nedarim,
    });
  }

  return (
    <section className="nedarim-payment" aria-label="תשלום מאובטח בנדרים פלוס">
      <header className="nedarim-payment__header">
        <div>
          <h3>תשלום מאובטח בנדרים פלוס</h3>
          <p className="subtle">סכום לתשלום: {payment.amount}</p>
        </div>
        <button className="link-button" type="button" onClick={onCancel} disabled={paying}>
          ביטול
        </button>
      </header>

      <iframe
        ref={iframeRef}
        title="Nedarim Plus secure payment"
        className="nedarim-payment__frame"
        scrolling="no"
        src={NEDARIM_FRAME_URL}
        style={{ height: `${height}px` }}
        onLoad={handleFrameLoad}
      />

      {loadingFrame ? <p className="subtle">מתחבר לשרת התשלומים...</p> : null}
      {error ? <p className="message">{error}</p> : null}

      <button className="button" type="button" onClick={handlePayClick} disabled={paying || loadingFrame}>
        {paying ? "מבצע תשלום..." : "ביצוע תשלום"}
      </button>
    </section>
  );
}
