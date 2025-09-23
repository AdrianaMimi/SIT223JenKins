import React, { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CSSTransition, SwitchTransition } from 'react-transition-group';
import { createPortal } from 'react-dom';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import styles from './Auth.module.css';


const AuthPage = () => {
    const TOAST_MS = 3000;
    const location = useLocation();
    const navigate = useNavigate();
    const isLogin = location.pathname === '/login';
    const nodeRef = useRef(null);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorToast, setErrorToast] = useState('');

    const switchPath = () => {
        navigate(isLogin ? '/register' : '/login');
    };

    const handleRegisterSuccess = () => {
        setSuccessMessage('📩 Verification sent. Check inbox/spam, then log in.');
        setTimeout(() => window.location.replace('/login'), TOAST_MS);
    };

    const handleLoginSuccess = () => {
        setSuccessMessage('🎉 Success! Login successful!');
        setTimeout(() => window.location.replace('/'), TOAST_MS);
    };

    const handleRegisterError = (msg) => {
        setErrorToast(msg);
        setTimeout(() => setErrorToast(''), 3000);
    };

    const handleLoginError = (msg) => {
        setErrorToast(msg);
        setTimeout(() => setErrorToast(''), 4000);
    };

    return (
        <>
            {successMessage &&
                createPortal(
                    <div
                        className={`${styles.toastFixed} ${styles.toastSuccess}`}
                        role="status"
                        aria-live="polite"
                        aria-atomic="true"
                    >
                        {successMessage}
                    </div>,
                    document.body
                )
            }

            {errorToast &&
                createPortal(
                    <div
                        className={`${styles.toastFixed} ${styles.toastError}`}
                        role="alert"
                        aria-live="assertive"
                        aria-atomic="true"
                    >
                        {errorToast}
                    </div>,
                    document.body
                )
            }

            <div className="d-flex justify-content-center align-items-center py-5 vh-100">
                <div className={`container lobster-regular ${styles.widthCustom}`}>
                    <div className={`p-5 rounded-4 position-relative shadow ${styles.authCard} ${styles.boxxy}`}>
                        <SwitchTransition mode="out-in">
                            <CSSTransition
                                key={location.pathname}
                                timeout={300}
                                classNames={{
                                    enter: styles['fade-enter'],
                                    enterActive: styles['fade-enter-active'],
                                    exit: styles['fade-exit'],
                                    exitActive: styles['fade-exit-active'],
                                }}
                                nodeRef={nodeRef}
                            >
                                <div ref={nodeRef}>
                                    {isLogin ? (
                                        <LoginForm onSuccess={handleLoginSuccess} onError={handleLoginError} />
                                    ) : (
                                        <RegisterForm onSuccess={handleRegisterSuccess} onError={handleRegisterError} />
                                    )}
                                </div>
                            </CSSTransition>
                        </SwitchTransition>

                        <div className="text-center mt-4">
                            <button className={`btn ${styles.btnLink}`} onClick={switchPath}>
                                {isLogin
                                    ? "Don't have an account? Register"
                                    : "Already have an account? Login"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AuthPage;
