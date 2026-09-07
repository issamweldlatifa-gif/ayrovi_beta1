/**
 * AYROVI CRM 360 (E1) — fiches relationnelles (Party), contacts, relations, raccordements.
 *
 * Le modèle relationnel est ici : un PARTY (individu ou entreprise), catégorisé par sa
 * relation (client/partenaire/fournisseur/prospect/autre), avec des CONTACTS, des
 * RELATIONS inter-fiches et des RACCORDEMENTS (links) vers les identités existantes
 * (`customers`, `customer_accounts`, `suppliers`, `orders`) — jamais de copie de leur
 * contenu. Aucun doublon n'est créé silencieusement : la création refuse (409) si une
 * fiche comparable existe déjà (téléphone normalisé, e-mail ou nom à la casse près).
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { nextSequenceNumber } from '../erp-core/sequences';
import { CRM_LIMITS, CRM_ERRORS, type PartyKind } from './types';
import { type CrmActor, recordCrmMutation } from './audit';
import {
  cleanMultiline, cleanText, isValidEnum, isValidId, parseDateOrNull, parseFlag,
  parsePageSize, parsePositiveInt, parseTags, validateEmail, validatePhone,
} from './validation';

export type Outcome<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; details?: Array<{ field: string; reason: string }> };

export interface PartyPayload {
  partyType?: 'INDIVIDUAL' | 'COMPANY';
  kind?: PartyKind;
  name: string;
  legalName?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  email?: string;
  phone?: string;
  phoneVerified?: boolean;
  website?: string;
  taxId?: string;
  governorate?: string;
  city?: string;
  address?: string;
  industry?: string;
  tags?: string[];
  source?: string;
  ownerEmployeeId?: string | null;
  rating?: number | null;
  nextFollowUpAt?: string | null;
}

/** Clé de séquence de numérotation selon la catégorie relationnelle de la fiche. */
export function partySequenceKeyFor(kind: PartyKind): string {
  switch (kind) {
    case 'CUSTOMER': return 'party_customer_code';
    case 'PARTNER': return 'party_partner_code';
    case 'SUPPLIER': return 'party_supplier_code';
    case 'PROSPECT': return 'party_prospect_code';
    default: return 'party_other_code';
  }
}

function outcomeError<T>(code: string, message: string): Outcome<T> {
  return { ok: false, code, message };
}

/**
 * Colonnes autorisées à l'INSERT — jamais `req.body` brut (anti mass-assignment) : chaque
 * mutation assemble un objet colonnes explicite (`values`) ; cette liste sert de
 * documentation de l'API autorisée, pas de projection dynamique de la requête.
 */
export function cleanPartyPayload(raw: Record<string, unknown>, partial: boolean): { payload: PartyPayload; issues: Array<{ field: string; reason: string }> } {
  const issues: Array<{ field: string; reason: string }> = [];
  const missing = (field: string, reason: string) => issues.push({ field, reason });

  // En mode partiel (PUT) un champ absent n'est ni validé ni replié sur sa valeur par défaut :
  // seuls les champs fournis sont examinés, et un champ fourni mais invalide est refusé.
  const partyType = String(raw.partyType ?? '').toUpperCase();
  const partyTypeValid = isValidEnum(partyType, ['INDIVIDUAL', 'COMPANY']);
  if (raw.partyType !== undefined && !partyTypeValid) missing('partyType', 'Type de fiche invalide.');
  const kind = String(raw.kind ?? '').toUpperCase();
  const kindValid = isValidEnum(kind, ['CUSTOMER', 'PARTNER', 'SUPPLIER', 'PROSPECT', 'OTHER']);
  if (raw.kind !== undefined && !kindValid) missing('kind', 'Catégorie relationnelle invalide.');
  if (!partial && !kindValid) missing('kind', 'Catégorie relationnelle requise.');

  const name = cleanText(raw.name, CRM_LIMITS.NAME_MAX);
  if (!partial && !name) missing('name', 'Le nom de la fiche est requis.');
  if (partial && raw.name !== undefined && !name) missing('name', 'Le nom ne peut pas être vide.');

  let status: 'ACTIVE' | 'INACTIVE' | undefined;
  if (raw.status !== undefined) {
    const value = String(raw.status ?? 'ACTIVE').toUpperCase();
    if (value === 'ACTIVE' || value === 'INACTIVE') status = value;
    else missing('status', 'Statut invalide (ACTIVE ou INACTIVE).');
  }

  const emailResult = validateEmail(raw.email);
  if (emailResult) issues.push(emailResult);

  const phoneResult = validatePhone(raw.phone);
  let phone: string | undefined;
  let normalizedPhone = '';
  if (phoneResult) {
    if ('normalized' in phoneResult && 'phone' in phoneResult) {
      phone = phoneResult.phone;
      normalizedPhone = phoneResult.normalized;
    } else if ('field' in phoneResult) {
      issues.push({ field: phoneResult.field, reason: phoneResult.reason });
    }
  } else if (raw.phone !== undefined && raw.phone !== null && String(raw.phone).trim() !== '') {
    issues.push({ field: 'phone', reason: 'Numéro de téléphone invalide.' });
  }

  const tagsResult = parseTags(raw.tags ?? []);
  let tags: string[] | undefined;
  if ('tags' in tagsResult) tags = tagsResult.tags; else issues.push(tagsResult);

  let rating: number | null | undefined;
  if (raw.rating !== undefined && raw.rating !== null && String(raw.rating).trim() !== '') {
    const value = Number(raw.rating);
    if (!Number.isFinite(value) || value < 0 || value > 5) missing('rating', 'Note entre 0 et 5.');
    else rating = Math.round(value * 2) / 2;
  }

  const source = String(raw.source ?? 'MANUAL').toUpperCase();
  if (!isValidEnum(source, ['MANUAL', 'IMPORT', 'CHECKOUT', 'ARRIVAL', 'LEGACY', 'API']) && raw.source !== undefined) {
    missing('source', 'Source de fiche inconnue.');
  }

  const ownerEmployeeId = raw.ownerEmployeeId === undefined || raw.ownerEmployeeId === null || raw.ownerEmployeeId === ''
    ? null : (isValidId(String(raw.ownerEmployeeId)) ? String(raw.ownerEmployeeId) : (missing('ownerEmployeeId', 'Propriétaire interne invalide.'), null));

  const nextFollowUp = raw.nextFollowUpAt === undefined ? null : parseDateOrNull(raw.nextFollowUpAt);
  if (raw.nextFollowUpAt !== undefined && raw.nextFollowUpAt !== null && String(raw.nextFollowUpAt).trim() !== '' && !nextFollowUp) {
    missing('nextFollowUpAt', 'Date de suivi invalide.');
  }

  const resolvedPartyType: 'INDIVIDUAL' | 'COMPANY' | undefined =
    partyTypeValid ? (partyType === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL') : (partial ? undefined : 'INDIVIDUAL');
  const resolvedKind: PartyKind | undefined = kindValid
    ? (kind === 'CUSTOMER' ? 'CUSTOMER'
        : kind === 'PARTNER' ? 'PARTNER'
          : kind === 'SUPPLIER' ? 'SUPPLIER'
            : kind === 'PROSPECT' ? 'PROSPECT' : 'OTHER')
    : (partial ? undefined : 'OTHER');

  const payload: PartyPayload = {
    partyType: resolvedPartyType,
    kind: resolvedKind,
    name,
    legalName: cleanText(raw.legalName, CRM_LIMITS.NAME_MAX),
    status,
    email: cleanText(raw.email, CRM_LIMITS.EMAIL_MAX),
    phone,
    phoneVerified: raw.phoneVerified === undefined ? undefined : parseFlag(raw.phoneVerified) === 1,
    website: cleanText(raw.website, 300),
    taxId: cleanText(raw.taxId, CRM_LIMITS.CODE_MAX),
    governorate: cleanText(raw.governorate, 80),
    city: cleanText(raw.city, 120),
    address: cleanMultiline(raw.address, 400),
    industry: cleanText(raw.industry, 120),
    tags,
    source: isValidEnum(source, ['MANUAL', 'IMPORT', 'CHECKOUT', 'ARRIVAL', 'LEGACY', 'API']) ? source : 'MANUAL',
    ownerEmployeeId,
    rating: rating === undefined ? null : rating,
    nextFollowUpAt: nextFollowUp,
  };
  (payload as unknown as { normalizedPhone?: string }).normalizedPhone = normalizedPhone;
  return { payload, issues };
}

/** Recherche de doublons probables : jamais de création silencieuse d'un second enregistrement. */
export function duplicateCandidates(db: QatafoDatabase, payload: PartyPayload, exceptId?: string) {
  const parts: string[] = [];
  const params: unknown[] = [];
  const ors: string[] = [];
  const normalized = (payload as unknown as { normalizedPhone?: string }).normalizedPhone;
  if (normalized) { ors.push('p.normalized_phone = ?'); params.push(normalized); }
  const email = cleanText(payload.email, CRM_LIMITS.EMAIL_MAX);
  if (email) { ors.push('LOWER(p.email) = LOWER(?)'); params.push(email); }
  const name = cleanText(payload.name, CRM_LIMITS.NAME_MAX);
  if (name.length >= 3) { ors.push('LOWER(p.name) = LOWER(?)'); params.push(name); }
  if (!ors.length) return [];
  parts.push(`(${ors.join(' OR ')})`);
  parts.push("p.status != 'ARCHIVED'");
  if (exceptId) { parts.push('p.id <> ?'); params.push(exceptId); }
  const where = parts.join(' AND ');
  return db.all<any>(`SELECT p.id,p.party_code,p.party_type,p.kind,p.name,p.email,p.phone,p.governorate,p.status,
    p.owner_employee_id,e.first_name||' '||e.last_name AS owner_name
    FROM crm360_parties p LEFT JOIN erp_employees e ON e.id=p.owner_employee_id
    WHERE ${where} ORDER BY p.updated_at DESC LIMIT 8`, ...params);
}

export function getParty(db: QatafoDatabase, id: string) {
  return db.get<any>(`SELECT p.*, e.first_name||' '||e.last_name AS owner_name,
      (SELECT COUNT(*) FROM crm360_contacts c WHERE c.party_id=p.id AND c.status='ACTIVE') AS contact_count,
      (SELECT COUNT(*) FROM crm360_tasks t WHERE t.party_id=p.id AND t.status IN ('OPEN','IN_PROGRESS','WAITING')) AS open_task_count,
      (SELECT COUNT(*) FROM crm360_issues i WHERE i.party_id=p.id AND i.status IN ('OPEN','IN_PROGRESS','WAITING')) AS open_issue_count
    FROM crm360_parties p LEFT JOIN erp_employees e ON e.id=p.owner_employee_id WHERE p.id=?`, id);
}

export function listParties(db: QatafoDatabase, query: {
  page?: unknown; pageSize?: unknown; search?: unknown; kind?: unknown; status?: unknown; owner?: unknown;
}) {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = parsePageSize(query.pageSize, 25);
  const search = cleanText(query.search, 120);
  const kind = cleanText(query.kind, 40).toUpperCase();
  const status = cleanText(query.status, 40).toUpperCase();
  const owner = cleanText(query.owner, 160);

  const where: string[] = [];
  const params: unknown[] = [];
  if (search) {
    where.push('(p.name LIKE ? OR p.party_code LIKE ? OR p.email LIKE ? OR p.phone LIKE ? OR p.normalized_phone LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }
  if (isValidEnum(kind, ['CUSTOMER', 'PARTNER', 'SUPPLIER', 'PROSPECT', 'OTHER'])) { where.push('p.kind = ?'); params.push(kind); }
  if (isValidEnum(status, ['ACTIVE', 'INACTIVE', 'ARCHIVED'])) { where.push('p.status = ?'); params.push(status); }
  if (isValidId(owner)) { where.push('p.owner_employee_id = ?'); params.push(owner); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM crm360_parties p ${clause}`, ...params)?.count ?? 0);
  const items = db.all<any>(`SELECT p.id,p.party_code,p.party_type,p.kind,p.name,p.email,p.phone,p.governorate,p.status,
      p.owner_employee_id,p.rating,p.tags,p.last_contacted_at,p.next_follow_up_at,p.created_at,p.updated_at,
      e.first_name||' '||e.last_name AS owner_name,
      (SELECT COUNT(*) FROM crm360_tasks t WHERE t.party_id=p.id AND t.status IN ('OPEN','IN_PROGRESS','WAITING')) AS open_task_count,
      (SELECT COUNT(*) FROM crm360_issues i WHERE i.party_id=p.id AND i.status IN ('OPEN','IN_PROGRESS','WAITING')) AS open_issue_count
    FROM crm360_parties p LEFT JOIN erp_employees e ON e.id=p.owner_employee_id
    ${clause} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}

/** Vue 360° : identité + contacts + relations + raccordements legacy + indicateurs. */
export function getParty360(db: QatafoDatabase, id: string): Outcome<unknown> {
  const party = getParty(db, id);
  if (!party) return outcomeError(CRM_ERRORS.PARTY_NOT_FOUND, 'Fiche relationnelle introuvable.');
  const contacts = db.all<any>(`SELECT * FROM crm360_contacts WHERE party_id=? ORDER BY is_primary DESC, updated_at DESC LIMIT 200`, id);
  const relationships = db.all<any>(`SELECT r.*, fp.party_code AS from_code, fp.name AS from_name,
      tp.party_code AS to_code, tp.name AS to_name
    FROM crm360_relationships r
    JOIN crm360_parties fp ON fp.id=r.from_party_id
    JOIN crm360_parties tp ON tp.id=r.to_party_id
    WHERE r.from_party_id=? OR r.to_party_id=?
    ORDER BY r.updated_at DESC LIMIT 200`, id, id);
  const links = db.all<any>('SELECT * FROM crm360_party_links WHERE party_id=? ORDER BY created_at DESC LIMIT 100', id);

  const customerIds = links.filter((l) => l.ref_type === 'customer').map((l) => l.ref_id);
  const accountIds = links.filter((l) => l.ref_type === 'customer_account').map((l) => l.ref_id);
  const supplierIds = links.filter((l) => l.ref_type === 'supplier').map((l) => l.ref_id);

  const placeholders = (count: number) => Array(Math.max(count, 1)).fill('?').join(',');
  const orders = (customerIds.length || accountIds.length)
    ? db.all<any>(`SELECT o.id,o.order_number,o.status,o.payment_status,o.total_tnd,o.created_at,
        COALESCE(a.email,a.phone,'') AS account_ref
      FROM orders o LEFT JOIN customer_accounts a ON a.id=o.account_id
      WHERE o.customer_id IN (${placeholders(customerIds.length)}) OR o.account_id IN (${placeholders(accountIds.length)})
      ORDER BY o.created_at DESC LIMIT 300`,
      ...customerIds, ...(customerIds.length ? accountIds : []))
    : [];
  const legacySuppliers = supplierIds.length
    ? db.all<any>(`SELECT s.id,s.code,s.name,s.contact_name,s.phone,s.email,s.currency,s.status FROM suppliers s WHERE s.id IN (${placeholders(supplierIds.length)})`, ...supplierIds)
    : [];

  const orderCount = orders.length;
  const lifetimeValue = orders.reduce((sum, o) => sum + (o.status !== 'CANCELLED' ? Number(o.total_tnd || 0) : 0), 0);
  const lastOrderAt = orders[0]?.created_at ?? null;

  const counters = db.get<any>(`SELECT
      (SELECT COUNT(*) FROM crm360_tasks t WHERE t.party_id=? AND t.status IN ('OPEN','IN_PROGRESS','WAITING')) AS open_tasks,
      (SELECT COUNT(*) FROM crm360_tasks t WHERE t.party_id=? AND t.status IN ('OPEN','IN_PROGRESS','WAITING') AND t.due_at IS NOT NULL AND t.due_at < ?) AS overdue_tasks,
      (SELECT COUNT(*) FROM crm360_tasks t WHERE t.party_id=? AND t.is_follow_up=1 AND t.status IN ('OPEN','IN_PROGRESS','WAITING')) AS open_follow_ups,
      (SELECT COUNT(*) FROM crm360_issues i WHERE i.party_id=? AND i.status IN ('OPEN','IN_PROGRESS','WAITING')) AS open_issues,
      (SELECT COUNT(*) FROM crm360_activities a WHERE a.party_id=? AND a.status='OPEN') AS open_activities,
      (SELECT COUNT(*) FROM crm360_notes n WHERE n.party_id=?) AS note_count
    `, id, id, new Date().toISOString(), id, id, id, id);

  return { ok: true, value: {
    party,
    contacts,
    relationships,
    links,
    legacy: { customers: customerIds.length, accounts: accountIds.length, suppliers: legacySuppliers, orders, orderCount, lifetimeValue, lastOrderAt },
    counters,
  } };
}

export function createParty(
  db: QatafoDatabase, actor: CrmActor, context: unknown,
  raw: Record<string, unknown>,
): Outcome<{ party: any; candidates?: unknown[] }> {
  const { payload, issues } = cleanPartyPayload(raw, false);
  if (issues.length) return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Données de fiche invalides.', details: issues };
  const kind = payload.kind;
  if (!kind) return outcomeError(CRM_ERRORS.VALIDATION, 'Catégorie relationnelle requise.');
  const partyType = payload.partyType ?? 'INDIVIDUAL';

  const candidates = duplicateCandidates(db, payload);
  if (candidates.length) {
    return { ok: false, code: CRM_ERRORS.DUPLICATE_PARTY, message: 'Une fiche comparable existe déjà. Ouvrez-la ou fusionnez plutôt que de dupliquer.', details: [{ field: 'duplicates', reason: `${candidates.length} fiche(s) proche(s)` }] };
  }

  const id = `party_${randomUUID()}`;
  const now = new Date().toISOString();
  const code = nextSequenceNumber(db, partySequenceKeyFor(kind));
  const normalized = (payload as unknown as { normalizedPhone?: string }).normalizedPhone ?? '';
  const owner = payload.ownerEmployeeId
    ? (db.get<{ id: string }>('SELECT id FROM erp_employees WHERE id=?', payload.ownerEmployeeId) ? payload.ownerEmployeeId : null)
    : null;

  const values: Record<string, unknown> = {
    party_type: partyType, kind, name: payload.name, legal_name: payload.legalName ?? '',
    status: payload.status ?? 'ACTIVE', email: payload.email ?? '', phone: payload.phone ?? '',
    normalized_phone: normalized, phone_verified: payload.phoneVerified ? 1 : 0,
    website: payload.website ?? '', tax_id: payload.taxId ?? '', governorate: payload.governorate ?? '',
    city: payload.city ?? '', address: payload.address ?? '', industry: payload.industry ?? '',
    tags: JSON.stringify(payload.tags ?? []), source: payload.source ?? 'MANUAL',
    owner_employee_id: owner, rating: payload.rating ?? null, next_follow_up_at: payload.nextFollowUpAt ?? null,
  };

  db.transaction(() => {
    const columns = Object.keys(values);
    db.run(`INSERT INTO crm360_parties
      (id,party_code,${columns.join(',')},created_by,updated_by,created_at,updated_at)
      VALUES (?,?,${columns.map(() => '?').join(',')},?,?,?,?)`,
    id, code, ...Object.values(values), actor.id ?? null, actor.id ?? null, now, now);
    recordCrmMutation(db, {
      actor,
      action: 'CREATE', resourceType: 'party', resourceId: id,
      after: { party_code: code, ...values, tags: payload.tags ?? [] },
      context: context as never,
      statusEvent: { entityType: 'party', entityId: id, verb: 'CREATED', toValue: payload.status ?? 'ACTIVE', actorEmployeeId: actor.id, at: now },
    });
  });

  return { ok: true, value: { party: { id, party_code: code, ...values, created_at: now, updated_at: now } } };
}

export function updateParty(
  db: QatafoDatabase, actor: CrmActor, context: unknown, id: string,
  raw: Record<string, unknown>,
): Outcome<{ party: any }> {
  const existing = getParty(db, id);
  if (!existing) return outcomeError(CRM_ERRORS.PARTY_NOT_FOUND, 'Fiche relationnelle introuvable.');
  if (existing.status === 'ARCHIVED') return outcomeError(CRM_ERRORS.IMMUTABLE, 'Une fiche archivée est immuable.');

  const { payload, issues } = cleanPartyPayload(raw, true);
  if (issues.length) return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Données de fiche invalides.', details: issues };
  // Toujours refuser un identifiant (nom/e-mail/téléphone) déjà porté par une autre fiche.
  if (raw.name !== undefined || raw.email !== undefined || raw.phone !== undefined) {
    const candidates = duplicateCandidates(db, payload, id);
    if (candidates.length) {
      return outcomeError(CRM_ERRORS.DUPLICATE_PARTY, 'Cette identité est déjà portée par une autre fiche.');
    }
  }

  const before = { ...existing };
  const set: string[] = [];
  const params: unknown[] = [];
  const assign = (column: string, value: unknown) => { set.push(`${column}=?`); params.push(value); };

  const normalized = (payload as unknown as { normalizedPhone?: string }).normalizedPhone;
  if (raw.name !== undefined) assign('name', payload.name);
  if (raw.partyType !== undefined && payload.partyType && payload.partyType !== existing.party_type) {
    assign('party_type', payload.partyType);
  }
  if (raw.kind !== undefined) {
    if (payload.kind && payload.kind !== existing.kind) {
      // Re-catégoriser change le préfixe lisible ; on ne re-numérote jamais une fiche existante.
      assign('kind', payload.kind);
    }
  }
  if (raw.legalName !== undefined) assign('legal_name', payload.legalName ?? '');
  if (raw.status !== undefined) assign('status', payload.status ?? 'ACTIVE');
  if (raw.email !== undefined) assign('email', payload.email ?? '');
  if (raw.phone !== undefined) { assign('phone', payload.phone ?? ''); assign('normalized_phone', normalized ?? ''); }
  if (raw.phoneVerified !== undefined) assign('phone_verified', payload.phoneVerified ? 1 : 0);
  if (raw.website !== undefined) assign('website', payload.website ?? '');
  if (raw.taxId !== undefined) assign('tax_id', payload.taxId ?? '');
  if (raw.governorate !== undefined) assign('governorate', payload.governorate ?? '');
  if (raw.city !== undefined) assign('city', payload.city ?? '');
  if (raw.address !== undefined) assign('address', payload.address ?? '');
  if (raw.industry !== undefined) assign('industry', payload.industry ?? '');
  if (raw.tags !== undefined) assign('tags', JSON.stringify(payload.tags ?? []));
  if (raw.ownerEmployeeId !== undefined) {
    const owner = payload.ownerEmployeeId && db.get<{ id: string }>('SELECT id FROM erp_employees WHERE id=?', payload.ownerEmployeeId) ? payload.ownerEmployeeId : null;
    assign('owner_employee_id', owner);
  }
  if (raw.rating !== undefined) assign('rating', payload.rating ?? null);
  if (raw.nextFollowUpAt !== undefined) assign('next_follow_up_at', payload.nextFollowUpAt ?? null);
  if (!set.length) return { ok: true, value: { party: existing } };

  const now = new Date().toISOString();
  set.push('updated_at=?');
  params.push(now, id);
  const statusChanged = raw.status !== undefined && String(raw.status).toUpperCase() !== existing.status;

  db.transaction(() => {
    db.run(`UPDATE crm360_parties SET ${set.join(',')} WHERE id=?`, ...params);
    const after = getParty(db, id);
    recordCrmMutation(db, {
      actor, action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE', resourceType: 'party', resourceId: id,
      before, after, context: context as never,
      statusEvent: statusChanged
        ? { entityType: 'party', entityId: id, verb: 'STATUS_CHANGED', fromValue: before.status, toValue: after?.status, actorEmployeeId: actor.id }
        : undefined,
    });
  });
  return { ok: true, value: { party: getParty(db, id) } };
}

export function archiveParty(db: QatafoDatabase, actor: CrmActor, context: unknown, id: string): Outcome<{ party: any }> {
  const existing = getParty(db, id);
  if (!existing) return outcomeError(CRM_ERRORS.PARTY_NOT_FOUND, 'Fiche relationnelle introuvable.');
  if (existing.status === 'ARCHIVED') return { ok: true, value: { party: existing } };
  const now = new Date().toISOString();
  db.transaction(() => {
    db.run(`UPDATE crm360_parties SET status='ARCHIVED',archived_at=?,updated_by=?,updated_at=? WHERE id=?`, now, actor.id, now, id);
    recordCrmMutation(db, {
      actor, action: 'STATUS_CHANGE', resourceType: 'party', resourceId: id,
      before: { status: existing.status }, after: { status: 'ARCHIVED', archived_at: now },
      context: context as never,
      statusEvent: { entityType: 'party', entityId: id, verb: 'ARCHIVED', fromValue: existing.status, toValue: 'ARCHIVED', actorEmployeeId: actor.id, at: now },
    });
  });
  return { ok: true, value: { party: getParty(db, id) } };
}

/* ------------------------------------------------------------------ */
/* Contacts                                                             */
/* ------------------------------------------------------------------ */

export function listContacts(db: QatafoDatabase, query: { partyId?: unknown; search?: unknown; page?: unknown; pageSize?: unknown }) {
  const partyId = cleanText(query.partyId, 160);
  const search = cleanText(query.search, 120);
  const page = parsePositiveInt(query.page, 1);
  const pageSize = parsePageSize(query.pageSize, 50);
  const where: string[] = [];
  const params: unknown[] = [];
  if (isValidId(partyId)) { where.push('c.party_id=?'); params.push(partyId); }
  if (search) {
    where.push('(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM crm360_contacts c ${clause}`, ...params)?.count ?? 0);
  const items = db.all<any>(`SELECT c.*, p.name AS party_name, p.kind AS party_kind
    FROM crm360_contacts c JOIN crm360_parties p ON p.id=c.party_id
    ${clause} ORDER BY c.is_primary DESC, c.updated_at DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  return { items, total, page, pageSize };
}

function cleanContactPayload(raw: Record<string, unknown>) {
  const issues: Array<{ field: string; reason: string }> = [];
  const first = cleanText(raw.firstName, 120);
  const last = cleanText(raw.lastName, 120);
  if (!first && !last) issues.push({ field: 'firstName', reason: 'Prénom ou nom requis.' });
  const emailIssue = validateEmail(raw.email);
  if (emailIssue) issues.push(emailIssue);
  let phone = '';
  let normalized = '';
  const phoneResult = validatePhone(raw.phone);
  if (phoneResult) {
    if ('normalized' in phoneResult && 'phone' in phoneResult) { phone = phoneResult.phone; normalized = phoneResult.normalized; }
    else if ('field' in phoneResult) issues.push({ field: phoneResult.field, reason: phoneResult.reason });
  } else if (raw.phone !== undefined && String(raw.phone).trim() !== '') issues.push({ field: 'phone', reason: 'Numéro invalide.' });
  return {
    payload: {
      firstName: first, lastName: last, title: cleanText(raw.title, 120), email: cleanText(raw.email, CRM_LIMITS.EMAIL_MAX),
      phone, normalizedPhone: normalized, phoneVerified: parseFlag(raw.phoneVerified) === 1,
      isPrimary: parseFlag(raw.isPrimary) === 1, status: String(raw.status ?? 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      notes: cleanMultiline(raw.notes, CRM_LIMITS.NOTES_MAX),
    },
    issues,
  };
}

export function createContact(
  db: QatafoDatabase, actor: CrmActor, context: unknown, raw: Record<string, unknown>,
): Outcome<{ contact: any }> {
  const partyId = cleanText(raw.partyId, 160);
  if (!isValidId(partyId)) return outcomeError(CRM_ERRORS.PARTY_NOT_FOUND, 'Fiche relationnelle requise.');
  if (!db.get<{ id: string }>('SELECT id FROM crm360_parties WHERE id=? AND status!=\'ARCHIVED\'', partyId)) {
    return outcomeError(CRM_ERRORS.PARTY_NOT_FOUND, 'Fiche relationnelle introuvable.');
  }
  const { payload, issues } = cleanContactPayload(raw);
  if (issues.length) return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Données de contact invalides.', details: issues };

  const id = `contact_${randomUUID()}`;
  const now = new Date().toISOString();
  try {
    db.transaction(() => {
      db.run(`INSERT INTO crm360_contacts
        (id,party_id,first_name,last_name,title,email,phone,normalized_phone,phone_verified,is_primary,status,notes,created_by,updated_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, partyId, payload.firstName, payload.lastName, payload.title, payload.email, payload.phone,
      payload.normalizedPhone, payload.phoneVerified ? 1 : 0, payload.isPrimary ? 1 : 0, payload.status, payload.notes,
      actor.id ?? null, actor.id ?? null, now, now);
      if (payload.isPrimary) {
        db.run(`UPDATE crm360_contacts SET is_primary=0,updated_at=? WHERE party_id=? AND id<>? AND is_primary=1`, now, partyId, id);
      }
      recordCrmMutation(db, {
        actor, action: 'CREATE', resourceType: 'contact', resourceId: id,
        after: { party_id: partyId, ...payload }, context: context as never,
        statusEvent: { entityType: 'contact', entityId: id, verb: 'CREATED', toValue: payload.status, actorEmployeeId: actor.id },
      });
    });
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) {
      return { ok: false, code: CRM_ERRORS.DUPLICATE_CONTACT, message: 'Un contact de cette fiche porte déjà ce téléphone ou cet e-mail.' };
    }
    throw error;
  }
  return { ok: true, value: { contact: db.get<any>('SELECT * FROM crm360_contacts WHERE id=?', id) } };
}

export function updateContact(
  db: QatafoDatabase, actor: CrmActor, context: unknown, id: string, raw: Record<string, unknown>,
): Outcome<{ contact: any }> {
  const existing = db.get<any>('SELECT * FROM crm360_contacts WHERE id=?', id);
  if (!existing) return outcomeError(CRM_ERRORS.CONTACT_NOT_FOUND, 'Contact introuvable.');
  const { payload, issues } = cleanContactPayload(raw);
  if (issues.length) return { ok: false, code: CRM_ERRORS.VALIDATION, message: 'Données de contact invalides.', details: issues };
  const before = { ...existing };
  const now = new Date().toISOString();
  try {
    db.transaction(() => {
      db.run(`UPDATE crm360_contacts SET first_name=?,last_name=?,title=?,email=?,phone=?,normalized_phone=?,
        phone_verified=?,is_primary=?,status=?,notes=?,updated_by=?,updated_at=? WHERE id=?`,
      payload.firstName, payload.lastName, payload.title, payload.email, payload.phone, payload.normalizedPhone,
      payload.phoneVerified ? 1 : 0, payload.isPrimary ? 1 : 0, payload.status, payload.notes, actor.id ?? null, now, id);
      if (payload.isPrimary) {
        db.run(`UPDATE crm360_contacts SET is_primary=0,updated_at=? WHERE party_id=? AND id<>? AND is_primary=1`, now, existing.party_id, id);
      }
      recordCrmMutation(db, {
        actor, action: 'UPDATE', resourceType: 'contact', resourceId: id,
        before, after: db.get<any>('SELECT * FROM crm360_contacts WHERE id=?', id),
        context: context as never,
      });
    });
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) {
      return { ok: false, code: CRM_ERRORS.DUPLICATE_CONTACT, message: 'Un contact de cette fiche porte déjà ce téléphone ou cet e-mail.' };
    }
    throw error;
  }
  return { ok: true, value: { contact: db.get<any>('SELECT * FROM crm360_contacts WHERE id=?', id) } };
}

export function deleteContact(db: QatafoDatabase, actor: CrmActor, context: unknown, id: string): Outcome<{ deleted: true }> {
  const existing = db.get<any>('SELECT id,party_id,first_name,last_name FROM crm360_contacts WHERE id=?', id);
  if (!existing) return outcomeError(CRM_ERRORS.CONTACT_NOT_FOUND, 'Contact introuvable.');
  db.transaction(() => {
    db.run('DELETE FROM crm360_contacts WHERE id=?', id);
    recordCrmMutation(db, {
      actor, action: 'DELETE', resourceType: 'contact', resourceId: id,
      before: existing, after: null, context: context as never,
      statusEvent: { entityType: 'contact', entityId: id, verb: 'DELETED', fromValue: existing.first_name || existing.last_name || id, actorEmployeeId: actor.id },
    });
  });
  return { ok: true, value: { deleted: true } };
}

/* ------------------------------------------------------------------ */
/* Relations inter-fiches et raccordements                              */
/* ------------------------------------------------------------------ */

export function addRelationship(
  db: QatafoDatabase, actor: CrmActor, context: unknown, raw: Record<string, unknown>,
): Outcome<{ relationship: any }> {
  const fromPartyId = cleanText(raw.fromPartyId, 160);
  const toPartyId = cleanText(raw.toPartyId, 160);
  if (!isValidId(fromPartyId) || !isValidId(toPartyId) || fromPartyId === toPartyId) {
    return outcomeError(CRM_ERRORS.VALIDATION, 'Deux fiches distinctes sont requises pour une relation.');
  }
  const from = db.get<{ id: string }>('SELECT id FROM crm360_parties WHERE id=?', fromPartyId);
  const to = db.get<{ id: string }>('SELECT id FROM crm360_parties WHERE id=?', toPartyId);
  if (!from || !to) return outcomeError(CRM_ERRORS.PARTY_NOT_FOUND, 'Une des deux fiches est introuvable.');
  const relationshipType = String(raw.relationshipType ?? '').toUpperCase();
  if (!['ACCOUNT_MANAGER', 'CUSTOMER', 'PARTNER', 'SUPPLIER', 'CONTACT', 'REFERRAL', 'OTHER'].includes(relationshipType)) {
    return outcomeError(CRM_ERRORS.VALIDATION, 'Type de relation invalide.');
  }
  const id = `rel_${randomUUID()}`;
  const now = new Date().toISOString();
  const since = parseDateOrNull(raw.sinceDate);
  db.run(`INSERT INTO crm360_relationships
    (id,from_party_id,to_party_id,relationship_type,role_label,notes,since_date,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
  id, fromPartyId, toPartyId, relationshipType, cleanText(raw.roleLabel, 160), cleanMultiline(raw.notes, 2000),
  since, actor.id ?? null, now, now);
  recordCrmMutation(db, {
    actor, action: 'CREATE', resourceType: 'relationship', resourceId: id,
    after: { from_party_id: fromPartyId, to_party_id: toPartyId, relationship_type: relationshipType },
    context: context as never,
    statusEvent: { entityType: 'party', entityId: fromPartyId, verb: 'RELATIONSHIP', toValue: relationshipType, note: `Lien vers ${toPartyId}`, actorEmployeeId: actor.id },
  });
  return { ok: true, value: { relationship: db.get<any>('SELECT * FROM crm360_relationships WHERE id=?', id) } };
}

export function listRelationships(db: QatafoDatabase, partyId: string) {
  return db.all<any>(`SELECT r.id,r.relationship_type,r.role_label,r.notes,r.since_date,r.created_at,r.updated_at,
      fp.id AS from_party_id, fp.party_code AS from_code, fp.name AS from_name, fp.kind AS from_kind,
      tp.id AS to_party_id, tp.party_code AS to_code, tp.name AS to_name, tp.kind AS to_kind
    FROM crm360_relationships r
    JOIN crm360_parties fp ON fp.id=r.from_party_id
    JOIN crm360_parties tp ON tp.id=r.to_party_id
    WHERE r.from_party_id=? OR r.to_party_id=?
    ORDER BY r.updated_at DESC LIMIT 200`, partyId, partyId);
}

export function removeRelationship(db: QatafoDatabase, actor: CrmActor, context: unknown, id: string): Outcome<{ deleted: true }> {
  const existing = db.get<any>('SELECT * FROM crm360_relationships WHERE id=?', id);
  if (!existing) return outcomeError(CRM_ERRORS.NOT_FOUND, 'Relation introuvable.');
  db.transaction(() => {
    db.run('DELETE FROM crm360_relationships WHERE id=?', id);
    recordCrmMutation(db, {
      actor, action: 'DELETE', resourceType: 'relationship', resourceId: id,
      before: existing, after: null, context: context as never,
    });
  });
  return { ok: true, value: { deleted: true } };
}

export function linkParty(db: QatafoDatabase, actor: CrmActor, context: unknown, raw: {
  partyId: string; refType: string; refId: string; note?: string;
}): Outcome<{ link: any }> {
  if (!isValidId(raw.partyId)) return outcomeError(CRM_ERRORS.PARTY_NOT_FOUND, 'Fiche relationnelle requise.');
  if (!db.get<{ id: string }>('SELECT id FROM crm360_parties WHERE id=? AND status!=\'ARCHIVED\'', raw.partyId)) {
    return outcomeError(CRM_ERRORS.PARTY_NOT_FOUND, 'Fiche relationnelle introuvable.');
  }
  const refType = String(raw.refType).toLowerCase();
  const allowed = ['customer', 'customer_account', 'supplier', 'order', 'assistant_ticket', 'external'];
  if (!allowed.includes(refType)) return outcomeError(CRM_ERRORS.VALIDATION, 'Type de raccordement inconnu.');
  const refId = cleanText(raw.refId, 160);
  if (!refId) return outcomeError(CRM_ERRORS.VALIDATION, 'Référence cible requise.');
  // Le lien ne peut pointer que vers une identité réellement existante (sauf external).
  if (refType !== 'external') {
    const table = { customer: 'customers', customer_account: 'customer_accounts', supplier: 'suppliers', order: 'orders', assistant_ticket: 'assistant_support_tickets' }[refType as string];
    const exists = db.get<{ id: string }>(`SELECT id FROM ${table} WHERE id=?`, refId);
    if (!exists) return outcomeError(CRM_ERRORS.INVALID_REFERENCE, 'La cible du raccordement n’existe pas.');
  }
  const id = `link_${randomUUID()}`;
  const now = new Date().toISOString();
  try {
    db.transaction(() => {
      db.run(`INSERT INTO crm360_party_links (id,party_id,ref_type,ref_id,note,created_by,created_at) VALUES (?,?,?,?,?,?,?)`,
        id, raw.partyId, refType, refId, cleanMultiline(raw.note, 500), actor.id ?? null, now);
      recordCrmMutation(db, {
        actor, action: 'CREATE', resourceType: 'party_link', resourceId: id,
        after: { party_id: raw.partyId, ref_type: refType, ref_id: refId },
        context: context as never,
        statusEvent: { entityType: 'party', entityId: raw.partyId, verb: 'LINKED', toValue: `${refType}:${refId}`, note: cleanMultiline(raw.note, 500), actorEmployeeId: actor.id },
      });
    });
  } catch (error: any) {
    if (String(error?.message || '').includes('UNIQUE')) {
      return outcomeError(CRM_ERRORS.ALREADY_LINKED, 'Cette identité est déjà rattachée à la fiche.');
    }
    throw error;
  }
  return { ok: true, value: { link: db.get<any>('SELECT * FROM crm360_party_links WHERE id=?', id) } };
}

export function unlinkParty(db: QatafoDatabase, actor: CrmActor, context: unknown, linkId: string): Outcome<{ deleted: true }> {
  const existing = db.get<any>('SELECT * FROM crm360_party_links WHERE id=?', linkId);
  if (!existing) return outcomeError(CRM_ERRORS.NOT_FOUND, 'Raccordement introuvable.');
  db.transaction(() => {
    db.run('DELETE FROM crm360_party_links WHERE id=?', linkId);
    recordCrmMutation(db, {
      actor, action: 'DELETE', resourceType: 'party_link', resourceId: linkId,
      before: existing, after: null, context: context as never,
    });
  });
  return { ok: true, value: { deleted: true } };
}
