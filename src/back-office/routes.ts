/**
 * AYROVI Back Office (P2.0) — API de la coquille et du framework de ressources.
 *
 * Montée sous `/api/admin/back-office` depuis le router admin existant : elle hérite donc du
 * cookie de session (`Path=/api/admin`), de la règle CSRF sur les écritures et des mêmes gardes
 * que tout le reste du back office. Aucun nouveau système :
 *   • autorisation  → `requireAdmin` (session + legacy) et `can()` (src/erp-core/permissions) ;
 *   • audit         → `writeAuditEvent` (src/erp-core/audit), rédacteur unique ;
 *   • identité      → `resolveEmployee` (src/erp-core/identity) ;
 *   • modules       → `ERP_MODULES` (src/erp-core/modules) ;
 *   • ressources    → registry dérivé de `src/back-office/resources.ts`.
 *
 * Tout est en LECTURE seule en P2.0 : la coquille décrit l'espace de travail, elle ne déplace
 * aucune écriture métier. Les écrans continuent d'appeler leurs routes actuelles.
 */
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import type { QatafoDatabase } from '../db/database';
import type { AdminIdentity } from '../admin/auth';
import { requireAdmin } from '../admin/auth';
import type { AdminPermission, AdminRole } from '../admin/permissions';
import { hasPermission, permissionsForRole } from '../admin/permissions';
import { can } from '../erp-core/permissions';
import { writeAuditEvent, auditContextFromRequest } from '../erp-core/audit';
import { resolveEmployee } from '../erp-core/identity';
import { ERP_MODULES, moduleRegistryPayload } from '../erp-core/modules';
import { statusVocabulary, statusTone, statusLabel } from '../domain/statuses';
import {
  BACK_OFFICE_DOMAINS, RESOURCE_ACTIONS, resourceDescriptorByKey, resourceDescriptorBySection,
  resourceDescriptors, type BackOfficeResourceDescriptor, type ResourceActionKey,
} from './resources';
import { backOfficeNavigation, backOfficeSections } from './navigation';
import { SEARCH_SOURCES, canSearchSource, globalSearch } from './search';

type BackOfficeRequest = Request & { admin?: AdminIdentity };

const identity = (req: BackOfficeRequest): AdminIdentity => req.admin as AdminIdentity;

/** Le framework est versionné : un client qui ne connaît pas cette version retombe sur son rendu legacy. */
export const BACK_OFFICE_FRAMEWORK_VERSION = 'p2.0';

/**
 * Capacités par action pour le compte appelant. La décision passe par `can()` — donc la
 * permission legacy d'abord (jamais affaiblie), le grant ERP ensuite. Une action sans clé ERP
 * déclarée renvoie `null` : le framework ne grise pas ce qu'il ne sait pas décider.
 */
function capabilitiesFor(db: QatafoDatabase, admin: AdminIdentity, descriptor: BackOfficeResourceDescriptor) {
  const employee = resolveEmployee(db, admin.id);
  const capabilities: Partial<Record<ResourceActionKey, boolean | null>> = {};
  for (const action of RESOURCE_ACTIONS) {
    if (!descriptor.actions.includes(action)) continue;
    const permission = descriptor.permissions[action];
    if (!permission) {
      // Aucune clé ERP déclarée pour cette action : c'est l'écran qui décide (parité exacte
      // avec l'existant). `null` = « le framework ne grise rien », jamais « refusé ».
      capabilities[action] = null;
      continue;
    }
    const [moduleKey = descriptor.permissionModule ?? descriptor.module, actionKey = 'read'] = String(permission).split(':');
    capabilities[action] = can(db, admin.role, { module: moduleKey, action: actionKey, resourceType: descriptor.audit.resourceType, employee }).allowed;
  }
  return capabilities;
}

function publicDescriptor(descriptor: BackOfficeResourceDescriptor) {
  const vocabulary = statusVocabulary(descriptor.statusVocabulary);
  return {
    key: descriptor.key,
    label: descriptor.label,
    singular: descriptor.singular,
    description: descriptor.description,
    domain: descriptor.domain,
    module: descriptor.module,
    moduleStatus: ERP_MODULES.find((module) => module.key === descriptor.module)?.status ?? 'legacy',
    surface: descriptor.surface,
    component: descriptor.component ?? null,
    section: descriptor.section,
    aliases: descriptor.aliases ?? [],
    api: descriptor.api,
    actions: descriptor.actions,
    permissions: descriptor.permissions,
    navPermission: descriptor.navPermission,
    columns: descriptor.columns,
    fields: descriptor.fields,
    status: descriptor.statusField ? {
      field: descriptor.statusField,
      vocabulary: descriptor.statusVocabulary ?? null,
      values: descriptor.statuses ?? vocabulary ?? [],
    } : null,
    audit: descriptor.audit,
    canonicalOf: descriptor.canonicalOf ?? null,
    notes: descriptor.notes ?? null,
  };
}

/** Le préfixe déclaré doit exister réellement : une carte d'API se prouve, elle ne s'invente pas. */
function adminRoutesSource(): string {
  if (cachedAdminRoutes === null) {
    try {
      cachedAdminRoutes = require('node:fs').readFileSync(path.resolve(__dirname, '../admin/routes.ts'), 'utf8') as string;
    } catch {
      cachedAdminRoutes = '';
    }
  }
  return cachedAdminRoutes;
}
let cachedAdminRoutes: string | null = null;

export function createBackOfficeRouter(db: QatafoDatabase): Router {
  const router = Router();

  /** Contexte minimal de la coquille : qui est connecté, ce qu'il voit, ce qui existe. */
  router.get('/context', requireAdmin(db), (req: BackOfficeRequest, res: Response) => {
    const admin = identity(req);
    const navigation = backOfficeNavigation(db, admin.role);
    res.json({
      success: true,
      data: {
        frameworkVersion: BACK_OFFICE_FRAMEWORK_VERSION,
        role: admin.role,
        legacyPermissions: permissionsForRole(admin.role),
        employee: (() => {
          const employee = resolveEmployee(db, admin.id);
          return employee ? {
            code: employee.employeeCode, label: employee.fullName || null,
            jobTitle: employee.jobTitle || null, status: employee.status,
            branch: employee.branchName ?? null, department: employee.departmentName ?? null,
          } : null;
        })(),
        counts: navigation.counts,
        domains: navigation.domains,
        roadmap: navigation.roadmap,
        session: { name: admin.name, email: admin.email },
      },
    });
  });

  /** Navigation de la barre latérale — dérivée, jamais recopiée (groupes, ordre, visibilité). */
  router.get('/navigation', requireAdmin(db), (req: BackOfficeRequest, res: Response) => {
    res.json({ success: true, data: backOfficeNavigation(db, identity(req).role) });
  });

  /** Descripteurs de ressources, avec le drapeau « ce rôle peut ouvrir cet écran ». */
  router.get('/resources', requireAdmin(db), (req: BackOfficeRequest, res: Response) => {
    const admin = identity(req);
    const items = resourceDescriptors().map((descriptor) => ({
      ...publicDescriptor(descriptor),
      visible: hasPermission(admin.role, descriptor.navPermission as AdminPermission)
        || can(db, admin.role, { module: descriptor.permissionModule ?? descriptor.module, action: 'read', resourceType: null }).allowed,
      search: SEARCH_SOURCES.some((source) => source.resource === descriptor.key && canSearchSource(db, admin.role, source)),
    }));
    res.json({
      success: true,
      data: {
        frameworkVersion: BACK_OFFICE_FRAMEWORK_VERSION,
        domains: BACK_OFFICE_DOMAINS,
        resources: items,
        modules: moduleRegistryPayload(),
      },
    });
  });

  /** Une ressource + ses capacités par action (la matrice que l'UI doit consommer). */
  router.get('/resources/:key', requireAdmin(db), (req: BackOfficeRequest, res: Response) => {
    const admin = identity(req);
    const byKey = resourceDescriptorByKey(req.params.key);
    const descriptor = byKey ?? resourceDescriptorBySection(req.params.key);
    if (!descriptor) {
      return res.status(404).json({ success: false, code: 'RESOURCE_NOT_FOUND', error: `Ressource inconnue : ${req.params.key}` });
    }
    const statuses = descriptor.statuses ?? statusVocabulary(descriptor.statusVocabulary) ?? [];
    res.json({
      success: true,
      data: {
        ...publicDescriptor(descriptor),
        capabilities: capabilitiesFor(db, admin, descriptor),
        statuses: statuses.map((status) => ({ value: status, label: statusLabel(status), tone: statusTone(status) })),
        searchSource: SEARCH_SOURCES.find((source) => source.resource === descriptor.key)
          ? { permission: descriptor.navPermission, enabled: canSearchSource(db, admin.role, SEARCH_SOURCES.find((source) => source.resource === descriptor.key)!) }
          : null,
      },
    });
  });

  /** Recherche globale multi-ressources, filtrée par permission, une ligne d'audit par recherche. */
  router.get('/search', requireAdmin(db, 'dashboard:read'), (req: BackOfficeRequest, res: Response) => {
    const admin = identity(req);
    const result = globalSearch(db, admin.role, req.query.q);
    if (result.query.length >= 2) {
      writeAuditEvent(db, {
        actor: { id: admin.id, name: admin.name, ipAddress: req.ip || null },
        action: 'ACCESS', module: 'BACK_OFFICE',
        resource: { type: 'search', id: null },
        newValues: { query_length: result.query.length, hits: result.hits.length, sources: result.sources.filter((source) => source.count > 0).map((source) => source.resource) },
        context: auditContextFromRequest(db, req),
      });
    }
    res.json({
      success: true,
      data: {
        ...result,
        available: result.sources.length > 0,
        minQuery: 2,
      },
    });
  });

  /** Auto-diagnostics du framework — ce que la CI vérifie, exposé pour l'écran « Modules & environnement ». */
  router.get('/self-test', requireAdmin(db, 'dashboard:read'), (_req: BackOfficeRequest, res: Response) => {
    const descriptors = resourceDescriptors();
    const registryKeys = new Set(ERP_MODULES.map((module) => module.key));
    const problems: string[] = [];
    const seenKeys = new Set<string>();
    const seenSections = new Set<string>();
    for (const descriptor of descriptors) {
      if (seenKeys.has(descriptor.key)) problems.push(`clé de ressource dupliquée: ${descriptor.key}`);
      seenKeys.add(descriptor.key);
      for (const section of [descriptor.section, ...(descriptor.aliases ?? [])]) {
        if (seenSections.has(section)) problems.push(`section dupliquée: ${section}`);
        seenSections.add(section);
      }
      if (!registryKeys.has(descriptor.module)) problems.push(`${descriptor.key}: module absent du registre ERP (${descriptor.module})`);
      if (!descriptor.nav && !descriptor.navlessReason) problems.push(`${descriptor.key}: aucune entrée de navigation sans raison documentée`);
      if (descriptor.api.kind === 'generic' && descriptor.surface === 'custom') {
        const escaped = descriptor.api.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Le préfixe doit exister comme surface : route exacte (`'/pricing'`) ou parente d'une
        // route déclarée (`'/magazine-agent'` → `'/magazine-agent/generate'`).
        const declared = new RegExp(`'${escaped}'|'${escaped}/`).test(adminRoutesSource());
        if (!declared) problems.push(`${descriptor.key}: api.prefix ${descriptor.api.prefix} introuvable dans src/admin/routes.ts`);
      }
      for (const [action, permission] of Object.entries(descriptor.permissions)) {
        if (!/^[a-z_]+:[a-z]+$/.test(String(permission))) problems.push(`${descriptor.key}.${action}: permission mal formée (${permission})`);
        if (!descriptor.actions.includes(action as ResourceActionKey)) problems.push(`${descriptor.key}.${action}: action déclarée mais absente de la liste`);
      }
      if (descriptor.statusVocabulary && !statusVocabulary(descriptor.statusVocabulary)) problems.push(`${descriptor.key}: vocabulaire de statut inconnu (${descriptor.statusVocabulary})`);
    }
    const sections = backOfficeSections();
    res.json({
      success: true,
      data: {
        frameworkVersion: BACK_OFFICE_FRAMEWORK_VERSION,
        resources: descriptors.length,
        frameworkRendered: descriptors.filter((descriptor) => descriptor.surface === 'framework').length,
        customRendered: descriptors.filter((descriptor) => descriptor.surface === 'custom').length,
        navigable: descriptors.filter((descriptor) => descriptor.nav).length,
        sections,
        searchSources: SEARCH_SOURCES.length,
        problems,
        status: problems.length === 0 && sections.length >= 39 ? 'ok' : 'attention',
      },
    });
  });

  return router;
}
