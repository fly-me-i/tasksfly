// pages/ChooseRole.jsx
// Shown once, right after signup, while accountStatus is 'pending_role'.
// Picking a role calls PATCH /users/me/role, which moves the account to
// 'pending_approval' and emails the admin — see routes/users.js.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

const ROLE_OPTIONS = [
  "Head of Marketting",
  "International Chapters Lead",
  "Marketting Secretary",
  "Operational Secretary",
  "HR Leads",
  "Executive Secretary",
  "Platform Manager",
  "Cross-posting Manager",
];

export default function ChooseRole() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState("");
  const [otherRole, setOtherRole] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Already past this step (e.g. they navigated back) — nothing to do here.
  if (user && user.accountStatus !== "pending_role") {
    navigate("/dashboard", { replace: true });
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const orgRole = selected === "Other" ? otherRole.trim() : selected;
    if (!orgRole) {
      setError("Pick a role (or describe yours under \"Other\").");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      await api.patch("/users/me/role", { orgRole });
      await refreshUser(); // pulls the new accountStatus: 'pending_approval'
      navigate("/pending");
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't save your role — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box" style={{ width: 400 }}>
        <h1 style={{ marginBottom: 4 }}>What's your role?</h1>
        <p style={{ color: "var(--text-dim)", marginTop: 0, marginBottom: 20 }}>
          One more step, {user?.fullName?.split(" ")[0] || "there"} — tell the admin what you do,
          and they'll approve your account.
        </p>
        <div className="panel">
          <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
              {ROLE_OPTIONS.map((role) => (
                <label
                  key={role}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, margin: 0,
                    padding: "10px 12px", borderRadius: 10,
                    border: `1px solid ${selected === role ? "var(--accent)" : "var(--panel-border)"}`,
                    background: selected === role ? "rgba(63,184,175,0.08)" : "transparent",
                    cursor: "pointer", fontSize: 14, color: "var(--text)",
                  }}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    checked={selected === role}
                    onChange={() => setSelected(role)}
                    style={{ width: "auto" }}
                  />
                  {role}
                </label>
              ))}
              <label
                style={{
                  display: "flex", alignItems: "center", gap: 10, margin: 0,
                  padding: "10px 12px", borderRadius: 10,
                  border: `1px solid ${selected === "Other" ? "var(--accent)" : "var(--panel-border)"}`,
                  background: selected === "Other" ? "rgba(63,184,175,0.08)" : "transparent",
                  cursor: "pointer", fontSize: 14, color: "var(--text)",
                }}
              >
                <input
                  type="radio"
                  name="role"
                  value="Other"
                  checked={selected === "Other"}
                  onChange={() => setSelected("Other")}
                  style={{ width: "auto" }}
                />
                Other
              </label>
              {selected === "Other" && (
                <input
                  placeholder="Describe your role"
                  value={otherRole}
                  onChange={(e) => setOtherRole(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
              )}
            </div>
            {error && <div className="error-text">{error}</div>}
            <button type="submit" disabled={submitting} style={{ width: "100%", marginTop: 18 }}>
              {submitting ? "Saving..." : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
