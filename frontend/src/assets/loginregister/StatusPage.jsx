import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';

export default function StatusPage() {
  const nav = useNavigate();
  const [user, setUser] = useState(null);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    const off = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      setIsPremium(false);
      if (!u) return;

      try {
        const tok = await u.getIdTokenResult(true);
        setIsPremium(!!tok.claims?.premium);
      } catch {
        setIsPremium(false);
      }
    });
    return off;
  }, []);

  const goCheckout = () => nav('/payment');

  return (
    <div className="container py-5 lobster-regular">
      <style>{`
        .plan-table th, .plan-table td { vertical-align: middle; }
        .plan-header { background:#0d6efd; color:#fff; }
        .col-plan { width: 160px; text-align: center; }
        .tick { color: #28a745; font-weight: 700; }
        .cross { color: #dc3545; font-weight: 700; }
        .feature-col { background: #f8fbff; }
        .note { font-size: .9rem; }
      `}</style>

      <div className="text-center mb-4">
        <h2 className="mb-2">Choose your plan</h2>
        <p className="text-muted mb-0">
          Start free. Upgrade to Premium for customization, controls, and admin tools.
        </p>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-body text-center">
              <h4 className="mb-1">Free</h4>
              <p className="text-muted">Great for getting started</p>
              <div className="display-6 mb-3">$0</div>
              <ul className="list-unstyled small text-muted">
                <li>Post questions & articles</li>
                <li>Community support</li>
              </ul>
              <button className="btn btn-outline-primary" onClick={() => nav('/post')}>
                Continue Free
              </button>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card h-100 border-primary">
            <div className="card-body text-center">
              <h4 className="mb-1 text-primary">Premium</h4>
              <p className="text-muted">Unlock customization & admin power</p>
              <div className="display-6 mb-3">$9<span className="fs-6">/mo</span></div>
              <ul className="list-unstyled small text-muted">
                <li>All Free features</li>
                <li>+ Tutorials, themes, banners, analytics, content controls</li>
              </ul>
              {isPremium ? (
                <button className="btn btn-success" disabled>
                  You’re Premium ✔
                </button>
              ) : (
                <button className="btn btn-primary" onClick={goCheckout}>
                  Upgrade to Premium
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Comparison table (like your image) */}
      <div className="card">
        <div className="card-header plan-header">
          <div className="d-flex justify-content-between align-items-center">
            <strong>DEV@Deakin Plans</strong>
            <div className="small">Free vs Premium</div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table mb-0 plan-table">
            <thead>
              <tr>
                <th className="feature-col">Feature</th>
                <th className="col-plan">Free</th>
                <th className="col-plan">Premium</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="feature-col">Unlimited text-based posts</td><td className="text-center"><span className="tick">✓</span></td><td className="text-center"><span className="tick">✓</span></td></tr>
              <tr><td className="feature-col">24/7 Support</td><td className="text-center">Community</td><td className="text-center"><span className="tick">✓</span> Priority</td></tr>
              <tr><td className="feature-col">Analytics dashboard</td><td className="text-center"><span className="cross">✗</span></td><td className="text-center"><span className="tick">✓</span></td></tr>
              <tr><td className="feature-col">High-quality photos</td><td className="text-center"><span className="cross">✗</span></td><td className="text-center"><span className="tick">✓</span></td></tr>
              <tr><td className="feature-col">Unlimited HD uploads</td><td className="text-center"><span className="cross">✗</span></td><td className="text-center"><span className="tick">✓</span></td></tr>
              <tr><td className="feature-col">Post Tutorials</td><td className="text-center"><span className="cross">✗</span></td><td className="text-center"><span className="tick">✓</span></td></tr>
              <tr><td className="feature-col">Custom themes</td><td className="text-center"><span className="cross">✗</span></td><td className="text-center"><span className="tick">✓</span></td></tr>
              <tr><td className="feature-col">Site messages & banners</td><td className="text-center"><span className="cross">✗</span></td><td className="text-center"><span className="tick">✓</span></td></tr>
              <tr><td className="feature-col">Content controls (visibility, moderation tools)</td><td className="text-center"><span className="cross">✗</span></td><td className="text-center"><span className="tick">✓</span></td></tr>
              <tr><td className="feature-col">Admin/Support features</td><td className="text-center"><span className="cross">✗</span></td><td className="text-center"><span className="tick">✓</span></td></tr>
              <tr><td className="feature-col">Ad-free experience</td><td className="text-center"><span className="cross">✗</span></td><td className="text-center"><span className="tick">✓</span></td></tr>
            </tbody>
          </table>
        </div>

        <div className="card-footer d-flex justify-content-between align-items-center">
          <div className="note text-muted">You can upgrade/downgrade anytime. Premium unlocks Tutorials and all customization features.</div>
          {isPremium ? (
            <Link className="btn btn-outline-success" to="/account/billing">Manage Billing</Link>
          ) : (
            <button className="btn btn-primary" onClick={goCheckout}>Get Premium</button>
          )}
        </div>
      </div>
    </div>
  );
}
