import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../firebase';
import {
    doc, onSnapshot, runTransaction,
    collection, query, orderBy,
    addDoc, serverTimestamp, updateDoc, deleteDoc,
    getDocs
} from 'firebase/firestore';
import { useAuth } from '../loginregister/AuthContext';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const STAR_YELLOW = '#f5c518';
const STAR_GREY = '#d0d0d0';

function Star({ filled, onMouseEnter, onMouseLeave, onClick, disabled }) {
    return (
        <i
            className={`${filled ? 'fas' : 'far'} fa-star`}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onClick={disabled ? undefined : onClick}
            style={{
                color: filled ? STAR_YELLOW : STAR_GREY,
                cursor: disabled ? 'default' : 'pointer',
                fontSize: 26,
                marginRight: 6,
                transition: 'transform .08s ease, color .08s ease',
            }}
            aria-hidden="true"
        />
    );
}

export default function TutorialDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    // ----- admin flag -----
    const [isAdmin, setIsAdmin] = useState(false);
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                if (!user) return mounted && setIsAdmin(false);
                const tok = await user.getIdTokenResult(true);
                mounted && setIsAdmin(!!tok.claims?.admin);
            } catch {
                mounted && setIsAdmin(false);
            }
        })();
        return () => { mounted = false; };
    }, [user]);

    // ----- article main data -----
    const [docData, setDocData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [hoverStar, setHoverStar] = useState(0);
    const [myRating, setMyRating] = useState(null);
    const [avg, setAvg] = useState(0);
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!id) return;
        const ref = doc(db, 'tutorials', id);
        const unsub = onSnapshot(
            ref,
            (snap) => {
                if (snap.exists()) {
                    const d = snap.data();
                    setDocData({ id: snap.id, ...d });
                    setAvg(Number(d?.rating ?? 0));
                    setCount(Number(d?.ratingCount ?? 0));
                } else {
                    setDocData(null);
                }
                setLoading(false);
            },
            () => setLoading(false)
        );
        return () => unsub();
    }, [id]);

    const title = docData?.title || '';
    const description = docData?.description || '';
    const body = docData?.body || '';
    const author = docData?.authorDisplay || 'Anonymous';
    const createdAt = docData?.createdAt?.toDate ? docData.createdAt.toDate() : null;
    const bannerURL = docData?.banner?.croppedURL || null;

    // ----- rating (per-user; admin-seeded baseline) -----
    const canRate = !!user;
    const stars = useMemo(() => 5, []);
    const filledForIndex = (i) =>
        hoverStar > 0 ? i <= hoverStar : i <= (myRating || 0);

    // Admin seed UI
    const [seedAvgEdit, setSeedAvgEdit] = useState('');
    const [seedCountEdit, setSeedCountEdit] = useState('');

    useEffect(() => {
        const seedSum = Number(docData?.ratingSeedSum ?? 0);
        const seedCnt = Number(docData?.ratingSeedCount ?? 0);
        if (isAdmin) {
            setSeedAvgEdit(seedCnt > 0 ? String((seedSum / seedCnt).toFixed(2)) : '');
            setSeedCountEdit(seedCnt ? String(seedCnt) : '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin, docData?.ratingSeedSum, docData?.ratingSeedCount]);

    async function handleRate(value) {
        if (!user) return navigate('/login');
        const v = clamp(value, 1, 5);

        try {
            await runTransaction(db, async (tx) => {
                const tutRef = doc(db, 'tutorials', id);
                const myRef = doc(db, 'tutorials', id, 'ratings', user.uid);

                const [artSnap, mySnap] = await Promise.all([tx.get(tutRef), tx.get(myRef)]);
                const a = artSnap.exists() ? artSnap.data() : {};

                // Seed (admin) portion
                const seedSum = Number(a.ratingSeedSum ?? 0);
                const seedCnt = Number(a.ratingSeedCount ?? 0);

                // Derive user portion if legacy totals only
                const totalSum = Number(a.ratingSum ?? 0);
                const totalCnt = Number(a.ratingCount ?? 0);

                let userSum = a.ratingUserSum != null
                    ? Number(a.ratingUserSum)
                    : Math.max(0, totalSum - seedSum);
                let userCnt = a.ratingUserCount != null
                    ? Number(a.ratingUserCount)
                    : Math.max(0, totalCnt - seedCnt);

                // Previous user rating
                const prev = mySnap.exists() ? Number(mySnap.data().value || 0) : 0;

                // Update USER portion only
                userSum = userSum - (prev || 0) + v;
                if (!prev) userCnt = userCnt + 1;

                // Recompute totals
                const newTotalSum = seedSum + userSum;
                const newTotalCnt = seedCnt + userCnt;
                const newAvg = newTotalCnt > 0 ? Number((newTotalSum / newTotalCnt).toFixed(2)) : 0;

                tx.set(myRef, { value: v, updatedAt: new Date() }, { merge: true });
                tx.update(tutRef, {
                    ratingSeedSum: seedSum,
                    ratingSeedCount: seedCnt,
                    ratingUserSum: userSum,
                    ratingUserCount: userCnt,
                    ratingSum: newTotalSum,
                    ratingCount: newTotalCnt,
                    rating: newAvg,
                    updatedAt: new Date(),
                });
            });

            setMyRating(v); // optimistic
            setAvg(v);
        } catch (e) {
            console.error('rating failed', e);
            alert('Could not submit rating. Please try again.');
        }
    }

    async function handleAdminApplySeed() {
        if (!isAdmin) return;
        const avg = Math.max(0, Number(seedAvgEdit) || 0);
        const cnt = Math.max(0, Math.floor(Number(seedCountEdit) || 0));
        const seedSum = Math.round(avg * cnt);

        try {
            await runTransaction(db, async (tx) => {
                const tutRef = doc(db, 'tutorials', id);
                const snap = await tx.get(tutRef);
                if (!snap.exists()) throw new Error('article missing');
                const a = snap.data() || {};

                const curUserSum = a.ratingUserSum != null
                    ? Number(a.ratingUserSum)
                    : Math.max(0, Number(a.ratingSum || 0) - Number(a.ratingSeedSum || 0));
                const curUserCnt = a.ratingUserCount != null
                    ? Number(a.ratingUserCount)
                    : Math.max(0, Number(a.ratingCount || 0) - Number(a.ratingSeedCount || 0));

                const newTotalSum = seedSum + curUserSum;
                const newTotalCnt = cnt + curUserCnt;
                const newAvg = newTotalCnt > 0 ? Number((newTotalSum / newTotalCnt).toFixed(2)) : 0;

                tx.update(tutRef, {
                    ratingSeedSum: seedSum,
                    ratingSeedCount: cnt,
                    ratingUserSum: curUserSum,
                    ratingUserCount: curUserCnt,
                    ratingSum: newTotalSum,
                    ratingCount: newTotalCnt,
                    rating: newAvg,
                    updatedAt: new Date(),
                });
            });
        } catch (e) {
            console.error('apply seed failed', e);
            alert('Failed to apply seed.');
        }
    }

    // Reset seed (sets seed to 0; keeps user ratings)
    async function handleAdminResetSeed() {
        if (!isAdmin) return;
        try {
            await runTransaction(db, async (tx) => {
                const tutRef = doc(db, 'tutorials', id);
                const snap = await tx.get(tutRef);
                if (!snap.exists()) throw new Error('article missing');
                const a = snap.data() || {};

                const userSum = Number(a.ratingUserSum ?? Math.max(0, Number(a.ratingSum || 0) - Number(a.ratingSeedSum || 0)));
                const userCnt = Number(a.ratingUserCount ?? Math.max(0, Number(a.ratingCount || 0) - Number(a.ratingSeedCount || 0)));

                const newTotalSum = userSum;
                const newTotalCnt = userCnt;
                const newAvg = newTotalCnt > 0 ? Number((newTotalSum / newTotalCnt).toFixed(2)) : 0;

                tx.update(tutRef, {
                    ratingSeedSum: 0,
                    ratingSeedCount: 0,
                    ratingUserSum: userSum,
                    ratingUserCount: userCnt,
                    ratingSum: newTotalSum,
                    ratingCount: newTotalCnt,
                    rating: newAvg,
                    updatedAt: new Date(),
                });
            });
            setSeedAvgEdit('');
            setSeedCountEdit('');
        } catch (e) {
            console.error('reset seed failed', e);
            alert('Failed to reset seed.');
        }
    }

    // 🧨 Reset user ratings (count & sum) to zero AND delete ratings/{uid} docs
    async function handleAdminResetUserRatings() {
        if (!isAdmin) return;
        if (!window.confirm('Reset ALL user ratings for this article? This cannot be undone.')) return;

        try {
            // 1) delete all ratings docs so future votes behave correctly
            const ratingsSnap = await getDocs(collection(db, 'tutorials', id, 'ratings'));
            const deletions = ratingsSnap.docs.map((d) => deleteDoc(d.ref));
            await Promise.allSettled(deletions);

            // 2) set user portion to zero; totals = seed only
            await runTransaction(db, async (tx) => {
                const tutRef = doc(db, 'tutorials', id);
                const snap = await tx.get(tutRef);
                if (!snap.exists()) throw new Error('article missing');
                const a = snap.data() || {};
                const seedSum = Number(a.ratingSeedSum ?? 0);
                const seedCnt = Number(a.ratingSeedCount ?? 0);
                const newTotalSum = seedSum;
                const newTotalCnt = seedCnt;
                const newAvg = newTotalCnt > 0 ? Number((newTotalSum / newTotalCnt).toFixed(2)) : 0;

                tx.update(tutRef, {
                    ratingUserSum: 0,
                    ratingUserCount: 0,
                    ratingSum: newTotalSum,
                    ratingCount: newTotalCnt,
                    rating: newAvg,
                    updatedAt: new Date(),
                });
            });

            // If admin is the viewer, clear local highlight
            setMyRating(null);
        } catch (e) {
            console.error('reset user ratings failed', e);
            alert('Failed to reset user ratings.');
        }
    }

    // ----- comments (login required) -----
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [adminNick, setAdminNick] = useState('');
    const [adminSeedUpvotes, setAdminSeedUpvotes] = useState('');
    const [editSeed, setEditSeed] = useState({}); // per-comment baseline editor

    useEffect(() => {
        if (!id) return;
        const q = query(collection(db, 'tutorials', id, 'comments'), orderBy('createdAt', 'asc'));
        const unsub = onSnapshot(q, (snap) => {
            setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [id]);

    async function handleAddComment(e) {
        e.preventDefault();
        if (!user) return navigate('/login'); // must be logged in
        const text = newComment.trim();
        if (!text) return;

        const authorDisplay = isAdmin && adminNick.trim()
            ? adminNick.trim()
            : (user.displayName || (user.email ? user.email.split('@')[0] : 'User'));

        const seed = isAdmin ? clamp(parseInt(adminSeedUpvotes || '0', 10) || 0, 0, 1_000_000) : 0;

        try {
            await addDoc(collection(db, 'tutorials', id, 'comments'), {
                authorUid: user.uid,
                authorDisplay,
                text,
                seed,
                upvotes: seed,
                voters: {},
                createdAt: serverTimestamp(),
            });
            setNewComment('');
            setAdminNick('');
            setAdminSeedUpvotes('');
        } catch (e) {
            console.error('add comment failed', e);
            alert('Could not post comment.');
        }
    }

    async function handleToggleUpvote(commentId) {
        if (!user) return navigate('/login');
        try {
            await runTransaction(db, async (tx) => {
                const cref = doc(db, 'tutorials', id, 'comments', commentId);
                const snap = await tx.get(cref);
                if (!snap.exists()) throw new Error('Comment missing');

                const data = snap.data();
                const voters = data.voters || {};
                const seedVal = Number(data.seed || 0);
                const hasVoted = !!voters[user.uid];

                const nextVoters = { ...voters };
                if (hasVoted) delete nextVoters[user.uid];
                else nextVoters[user.uid] = true;

                const nextUpvotes = seedVal + Object.keys(nextVoters).length;
                tx.update(cref, { voters: nextVoters, upvotes: nextUpvotes });
            });
        } catch (e) {
            console.error('toggle upvote failed', e);
        }
    }

    async function handleAdminSetSeed(commentId, value) {
        if (!isAdmin) return;
        const seedVal = Math.max(0, Number(value) || 0);
        try {
            const cref = doc(db, 'tutorials', id, 'comments', commentId);
            await runTransaction(db, async (tx) => {
                const snap = await tx.get(cref);
                if (!snap.exists()) throw new Error('missing');
                const data = snap.data();
                const voters = data.voters || {};
                const nextUpvotes = seedVal + Object.keys(voters).length;
                tx.update(cref, { seed: seedVal, upvotes: nextUpvotes });
            });
            setEditSeed((m) => ({ ...m, [commentId]: seedVal }));
        } catch (e) {
            console.error('force set seed failed', e);
        }
    }

    async function handleAdminResetVoters(commentId) {
        if (!isAdmin) return;
        try {
            const cref = doc(db, 'tutorials', id, 'comments', commentId);
            await runTransaction(db, async (tx) => {
                const snap = await tx.get(cref);
                if (!snap.exists()) throw new Error('missing');
                const seedVal = Number(snap.data()?.seed || 0);
                tx.update(cref, { voters: {}, upvotes: seedVal });
            });
        } catch (e) {
            console.error('reset voters failed', e);
        }
    }

    async function handleAdminResetBaseline(commentId) {
        if (!isAdmin) return;
        try {
            const cref = doc(db, 'tutorials', id, 'comments', commentId);
            await runTransaction(db, async (tx) => {
                const snap = await tx.get(cref);
                if (!snap.exists()) throw new Error('missing');
                const voters = snap.data()?.voters || {};
                const votersCount = Object.keys(voters).length;
                tx.update(cref, { seed: 0, upvotes: votersCount });
            });
            setEditSeed((m) => ({ ...m, [commentId]: 0 }));
        } catch (e) {
            console.error('reset baseline failed', e);
        }
    }

    async function handleDelete(commentId) {
        if (!isAdmin) return;
        if (!window.confirm('Delete this comment?')) return;
        try {
            await deleteDoc(doc(db, 'tutorials', id, 'comments', commentId));
        } catch (e) {
            console.error('delete failed', e);
        }
    }

    if (loading) return <div className="container py-4 text-muted">Loading tutorial..</div>;
    if (!docData) return <div className="container py-4">Tutorial not found.</div>;

    return (
        <div className="container py-4">
            {/* Header */}
            <div className="mb-3">
                <h1 className="bigbig-text">{title}</h1>
                <div className="text-muted">
                    by <strong>{author}</strong>
                    {createdAt ? ` • ${createdAt.toLocaleDateString()}` : ''}
                </div>
            </div>

            {/* Hero banner */}
            {bannerURL && (
                <img
                    src={bannerURL}
                    alt={`${title} banner`}
                    style={{ width: '100%', maxHeight: 420, objectFit: 'cover', borderRadius: 12 }}
                    className="mb-3"
                />
            )}

            {/* Description / tags */}
            {description && <p className="lead">{description}</p>}
            {Array.isArray(docData?.tags) && docData.tags.length > 0 && (
                <div className="mb-3">
                    {docData.tags.map((t) => (
                        <span key={t} className="badge rounded-pill bg-light text-dark me-2 border">
                            {t}
                        </span>
                    ))}
                </div>
            )}

            {/* Rating block */}
            <div className="d-flex align-items-center mb-4">
                <div className="me-3 d-flex align-items-center">
                    <i
                        className={`${avg > 0 ? 'fas' : 'far'} fa-star`}
                        style={{ color: avg > 0 ? STAR_YELLOW : STAR_GREY, fontSize: 24, marginRight: 6 }}
                    />
                </div>

                <div className="me-3">
                    <strong>{Number(avg || 0).toFixed(1)}</strong>
                    {Number(count || 0) > 0 && <span className="ms-1 text-muted">({count})</span>}
                </div>

                <div
                    className="d-flex align-items-center"
                    onMouseLeave={() => setHoverStar(0)}
                    role="group"
                    aria-label="Rate this article"
                >
                    {Array.from({ length: stars }).map((_, idx) => {
                        const i = idx + 1;
                        return (
                            <Star
                                key={i}
                                filled={filledForIndex(i)}
                                onMouseEnter={() => setHoverStar(i)}
                                onMouseLeave={() => setHoverStar(0)}
                                onClick={() => handleRate(i)}
                                disabled={!canRate}
                            />
                        );
                    })}
                    {!canRate && <small className="ms-2 text-muted">Log in to rate</small>}
                </div>
            </div>

            {/* Admin: seed rating + reset tools */}
            {isAdmin && (
                <div className="card card-body mb-4" style={{ background: 'rgba(224,27,106,0.03)' }}>
                    <div className="fw-semibold mb-2">Admin: Ratings controls</div>
                    <div className="row g-2 align-items-end">
                        <div className="col-md-3">
                            <label className="form-label">Seed average (1–5)</label>
                            <input
                                type="number"
                                min="0" max="5" step="0.1"
                                className="form-control"
                                value={seedAvgEdit}
                                onChange={(e) => setSeedAvgEdit(e.target.value)}
                                placeholder="e.g. 4.6"
                            />
                        </div>
                        <div className="col-md-3">
                            <label className="form-label">Seed count</label>
                            <input
                                type="number"
                                min="0"
                                className="form-control"
                                value={seedCountEdit}
                                onChange={(e) => setSeedCountEdit(e.target.value)}
                                placeholder="e.g. 10"
                            />
                        </div>
                        <div className="col-md-6 d-flex flex-wrap gap-2">
                            <button type="button" className="btn btn-outline-primary" onClick={handleAdminApplySeed}>
                                Apply seed
                            </button>
                            <button type="button" className="btn btn-outline-dark" onClick={handleAdminResetSeed}>
                                Reset seed
                            </button>
                            <button type="button" className="btn btn-outline-danger" onClick={handleAdminResetUserRatings}>
                                Reset user ratings
                            </button>
                        </div>
                    </div>
                    <div className="form-text mt-2">
                        Totals are computed as <code>(ratingSeedSum + ratingUserSum) / (ratingSeedCount + ratingUserCount)</code>.
                    </div>
                </div>
            )}

            {/* Body */}
            <article
                className="mb-5"
                style={{ fontSize: '1.05rem' }}
            >
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                >
                    {body}
                </ReactMarkdown>
            </article>

            {/* Comments */}
            <section className="mb-5">
                <h5 className="mb-3">Comments</h5>

                {/* Create comment */}
                <form onSubmit={handleAddComment} className="mb-3">
                    {isAdmin && (
                        <div className="row g-2 mb-2">
                            <div className="col-6">
                                <input
                                    className="form-control"
                                    placeholder="Display Name (Optional)"
                                    value={adminNick}
                                    onChange={(e) => setAdminNick(e.target.value)}
                                />
                            </div>
                            <div className="col-6">
                                <input
                                    type="number"
                                    min="0"
                                    className="form-control"
                                    placeholder="Seed baseline (admin only)"
                                    value={adminSeedUpvotes}
                                    onChange={(e) => setAdminSeedUpvotes(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    <div className="d-flex gap-2">
                        <input
                            className="form-control"
                            placeholder={user ? 'Write a comment…' : 'Log in to comment'}
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            disabled={!user}
                        />
                        <button className="btn btn-primary" disabled={!user || !newComment.trim()}>
                            Post
                        </button>
                    </div>
                </form>

                {/* List */}
                {comments.length === 0 ? (
                    <div className="text-muted">No comments yet.</div>
                ) : (
                    <ul className="list-group">
                        {comments.map((c) => {
                            const voters = c.voters || {};
                            const hasVoted = !!(user && voters[user.uid]);
                            const seedVal = editSeed[c.id] ?? Number(c.seed ?? 0);

                            return (
                                <li key={c.id} className="list-group-item d-flex justify-content-between align-items-start">
                                    <div>
                                        <div className="fw-semibold">{c.authorDisplay || 'Unknown'}</div>
                                        <div>{c.text}</div>
                                        <div className="text-muted small">
                                            {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleString() : '—'}
                                        </div>
                                    </div>

                                    <div className="d-flex align-items-center gap-2">
                                        <button
                                            type="button"
                                            className={`btn btn-sm ${hasVoted ? 'btn-danger' : 'btn-outline-primary'}`}
                                            onClick={() => handleToggleUpvote(c.id)}
                                            disabled={!user}
                                            title={!user ? 'Log in to vote' : hasVoted ? 'Remove your upvote' : 'Upvote'}
                                        >
                                            {hasVoted ? '↩︎ Undo' : '👍 Upvote'} {c.upvotes ?? 0}
                                        </button>

                                        {isAdmin && (
                                            <>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="form-control form-control-sm"
                                                    style={{ width: 140 }}
                                                    value={seedVal}
                                                    onChange={(e) =>
                                                        setEditSeed((m) => ({ ...m, [c.id]: Math.max(0, Number(e.target.value) || 0) }))
                                                    }
                                                    title="Set baseline (seed)"
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-secondary"
                                                    onClick={() => handleAdminSetSeed(c.id, seedVal)}
                                                    title="Apply baseline"
                                                >
                                                    Set baseline
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-dark"
                                                    onClick={() => handleAdminResetBaseline(c.id)}
                                                    title="Set seed=0, keep voters"
                                                >
                                                    Reset baseline
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-warning"
                                                    onClick={() => handleAdminResetVoters(c.id)}
                                                    title="Clear voters map"
                                                >
                                                    Reset voters
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-danger"
                                                    onClick={() => handleDelete(c.id)}
                                                    title="Delete comment"
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}

