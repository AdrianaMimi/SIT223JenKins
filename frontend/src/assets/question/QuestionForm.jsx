import { useEffect, useRef, useState } from 'react';
import { auth, db } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, serverTimestamp, writeBatch, doc, increment
} from 'firebase/firestore';
import PostQuestionEditor from './PostQuestionEditor';


// ---------- helpers ----------
function tokenize(s = '') {
  return Array.from(
    new Set(
      s.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2 && w.length <= 24)
        .slice(0, 50)
    )
  );
}

function parseTags(raw) {
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 3);
}

// Seed answers parser: one per line (or separated with ---).
// Optional flags: "|| author=Name", "|| votes=3", "|| accepted"
// NOTE: "votes" here will be used as the baseline seed for the answer.
function parseSeedAnswers(raw) {
  if (!raw?.trim()) return [];
  const chunks = raw
    .split(/\n---+\n|---+$|^\s*---+\s*$|\n/g)
    .map((s) => s.trim())
    .filter(Boolean);

  return chunks
    .map((line) => {
      const parts = line.split('||').map((p) => p.trim());
      const content = parts[0] || '';
      let authorDisplay = '';
      let seed = 0;         // <-- treat provided "votes" as seed/baseline
      let isAccepted = false;

      for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        if (/^author=/i.test(p)) authorDisplay = p.split('=').slice(1).join('=').trim();
        else if (/^votes=/i.test(p)) seed = parseInt(p.split('=').slice(1).join('=').trim(), 10) || 0;
        else if (/^accepted$/i.test(p)) isAccepted = true;
      }
      return { content, authorDisplay, seed, isAccepted };
    })
    .filter((a) => a.content.length >= 2);
}

// ---------- component ----------
export default function QuestionForm({ onSuccess, onError }) {
  const [hovered, setHovered] = useState(false);

  // fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');

  // visibility like ArticleForm: "draft" | "public"
  const [visibility, setVisibility] = useState('draft');

  // field-level errors for normal users (auto-hide)
  const [fieldErrs, setFieldErrs] = useState({ title: '', description: '', tags: '' });
  const [showFieldErrs, setShowFieldErrs] = useState(false);
  const fieldTimerRef = useRef(null);

  // auth/admin
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // admin-only
  const [adminAuthorDisplay, setAdminAuthorDisplay] = useState('');
  const [adminStatus, setAdminStatus] = useState('open'); // "open" | "answered" | "closed"
  const [adminViews, setAdminViews] = useState('');       // initial views
  const [adminSeed, setAdminSeed] = useState('');         // <-- initial baseline seed for the QUESTION
  const [adminSeedAnswersRaw, setAdminSeedAnswersRaw] = useState('');

  // admin issues (inline, auto-hide)
  const [adminIssues, setAdminIssues] = useState([]);
  const [adminIssuesVisible, setAdminIssuesVisible] = useState(false);
  const adminTimerRef = useRef(null);

  // UX
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user || null);
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

  useEffect(() => {
    return () => {
      if (adminTimerRef.current) clearTimeout(adminTimerRef.current);
      if (fieldTimerRef.current) clearTimeout(fieldTimerRef.current);
    };
  }, []);

  // ----- validation split -----

  // General fields used by everyone
  function validatePublicForSubmit() {
    const errs = { title: '', description: '', tags: '' };
    const titleTrim = title.trim();
    const descTrim = description.trim();
    const tagArr = parseTags(tags);

    if (titleTrim.length < 8) errs.title = 'Title must be ≥ 8 characters.';
    if (descTrim.length < 20) errs.description = 'Details must be ≥ 20 characters.';
    if (tagArr.length === 0) errs.tags = 'Add at least one tag.';
    if (tagArr.length > 3) errs.tags = 'Max 3 tags.';

    setFieldErrs(errs);

    const has = Object.values(errs).some(Boolean);
    if (has) {
      setShowFieldErrs(true);
      if (fieldTimerRef.current) clearTimeout(fieldTimerRef.current);
      fieldTimerRef.current = setTimeout(() => setShowFieldErrs(false), 5000);
      onError?.('Fill in title, details, and at least one tag.');
      return false;
    }
    setShowFieldErrs(false);
    return true;
  }

  // Admin-only checks (run when clicking Validate in the admin box)
  function validateAdminOnly() {
    const errs = [];
    if (adminViews && Number.isNaN(parseInt(adminViews, 10)))
      errs.push('Initial views must be a number.');
    if (adminSeed && Number.isNaN(parseInt(adminSeed, 10)))
      errs.push('Initial baseline (seed) must be a number.');

    if (adminSeedAnswersRaw) {
      const parsed = parseSeedAnswers(adminSeedAnswersRaw);
      if (parsed.length === 0) errs.push('Seed answers format looks invalid.');
      if (parsed.length > 20) errs.push('Please keep seed answers ≤ 20.');
      // ensure at most one accepted in seeds
      const acc = parsed.filter((x) => x.isAccepted).length;
      if (acc > 1) errs.push('Only one seed answer can be marked "accepted".');
    }
    setAdminIssues(errs);
    setAdminIssuesVisible(true);

    // auto-hide after 5s
    if (adminTimerRef.current) clearTimeout(adminTimerRef.current);
    adminTimerRef.current = setTimeout(() => setAdminIssuesVisible(false), 5000);

    return errs.length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!currentUser) return onError?.('Please sign in to post.');

    // hard-stop on normal field errors
    if (!validatePublicForSubmit()) return;

    try {
      setSubmitting(true);

      const titleTrim = title.trim();
      const descTrim = description.trim();
      const tagArr = parseTags(tags);

      const autoDisplay =
        (currentUser.displayName ||
          (currentUser.email ? currentUser.email.split('@')[0] : '')) || 'Anonymous';

      const title_lc = titleTrim.toLowerCase();
      const searchTokens = tokenize([titleTrim, descTrim, tagArr.join(' ')].join(' '));

      // question status: user default "open"; admins may preset
      let status = isAdmin ? adminStatus : 'open';

      // single numeric counters (admin can seed)
      const views = isAdmin ? (parseInt(adminViews || '0', 10) || 0) : 0;

      // NEW: baseline seed for the QUESTION; actual votes are seed + votersCount
      const seed = isAdmin ? (parseInt(adminSeed || '0', 10) || 0) : 0;
      const voters = {};                       // no voters yet
      const votes = seed + Object.keys(voters).length; // seed + 0

      // create question
      const qRef = await addDoc(collection(db, 'questions'), {
        title: titleTrim,
        description: descTrim,
        tags: tagArr,
        createdAt: serverTimestamp(),
        authorUid: currentUser.uid,
        authorDisplay: (isAdmin && adminAuthorDisplay.trim())
          ? adminAuthorDisplay.trim()
          : autoDisplay,

        // visibility controls listing (checkbox state)
        visibility, // "draft" | "public"

        // counters aligned with detail page
        views,
        seed,         // <-- baseline for question
        voters,       // <-- per-account toggles
        votes,        // <-- derived (seed + votersCount)
        answersCount: 0,

        // helpers
        status,                  // "open" | "answered" | "closed"
        lastActivityAt: serverTimestamp(),
        title_lc,
        searchTokens,
      });

      // Seed answers (admins only). Admin issues are informational — we already validated earlier.
      const seedAnswers = isAdmin ? parseSeedAnswers(adminSeedAnswersRaw) : [];
      if (seedAnswers.length > 0) {
        const batch = writeBatch(db);
        let acceptedPlaced = false;
        let acceptedInSeeds = false;
        let created = 0;

        for (const a of seedAnswers.slice(0, 20)) {
          const aRef = doc(collection(db, 'questions', qRef.id, 'answers'));
          const authorDisplay =
            a.authorDisplay?.trim() || adminAuthorDisplay.trim() || autoDisplay;

          // map parsed "votes" to baseline seed for the answer
          const aSeed = Math.max(0, Number(a.seed || 0));
          const aVoters = {};
          const aVotes = aSeed + 0;

          const isAccepted = !!a.isAccepted && !acceptedPlaced;
          if (isAccepted) { acceptedPlaced = true; acceptedInSeeds = true; }

          batch.set(aRef, {
            content: a.content,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            authorUid: currentUser.uid,
            authorDisplay,
            seed: aSeed,       // <-- baseline per-answer
            voters: aVoters,   // <-- per-answer toggle map
            votes: aVotes,     // <-- derived (seed + votersCount)
            isAccepted,
          });
          created += 1;
        }

        batch.update(doc(db, 'questions', qRef.id), {
          answersCount: increment(created),
          lastActivityAt: serverTimestamp(),
          ...(acceptedInSeeds ? { status: 'answered' } : {}),
        });

        await batch.commit();
      }

      // reset
      setTitle('');
      setDescription('');
      setTags('');
      setVisibility('draft');
      setFieldErrs({ title: '', description: '', tags: '' });

      setAdminAuthorDisplay('');
      setAdminStatus('open');
      setAdminViews('');
      setAdminSeed('');               // <-- reset baseline input
      setAdminSeedAnswersRaw('');
      setAdminIssues([]);
      setAdminIssuesVisible(false);

      onSuccess?.(visibility === 'public' ? 'Question published!' : 'Saved as draft.');
    } catch (err) {
      console.error(err);
      onError?.(`Could not save question: ${err.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p className="small text-muted mb-2">
        {isAdmin && (
          <span>You are an Admin ✅</span>
        )}
      </p>

      {/* Admin options */}
      {isAdmin && (
        <div className="mb-3 border rounded p-3" style={{ background: 'rgba(224,27,106,0.03)' }}>
          <div className="mb-2 fw-semibold">Admin options</div>

          <button
            type="button"
            className="btn btn-outline-secondary btn-sm mb-2"
            onClick={validateAdminOnly}
            disabled={submitting}
          >
            Validate
          </button>

          {adminIssuesVisible && (
            <div className={`small mb-2 ${adminIssues.length ? 'text-warning' : 'text-success'}`}>
              {adminIssues.length
                ? `${adminIssues.length} issue(s) found`
                : 'No admin issues ✔️'}
            </div>
          )}

          {adminIssuesVisible && adminIssues.length > 0 && (
            <ul className="small text-warning mb-2">
              {adminIssues.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}

          <label className="form-label">Author display (override)</label>
          <input
            className="form-control mb-2"
            value={adminAuthorDisplay}
            onChange={(e) => setAdminAuthorDisplay(e.target.value)}
            placeholder="e.g. Tech Owl"
          />

          <label className="form-label">Initial status</label>
          <select
            className="form-select mb-2"
            value={adminStatus}
            onChange={(e) => setAdminStatus(e.target.value)}
          >
            <option value="open">Open</option>
            <option value="answered">Answered</option>
            <option value="closed">Closed</option>
          </select>

          <div className="row g-2">
            <div className="col-6">
              <label className="form-label">Seed views</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={adminViews}
                onChange={(e) => setAdminViews(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="col-6">
              <label className="form-label">Seed baseline (votes)</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={adminSeed}
                onChange={(e) => setAdminSeed(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="form-text">
            On publish, sets <code>views</code>, <code>seed</code>, initializes <code>voters</code> to
            <code> {'{}'}</code>, and computes <code>votes</code> as <em>seed + votersCount</em>.
            If Seed Answers are provided, each answer gets its own <code>seed</code>, <code>voters</code>, and <code>votes</code>.
          </div>

          <label className="form-label mt-3">Seed answers (optional)</label>
          <textarea
            className="form-control"
            rows={3}
            value={adminSeedAnswersRaw}
            onChange={(e) => setAdminSeedAnswersRaw(e.target.value)}
            placeholder={`Use Google Tag Manager to avoid code edits later. || author=seo_guru || votes=3
If the site is tiny, pasting GA4 is fine. || author=frontend_dev || votes=1
GTM gives you versioning and preview; recommended. || author=analytics_nerd || votes=5 || accepted`}
          />
        </div>
      )}

      {/* Visibility (dropdown) — placed above Title, below admin block */}
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

      {/* Public fields */}
      <label className="form-label">Title</label>
      <input
        type="text"
        className={`form-control mb-1 ${showFieldErrs && fieldErrs.title ? 'is-invalid' : ''}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What's your question?"
      />
      {showFieldErrs && fieldErrs.title && (
        <div className="invalid-feedback mb-2">{fieldErrs.title}</div>
      )}

      <label className="form-label">Details</label>
      <PostQuestionEditor
        value={description}
        onChange={setDescription}
      />
      {showFieldErrs && fieldErrs.description && (
        <div className="invalid-feedback mb-2 d-block">{fieldErrs.description}</div>
      )}

      <label className="form-label">Tags</label>
      <input
        type="text"
        className={`form-control mb-1 ${showFieldErrs && fieldErrs.tags ? 'is-invalid' : ''}`}
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Up to 3 comma-separated tags (e.g. firebase, firestore, rules)"
      />
      {showFieldErrs && fieldErrs.tags && (
        <div className="invalid-feedback mb-2">{fieldErrs.tags}</div>
      )}

      {/* Single action (no two-button split) */}
      <div className="mt-2">
        <button
          className={`btn btn-alice ${hovered ? 'shadow' : ''}`}
          type="submit"
          disabled={submitting || !currentUser}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {submitting ? 'Saving…' : 'Save Question'}
        </button>
      </div>

      {!currentUser && <div className="small text-muted mt-2">Sign in to post.</div>}
    </form>
  );
}
