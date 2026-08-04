// routes/tasks.js
import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireAdmin, requireActive } from "../middleware/auth.js";
import { logTaskEvent } from "../taskLog.js";

const router = Router();

// GET /api/tasks  (admin only) - all tasks, with assignee names
router.get("/", requireAuth, requireAdmin, (req, res) => {
  const tasks = db
    .prepare(
      `SELECT tasks.*, users.full_name AS assignee_name
       FROM tasks
       JOIN users ON users.id = tasks.assigned_to
       ORDER BY tasks.created_at DESC`
    )
    .all();
  res.json(tasks);
});

// GET /api/tasks/logs/recent  (admin only) - activity feed across all tasks,
// newest first. Reads straight from task_logs, so it still shows entries for
// tasks or users that have since been deleted (see the comment in db.js on
// why that table has no foreign keys).
router.get("/logs/recent", requireAuth, requireAdmin, (req, res) => {
  const logs = db
    .prepare("SELECT * FROM task_logs ORDER BY created_at DESC, id DESC LIMIT 100")
    .all();
  res.json(logs);
});

// GET /api/tasks/mine  - tasks assigned to the logged-in user.
// requireActive: someone still in onboarding (pending_role/pending_approval)
// shouldn't be able to pull task data even if a task somehow got assigned to
// them early — see middleware/auth.js for why this re-checks the database
// instead of trusting the JWT.
router.get("/mine", requireAuth, requireActive, (req, res) => {
  const tasks = db
    .prepare("SELECT * FROM tasks WHERE assigned_to = ? ORDER BY status ASC, created_at DESC")
    .all(req.user.id);
  res.json(tasks);
});

// POST /api/tasks  (admin only) - create + assign a new task
router.post("/", requireAuth, requireAdmin, (req, res) => {
  const { title, description, assignedTo, dueDate } = req.body;

  if (!title || !assignedTo) {
    return res.status(400).json({ error: "title and assignedTo are required." });
  }

  const assignee = db.prepare("SELECT id, full_name FROM users WHERE id = ?").get(assignedTo);
  if (!assignee) {
    return res.status(404).json({ error: "Assigned user not found." });
  }

  const result = db
    .prepare(
      `INSERT INTO tasks (title, description, assigned_to, created_by, due_date)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(title, description || "", assignedTo, req.user.id, dueDate || null);

  const creator = db.prepare("SELECT full_name FROM users WHERE id = ?").get(req.user.id);
  logTaskEvent({
    taskId: result.lastInsertRowid,
    taskTitle: title,
    userId: req.user.id,
    userName: creator?.full_name || req.user.username,
    action: "created",
    fromStatus: null,
    toStatus: "pending",
  });

  res.status(201).json({ id: result.lastInsertRowid });
});

// PATCH /api/tasks/:id/complete  - the assigned user marks their own task
// done (or reopens it). requireActive here too, for the same reason as
// GET /mine above.
router.patch("/:id/complete", requireAuth, requireActive, (req, res) => {
  const { id } = req.params;
  const { completed } = req.body; // true or false

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  if (!task) return res.status(404).json({ error: "Task not found." });

  // Only the assignee (or an admin) can update completion status
  if (task.assigned_to !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ error: "You can only update your own tasks." });
  }

  const status = completed ? "completed" : "pending";
  const completedAt = completed ? new Date().toISOString() : null;

  db.prepare("UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?").run(status, completedAt, id);

  const actor = db.prepare("SELECT full_name FROM users WHERE id = ?").get(req.user.id);
  logTaskEvent({
    taskId: task.id,
    taskTitle: task.title,
    userId: req.user.id,
    userName: actor?.full_name || req.user.username,
    action: completed ? "completed" : "reopened",
    fromStatus: task.status,
    toStatus: status,
  });

  res.json({ success: true });
});

// DELETE /api/tasks/:id (admin only)
router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found." });

  db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);

  const actor = db.prepare("SELECT full_name FROM users WHERE id = ?").get(req.user.id);
  logTaskEvent({
    taskId: task.id,
    taskTitle: task.title,
    userId: req.user.id,
    userName: actor?.full_name || req.user.username,
    action: "deleted",
    fromStatus: task.status,
    toStatus: null,
  });

  res.json({ success: true });
});

export default router;
