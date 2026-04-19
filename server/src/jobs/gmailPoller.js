/**
 * Gmail Poller — incremental polling for supplier invoice attachments.
 *
 * Strategy:
 *  - Uses Gmail History API to fetch only messages since the last known historyId.
 *  - Filters to a configurable Gmail label (default: "supplier-invoices").
 *  - Downloads .csv attachments and runs them through the ingest pipeline.
 *  - Persists the latest historyId in MySQL to survive restarts.
 *
 * Run manually: npm run gmail:poll
 * Run on a schedule: use node-cron, a cron job, or any process scheduler.
 */
import { getGmailClient } from '../config/gmailAuth.js';
import { runIngestPipeline } from '../services/ingestPipeline.js';
import { getGmailHistoryId, setGmailHistoryId } from '../services/invoiceService.js';
import dotenv from 'dotenv';

dotenv.config();

const LABEL_NAME    = process.env.GMAIL_LABEL    || 'supplier-invoices';
const POLL_INTERVAL = parseInt(process.env.GMAIL_POLL_INTERVAL_MS || '60000'); // 1 min default
const DRY_RUN       = process.env.DRY_RUN === 'true';

/**
 * Fetch the Gmail label ID for LABEL_NAME.
 */
async function getLabelId(gmail) {
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  const label = data.labels.find((l) => l.name === LABEL_NAME);
  if (!label) {
    throw new Error(
      `Gmail label "${LABEL_NAME}" not found. Create it in Gmail and set GMAIL_LABEL in .env.`
    );
  }
  return label.id;
}

/**
 * Download an attachment as a Buffer.
 */
async function fetchAttachment(gmail, messageId, attachmentId) {
  const { data } = await gmail.users.messages.attachments.get({
    userId:       'me',
    messageId,
    id:           attachmentId,
  });
  // Gmail returns base64url-encoded data
  const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

/**
 * Process a single Gmail message — find CSV attachments and ingest them.
 */
async function processMessage(gmail, messageId) {
  const { data: msg } = await gmail.users.messages.get({
    userId: 'me',
    id:     messageId,
    format: 'full',
  });

  const parts = msg.payload?.parts ?? [];

  for (const part of parts) {
    const filename = part.filename ?? '';
    const isCSV = filename.toLowerCase().endsWith('.csv');
    const attachmentId = part.body?.attachmentId;

    if (!isCSV || !attachmentId) continue;

    console.log(`[gmailPoller] Found attachment: ${filename} (msg ${messageId})`);

    try {
      const buffer = await fetchAttachment(gmail, messageId, attachmentId);
      const result = await runIngestPipeline(buffer, filename, DRY_RUN, 'gmail');
      console.log(
        `[gmailPoller] ${filename}: inserted=${result.metrics.inserted} ` +
        `dup=${result.metrics.duplicates} failed=${result.metrics.failed}`
      );
    } catch (err) {
      console.error(`[gmailPoller] Failed to ingest ${filename}:`, err.message);
    }
  }
}

/**
 * One polling cycle.
 */
async function pollOnce() {
  const gmail   = getGmailClient();
  const labelId = await getLabelId(gmail);
  const savedHistoryId = await getGmailHistoryId();

  // First run — no history yet; get current historyId and return.
  if (savedHistoryId === 0) {
    const { data: profile } = await gmail.users.getProfile({ userId: 'me' });
    await setGmailHistoryId(profile.historyId);
    console.log(`[gmailPoller] Initialised with historyId=${profile.historyId}. Next poll will fetch new messages.`);
    return;
  }

  let pageToken;
  let latestHistoryId = savedHistoryId;
  const messageIds = new Set();

  // Walk history pages
  do {
    const { data } = await gmail.users.history.list({
      userId:        'me',
      startHistoryId: String(savedHistoryId),
      labelId,
      historyTypes:  ['messageAdded'],
      pageToken,
    });

    if (data.historyId) latestHistoryId = data.historyId;

    for (const entry of data.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        messageIds.add(added.message.id);
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  console.log(`[gmailPoller] ${messageIds.size} new message(s) to check.`);

  for (const id of messageIds) {
    await processMessage(gmail, id);
  }

  if (latestHistoryId !== savedHistoryId) {
    await setGmailHistoryId(latestHistoryId);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────
async function run() {
  console.log(`[gmailPoller] Starting — label="${LABEL_NAME}", interval=${POLL_INTERVAL}ms`);

  const tick = async () => {
    try {
      await pollOnce();
    } catch (err) {
      console.error('[gmailPoller] Poll error:', err.message);
    }
  };

  await tick();
  setInterval(tick, POLL_INTERVAL);
}

run();
