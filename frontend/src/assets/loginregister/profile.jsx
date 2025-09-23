import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getIdTokenResult } from 'firebase/auth';
import { useAuth } from './AuthContext';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [isPremium, setIsPremium] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) {
        if (active) setIsPremium(false);
        return;
      }
      try {
        // force refresh so changes from premium.mjs are visible immediately
        const tok = await getIdTokenResult(user, true);
        if (active) setIsPremium(!!tok.claims?.premium);
      } catch {
        if (active) setIsPremium(false);
      }
    })();
    return () => { active = false; };
  }, [user]);

  const name = user?.displayName || (user?.email ? user.email.split('@')[0] : 'Account');
  const email = user?.email || '—';
  const photoURL = user?.photoURL || '';

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const [serverData, setServerData] = useState(null);
  async function handleRefresh() {
    try {
      const cachedToken = await user.getIdToken();
      console.log('Cached ID token:', cachedToken);
      const newToken = await user.getIdToken(true);
      console.log('Fresh ID token:', newToken);
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/me`, {
        headers: { Authorization: `Bearer ${newToken}` },
      });
      const data = await res.json();
      setServerData(data);
    } catch (e) {
      console.error('Error refreshing token or calling API', e);
    }
  }

  return (
    <div className="lobster-regular">
      {/* Full-width banner */}
      <div style={{ height: 350, background: 'linear-gradient(180deg,#d9c8ff,#f0eaff)' }} />

      {/* Avatar + name centered */}
      <div className="text-center" style={{ marginTop: -115 }}>
        <div
          className="mx-auto rounded-circle border border-3 border-white overflow-hidden"
          style={{ width: 200, height: 200, background: '#f8f9fa' }}
        >
          {photoURL ? (
            <img src={photoURL} alt={name} width="200" height="200" style={{ objectFit: 'cover' }} />
          ) : (
            <div className="w-100 h-100 d-flex align-items-center justify-content-center fw-bold fs-1 text-secondary">
              {name?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
        </div>

        <h3 className="mt-3 mb-1">{name}</h3>
        <div className="text-muted">{email}</div>
      </div>

      {/* Full-width actions */}
      <div className="container-fluid px-0 mt-4">
        <div className="list-group list-group-flush">
          <button
            type="button"
            className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
            onClick={() => navigate('/settings')}
          >
            <span><i className="fas fa-sliders-h me-2" /> Settings</span>
            <i className="fas fa-chevron-right small" />
          </button>

          {/* Status row → token-based */}
          <button
            type="button"
            className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
            onClick={() => navigate('/plans')}
            title="View or change your plan"
          >
            <span>
              Status:{' '}
              <span className={`badge ${isPremium ? 'bg-success' : 'bg-info'}`}>
                {isPremium ? 'Premium User' : 'Standard User'}
              </span>
            </span>
            <i className="fas fa-chevron-right small" />
          </button>

          <div className="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
            <span>
              <i className="fas fa-sync-alt me-2" />
              Refresh Token
            </span>
            <button
              onClick={handleRefresh}
              type="button"
              className="btn btn-outline-primary btn-sm"
            >
              Refresh from Server
            </button>
          </div>

          <button
            type="button"
            className="list-group-item list-group-item-action d-flex justify-content-between align-items-center text-danger"
            onClick={handleLogout}
          >
            <span><i className="fas fa-sign-out-alt me-2" /> Log out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
