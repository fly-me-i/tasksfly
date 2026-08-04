// pages/Login.jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/dashboard");
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
          Sign in to continue
        </p>
        <div className="panel">
          <form onSubmit={handleSubmit}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
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
            {error && <div className="error-text">{error}</div>}
            <button type="submit" disabled={submitting} style={{ width: "100%", marginTop: 18 }}>
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
        <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 13, marginTop: 16 }}>
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
