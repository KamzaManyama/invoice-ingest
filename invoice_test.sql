-- ─────────────────────────────────────────────────────────────
-- Organisations (Tenants)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE organisations
(
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  trading_name VARCHAR(255),
  vat_number VARCHAR(20),
  cipc_number VARCHAR(30),
  plan ENUM
  ('free','starter','business','enterprise') NOT NULL DEFAULT 'free',
  vat_rate DECIMAL
  (5,2) NOT NULL DEFAULT 15.00,
  approval_threshold DECIMAL
  (12,2),
  timezone VARCHAR
  (60) NOT NULL DEFAULT 'Africa/Johannesburg',
  stripe_customer_id VARCHAR
  (100),
  stripe_sub_id VARCHAR
  (100),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON
  UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY
  (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


  -- ─────────────────────────────────────────────────────────────
  -- Users
  -- ─────────────────────────────────────────────────────────────
  CREATE TABLE users (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('super_admin','owner','admin','finance_manager','approver','viewer') NOT NULL DEFAULT 'finance_manager',
  status ENUM
  ('active','invited','suspended') NOT NULL DEFAULT 'active',
  reset_token VARCHAR
  (255),
  reset_expires TIMESTAMP NULL,
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY
  (id),
  UNIQUE KEY uq_org_email
  (org_id, email),
  KEY idx_org_id
  (org_id),

  CONSTRAINT fk_users_org FOREIGN KEY
  (org_id)
    REFERENCES organisations
  (id)
    ON
  DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4;


  -- ─────────────────────────────────────────────────────────────
  -- Suppliers
  -- ─────────────────────────────────────────────────────────────
  CREATE TABLE suppliers
  (
    id CHAR(36) NOT NULL DEFAULT (UUID()),
    org_id CHAR(36) NOT NULL,
    supplier_number VARCHAR(255) NOT NULL,
    supplier_name VARCHAR(255) NOT NULL,
    cipc_number VARCHAR(30),
    vat_number VARCHAR(20),
    bee_level VARCHAR(10),
    contact_email VARCHAR(255),
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON
    UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY
    (id),
  UNIQUE KEY uq_org_supplier
    (org_id, supplier_number),
  KEY idx_org
    (org_id),

  CONSTRAINT fk_suppliers_org FOREIGN KEY
    (org_id)
    REFERENCES organisations
    (id)
    ON
    DELETE CASCADE
) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4;


    -- ─────────────────────────────────────────────────────────────
    -- Supplier Invoices
    -- ─────────────────────────────────────────────────────────────
    CREATE TABLE supplier_invoices (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  supplier_id CHAR(36),
  invoice_number VARCHAR(255) NOT NULL,
  department VARCHAR(255) NOT NULL,

  amount_excl_vat DECIMAL(12,2) NOT NULL,
  vat DECIMAL(12,2) NOT NULL,
  amount_incl_vat DECIMAL(12,2) NOT NULL,

  invoice_date DATE NOT NULL,

  source_file_name VARCHAR(500),
  source_hash VARCHAR(64),

  ingest_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  uploaded_by CHAR(36),
  approved_by CHAR(36),
  approved_at TIMESTAMP NULL,

  status ENUM('inserted','duplicate','failed','pending','approved','rejected') NOT NULL,
  validation_notes TEXT,

  PRIMARY KEY
    (id),

  UNIQUE KEY uq_org_invoice
    (org_id, invoice_number),
  KEY idx_org_status
    (org_id, status),
  KEY idx_org_date
    (org_id, invoice_date),
  KEY idx_org_supplier
    (org_id, supplier_id),

  CONSTRAINT fk_invoice_org FOREIGN KEY
    (org_id)
    REFERENCES organisations
    (id) ON
    DELETE CASCADE,

  CONSTRAINT fk_invoice_supplier FOREIGN KEY
    (supplier_id)
    REFERENCES suppliers
    (id) ON
    DELETE
    SET NULL
    ,

  CONSTRAINT fk_uploaded_by FOREIGN KEY
    (uploaded_by)
    REFERENCES users
    (id) ON
    DELETE
    SET NULL
    ,

  CONSTRAINT fk_approved_by FOREIGN KEY
    (approved_by)
    REFERENCES users
    (id) ON
    DELETE
    SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


    -- ─────────────────────────────────────────────────────────────
    -- Invoice Failures (Retry Queue)
    -- ─────────────────────────────────────────────────────────────
    CREATE TABLE supplier_invoices_failures
    (
      id CHAR(36) NOT NULL DEFAULT (UUID()),
      org_id CHAR(36) NOT NULL,
      source_file_name VARCHAR(500),
      source_hash VARCHAR(64),
      raw_row MEDIUMTEXT,
      error_message TEXT,
      retry_count INT NOT NULL DEFAULT 0,
      resolved TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ON
      UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY
      (id),
  KEY idx_org_resolved
      (org_id, resolved),

  CONSTRAINT fk_failures_org FOREIGN KEY
      (org_id)
    REFERENCES organisations
      (id)
    ON
      DELETE CASCADE
) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4;


      -- ─────────────────────────────────────────────────────────────
      -- Audit Log (Immutable)
      -- ─────────────────────────────────────────────────────────────
      CREATE TABLE audit_log
      (
        id CHAR(36) NOT NULL DEFAULT (UUID()),
        org_id CHAR(36) NOT NULL,
        user_id CHAR(36),
        user_name VARCHAR(200),
        user_email VARCHAR(255),
        event_type VARCHAR(100) NOT NULL,
        detail TEXT,
        ip_address VARCHAR(45),
        user_agent VARCHAR(500),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

        PRIMARY KEY (id),
        KEY idx_org_event
        (org_id, event_type),
  KEY idx_org_created
        (org_id, created_at),

  CONSTRAINT fk_audit_org FOREIGN KEY
        (org_id)
    REFERENCES organisations
        (id) ON
        DELETE CASCADE,

  CONSTRAINT fk_audit_user FOREIGN KEY
        (user_id)
    REFERENCES users
        (id) ON
        DELETE
        SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


        -- ─────────────────────────────────────────────────────────────
        -- Invitations
        -- ─────────────────────────────────────────────────────────────
        CREATE TABLE invitations (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role ENUM('owner','admin','finance_manager','approver','viewer') NOT NULL DEFAULT 'finance_manager',
  token VARCHAR
        (255) NOT NULL,
  accepted TINYINT
        (1) NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY
        (id),
  UNIQUE KEY uq_token
        (token),
  KEY idx_org
        (org_id),

  CONSTRAINT fk_invites_org FOREIGN KEY
        (org_id)
    REFERENCES organisations
        (id)
    ON
        DELETE CASCADE
) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4;


        -- ─────────────────────────────────────────────────────────────
        -- Gmail Poll State
        -- ─────────────────────────────────────────────────────────────
        CREATE TABLE gmail_poll_state
        (
          org_id CHAR(36) NOT NULL,
          history_id BIGINT NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON
          UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY
          (org_id),

  CONSTRAINT fk_gmail_org FOREIGN KEY
          (org_id)
    REFERENCES organisations
          (id)
    ON
          DELETE CASCADE
) ENGINE=InnoDB
          DEFAULT CHARSET=utf8mb4;