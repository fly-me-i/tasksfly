// routes/auth.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../db.js";

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
router.post("/signup", (req, res) => {
  const { username, password, fullName } = req.body;

  if (!username || !password || !fullName) {
    return res.status(400).json({ error: "Full name, username, and password are required." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return res.status(409).json({ error: "That username is already taken." });
  }

  const hash = bcrypt.hashSync(password, 10);

  const result = db
    .prepare(
      `INSERT INTO users (username, password_hash, full_name, org_role, is_admin, status)
       VALUES (?, ?, ?, '', 0, 'pending_role')`
    )
    .run(username, hash, fullName);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
  const token = issueToken(user);

  res.status(201).json({ token, user: toUserPayload(user) });
});

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const token = issueToken(user);

  res.json({ token, user: toUserPayload(user) });
});

export default router;
