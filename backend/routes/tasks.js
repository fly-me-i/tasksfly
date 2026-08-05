// routes/tasks.js
import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireAdmin, requireActive } from "../middleware/auth.js";
import { logTaskEvent } from "../taskLog.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();

// GET /api/tasks  (admin only) - all tasks, with assignee names
router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT tasks.*, users.full_name AS assignee_name
      FROM tasks
      JOIN users ON users.id = tasks.assigned_to
      ORDER BY tasks.created_at DESC
    `);
    res.json(rows);
  })
);

// GET /api/tasks/logs/recent  (admin only) - activity feed across all tasks,
// newest first. Reads straight from task_logs, so it still shows entries for
// tasks or users that have since been deleted (see the comment in db.js on
// why that table has no foreign keys).
router.get(
  "/logs/recent",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM task_logs ORDER BY created_at DESC, id DESC LIMIT 100");
    res.json(rows);
  })
);

// GET /api/tasks/mine  - tasks assigned to the logged-in user.
// requireActive: someone still in onboarding (pending_role/pending_approval)
// shouldn't be able to pull task data even if a task somehow got assigned to
// them early — see middleware/auth.js for why this re-checks the database
// instead of trusting the JWT.
router.get(
  "/mine",
  requireAuth,
  requireActive,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM tasks WHERE assigned_to = $1 ORDER BY status ASC, created_at DESC",
      [req.user.id]
    );
    res.json(rows);
  })
);

// POST /api/tasks  (admin only) - create + assign a new task
router.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, description, assignedTo, dueDate } = req.body;

    if (!title || !assignedTo) {
      return res.status(400).json({ error: "title and assignedTo are required." });
    }

    const { rows: assigneeRows } = await pool.query("SELECT id, full_name FROM users WHERE id = $1", [assignedTo]);
    if (!assigneeRows[0]) {
      return res.status(404).json({ error: "Assigned user not found." });
    }

    const { rows } = await pool.query(
      `INSERT INTO tasks (title, description, assigned_to, created_by, due_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [title, description || "", assignedTo, req.user.id, dueDate || null]
    );
    const taskId = rows[0].id;

    const { rows: creatorRows } = await pool.query("SELECT full_name FROM users WHERE id = $1", [req.user.id]);
    const creator = creatorRows[0];
    await logTaskEvent({
      taskId,
      taskTitle: title,
      userId: req.user.id,
      userName: creator?.full_name || req.user.username,
      action: "created",
      fromStatus: null,
      toStatus: "pending",
    });

    res.status(201).json({ id: taskId });
  })
);

// PATCH /api/tasks/:id/complete  - the assigned user marks their own task
// done (or reopens it). requireActive here too, for the same reason as
// GET /mine above.
router.patch(
  "/:id/complete",
  requireAuth,
  requireActive,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { completed } = req.body; // true or false

    const { rows } = await pool.query("SELECT * FROM tasks WHERE id = $1", [id]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: "Task not found." });

    // Only the assignee (or an admin) can update completion status
    if (task.assigned_to !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: "You can only update your own tasks." });
    }

    const status = completed ? "completed" : "pending";
    const completedAt = completed ? new Date().toISOString() : null;

    await pool.query("UPDATE tasks SET status = $1, completed_at = $2 WHERE id = $3", [status, completedAt, id]);

    const { rows: actorRows } = await pool.query("SELECT full_name FROM users WHERE id = $1", [req.user.id]);
    const actor = actorRows[0];
    await logTaskEvent({
      taskId: task.id,
      taskTitle: task.title,
      userId: req.user.id,
      userName: actor?.full_name || req.user.username,
      action: completed ? "completed" : "reopened",
      fromStatus: task.status,
      toStatus: status,
    });

    res.json({ success: true });
  })
);

// DELETE /api/tasks/:id (admin only)
router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM tasks WHERE id = $1", [req.params.id]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: "Task not found." });

    await pool.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);

    const { rows: actorRows } = await pool.query("SELECT full_name FROM users WHERE id = $1", [req.user.id]);
    const actor = actorRows[0];
    await logTaskEvent({
      taskId: task.id,
      taskTitle: task.title,
      userId: req.user.id,
      userName: actor?.full_name || req.user.username,
      action: "deleted",
      fromStatus: task.status,
      toStatus: null,
    });

    res.json({ success: true });
  })
);

export default router;
