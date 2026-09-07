/**
 * AYROVI CRM 360 (E1) — schéma + amorçage du module relationnel.
 *
 * Règles identiques aux autres modules (aucun raccourci) :
 *  • additif uniquement : `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` ;
 *    aucune table existante n'est modifiée (en particulier `customers`,
 *    `customer_accounts`, `suppliers`, `assistant_support_tickets`, `crm_arrival*`
 *    restent telles quelles) ;
 *  • DDL multi-instructions via `db.runSchema()` ;
 *  • idempotent : base fraîche, base existante et re-boot aboutissent à la même forme ;
 *  • numérotation depuis `erp_sequences`, permissions depuis `erp_role_permissions`,
 *    audit depuis `writeAuditEvent` : le module n'installe aucun second système ;
 *  • aucun contenu métier n'est fabriqué à l'amorçage (pas de fausses démos).
 *
 * Tables préfixées `crm360_` pour ne jamais se confondre avec les tables d'ingestion
 * d'arrivages `crm_*` (le registre ERP garde d'ailleurs `crm` = arrivages ; ce module
 * est déclaré sous la clé `crm360`).
 */
import type { QatafoDatabase } from '../db/database';
import { ensureSequencesSchema } from '../erp-core/sequences';
import {
  ACTIVITY_KINDS, ACTIVITY_STATUSES, COMM_CHANNELS, COMM_DIRECTIONS, CONTACT_STATUSES,
  ISSUE_PRIORITIES, ISSUE_STATUSES, PARTY_KINDS, PARTY_LINK_TYPES, PARTY_SOURCES,
  PARTY_STATUSES, PARTY_TYPES, RELATIONSHIP_TYPES, TASK_PRIORITIES, TASK_STATUSES,
} from './types';
import { seedCrmPermissions } from './permissions';

export const CRM_SEQUENCES = [
  { key: 'party_customer_code', prefix: 'CUS', padding: 6, yearScoped: false, description: 'Fiche relationnelle — client (code citable dans le CRM)' },
  { key: 'party_partner_code', prefix: 'PRT', padding: 6, yearScoped: false, description: 'Fiche relationnelle — partenaire' },
  { key: 'party_supplier_code', prefix: 'SUP', padding: 6, yearScoped: false, description: 'Fiche relationnelle — fournisseur' },
  { key: 'party_prospect_code', prefix: 'PRO', padding: 6, yearScoped: false, description: 'Fiche relationnelle — prospect' },
  { key: 'party_other_code', prefix: 'OTH', padding: 6, yearScoped: false, description: 'Fiche relationnelle — autre' },
  { key: 'crm_issue_no', prefix: 'ISU', padding: 6, yearScoped: true, description: 'Référence d’un dossier support/issue du CRM' },
  { key: 'crm_task_no', prefix: 'TSK', padding: 6, yearScoped: true, description: 'Référence d’une tâche CRM (citable dans une notification)' },
] as const;

export const CRM360_TABLES = [
  'crm360_parties', 'crm360_contacts', 'crm360_relationships', 'crm360_activities',
  'crm360_tasks', 'crm360_notes', 'crm360_issues', 'crm360_communications',
  'crm360_party_links', 'crm360_status_events',
] as const;

function quoteList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(',');
}

const PARTY_TYPES_LIST = quoteList(PARTY_TYPES);
const PARTY_KINDS_LIST = quoteList(PARTY_KINDS);
const PARTY_STATUSES_LIST = quoteList(PARTY_STATUSES);
const PARTY_SOURCES_LIST = quoteList(PARTY_SOURCES);
const CONTACT_STATUSES_LIST = quoteList(CONTACT_STATUSES);
const RELATIONSHIP_TYPES_LIST = quoteList(RELATIONSHIP_TYPES);
const PARTY_LINK_TYPES_LIST = quoteList(PARTY_LINK_TYPES);
const ACTIVITY_KINDS_LIST = quoteList(ACTIVITY_KINDS);
const ACTIVITY_STATUSES_LIST = quoteList(ACTIVITY_STATUSES);
const TASK_STATUSES_LIST = quoteList(TASK_STATUSES);
const TASK_PRIORITIES_LIST = quoteList(TASK_PRIORITIES);
const ISSUE_STATUSES_LIST = quoteList(ISSUE_STATUSES);
const ISSUE_PRIORITIES_LIST = quoteList(ISSUE_PRIORITIES);
const COMM_CHANNELS_LIST = quoteList(COMM_CHANNELS);
const COMM_DIRECTIONS_LIST = quoteList(COMM_DIRECTIONS);

export const CRM_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS crm360_parties (
  id TEXT PRIMARY KEY,
  party_code TEXT NOT NULL UNIQUE,
  party_type TEXT NOT NULL CHECK (party_type IN (${PARTY_TYPES_LIST})),
  kind TEXT NOT NULL CHECK (kind IN (${PARTY_KINDS_LIST})),
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (${PARTY_STATUSES_LIST})),
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  normalized_phone TEXT NOT NULL DEFAULT '',
  phone_verified INTEGER NOT NULL DEFAULT 0 CHECK (phone_verified IN (0, 1)),
  website TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  governorate TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN (${PARTY_SOURCES_LIST})),
  owner_employee_id TEXT REFERENCES erp_employees(id) ON DELETE SET NULL,
  rating INTEGER CHECK (rating BETWEEN 0 AND 5),
  last_contacted_at TEXT,
  next_follow_up_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm360_parties_status ON crm360_parties(status, kind);
CREATE INDEX IF NOT EXISTS idx_crm360_parties_owner ON crm360_parties(owner_employee_id, status);
CREATE INDEX IF NOT EXISTS idx_crm360_parties_kind ON crm360_parties(kind, status);
CREATE INDEX IF NOT EXISTS idx_crm360_parties_next_follow_up ON crm360_parties(next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm360_parties_updated ON crm360_parties(updated_at DESC);

CREATE TABLE IF NOT EXISTS crm360_contacts (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL REFERENCES crm360_parties(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  normalized_phone TEXT NOT NULL DEFAULT '',
  phone_verified INTEGER NOT NULL DEFAULT 0 CHECK (phone_verified IN (0, 1)),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (${CONTACT_STATUSES_LIST})),
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm360_contacts_party ON crm360_contacts(party_id, status);
-- Deux contacts au même téléphone au sein d'une même fiche = un doublon, refusé à la base.
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm360_contacts_party_phone
  ON crm360_contacts(party_id, normalized_phone) WHERE normalized_phone <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm360_contacts_party_email
  ON crm360_contacts(party_id, email COLLATE NOCASE) WHERE email <> '';

CREATE TABLE IF NOT EXISTS crm360_relationships (
  id TEXT PRIMARY KEY,
  from_party_id TEXT NOT NULL REFERENCES crm360_parties(id) ON DELETE CASCADE,
  to_party_id TEXT NOT NULL REFERENCES crm360_parties(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (${RELATIONSHIP_TYPES_LIST})),
  role_label TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  since_date TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm360_relationships_from ON crm360_relationships(from_party_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_crm360_relationships_to ON crm360_relationships(to_party_id, relationship_type);

CREATE TABLE IF NOT EXISTS crm360_activities (
  id TEXT PRIMARY KEY,
  party_id TEXT REFERENCES crm360_parties(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES crm360_contacts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN (${ACTIVITY_KINDS_LIST})),
  subject TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN (${ACTIVITY_STATUSES_LIST})),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN (${TASK_PRIORITIES_LIST})),
  owner_employee_id TEXT REFERENCES erp_employees(id) ON DELETE SET NULL,
  scheduled_at TEXT,
  due_at TEXT,
  completed_at TEXT,
  completed_by TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm360_activities_party ON crm360_activities(party_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm360_activities_owner ON crm360_activities(owner_employee_id, status);
CREATE INDEX IF NOT EXISTS idx_crm360_activities_due ON crm360_activities(due_at) WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS crm360_tasks (
  id TEXT PRIMARY KEY,
  task_no TEXT NOT NULL UNIQUE,
  party_id TEXT REFERENCES crm360_parties(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES crm360_contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_follow_up INTEGER NOT NULL DEFAULT 0 CHECK (is_follow_up IN (0, 1)),
  owner_employee_id TEXT REFERENCES erp_employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN (${TASK_STATUSES_LIST})),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN (${TASK_PRIORITIES_LIST})),
  due_at TEXT,
  reminder_at TEXT,
  completed_at TEXT,
  completed_by TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm360_tasks_party ON crm360_tasks(party_id, status);
CREATE INDEX IF NOT EXISTS idx_crm360_tasks_owner ON crm360_tasks(owner_employee_id, status, due_at);
-- Prochaines actions visibles : tâches actives par échéance (la requête « due today »/« overdue »
-- est un filtre, jamais un balayage de toute la table).
CREATE INDEX IF NOT EXISTS idx_crm360_tasks_due ON crm360_tasks(due_at) WHERE status IN ('OPEN','IN_PROGRESS','WAITING');
CREATE INDEX IF NOT EXISTS idx_crm360_tasks_follow_up ON crm360_tasks(is_follow_up, status, due_at);

CREATE TABLE IF NOT EXISTS crm360_notes (
  id TEXT PRIMARY KEY,
  party_id TEXT REFERENCES crm360_parties(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES crm360_contacts(id) ON DELETE SET NULL,
  activity_id TEXT REFERENCES crm360_activities(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES crm360_tasks(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm360_notes_party ON crm360_notes(party_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm360_notes_pinned ON crm360_notes(party_id, is_pinned, created_at DESC) WHERE is_pinned = 1;

CREATE TABLE IF NOT EXISTS crm360_issues (
  id TEXT PRIMARY KEY,
  issue_no TEXT NOT NULL UNIQUE,
  party_id TEXT REFERENCES crm360_parties(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES crm360_contacts(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'GENERAL',
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN (${ISSUE_PRIORITIES_LIST})),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN (${ISSUE_STATUSES_LIST})),
  owner_employee_id TEXT REFERENCES erp_employees(id) ON DELETE SET NULL,
  resolution TEXT NOT NULL DEFAULT '',
  opened_at TEXT NOT NULL,
  resolved_at TEXT,
  closed_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm360_issues_party ON crm360_issues(party_id, status);
CREATE INDEX IF NOT EXISTS idx_crm360_issues_owner ON crm360_issues(owner_employee_id, status);
CREATE INDEX IF NOT EXISTS idx_crm360_issues_status ON crm360_issues(status, priority, opened_at DESC);

CREATE TABLE IF NOT EXISTS crm360_communications (
  id TEXT PRIMARY KEY,
  party_id TEXT REFERENCES crm360_parties(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES crm360_contacts(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN (${COMM_DIRECTIONS_LIST})),
  channel TEXT NOT NULL CHECK (channel IN (${COMM_CHANNELS_LIST})),
  subject TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',
  sent_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm360_communications_party ON crm360_communications(party_id, sent_at DESC);

-- Raccordement aux identités existantes, SANS dupliquer leur contenu :
-- (customers, customer_accounts, suppliers, orders, assistant_support_tickets, external).
CREATE TABLE IF NOT EXISTS crm360_party_links (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL REFERENCES crm360_parties(id) ON DELETE CASCADE,
  ref_type TEXT NOT NULL CHECK (ref_type IN (${PARTY_LINK_TYPES_LIST})),
  ref_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (party_id, ref_type, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_crm360_links_ref ON crm360_party_links(ref_type, ref_id);

-- Historique métier compact (créations, changements de statut, complétions, résolutions,
-- archivages…) qui alimente la timeline ET l'audit. audit_logs reste le registre de
-- sécurité (qui/quoi/avant/après), cette table porte l'événement lisible métier.
CREATE TABLE IF NOT EXISTS crm360_status_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  verb TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  note TEXT NOT NULL DEFAULT '',
  actor_employee_id TEXT REFERENCES erp_employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm360_events_party_lookup
  ON crm360_status_events(entity_type, entity_id, created_at DESC);
`;

/** DDL + lignes de numérotation. Appelé par le constructeur DB, les tests et le routeur. */
export function ensureCrmSchema(db: QatafoDatabase): void {
  db.runSchema(CRM_SCHEMA_SQL);
  ensureSequencesSchema(db);
  const now = new Date().toISOString();
  for (const sequence of CRM_SEQUENCES) {
    db.run(`INSERT OR IGNORE INTO erp_sequences (sequence_key,prefix,year_scoped,next_value,padding,description,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`, sequence.key, sequence.prefix, sequence.yearScoped ? 1 : 0, 1, sequence.padding, sequence.description, now, now);
  }
}

export interface CrmBootReport {
  tablesReady: number;
  grantsSeeded: number;
  sequencesReady: number;
}

/** L'amorçage ne fabrique jamais de contenu métier : tables, numérotation, droits. */
export function bootstrapCrm(db: QatafoDatabase): CrmBootReport {
  ensureCrmSchema(db);
  const { seeded } = seedCrmPermissions(db);
  const tablesReady = db.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${CRM360_TABLES.map((name) => `'${name}'`).join(',')})`,
  ).length;
  const sequencesReady = db.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM erp_sequences WHERE sequence_key IN (${CRM_SEQUENCES.map((sequence) => `'${sequence.key}'`).join(',')})`,
  )[0]?.n ?? 0;
  return { tablesReady: Number(tablesReady), grantsSeeded: Number(seeded), sequencesReady: Number(sequencesReady) };
}
