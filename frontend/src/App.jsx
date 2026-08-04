// App.jsx
// Sets up page routing and the shared top navigation bar.

import { Routes, Route, Navigate, Link } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import ChooseRole from "./pages/ChooseRole.jsx";
import PendingApproval from "./pages/PendingApproval.jsx";
import UserDashboard from "./pages/UserDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) return null;

  return (
    <>
      {user && (
        <div className="topbar">
          <div className="brand">
            <span>🗂️</span> Task Manager
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span className="who">
              {user.fullName} {user.isAdmin && "· Admin"}
            </span>
            <button className="secondary" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      )}

      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/signup" element={user ? <Navigate to="/dashboard" replace /> : <Signup />} />

        {/* Onboarding steps: just needs to be logged in — ProtectedRoute's
            requireActive isn't used here, since these pages ARE where a
            not-yet-active user is supposed to be. Each page itself redirects
            onward once its step is done (see ChooseRole/PendingApproval). */}
        <Route path="/choose-role" element={<ProtectedRoute><ChooseRole /></ProtectedRoute>} />
        <Route path="/pending" element={<ProtectedRoute><PendingApproval /></ProtectedRoute>} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute requireActive>
              {user?.isAdmin ? <AdminDashboard /> : <UserDashboard />}
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </>
  );
}
