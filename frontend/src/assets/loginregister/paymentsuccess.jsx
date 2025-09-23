import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebase";

const ACTIVATE_URL = (import.meta.env.VITE_FN_ACTIVATE || "").replace(/\/$/, "");

export default function PaymentSuccess() {
  const nav = useNavigate();
  const { search } = useLocation();
  const [msg, setMsg] = useState("Finishing setup…");
  const [err, setErr] = useState("");

  useEffect(() => {
    const sessionId = new URLSearchParams(search).get("session_id");
    if (!sessionId) {
      setErr("Missing session_id in URL.");
      return;
    }

    const off = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setErr("Please sign in again.");
        return;
      }
      try {
        const idToken = await user.getIdToken(true);

        const res = await fetch(ACTIVATE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ session_id: sessionId }),
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        await user.getIdToken(true);
        setMsg("Premium activated! Redirecting…");
        setTimeout(() => nav("/plans", { replace: true }), 1000);
      } catch (e) {
        setErr(e.message || "Activation failed");
      }
    });

    return () => off();
  }, [search, nav]);

  return (
    <div className="container py-5 lobster-regular">
      <h3 className="mb-3">Payment successful</h3>
      {err ? (
        <div className="alert alert-danger">{err}</div>
      ) : (
        <div className="alert alert-success">{msg}</div>
      )}
      <button className="btn btn-outline-secondary mt-2" onClick={() => nav("/plans")}>
        Go to Plans
      </button>
    </div>
  );
}
