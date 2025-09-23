import { useState, useRef, createRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { useAuth } from './assets/loginregister/AuthContext';
import NavSearch from './NavbarSearch';

export default function Navbar() {
  const [hoveredTab, setHoveredTab] = useState(null);
  const [hovered, setHovered] = useState({ button: false, search: false });
  const location = useLocation();
  const { user, logout, loading, authBusy } = useAuth();

  const isActive = (path) => (location.pathname === path ? 'active' : '');
  const isHovered = (tab) => (hoveredTab === tab ? 'shadow' : '');

  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register';
  const showLoggedIn = !!user && !isAuthRoute && !authBusy && !loading;

  const nodeRefs = useRef({});
  const getNodeRef = (key) => (nodeRefs.current[key] ??= createRef());

  return (
    <div className="lobster-regular bg-danger-subtle text-black fs-5 sticky-top shadow-sm bg-light py-1">
      <div className="card-header">
        <div className="container d-flex align-items-center justify-content-between flex-wrap gap-3">
          {/* Logo */}
          <Link className="navbar-brand fw-bold mb-0 fs-2" to="/">
            <span className="deep-rose">DEV</span>
            <span className="color-lavendar">@</span>
            <span className="color-deep-mint">Deakin</span>
          </Link>

          {/* Search Bar */}
          <NavSearch />
          {/* Nav Tabs */}
          <ul className="nav nav-tabs card-header-tabs">
            {/* Home */}
            <li
              className={`nav-item rounded d-flex align-items-center mb-0 ${isHovered('home')}`}
              onMouseEnter={() => setHoveredTab('home')}
              onMouseLeave={() => setHoveredTab(null)}
              style={{ transition: 'box-shadow 0.2s ease-in-out' }}
            >
              <Link className={`nav-link ${isActive('/')}`} to="/">Home</Link>
            </li>

            {/* Animated auth-dependent area */}
            <TransitionGroup component={null}>
              {/* Post (logged-in only) */}
              {showLoggedIn && (
                <CSSTransition
                  key="post"
                  classNames="fade-item"
                  timeout={{ enter: 180, exit: 120 }}
                  nodeRef={getNodeRef('post')}
                >
                  <li
                    ref={getNodeRef('post')}
                    className={`nav-item rounded d-flex align-items-center mb-0 ${isHovered('post')}`}
                    onMouseEnter={() => setHoveredTab('post')}
                    onMouseLeave={() => setHoveredTab(null)}
                    style={{ transition: 'box-shadow 0.2s ease-in-out' }}
                  >
                    <Link className={`nav-link ${isActive('/post')}`} to="/post">Post</Link>
                  </li>
                </CSSTransition>
              )}

              {/* Login (when not showing logged-in UI) */}
              {!showLoggedIn && (
                <CSSTransition
                  key="login"
                  classNames="fade-item"
                  timeout={{ enter: 180, exit: 120 }}
                  nodeRef={getNodeRef('login')}
                >
                  <li
                    ref={getNodeRef('login')}
                    className={`nav-item rounded d-flex align-items-center mb-0 ${isHovered('login')}`}
                    onMouseEnter={() => setHoveredTab('login')}
                    onMouseLeave={() => setHoveredTab(null)}
                    style={{ transition: 'box-shadow 0.2s ease-in-out' }}
                  >
                    <Link className={`nav-link ${isActive('/login')}`} to="/login">Login</Link>
                  </li>
                </CSSTransition>
              )}

              {/* Username → /profile (logged-in only) */}
              {showLoggedIn && (
                <CSSTransition
                  key="username"
                  classNames="fade-item"
                  timeout={{ enter: 180, exit: 120 }}
                  nodeRef={getNodeRef('username')}
                >
                  <li
                    ref={getNodeRef('username')}
                    className={`nav-item rounded d-flex align-items-center mb-0 ${isHovered('username')}`}
                    onMouseEnter={() => setHoveredTab('username')}
                    onMouseLeave={() => setHoveredTab(null)}
                    style={{ transition: 'box-shadow 0.2s ease-in-out' }}
                  >
                    <Link className={`nav-link ${isActive('/profile')}`} to="/profile">
                      {user.displayName || user.email}
                    </Link>
                  </li>
                </CSSTransition>
              )}

              {/* Logout (logged-in only) */}
              {showLoggedIn && (
                <CSSTransition
                  key="logout"
                  classNames="fade-item"
                  timeout={{ enter: 180, exit: 120 }}
                  nodeRef={getNodeRef('logout')}
                >
                  <li
                    ref={getNodeRef('logout')}
                    className={`nav-item rounded d-flex align-items-center mb-0 ${isHovered('logout')}`}
                    onMouseEnter={() => setHoveredTab('logout')}
                    onMouseLeave={() => setHoveredTab(null)}
                    style={{ transition: 'box-shadow 0.2s ease-in-out' }}
                  >
                    <button
                      type="button"
                      className="nav-link px-3 py-2 bg-transparent border-0"
                      style={{ cursor: 'pointer', font: 'inherit' }}
                      onClick={async () => {
                        await logout();
                        window.location.replace('/');
                      }}
                    >
                      Logout
                    </button>
                  </li>
                </CSSTransition>
              )}
            </TransitionGroup>
          </ul>
        </div>
      </div>
    </div>
  );
};

