import { useState, useRef, useEffect, createRef } from 'react';
import { createPortal } from 'react-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

import { auth } from '../../firebase';

import QuestionForm from '../question/QuestionForm';
import ArticleForm from '../article/ArticleForm';
import TutorialForm from '../tutorial/TutorialForm';

import { CSSTransition, SwitchTransition } from 'react-transition-group';
import styles from './postpage.module.css';

const PostPage = () => {
    const nav = useNavigate();

    const [postType, setPostType] = useState('question');
    const [isAdmin, setIsAdmin] = useState(false);
    const [isPremium, setIsPremium] = useState(false);

    // tiny toast
    const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
    const timeoutRef = useRef(null);
    const showToast = (message, type = 'success') => {
        setToast({ show: true, type, message });
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
    };
    const handleSuccess = (msg) => showToast(msg ?? 'Posted! 🌸', 'success');
    const handleError = (msg) => showToast(msg ?? 'Oops, something went wrong 🥺', 'error');

    useEffect(() => () => clearTimeout(timeoutRef.current), []);

    // ── Claims-only detection (no Firestore doc) ────────────────────────────────
    useEffect(() => {
        const off = onAuthStateChanged(auth, async (user) => {
            setIsAdmin(false);
            setIsPremium(false);
            if (!user) return;

            try {
                // force refresh so newly-set claims are visible after running premium.mjs/admin.mjs
                const tok = await user.getIdTokenResult(true);
                setIsAdmin(!!tok.claims?.admin);
                setIsPremium(!!tok.claims?.premium);
            } catch {
                setIsAdmin(false);
                setIsPremium(false);
            }
        });
        return off;
    }, []);

    // keep users out of Tutorial tab unless allowed
    useEffect(() => {
        const canUseTutorial = isAdmin || isPremium;
        if (!canUseTutorial && postType === 'tutorial') setPostType('question');
    }, [isAdmin, isPremium, postType]);

    const canUseTutorial = isAdmin || isPremium;

    // StrictMode-safe refs for transitions
    const nodeRefs = useRef({
        heading: { question: createRef(), article: createRef(), tutorial: createRef() },
        form: { question: createRef(), article: createRef(), tutorial: createRef() },
    });

    const headingCopy =
        postType === 'question'
            ? { h: 'Let’s get your question posted!', p: 'Fill in the details below so others can help you out.' }
            : postType === 'article'
                ? { h: 'Let’s get your article posted!', p: 'Share your knowledge and ideas with the community.' }
                : { h: 'Let’s get your tutorial posted!', p: 'Teach step-by-step. Add clear images and descriptions.' };

    return (
        <>
            {toast.show &&
                createPortal(
                    <div
                        className={`${styles.toastFixed} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
                        role="status" aria-live="polite" aria-atomic="true"
                    >
                        {toast.message}
                    </div>,
                    document.body
                )
            }

            <div className="d-flex justify-content-center align-items-start py-5">
                <div className={`container lobster-regular ${styles.widthCustom}`}>
                    <div className={`p-5 rounded-4 shadow ${styles.postpageCard} ${styles.boxxy}`}>
                        <h3 className="fs-1 mb-4 bigbig-text text-center">New Post</h3>

                        <div className="mb-4">
                            <div className="mt-3 mb-4 fs-5">
                                <strong className="deep-rose">Select Post Type:</strong>

                                <div className="form-check form-check-inline ms-3 color-deep-mint">
                                    <label className="form-check-label" htmlFor="post-question">
                                        <input
                                            className="form-check-input me-2"
                                            type="radio" name="postType" id="post-question" value="question"
                                            checked={postType === 'question'} onChange={() => setPostType('question')}
                                        />
                                        Question
                                    </label>
                                </div>

                                <div className="form-check form-check-inline color-deep-mint">
                                    <label className="form-check-label" htmlFor="post-article">
                                        <input
                                            className="form-check-input me-2"
                                            type="radio" name="postType" id="post-article" value="article"
                                            checked={postType === 'article'} onChange={() => setPostType('article')}
                                        />
                                        Article
                                    </label>
                                </div>

                                {/* Tutorial: Admin OR Premium (claims only) */}
                                {canUseTutorial ? (
                                    <div className="form-check form-check-inline color-deep-mint">
                                        <label className="form-check-label" htmlFor="post-tutorial">
                                            <input
                                                className="form-check-input me-2"
                                                type="radio" name="postType" id="post-tutorial" value="tutorial"
                                                checked={postType === 'tutorial'} onChange={() => setPostType('tutorial')}
                                            />
                                            Tutorial
                                        </label>
                                    </div>
                                ) : (
                                    <div className="form-check form-check-inline color-deep-mint">
                                        <label className="form-check-label" htmlFor="post-tutorial-locked" title="Premium feature">
                                            <input
                                                className="form-check-input me-2"
                                                type="radio" name="postType" id="post-tutorial-locked" value="tutorial"
                                                disabled
                                            />
                                            Tutorial <span className="text-muted">(Premium)</span>
                                        </label>
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-primary ms-2"
                                            onClick={() => nav('/plans')}
                                        >
                                            Upgrade
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Heading transition */}
                        <SwitchTransition mode="out-in">
                            <CSSTransition
                                key={postType}
                                timeout={300}
                                classNames={{
                                    enter: styles.fadeEnter, enterActive: styles.fadeEnterActive,
                                    exit: styles.fadeExit, exitActive: styles.fadeExitActive,
                                }}
                                nodeRef={nodeRefs.current.heading[postType]}
                            >
                                <div ref={nodeRefs.current.heading[postType]} className="mb-4">
                                    <h5 className="bigbig-text fs-4 mb-2">{headingCopy.h}</h5>
                                    <p className="text-muted smallsmall-text mb-3">{headingCopy.p}</p>
                                </div>
                            </CSSTransition>
                        </SwitchTransition>

                        {/* Form transition */}
                        <div style={{ minHeight: '350px' }}>
                            <SwitchTransition mode="out-in">
                                <CSSTransition
                                    key={postType}
                                    timeout={300}
                                    classNames={{
                                        enter: styles.fadeEnter, enterActive: styles.fadeEnterActive,
                                        exit: styles.fadeExit, exitActive: styles.fadeExitActive,
                                    }}
                                    nodeRef={nodeRefs.current.form[postType]}
                                >
                                    <div ref={nodeRefs.current.form[postType]}>
                                        {postType === 'question' && (
                                            <QuestionForm onSuccess={handleSuccess} onError={handleError} />
                                        )}

                                        {postType === 'article' && (
                                            <ArticleForm onSuccess={handleSuccess} onError={handleError} />
                                        )}

                                        {postType === 'tutorial' && (
                                            canUseTutorial ? (
                                                <TutorialForm onSuccess={handleSuccess} onError={handleError} />
                                            ) : (
                                                <div className="alert alert-info">
                                                    Tutorials are a <strong>Premium</strong> feature.{' '}
                                                    <button className="btn btn-sm btn-primary ms-2" onClick={() => nav('/plans')}>
                                                        View plans
                                                    </button>
                                                </div>
                                            )
                                        )}
                                    </div>
                                </CSSTransition>
                            </SwitchTransition>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default PostPage;
