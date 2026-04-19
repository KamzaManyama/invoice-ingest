/**
 * Email alert service — sends ingest summary using Gmail via OAuth2 + nodemailer.
 *
 * Why nodemailer + OAuth2 instead of raw Gmail API send?
 * nodemailer handles MIME encoding and attachment building reliably;
 * we just swap the transport to use Gmail OAuth2 tokens.
 */
import nodemailer from 'nodemailer';
import { getOAuthClient } from '../config/gmailAuth.js';
import dotenv from 'dotenv';

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

/**
 * Send a post-ingest summary alert email.
 *
 * @param {object} params
 * @param {string} params.fileName
 * @param {number} params.processed
 * @param {number} params.inserted
 * @param {number} params.duplicates
 * @param {number} params.failed
 * @param {Array<{invoice_number:string, supplier_number:string, reason:string}>} params.errors
 * @param {boolean} params.dryRun
 * @param {string} [params.source]  - 'upload' | 'gmail' | 'webhook'
 */
export async function sendIngestAlert({
  fileName, processed, inserted, duplicates, failed, errors, dryRun, source = 'upload',
}) {
  const to = process.env.ALERT_TO;
  if (!to || !process.env.GMAIL_CLIENT_ID) {
    console.warn('[email] Gmail OAuth not configured — skipping alert.');
    return;
  }

  const subject =
    `${dryRun ? '[DRY-RUN] ' : ''}Supplier Ingest: ${inserted} ok, ${duplicates} dup, ${failed} failed`;

  const errorRows = errors.slice(0, 20).map((e) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escHtml(e.invoice_number)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escHtml(e.supplier_number)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#c0392b;">${escHtml(e.reason)}</td>
    </tr>`).join('');

  const errorSection = errors.length > 0 ? `
    <h3 style="color:#c0392b;margin-top:24px;">Failed / Invalid Rows (max 20 shown)</h3>
    <table style="border-collapse:collapse;font-size:13px;width:100%;">
      <thead>
        <tr style="background:#f5f5f5;text-align:left;">
          <th style="padding:6px 10px;">Invoice #</th>
          <th style="padding:6px 10px;">Supplier #</th>
          <th style="padding:6px 10px;">Reason</th>
        </tr>
      </thead>
      <tbody>${errorRows}</tbody>
    </table>
    ${errors.length > 20 ? `<p style="font-size:12px;color:#999;">…and ${errors.length - 20} more.</p>` : ''}
  ` : '<p style="color:#27ae60;">✓ No errors.</p>';

  const sourceLabel = { upload: 'Manual Upload', gmail: 'Gmail Attachment', webhook: 'Webhook' }[source] ?? source;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;color:#222;">
      <div style="background:#0d0d0d;color:#f5f2ec;padding:18px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">Supplier Invoice Ingest Report</h2>
        ${dryRun ? '<span style="background:#e67e22;color:#fff;font-size:11px;padding:2px 8px;border-radius:4px;">DRY-RUN</span>' : ''}
      </div>
      <div style="border:1px solid #e0e0e0;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px;">
        <table style="font-size:14px;margin-bottom:16px;">
          <tr><td style="color:#888;padding-right:16px;">Source</td><td><strong>${escHtml(sourceLabel)}</strong></td></tr>
          <tr><td style="color:#888;padding-right:16px;">File</td><td><strong>${escHtml(fileName)}</strong></td></tr>
          <tr><td style="color:#888;padding-right:16px;">Time</td><td>${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</td></tr>
        </table>
        <table style="border-collapse:collapse;width:100%;font-size:15px;">
          <tr><td style="padding:10px 14px;background:#ecf0f1;font-weight:bold;">Processed</td><td style="padding:10px 14px;">${processed}</td></tr>
          <tr><td style="padding:10px 14px;background:#d5f5e3;font-weight:bold;color:#1e8449;">Inserted</td><td style="padding:10px 14px;">${inserted}</td></tr>
          <tr><td style="padding:10px 14px;background:#fef9e7;font-weight:bold;color:#b7950b;">Duplicates</td><td style="padding:10px 14px;">${duplicates}</td></tr>
          <tr><td style="padding:10px 14px;background:#fadbd8;font-weight:bold;color:#c0392b;">Failed</td><td style="padding:10px 14px;">${failed}</td></tr>
        </table>
        ${errorSection}
      </div>
    </div>`;

  const transporter = buildTransporter();
  await transporter.sendMail({
    from: `"Supplier Ingest" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });

  console.log(`[email] Alert sent to ${to} (source: ${sourceLabel})`);
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
