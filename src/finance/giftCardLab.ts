import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { requireAdmin, type AdminIdentity } from '../admin/auth';
import { auditActorFromRequest, auditContextFromAdminRequest, recordAdminAudit } from '../admin/audit';
import type { QatafoDatabase } from '../db/database';
import { giftDesignsFor, giftFormats, parseGiftPreviewAmount, type GiftLabRow } from '../../shared/giftCardPreview';

const fields = `id, design, format, amount_millimes AS amountMillimes, status,
  created_by AS createdBy, created_at AS createdAt, reviewed_at AS reviewedAt`;
const auditModule = 'FINANCE';
const resourceType = 'gift_card_specimen';

/** Isolated rehearsal only. No order, wallet, email or payment handler consumes this table. */
export function createGiftCardLabRouter(db: QatafoDatabase) {
  db.run(`CREATE TABLE IF NOT EXISTS finance_gift_card_specimens (
    id TEXT PRIMARY KEY, design TEXT NOT NULL, format TEXT NOT NULL CHECK(format IN ('digital','physical')),
    amount_millimes INTEGER NOT NULL CHECK(typeof(amount_millimes)='integer' AND amount_millimes BETWEEN 10000 AND 200000),
    status TEXT NOT NULL CHECK(status IN ('DRAFT','APPROVED')),
    created_by TEXT NOT NULL, created_at TEXT NOT NULL,
    reviewed_by TEXT, reviewed_at TEXT, fingerprint TEXT UNIQUE,
    CHECK(format='digital' OR amount_millimes>=25000),
    CHECK((status='DRAFT' AND reviewed_by IS NULL AND reviewed_at IS NULL AND fingerprint IS NULL) OR
      (status='APPROVED' AND reviewed_by IS NOT NULL AND reviewed_by<>created_by AND reviewed_at IS NOT NULL AND fingerprint IS NOT NULL))
  )`);
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  router.get('/', requireAdmin(db, 'reports:read'), (req, res) => {
    const actor = (req as typeof req & { admin: AdminIdentity }).admin;
    const rows = db.all<GiftLabRow>(`SELECT ${fields} FROM finance_gift_card_specimens ORDER BY (status='DRAFT') DESC,created_at DESC,id DESC LIMIT 100`);
    res.json({ success: true, data: { rows, actorId: actor.id } });
  });
  router.post('/', requireAdmin(db, 'reports:write'), (req, res) => {
    const format = giftFormats.find(item => item === req.body?.format);
    const design = format && giftDesignsFor(format).find(item => item === req.body?.design);
    const amount = format && typeof req.body?.amount === 'string' && req.body.amount.length <= 16 ? parseGiftPreviewAmount(req.body.amount, format) : null;
    if (!format || !design || amount === null) return res.status(400).json({ success: false, error: 'Format, design ou montant de démonstration invalide.' });
    const actor = (req as typeof req & { admin: AdminIdentity }).admin;
    const item: GiftLabRow = { id: `specimen_${randomUUID()}`, format, design, amountMillimes: amount, status: 'DRAFT', createdBy: actor.id,
      createdAt: new Date().toISOString(), reviewedAt: null };
    db.transaction(() => {
      db.run(`INSERT INTO finance_gift_card_specimens (id,design,format,amount_millimes,status,created_by,created_at) VALUES (?,?,?,?,?,?,?)`,
        item.id, item.design, item.format, item.amountMillimes, item.status, actor.id, item.createdAt);
      recordAdminAudit(db, auditActorFromRequest(req), 'CREATE', auditModule, item.id, null, item, { resourceType, context: auditContextFromAdminRequest(req) });
    });
    return res.status(201).json({ success: true, data: item });
  });
  router.post('/:id/approve', requireAdmin(db, 'reports:write'), (req, res) => {
    const actor = (req as typeof req & { admin: AdminIdentity }).admin;
    const id = String(req.params.id);
    const context = { resourceType, context: auditContextFromAdminRequest(req) };
    const before = db.get<GiftLabRow>(`SELECT ${fields} FROM finance_gift_card_specimens WHERE id=?`, id);
    if (!before) return res.status(404).json({ success: false, error: 'Spécimen introuvable.' });
    if (before.createdBy === actor.id) {
      recordAdminAudit(db, auditActorFromRequest(req), 'ACCESS_DENIED', auditModule, id, null, { reason: 'SECOND_APPROVER_REQUIRED' }, context);
      return res.status(403).json({ success: false, error: 'L’approbation exige un autre administrateur habilité.' });
    }
    const result = db.transaction(() => {
      if (before.status !== 'DRAFT') return null;
      const specimen = `DEMO-${randomBytes(16).toString('hex').toUpperCase()}`;
      const reviewedAt = new Date().toISOString();
      const changed = db.run(`UPDATE finance_gift_card_specimens SET status='APPROVED',reviewed_by=?,reviewed_at=?,fingerprint=?
        WHERE id=? AND status='DRAFT' AND created_by<>?`, actor.id, reviewedAt, createHash('sha256').update(specimen).digest('hex'), id, actor.id);
      if (!changed.changes) return null;
      const row: GiftLabRow = { ...before, status: 'APPROVED', reviewedAt };
      recordAdminAudit(db, auditActorFromRequest(req), 'APPROVE', auditModule, id, { status: before.status },
        { status: row.status, reviewedAt, mode: 'specimen' }, context);
      return { row, specimen };
    });
    if (!result) return res.status(409).json({ success: false, error: 'Ce spécimen a déjà été approuvé.' });
    return res.json({ success: true, data: result });
  });
  return router;
}
