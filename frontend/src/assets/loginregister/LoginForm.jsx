import { useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  setPersistence,
  inMemoryPersistence,
} from 'firebase/auth';
import { auth, setAuthPersistence } from '../../firebase';

const LoginForm = ({ onSuccess, onError }) => {
  const [hovered, setHovered] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      onError?.('❌ Please fill in both email and password.');
      return;
    }

    const lowerEmail = email.trim().toLowerCase();

    try {
      setSubmitting(true);

      // 0) Preflight sign-in (never persisted)
      await setPersistence(auth, inMemoryPersistence);

      // 1) Try sign-in (in-memory only)
      const { user } = await signInWithEmailAndPassword(auth, lowerEmail, password);
      await user.reload();

      // Gate unverified
      if (!user.emailVerified) {
        const UI_COOLDOWN_MS = 60_000;
        const SERVER_BACKOFF_MS = 5 * 60_000;

        const cooldownKey = `verifyCooldown:${lowerEmail}`;
        const now = Date.now();
        const nextAllowedAt = Number(localStorage.getItem(cooldownKey) || 0);

        let sent = false;

        if (now < nextAllowedAt) {
          const secs = Math.ceil((nextAllowedAt - now) / 1000);
          onError?.(`⏳ Please wait ${secs}s before requesting another verification email.`);
        } else {
          localStorage.setItem(cooldownKey, String(now + UI_COOLDOWN_MS));
          try {
            await sendEmailVerification(user);
            onError?.('📩 Verification email sent. Please check your inbox/spam, then log in again.');
            sent = true;
          } catch (e) {
            if (e?.code === 'auth/too-many-requests') {
              localStorage.setItem(cooldownKey, String(now + SERVER_BACKOFF_MS));
              onError?.('⚠️ Too many verification attempts. Try again in a few minutes.');
            } else {
              localStorage.removeItem(cooldownKey);
              onError?.('⚠️ Could not send verification email. Try again later.');
            }
          }
        }
        await signOut(auth);
        if (sent) {
          setTimeout(() => window.location.replace('/login'), 2500);
        }

        setSubmitting(false);
        return;
      }

      // 2) Verified → drop in-memory session, then do real login with selected persistence
      await signOut(auth);
      await setAuthPersistence(rememberMe);
      await signInWithEmailAndPassword(auth, lowerEmail, password);

      onSuccess?.();
      setEmail('');
      setPassword('');
    } catch (err) {
      const code = err?.code || 'auth/unknown-error';
      let msg = '❌ Something went wrong during login.';
      switch (code) {
        case 'auth/invalid-email':
          msg = '❌ Email is in the wrong format.'; break;
        case 'auth/user-not-found':
          msg = '❌ No account found for this email. Please sign up first.'; break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          msg = '❌ Incorrect email or password.'; break;
        case 'auth/too-many-requests':
          msg = '❌ Too many login attempts. Try again later.'; break;
        case 'auth/user-disabled':
          msg = '❌ This account has been disabled.'; break;
      }
      onError?.(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h3 className="fs-1 mb-4 text-center">Login</h3>

      <div className="mb-3">
        <label htmlFor="email">Email</label>
        <input
          id="email"                      
          type="email"
          className="form-control"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="password">Password</label>
        <input
          id="password"                    
          type="password"
          className="form-control"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>

      <div className="form-check mb-4">
        <input
          id="rememberMe"
          type="checkbox"
          className="form-check-input"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
        />
        <label className="form-check-label" htmlFor="rememberMe">
          Remember me
        </label>
      </div>

      <button
        className={`btn btn-cream w-100 ${hovered ? 'shadow' : ''}`}
        disabled={submitting}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleLogin}
      >
        {submitting ? 'Logging in…' : 'Login'}
      </button>
    </>
  );
};

export default LoginForm;
