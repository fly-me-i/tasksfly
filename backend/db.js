// db.js
// This file sets up our PostgreSQL database connection and schema.
//
// We moved off SQLite because SQLite stores the whole database as a single
// file on local disk. That's fine for local dev, but most free hosting
// platforms wipe local disk on every redeploy or restart, which would
// silently erase all your data. Postgres is a real database *server* your
// backend connects to over the network, so the data lives independently of
// your app's container and survives restarts, redeploys, even switching
// hosts entirely.
//
// `pg` (node-postgres) gives us a "Pool" — a small set of reusable
// connections. You don't manually open/close a connection per query, you
// just call pool.query(...) and it borrows one, runs your query, hands it
// back.

import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL. Copy .env.example to .env and set it before starting.");
  process.exit(1);
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Hosted Postgres providers (Supabase, Neon, Render Postgres, etc.) require
  // an SSL connection. A local Postgres you're running yourself usually
  // isn't set up with SSL certs at all, so we only turn SSL on when we're
  // NOT talking to localhost.
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

try {
  // --- Create tables if they don't already exist ---
  // Syntax differences vs. the old SQLite version:
  //   - INTEGER PRIMARY KEY AUTOINCREMENT  ->  SERIAL PRIMARY KEY
  //   - INTEGER used as a 0/1 boolean      ->  a real BOOLEAN column
  //   - datetime('now')                    ->  TO_CHAR(NOW() AT TIME ZONE 'UTC', ...)
  //     Kept as a formatted TEXT string (not a native timestamp column) on
  //     purpose — it reproduces SQLite's exact "YYYY-MM-DD HH:MM:SS" output,
  //     which is the format frontend/src/pages/AdminDashboard.jsx already
  //     expects (see its formatLogTime comment). A native timestamp column
  //     would come back from Postgres as a JS Date and break that parsing.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      org_role TEXT NOT NULL DEFAULT '',
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      -- Self-signup onboarding state. Admin-created users (via POST /api/users)
      -- skip straight to 'active' — the admin creating them IS the approval.
      -- Self-signups start at 'pending_role' -> 'pending_approval' -> 'active'.
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
    );
  `);

  // Migration for databases created before the `status` column existed.
  // Postgres's "ADD COLUMN IF NOT EXISTS" does this in one line — no need
  // for SQLite's separate check-then-alter dance.
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      assigned_to INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_by INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'completed'
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
      completed_at TEXT
    );
  `);

  // Audit trail of every task update. Deliberately has NO foreign-key
  // constraints on task_id/user_id, and stores task_title/user_name as
  // snapshots taken at the moment of the action, so history survives the
  // task being deleted or the user leaving the team.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_logs (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL,
      task_title TEXT NOT NULL,
      user_id INTEGER,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,        -- 'created' | 'completed' | 'reopened' | 'deleted'
      from_status TEXT,
      to_status TEXT,
      created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
    );
  `);

  // --- Seed the first admin account if no admin exists yet ---
  const {
    rows: [{ count }],
  } = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE is_admin = TRUE");

  if (count === 0) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || "admin123";
    const hash = bcrypt.hashSync(password, 10);

    await pool.query(
      `INSERT INTO users (username, password_hash, full_name, org_role, is_admin)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [username, hash, "Administrator", "Admin"]
    );

    console.log(`\nSeeded first admin account -> username: "${username}", password: "${password}"`);
    console.log("Please log in and change this password setup as needed.\n");
  }
} catch (err) {
  console.error("Couldn't set up the database. Check that DATABASE_URL is correct and reachable.");
  console.error(err.message);
  process.exit(1);
}
