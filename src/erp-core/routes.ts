/**
 * AYROVI ERP Core — Back-office API (P1).
 *
 * Mounted at `/api/admin/core` inside the existing admin router, so it inherits
 * the session cookie scope (`Path=/api/admin`), the CSRF middleware and the
 * `requireAdmin` guards. New ERP endpoints therefore cannot be reached by an
 * unauthenticated or un-CSRF'd caller, and every mutation here is audited
 * through the single writer.
 */
import { Router, type Request } from 'express';
import { getAyroviAiCore } from '../ai-core/core';
import type { QatafoDatabase } from '../db/database';
import type { AdminIdentity } from '../admin/auth';
import { requireAdmin } from '../admin/auth';
import { moduleRegistryPayload, ERP_MODULES } from './modules';
import { auditCoverage, listAuditEvents, writeAuditEvent, fieldDiff, resourceTypeForModule } from './audit';
import {
  createOrganizationUnit, getEmployee, listEmployees, organizationTree, resolveEmployee, updateEmployee,
} from './identity';
import { can, permissionsForRoleExtended, seedLegacyPermissions } from './permissions';
import { listErpEvents } from './events';
import { listSequences } from './sequences';
import { dataDirectory, isPrivateDocumentPath, isPublicUploadPath, privateDocumentsRoot, publicUploadsView } from './storage';
import { bootstrapErpCore, lastErpCoreBootReport } from './bootstrap';

type AuditedRequest = Request & { admin?: AdminIdentity; requestId?: string };

const admin = (req: AuditedRequest) => req.admin as AdminIdentity;

function audit(req: AuditedRequest, db: QatafoDatabase, input: {
  action: string; module: string; resourceId?: string | null; resourceType?: string;
  before?: Record<string, unknown> | null; after?: Record<string, unknown> | null;
  requestId?: string | null;
  userAgent?: string | null;
}) {
  writeAuditEvent(db, {
    actor: { id: admin(req).id, name: admin(req).name, ipAddress: req.ip || null },
    action: input.action, module: input.module,
    resource: { type: input.resourceType, id: input.resourceId ?? null },
    oldValues: input.before ?? null, newValues: input.after ?? null,
    fieldChanges: fieldDiff(input.before, input.after),
    context: {
      requestId: input.requestId ?? (req as { requestId?: string }).requestId ?? null,
      sessionId: admin(req).id,
      employee: resolveEmployee(db, admin(req).id),
      userAgent: input.userAgent ?? (String(req.headers['user-agent'] || '').slice(0, 300) || null),
    },
  });
}

/** Optional-provider capability map (no secrets, only "configured or not"). */
function readinessSnapshot() {
  try {
    const aiCore = getAyroviAiCore();
    const responses = aiCore.responses().isConfigured();
    const voice = aiCore.legacyVoiceReadiness();
    return {
      responsesProvider: responses,
      voiceInput: voice.input,
      voiceOutput: voice.output,
      serpApi: Boolean(process.env.SERPAPI_KEY),
      pexelsOrPixabay: Boolean(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY),
      smtpConfigured: Boolean(process.env.MAIL_PROVIDER && process.env.MAIL_API_KEY),
    };
  } catch (error: any) {
    return { error: String(error?.message || 'readiness unavailable') };
  }
}

export function createErpCoreRouter(db: QatafoDatabase): Router {
  const router = Router();

  // The foundation is boot-on-demand: whoever creates the database (server boot,
  // a test, a future worker) gets the same schema, the same employee identities
  // for existing logins and the same mirrored permission grants.
  let booted = false;
  router.use('/boot-self-test', (_req, res) => {
    res.json({ success: true, data: lastErpCoreBootReport() });
  });
  router.use((req, _res, next) => {
    if (booted || req.path.startsWith('/boot-self-test')) return next();
    booted = true;
    try { bootstrapErpCore(db); } catch { /* the constructor already created the schema */ }
    return next();
  });

  // ---------- Registry & environment ----------
  router.get('/modules', requireAdmin(db, 'dashboard:read'), (_req, res) => {
    res.json({ success: true, data: { sections: moduleRegistryPayload(), total: ERP_MODULES.length } });
  });

  router.get('/environment', requireAdmin(db, 'dashboard:read'), (_req, res) => {
    res.json({
      success: true,
      data: {
        boot: lastErpCoreBootReport(),
        dataDirectory: dataDirectory(),
        publicUploads: publicUploadsView(),
        privateDocumentsRoot: privateDocumentsRoot(),
        // Provider readiness, exposed to administrators instead of being readable
        // by an anonymous probe of /api/ready.
        readiness: readinessSnapshot(),
        policy: {
          publicUrlPrefix: '/uploads',
          publicSubDirectories: ['hero'],
          privateSubDirectories: ['invoices', 'payment-proofs', 'employee-documents'],
          directPrivateUrlAccess: 'denied (403/404) — documents are served only through authorized endpoints',
        },
      },
    });
  });

  // Self-check used by the security test and by the admin screen.
  router.get('/environment/self-test', requireAdmin(db, 'dashboard:read'), (_req, res) => {
    const probes = [
      `${dataDirectory()}/uploads/invoices/probe.pdf`,
      `${dataDirectory()}/uploads/deposits/probe.png`,
      `${privateDocumentsRoot()}/invoices/probe.pdf`,
      `${privateDocumentsRoot()}/payment-proofs/probe.png`,
      `${privateDocumentsRoot()}/employee-documents/probe.pdf`,
      `${dataDirectory()}/uploads/probe.jpg`,
      `${dataDirectory()}/uploads/hero/probe.jpg`,
    ].map((target) => ({
      path: target.replace(dataDirectory(), '<data>'),
      public: isPublicUploadPath(target),
      private: isPrivateDocumentPath(target),
    }));
    res.json({
      success: true,
      data: {
        probes,
        allPrivateBlocked: probes.slice(0, 5).every((probe) => !probe.public),
        publicMediaStillServed: probes.slice(5).every((probe) => probe.public),
      },
    });
  });

  // ---------- Employees ----------
  router.get('/employees', requireAdmin(db, 'users:write'), (req, res) => {
    const result = listEmployees(db, {
      search: typeof req.query.search === 'string' ? req.query.search : '',
      status: typeof req.query.status === 'string' ? req.query.status : '',
      branchId: typeof req.query.branchId === 'string' ? req.query.branchId : '',
      departmentId: typeof req.query.departmentId === 'string' ? req.query.departmentId : '',
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
    });
    res.json({ success: true, ...result });
  });

  router.get('/employees/me', requireAdmin(db), (req, res) => {
    const employee = resolveEmployee(db, admin(req).id);
    res.json({ success: true, data: { employee, legacy: { id: admin(req).id, email: admin(req).email, name: admin(req).name, role: admin(req).role } } });
  });

  router.get('/employees/:id', requireAdmin(db, 'users:write'), (req, res) => {
    const employee = getEmployee(db, req.params.id);
    if (!employee) return res.status(404).json({ success: false, code: 'EMPLOYEE_NOT_FOUND', error: 'Employé introuvable.' });
    res.json({ success: true, data: { employee, permissions: permissionsForRoleExtended(db, employee.role || 'ADMIN') } });
  });

  router.patch('/employees/:id', requireAdmin(db, 'users:write'), (req, res) => {
    const before = db.get<Record<string, unknown>>('SELECT * FROM erp_employees WHERE id=?', req.params.id);
    if (!before) return res.status(404).json({ success: false, code: 'EMPLOYEE_NOT_FOUND', error: 'Employé introuvable.' });
    try {
      const after = updateEmployee(db, req.params.id, (req.body ?? {}) as Record<string, unknown>);
      audit(req, db, { action: 'UPDATE', module: 'EMPLOYEES', resourceId: req.params.id, resourceType: 'employee', before: before as Record<string, unknown>, after: after as unknown as Record<string, unknown> });
      res.json({ success: true, data: after });
    } catch (error: any) {
      const code = String(error?.message || 'EMPLOYEE_UPDATE_FAILED');
      const status = code === 'EMPLOYEE_NOT_FOUND' ? 404 : code === 'EMPLOYEE_NO_CHANGES' ? 400 : code === 'EMPLOYEE_STATUS_INVALID' ? 400 : 409;
      return res.status(status).json({ success: false, code, error: 'Mise à jour refusée : vérifiez le statut, le manager et les valeurs saisies.' });
    }
  });

  // ---------- Organization ----------
  router.get('/organization', requireAdmin(db, 'users:write'), (_req, res) => {
    res.json({ success: true, data: organizationTree(db) });
  });

  // kind is a body field (Express 4 has no named-group params) so the endpoint
  // stays a single, auditable route instead of three copies.
  router.post('/organization/units', requireAdmin(db, 'users:write'), (req, res) => {
    const kind = String(req.body?.kind || '');
    if (!['branch', 'department', 'team'].includes(kind)) return res.status(400).json({ success: false, code: 'UNIT_KIND_INVALID', error: 'Type d’entité invalide.' });
    try {
      const tree = createOrganizationUnit(db, kind as 'branch' | 'department' | 'team', (req.body ?? {}) as Record<string, unknown>);
      audit(req, db, { action: 'CREATE', module: 'ORGANIZATION', resourceType: kind, after: { name: String(req.body?.name || '') } });
      res.status(201).json({ success: true, data: tree });
    } catch (error: any) {
      const code = String(error?.message || 'UNIT_CREATE_FAILED');
      return res.status(code === 'UNIT_NAME_REQUIRED' ? 400 : 409).json({ success: false, code, error: 'Création impossible : nom requis et organisation existante obligatoire.' });
    }
  });

  // ---------- Permissions (foundation, read-only exposure in P1) ----------
  router.get('/permissions/me', requireAdmin(db), (req, res) => {
    const identity = admin(req);
    res.json({ success: true, data: permissionsForRoleExtended(db, identity.role) });
  });

  router.post('/permissions/check', requireAdmin(db, 'dashboard:read'), (req, res) => {
    const moduleKey = String(req.body?.module || '').slice(0, 40);
    const action = String(req.body?.action || 'read').slice(0, 20);
    const resourceType = req.body?.resourceType ? String(req.body.resourceType).slice(0, 60) : null;
    if (!moduleKey || !action) return res.status(400).json({ success: false, code: 'PERMISSION_CHECK_INPUT', error: 'module et action sont requis.' });
    const identity = admin(req);
    const decision = can(db, identity.role, {
      module: moduleKey, action, resourceType,
      record: req.body?.record && typeof req.body.record === 'object' ? req.body.record as Record<string, unknown> : null,
      employee: resolveEmployee(db, identity.id),
    });
    res.json({ success: true, data: { ...decision, module: moduleKey, action, resourceType } });
  });

  router.post('/permissions/seed', requireAdmin(db, 'users:write'), (req, res) => {
    const result = seedLegacyPermissions(db);
    audit(req, db, { action: 'RESET', module: 'PERMISSIONS', resourceType: 'role_permission', after: result });
    res.json({ success: true, data: result });
  });

  // ---------- Audit & events ----------
  router.get('/audit', requireAdmin(db, 'audit:read'), (req, res) => {
    const result = listAuditEvents(db, {
      page: Number(req.query.page) || 1, pageSize: Number(req.query.pageSize) || 30,
      module: typeof req.query.module === 'string' ? req.query.module : '',
      employeeId: typeof req.query.employeeId === 'string' ? req.query.employeeId : '',
      employeeCode: typeof req.query.employeeCode === 'string' ? req.query.employeeCode : '',
      action: typeof req.query.action === 'string' ? req.query.action : '',
      resourceType: typeof req.query.resourceType === 'string' ? req.query.resourceType : '',
      resourceId: typeof req.query.resourceId === 'string' ? req.query.resourceId : '',
      from: typeof req.query.from === 'string' ? req.query.from : '',
      to: typeof req.query.to === 'string' ? req.query.to : '',
    });
    res.json({ success: true, ...result });
  });

  router.get('/audit/coverage', requireAdmin(db, 'audit:read'), (req, res) => {
    res.json({ success: true, data: { ...auditCoverage(db, Number(req.query.days) || 30), resourceTypeFor: (module: string) => resourceTypeForModule(module) } });
  });

  router.get('/events', requireAdmin(db, 'dashboard:read'), (req, res) => {
    res.json({ success: true, data: listErpEvents(db, Number(req.query.limit) || 50, typeof req.query.module === 'string' ? req.query.module : undefined) });
  });

  // ---------- Sequences (numbering foundation) ----------
  router.get('/sequences', requireAdmin(db, 'settings:write'), (_req, res) => {
    res.json({ success: true, data: listSequences(db) });
  });

  router.post('/sequences/preview', requireAdmin(db, 'settings:write'), (req, res) => {
    // Preview never consumes a number: it shows what the next issued value would be.
    const key = String(req.body?.key || 'employee_code').slice(0, 40);
    const row = db.get<{ prefix: string; padding: number; year_scoped: number; next_value: number }>(
      'SELECT prefix,padding,year_scoped,next_value FROM erp_sequences WHERE sequence_key=?', key);
    if (!row) return res.status(404).json({ success: false, code: 'SEQUENCE_UNAVAILABLE', error: 'Séquence inconnue.' });
    const year = row.year_scoped ? `-${new Date().getFullYear()}` : '';
    res.json({
      success: true,
      data: { key, next: `${row.prefix}${year}-${String(row.next_value).padStart(Number(row.padding) || 6, '0')}`, consumesNumber: false },
    });
  });

  return router;
}
