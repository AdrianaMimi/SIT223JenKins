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

export default function ArticleForm({ onSuccess, onError }) {
    const [hovered, setHovered] = useState(false);
    const [title, setTitle] = useState('');
    const [summary, setSummary] = useState('');
    const [body, setBody] = useState('');
    const [tags, setTags] = useState('');

    // visibility only: "draft" | "public"
    const [visibility, setVisibility] = useState('draft');

    // image picker refs for reset()
    const displayRef = useRef(null);
    const bannerRef = useRef(null);

    // auth / admin
    const [isAdmin, setIsAdmin] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);
            if (!user) {
                setIsAdmin(false);
                return;
            }
            try {
                const t = await user.getIdTokenResult(true);
                setIsAdmin(!!t.claims?.admin);
            } catch (e) {
                console.error('Token claims error:', e);
                setIsAdmin(false);
            }
        });
        return () => unsub();
    }, []);

    // ----- ADMIN FIELDS -----
    const [adminAuthorDisplay, setAdminAuthorDisplay] = useState('');
    const [seedAvg, setSeedAvg] = useState('');     // e.g. "4.6"
    const [seedCount, setSeedCount] = useState(''); // e.g. "10"
    const [seedComments, setSeedComments] = useState('');

    // image picker state
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

    // upload/replace a cropped file
    async function replaceCropped({ docId, which, file, oldPath }) {
        if (!file) return null;

        if (oldPath) {
            try {
                await deleteObject(sref(storage, oldPath));
            } catch (e) {
                if (e?.code !== 'storage/object-not-found') console.warn('deleteObject:', e);
            }
        }

        const ext = extFromType(file.type || '');
        const name = `${which}_cropped_${Date.now()}.${ext}`;
        const path = `articles/${docId}/${name}`;
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

            // ----- compute admin rating seed -----
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

            // 1) Create the article doc first (with seed/user rating partitions + visibility)
            const slug = toSlug(title);
            const tagArr = tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3);
            const colRef = collection(db, 'articles');
            const title_lc = title.trim().toLowerCase();
            const searchTokens = tokenize([title, summary, tags].join(' '));

            const avgAll = (seedCnt > 0) ? Number((seedSum / seedCnt).toFixed(2)) : 0;

            const docRef = await addDoc(colRef, {
                title: title.trim(),
                description: summary.trim(),
                body,
                tags: tagArr,
                slug,
                visibility, 
                // Author identity:
                authorUid: currentUser?.uid ?? null,
                authorDisplay: (isAdmin && adminAuthorDisplay.trim())
                    ? adminAuthorDisplay.trim()
                    : autoDisplay,

                // ⭐ ratings
                ratingSeedSum: seedSum,
                ratingSeedCount: seedCnt,
                ratingUserSum: 0,
                ratingUserCount: 0,

                ratingSum: seedSum,          
                ratingCount: seedCnt,
                rating: avgAll,

                title_lc,
                searchTokens,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            // scrub stray 'status'
            try {
                await updateDoc(doc(db, 'articles', docRef.id), { status: deleteField() });
            } catch {
            }

            // 2) Upload cropped images
            const displayRes = await replaceCropped({
                docId: docRef.id,
                which: 'display',
                file: d.cropped,
                oldPath: null,
            });

            let bannerRes = null;
            if (b.cropped) {
                bannerRes = await replaceCropped({
                    docId: docRef.id,
                    which: 'banner',
                    file: b.cropped,
                    oldPath: null,
                });
            }

            // 3) Finalize doc (+ scrub again)
            await updateDoc(doc(db, 'articles', docRef.id), {
                imagePath: displayRes.path, 
                imageURL: displayRes.url,  
                display: {
                    croppedPath: displayRes.path,
                    croppedURL: displayRes.url,
                },
                banner: {
                    croppedPath: bannerRes?.path ?? null,
                    croppedURL: bannerRes?.url ?? null,
                },
                updatedAt: serverTimestamp(),
                status: deleteField(),
            });

            // 4) (Admin only) Seed comments batch
            let seededCount = 0;
            if (isAdmin && seedComments.trim()) {
                const lines = seedComments.split('\n')
                    .map(l => l.trim())
                    .filter(Boolean)
                    .slice(0, 100);

                if (lines.length) {
                    const batch = writeBatch(db);
                    const commentsCol = collection(db, 'articles', docRef.id, 'comments');

                    for (const line of lines) {
                        // Format: Author|Comment text|upvotes
                        const parts = line.split('|');
                        const author = (parts[0] && parts.length >= 3) ? String(parts[0]).trim() : null;
                        const text = (parts.length >= 2) ? String(parts[1]).trim()
                            : (parts.length === 1 ? String(parts[0]).trim() : '');
                        const upvotes = (parts.length >= 3) ? Math.max(0, parseInt(parts[2], 10) || 0) : 0;

                        if (!text) continue;

                        const commentRef = doc(commentsCol); // auto-id
                        batch.set(commentRef, {
                            authorUid: currentUser?.uid ?? null, // stored as creator uid
                            authorDisplay: author || (adminAuthorDisplay.trim() || 'Admin'),
                            text,
                            seed: upvotes,            // baseline (admin)
                            upvotes: upvotes,         // seed + 0 voters now
                            voters: {},               // one-vote-per-user lives here
                            createdAt: serverTimestamp(),
                        });
                        seededCount++;
                    }

                    await batch.commit();
                }
            }

            setTitle('');
            setSummary('');
            setBody('');
            setTags('');
            setVisibility('draft');
            setImgError('');
            setUploadPct(0);
            setDisplayImage(null);
            setBannerImage(null);
            setAdminAuthorDisplay('');
            setSeedAvg('');
            setSeedCount('');
            setSeedComments('');
            displayRef.current?.reset();
            bannerRef.current?.reset();

            onSuccess?.(
                seededCount > 0
                    ? `Article saved! Seeded ${seededCount} comment${seededCount === 1 ? '' : 's'}.`
                    : 'Article saved!'
            );
        } catch (err) {
            console.error('submit failed:', err?.code, err?.message, err);
            onError?.(`Oops! ${err?.message || 'Failed to save article.'} 🥺`);
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
                                type="number"
                                step="0.1"
                                min="0"
                                max="5"
                                className="form-control lobster-regular"
                                value={seedAvg}
                                onChange={(e) => setSeedAvg(e.target.value)}
                                placeholder="4.6"
                            />
                        </div>
                        <div className="col-6">
                            <label className="form-label">Seed rating count</label>
                            <input
                                type="number"
                                min="0"
                                className="form-control lobster-regular"
                                value={seedCount}
                                onChange={(e) => setSeedCount(e.target.value)}
                                placeholder="10"
                            />
                        </div>
                    </div>

                    <div className="form-text mb-2">
                        Initializes rating baseline via <code>ratingSeedSum</code> & <code>ratingSeedCount</code>.
                    </div>

                    <label className="form-label">Seed comments (one per line)</label>
                    <textarea
                        className="form-control lobster-regular"
                        rows={4}
                        value={seedComments}
                        onChange={(e) => setSeedComments(e.target.value)}
                        placeholder={`Author Name|This is a comment|12
Just a comment line (defaults to author "Admin" and 0 upvotes)`}
                    />
                    <div className="form-text">
                        Format: <code>Author|Comment text|upvotes</code>. Author & upvotes are optional. One comment per line.
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
                <div className="form-text">Draft keeps it hidden. Publish makes it visible.</div>
            </div>

            <div className="mb-3 deep-rose fs-5">
                <label htmlFor="article-title">Title</label>
                <input
                    type="text"
                    className="form-control"
                    id="article-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter a clear, engaging article title"
                />
            </div>

            {/* Display image (required) */}
            <ImageProcessing
                ref={displayRef}
                label="Display Image"
                inputId="article-display-image"
                ModalComponent={DisplayModal}
                onFileSelected={setDisplayImage}
                onError={handleImgError}
                placeholderText="No file selected. Please upload a JPEG/JPG, PNG, or WebP image only"
            />

            {/* Banner image (optional) */}
            <ImageProcessing
                ref={bannerRef}
                label="Banner Image"
                inputId="article-banner-image"
                ModalComponent={BannerModal}
                onFileSelected={setBannerImage}
                onError={handleImgError}
                placeholderText="Optional banner. JPEG/JPG, PNG, or WebP"
            />

            {imgError && (
                <div className="alert alert-warning py-2 small mt-2">{imgError}</div>
            )}

            <div className="mb-3 deep-rose fs-5">
                <label htmlFor="article-abstract">Summary</label>
                <textarea
                    className="form-control"
                    id="article-abstract"
                    rows="2"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Short blurb for the card"
                />
            </div>

            <div className="mb-3 deep-rose fs-5">
                <label htmlFor="article-text">Body</label>
            </div>
            <PostQuestionEditor
                value={body}
                onChange={setBody}
            />

            <div className="mb-3 color-deep-mint fs-5">
                <label htmlFor="article-tags">Tags</label>
                <input
                    type="text"
                    className="form-control"
                    id="article-tags"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="Up to 3 comma-separated tags"
                />
            </div>

            {submitting && (
                <div className="small mb-2">Uploading images… {uploadPct}%</div>
            )}

            <button
                className={`btn btn-alice ${hovered ? 'shadow' : ''}`}
                type="submit"
                disabled={submitting || !currentUser}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                {submitting ? 'Saving…' : 'Save Article'}
            </button>

            {!currentUser && (
                <div className="small text-muted mt-2">Sign in to publish.</div>
            )}
        </form>
    );
}
