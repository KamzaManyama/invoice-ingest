/**
 * Email service — Gmail OAuth2 via nodemailer.
 *
 * sendMail:    generic transactional email (welcome, reset, invites)
 * sendIngestAlert: post-ingest summary email
 *
 * Security notes:
 *  - OAuth2 refresh tokens avoid storing passwords
 *  - All user-supplied data is HTML-escaped before inserting into email bodies
 *  - ALERT_TO and GMAIL_USER are read from env, never from request
 */
import nodemailer         from 'nodemailer';
import { getOAuthClient } from '../config/gmailAuth.js';
import dotenv             from 'dotenv';

dotenv.config();

function buildTransporter() {
  const oauth2Client = getOAuthClient();
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type:         'OAuth2',
      user:         process.env.GMAIL_USER,
      clientId:     process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken:  oauth2Client.credentials?.access_token,
    },
  });
}

function isEmailConfigured() {
  return !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_USER && process.env.GMAIL_REFRESH_TOKEN);
}

/**
 * Generic email send.
 * @param {{ to: string, subject: string, html: string }} opts
 */
export async function sendMail({ to, subject, html }) {
  if (!isEmailConfigured()) {
    console.warn(`[email] Gmail not configured — skipping: "${subject}"`);
    return;
  }

  try {
    const t = buildTransporter();
    await t.sendMail({
      from:    `"Invoq" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`[email] ✓ Sent "${subject}" → ${to}`);
  } catch (err) {
    console.error(`[email] ✗ Failed to send "${subject}": ${err.message}`);
    throw err;
  }
}

/**
 * Post-ingest summary alert.
 * All string interpolations are HTML-escaped.
 */
export async function sendIngestAlert({
  orgName, userEmail, fileName, processed, inserted, duplicates, failed, errors = [], dryRun, source = 'upload',
}) {
  if (!isEmailConfigured()) return;

  const to = userEmail || process.env.ALERT_TO;
  if (!to) return;

  const subject = `${dryRun ? '[DRY-RUN] ' : ''}Invoq Ingest: ${inserted} saved, ${duplicates} dup, ${failed} failed`;

  const errorRows = errors.slice(0, 20).map(e => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(e.invoice_number)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(e.supplier_number)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#b91c1c">${esc(e.reason)}</td>
    </tr>`).join('');

  const sourceLabel = { upload: 'Manual Upload', gmail: 'Gmail Attachment', webhook: 'Webhook' }[source] || source;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;color:#222">
      <div style="background:#1a1916;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0">
        <span style="font-size:18px;font-weight:700">Invoq</span>
        ${dryRun ? '<span style="background:#f59e0b;color:#fff;font-size:11px;padding:2px 8px;border-radius:4px;margin-left:8px">DRY-RUN</span>' : ''}
      </div>
      <div style="border:1px solid #e0e0e0;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px">
        <table style="font-size:14px;margin-bottom:16px;color:#555">
          <tr><td style="padding-right:16px">Organisation</td><td><strong>${esc(orgName || '')}</strong></td></tr>
          <tr><td style="padding-right:16px">File</td><td><strong>${esc(fileName)}</strong></td></tr>
          <tr><td style="padding-right:16px">Source</td><td>${esc(sourceLabel)}</td></tr>
          <tr><td style="padding-right:16px">Time</td><td>${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</td></tr>
        </table>
        <table style="border-collapse:collapse;width:100%;font-size:15px">
          <tr><td style="padding:10px 14px;background:#f3f4f6;font-weight:bold">Processed</td><td style="padding:10px 14px">${processed}</td></tr>
          <tr><td style="padding:10px 14px;background:#dcfce7;font-weight:bold;color:#166534">Saved</td><td style="padding:10px 14px">${inserted}</td></tr>
          <tr><td style="padding:10px 14px;background:#fef3c7;font-weight:bold;color:#92400e">Duplicates</td><td style="padding:10px 14px">${duplicates}</td></tr>
          <tr><td style="padding:10px 14px;background:#fee2e2;font-weight:bold;color:#991b1b">Errors</td><td style="padding:10px 14px">${failed}</td></tr>
        </table>
        ${errors.length > 0 ? `
          <h3 style="color:#991b1b;margin-top:24px">Failed rows (first 20)</h3>
          <table style="border-collapse:collapse;font-size:13px;width:100%">
            <thead><tr style="background:#f9fafb;text-align:left">
              <th style="padding:6px 10px">Invoice #</th>
              <th style="padding:6px 10px">Supplier #</th>
              <th style="padding:6px 10px">Reason</th>
            </tr></thead>
            <tbody>${errorRows}</tbody>
          </table>
          ${errors.length > 20 ? `<p style="font-size:12px;color:#9ca3af;margin-top:8px">…and ${errors.length - 20} more.</p>` : ''}
        ` : '<p style="color:#166534;margin-top:16px">✓ No errors.</p>'}
      </div>
    </div>`;

  await sendMail({ to, subject, html });
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}