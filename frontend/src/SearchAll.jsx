import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';

// sortables:
import SortableCardArticle from './assets/article/sortablecard';
import SortableCardQuestion from './assets/question/sortablecard';

// cards:
import ArticleCard from './assets/article/ArticleCard';
import TutorialCard from './assets/tutorial/TutorialCard';
import QuestionsCard from './assets/question/QuestionCard';

// Firebase
import { auth, storage, db } from './firebase';
import {
  collection,
  onSnapshot,
  query as fsQuery,
  where,
  limit as fsLimit,
  doc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ref as sref, listAll, deleteObject } from 'firebase/storage';

import styles from './search.module.css';

// ──────────────────────────────────────────────────────────────────────────────
// Keys for per-section persisted order
// ──────────────────────────────────────────────────────────────────────────────
const LS_ART_ORDER = 'searchAll:articleOrder';
const LS_TUT_ORDER = 'searchAll:tutorialOrder';
const LS_QNS_ORDER = 'searchAll:questionOrder';

// ──────────────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────────────
const take = (arr, n) => (n ? arr.slice(0, n) : arr);
const tokensOf = (s = '') =>
  s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);

const readSaved = (key) => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
};
const persistSaved = (key, ids) => localStorage.setItem(key, JSON.stringify(ids));

const makeInitialOrder = (filtered, saved) => {
  const ids = filtered.map(x => x.id);
  const inSaved = saved.filter(id => ids.includes(id));
  const remaining = ids.filter(id => !inSaved.includes(id));
  return [...inSaved, ...remaining];
};

// ──────────────────────────────────────────────────────────────────────────────
// Confirm dialog (focus + Esc)
// ──────────────────────────────────────────────────────────────────────────────
function ConfirmDialog({ open, title = 'Are you sure?', detail, onCancel, onConfirm }) {
  const btnRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    btnRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="modalCard">
        <h5 id="confirm-title" className="mb-2">{title}</h5>
        {detail && <p className="text-muted mb-3" style={{ whiteSpace: 'pre-wrap' }}>{detail}</p>}
        <div className="d-flex gap-2 justify-content-end">
          <button className="btn btn-outline-secondary" onClick={onCancel}>Cancel</button>
          <button ref={btnRef} className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Storage recursive delete (throttled)
// ──────────────────────────────────────────────────────────────────────────────
async function deleteFolderRecursive(prefixRef, pool = 10) {
  const listed = await listAll(prefixRef);
  for (let i = 0; i < listed.items.length; i += pool) {
    const batch = listed.items.slice(i, i + pool);
    await Promise.allSettled(batch.map((r) => deleteObject(r)));
  }
  for (const p of listed.prefixes) {
    await deleteFolderRecursive(p, pool);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
export default function SearchAllPage() {
  const nav = useNavigate();

  // Admin flag
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return setIsAdmin(false);
      try {
        const tok = await u.getIdTokenResult();
        setIsAdmin(!!tok.claims?.admin);
      } catch { setIsAdmin(false); }
    });
    return () => unsub();
  }, []);

  // Any modal open? (disable drag)
  const [anyModalOpen, setAnyModalOpen] = useState(false);
  const baseSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const sensorsIf = (disabled) => (disabled ? [] : baseSensors);

  // Confirm delete
  const [confirm, setConfirm] = useState({ open: false, kind: null, id: null, title: '', detail: '' });
  const openDeleteConfirm = (kind, item) => {
    const lines = [
      `This will permanently remove the ${kind} document.`,
      kind === 'article' ? '• All comments & ratings\n• Images under /articles/{id}' : '',
      kind === 'tutorial' ? '• Any tutorial assets in Storage' : '',
      kind === 'question' ? '• The question and its answers' : '',
    ].filter(Boolean).join('\n');
    setConfirm({ open: true, kind, id: item.id, title: `Delete this ${kind}?`, detail: lines });
    setAnyModalOpen(true);
  };
  const closeConfirm = () => { setConfirm({ open: false, kind: null, id: null, title: '', detail: '' }); setAnyModalOpen(false); };

  // Toast
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const showToast = (msg, type = 'success', life = 3000) => {
    setToast({ type, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), life);
  };

  // URL params <-> state
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') || '');
  const [type, setType] = useState(sp.get('type') || 'all');
  const [from, setFrom] = useState(sp.get('from') || '');
  const [to, setTo] = useState(sp.get('to') || '');

  useEffect(() => {
    const qp = sp.get('q') || '';
    const tp = sp.get('type') || 'all';
    const fp = sp.get('from') || '';
    const tp2 = sp.get('to') || '';
    if (qp !== q) setQ(qp);
    if (tp !== type) setType(tp);
    if (fp !== from) setFrom(fp);
    if (tp2 !== to) setTo(tp2);
  }, [sp]);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams();
      if (q) next.set('q', q);
      if (type && type !== 'all') next.set('type', type);
      if (from) next.set('from', from);
      if (to) next.set('to', to);
      setSp(next, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [q, type, from, to, setSp]);

  // Live data
  const [articles, setArticles] = useState([]);
  const [tutorials, setTutorials] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    const qA = fsQuery(collection(db, 'articles'), where('visibility', '==', 'public'), fsLimit(120));
    const qT = fsQuery(collection(db, 'tutorials'), where('visibility', '==', 'public'), fsLimit(120));
    const qQ = fsQuery(collection(db, 'questions'), where('visibility', '==', 'public'), fsLimit(120));

    setLoading(true);
    let gotA = false, gotT = false, gotQ = false;

    const mapDoc = (d) => {
      const x = d.data() || {};
      const ts =
        x.createdAt?.toDate ? x.createdAt.toDate() :
          (typeof x.createdAt === 'string' ? new Date(x.createdAt) : null);
      const createdAtMs = ts && !Number.isNaN(ts.getTime?.()) ? ts.getTime() : null;
      return { id: d.id, ...x, createdAtMs };
    };

    const done = () => { if (gotA && gotT && gotQ) setLoading(false); };
    const onErr = (e) => { console.error(e); setErr(e?.message || 'Failed to load.'); setLoading(false); };

    const ua = onSnapshot(qA, s => { setArticles(s.docs.map(mapDoc)); gotA = true; done(); }, onErr);
    const ut = onSnapshot(qT, s => { setTutorials(s.docs.map(mapDoc)); gotT = true; done(); }, onErr);
    const uq = onSnapshot(qQ, s => { setQuestions(s.docs.map(mapDoc)); gotQ = true; done(); }, onErr);

    return () => { ua(); ut(); uq(); };
  }, []);

  // Filtering
  const qTokens = useMemo(() => tokensOf(q).slice(0, 10), [q]);
  const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const toTs = to ? new Date(`${to}T23:59:59`).getTime() : null;

  const matchesTokens = (doc, fields) => {
    if (!qTokens.length) return true;
    const st = Array.isArray(doc.searchTokens) ? doc.searchTokens.map(String) : [];
    const oneChar = qTokens.length === 1 && qTokens[0].length === 1;

    if (st.length) {
      return qTokens.some(t => st.some(tok => oneChar ? tok.startsWith(t) : tok.includes(t)));
    }
    const hay = fields.map(f => String(doc?.[f] ?? '')).join(' ').toLowerCase();
    return qTokens.some(t => hay.includes(t));
  };
  const inDate = (ms) => {
    if (!fromTs && !toTs) return true;
    if (!Number.isFinite(ms)) return false;
    if (fromTs && ms < fromTs) return false;
    if (toTs && ms > toTs) return false;
    return true;
  };

  const artFiltered = useMemo(
    () => articles.filter(a => matchesTokens(a, ['title', 'description', 'body']) && inDate(a.createdAtMs)),
    [articles, qTokens, fromTs, toTs]
  );
  const tutFiltered = useMemo(
    () => tutorials.filter(t => matchesTokens(t, ['title', 'description', 'body']) && inDate(t.createdAtMs)),
    [tutorials, qTokens, fromTs, toTs]
  );
  const qnsFiltered = useMemo(
    () => questions.filter(qn => matchesTokens(qn, ['title', 'description', 'body']) && inDate(qn.createdAtMs)),
    [questions, qTokens, fromTs, toTs]
  );

  const showArticles = type === 'all' || type === 'articles';
  const showTutorials = type === 'all' || type === 'tutorials';
  const showQuestions = type === 'all' || type === 'questions';

  const nothing =
    !loading && !err &&
    (!showArticles || artFiltered.length === 0) &&
    (!showTutorials || tutFiltered.length === 0) &&
    (!showQuestions || qnsFiltered.length === 0);

  const clearAll = () => { setQ(''); setType('all'); setFrom(''); setTo(''); };

  // Auth for "Post something"
  const [user, setUser] = useState(null);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  const navTimer = useRef(null);
  useEffect(() => () => { if (navTimer.current) clearTimeout(navTimer.current); }, []);
  const goPostWithToast = () => {
    if (user) {
      showToast('Yay! Opening the post page…', 'success', 1500);
      navTimer.current = setTimeout(() => nav('/post'), 1000);
    } else {
      showToast("You're not signed in yet. Let’s get you logged in…", 'error', 3200);
      navTimer.current = setTimeout(() => nav('/login', { state: { from: { pathname: '/post' } } }), 3000);
    }
  };

  // Deletion helpers
  async function deleteCollectionPaged(colRef, batchSize = 200) {
    // reuse fsQuery + fsLimit we already imported
    while (true) {
      const snap = await getDocs(fsQuery(colRef, fsLimit(batchSize)));
      if (snap.empty) break;
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    }
  }
  async function deleteArticle(id) {
    try { await deleteCollectionPaged(collection(db, 'articles', id, 'comments')); } catch (e) { console.warn('delete article comments failed', e); }
    try { await deleteCollectionPaged(collection(db, 'articles', id, 'ratings')); } catch (e) { console.warn('delete article ratings failed', e); }
    try { await deleteFolderRecursive(sref(storage, `articles/${id}`)); } catch (e) { console.warn('delete article storage failed', e); }
    await deleteDoc(doc(db, 'articles', id));
  }
  async function deleteTutorial(id) {
    try { await deleteCollectionPaged(collection(db, 'tutorials', id, 'comments')); } catch (e) { console.warn('delete tutorial comments failed', e); }
    try { await deleteCollectionPaged(collection(db, 'tutorials', id, 'ratings')); } catch (e) { console.warn('delete tutorial ratings failed', e); }
    try { await deleteFolderRecursive(sref(storage, `tutorials/${id}`)); } catch (e) { console.warn('delete tutorial storage failed', e); }
    await deleteDoc(doc(db, 'tutorials', id));
  }
  async function deleteQuestion(id) {
    try { await deleteCollectionPaged(collection(db, 'questions', id, 'answers')); } catch (e) { console.warn('delete question answers failed', e); }
    await deleteDoc(doc(db, 'questions', id));
  }

  async function doConfirmedDelete() {
    const { kind, id } = confirm;
    closeConfirm();
    if (!kind || !id) return;

    try {
      if (kind === 'article') setArticles(prev => prev.filter(x => x.id !== id));
      if (kind === 'tutorial') setTutorials(prev => prev.filter(x => x.id !== id));
      if (kind === 'question') setQuestions(prev => prev.filter(x => x.id !== id));

      if (kind === 'article') await deleteArticle(id);
      if (kind === 'tutorial') await deleteTutorial(id);
      if (kind === 'question') await deleteQuestion(id);

      showToast(`${kind[0].toUpperCase() + kind.slice(1)} deleted.`, 'success');
    } catch (e) {
      console.error('Delete failed', e);
      showToast('Failed to delete. Please try again.', 'error');
    }
  }

  // Per-section drag state (persisted)
  // Articles (grid)
  const savedArt = useMemo(() => readSaved(LS_ART_ORDER), []);
  const [artIds, setArtIds] = useState(() => makeInitialOrder(artFiltered, savedArt));
  useEffect(() => { setArtIds(makeInitialOrder(artFiltered, readSaved(LS_ART_ORDER))); }, [artFiltered]);
  const artById = useMemo(() => new Map(artFiltered.map(x => [x.id, x])), [artFiltered]);
  const onArtDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setArtIds(ids => {
      const from = ids.indexOf(active.id), to = ids.indexOf(over.id);
      if (from < 0 || to < 0) return ids;
      const next = arrayMove(ids, from, to);
      persistSaved(LS_ART_ORDER, next);
      return next;
    });
  };

  // Tutorials (grid; same as articles)
  const savedTut = useMemo(() => readSaved(LS_TUT_ORDER), []);
  const [tutIds, setTutIds] = useState(() => makeInitialOrder(tutFiltered, savedTut));
  useEffect(() => { setTutIds(makeInitialOrder(tutFiltered, readSaved(LS_TUT_ORDER))); }, [tutFiltered]);
  const tutById = useMemo(() => new Map(tutFiltered.map(x => [x.id, x])), [tutFiltered]);
  const onTutDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setTutIds(ids => {
      const from = ids.indexOf(active.id), to = ids.indexOf(over.id);
      if (from < 0 || to < 0) return ids;
      const next = arrayMove(ids, from, to);
      persistSaved(LS_TUT_ORDER, next);
      return next;
    });
  };

  // Questions (vertical list)
  const savedQns = useMemo(() => readSaved(LS_QNS_ORDER), []);
  const [qnsIds, setQnsIds] = useState(() => makeInitialOrder(qnsFiltered, savedQns));
  useEffect(() => { setQnsIds(makeInitialOrder(qnsFiltered, readSaved(LS_QNS_ORDER))); }, [qnsFiltered]);
  const qnsById = useMemo(() => new Map(qnsFiltered.map(x => [x.id, x])), [qnsFiltered]);
  const onQnsDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setQnsIds(ids => {
      const from = ids.indexOf(active.id), to = ids.indexOf(over.id);
      if (from < 0 || to < 0) return ids;
      const next = arrayMove(ids, from, to);
      persistSaved(LS_QNS_ORDER, next);
      return next;
    });
  };

  // UI
  return (
    <div className="container py-4 lobster-regular">
      <h3 className="mb-3">Search everything</h3>

      {/* Filters */}
      <div className="row g-2 align-items-end mb-3">
        <div className="col-md-5">
          <label className="form-label mb-1" htmlFor="q">Query</label>
          <input
            id="q"
            className="form-control"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search articles, tutorials, and questions…"
          />
        </div>

        <div className="col-md-3">
          <label className="form-label mb-1" htmlFor="cat">Category</label>
          <select id="cat" className="form-select" value={type} onChange={e => setType(e.target.value)}>
            <option value="all">All</option>
            <option value="articles">Articles</option>
            <option value="tutorials">Tutorials</option>
            <option value="questions">Questions</option>
          </select>
        </div>

        <div className="col-md-2">
          <label className="form-label mb-1" htmlFor="from">From</label>
          <input id="from" type="date" className="form-control" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="col-md-2">
          <label className="form-label mb-1" htmlFor="to">To</label>
          <input id="to" type="date" className="form-control" value={to} onChange={e => setTo(e.target.value)} />
        </div>

        <div className="col-12 d-flex gap-2">
          <button className="btn btn-outline-secondary" type="button" onClick={clearAll}>
            Clear filters
          </button>
        </div>
      </div>

      {/* States */}
      {err && <div className="alert alert-warning py-2">{err}</div>}
      {loading && <div className="text-muted mb-3">Loading…</div>}
      {!loading && !err && (!showArticles && !showTutorials && !showQuestions) && (
        <div className="alert alert-info">Pick a category to view results.</div>
      )}
      {(!loading && !err && nothing) && (
        <div className="alert alert-info">
          <div className="mb-1">No results{q ? <> for <strong>“{q}”</strong></> : ''}.</div>
          <div className="small text-muted">
            {from && <>From <strong>{from}</strong>{' '}</>}
            {to && <>to <strong>{to}</strong>{' '}</>}
            {type !== 'all' && <>in <strong>{type}</strong>{' '}</>}
          </div>
          <div className="mt-2 d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={clearAll}>Clear filters</button>
            {/* optional: add a Post button like your other page */}
          </div>
        </div>
      )}

      {/* Articles (grid, draggable, uses article sortable) */}
      {(showArticles && artFiltered.length > 0) && (
        <section className="mb-5">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h5 className="mb-0">Articles <span className="text-muted">({artFiltered.length})</span></h5>
            <Link
              to={`/articles/all?q=${encodeURIComponent(q)}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`}
              className="small"
            >
              See all
            </Link>
          </div>

          <DndContext sensors={sensorsIf(anyModalOpen)} collisionDetection={closestCenter} onDragEnd={onArtDragEnd}>
            <SortableContext items={artIds} strategy={rectSortingStrategy}>
              <div className="row g-3">
                {take(artIds, 6).map(id => {
                  const a = artById.get(id);
                  if (!a) return null;
                  return (
                    <div className="col-md-4" key={id}>
                      <SortableCardArticle
                        item={{ id }}
                        render={({ handleApi }) => (
                          <ArticleCard
                            data={{
                              id: a.id,
                              title: a.title,
                              description: a.description,
                              authorDisplay: a.authorDisplay,
                              rating: Number(a.rating || 0),
                              ratingCount: Number(a.ratingCount || 0),
                              image: a.display?.croppedURL || a.imageURL || '',
                            }}
                            dragHandleRef={anyModalOpen ? undefined : handleApi.ref}
                            dragHandleProps={anyModalOpen ? {} : handleApi.props}
                            isAdmin={isAdmin}
                            onModalOpenChange={setAnyModalOpen}
                            onDelete={() => openDeleteConfirm('article', a)}
                          />
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </section>
      )}

      {/* Tutorials (grid, draggable, uses article sortable as you said they match) */}
      {(showTutorials && tutFiltered.length > 0) && (
        <section className="mb-5">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h5 className="mb-0">Tutorials <span className="text-muted">({tutFiltered.length})</span></h5>
            <Link
              to={`/tutorials/all?q=${encodeURIComponent(q)}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`}
              className="small"
            >
              See all
            </Link>
          </div>

          <DndContext sensors={sensorsIf(anyModalOpen)} collisionDetection={closestCenter} onDragEnd={onTutDragEnd}>
            <SortableContext items={tutIds} strategy={rectSortingStrategy}>
              <div className="row g-3">
                {take(tutIds, 6).map(id => {
                  const t = tutById.get(id);
                  if (!t) return null;
                  return (
                    <div className="col-md-4" key={id}>
                      <SortableCardArticle
                        item={{ id }}
                        render={({ handleApi }) => (
                          <TutorialCard
                            data={{
                              id: t.id,
                              title: t.title,
                              description: t.description,
                              authorDisplay: t.authorDisplay,
                              rating: Number(t.rating || 0),
                              ratingCount: Number(t.ratingCount || 0),
                              image: t.display?.croppedURL || t.imageURL || '',
                            }}
                            dragHandleRef={anyModalOpen ? undefined : handleApi.ref}
                            dragHandleProps={anyModalOpen ? {} : handleApi.props}
                            isAdmin={isAdmin}
                            onModalOpenChange={setAnyModalOpen}
                            onDelete={() => openDeleteConfirm('tutorial', t)}
                          />
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </section>
      )}

      {/* Questions (list, draggable, uses question sortable) */}
      {(showQuestions && qnsFiltered.length > 0) && (
        <section className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h5 className="mb-0">Questions <span className="text-muted">({qnsFiltered.length})</span></h5>
            <Link
              to={`/questions/all?q=${encodeURIComponent(q)}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`}
              className="small"
            >
              See all
            </Link>
          </div>

          <DndContext sensors={sensorsIf(anyModalOpen)} collisionDetection={closestCenter} onDragEnd={onQnsDragEnd}>
            <SortableContext items={qnsIds} strategy={verticalListSortingStrategy}>
              <div className="d-flex flex-column gap-2">
                {take(qnsIds, 8).map(id => {
                  const qn = qnsById.get(id);
                  if (!qn) return null;
                  return (
                    <SortableCardQuestion
                      key={id}
                      item={{ id }}
                      render={({ handleApi }) => (
                        <QuestionsCard
                          data={{
                            id: qn.id,
                            title: qn.title,
                            description: qn.description,
                            tags: qn.tags || [],
                            views: Number(qn.views ?? qn.realViews ?? 0),
                            votes: Number(qn.votes ?? qn.realVotes ?? 0),
                            answersCount: Number(qn.answersCount ?? 0),
                            authorDisplay: qn.authorDisplay || qn.author || 'Anonymous',
                            timeAgo: qn.timeAgo || '',
                            status: qn.status || 'open',
                          }}
                          // no hidden/dismiss on search-all:
                          onDismiss={() => { }}
                          dragHandleRef={anyModalOpen ? undefined : handleApi.ref}
                          dragHandleProps={anyModalOpen ? {} : handleApi.props}
                          isAdmin={isAdmin}
                          onModalOpenChange={setAnyModalOpen}
                          onDelete={() => openDeleteConfirm('question', qn)}
                        />
                      )}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </section>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        detail={confirm.detail}
        onCancel={closeConfirm}
        onConfirm={doConfirmedDelete}
      />

      {/* Toast */}
      {toast && (
        <div
          className={`${styles.toastBase} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
