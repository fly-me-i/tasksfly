// taskLog.js
// One helper, one job: write a row to task_logs. Called from routes/tasks.js
// every time a task is created, completed/reopened, or deleted.

import { pool } from "./db.js";

/**
 * @param {object} entry
 * @param {number} entry.taskId
 * @param {string} entry.taskTitle
 * @param {number} entry.userId    - who performed the action
 * @param {string} entry.userName
 * @param {"created"|"completed"|"reopened"|"deleted"} entry.action
 * @param {string|null} entry.fromStatus
 * @param {string|null} entry.toStatus
 */
export async function logTaskEvent({ taskId, taskTitle, userId, userName, action, fromStatus = null, toStatus = null }) {
  await pool.query(
    `INSERT INTO task_logs (task_id, task_title, user_id, user_name, action, from_status, to_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [taskId, taskTitle, userId, userName, action, fromStatus, toStatus]
  );
}
