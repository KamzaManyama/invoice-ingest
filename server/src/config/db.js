/**
 * MySQL2 connection pool.
 *
 * Security hardening:
 *  - connectionLimit capped at 2 for free-tier hosts (avoids max_user_connections errors)
 *  - queueLimit prevents memory exhaustion under load
 *  - decimalNumbers:true avoids precision loss on financial amounts
 *  - timezone pinned to Africa/Johannesburg (+02:00) — no DST in SA
 *  - Fails loudly on startup if DB_HOST or DB_NAME is missing
 */
import mysql  from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Fail fast — don't silently start with missing credentials
const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[db] Missing required env var: ${key}`);
    process.exit(1);
  }
}

const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  port:               parseInt(process.env.DB_PORT || '3306', 10),
  database:           process.env.DB_NAME,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit:    2,      // safe default for hosted free-tier DBs
  queueLimit:         20,     // queue requests, don't reject under load
  timezone:           '+02:00',
  decimalNumbers:     true,   // return DECIMAL as JS numbers, not strings
  // Prevent SQL injection via charset confusion attacks
  charset:            'utf8mb4',
});

// Verify connectivity on startup
pool.getConnection()
  .then(conn => {
    console.log(`[db] ✓ Connected → ${process.env.DB_HOST}/${process.env.DB_NAME}`);
    conn.release();
  })
  .catch(err => {
    console.error(`[db] ✗ Connection failed: ${err.message}`);
    // Don't exit — let health endpoint report the failure
  });

export default pool;