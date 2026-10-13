import nodemailer, { type Transporter } from "nodemailer";
import { env, features } from "../config/env.js";
import { logger } from "../utils/logger.js";

let transporter: Transporter | null = null;

function getTransporter() {
  if (!features.smtp) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

/**
 * Sends an email. Never throws – a failing mail server must not break the request
 * that triggered it. Without SMTP configured (local dev) the subject is logged instead.
 */
export async function sendEmail(to: string, { subject, html }: { subject: string; html: string }) {
  const tx = getTransporter();
  if (!tx) {
    logger.warn(`[email disabled] to=${to} subject="${subject}"`);
    return false;
  }
  try {
    await tx.sendMail({ from: env.MAIL_FROM, to, subject, html });
    return true;
  } catch (err) {
    logger.error(`Failed to send email to ${to}:`, (err as Error).message);
    return false;
  }
}
