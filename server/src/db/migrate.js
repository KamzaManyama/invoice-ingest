import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
 
dotenv.config();
 
const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  port:               parseInt(process.env.DB_PORT || '3306'),
  database:           process.env.DB_NAME,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+02:00',
  decimalNumbers:     true,
});
 
// Test the connection on startup so you know immediately if credentials are wrong
pool.getConnection()
  .then(conn => {
    console.log(`[db] Connected to MySQL → ${process.env.DB_HOST}/${process.env.DB_NAME}`);
    conn.release();
  })
  .catch(err => {
    console.error(`[db] Connection failed: ${err.message}`);
    console.error(`[db] Check your .env — DB_HOST, DB_NAME, DB_USER, DB_PASSWORD`);
  });
 
export default pool;