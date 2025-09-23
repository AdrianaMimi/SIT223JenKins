import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';

import SortableCard from './sortablecard';
import ArticlesCard from './ArticleCard';

import { auth, storage, db } from '../../firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ref as sref, listAll, deleteObject } from 'firebase/storage';

const LS_ART_ORDER = 'articleOrder';

// Simple inline confirm dialog (no browser confirm)
function ConfirmDialog({ open, title = 'Are you sure?', detail, onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="modalCard">
        <h5 id="confirm-title" className="mb-2">{title}</h5>
        {detail && <p className="text-muted mb-3" style={{ whiteSpace: 'pre-wrap' }}>{detail}</p>}
        <div className="d-flex gap-2 justify-content-end">
          <button className="btn btn-outline-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function AllArticlesPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, []);

  // ---- Global Toast (uses index.css classes) ----
  const [toast, setToast] = useState({ show: false, visible: false, message: '', success: true });
  const toastTimers = useRef([]);
  const clearToastTimers = () => { toastTimers.current.forEach(clearTimeout); toastTimers.current = []; };
  const showToast = (message, success = true) => {
    clearToastTimers();
    setToast({ show: true, visible: false, message, success });
    toastTimers.current.push(setTimeout(() => setToast(p => ({ ...p, visible: true })), 20));
    toastTimers.current.push(setTimeout(() => setToast(p => ({ ...p, visible: false })), 2600));
    toastTimers.current.push(setTimeout(() => setToast({ show: false, visible: false, message: '', success }), 3000));
  };
  useEffect(() => () => clearToastTimers(), []);

  // ---- admin flag ----
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return setIsAdmin(false);
      try {
        const tok = await u.getIdTokenResult(true);
        setIsAdmin(!!tok.claims?.admin);
      } catch {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  // ---- filters ----
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // ---- Firestore subscription ----
  const [fsItems, setFsItems] = useState([]);
  const [fsError, setFsError] = useState('');

  useEffect(() => {
    const qRef = query(collection(db, 'articles'), where('visibility', '==', 'public'));
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const x = d.data() || {};
          const ts = x.createdAt?.toDate ? x.createdAt.toDate() : null;
          const createdAtISO = ts
            ? ts.toISOString().slice(0, 10)
            : (typeof x.createdAt === 'string' ? x.createdAt : '');
          return {
            id: d.id,
            title: x.title || '(untitled)',
            description: x.description || '',
            body: x.body || '',
            tags: Array.isArray(x.tags) ? x.tags : [],
            createdAtISO,
            rating: Number(x.rating ?? 0),
            ratingCount: Number(x.ratingCount ?? 0),
            authorDisplay: x.authorDisplay || 'Anonymous',
            image: x.display?.croppedURL || x.imageURL || '',
          };
        });
        setFsItems(rows);
        setFsError('');
      },
      (err) => {
        console.error('articles onSnapshot error:', err);
        setFsError(err?.message || 'Failed to load articles.');
      }
    );
    return () => unsub();
  }, []);

  // ---- tag list ----
  const allTags = useMemo(() => {
    const s = new Set();
    fsItems.forEach((x) => (x.tags || []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [fsItems]);

  // ---- client-side filter ----
  const filtered = useMemo(() => {
    const qlc = q.trim().toLowerCase();
    const fromTs = from ? Date.parse(from + 'T00:00:00') : null;
    const toTs = to ? Date.parse(to + 'T23:59:59') : null;

    return fsItems.filter((item) => {
      if (qlc) {
        const hay = `${item.title} ${item.description}`.toLowerCase();
        if (!hay.includes(qlc)) return false;
      }
      if (tag) {
        const tags = item.tags || [];
        if (!tags.includes(tag)) return false;
      }
      if (fromTs || toTs) {
        const dateStr = item.createdAtISO || '';
        const ts = dateStr ? Date.parse(dateStr + 'T12:00:00') : NaN;
        if (fromTs && (!ts || ts < fromTs)) return false;
        if (toTs && (!ts || ts > toTs)) return false;
      }
      return true;
    });
  }, [fsItems, q, tag, from, to]);

  // ---- saved order ----
  const savedOrder = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(LS_ART_ORDER) || '[]'); }
    catch { return []; }
  }, []);

  const initialIds = useMemo(() => {
    const ids = filtered.map((x) => x.id);
    const inSaved = savedOrder.filter((id) => ids.includes(id));
    const remaining = ids.filter((id) => !inSaved.includes(id));
    return [...inSaved, ...remaining];
  }, [filtered, savedOrder]);

  const [orderedIds, setOrderedIds] = useState(initialIds);
  useEffect(() => { setOrderedIds(initialIds); }, [initialIds]);

  const byId = useMemo(() => new Map(filtered.map((x) => [x.id, x])), [filtered]);
  const persistOrder = (ids) => localStorage.setItem(LS_ART_ORDER, JSON.stringify(ids));

  // ---- DnD ----
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [anyModalOpen, setAnyModalOpen] = useState(false);

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setOrderedIds((ids) => {
      const fromIdx = ids.indexOf(active.id);
      const toIdx = ids.indexOf(over.id);
      if (fromIdx < 0 || toIdx < 0) return ids;
      const next = arrayMove(ids, fromIdx, toIdx);
      persistOrder(next);
      return next;
    });
  };

  const clearFilters = () => { setQ(''); setTag(''); setFrom(''); setTo(''); };

  // ---- Admin delete helper (doc + subcollections + storage) ----
  async function deleteArticleAndAssets(articleId) {
    // 1) subcollections
    try {
      const commentsSnap = await getDocs(collection(db, 'articles', articleId, 'comments'));
      await Promise.allSettled(commentsSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (e) { console.warn('delete comments failed', e); }

    try {
      const ratingsSnap = await getDocs(collection(db, 'articles', articleId, 'ratings'));
      await Promise.allSettled(ratingsSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (e) { console.warn('delete ratings failed', e); }

    // 2) storage files under articles/{id}
    try {
      const folder = sref(storage, `articles/${articleId}`);
      const listed = await listAll(folder);
      const deletions = [
        ...listed.items.map((ref) => deleteObject(ref)),
        ...listed.prefixes.map(async (p) => {
          const inner = await listAll(p);
          await Promise.allSettled(inner.items.map((r) => deleteObject(r)));
        }),
      ];
      await Promise.allSettled(deletions);
    } catch (e) { console.warn('delete storage failed', e); }

    // 3) article doc
    await deleteDoc(doc(db, 'articles', articleId));
  }

  // ---- Confirm dialog state ----
  const [confirm, setConfirm] = useState({ open: false, articleId: null, title: '', detail: '' });

  const openDeleteConfirm = (article) => {
    setConfirm({
      open: true,
      articleId: article.id,
      title: 'Delete this article?',
      detail:
        `This will permanently remove:\n` +
        `• The article document\n` +
        `• All comments & ratings\n` +
        `• Any images under /articles/${article.id} in Storage`,
    });
    setAnyModalOpen(true);
  };
  const closeConfirm = () => { setConfirm({ open: false, articleId: null, title: '', detail: '' }); setAnyModalOpen(false); };

  const doConfirmedDelete = async () => {
    const articleId = confirm.articleId;
    closeConfirm();
    if (!articleId) return;

    try {
      // optimistic UI
      setFsItems((prev) => prev.filter((x) => x.id !== articleId));
      setOrderedIds((prev) => prev.filter((x) => x !== articleId));
      await deleteArticleAndAssets(articleId);
      showToast('Article deleted.', true);
    } catch (err) {
      console.error('Delete article failed', err);
      showToast('Failed to delete article.', false);
    }
  };

  return (
    <div className="container py-4 lobster-regular">
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
        <h3 className="mb-0">Find Articles</h3>

        <div className="d-flex flex-wrap align-items-end gap-2">
          <div>
            <label className="form-label mb-1">Title / keyword</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="form-control"
              placeholder="Search by title or description…"
              style={{ minWidth: 220 }}
            />
          </div>

          <div>
            <label className="form-label mb-1">Tag</label>
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="form-select"
              style={{ minWidth: 160 }}
            >
              <option value="">All</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="form-control" />
          </div>
          <div>
            <label className="form-label mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="form-control" />
          </div>

          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary" onClick={clearFilters}>Clear filters</button>
          </div>
        </div>
      </div>

      {fsError && <div className="alert alert-warning py-2">{fsError}</div>}
      {orderedIds.length === 0 && (
        <div className="alert alert-info">No articles match your filters.</div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        disabled={anyModalOpen}
      >
        <SortableContext items={orderedIds} strategy={rectSortingStrategy}>
          <div
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: '1fr',
            }}
          >
            <style>{`
              @media (min-width: 768px) {
                .articles-grid-3 {
                  display: grid;
                  gap: 1rem;
                  grid-template-columns: repeat(3, 1fr);
                }
              }
            `}</style>

            <div className="articles-grid-3">
              {orderedIds.map((id) => {
                const item = byId.get(id);
                if (!item) return null;
                return (
                  <SortableCard
                    key={id}
                    item={item}
                    render={({ handleApi }) => (
                      <ArticlesCard
                        data={item}
                        dragHandleRef={handleApi.ref}
                        dragHandleProps={handleApi.props}
                        onModalOpenChange={setAnyModalOpen}
                        isAdmin={isAdmin}
                        onDelete={() => openDeleteConfirm(item)}
                      />
                    )}
                  />
                );
              })}
            </div>
          </div>
        </SortableContext>
      </DndContext>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        detail={confirm.detail}
        onCancel={closeConfirm}
        onConfirm={doConfirmedDelete}
      />

      {/* Global toast overlay */}
      {toast.show && (
        <div
          className={`toastMessage ${toast.success ? 'toastSuccess' : 'toastError'} ${toast.visible ? 'show' : ''}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
