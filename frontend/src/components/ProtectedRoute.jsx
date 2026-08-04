// components/ProtectedRoute.jsx
// Wraps a page and redirects to /login if not logged in, blocks access if
// adminOnly is set and the user isn't an admin, and (if requireActive is
// set) sends anyone still onboarding to whichever step they're actually on.
//
// This is UX only — it makes the app feel right by sending people to the
// correct page. The actual security boundary is the backend's requireAdmin
// / requireActive middleware (middleware/auth.js), which can't be bypassed
// just by knowing a URL, the way a frontend-only check could be.

import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children, adminOnly = false, requireActive = false }) {
  const { user, loading } = useAuth();

  if (loading) return null; // could show a spinner here

  if (!user) return <Navigate to="/login" replace />;

  if (adminOnly && !user.isAdmin) return <Navigate to="/dashboard" replace />;

  if (requireActive && !user.isAdmin && user.accountStatus !== "active") {
    const nextStep = user.accountStatus === "pending_role" ? "/choose-role" : "/pending";
    return <Navigate to={nextStep} replace />;
  }

  return children;
}
