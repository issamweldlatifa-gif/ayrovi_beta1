import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import { ArrivalIngestionError } from './errors';
import { listStoreProfiles } from './storeProfiles';
import type { ArrivalSourceType } from './types';

const SOURCE_TYPES = new Set<ArrivalSourceType>(['PDF', 'EMAIL', 'IMAGE', 'INVOICE']);

function cleanName(value: unknown): string {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function cleanCode(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '_').slice(0, 32);
}

function sourceTypesOf(value: unknown): ArrivalSourceType[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').toUpperCase())
    .filter((item): item is ArrivalSourceType => SOURCE_TYPES.has(item as ArrivalSourceType)))];
}

function defaultHints(code: string, sourceType: ArrivalSourceType): string[] {
  return [
    `Identify every distinct ${code} product row visible in this ${sourceType.toLowerCase()} source.`,
    'Use only explicit source evidence; preserve unreadable or uncertain values for review.',
  ];
}

export class ArrivalStoreService {
  constructor(private readonly db: QatafoDatabase) {}

  list() {
    return listStoreProfiles(this.db);
  }

  create(input: Record<string, unknown>, actor: AdminAuditActor) {
    const code = cleanCode(input.code);
    const name = cleanName(input.name);
    const sourceTypes = sourceTypesOf(input.sourceTypes);
    if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) {
      throw new ArrivalIngestionError('STORE_CODE_INVALID', 'Le code Store doit contenir 2 à 32 lettres, chiffres, tirets ou underscores.');
    }
    if (name.length < 2) throw new ArrivalIngestionError('STORE_NAME_REQUIRED', 'Le nom du Store est requis.');
    if (!sourceTypes.length) throw new ArrivalIngestionError('STORE_SOURCE_TYPES_REQUIRED', 'Activez au moins un type de source.');
    if (this.db.get('SELECT id FROM crm_stores WHERE code=?', code)) {
      throw new ArrivalIngestionError('STORE_CODE_DUPLICATE', 'Ce code Store existe déjà.', 409);
    }

    const id = `crm_store_${randomUUID()}`;
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(`INSERT INTO crm_stores (id,code,name,active,created_at,updated_at)
        VALUES (?,?,?,1,?,?)`, id, code, name, now, now);
      for (const sourceType of sourceTypes) {
        this.db.run(`INSERT INTO crm_store_source_profiles
          (id,store_id,source_type,strategy_key,extraction_hints,enabled,created_at,updated_at)
          VALUES (?,?,?,?,?,1,?,?)`, `crm_profile_${randomUUID()}`, id, sourceType,
        `${code.toLowerCase()}-${sourceType.toLowerCase()}-v1`, JSON.stringify(defaultHints(code, sourceType)), now, now);
      }
      recordAdminAudit(this.db, actor, 'ARRIVAL_STORE_CREATED', 'CRM_ARRIVALS', id, null, {
        code, name, sourceTypes,
      });
    });
    return this.list().find((store) => store.id === id);
  }

  update(id: string, input: Record<string, unknown>, actor: AdminAuditActor) {
    const existing = this.db.get<any>('SELECT * FROM crm_stores WHERE id=?', id);
    if (!existing) throw new ArrivalIngestionError('STORE_NOT_FOUND', 'Store introuvable.', 404);
    const name = input.name === undefined ? String(existing.name) : cleanName(input.name);
    if (name.length < 2) throw new ArrivalIngestionError('STORE_NAME_REQUIRED', 'Le nom du Store est requis.');
    const active = input.active === undefined ? Boolean(existing.active) : input.active === true;
    const currentProfiles = this.db.all<any>(`SELECT * FROM crm_store_source_profiles
      WHERE store_id=? ORDER BY source_type`, id);
    const sourceTypes = input.sourceTypes === undefined
      ? currentProfiles.filter((profile) => profile.enabled).map((profile) => profile.source_type as ArrivalSourceType)
      : sourceTypesOf(input.sourceTypes);
    if (!sourceTypes.length) throw new ArrivalIngestionError('STORE_SOURCE_TYPES_REQUIRED', 'Activez au moins un type de source.');

    if (!active) {
      const assignments = Number(this.db.get<any>(
        'SELECT COUNT(*) count FROM crm_arrival_client_stores WHERE store_id=?', id,
      )?.count || 0);
      if (assignments) throw new ArrivalIngestionError('STORE_IN_USE', 'Ce Store est utilisé dans un Arrival et ne peut pas être désactivé.', 409);
    }
    const removed = currentProfiles
      .filter((profile) => profile.enabled && !sourceTypes.includes(profile.source_type))
      .map((profile) => String(profile.source_type));
    for (const sourceType of removed) {
      const usage = Number(this.db.get<any>(`SELECT COUNT(*) count FROM crm_arrival_sources src
        JOIN crm_arrival_client_stores acs ON acs.id=src.arrival_client_store_id
        WHERE acs.store_id=? AND src.source_type=?`, id, sourceType)?.count || 0);
      if (usage) {
        throw new ArrivalIngestionError(
          'STORE_PROFILE_IN_USE',
          `Le profil ${sourceType} est déjà utilisé par une source et ne peut pas être désactivé.`,
          409,
        );
      }
    }

    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run('UPDATE crm_stores SET name=?,active=?,updated_at=? WHERE id=?', name, active ? 1 : 0, now, id);
      for (const profile of currentProfiles) {
        this.db.run('UPDATE crm_store_source_profiles SET enabled=?,updated_at=? WHERE id=?',
          sourceTypes.includes(profile.source_type) ? 1 : 0, now, profile.id);
      }
      for (const sourceType of sourceTypes) {
        if (currentProfiles.some((profile) => profile.source_type === sourceType)) continue;
        this.db.run(`INSERT INTO crm_store_source_profiles
          (id,store_id,source_type,strategy_key,extraction_hints,enabled,created_at,updated_at)
          VALUES (?,?,?,?,?,1,?,?)`, `crm_profile_${randomUUID()}`, id, sourceType,
        `${String(existing.code).toLowerCase()}-${sourceType.toLowerCase()}-v1`,
        JSON.stringify(defaultHints(existing.code, sourceType)), now, now);
      }
      recordAdminAudit(this.db, actor, 'ARRIVAL_STORE_UPDATED', 'CRM_ARRIVALS', id,
        { name: existing.name, active: Boolean(existing.active), sourceTypes: currentProfiles.filter((item) => item.enabled).map((item) => item.source_type) },
        { name, active, sourceTypes });
    });
    return this.list().find((store) => store.id === id);
  }
}
