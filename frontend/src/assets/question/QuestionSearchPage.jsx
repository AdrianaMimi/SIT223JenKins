import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

import SortableCard from './sortablecard';
import QuestionsCard from './QuestionCard';

// Firebase
import { auth, db } from '../../firebase';
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// localStorage keys
const LS_HIDDEN = 'hiddenQuestions';
const LS_ORDER = 'questionOrder';

export default function AllQuestionsPage() {
  // scroll to top on mount
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

  // admin flag
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

  // hidden state
  const [hiddenIds, setHiddenIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(LS_HIDDEN) || '[]')); }
    catch { return new Set(); }
  });
  useEffect(() => {
    localStorage.setItem(LS_HIDDEN, JSON.stringify([...hiddenIds]));
  }, [hiddenIds]);

  const hideOne = (id) => setHiddenIds((prev) => new Set(prev).add(id));
  const resetHidden = () => setHiddenIds(new Set());

  // filters
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // ---------- Firestore subscription ----------
  const [fsItems, setFsItems] = useState([]);

  useEffect(() => {
    const qRef = query(
      collection(db, 'questions'),
      where('visibility', '==', 'public')
    );
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data() || {};
          const ts = data.createdAt?.toDate ? data.createdAt.toDate() : null;
          const createdAtISO = ts
            ? ts.toISOString().slice(0, 10)
            : (typeof data.createdAt === 'string' ? data.createdAt : '');
          return {
            id: d.id,
            title: data.title || '(untitled)',
            description: data.description || '',
            tags: Array.isArray(data.tags) ? data.tags : [],
            createdAt: data.createdAt || null,
            createdAtISO,
            views: Number(data.views ?? data.realViews ?? 0),
            votes: Number(data.votes ?? data.realVotes ?? 0),
            answersCount: Number(data.answersCount ?? 0),
            status: data.status || 'open',
            authorDisplay: data.authorDisplay || '',
            author: data.author || '',
            timeAgo: data.timeAgo || '',
            visibility: data.visibility || 'public',
          };
        });
        setFsItems(rows);
      },
      (err) => {
        console.error('questions onSnapshot error:', err);
        showToast(err?.message || 'Failed to load questions.', false);
      }
    );
    return () => unsub();
  }, []);

  // tag list
  const allTags = useMemo(() => {
    const s = new Set();
    fsItems.forEach((x) => (x.tags || []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [fsItems]);

  // 1) not hidden
  const visible = useMemo(
    () => fsItems.filter((i) => !hiddenIds.has(i.id)),
    [fsItems, hiddenIds]
  );

  // 2) search / tag / date filters
  const filtered = useMemo(() => {
    const qlc = q.trim().toLowerCase();
    const fromTs = from ? Date.parse(from + 'T00:00:00') : null;
    const toTs = to ? Date.parse(to + 'T23:59:59') : null;

    return visible.filter((item) => {
      if (qlc) {
        const hay = `${item.title || ''} ${item.description || ''}`.toLowerCase();
        if (!hay.includes(qlc)) return false;
      }
      if (tag) {
        const tags = item.tags || [];
        if (!tags.includes(tag)) return false;
      }
      if (fromTs || toTs) {
        const dateStr = item.createdAtISO || '';
        const ts = dateStr ? Date.parse(dateStr + 'T12:00:00') : NaN; // noon to avoid TZ off-by-one
        if (fromTs && (!ts || ts < fromTs)) return false;
        if (toTs && (!ts || ts > toTs)) return false;
      }
      return true;
    });
  }, [visible, q, tag, from, to]);

  // saved order
  const savedOrder = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(LS_ORDER) || '[]'); }
    catch { return []; }
  }, []);

  // initial ordered ids based on saved order + filtered
  const initialIds = useMemo(() => {
    const ids = filtered.map((x) => x.id);
    const inSaved = savedOrder.filter((id) => ids.includes(id));
    const remaining = ids.filter((id) => !inSaved.includes(id));
    return [...inSaved, ...remaining];
  }, [filtered, savedOrder]);

  const [orderedIds, setOrderedIds] = useState(initialIds);
  useEffect(() => { setOrderedIds(initialIds); }, [initialIds]);

  const byId = useMemo(() => new Map(filtered.map((x) => [x.id, x])), [filtered]);

  const persistOrder = (ids) => localStorage.setItem(LS_ORDER, JSON.stringify(ids));

  // dnd sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // disable drag while any modal is open
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

  // ---- Admin delete helper (answers -> question) ----
  async function deleteQuestionAndAnswers(qid) {
    // 1) delete answers in subcollection
    try {
      const ansSnap = await getDocs(collection(db, 'questions', qid, 'answers'));
      await Promise.allSettled(ansSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (e) {
      console.warn('delete answers failed', e);
    }
    // 2) delete the question doc
    await deleteDoc(doc(db, 'questions', qid));
  }

  const showNoData = fsItems.length === 0;
  const showNoMatches = fsItems.length > 0 && orderedIds.length === 0;

  return (
    <div className="container py-4 lobster-regular">
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
        <h3 className="mb-0">Find Questions</h3>

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
            <button className="btn btn-outline-secondary" onClick={resetHidden}>Reset hidden</button>
            <span className="small text-muted align-self-center">Hidden: {hiddenIds.size}</span>
          </div>
        </div>
      </div>

      {/* Optional: keep these info banners, or switch to toasts if you prefer transient notices */}
      {showNoData && <div className="alert alert-info">No questions yet. Be the first to post!</div>}
      {showNoMatches && (
        <div className="alert alert-info">
          No questions match your filters. Try clearing filters or resetting hidden.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        disabled={anyModalOpen}
      >
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          {orderedIds.map((id) => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <SortableCard
                key={id}
                item={item}
                isModalOpen={anyModalOpen}
                onDismiss={(hid) => {
                  hideOne(hid);
                  setOrderedIds((ids) => ids.filter((x) => x !== hid));
                }}
                render={({ handleApi, onDismiss }) => (
                  <QuestionsCard
                    data={item}
                    onDismiss={onDismiss}
                    dragHandleRef={handleApi.ref}
                    dragHandleProps={handleApi.props}
                    onModalOpenChange={setAnyModalOpen}
                    isAdmin={isAdmin}
                    onDelete={async (qid) => {
                      if (!isAdmin) return;
                      try {
                        // optimistic UI
                        setFsItems((prev) => prev.filter((x) => x.id !== qid));
                        setOrderedIds((ids) => ids.filter((x) => x !== qid));
                        await deleteQuestionAndAnswers(qid);
                        showToast('Question deleted.', true); // toast on success
                      } catch (err) {
                        console.error('Delete question failed', err);
                        showToast('Failed to delete question.', false); // toast on error
                      }
                    }}
                  />
                )}
              />
            );
          })}
        </SortableContext>
      </DndContext>

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
