import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

/**
 * MySQL2 promise-based connection pool.
 * mysql2 uses a slightly different API than pg:
 *  - pool.execute(sql, params) for prepared statements (preferred)
 *  - pool.query(sql, params)   for raw queries
 * Both return [rows, fields].
 */
const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  database:           process.env.DB_NAME     || 'supplier_ingest',
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+02:00', // Africa/Johannesburg (UTC+2, no DST)
  decimalNumbers:     true,     // return DECIMAL columns as JS numbers
});

export default pool;
