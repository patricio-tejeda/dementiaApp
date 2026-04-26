import './App.css'
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/layout/Layout";
import LoginScreen from "./components/auth/LoginScreen";
import Home from "./components/home/home";
import CreateAccount from "./components/account/CreateAccount";
import UpdateAccount from "./components/account/UpdateAccount";
import GamesLanding from "./components/games/GamesLanding";
import MemoryLane from "./components/games/MemoryLane";
import FamilyTree from "./components/games/FamilyTree";
import MemoryQuiz from "./components/games/MemoryQuiz";
import AdaptiveQuiz from "./components/games/AdaptiveQuiz";
import PatientProfileSetup from "./components/profile/PatientProfileSetup.jsx";
import DiaryPage from "./components/diary/DiaryPage.jsx";

function ProfileGate({ children }) {
  // If the user's profile isn't complete, force them onto /profile-setup
  // regardless of the URL they typed in.
  const { profile, profileLoading, authChecked } = useAuth();
  const location = useLocation();

  if (!authChecked || profileLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f5f0e8" }}>
        <p style={{ color: "#6a5a40" }}>Loading your profile...</p>
      </div>
    );
  }

  // Force setup flow on first login until we have profile data and required answers.
  if (!profile && location.pathname !== "/profile-setup") {
    return <Navigate to="/profile-setup" replace />;
  }

  if (!profile) {
    return children;
  }

  if (!profile.is_complete && location.pathname !== "/profile-setup") {
    return <Navigate to="/profile-setup" replace />;
  }

  return children;
}

function AppRoutes() {
  const { isLoggedIn } = useAuth();

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  return (
    <ProfileGate>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create-account" element={<CreateAccount />} />
          <Route path="/update-account" element={<UpdateAccount />} />
          <Route path="/profile-setup" element={<PatientProfileSetup />} />
          <Route path="/diary" element={<DiaryPage />} />
          <Route path="/wellness" element={<div className="text-[#1a2744] p-4">Wellness — Coming Soon</div>} />
          <Route path="/games" element={<GamesLanding />} />
          <Route path="/games/memory-lane" element={<MemoryLane />} />
          <Route path="/games/memory-quiz" element={<MemoryQuiz />} />
          <Route path="/games/adaptive-quiz" element={<AdaptiveQuiz />} />
          <Route path="/games/family-tree" element={<FamilyTree />} />
          <Route path="/about" element={<div className="text-[#1a2744] p-4">About Us — Coming Soon</div>} />
        </Routes>
      </Layout>
    </ProfileGate>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;