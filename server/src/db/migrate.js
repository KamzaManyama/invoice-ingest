/**
 * Invoq — Database schema migration
 * Compatible with MySQL 5.6+ (no UUID() defaults, no JSON type, no DATETIME(3))
 * Run once: npm run db:migrate
 */
import pool from '../config/db.js';

const TABLES = [

  // ── Organisations (tenants) ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS organisations (
    id                 CHAR(36)       NOT NULL,
    name               VARCHAR(255)   NOT NULL,
    trading_name       VARCHAR(255),
    vat_number         VARCHAR(20),
    cipc_number        VARCHAR(30),
    plan               ENUM('free','starter','business','enterprise') NOT NULL DEFAULT 'free',
    vat_rate           DECIMAL(5,2)   NOT NULL DEFAULT 15.00,
    approval_threshold DECIMAL(12,2),
    timezone           VARCHAR(60)    NOT NULL DEFAULT 'Africa/Johannesburg',
    stripe_customer_id VARCHAR(100),
    stripe_sub_id      VARCHAR(100),
    created_at         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Users ────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
    id            CHAR(36)       NOT NULL,
    org_id        CHAR(36)       NOT NULL,
    first_name    VARCHAR(100)   NOT NULL,
    last_name     VARCHAR(100)   NOT NULL DEFAULT '',
    email         VARCHAR(255)   NOT NULL,
    password_hash VARCHAR(255)   NOT NULL,
    role          ENUM('super_admin','owner','admin','finance_manager','approver','viewer') NOT NULL DEFAULT 'finance_manager',
    status        ENUM('active','invited','suspended') NOT NULL DEFAULT 'active',
    reset_token   VARCHAR(255),
    reset_expires TIMESTAMP      NULL,
    last_login    TIMESTAMP      NULL,
    created_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_email   (email),
    KEY idx_org_id        (org_id),
    KEY idx_reset_token   (reset_token)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Supplier invoices ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS supplier_invoices (
    id               CHAR(36)       NOT NULL,
    org_id           CHAR(36)       NOT NULL,
    invoice_number   VARCHAR(255)   NOT NULL,
    supplier_number  VARCHAR(255)   NOT NULL,
    supplier_name    VARCHAR(255)   NOT NULL,
    department       VARCHAR(255)   NOT NULL,
    amount_excl_vat  DECIMAL(12,2)  NOT NULL,
    vat              DECIMAL(12,2)  NOT NULL,
    amount_incl_vat  DECIMAL(12,2)  NOT NULL,
    invoice_date     DATE           NOT NULL,
    source_file_name VARCHAR(500),
    source_hash      VARCHAR(64),
    ingest_timestamp TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_by      CHAR(36),
    approved_by      CHAR(36),
    approved_at      TIMESTAMP      NULL,
    status           ENUM('inserted','duplicate','failed','pending','approved','rejected') NOT NULL,
    validation_notes TEXT,
    PRIMARY KEY (id),
    UNIQUE KEY uq_org_invoice (org_id, supplier_number, invoice_number),
    KEY idx_org_status    (org_id, status),
    KEY idx_org_date      (org_id, invoice_date),
    KEY idx_org_ts        (org_id, ingest_timestamp),
    KEY idx_org_supplier  (org_id, supplier_number)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Invoice failures / retry ─────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS supplier_invoices_failures (
    id               CHAR(36)       NOT NULL,
    org_id           CHAR(36)       NOT NULL,
    source_file_name VARCHAR(500),
    source_hash      VARCHAR(64),
    raw_row          TEXT,
    error_message    TEXT,
    retry_count      INT            NOT NULL DEFAULT 0,
    resolved         TINYINT(1)     NOT NULL DEFAULT 0,
    created_at       TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_org_resolved (org_id, resolved)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Suppliers directory ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS suppliers (
    id              CHAR(36)       NOT NULL,
    org_id          CHAR(36)       NOT NULL,
    supplier_number VARCHAR(255)   NOT NULL,
    supplier_name   VARCHAR(255)   NOT NULL,
    cipc_number     VARCHAR(30),
    vat_number      VARCHAR(20),
    bee_level       VARCHAR(10),
    contact_email   VARCHAR(255),
    is_active       TINYINT(1)     NOT NULL DEFAULT 1,
    created_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_org_supplier (org_id, supplier_number),
    KEY idx_org (org_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Immutable audit log ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS audit_log (
    id           CHAR(36)       NOT NULL,
    org_id       CHAR(36)       NOT NULL,
    user_id      CHAR(36),
    user_name    VARCHAR(200),
    user_email   VARCHAR(255),
    event_type   VARCHAR(100)   NOT NULL,
    detail       TEXT,
    ip_address   VARCHAR(45),
    user_agent   VARCHAR(500),
    created_at   TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_org_event   (org_id, event_type),
    KEY idx_org_created (org_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Team invitations ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS invitations (
    id         CHAR(36)       NOT NULL,
    org_id     CHAR(36)       NOT NULL,
    email      VARCHAR(255)   NOT NULL,
    role       VARCHAR(50)    NOT NULL DEFAULT 'finance_manager',
    token      VARCHAR(255)   NOT NULL,
    accepted   TINYINT(1)     NOT NULL DEFAULT 0,
    expires_at TIMESTAMP      NOT NULL,
    created_at TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_token (token),
    KEY idx_org (org_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ── Gmail incremental poll state (per org) ───────────────────────────────
  `CREATE TABLE IF NOT EXISTS gmail_poll_state (
    org_id       CHAR(36)       NOT NULL,
    history_id   BIGINT         NOT NULL DEFAULT 0,
    updated_at   TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (org_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function migrate() {
  const conn = await pool.getConnection();
  try {
    console.log('[migrate] Running Invoq schema migration…');
    for (const sql of TABLES) {
      await conn.query(sql);
    }
    console.log('[migrate] ✓ All tables created / verified successfully.');
  } catch (err) {
    console.error('[migrate] ✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

migrate();