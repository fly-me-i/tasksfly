# Task Manager (learning project)

A small full-stack app:
- **Admin** creates team members, assigns tasks, and sees everyone's progress.
- **Team members** log in, see their own tasks, mark them done, and see their
  own progress as a red / yellow / green bar (<33% red, 33–66% yellow, >66% green).

## Stack (and why)

| Piece | Tool | Why |
|---|---|---|
| Database | **SQLite** (via `better-sqlite3`) | Open-source, zero setup — it's just a file (`taskmanager.db`), perfect for a small number of users. No separate database server to install. |
| Backend API | **Node.js + Express** | Simple, widely-used way to expose a REST API that the React app talks to. |
| Auth | **JWT (JSON Web Tokens)** + `bcryptjs` | Passwords are hashed (never stored in plain text); logins get a signed token stored in the browser. |
| Frontend | **React + Vite** | What you're learning. Vite gives fast reloads while you develop. |

## Project structure

```
taskmanager/
  backend/          Express API + SQLite database
    server.js       Starts the server
    db.js           Creates tables, seeds the first admin account
    routes/         auth.js, users.js, tasks.js
    middleware/auth.js
  frontend/         React app (Vite)
    src/
      App.jsx
      context/AuthContext.jsx   who is logged in, shared everywhere
      pages/Login.jsx
      pages/AdminDashboard.jsx
      pages/UserDashboard.jsx
      components/ProgressBar.jsx
```

## 1. Run the backend

```bash
cd backend
npm install
cp .env.example .env
# open .env and set JWT_SECRET to any long random string
npm run dev
```

You should see:
```
Task Manager API running at http://localhost:4000
Seeded first admin account -> username: "admin", password: "admin123"
```

That admin account is created automatically the very first time (because the
`users` table is empty). Note the username/password it prints — that's how
you'll log in as admin. Change `ADMIN_USERNAME`/`ADMIN_PASSWORD` in `.env`
*before* the first run if you want different starting credentials.

## 2. Run the frontend

Open a **second terminal**:

```bash
cd frontend
npm install
npm run dev
```

Open the URL it prints (usually **http://localhost:5173**).

## 3. Try it out

1. Log in as `admin` / `admin123` (or whatever you set).
2. Add a team member (this creates their login).
3. Assign them a task.
4. Log out, log back in as that team member, mark the task complete.
5. Log back in as admin — you'll see their progress bar update.

## How progress/color is calculated

For each user: `percent = (completed tasks / total tasks assigned) * 100`,
rounded to a whole number. That maps to a color in
`backend/routes/users.js` (function `progressStatus`):
- `< 33%` → red
- `33%–65%` → yellow
- `>= 66%` → green

If you want different thresholds, that's the one function to edit — the
frontend (`ProgressBar.jsx`) just reads whatever `status` the backend sends.

## Next steps to try (good for learning)

- Add due-date reminders or overdue highlighting.
- Let users edit their own password.
- Add task priority levels.
- Deploy: backend to somewhere like Render/Fly.io, frontend to Vercel/Netlify
  (swap `http://localhost:4000` in `frontend/src/api.js` for your deployed
  backend URL).
