import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { db } from "./firebase";
import { collection, query, where, limit, getDocs } from "firebase/firestore";
import { useCatalogCache } from "./usecatalogcache";

const tokensOf = (s = "") =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter(Boolean);

const MAX_SUGGESTIONS_PER_GROUP = 5;

export default function NavSearch() {
    const nav = useNavigate();
    const { articles, tutorials, questions } = useCatalogCache();
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [groups, setGroups] = useState({
        articles: [],
        tutorials: [],
        questions: [],
    });

    const boxRef = useRef(null);
    const inputRef = useRef(null);

    // Close on outside click or ESC
    useEffect(() => {
        const onClick = (e) => {
            if (!boxRef.current?.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, []);

    // Debounced suggestions
    useEffect(() => {
        const t = setTimeout(() => {
            const tokens = tokensOf(q).slice(0, 10); // keep 1-char tokens
            if (!tokens.length) {
                setGroups({ articles: [], tutorials: [], questions: [] });
                setLoading(false);
                return;
            }

            setLoading(true);

            const match = (arr) => {
                // OR semantics: any token found in the per-item haystack
                return arr.filter(x => tokens.some(t => x._hay?.includes(t)));
            };

            const arts = match(articles).slice(0, 20);
            const tuts = match(tutorials).slice(0, 20);
            const qs = match(questions).slice(0, 20);

            const pick = (d) => ({ id: d.id, ...d }); // keep shape

            setGroups({
                articles: arts.map(pick).slice(0, MAX_SUGGESTIONS_PER_GROUP),
                tutorials: tuts.map(pick).slice(0, MAX_SUGGESTIONS_PER_GROUP),
                questions: qs.map(pick).slice(0, MAX_SUGGESTIONS_PER_GROUP),
            });
            setLoading(false);
        }, 150);

        return () => clearTimeout(t);
    }, [q, articles, tutorials, questions]);

    const hasAny = useMemo(
        () =>
            !!(
                groups.articles.length ||
                groups.tutorials.length ||
                groups.questions.length
            ),
        [groups]
    );
    const hasQuery = q.trim().length > 0;

    const goToResults = () => {
        const term = q.trim();
        if (!term) return;
        setOpen(false);
        nav(`/search?q=${encodeURIComponent(term)}`);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const onSubmit = (e) => {
        e.preventDefault();
        goToResults();
    };

    return (
        <form
            onSubmit={onSubmit}
            className="position-relative flex-fill mx-3"
            ref={boxRef}
            style={{ maxWidth: 700, minWidth: 150 }}
        >
            <div className="input-group">
                <span className="input-group-text bg-white border-end-0">
                    {/* submit button -> Enter OR click icon both work */}
                    <button
                        type="submit"
                        className="btn p-0 border-0 bg-transparent"
                        aria-label="Search"
                    >
                        <i className="fas fa-search" />
                    </button>
                </span>
                <input
                    ref={inputRef}
                    type="text"
                    className="form-control border-start-0 bigbig-text fs-5"
                    placeholder="Search…"
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                />
            </div>

            {/* Autocomplete dropdown */}
            {open && (loading || hasQuery) && (
                <div
                    className="position-absolute w-100 mt-1 bg-white rounded shadow border"
                    style={{ zIndex: 1050, maxHeight: 420, overflowY: "auto" }}
                >
                    {loading && (
                        <div className="px-3 py-2 text-muted small">Searching…</div>
                    )}

                    {/* No results */}
                    {!loading && hasQuery && !hasAny && (
                        <div className="px-3 py-2 text-muted small">
                            No results for <strong>{q.trim()}</strong>.{" "}
                            {/* <button
                                type="button"
                                className="btn btn-link btn-sm p-0 align-baseline"
                                style={{ textDecoration: 'none' }}
                                onClick={goToResults}
                            >
                                See full results
                            </button> */}
                        </div>
                    )}

                    {/* Articles */}
                    {!loading && groups.articles.length > 0 && (
                        <Section
                            title="Articles"
                            items={groups.articles.map((a) => ({
                                id: a.id,
                                label: a.title || "Untitled",
                                sub: a.description || "",
                                to: `/articles/${encodeURIComponent(a.id)}`,
                                img: a.display?.croppedURL || a.imageURL || "",
                            }))}
                            onNavigate={() => setOpen(false)}
                        />
                    )}

                    {/* Tutorials */}
                    {!loading && groups.tutorials.length > 0 && (
                        <Section
                            title="Tutorials"
                            items={groups.tutorials.map((t) => ({
                                id: t.id,
                                label: t.title || "Untitled",
                                sub: t.description || "",
                                to: `/tutorials/${encodeURIComponent(t.id)}`,
                                img: t.display?.croppedURL || t.imageURL || "",
                            }))}
                            onNavigate={() => setOpen(false)}
                        />
                    )}

                    {/* Questions */}
                    {!loading && groups.questions.length > 0 && (
                        <Section
                            title="Questions"
                            items={groups.questions.map((qn) => ({
                                id: qn.id,
                                label: qn.title || "Untitled",
                                sub: (qn.tags || []).join(", "),
                                to: `/questions/${encodeURIComponent(qn.id)}`,
                            }))}
                            onNavigate={() => setOpen(false)}
                        />
                    )}

                    {/* Footer: go to full results */}
                    {!loading && hasQuery && (
                        <div className="border-top px-3 py-2 text-end">
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={goToResults}
                            >
                                See all results
                            </button>
                        </div>
                    )}
                </div>
            )}
        </form>
    );
}

function Section({ title, items, onNavigate }) {
    return (
        <div className="py-2">
            <div className="px-3 text-uppercase small fw-bold text-muted">{title}</div>
            {items.map((it) => (
                <Link
                    key={`${title}-${it.id}`}
                    to={it.to}
                    className="text-decoration-none text-reset"
                    onClick={onNavigate}
                >
                    <div className="px-3 py-2 d-flex align-items-center gap-2 hover-bg">
                        {it.img && (
                            <img
                                src={it.img}
                                alt=""
                                width={36}
                                height={24}
                                style={{ objectFit: "cover", borderRadius: 4 }}
                            />
                        )}
                        <div className="flex-grow-1">
                            <div className="small">{it.label}</div>
                            {it.sub && (
                                <div className="small text-muted text-truncate">{it.sub}</div>
                            )}
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    );
}
