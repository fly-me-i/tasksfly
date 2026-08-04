// mailer.js
// Sends the admin a notification when a new signup has chosen their role
// and is ready for approval.
//
// If SMTP_* env vars aren't set, this falls back to printing the email to
// the console instead of failing — same "just works, upgrade when ready"
// idea as the seeded admin account in db.js. That means you can build and
// test the whole signup -> choose role -> notify -> approve flow before
// you've set up a real mail provider.

import nodemailer from "nodemailer";

const isMailConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
);

let transporter = null;
if (isMailConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465, // true for port 465, false for 587/others
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Notify the admin that `user` picked their role and is waiting for approval.
 * Intentionally just a NOTIFICATION — it links to the admin dashboard rather
 * than embedding an approve/reject action in the email itself. Approving
 * someone is a state change, and state changes should require the admin to
 * actually be authenticated when they happen (the same rule requireAdmin
 * enforces everywhere else in this app) — a bare link an email client could
 * prefetch, or that could be forwarded, must never be able to approve a
 * user on its own.
 */
export async function sendApprovalRequestEmail(user) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const dashboardUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/dashboard`;

  const subject = `Task Manager: ${user.full_name} is waiting for approval`;
  const text = [
    `${user.full_name} (username: ${user.username}) just signed up and selected`,
    `the role "${user.org_role}".`,
    ``,
    `Log in to the admin dashboard to approve or reject them:`,
    dashboardUrl,
  ].join("\n");

  if (!adminEmail) {
    console.warn("[mailer] ADMIN_EMAIL is not set — skipping approval notification email.");
    return { sent: false, reason: "ADMIN_EMAIL not configured" };
  }

  if (!transporter) {
    console.log("\n[mailer] SMTP isn't configured, so here's the email that would have been sent:");
    console.log(`  To: ${adminEmail}\n  Subject: ${subject}\n  ${text.replace(/\n/g, "\n  ")}\n`);
    return { sent: false, reason: "SMTP not configured (printed to console instead)" };
  }

  await transporter.sendMail({
    from: process.env.MAIL_FROM || `"Task Manager" <${process.env.SMTP_USER}>`,
    to: adminEmail,
    subject,
    text,
  });
  return { sent: true };
}
