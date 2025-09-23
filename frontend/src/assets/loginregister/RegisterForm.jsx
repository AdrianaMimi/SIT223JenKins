import { useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signOut,
  fetchSignInMethodsForEmail,
  setPersistence,
  inMemoryPersistence,
} from 'firebase/auth';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../../firebase';
import CircleModal from '../imageresize/imageresizeprofile';

const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB max
const ESCALATE_PICKER_ERRORS_TO_TOAST = true;

const RegisterForm = ({ onSuccess, onError }) => {
  const [hovered, setHovered] = useState(false);
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Avatar cropper state
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [pickFile, setPickFile] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPrev, setAvatarPrev] = useState('');
  const [imgError, setImgError] = useState('');

  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => { if (avatarPrev) URL.revokeObjectURL(avatarPrev); };
  }, [avatarPrev]);

  const onClickPick = () => fileInputRef.current?.click();

  const onChooseFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;

    const typeOk = ALLOWED_TYPES.includes(f.type);
    const extOk = ALLOWED_EXT.test(f.name || '');
    if (!(typeOk || extOk)) {
      const msg = 'Please upload JPEG/JPG, PNG, or WebP.';
      setImgError(msg);
      if (ESCALATE_PICKER_ERRORS_TO_TOAST) onError?.(msg);
      return;
    }
    if (f.size > MAX_BYTES) {
      const mb = (MAX_BYTES / (1024 * 1024)).toFixed(0);
      const msg = `Image is too large (max ${mb} MB).`;
      setImgError(msg);
      if (ESCALATE_PICKER_ERRORS_TO_TOAST) onError?.(msg);
      return;
    }

    setImgError('');
    setPickFile(f);
    setAvatarOpen(true);
  };

  const onCropDone = ({ file }) => {
    setAvatarFile(file);
    setAvatarPrev((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setAvatarOpen(false);
  };

  const resetAvatar = () => {
    if (avatarPrev) URL.revokeObjectURL(avatarPrev);
    setAvatarPrev('');
    setAvatarFile(null);
    setPickFile(null);
    setImgError('');
  };

  const handleRegister = async () => {
    if (!userName || !email || !password || !confirm) {
      onError?.('❌ All fields are required.');
      return;
    }
    if (password !== confirm) {
      onError?.('❌ Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      // make registration session in-memory only (never persisted)
      await setPersistence(auth, inMemoryPersistence);
      // Pre-check if email already exists (toast + early return)
      try {
        const methods = await fetchSignInMethodsForEmail(auth, email);
        if (methods && methods.length) {
          onError?.('❌ An account with this email already exists. Try logging in instead.');
          setSubmitting(false);
          return;
        }
      } catch {
      }

      // 1) Create user (temporary, in-memory session)
      const { user } = await createUserWithEmailAndPassword(auth, email, password);

      // 2) Upload avatar if present (non-fatal)
      let photoURL;
      if (avatarFile) {
        try {
          const ext = avatarFile.type.includes('png') ? 'png' : 'webp';
          const path = `avatars/${user.uid}.${ext}`;
          const sref = storageRef(storage, path);
          await uploadBytes(sref, avatarFile, { contentType: avatarFile.type });
          photoURL = await getDownloadURL(sref);
        } catch (e) {
          console.warn('Avatar upload failed; continuing:', e);
          onError?.('⚠️ Avatar upload failed. You can add a photo later in Settings.');
        }
      }

      // 3) Update profile
      await updateProfile(user, {
        displayName: userName,
        ...(photoURL ? { photoURL } : {}),
      });

      // 4) Send verification email (no custom URL → avoids unauthorized-continue-uri)
      try {
        await sendEmailVerification(user);
      } catch (e) {
        console.warn('sendEmailVerification failed:', e);
        onError?.('⚠️ Could not send verification email. You can request it again from your profile.');
      }

      // 5) Hard gate: immediately sign out (no persistence to clear)
      await signOut(auth);

      // Cleanup + toast
      resetAvatar();
      setUserName(''); setEmail(''); setPassword(''); setConfirm('');
      onSuccess?.();
    } catch (err) {
      console.error(err);
      const code = err?.code;
      let msg = '❌ Registration failed.';
      switch (code) {
        case 'auth/email-already-in-use': msg = '❌ Email is already in use.'; break;
        case 'auth/invalid-email': msg = '❌ Email format is invalid.'; break;
        case 'auth/weak-password': msg = '❌ Password should be at least 6 characters.'; break;
        case 'auth/unauthorized-domain':
          msg = '❌ This domain is not authorized for sign-in. Add your Netlify domain in Firebase Auth → Authorized domains.'; break;
        case 'auth/web-storage-unsupported':
          msg = '❌ Browser storage is blocked. Enable cookies/localStorage.'; break;
        case 'auth/network-request-failed':
          msg = '❌ Network error. Please check your connection.'; break;
        default:
          msg = `❌ Something went wrong during registration. (${code ?? 'unknown'})`;
      }
      onError?.(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h3 className="fs-1 mb-4 text-center">Register</h3>

      {/* Avatar picker with inline errors */}
      <div className="mb-3">
        <label className="form-label">Profile picture (optional)</label>
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-circle overflow-hidden border"
            style={{ width: 194, height: 194, background: '#f8f9fa' }}
          >
            {avatarPrev ? (
              <img
                src={avatarPrev}
                alt="avatar preview"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div className="w-100 h-100 d-flex align-items-center justify-content-center text-secondary">
                194×194
              </div>
            )}
          </div>

          <div className="d-flex flex-column gap-2">
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-outline-rose" onClick={onClickPick}>
                Choose photo
              </button>
              <button
                type="button"
                className="btn btn-outline-bisque"
                onClick={() => (pickFile || avatarPrev) ? setAvatarOpen(true) : onClickPick()}
              >
                {avatarPrev ? 'Edit crop' : 'Crop photo'}
              </button>
              {avatarPrev && (
                <button type="button" className="btn btn-outline-danger" onClick={resetAvatar}>
                  Remove
                </button>
              )}
            </div>
            {imgError && <div className="text-warning small">{imgError}</div>}
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="d-none"
          onChange={onChooseFile}
        />
      </div>

      {/* Username / Email / Passwords */}
      <div className="mb-3">
        <label>Username</label>
        <input
          type="text"
          className="form-control"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
        />
      </div>

      <div className="mb-3">
        <label>Email</label>
        <input
          type="email"
          className="form-control"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="mb-3">
        <label>Password</label>
        <input
          type="password"
          className="form-control"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="mb-4">
        <label>Confirm Password</label>
        <input
          type="password"
          className="form-control"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      <button
        className={`btn btn-cream w-100 ${hovered ? 'shadow' : ''}`}
        disabled={submitting}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleRegister}
      >
        {submitting ? 'Creating…' : 'Create Account'}
      </button>

      {/* Avatar cropper modal */}
      {avatarOpen && (
        <CircleModal
          open={avatarOpen}
          onClose={() => setAvatarOpen(false)}
          file={pickFile}
          imageURL={avatarPrev}
          onExport={onCropDone}
        />
      )}
    </>
  );
};

export default RegisterForm;
