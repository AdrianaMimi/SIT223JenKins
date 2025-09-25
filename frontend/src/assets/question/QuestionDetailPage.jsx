import { useParams, Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { auth, db } from '../../firebase';
import {
  doc,
  onSnapshot,
  updateDoc,
  increment,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot as onSubSnapshot,
  runTransaction,
} from 'firebase/firestore';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";

export default function QuestionDetailPage() {
  const { id } = useParams(); // Firestore doc ID

  // ---------- Scroll to top ----------
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  // ---------- Admin flag ----------
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const u = auth.currentUser;
        if (!u) return mounted && setIsAdmin(false);
        const tok = await u.getIdTokenResult(true);
        mounted && setIsAdmin(!!tok.claims?.admin);
      } catch {
        mounted && setIsAdmin(false);
      }
    })();
    return () => { mounted = false; };
  }, [auth?.currentUser?.uid]);

  // ---------- Question doc subscription ----------
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(null);

  // Local admin baseline input for the question
  const [qSeedDraft, setQSeedDraft] = useState(0);

  useEffect(() => {
    if (!id) return;
    const ref = doc(db, 'questions', String(id));
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        const voters = d?.voters || {};
        const seed = Number(d?.seed || 0);
        const votes = Number(d?.votes ?? (seed + Object.keys(voters).length));
        const merged = d ? { id: snap.id, ...d, voters, seed, votes, _ref: ref } : null;
        setQ(merged);
        setQSeedDraft(seed);
        setLoading(false);
      },
      (err) => {
        console.error('Question snapshot error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [id]);

  // ---------- Increment views once per session ----------
  useEffect(() => {
    if (!q || !q._ref) return;
    const key = `viewed:question:${q.id}:session`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      updateDoc(q._ref, { views: increment(1) }).catch(() => { });
    }
  }, [q]);

  // ---------- Question vote (server-enforced toggle; votes = seed + votersCount) ----------
  const hasVotedQ = !!(auth?.currentUser && q?.voters && q.voters[auth.currentUser.uid]);

  const toggleQuestionVote = async () => {
    if (!q || !q._ref) return;
    const uid = auth?.currentUser?.uid;
    if (!uid) {
      alert('Log in to vote');
      return;
    }
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(q._ref);
        if (!snap.exists()) throw new Error('Question missing');
        const data = snap.data() || {};
        const voters = data.voters || {};
        const seed = Number(data.seed || 0);
        const hasVoted = !!voters[uid];

        const nextVoters = { ...voters };
        if (hasVoted) delete nextVoters[uid]; else nextVoters[uid] = true;

        const nextVotes = seed + Object.keys(nextVoters).length;
        tx.update(q._ref, { voters: nextVoters, votes: nextVotes });
      });
    } catch (e) {
      console.error('Question vote toggle failed:', e);
      alert('Vote failed. Please try again.');
    }
  };

  // ---------- Admin controls for QUESTION baseline ----------
  const setQuestionSeed = async (seedVal) => {
    if (!isAdmin || !q?._ref) return;
    const seed = Math.max(0, Number(seedVal) || 0);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(q._ref);
        if (!snap.exists()) throw new Error('Question missing');
        const data = snap.data() || {};
        const voters = data.voters || {};
        const nextVotes = seed + Object.keys(voters).length;
        tx.update(q._ref, { seed, votes: nextVotes });
      });
    } catch (e) {
      console.error('Set question baseline failed:', e);
      alert('Failed to set baseline.');
    }
  };

  const resetQuestionVoters = async () => {
    if (!isAdmin || !q?._ref) return;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(q._ref);
        if (!snap.exists()) throw new Error('Question missing');
        const seed = Number(snap.data()?.seed || 0);
        tx.update(q._ref, { voters: {}, votes: seed });
      });
    } catch (e) {
      console.error('Reset question voters failed:', e);
    }
  };

  const resetQuestionBaseline = async () => {
    if (!isAdmin || !q?._ref) return;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(q._ref);
        if (!snap.exists()) throw new Error('Question missing');
        const voters = snap.data()?.voters || {};
        const nextVotes = 0 + Object.keys(voters).length;
        tx.update(q._ref, { seed: 0, votes: nextVotes });
      });
      setQSeedDraft(0);
    } catch (e) {
      console.error('Reset question baseline failed:', e);
    }
  };

  // ---------- Answers live subscription ----------
  const [answers, setAnswers] = useState([]);
  // per-answer admin seed drafts
  const [ansSeedDraft, setAnsSeedDraft] = useState({}); // { [aid]: number }

  useEffect(() => {
    if (!q || !q._ref) return;
    const answersRef = collection(q._ref, 'answers');
    const unsub = onSubSnapshot(
      answersRef,
      (snap) => {
        const rows = snap.docs.map((d, i) => {
          const data = d.data() || {};
          const voters = data.voters || {};
          const seed = Number(data.seed || 0);
          const votes = Number(data.votes ?? (seed + Object.keys(voters).length));
          return {
            id: d.id,
            content: data.content || '',
            authorDisplay: data.authorDisplay || 'anonymous',
            authorUid: data.authorUid || null,
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
            votes,
            voters,
            seed,
            isAccepted: Boolean(data.isAccepted),
            _orig: i,
          };
        });
        setAnswers(rows);
        // initialize drafts when answers load/change
        setAnsSeedDraft((prev) => {
          const next = { ...prev };
          rows.forEach(r => { if (next[r.id] === undefined) next[r.id] = r.seed || 0; });
          return next;
        });
      },
      (err) => console.error('Answers snapshot error:', err)
    );
    return unsub;
  }, [q]);

  // ---------- Post answer ----------
  const [draft, setDraft] = useState('');

  const handlePost = async () => {
    const text = draft.trim();
    if (!text || !q) return;

    try {
      const user = auth?.currentUser || null;
      const answersRef = collection(db, 'questions', String(id), 'answers');
      await addDoc(answersRef, {
        content: text,
        authorDisplay:
          user?.displayName || user?.email || user?.phoneNumber || 'anonymous',
        authorUid: user?.uid || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        seed: 0,            // ← new: baseline per answer
        votes: 0,           // seed + votersCount
        voters: {},         // per-account toggles
        isAccepted: false,
      });

      await updateDoc(q._ref, {
        answersCount: increment(1),
        lastActivityAt: serverTimestamp(),
      });

      setDraft('');
    } catch (e) {
      console.error('Failed to post answer:', e);
      alert('Failed to post answer. Please try again.');
    }
  };

  // ---------- Answer voting (server toggle; votes = seed + votersCount) ----------
  const toggleAnswerVote = async (aid) => {
    if (!aid) return;
    const uid = auth?.currentUser?.uid;
    if (!uid) {
      alert('Log in to vote');
      return;
    }
    const ansRef = doc(db, 'questions', String(id), 'answers', String(aid));

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ansRef);
        if (!snap.exists()) throw new Error('Answer missing');
        const data = snap.data() || {};
        const voters = data.voters || {};
        const seed = Number(data.seed || 0);
        const hasVoted = !!voters[uid];

        const nextVoters = { ...voters };
        if (hasVoted) delete nextVoters[uid]; else nextVoters[uid] = true;

        const nextVotes = seed + Object.keys(nextVoters).length;
        tx.update(ansRef, { voters: nextVoters, votes: nextVotes });
      });
    } catch (e) {
      console.error('Answer vote toggle failed:', e);
      alert('Vote failed. Please try again.');
    }
  };

  // ---------- Admin controls for ANSWER baseline ----------
  const setAnswerSeed = async (aid, seedVal) => {
    if (!isAdmin) return;
    const ansRef = doc(db, 'questions', String(id), 'answers', String(aid));
    const seed = Math.max(0, Number(seedVal) || 0);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ansRef);
        if (!snap.exists()) throw new Error('Answer missing');
        const voters = snap.data()?.voters || {};
        const nextVotes = seed + Object.keys(voters).length;
        tx.update(ansRef, { seed, votes: nextVotes });
      });
      setAnsSeedDraft((m) => ({ ...m, [aid]: seed }));
    } catch (e) {
      console.error('Set answer baseline failed:', e);
    }
  };

  const resetAnswerVoters = async (aid) => {
    if (!isAdmin) return;
    const ansRef = doc(db, 'questions', String(id), 'answers', String(aid));
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ansRef);
        if (!snap.exists()) throw new Error('Answer missing');
        const seed = Number(snap.data()?.seed || 0);
        tx.update(ansRef, { voters: {}, votes: seed });
      });
    } catch (e) {
      console.error('Reset answer voters failed:', e);
    }
  };

  const resetAnswerBaseline = async (aid) => {
    if (!isAdmin) return;
    const ansRef = doc(db, 'questions', String(id), 'answers', String(aid));
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ansRef);
        if (!snap.exists()) throw new Error('Answer missing');
        const voters = snap.data()?.voters || {};
        const nextVotes = 0 + Object.keys(voters).length;
        tx.update(ansRef, { seed: 0, votes: nextVotes });
      });
      setAnsSeedDraft((m) => ({ ...m, [aid]: 0 }));
    } catch (e) {
      console.error('Reset answer baseline failed:', e);
    }
  };

  // ---------- Helpers ----------
  const fmt = (ts) => {
    try {
      if (!ts) return '';
      const d = ts.toDate ? ts.toDate() : ts;
      return d.toLocaleString();
    } catch {
      return '';
    }
  };

  // Derived values
  const answersCount = Number(q?.answersCount ?? answers.length ?? 0);
  const hasAccepted = answers.some((a) => a.isAccepted);

  const displayAnswers = useMemo(() => {
    const withIdx = answers.map((a, i) => ({ ...a, _idx: a._orig ?? i }));
    const byVotes = (a, b) =>
      (b.votes || 0) - (a.votes || 0) || (a._idx - b._idx);
    if (hasAccepted) {
      const acc = withIdx.filter((a) => a.isAccepted).sort(byVotes);
      const rest = withIdx.filter((a) => !a.isAccepted).sort(byVotes);
      return [...acc, ...rest];
    }
    return withIdx.sort(byVotes);
  }, [answers, hasAccepted]);

  // ✅ Early returns
  if (loading) {
    return (
      <div className="container py-4">
        <div className="alert alert-info">Loading…</div>
      </div>
    );
  }

  if (!q) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger">Question not found.</div>
        <Link to="/questions/all" className="btn btn-secondary">
          Back to Questions
        </Link>
      </div>
    );
  }

  const hasVotedQLive = !!(auth?.currentUser && q?.voters && q.voters[auth.currentUser.uid]);

  return (
    <div className="container py-4 lobster-regular">
      <Link to="/questions/all" className="btn btn-link mb-3">
        ← Back to all questions
      </Link>

      <div className="card p-3 mb-4">
        <h3>{q.title}</h3>
        <div className="prose max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {q.description}
          </ReactMarkdown>
        </div>

        <div className="mb-2">
          {(q.tags || []).map((t) => (
            <span key={t} className="badge bg-secondary me-1 lato-regular">
              {t}
            </span>
          ))}
        </div>

        <div className="d-flex gap-2 mb-2">
          {q.status && <span className="badge bg-info text-dark">{q.status}</span>}
          {q.visibility && (
            <span className="badge bg-light text-dark border">{q.visibility}</span>
          )}
        </div>

        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <small className="text-muted m-0">
            👁 {q.views || 0} views • {q.votes || 0} votes • asked by{' '}
            {q.authorDisplay || 'anonymous'} • {fmt(q.createdAt)}
          </small>

          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              onClick={toggleQuestionVote}
              className={`btn btn-sm d-inline-flex align-items-center gap-1 ${hasVotedQLive ? 'btn-primary' : 'btn-outline-primary'
                }`}
              aria-pressed={hasVotedQLive}
              aria-label={hasVotedQLive ? 'Unvote question' : 'Upvote question'}
              title={hasVotedQLive ? 'Click to remove your vote' : 'Click to upvote'}
              style={{ transition: 'transform 120ms ease, box-shadow 150ms ease' }}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'translateY(1px)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <span aria-hidden="true">{hasVotedQLive ? '▲' : '△'}</span>
              {hasVotedQLive ? 'Upvoted' : 'Upvote'} question
            </button>

            {/* Admin-only baseline controls for the QUESTION */}
            {isAdmin && (
              <>
                <input
                  type="number"
                  min="0"
                  className="form-control form-control-sm"
                  style={{ width: 110 }}
                  value={qSeedDraft}
                  onChange={(e) => setQSeedDraft(Math.max(0, Number(e.target.value) || 0))}
                  title="Baseline (seed) votes for the question"
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setQuestionSeed(qSeedDraft)}
                  title="Apply baseline"
                >
                  Set baseline
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-warning"
                  onClick={resetQuestionVoters}
                  title="Clear voters; keep baseline"
                >
                  Reset voters
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={resetQuestionBaseline}
                  title="Set baseline to zero; keep voters"
                >
                  Reset baseline
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="d-flex align-items-center gap-2 mb-2 fs-5">
        <h5 className="m-0">Answers ({answersCount})</h5>
        {hasAccepted && <span className="badge bg-success">Accepted</span>}
      </div>

      {displayAnswers.length === 0 ? (
        <p>No answers yet. Be the first to answer!</p>
      ) : (
        <ul className="list-group mb-4">
          {displayAnswers.map((ans) => {
            const voted = !!(auth?.currentUser && ans.voters && ans.voters[auth.currentUser.uid]);
            const acceptedBadge = ans.isAccepted;
            const draftSeed = ansSeedDraft[ans.id] ?? ans.seed ?? 0;

            return (
              <li
                key={ans.id}
                className={`list-group-item ${acceptedBadge ? 'border-success' : ''}`}
                style={acceptedBadge ? { background: 'rgba(25,135,84,0.08)' } : undefined}
              >
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    {acceptedBadge && (
                      <span className="badge bg-success me-2">Accepted</span>
                    )}
                    <strong>{ans.authorDisplay || 'anonymous'}</strong>
                    <div className="small text-muted">{fmt(ans.createdAt)}</div>
                  </div>

                  <div className="text-end">
                    <div
                      className={`small mb-1 ${voted ? 'text-primary fw-semibold' : 'text-muted'}`}
                      style={{ transition: 'color 120ms ease' }}
                    >
                      ↑ {ans.votes || 0}
                      {voted && (
                        <span className="badge bg-light text-primary border ms-1">
                          you
                        </span>
                      )}
                    </div>

                    <div className="d-flex align-items-center gap-2 justify-content-end">
                      <button
                        type="button"
                        className={`btn btn-sm d-inline-flex align-items-center gap-1 ${voted ? 'btn-primary' : 'btn-outline-primary'
                          }`}
                        onClick={() => toggleAnswerVote(ans.id)}
                        aria-pressed={voted}
                        aria-label={`${voted ? 'Unvote' : 'Upvote'} answer by ${ans.authorDisplay || 'anonymous'}`}
                        title={voted ? 'Click to remove your vote' : 'Click to upvote'}
                        style={{ transition: 'transform 120ms ease, box-shadow 150ms ease' }}
                        onMouseDown={(e) => (e.currentTarget.style.transform = 'translateY(1px)')}
                        onMouseUp={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                        onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                      >
                        <span aria-hidden="true">{voted ? '▲' : '△'}</span>
                        {voted ? 'Upvoted' : 'Upvote'}
                      </button>

                      {/* Admin-only baseline controls per ANSWER */}
                      {isAdmin && (
                        <>
                          <input
                            type="number"
                            min="0"
                            className="form-control form-control-sm"
                            style={{ width: 110 }}
                            value={draftSeed}
                            onChange={(e) =>
                              setAnsSeedDraft((m) => ({
                                ...m,
                                [ans.id]: Math.max(0, Number(e.target.value) || 0),
                              }))
                            }
                            title="Baseline (seed) votes for this answer"
                          />
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => setAnswerSeed(ans.id, draftSeed)}
                            title="Apply baseline"
                          >
                            Set baseline
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-warning"
                            onClick={() => resetAnswerVoters(ans.id)}
                            title="Clear voters; keep baseline"
                          >
                            Reset voters
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => resetAnswerBaseline(ans.id)}
                            title="Set baseline to zero; keep voters"
                          >
                            Reset baseline
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <p className="mb-0 mt-2">{ans.content}</p>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <h6>Your Answer</h6>
        <textarea
          className="form-control mb-2"
          rows={3}
          placeholder="Write your answer here..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          className="btn btn-primary"
          type="button"
          onClick={handlePost}
          disabled={!draft.trim()}
        >
          Post Answer
        </button>
      </div>
    </div>
  );
}
