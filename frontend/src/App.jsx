import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import HomePage from "./assets/pages/homepage";
import PostPage from "./assets/pages/postpage";
import Navbar from "./Navbar";
import Footer from "./Footer";
import LoginPage from "./assets/loginregister/Auth";
import RegisterPage from "./assets/loginregister/Auth";
import ProfilePage from "./assets/loginregister/profile";
import { AuthProvider, useAuth } from "./assets/loginregister/AuthContext";

import AllQuestionsPage from "./assets/question/QuestionSearchPage";
import QuestionDetailPage from "./assets/question/QuestionDetailPage";
import AllArticlesPage from "./assets/article/ArticleSearchPage";
import ArticleDetailPage from "./assets/article/ArticleDetailPage";
import AllTutorialsPage from "./assets/tutorial/TutorialSeachPage";
import TutorialDetailPage from "./assets/tutorial/TutorialDetailPage";
import SearchAllPage from "./SearchAll";
import StatusPage from "./assets/loginregister/StatusPage";
import PaymentPage from "./assets/loginregister/payment";
import PaymentSuccess from "./assets/loginregister/paymentsuccess";
import PaymentCancel from "./assets/loginregister/paymentcancel";
import Settings from './assets/loginregister/Settings'

/** Route guard: only render children if logged in; otherwise redirect to /login */
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="container py-4 text-muted">Checking session…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

// Sub-component to access location (needed for dynamic bg)
const AppContent = () => {
  const location = useLocation();

  // Set gradient styles
  const getBackgroundStyle = () => {
    if (location.pathname === "/post") {
      return { background: "linear-gradient(to bottom right, #FDEFF9, #E1F0FF)" };
    }
    if (location.pathname === "/login") {
      return { background: "linear-gradient(to bottom right, #E1F0FF, #FDEFF9)" };
    }
    if (location.pathname === "/register") {
      return { background: "linear-gradient(to bottom right, #E1F0FF, #FDEFF9)" };
    }
    if (location.pathname === "/") {
      return { background: "linear-gradient(to bottom, #fff1e6, #fddec5ff)" };
    }
    return {};
  };

  // Set class names for other paths
  const getBackgroundClass = () => {
    switch (location.pathname) {
      default:
        return "bg-white";
    }
  };

  return (
    <div
      className={`d-flex flex-column min-vh-100 ${getBackgroundClass()}`}
      style={getBackgroundStyle()}
    >
      <Navbar />

      <main className="flex-grow-1">
        <Routes>
          <Route path="/" element={<HomePage />} />

          {/* 🔒 Only logged-in users can access /post */}
          <Route
            path="/post"
            element={
              <RequireAuth>
                <PostPage />
              </RequireAuth>
            }
          />

          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/profile" element={<ProfilePage />} />

          <Route path="/questions/all" element={<AllQuestionsPage />} />
          <Route path="/questions/:id" element={<QuestionDetailPage />} />

          <Route path="/articles/all" element={<AllArticlesPage />} />
          <Route path="/articles/:id" element={<ArticleDetailPage />} />

          <Route path="/tutorials/all" element={<AllTutorialsPage />} />
          <Route path="/tutorials/:id" element={<TutorialDetailPage />} />

          <Route path="/search" element={<SearchAllPage />} />

          <Route path="/plans" element={<StatusPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/payment/success" element={<PaymentSuccess />} />
          <Route path="/payment/cancel" element={<PaymentCancel />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
