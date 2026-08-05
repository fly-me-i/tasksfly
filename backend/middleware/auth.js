// middleware/auth.js
// Small helper functions ("middleware") that run before a route handler
// to check who is making the request.

import jwt from "jsonwebtoken";
import { pool } from "../db.js";

// requireAuth: makes sure the request has a valid login token.
// The frontend sends the token in the "Authorization: Bearer <token>" header.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Not logged in." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, username, isAdmin }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired, please log in again." });
  }
}

// requireAdmin: run AFTER requireAuth. Blocks non-admins.
export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: "Admins only." });
  }
  next();
}

// requireActive: run AFTER requireAuth. Blocks anyone still going through
// onboarding (pending_role / pending_approval) from touching task/user data.
//
// This deliberately re-reads status from the database instead of trusting
// a claim baked into the JWT at login time. A JWT can stay valid for up to
// 7 days (see routes/auth.js), so if approval were only checked at login,
// someone approved mid-session would have to log out and back in before the
// change actually took effect — and worse, someone REJECTED would keep
// working until their old token expired.
//
// This is now `async` and wrapped in try/catch: Postgres is a network call
// (unlike better-sqlite3's free in-process lookup), and Express won't catch
// a rejected promise thrown inside a plain middleware function on its own —
// see asyncHandler.js for the same issue in route handlers.
export async function requireActive(req, res, next) {
  if (req.user?.isAdmin) return next();

  try {
    const { rows } = await pool.query("SELECT status FROM users WHERE id = $1", [req.user.id]);
    const row = rows[0];
    if (!row) {
      return res.status(401).json({ error: "Account no longer exists." });
    }
    if (row.status !== "active") {
      return res.status(403).json({
        error: "Your account isn't approved yet.",
        status: row.status,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}
