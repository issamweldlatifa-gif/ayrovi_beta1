import { Router } from 'express';
import { auditActorFromRequest, auditContextFromAdminRequest, recordAdminAudit } from '../admin/audit';
import { hasPermission } from '../admin/permissions';
import { requireAdmin, type AdminIdentity } from '../admin/auth';
import type { QatafoDatabase } from '../db/database';
import { parseRegisterQuery, readRegister } from './transactionRegister';

export function createFinanceRouter(db: QatafoDatabase) {
  const router = Router();
  router.get('/transactions', (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  }, requireAdmin(db), (req, res) => {
    const actor = auditActorFromRequest(req);
    const auditOptions = { resourceType: 'payment_transaction', context: auditContextFromAdminRequest(req) };
    if (!hasPermission((req as typeof req & { admin: AdminIdentity }).admin.role, 'reports:read')) {
      recordAdminAudit(db, actor, 'ACCESS_DENIED', 'FINANCE', null, null, { screen: 'transaction-register' }, auditOptions);
      return res.status(403).json({ success: false, error: 'Vous ne disposez pas de cette permission.' });
    }
    const filter = parseRegisterQuery(req.query as Record<string, unknown>);
    if (!filter) return res.status(400).json({ success: false, error: 'Filtres du registre invalides.' });
    const data = readRegister(db, filter);
    recordAdminAudit(db, actor, 'ACCESS', 'FINANCE', null, null,
      { screen: 'transaction-register', page: filter.page, days: filter.days, rowCount: data.rows.length },
      auditOptions);
    return res.json({ success: true, data });
  });
  return router;
}
