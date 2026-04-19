/**
 * Gmail OAuth2 client — shared across email sender and Gmail poller.
 *
 * Setup steps:
 *  1. Create a Google Cloud project and enable the Gmail API.
 *  2. Create OAuth2 credentials (Desktop app type).
 *  3. Run `node src/config/gmailAuth.js` once to get your refresh token.
 *  4. Paste the values into .env.
 */
import { google } from 'googleapis';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

export function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
  );

  client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  return client;
}

export function getGmailClient() {
  return google.gmail({ version: 'v1', auth: getOAuthClient() });
}

// ── One-time token setup (run this file directly) ─────────────────────────
if (process.argv[1]?.endsWith('gmailAuth.js')) {
  const client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    prompt: 'consent',
  });

  console.log('\n[gmailAuth] Open this URL in your browser:\n');
  console.log(url);
  console.log('\n[gmailAuth] Paste the code below:\n');

  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', async (code) => {
    rl.close();
    const { tokens } = await client.getToken(code.trim());
    console.log('\n[gmailAuth] Add these to your .env:\n');
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    process.exit(0);
  });
}
