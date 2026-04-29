import { v4 as uuid } from 'uuid';
import pool from '../config/db.js';

export function audit({ orgId, user, req, eventType, detail }) {
  const ip = req?.headers?.['x-forwarded-for'] || req?.ip || null;
  pool.execute(
    `INSERT INTO audit_log (id,org_id,user_id,user_name,user_email,event_type,detail,ip_address)
     VALUES (?,?,?,?,?,?,?,?)`,
    [uuid(), orgId, user?.id||null,
     user ? `${user.firstName} ${user.lastName}` : null,
     user?.email||null, eventType, detail||null, ip]
  ).catch(e => console.error('[audit]', e.message));
}