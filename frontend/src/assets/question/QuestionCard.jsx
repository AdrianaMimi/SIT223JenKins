import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import styles from './questions.module.css';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";


function SimpleModal({ open, onClose, title, children, labelledById }) {
  const overlayRef = useRef(null);
  const descId = `${labelledById}-desc`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.modalOverlay}
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledById}
      aria-describedby={descId}
    >
      <div
        className={styles.modalCard}
        onMouseDown={(e) => e.stopPropagation()}
        role="document"
      >
        <div className={styles.modalHeader}>
          <h5 id={labelledById} className={styles.modalTitle}>{title}</h5>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div id={descId} className={styles.modalBody}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function QuestionsCard({
  data,
  onDismiss,
  dragHandleRef,
  dragHandleProps,
  onModalOpenChange,
  isAdmin = false,
  onDelete,
}) {
  if (!data) return null;

  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false); // question details modal
  const [confirmOpen, setConfirmOpen] = useState(false); // delete confirm modal

  // Toast state
  const [toast, setToast] = useState({ show: false, visible: false, message: '', success: true });
  const toastTimers = useRef([]);

  const { pathname } = useLocation();
  const onAllQuestions = /^\/questions\/all(?:\/|$)/.test(pathname);
  const onAllSearch = /^\/search(?:\/|$)/.test(pathname);

  // lock scroll on open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => { onModalOpenChange?.(open); }, [open, onModalOpenChange]);

  useEffect(() => () => { toastTimers.current.forEach(clearTimeout); }, []);

  const showToast = (message, success = true) => {
    toastTimers.current.forEach(clearTimeout);
    toastTimers.current = [];
    setToast({ show: true, visible: false, message, success });
    toastTimers.current.push(setTimeout(() => setToast((p) => ({ ...p, visible: true })), 20));
    toastTimers.current.push(setTimeout(() => setToast((p) => ({ ...p, visible: false })), 2600));
    toastTimers.current.push(setTimeout(() => setToast({ show: false, visible: false, message: '', success }), 3000));
  };

  const tags = useMemo(
    () =>
      Array.isArray(data.tags)
        ? data.tags
        : (data.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    [data.tags]
  );

  const titleId = useMemo(() => `question-title-${String(data.id)}`, [data.id]);
  const answersCount = data.answersCount ?? (Array.isArray(data.answers) ? data.answers.length : 0);

  // Delete handlers
  const openDeleteConfirm = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmOpen(true);
  };
  const handleConfirmDelete = async () => {
    setConfirmOpen(false);
    try {
      await onDelete?.(data.id);
      showToast('Deleted question.', true);
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('Failed to delete question.', false);
    }
  };

  const excerpt = (s = "", n = 20) => {
    const words = s.split(/(\s+)/); 
    let count = 0, out = "";
    for (let w of words) {
      if (!w.trim()) { out += w; continue; }
      if (count >= n) break;
      out += w;
      count++;
    }
    if (count >= n) out += " …";
    return out;
  };

  return (
    <>
      <div
        className={`card border-0 rounded-1 py-2 px-3 mb-2 ${hovered ? '' : 'bg-sky-blue'}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(true))}
        style={{ position: 'relative', borderBottom: '1px solid #ccc', cursor: 'pointer' }}
      >
        {onDismiss && !onAllSearch && (
          <button
            type="button"
            className={styles.dismissBtn}
            onClick={(e) => { e.stopPropagation(); onDismiss(data.id); }}
            aria-label="Hide"
          >×</button>
        )}

        {isAdmin && (onAllQuestions || onAllSearch) && (
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={openDeleteConfirm}
            aria-label="Delete"
          >🗑</button>
        )}

        {dragHandleRef && (
          <button
            ref={dragHandleRef}
            {...dragHandleProps}
            className={styles.dragHandle}
            onClick={(e) => e.stopPropagation()}
          >⋮⋮</button>
        )}

        <div className="row align-items-center">
          <div className="col-md-10">
            <h6 className="mb-1 fw-bold">{data.title}</h6>
            <div className="deep-rose small">
              👁 {data.views ?? 0} views • {(data.authorDisplay || data.author) ?? 'anonymous'} • {data.timeAgo || ''}
            </div>
          </div>
          <div className="col-md-2 text-end">
            <div className="fw-bold">{data.votes ?? 0}</div><small>votes</small>
            <div className="fw-bold mt-2">{answersCount}</div><small>ans</small>
          </div>
        </div>
      </div>

      {/* Question details modal (keeps View & Answer + Close) */}
      <SimpleModal
        open={open}
        onClose={() => setOpen(false)}
        title={data.title}
        labelledById={titleId}
      >
        {data.description ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {excerpt(data.description, 20)}
          </ReactMarkdown>
        ) : (
          <p>No description.</p>
        )}

        {tags.length > 0 && (
          <div className="mb-3">
            {tags.slice(0, 5).map((t) => (
              <span key={t} className="badge bg-secondary rounded-pill me-1">{t}</span>
            ))}
            {tags.length > 5 && <span className="text-muted">+{tags.length - 5} more</span>}
          </div>
        )}
        <ul className="list-unstyled small text-muted mb-3">
          <li>🟢 Status: {data.status || 'open'}</li>
          <li>👁️ Views: {data.views ?? 0}</li>
          <li>👍 Votes: {data.votes ?? 0}</li>
          <li>💬 Answers: {answersCount}</li>
        </ul>
        <div className="d-flex justify-content-end gap-2">
          <Link to={`/questions/${encodeURIComponent(String(data.id))}`} className="btn btn-primary">
            View & Answer
          </Link>
          <button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </SimpleModal>

      {/* Delete confirm modal */}
      <SimpleModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete Question?"
        labelledById={`confirm-${data.id}`}
      >
        <p>This will permanently remove this question and all its answers.</p>
        <div className="d-flex justify-content-end gap-2 lobster-regular">
          <button className="btn btn-outline-secondary" onClick={() => setConfirmOpen(false)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleConfirmDelete}>Delete</button>
        </div>
      </SimpleModal>

      {/* Global toast */}
      {toast.show && createPortal(
        <div className={`toastMessage ${toast.success ? 'toastSuccess' : 'toastError'} ${toast.visible ? 'show' : ''}`}>
          {toast.message}
        </div>,
        document.body
      )}
    </>
  );
}

