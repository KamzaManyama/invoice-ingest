USE sql12823711;

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id               CHAR(36)      NOT NULL,
  invoice_number   VARCHAR(255)  NOT NULL,
  supplier_number  VARCHAR(255)  NOT NULL,
  supplier_name    VARCHAR(255)  NOT NULL,
  department       VARCHAR(255)  NOT NULL,
  amount_excl_vat  DECIMAL(12,2) NOT NULL,
  vat              DECIMAL(12,2) NOT NULL,
  amount_incl_vat  DECIMAL(12,2) NOT NULL,
  invoice_date     DATE          NOT NULL,
  source_file_name VARCHAR(500)  DEFAULT NULL,
  source_hash      VARCHAR(64)   DEFAULT NULL,
  ingest_timestamp TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status           ENUM('inserted','duplicate','failed') NOT NULL,
  validation_notes TEXT,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supplier_invoice (supplier_number, invoice_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
 
CREATE TABLE IF NOT EXISTS supplier_invoices_failures (
  id               CHAR(36)     NOT NULL,
  source_file_name VARCHAR(500) DEFAULT NULL,
  source_hash      VARCHAR(64)  DEFAULT NULL,
  raw_row          TEXT,
  error_message    TEXT,
  retry_count      INT          NOT NULL DEFAULT 0,
  last_attempted   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved         TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
 
CREATE TABLE IF NOT EXISTS gmail_poll_state (
  id             INT       NOT NULL AUTO_INCREMENT,
  history_id     BIGINT    NOT NULL DEFAULT 0,
  last_polled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
 
INSERT INTO gmail_poll_state (id, history_id) VALUES (1, 0);