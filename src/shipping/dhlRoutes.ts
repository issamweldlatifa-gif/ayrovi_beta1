import type { Request, Router } from 'express';
import type { QatafoDatabase } from '../db/database';
import { requireAdmin, type AdminIdentity } from '../admin/auth';
import { auditActorFromRequest, auditContextFromAdminRequest, recordAdminAudit } from '../admin/audit';
import { hasConnectedTeam } from '../connections/routes';
import { trackingCarrier } from '../../shared/shippingTracking';
import { dhlKey, readDhlStatus } from './dhlRead';

const canUse = (db: QatafoDatabase, actor: AdminIdentity) => actor.mfaVerified && hasConnectedTeam(db, actor, 'erp');
function approved(db: QatafoDatabase) {
  return Boolean(db.get("SELECT provider FROM team_connection_requests WHERE provider='erp-dhl-tracking' AND status='APPROVED_FOR_SETUP'"));
}
const isTrackable = (status: string, carrier: string) => ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status) && trackingCarrier(carrier) === 'DHL Express';
export function canOfferDhlTracking(db: QatafoDatabase, req: Request, status: string, carrier: string) {
  return isTrackable(status, carrier) && canUse(db, (req as Request & { admin: AdminIdentity }).admin) && Boolean(dhlKey()) && approved(db);
}

export function registerDhlTrackingRoute(router: Router, db: QatafoDatabase) {
  let lastCall = 0;
  let activeUntil = 0;
  let inFlight = false;
  router.post('/orders/:id/dhl-status', (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); }, requireAdmin(db, 'orders:write'), async (req, res) => {
    const actor = (req as Request & { admin: AdminIdentity }).admin;
    const audit = (action: string, outcome: string, orderId: string | null = null) => recordAdminAudit(db, auditActorFromRequest(req), action, 'DELIVERIES', orderId, null,
      { provider: 'DHL_EXPRESS', outcome }, { resourceType: 'delivery', context: auditContextFromAdminRequest(req) });
    if (!canUse(db, actor)) {
      audit('ACCESS_DENIED', 'scope-or-mfa');
      return res.status(403).json({ success: false, error: 'Accès au suivi transporteur non autorisé.' });
    }
    if (req.body && Object.keys(req.body).length) return res.status(400).json({ success: false, error: 'Utilisez le numéro enregistré sur la livraison.' });
    const key = dhlKey();
    if (!key || !approved(db)) return res.status(409).json({ success: false, error: 'Raccordement DHL non activé.' });
    const row = db.get<{ status: string; carrier: string; tracking_number: string }>(`SELECT o.status,d.carrier,d.tracking_number FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE o.id=?`, req.params.id);
    if (!row || !isTrackable(row.status, row.carrier) || !/^[A-Za-z0-9-]{4,64}$/.test(row.tracking_number)) return res.status(404).json({ success: false, error: 'Livraison DHL éligible introuvable.' });
    const now = Date.now();
    if (inFlight || now - lastCall < 3_000 || now < activeUntil) return res.set('Retry-After', String(Math.max(3, Math.ceil((activeUntil - now) / 1000)))).status(429).json({ success: false, error: 'Patientez avant une nouvelle consultation.' });
    inFlight = true;
    lastCall = now;
    try {
      const result = await readDhlStatus(row.tracking_number, key);
      audit('ACCESS', result.kind, String(req.params.id));
      if (result.kind === 'rate-limited') {
        activeUntil = Date.now() + 60_000;
        return res.set('Retry-After', '60').status(429).json({ success: false, error: 'Limite du transporteur atteinte.' });
      }
      if (result.kind === 'verified') return res.json({ success: true, data: result.data });
      if (result.kind === 'missing') return res.status(404).json({ success: false, error: 'Aucun résultat vérifié pour ce numéro.' });
      return res.status(502).json({ success: false, error: 'Le service transporteur ne répond pas avec un statut vérifiable.' });
    } finally { inFlight = false; }
  });
}
