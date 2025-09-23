import { useState, useRef } from 'react';
import styles from './Footer.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const Footer = () => {
  const [email, setEmail] = useState('');
  const emailRef = useRef(null);

  const [toast, setToast] = useState({
    show: false,
    message: '',
    success: true,
    visible: false,
  });

  const [hovered, setHovered] = useState({ button: false });

  const showToast = (message, success) => {
    setToast({ show: true, visible: false, message, success });
    setTimeout(() => setToast((p) => ({ ...p, visible: true })), 20);
    setTimeout(() => setToast((p) => ({ ...p, visible: false })), 2600);
    setTimeout(() => setToast({ show: false, message: '', success, visible: false }), 3000);
  };

  const validateEmail = (val) => {
    if (!val.trim()) return 'Please fill out the subscribe field.';
    if (!EMAIL_RE.test(val.trim())) return 'Please enter a valid email address.';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const err = validateEmail(email);
    if (err) {
      showToast(err, false);     
      emailRef.current?.focus();
      return;
    }

    try {
      const res = await fetch('http://localhost:3000/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Request failed');

      showToast('Email sent!', true);
      setEmail('');
    } catch (err) {
      console.error('Error:', err);
      showToast('Failed to send.', false);
    }
  };

  return (
    <>
      <footer className="text-black text-center shadow-sm bg-danger-subtle pt-4">
        <div className="container">
          <div className="container-fluid rounded bg-mint">
            <div className="d-flex p-3 flex-wrap justify-content-between align-items-center gap-3 mb-4 lobster-regular">
              <div className="fs-1 bigbig-text">
                Subscribe! Come and Sign up for exciting News!
              </div>

              <form noValidate onSubmit={handleSubmit} className="d-flex align-items-center">
                <input
                  ref={emailRef}
                  className={`form-control me-2 ${styles.footerInput}`}
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  inputMode="email"
                  autoComplete="email"
                  onInvalid={(e) => e.preventDefault()}
                />
                <button
                  className={`btn ${hovered.button ? 'shadow bg-rose color-lavendar' : 'shadow-sm bg-lavender deep-rose'}`}
                  type="submit"
                  onMouseEnter={() => setHovered((prev) => ({ ...prev, button: true }))}
                  onMouseLeave={() => setHovered((prev) => ({ ...prev, button: false }))}
                >
                  Subscribe
                </button>
              </form>
            </div>
          </div>

          <hr />

          <div className="d-flex lobster-regular fs-4 justify-content-around flex-wrap text-start">
            <div>
              <p>Articles</p>
              <p>Tutorials</p>
            </div>
            <div>
              <p>FAQs</p>
              <p>Contact Us</p>
            </div>
            <div>
              <p>Stay Connected ~</p>
              <p>
                <i className="bi bi-facebook me-2" />
                <i className="bi bi-twitter me-2" />
                <i className="bi bi-instagram" />
              </p>
            </div>
          </div>

          <hr />

          <small className="cookie-regular fs-3">
            © Dev@Deakin 2025 — Privacy | Terms | Code of Conduct
          </small>
        </div>
      </footer>

      {toast.show && (
        <div
          className={`toastMessage ${toast.success ? 'toastSuccess' : 'toastError'} ${toast.visible ? 'show' : ''}`}
        >
          {toast.message}
        </div>
      )}
    </>
  );
};

export default Footer;


//deployment in netlify:
// import { useState, useRef } from 'react';
// import styles from './Footer.module.css';

// const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// const API_BASE = import.meta.env?.VITE_API_BASE?.trim?.() || '';

// const Footer = () => {
//   const [email, setEmail] = useState('');
//   const emailRef = useRef(null);

//   const [toast, setToast] = useState({ show: false, message: '', success: true, visible: false });
//   const [hovered, setHovered] = useState({ button: false });
//   const [loading, setLoading] = useState(false);

//   // very simple honeypot to deter bots
//   const [hp, setHp] = useState('');

//   const showToast = (message, success) => {
//     setToast({ show: true, visible: false, message, success });
//     setTimeout(() => setToast((p) => ({ ...p, visible: true })), 20);
//     setTimeout(() => setToast((p) => ({ ...p, visible: false })), 2600);
//     setTimeout(() => setToast({ show: false, message: '', success, visible: false }), 3000);
//   };

//   const validateEmail = (val) => {
//     if (!val.trim()) return 'Please fill out the subscribe field.';
//     if (!EMAIL_RE.test(val.trim())) return 'Please enter a valid email address.';
//     return '';
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();

//     if (hp) return;

//     const err = validateEmail(email);
//     if (err) {
//       showToast(err, false);
//       emailRef.current?.focus();
//       return;
//     }

//     if (loading) return;
//     setLoading(true);

//     try {
//       const controller = new AbortController();
//       const id = setTimeout(() => controller.abort(), 15000); // 15s timeout

//       const res = await fetch(`${API_BASE}/subscribe`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ email }),
//         signal: controller.signal,
//       });
//       clearTimeout(id);

//       // attempt to parse json, but don’t blow up if not json
//       let data = null;
//       try { data = await res.json(); } catch (_) { }

//       if (!res.ok) {
//         const msg = (data && data.message) || `Request failed (${res.status})`;
//         throw new Error(msg);
//       }

//       showToast('Email sent!', true);
//       setEmail('');
//     } catch (err) {
//       console.error('Subscribe error:', err);
//       const msg =
//         err?.name === 'AbortError'
//           ? 'Request timed out. Try again.'
//           : err?.message || 'Failed to send.';
//       showToast(msg, false);
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <>
//       <footer className="text-black text-center shadow-sm bg-danger-subtle pt-4">
//         <div className="container">
//           <div className="container-fluid rounded bg-mint">
//             <div className="d-flex p-3 flex-wrap justify-content-between align-items-center gap-3 mb-4 lobster-regular">
//               <div className="fs-1 bigbig-text">
//                 Subscribe! Come and Sign up for exciting News!
//               </div>

//               {/* IMPORTANT: noValidate disables the browser popup */}
//               <form noValidate onSubmit={handleSubmit} className="d-flex align-items-center" aria-busy={loading}>
//                 {/* honeypot (hidden from users) */}
//                 <input
//                   type="text"
//                   value={hp}
//                   onChange={(e) => setHp(e.target.value)}
//                   tabIndex={-1}
//                   autoComplete="off"
//                   style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px' }}
//                   aria-hidden="true"
//                 />

//                 <input
//                   ref={emailRef}
//                   className={`form-control me-2 ${styles.footerInput}`}
//                   type="email"
//                   placeholder="Email"
//                   value={email}
//                   onChange={(e) => setEmail(e.target.value)}
//                   inputMode="email"
//                   autoComplete="email"
//                   onInvalid={(e) => e.preventDefault()}
//                   disabled={loading}
//                 />
//                 <button
//                   className={`btn ${hovered.button ? 'shadow bg-rose color-lavendar' : 'shadow-sm bg-lavender deep-rose'}`}
//                   type="submit"
//                   disabled={loading}
//                   onMouseEnter={() => setHovered((prev) => ({ ...prev, button: true }))}
//                   onMouseLeave={() => setHovered((prev) => ({ ...prev, button: false }))}
//                 >
//                   {loading ? 'Sending…' : 'Subscribe'}
//                 </button>
//               </form>
//             </div>
//           </div>

//           <hr />

//           <div className="d-flex lobster-regular fs-4 justify-content-around flex-wrap text-start">
//             <div>
//               <p>Articles</p>
//               <p>Tutorials</p>
//             </div>
//             <div>
//               <p>FAQs</p>
//               <p>Contact Us</p>
//             </div>
//             <div>
//               <p>Stay Connected ~</p>
//               <p>
//                 <i className="bi bi-facebook me-2" />
//                 <i className="bi bi-twitter me-2" />
//                 <i className="bi bi-instagram" />
//               </p>
//             </div>
//           </div>

//           <hr />

//           <small className="cookie-regular fs-3">
//             © Dev@Deakin 2025 — Privacy | Terms | Code of Conduct
//           </small>
//         </div>
//       </footer>

//       {toast.show && (
//         <div
//           className={`toastMessage ${toast.success ? 'toastSuccess' : 'toastError'} ${toast.visible ? 'show' : ''}`}
//           role="status"
//           aria-live="polite"
//         >
//           {toast.message}
//         </div>
//       )}
//     </>
//   );
// };

// export default Footer;