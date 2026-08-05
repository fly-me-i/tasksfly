// routes/auth.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

const router = Router();

function issueToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, isAdmin: !!user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function toUserPayload(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    orgRole: user.org_role,
    isAdmin: !!user.is_admin,
    // Onboarding stage: pending_role -> pending_approval -> active.
    // NOT the same as the red/yellow/green "status" GET /users/me returns for
    // task progress — that's a different concept that happens to share the
    // word "status" in casual speech, so this gets its own field name.
    accountStatus: user.status,
  };
}

// POST /api/auth/signup — self-service account creation.
// Starts at status 'pending_role': no org_role yet, and NOT allowed into
// the dashboard (requireActive blocks that) until an admin approves them.
// Always creates a normal (non-admin) account — self-signup can never grant
// admin access, regardless of anything the client sends.
router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const { username, password, fullName } = req.body;

    if (!username || !password || !fullName) {
      return res.status(400).json({ error: "Full name, username, and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const { rows: existingRows } = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    if (existingRows[0]) {
      return res.status(409).json({ error: "That username is already taken." });
    }

    const hash = bcrypt.hashSync(password, 10);

    // RETURNING * gets us the full new row in the same round-trip — Postgres
    // has no equivalent of better-sqlite3's lastInsertRowid, so this replaces
    // the separate follow-up SELECT the SQLite version needed.
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, org_role, is_admin, status)
       VALUES ($1, $2, $3, '', FALSE, 'pending_role')
       RETURNING *`,
      [username, hash, fullName]
    );
    const user = rows[0];
    const token = issueToken(user);

    res.status(201).json({ token, user: toUserPayload(user) });
  })
);

// POST /api/auth/login
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = rows[0];

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = issueToken(user);

    res.json({ token, user: toUserPayload(user) });
  })
);

export default router;
