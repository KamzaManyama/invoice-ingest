-- ─────────────────────────────────────────────────────────────
-- Add Superadmin User: kmanyama009@gmail.com
-- Run this script once against your database after running migrations.
-- Password: Admin@Invoq2025!  (change after first login)
-- ─────────────────────────────────────────────────────────────

-- 1. Create a dedicated "system" organisation for the super admin
--    (super_admin is cross-org, but the FK on users requires an org_id)
INSERT IGNORE INTO organisations (id, name, plan, timezone)
VALUES (
  'super-admin-org-0000-000000000000',
  'Invoq Platform',
  'enterprise',
  'Africa/Johannesburg'
);

-- 2. Insert the super admin user
--    Password hash below = bcrypt(cost=12) of: Admin@Invoq2025!
INSERT INTO users (
  id,
  org_id,
  first_name,
  last_name,
  email,
  password_hash,
  role,
  status
) VALUES (
  UUID(),
  'super-admin-org-0000-000000000000',
  'Kamza',
  'Manyama',
  'kmanyama009@gmail.com',
  '$2b$12$FFvc6.yk3Jgrv6XvccLHDe42DgXQeF/Tn7KlvR6eSY/K14f8.rtay',
  'super_admin',
  'active'
)
-- If the user already exists (e.g. re-running), just update the role
ON DUPLICATE KEY UPDATE
  role   = 'super_admin',
  status = 'active';

-- 3. Ensure the gmail_poll_state row exists for this org (required by signup trigger)
INSERT IGNORE INTO gmail_poll_state (org_id, history_id)
VALUES ('super-admin-org-0000-000000000000', 0);

-- Verify
SELECT id, email, role, status FROM users WHERE email = 'kmanyama009@gmail.com';
