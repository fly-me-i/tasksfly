// server.js
// Entry point for the backend API server.

import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import taskRoutes from "./routes/tasks.js";

if (!process.env.JWT_SECRET) {
  console.error("Missing JWT_SECRET. Copy .env.example to .env and set one before starting.");
  process.exit(1);
}

const app = express();

// If FRONTEND_URL is set (i.e. we're deployed), only accept requests from
// that origin. Left unset, CORS stays wide open for local dev, where the
// frontend can be running on any port.
app.use(
  cors(
    process.env.FRONTEND_URL
      ? { origin: process.env.FRONTEND_URL }
      : undefined
  )
);
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Catches any error passed to next(err) — which now includes every database
// error, thanks to the asyncHandler wrapper used throughout routes/. Without
// this, a failed query would leave the request hanging with no response at
// all (see asyncHandler.js for why). Must be defined AFTER all routes.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Task Manager API running at http://localhost:${PORT}`);
});
