import { Router, type Request } from 'express';
import { requireAdmin, type AdminIdentity } from '../admin/auth';
import { auditActorFromRequest, auditContextFromAdminRequest, recordAdminAudit } from '../admin/audit';
import { hasPermission } from '../admin/permissions';
import type { QatafoDatabase } from '../db/database';
import { CONNECTED_TEAMS, CONNECTION_CATALOG, type ConnectedAccess, type ConnectedTeam, type ConnectionStatus } from '../../shared/teamConnections';

const teams = Object.keys(CONNECTED_TEAMS) as ConnectedTeam[];
const who = (req: Request) => (req as Request & { admin: AdminIdentity }).admin;
function roleCovers(role: AdminIdentity['role'], team: ConnectedTeam) {
  const permission = { crm: 'commerce:read', erp: 'orders:write', finance: 'reports:read', cms: 'content:write', admin: 'settings:write' } as const;
  return hasPermission(role, permission[team]);
}
function scopedTeams(db: QatafoDatabase, actor: Pick<AdminIdentity, 'id' | 'role'>): ConnectedTeam[] {
  const manage = actor.role === 'SUPER_ADMIN';
  const assigned = new Set(db.all<{ team: ConnectedTeam }>('SELECT team FROM team_connection_members WHERE user_id=?', actor.id).map(row => row.team));
  return teams.filter(team => roleCovers(actor.role, team) && (manage || assigned.has(team)));
}
export function hasConnectedTeam(db: QatafoDatabase, actor: AdminIdentity, team: ConnectedTeam) {
  return roleCovers(actor.role, team) && (actor.role === 'SUPER_ADMIN' || Boolean(db.get('SELECT user_id FROM team_connection_members WHERE user_id=? AND team=?', actor.id, team)));
}
function access(db: QatafoDatabase, actor: AdminIdentity): ConnectedAccess {
  return { manage: actor.role === 'SUPER_ADMIN', teams: scopedTeams(db, actor), mfa: actor.mfaVerified };
}
const isTeam = (key: unknown): key is ConnectedTeam => typeof key === 'string' && teams.some(team => team === key);
const bodyIs = (body: unknown, key: string) => body !== null && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 1 && Object.hasOwn(body, key);

export function createConnectionsRouter(db: QatafoDatabase) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); }, requireAdmin(db));
  const journal = (req: Request, action: string, resourceType: string, id: string | null, metadata: unknown) =>
    recordAdminAudit(db, auditActorFromRequest(req), action, 'CONNECTIONS', id, null, metadata,
      { resourceType, context: auditContextFromAdminRequest(req) });
  const deny = (req: Request, res: import('express').Response, reason: string) => {
    journal(req, 'ACCESS_DENIED', 'team_connection', null, { reason });
    return res.status(403).json({ success: false, code: reason, error: reason === 'CONNECTION_MFA_REQUIRED' ? 'Activez la vérification en deux étapes, puis reconnectez-vous avec votre code.' : 'Accès Connected non autorisé.' });
  };
  router.get('/access', (req, res) => res.json({ success: true, data: access(db, who(req)) }));
  router.get('/teams/:team', (req, res) => {
    const team = req.params.team;
    if (!isTeam(team) || !access(db, who(req)).teams.includes(team)) return deny(req, res, 'CONNECTION_SCOPE_DENIED');
    const providers = CONNECTION_CATALOG.filter(provider => provider.team === team).map(provider => provider.id);
    const rows = db.all(`SELECT provider,status,updated_at AS updatedAt FROM team_connection_requests WHERE provider IN (${providers.map(() => '?').join(',')})`, ...providers);
    return res.json({ success: true, data: rows });
  });
  router.post('/teams/:team/:provider', (req, res) => {
    const team = req.params.team;
    const actor = access(db, who(req));
    if (!isTeam(team) || !actor.teams.includes(team)) return deny(req, res, 'CONNECTION_SCOPE_DENIED');
    if (!actor.mfa) return deny(req, res, 'CONNECTION_MFA_REQUIRED');
    const provider = CONNECTION_CATALOG.find(item => item.id === req.params.provider && item.team === team);
    const action: unknown = req.body?.action;
    if (!provider || !bodyIs(req.body, 'action') || (action !== 'REQUEST' && action !== 'APPROVE' && action !== 'CLOSE')) {
      return res.status(400).json({ success: false, error: 'Action ou service non pris en charge.' });
    }
    if (action !== 'REQUEST' && !actor.manage) return deny(req, res, 'CONNECTION_SCOPE_DENIED');
    const result = db.transaction(() => {
      const before = db.get<{ status: ConnectionStatus }>('SELECT status FROM team_connection_requests WHERE provider=?', provider.id)?.status;
      if (action === 'REQUEST' && before === 'REQUESTED') return true;
      if ((action === 'REQUEST' && before === 'APPROVED_FOR_SETUP') || (action === 'APPROVE' && before !== 'REQUESTED') || (action === 'CLOSE' && (!before || before === 'CLOSED'))) return false;
      const status: ConnectionStatus = action === 'REQUEST' ? 'REQUESTED' : action === 'APPROVE' ? 'APPROVED_FOR_SETUP' : 'CLOSED';
      db.run(`INSERT INTO team_connection_requests (provider,status,updated_at) VALUES (?,?,?)
        ON CONFLICT(provider) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`, provider.id, status, new Date().toISOString());
      journal(req, 'STATUS_CHANGE', 'team_connection', provider.id, { team, from: before ?? null, status });
      return true;
    });
    return result ? res.json({ success: true }) : res.status(409).json({ success: false, error: 'État de demande incompatible.' });
  });
  router.get('/members', (req, res) => {
    if (!access(db, who(req)).manage) return deny(req, res, 'CONNECTION_SCOPE_DENIED');
    const query = typeof req.query.email === 'string' && req.query.email.length <= 254 ? req.query.email.trim().toLowerCase() : '';
    if (!query) return res.json({ success: true, data: null });
    const user = db.get<Pick<AdminIdentity, 'id' | 'role' | 'name'>>('SELECT id,role,name FROM admin_users WHERE email=? AND active=1', query);
    if (!user || user.role === 'SUPER_ADMIN') return res.json({ success: true, data: null });
    return res.json({ success: true, data: { ...user, eligible: teams.filter(team => roleCovers(user.role, team)), assigned: scopedTeams(db, user) } });
  });
  router.put('/members/:id/:team', (req, res) => {
    const actor = access(db, who(req));
    if (!actor.manage) return deny(req, res, 'CONNECTION_SCOPE_DENIED');
    if (!actor.mfa) return deny(req, res, 'CONNECTION_MFA_REQUIRED');
    const team = req.params.team;
    const user = db.get<{ id: string; role: AdminIdentity['role'] }>('SELECT id,role FROM admin_users WHERE id=? AND active=1', req.params.id);
    if (!user || user.role === 'SUPER_ADMIN' || !isTeam(team) || !bodyIs(req.body, 'granted') || typeof req.body.granted !== 'boolean' || (req.body.granted && !roleCovers(user.role, team))) {
      return res.status(400).json({ success: false, error: 'Affectation incompatible avec ce rôle.' });
    }
    const granted = req.body.granted as boolean;
    db.transaction(() => {
      const change = granted ? db.run('INSERT OR IGNORE INTO team_connection_members (user_id,team) VALUES (?,?)', user.id, team)
        : db.run('DELETE FROM team_connection_members WHERE user_id=? AND team=?', user.id, team);
      if (change.changes) journal(req, granted ? 'ASSIGN' : 'REVOKE', 'team_connection_membership', user.id, { team, granted });
    });
    return res.json({ success: true });
  });
  return router;
}
