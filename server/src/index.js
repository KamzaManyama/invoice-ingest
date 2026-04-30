import { Router }          from 'express';
import { signup, login, forgotPassword, resetPassword } from './services/authService.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { handleUpload }    from './middleware/upload.js';
import { runIngestPipeline } from './services/ingestPipeline.js';
import { getInvoices, getStats, approveInvoice, rejectInvoice } from './services/invoiceService.js';
import { audit }           from './services/auditService.js';
import pool                from './config/db.js';
import { v4 as uuid }      from 'uuid';

const r = Router();

// ── Auth ──────────────────────────────────────────────────────────────────
r.post('/auth/signup', async (req, res) => {
  const { firstName, lastName, orgName, email, password } = req.body;
  if (!firstName||!orgName||!email||!password)
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const session = await signup({ firstName, lastName:lastName||'', orgName, email, password });
  res.status(201).json(session);
});

r.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email||!password) return res.status(400).json({ error: 'Email and password are required.' });
  const session = await login({ email, password });
  audit({ orgId: session.org.id, eventType:'login', detail:email, req });
  res.json(session);
});

r.post('/auth/forgot-password', async (req, res) => {
  await forgotPassword(req.body.email||'');
  res.json({ ok: true, message: "If that email is registered, you'll receive a reset link shortly." });
});

r.post('/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token||!password) return res.status(400).json({ error: 'Token and new password are required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  await resetPassword(token, password);
  res.json({ ok: true, message: 'Password reset successfully. You can now sign in.' });
});

// ── Ingest ────────────────────────────────────────────────────────────────
r.post('/ingest', requireAuth, async (req, res) => {
  await handleUpload(req, res);
  if (!req.file) return res.status(400).json({ error: 'No file received. Please attach a .csv file.' });
  const dryRun = req.query.dryRun === 'true' || process.env.DRY_RUN === 'true';
  const result = await runIngestPipeline(
    { orgId: req.orgId, org: req.org, user: req.user, req },
    req.file.buffer, req.file.originalname, dryRun, req.query.source||'upload'
  );
  res.json(result);
});

// ── Invoices ──────────────────────────────────────────────────────────────
r.get('/invoices', requireAuth, async (req, res) => {
  const { status, search, department, from, to, page, limit } = req.query;
  const result = await getInvoices(req.orgId, {
    status, search, department, from, to,
    page:  page  ? parseInt(page)  : 1,
    limit: limit ? Math.min(parseInt(limit),100) : 20,
  });
  res.json(result);
});

r.get('/invoices/stats', requireAuth, async (req, res) => {
  res.json(await getStats(req.orgId));
});

r.post('/invoices/:id/approve',
  requireAuth, requireRole('owner','admin','finance_manager','approver'),
  async (req, res) => {
    await approveInvoice(req.orgId, req.params.id, req.user.id);
    audit({ orgId:req.orgId, user:req.user, req, eventType:'approve', detail:`Invoice ${req.params.id}` });
    res.json({ ok: true });
  }
);

r.post('/invoices/:id/reject',
  requireAuth, requireRole('owner','admin','finance_manager','approver'),
  async (req, res) => {
    await rejectInvoice(req.orgId, req.params.id);
    audit({ orgId:req.orgId, user:req.user, req, eventType:'reject', detail:`Invoice ${req.params.id}` });
    res.json({ ok: true });
  }
);

// ── Suppliers ─────────────────────────────────────────────────────────────
r.get('/suppliers', requireAuth, async (req, res) => {
  const search = req.query.search||'';
  const conds  = ['s.org_id=?'];
  const params = [req.orgId];
  if (search) { conds.push('(s.supplier_name LIKE ? OR s.supplier_number LIKE ?)'); const l=`%${search}%`; params.push(l,l); }
  const [rows] = await pool.execute(
    `SELECT s.*,
       COUNT(i.id) AS invoice_count,
       COALESCE(SUM(i.amount_incl_vat),0) AS total_spend
     FROM suppliers s
     LEFT JOIN supplier_invoices i ON i.org_id=s.org_id AND i.supplier_number=s.supplier_number AND i.status IN('inserted','approved')
     WHERE ${conds.join(' AND ')} GROUP BY s.id ORDER BY total_spend DESC`, params
  );
  res.json({ rows });
});

r.post('/suppliers', requireAuth, requireRole('owner','admin','finance_manager'), async (req, res) => {
  const { supplier_number, supplier_name, cipc_number, vat_number, bee_level, contact_email } = req.body;
  if (!supplier_number||!supplier_name) return res.status(400).json({ error: 'Supplier number and name are required.' });
  const [ex] = await pool.execute('SELECT id FROM suppliers WHERE org_id=? AND supplier_number=? LIMIT 1',[req.orgId,supplier_number]);
  if (ex.length) return res.status(409).json({ error: 'A supplier with this number already exists.' });
  const id = uuid();
  await pool.execute(
    'INSERT INTO suppliers (id,org_id,supplier_number,supplier_name,cipc_number,vat_number,bee_level,contact_email) VALUES (?,?,?,?,?,?,?,?)',
    [id,req.orgId,supplier_number,supplier_name,cipc_number||null,vat_number||null,bee_level||null,contact_email||null]
  );
  audit({ orgId:req.orgId, user:req.user, req, eventType:'supplier_add', detail:supplier_name });
  res.status(201).json({ id });
});

// ── Team ──────────────────────────────────────────────────────────────────
r.get('/team', requireAuth, async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT id,first_name,last_name,email,role,status,last_login,created_at FROM users WHERE org_id=? ORDER BY created_at ASC',
    [req.orgId]
  );
  res.json({ rows });
});

r.post('/team/invite', requireAuth, requireRole('owner','admin'), async (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email address is required.' });
  const token   = uuid();
  const expires = new Date(Date.now() + 7*24*3600*1000);
  await pool.execute(
    'INSERT INTO invitations (id,org_id,email,role,token,expires_at) VALUES (?,?,?,?,?,?)',
    [uuid(),req.orgId,email,role||'finance_manager',token,expires]
  );
  audit({ orgId:req.orgId, user:req.user, req, eventType:'invite', detail:`${email} as ${role}` });
  res.json({ ok: true, message: `Invitation sent to ${email}` });
});

// ── Audit log ─────────────────────────────────────────────────────────────
r.get('/audit', requireAuth, requireRole('owner','admin','super_admin'), async (req, res) => {
  const { type, from } = req.query;
  const conds  = ['org_id=?'];
  const params = [req.orgId];
  if (type) { conds.push('event_type=?'); params.push(type); }
  if (from) { conds.push('created_at>=?'); params.push(from); }
  const [rows] = await pool.execute(
    `SELECT * FROM audit_log WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT 200`, params
  );
  res.json({ rows });
});

// ── Settings ──────────────────────────────────────────────────────────────
r.put('/settings', requireAuth, requireRole('owner','admin'), async (req, res) => {
  const { name, tradingName, vatNumber, vatRate, approvalThreshold, timezone } = req.body;
  await pool.execute(
    `UPDATE organisations SET
       name=COALESCE(?,name), trading_name=COALESCE(?,trading_name),
       vat_number=COALESCE(?,vat_number), vat_rate=COALESCE(?,vat_rate),
       approval_threshold=COALESCE(?,approval_threshold), timezone=COALESCE(?,timezone)
     WHERE id=?`,
    [name||null,tradingName||null,vatNumber||null,vatRate||null,approvalThreshold||null,timezone||null,req.orgId]
  );
  audit({ orgId:req.orgId, user:req.user, req, eventType:'settings', detail:'Organisation settings updated' });
  res.json({ ok: true });
});

// ── Super admin ───────────────────────────────────────────────────────────
r.get('/admin/orgs', requireAuth, requireRole('super_admin'), async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT o.*, COUNT(u.id) AS user_count,
            (SELECT COUNT(*) FROM supplier_invoices WHERE org_id=o.id) AS invoice_count
     FROM organisations o LEFT JOIN users u ON u.org_id=o.id
     GROUP BY o.id ORDER BY o.created_at DESC`
  );
  res.json({ rows });
});

r.put('/admin/orgs/:id/plan', requireAuth, requireRole('super_admin'), async (req, res) => {
  await pool.execute('UPDATE organisations SET plan=? WHERE id=?',[req.body.plan,req.params.id]);
  res.json({ ok: true });
});

export default r;