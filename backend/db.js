// db.js
// This file sets up our SQLite database. SQLite stores the whole database
// as a single file (taskmanager.db) sitting right next to this script -
// there's no separate database server to install or run, which makes it
// a great open-source DBMS choice for a small app with only a few users.

import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import "dotenv/config";

const db = new Database("taskmanager.db");
db.pragma("journal_mode = WAL"); // safer + faster writes
db.pragma("foreign_keys = ON"); // enforce the REFERENCES ... ON DELETE CASCADE below

// --- Create tables if they don't already exist ---

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    org_role TEXT NOT NULL DEFAULT '',   -- the user's role/title in the organization
    is_admin INTEGER NOT NULL DEFAULT 0, -- 0 = normal user, 1 = admin
    -- Self-signup onboarding state. Admin-created users (via POST /api/users)
    -- skip straight to 'active' — the admin creating them IS the approval.
    -- Self-signups start at 'pending_role' -> 'pending_approval' -> 'active'.
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration for databases created before the `status` column existed —
// CREATE TABLE IF NOT EXISTS above is a no-op on an already-existing table,
// so anyone with an existing taskmanager.db needs this to catch up.
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes("status")) {
  db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    assigned_to INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'completed'
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );
`);

// Audit trail of every task update. Deliberately has NO foreign-key
// constraints on task_id/user_id, and stores task_title/user_name as
// snapshots taken at the moment of the action. An audit log's whole job is
// to answer "who did what, when" — including after the task is deleted or
// the user has left the team, so it must not cascade away with either of
// them (that's why tasks.assigned_to above CAN cascade, but this can't).
db.exec(`
  CREATE TABLE IF NOT EXISTS task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    task_title TEXT NOT NULL,
    user_id INTEGER,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,        -- 'created' | 'completed' | 'reopened' | 'deleted'
    from_status TEXT,
    to_status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// --- Seed the first admin account if no admin exists yet ---
const adminExists = db
  .prepare("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1")
  .get();

if (adminExists.count === 0) {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const hash = bcrypt.hashSync(password, 10);

  db.prepare(
    `INSERT INTO users (username, password_hash, full_name, org_role, is_admin)
     VALUES (?, ?, ?, ?, 1)`
  ).run(username, hash, "Administrator", "Admin");

  console.log(`\nSeeded first admin account -> username: "${username}", password: "${password}"`);
  console.log("Please log in and change this password setup as needed.\n");
}

export default db;
