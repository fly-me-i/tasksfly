// routes/users.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import db from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { sendApprovalRequestEmail } from "../mailer.js";

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
router.get("/", requireAuth, requireAdmin, (req, res) => {
  const users = db
    .prepare("SELECT id, username, full_name, org_role, created_at FROM users WHERE is_admin = 0 AND status = 'active' ORDER BY full_name")
    .all();

  const withProgress = users.map((u) => {
    const totals = db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
         FROM tasks WHERE assigned_to = ?`
      )
      .get(u.id);

    const total = totals.total || 0;
    const completed = totals.completed || 0;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    return {
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      orgRole: u.org_role,
      totalTasks: total,
      completedTasks: completed,
      percent,
      status: progressStatus(percent),
    };
  });

  res.json(withProgress);
});

// POST /api/users  (admin only) - create a new user
// No `status` passed here on purpose — the users table defaults new rows to
// 'active', and an admin creating someone directly IS the approval. Only
// /api/auth/signup (self-service) starts anyone at 'pending_role'.
router.post("/", requireAuth, requireAdmin, (req, res) => {
  const { username, password, fullName, orgRole } = req.body;

  if (!username || !password || !fullName) {
    return res.status(400).json({ error: "username, password, and fullName are required." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return res.status(409).json({ error: "That username is already taken." });
  }

  const hash = bcrypt.hashSync(password, 10);

  const result = db
    .prepare(
      `INSERT INTO users (username, password_hash, full_name, org_role, is_admin)
       VALUES (?, ?, ?, ?, 0)`
    )
    .run(username, hash, fullName, orgRole || "");

  res.status(201).json({ id: result.lastInsertRowid });
});

// GET /api/users/pending  (admin only) - signups waiting on approval,
// oldest first (first come, first reviewed)
router.get("/pending", requireAuth, requireAdmin, (req, res) => {
  const pending = db
    .prepare(
      `SELECT id, username, full_name, org_role, created_at
       FROM users WHERE status = 'pending_approval' ORDER BY created_at ASC`
    )
    .all();
  res.json(
    pending.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      orgRole: u.org_role,
      createdAt: u.created_at,
    }))
  );
});

// PATCH /api/users/:id/approve  (admin only) - activate a pending signup.
// Deliberately the ONLY thing that flips status to 'active' for a
// self-signup — never done from an unauthenticated email link (see mailer.js).
router.patch("/:id/approve", requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user || user.is_admin) {
    return res.status(404).json({ error: "User not found." });
  }
  if (user.status !== "pending_approval") {
    return res.status(400).json({ error: `Can't approve a user in status "${user.status}".` });
  }
  db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(user.id);
  res.json({ success: true });
});

// DELETE /api/users/:id (admin only) - remove a user (and their tasks)
router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user || user.is_admin) {
    return res.status(404).json({ error: "User not found." });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ success: true });
});

// PATCH /api/users/me/role — the "choose your role" step after signup.
// Only works while status is 'pending_role'; moves it to 'pending_approval'
// and emails the admin. Self-signup can pick a job-title/department role
// here, but never is_admin — that flag can only ever be set by the seed
// script in db.js.
router.patch("/me/role", requireAuth, async (req, res) => {
  const { orgRole } = req.body;
  if (!orgRole || typeof orgRole !== "string" || !orgRole.trim()) {
    return res.status(400).json({ error: "Pick a role." });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "Account no longer exists." });
  if (user.status !== "pending_role") {
    return res.status(400).json({ error: "Role has already been set." });
  }

  db.prepare("UPDATE users SET org_role = ?, status = 'pending_approval' WHERE id = ?")
    .run(orgRole.trim().slice(0, 100), user.id);

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);

  try {
    await sendApprovalRequestEmail(updated);
  } catch (err) {
    // Don't fail the request just because the email didn't go out — the
    // admin can still see this person in GET /users/pending either way.
    console.error("[mailer] Failed to send approval request email:", err.message);
  }

  res.json({ success: true, accountStatus: updated.status });
});

// GET /api/users/me  - current logged-in user's own info + progress
router.get("/me", requireAuth, (req, res) => {
  const u = db.prepare("SELECT id, username, full_name, org_role, is_admin, status FROM users WHERE id = ?").get(req.user.id);

  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM tasks WHERE assigned_to = ?`
    )
    .get(u.id);

  const total = totals.total || 0;
  const completed = totals.completed || 0;
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
    status: progressStatus(percent),  // red/yellow/green task-progress color
    accountStatus: u.status,          // pending_role / pending_approval / active
  });
});

export default router;
