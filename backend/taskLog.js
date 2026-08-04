// taskLog.js
// One helper, one job: write a row to task_logs. Called from routes/tasks.js
// every time a task is created, completed/reopened, or deleted.

import db from "./db.js";

const insert = db.prepare(`
  INSERT INTO task_logs (task_id, task_title, user_id, user_name, action, from_status, to_status)
  VALUES (@task_id, @task_title, @user_id, @user_name, @action, @from_status, @to_status)
`);

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
export function logTaskEvent({ taskId, taskTitle, userId, userName, action, fromStatus = null, toStatus = null }) {
  insert.run({
    task_id: taskId,
    task_title: taskTitle,
    user_id: userId,
    user_name: userName,
    action,
    from_status: fromStatus,
    to_status: toStatus,
  });
}
