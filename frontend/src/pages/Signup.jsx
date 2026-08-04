// pages/Signup.jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await signup(username, password, fullName);
      // App.jsx's routing would land here anyway (accountStatus is
      // 'pending_role' right after signup), but navigating explicitly
      // skips waiting on a re-render.
      navigate("/choose-role");
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong. Is the backend running?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <h1 style={{ marginBottom: 4 }}>Task Manager</h1>
        <p style={{ color: "var(--text-dim)", marginTop: 0, marginBottom: 20 }}>
          Create your account
        </p>
        <div className="panel">
          <form onSubmit={handleSubmit}>
            <label htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
              required
            />
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {error && <div className="error-text">{error}</div>}
            <button type="submit" disabled={submitting} style={{ width: "100%", marginTop: 18 }}>
              {submitting ? "Creating account..." : "Sign up"}
            </button>
          </form>
        </div>
        <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 13, marginTop: 16 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
