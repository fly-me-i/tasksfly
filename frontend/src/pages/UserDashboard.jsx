// pages/UserDashboard.jsx
import { useEffect, useState } from "react";
import api from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import ProgressBar from "../components/ProgressBar.jsx";

export default function UserDashboard() {
  const { user, setUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadEverything() {
    const [tasksRes, meRes] = await Promise.all([api.get("/tasks/mine"), api.get("/users/me")]);
    setTasks(tasksRes.data);
    setUser(meRes.data); // refresh progress numbers in the header/context
    setLoading(false);
  }

  useEffect(() => {
    loadEverything();
  }, []);

  async function toggleTask(task) {
    const nowCompleted = task.status !== "completed";
    // Optimistic update: flip it in the UI immediately, then confirm with the server.
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nowCompleted ? "completed" : "pending" } : t))
    );
    await api.patch(`/tasks/${task.id}/complete`, { completed: nowCompleted });
    // Re-fetch progress since it changed
    const meRes = await api.get("/users/me");
    setUser(meRes.data);
  }

  if (loading) return <div className="page">Loading...</div>;

  const pending = tasks.filter((t) => t.status !== "completed");
  const completed = tasks.filter((t) => t.status === "completed");

  return (
    <div className="page">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>{user.fullName}</h2>
            <div style={{ color: "var(--text-dim)", fontSize: 13 }}>{user.orgRole || "No role set"}</div>
          </div>
        </div>
        <ProgressBar percent={user.percent} status={user.status} />
        <div style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 8 }}>
          {user.completedTasks} of {user.totalTasks} tasks completed
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Your tasks</h3>
        </div>
        {tasks.length === 0 && <div className="empty-state">No tasks assigned yet.</div>}

        {pending.map((task) => (
          <TaskRow key={task.id} task={task} onToggle={toggleTask} />
        ))}
        {completed.length > 0 && (
          <>
            <div style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 16, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Completed
            </div>
            {completed.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={toggleTask} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, onToggle }) {
  const isDone = task.status === "completed";
  return (
    <div className={`task-item ${isDone ? "completed" : ""}`}>
      <button
        className={`checkbox ${isDone ? "checked" : ""}`}
        onClick={() => onToggle(task)}
        aria-label={isDone ? "Mark as not done" : "Mark as done"}
      />
      <div>
        <div className="task-title">{task.title}</div>
        {task.description && <div className="task-desc">{task.description}</div>}
        {task.due_date && <div className="task-meta">Due {task.due_date}</div>}
      </div>
    </div>
  );
}
