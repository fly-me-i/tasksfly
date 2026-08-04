// pages/PendingApproval.jsx
// Shown while accountStatus is 'pending_approval'. There's no push
// mechanism here (no websockets in this app) to tell the browser the moment
// an admin approves someone, so this is a manual "check again" — simpler
// than adding real-time infrastructure for something that happens once per
// person, at onboarding.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function PendingApproval() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);

  if (user && user.accountStatus === "pending_role") {
    navigate("/choose-role", { replace: true });
    return null;
  }
  if (user && user.accountStatus === "active") {
    navigate("/dashboard", { replace: true });
    return null;
  }

  async function checkAgain() {
    setChecking(true);
    setNotYet(false);
    try {
      const fresh = await refreshUser();
      if (fresh.accountStatus === "active") {
        navigate("/dashboard");
      } else {
        setNotYet(true);
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⏳</div>
          <h2 style={{ marginBottom: 8 }}>Waiting on approval</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.5 }}>
            Thanks, {user?.fullName?.split(" ")[0] || "there"}! The admin has been notified that
            you signed up as <strong>{user?.orgRole}</strong>. Once they approve your account,
            you'll get access to your dashboard.
          </p>
          <button onClick={checkAgain} disabled={checking} style={{ marginTop: 12 }}>
            {checking ? "Checking..." : "Check again"}
          </button>
          {notYet && (
            <div style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 10 }}>
              Still waiting — check back soon.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
