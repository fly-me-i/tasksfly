// pages/AdminDashboard.jsx
import { useEffect, useState } from "react";
import api from "../api.js";
import ProgressBar from "../components/ProgressBar.jsx";

// SQLite's datetime('now') stores UTC as "YYYY-MM-DD HH:MM:SS" — no "T", no
// "Z". Handing that straight to `new Date(...)` is a classic gotcha: browsers
// parse the space-separated form as LOCAL time (since it isn't strict ISO
// 8601), so the same stored instant would display differently depending on
// whose browser renders it, and always wrong somewhere. Rewriting it into a
// real ISO string first ("YYYY-MM-DDTHH:MM:SSZ") makes new Date() treat it
// as UTC like it actually is, then .toLocaleString() converts it to
// whoever's looking at the page's own local time, correctly.
function formatLogTime(sqliteTimestamp) {
  const iso = sqliteTimestamp.replace(" ", "T") + "Z";
  return new Date(iso).toLocaleString();
}

function describeLog(log) {
  const verb = { created: "created", completed: "completed", reopened: "reopened", deleted: "deleted" }[log.action] || log.action;
  return `${log.user_name} ${verb} "${log.task_title}"`;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadUsers() {
    const res = await api.get("/users");
    setUsers(res.data);
  }

  async function loadPending() {
    const res = await api.get("/users/pending");
    setPending(res.data);
  }

  async function loadLogs() {
    const res = await api.get("/tasks/logs/recent");
    setLogs(res.data);
  }

  useEffect(() => {
    Promise.all([loadUsers(), loadPending(), loadLogs()]).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <PendingApprovalsPanel
        pending={pending}
        onApproved={() => Promise.all([loadPending(), loadUsers()])}
        onRejected={loadPending}
      />

      <div className="grid-2">
        <CreateUserPanel onCreated={loadUsers} />
        <CreateTaskPanel users={users} onCreated={() => Promise.all([loadUsers(), loadLogs()])} />
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Team progress</h3>
        </div>
        {users.length === 0 && <div className="empty-state">No approved team members yet.</div>}
        {users.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Tasks</th>
                <th>Progress</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} user={u} onChanged={loadUsers} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ActivityLogPanel logs={logs} onRefresh={loadLogs} />
    </div>
  );
}

function PendingApprovalsPanel({ pending, onApproved, onRejected }) {
  const [busyId, setBusyId] = useState(null);

  async function handleApprove(user) {
    setBusyId(user.id);
    try {
      await api.patch(`/users/${user.id}/approve`);
      await onApproved();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(user) {
    if (!confirm(`Reject ${user.fullName}'s signup? This deletes their pending account.`)) return;
    setBusyId(user.id);
    try {
      await api.delete(`/users/${user.id}`);
      await onRejected();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Pending approvals {pending.length > 0 && `(${pending.length})`}</h3>
      </div>
      {pending.length === 0 && <div className="empty-state">No signups waiting on approval.</div>}
      {pending.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Requested role</th>
              <th>Signed up</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{u.orgRole || "—"}</td>
                <td style={{ color: "var(--text-dim)" }}>{formatLogTime(u.createdAt)}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button disabled={busyId === u.id} onClick={() => handleApprove(u)}>
                    {busyId === u.id ? "..." : "Approve"}
                  </button>
                  <button className="secondary" disabled={busyId === u.id} onClick={() => handleReject(u)}>
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ActivityLogPanel({ logs, onRefresh }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Recent activity</h3>
        <button className="secondary" onClick={onRefresh}>Refresh</button>
      </div>
      {logs.length === 0 && <div className="empty-state">No task activity logged yet.</div>}
      {logs.length > 0 && (
        <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 2 }}>
          {logs.map((log) => (
            <div
              key={log.id}
              style={{
                display: "flex", justifyContent: "space-between", gap: 12,
                padding: "8px 4px", borderBottom: "1px solid var(--panel-border)", fontSize: 13.5,
              }}
            >
              <span>{describeLog(log)}</span>
              <span style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>{formatLogTime(log.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({ user, onChanged }) {
  async function handleDelete() {
    if (!confirm(`Remove ${user.fullName}? This also deletes their tasks.`)) return;
    await api.delete(`/users/${user.id}`);
    onChanged();
  }

  return (
    <tr>
      <td>{user.fullName}</td>
      <td>{user.orgRole || "—"}</td>
      <td>
        {user.completedTasks}/{user.totalTasks}
      </td>
      <td style={{ minWidth: 180 }}>
        <ProgressBar percent={user.percent} status={user.status} />
      </td>
      <td>
        <button className="secondary" onClick={handleDelete}>
          Remove
        </button>
      </td>
    </tr>
  );
}

function CreateUserPanel({ onCreated }) {
  const [form, setForm] = useState({ fullName: "", username: "", password: "", orgRole: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/users", form);
      setForm({ fullName: "", username: "", password: "", orgRole: "" });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || "Could not create user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Add a team member</h3>
      </div>
      <form onSubmit={handleSubmit}>
        <label>Full name</label>
        <input
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          required
        />
        <label>Role in organization</label>
        <input
          placeholder="e.g. Marketing Associate"
          value={form.orgRole}
          onChange={(e) => setForm({ ...form, orgRole: e.target.value })}
        />
        <label>Username</label>
        <input
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          required
        />
        <label>Temporary password</label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        {error && <div className="error-text">{error}</div>}
        <button type="submit" disabled={submitting} style={{ marginTop: 16 }}>
          {submitting ? "Adding..." : "Add member"}
        </button>
      </form>
    </div>
  );
}

function CreateTaskPanel({ users, onCreated }) {
  const [form, setForm] = useState({ title: "", description: "", assignedTo: "", dueDate: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.assignedTo) {
      setError("Choose who this task is for.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/tasks", form);
      setForm({ title: "", description: "", assignedTo: "", dueDate: "" });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || "Could not create task.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Assign a task</h3>
      </div>
      <form onSubmit={handleSubmit}>
        <label>Title</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <label>Description</label>
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <label>Assign to</label>
        <select
          value={form.assignedTo}
          onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--panel-border)",
            background: "#0e141a",
            color: "var(--text)",
          }}
        >
          <option value="">Select a person</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </select>
        <label>Due date (optional)</label>
        <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        {error && <div className="error-text">{error}</div>}
        <button type="submit" disabled={submitting} style={{ marginTop: 16 }}>
          {submitting ? "Assigning..." : "Assign task"}
        </button>
      </form>
    </div>
  );
}
