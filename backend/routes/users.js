// routes/users.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { sendApprovalRequestEmail } from "../mailer.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();

// Turn a completion percentage into a traffic-light status.
// <33% red, 33-66% yellow, >66% green (matches the brief).
function progressStatus(percent) {
  if (percent < 33) return "red";
  if (percent < 66) return "yellow";
  return "green";
}

// GET /api/users  (admin only) - list active, non-admin users with their
// progress. Only 'active' on purpose: this list also feeds the "assign to"
// dropdown when creating a task, and a signup still pending approval
// shouldn't be assignable yet.
//
// This is one query with a LEFT JOIN instead of one query per user. With
// better-sqlite3 the per-user follow-up query was an in-process lookup and
// effectively free; Postgres is a separate server reached over the network,
// so N extra round-trips (one per team member) would add real, avoidable
// latency. COUNT(t.id) — not COUNT(*) — is deliberate: with a LEFT JOIN, a
// user with zero tasks still produces one joined row with every t.* column
// NULL, and COUNT(*) would count that phantom row as 1. COUNT(t.id) ignores
// NULLs and correctly counts 0.
router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.username, u.full_name, u.org_role,
        COUNT(t.id)::int AS total,
        COALESCE(SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END), 0)::int AS completed
      FROM users u
      LEFT JOIN tasks t ON t.assigned_to = u.id
      WHERE u.is_admin = FALSE AND u.status = 'active'
      GROUP BY u.id
      ORDER BY u.full_name
    `);

    const withProgress = rows.map((u) => {
      const percent = u.total === 0 ? 0 : Math.round((u.completed / u.total) * 100);
      return {
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        orgRole: u.org_role,
        totalTasks: u.total,
        completedTasks: u.completed,
        percent,
        status: progressStatus(percent),
      };
    });

    res.json(withProgress);
  })
);

// POST /api/users  (admin only) - create a new user
// No `status` passed here on purpose — the users table defaults new rows to
// 'active', and an admin creating someone directly IS the approval. Only
// /api/auth/signup (self-service) starts anyone at 'pending_role'.
router.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { username, password, fullName, orgRole } = req.body;

    if (!username || !password || !fullName) {
      return res.status(400).json({ error: "username, password, and fullName are required." });
    }

    const { rows: existingRows } = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    if (existingRows[0]) {
      return res.status(409).json({ error: "That username is already taken." });
    }

    const hash = bcrypt.hashSync(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, org_role, is_admin)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING id`,
      [username, hash, fullName, orgRole || ""]
    );

    res.status(201).json({ id: rows[0].id });
  })
);

// GET /api/users/pending  (admin only) - signups waiting on approval,
// oldest first (first come, first reviewed)
router.get(
  "/pending",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, username, full_name, org_role, created_at
       FROM users WHERE status = 'pending_approval' ORDER BY created_at ASC`
    );
    res.json(
      rows.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.full_name,
        orgRole: u.org_role,
        createdAt: u.created_at,
      }))
    );
  })
);

// PATCH /api/users/:id/approve  (admin only) - activate a pending signup.
// Deliberately the ONLY thing that flips status to 'active' for a
// self-signup — never done from an unauthenticated email link (see mailer.js).
router.patch(
  "/:id/approve",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.params.id]);
    const user = rows[0];
    if (!user || user.is_admin) {
      return res.status(404).json({ error: "User not found." });
    }
    if (user.status !== "pending_approval") {
      return res.status(400).json({ error: `Can't approve a user in status "${user.status}".` });
    }
    await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [user.id]);
    res.json({ success: true });
  })
);

// DELETE /api/users/:id (admin only) - remove a user (and their tasks)
router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    const user = rows[0];
    if (!user || user.is_admin) {
      return res.status(404).json({ error: "User not found." });
    }
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    res.json({ success: true });
  })
);

// PATCH /api/users/me/role — the "choose your role" step after signup.
// Only works while status is 'pending_role'; moves it to 'pending_approval'
// and emails the admin. Self-signup can pick a job-title/department role
// here, but never is_admin — that flag can only ever be set by the seed
// script in db.js.
router.patch(
  "/me/role",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { orgRole } = req.body;
    if (!orgRole || typeof orgRole !== "string" || !orgRole.trim()) {
      return res.status(400).json({ error: "Pick a role." });
    }

    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "Account no longer exists." });
    if (user.status !== "pending_role") {
      return res.status(400).json({ error: "Role has already been set." });
    }

    const { rows: updatedRows } = await pool.query(
      `UPDATE users SET org_role = $1, status = 'pending_approval' WHERE id = $2 RETURNING *`,
      [orgRole.trim().slice(0, 100), user.id]
    );
    const updated = updatedRows[0];

    try {
      await sendApprovalRequestEmail(updated);
    } catch (err) {
      // Don't fail the request just because the email didn't go out — the
      // admin can still see this person in GET /users/pending either way.
      console.error("[mailer] Failed to send approval request email:", err.message);
    }

    res.json({ success: true, accountStatus: updated.status });
  })
);

// GET /api/users/me  - current logged-in user's own info + progress
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, username, full_name, org_role, is_admin, status FROM users WHERE id = $1",
      [req.user.id]
    );
    const u = rows[0];

    const { rows: totalsRows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)::int AS completed
       FROM tasks WHERE assigned_to = $1`,
      [u.id]
    );
    const { total, completed } = totalsRows[0];

    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    res.json({
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      orgRole: u.org_role,
      isAdmin: !!u.is_admin,
      totalTasks: total,
      completedTasks: completed,
      percent,
      status: progressStatus(percent), // red/yellow/green task-progress color
      accountStatus: u.status, // pending_role / pending_approval / active
    });
  })
);

export default router;
