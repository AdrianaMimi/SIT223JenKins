import { useState, useEffect, useRef } from 'react';
import { auth, db, storage } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
    collection, addDoc, serverTimestamp, updateDoc, doc, deleteField, writeBatch,
} from 'firebase/firestore';
import {
    ref as sref, uploadBytesResumable, getDownloadURL, deleteObject,
} from 'firebase/storage';

import ImageProcessing from '../imageresize/imageprocessing';
import DisplayModal from '../imageresize/imageresizedisplay';
import BannerModal from '../imageresize/imageresizebanner';
import PostQuestionEditor from '../question/PostQuestionEditor';

const toSlug = (s) =>
    s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');

function extFromType(t = '') {
    if (t.includes('png')) return 'png';
    if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
    return 'webp';
}

function tokenize(s = '') {
    return Array.from(
        new Set(
            s
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length >= 2 && w.length <= 24)
                .slice(0, 50)
        )
    );
}

export default function TutorialForm({ onSuccess, onError }) {
    const [hovered, setHovered] = useState(false);
    const [title, setTitle] = useState('');
    const [summary, setSummary] = useState('');
    const [body, setBody] = useState('');
    const [tags, setTags] = useState('');
    const [visibility, setVisibility] = useState('draft');

    const displayRef = useRef(null);
    const bannerRef = useRef(null);

    const [isAdmin, setIsAdmin] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);
            if (!user) return setIsAdmin(false);
            try {
                const t = await user.getIdTokenResult(true);
                setIsAdmin(!!t.claims?.admin);
            } catch {
                setIsAdmin(false);
            }
        });
        return () => unsub();
    }, []);

    // ----- ADMIN FIELDS -----
    const [adminAuthorDisplay, setAdminAuthorDisplay] = useState('');
    const [seedAvg, setSeedAvg] = useState('');     // e.g. "4.6"
    const [seedCount, setSeedCount] = useState(''); // e.g. "10"
    // Seed comments: one per line: "Author Name|This is a comment|12"
    const [seedComments, setSeedComments] = useState('');

    // image state
    const [displayImage, setDisplayImage] = useState(null);
    const [bannerImage, setBannerImage] = useState(null);

    const [imgError, setImgError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [uploadPct, setUploadPct] = useState(0);

    const handleImgError = (msg) => {
        setImgError(msg || '');
        if (msg) onError?.(msg);
    };

    const norm = (v) => ({ cropped: v?.edited ?? null });

    const bump = (snap) => {
        if (!snap?.totalBytes) return;
        setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
    };

    async function replaceCropped({ docId, which, file, oldPath }) {
        if (!file) return null;
        if (oldPath) {
            try { await deleteObject(sref(storage, oldPath)); } catch { /* ignore */ }
        }
        const ext = extFromType(file.type || '');
        const name = `${which}_cropped_${Date.now()}.${ext}`;
        const path = `tutorials/${docId}/${name}`;
        const r = sref(storage, path);
        const task = uploadBytesResumable(r, file, { contentType: file.type || 'image/webp' });
        await new Promise((resolve, reject) => {
            task.on('state_changed', bump, reject, resolve);
        });
        const url = await getDownloadURL(r);
        return { path, url };
    }

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!title.trim() || !summary.trim() || !body.trim()) {
            onError?.('Fill in title, summary, and body ✍️');
            return;
        }

        const d = norm(displayImage);
        const b = norm(bannerImage);
        if (!d.cropped) {
            onError?.('Please add a Display Image (JPEG/PNG/WebP) and crop it.');
            return;
        }

        try {
            setSubmitting(true);
            setUploadPct(0);

            const autoDisplay =
                currentUser?.displayName ||
                (currentUser?.email ? currentUser.email.split('@')[0] : '') ||
                'Anonymous';

            // ⭐ rating seed (partitioned like ArticleForm)
            let seedSum = 0;
            let seedCnt = 0;
            if (isAdmin) {
                const avg = parseFloat(seedAvg || '');
                const cnt = parseInt(seedCount || '', 10);
                if (!Number.isNaN(avg) && !Number.isNaN(cnt) && cnt >= 0 && avg >= 0 && avg <= 5) {
                    seedSum = Math.round(avg * cnt);
                    seedCnt = cnt;
                }
            }

            const slug = toSlug(title);
            const tagArr = tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3);
            const colRef = collection(db, 'tutorials');
            const title_lc = title.trim().toLowerCase();
            const searchTokens = tokenize([title, summary, tags].join(' '));

            const initialAvg = seedCnt > 0 ? Number((seedSum / seedCnt).toFixed(2)) : 0;

            // 1) Create tutorial doc
            const docRef = await addDoc(colRef, {
                title: title.trim(),
                description: summary.trim(),
                body,
                tags: tagArr,
                slug,
                visibility,

                authorUid: currentUser?.uid ?? null,
                authorDisplay: (isAdmin && adminAuthorDisplay.trim())
                    ? adminAuthorDisplay.trim() : autoDisplay,

                // Partitioned ratings
                ratingSeedSum: seedSum,
                ratingSeedCount: seedCnt,
                ratingUserSum: 0,
                ratingUserCount: 0,

                // Legacy totals (so old UIs keep working)
                ratingSum: seedSum,
                ratingCount: seedCnt,
                rating: initialAvg,

                title_lc,
                searchTokens,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            // scrub rogue 'status'
            await updateDoc(doc(db, 'tutorials', docRef.id), { status: deleteField() });

            // 2) Upload images
            const displayRes = await replaceCropped({ docId: docRef.id, which: 'display', file: d.cropped });
            let bannerRes = null;
            if (b.cropped) {
                bannerRes = await replaceCropped({ docId: docRef.id, which: 'banner', file: b.cropped });
            }

            // 3) Save image fields
            await updateDoc(doc(db, 'tutorials', docRef.id), {
                imagePath: displayRes.path,
                imageURL: displayRes.url,
                display: { croppedPath: displayRes.path, croppedURL: displayRes.url },
                banner: {
                    croppedPath: bannerRes?.path ?? null,
                    croppedURL: bannerRes?.url ?? null,
                },
                updatedAt: serverTimestamp(),
                status: deleteField(),
            });

            // 4) (Admin only) seed comments with baseline + voters map
            if (isAdmin && seedComments.trim()) {
                const lines = seedComments
                    .split('\n')
                    .map(l => l.trim())
                    .filter(Boolean)
                    .slice(0, 100); // safety cap

                if (lines.length) {
                    const batch = writeBatch(db);
                    const commentsCol = collection(db, 'tutorials', docRef.id, 'comments');

                    for (const line of lines) {
                        // Format: "Author Name|This is a comment|12"
                        const parts = line.split('|');
                        const authorRaw = (parts[0] ?? '').trim();
                        const text =
                            parts.length >= 2 ? String(parts[1]).trim()
                                : (parts.length === 1 ? String(parts[0]).trim() : '');
                        if (!text) continue;
                        const seedUp = parts.length >= 3 ? Math.max(0, parseInt(parts[2], 10) || 0) : 0;

                        const authorDisplaySeed = authorRaw || (adminAuthorDisplay.trim() || 'Admin');

                        const cRef = doc(commentsCol);
                        batch.set(cRef, {
                            authorUid: currentUser?.uid ?? null,
                            authorDisplay: authorDisplaySeed,
                            text,
                            seed: seedUp,          // baseline
                            upvotes: seedUp,       // seed + 0 voters now
                            voters: {},            // for one-vote-per-user toggles
                            createdAt: serverTimestamp(),
                        });
                    }

                    await batch.commit();
                }
            }

            // 5) Reset UI
            setTitle(''); setSummary(''); setBody(''); setTags('');
            setVisibility('draft');
            setImgError(''); setUploadPct(0);
            setDisplayImage(null); setBannerImage(null);
            setAdminAuthorDisplay(''); setSeedAvg(''); setSeedCount('');
            setSeedComments('');
            displayRef.current?.reset(); bannerRef.current?.reset();

            onSuccess?.('Tutorial saved!');
        } catch (err) {
            console.error('submit failed:', err?.code, err?.message, err);
            onError?.(`Oops! ${err?.message || 'Failed to save tutorial.'} 🥺`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <p className="small text-muted mb-2">
                {isAdmin && <span>You are an Admin ✅</span>}
            </p>

            {/* ----- ADMIN-ONLY BLOCK ----- */}
            {isAdmin && (
                <div className="mb-3 border rounded p-3" style={{ background: 'rgba(224,27,106,0.03)' }}>
                    <div className="mb-2 fw-semibold">Admin options</div>

                    <div className="mb-2">
                        <label className="form-label">Author display name (override)</label>
                        <input
                            className="form-control lobster-regular"
                            value={adminAuthorDisplay}
                            onChange={(e) => setAdminAuthorDisplay(e.target.value)}
                            placeholder="e.g. Tech Owl"
                        />
                        <div className="form-text">
                            If set, saved to <code>authorDisplay</code>.
                        </div>
                    </div>

                    <div className="row g-2">
                        <div className="col-6">
                            <label className="form-label">Seed rating avg (0–5)</label>
                            <input
                                type="number" step="0.1" min="0" max="5"
                                className="form-control lobster-regular"
                                value={seedAvg}
                                onChange={(e) => setSeedAvg(e.target.value)}
                                placeholder="4.6"
                            />
                        </div>
                        <div className="col-6">
                            <label className="form-label">Seed rating count</label>
                            <input
                                type="number" min="0"
                                className="form-control lobster-regular"
                                value={seedCount}
                                onChange={(e) => setSeedCount(e.target.value)}
                                placeholder="10"
                            />
                        </div>
                    </div>
                    <div className="form-text">
                        Initializes rating baseline via <code>ratingSeedSum</code> & <code>ratingSeedCount</code>.
                    </div>

                    <div className="mt-3">
                        <label className="form-label">Seed comments (one per line)</label>
                        <textarea
                            className="form-control lobster-regular"
                            rows={4}
                            value={seedComments}
                            onChange={(e) => setSeedComments(e.target.value)}
                            placeholder={`Author Name|This is a comment|12
Another Author|Great tutorial!|3
Just a comment line (defaults to author "Admin" and 0 upvotes)`}
                        />
                        <div className="form-text">
                            Format: <code>Author|Comment text|upvotes</code>. Author & upvotes optional.
                        </div>
                    </div>
                </div>
            )}

            {/* Visibility */}
            <div className="mb-3">
                <label className="form-label">Visibility</label>
                <select
                    className="form-select lobster-regular"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                >
                    <option value="draft">Draft</option>
                    <option value="public">Publish</option>
                </select>
            </div>

            {/* Title */}
            <div className="mb-3">
                <label>Title</label>
                <input
                    type="text" className="form-control"
                    value={title} onChange={(e) => setTitle(e.target.value)}
                />
            </div>

            {/* Display image (required) */}
            <ImageProcessing
                ref={displayRef}
                label="Display Image"
                inputId="tutorial-display-image"
                ModalComponent={DisplayModal}
                onFileSelected={setDisplayImage}
                onError={handleImgError}
                placeholderText="No file selected. Please upload a JPEG/JPG, PNG, or WebP image only"
            />

            {/* Banner image (optional) */}
            <ImageProcessing
                ref={bannerRef}
                label="Banner Image"
                inputId="tutorial-banner-image"
                ModalComponent={BannerModal}
                onFileSelected={setBannerImage}
                onError={handleImgError}
                placeholderText="Optional banner. JPEG/JPG, PNG, or WebP"
            />

            {imgError && <div className="alert alert-warning py-2 small mt-2">{imgError}</div>}

            {/* Summary */}
            <div className="mb-3">
                <label>Summary</label>
                <textarea
                    className="form-control" rows="2"
                    value={summary} onChange={(e) => setSummary(e.target.value)}
                />
            </div>

            {/* Body */}
            <div className="mb-3">
                <label>Body</label>
            </div>
            <PostQuestionEditor
                value={body}
                onChange={setBody}
            />

            {/* Tags */}
            <div className="mb-3">
                <label>Tags</label>
                <input
                    type="text" className="form-control"
                    value={tags} onChange={(e) => setTags(e.target.value)}
                    placeholder="Comma-separated"
                />
            </div>

            {submitting && <div className="small mb-2">Uploading images… {uploadPct}%</div>}

            <button
                className={`btn btn-alice ${hovered ? 'shadow' : ''}`}
                type="submit"
                disabled={submitting || !currentUser}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                {submitting ? 'Saving…' : 'Save Tutorial'}
            </button>

            {!currentUser && <div className="small text-muted mt-2">Sign in to publish.</div>}
        </form>
    );
}
