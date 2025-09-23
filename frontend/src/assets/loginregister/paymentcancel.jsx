import { useNavigate } from "react-router-dom";

export default function PaymentCancel() {
  const nav = useNavigate();
  return (
    <div className="container py-5 lobster-regular">
      <h3 className="mb-3">Checkout canceled</h3>
      <p className="text-muted">No charge was made.</p>
      <button className="btn btn-primary" onClick={() => nav("/plans")}>
        Back to Plans
      </button>
    </div>
  );
}
