/**
 * Gmail OAuth2 client — shared by email sender and Gmail poller.
 *
 * One-time setup:
 *   node src/config/gmailAuth.js
 *   → Follow the printed URL, paste the authorisation code
 *   → Copy GMAIL_REFRESH_TOKEN to .env
 */
import { google }  from 'googleapis';
import dotenv      from 'dotenv';
import readline    from 'readline';

dotenv.config();

export function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
  );
  client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return client;
}

export function getGmailClient() {
  return google.gmail({ version: 'v1', auth: getOAuthClient() });
}

// ── One-time token helper (run this file directly) ────────────────────────
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
  console.log('\n[gmailAuth] Paste the authorisation code below:\n');
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', async code => {
    rl.close();
    const { tokens } = await client.getToken(code.trim());
    console.log('\n[gmailAuth] Add to your .env:\n');
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    process.exit(0);
  });
}