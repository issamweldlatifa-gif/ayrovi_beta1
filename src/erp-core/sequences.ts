/**
 * AYROVI ERP Core — Numbering sequences (P1).
 *
 * Replaces, for every NEW ERP object, the two patterns found in the audit:
 *   • `randomInt(100000,1000000)`  (orders, payments, transactions)
 *   • `COUNT(*) + 1`               (invoices)
 * Both produce holes, collisions and unreadable numbers — an ERP needs short,
 * human-quotable, gap-free identifiers ("EMP-001", "CMD-2026-000412").
 *
 * Existing generators are NOT modified in this phase (Rule Zero): `ayrovi.test.ts`
 * and the checkout flow keep their current behaviour. This module is the single
 * numbering authority for ERP-native objects (employees first).
 */
import type { QatafoDatabase } from '../db/database';

export const ERP_SEQUENCES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS erp_sequences (
  sequence_key TEXT PRIMARY KEY,
  prefix TEXT NOT NULL,
  year_scoped INTEGER NOT NULL DEFAULT 0 CHECK(year_scoped IN (0,1)),
  next_value INTEGER NOT NULL DEFAULT 1 CHECK(next_value >= 1),
  padding INTEGER NOT NULL DEFAULT 6 CHECK(padding BETWEEN 1 AND 12),
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

export type ErpSequenceKey = 'employee_code' | 'organization_code' | 'branch_code' | 'department_code' | 'team_code';

const SEQUENCE_DEFS: Record<ErpSequenceKey, { prefix: string; padding: number; yearScoped: boolean; description: string }> = {
  employee_code: { prefix: 'EMP', padding: 6, yearScoped: false, description: 'Identité employé affichée dans l’audit, les validations et les documents' },
  organization_code: { prefix: 'ORG', padding: 4, yearScoped: false, description: 'Organisation juridique / holding' },
  branch_code: { prefix: 'BRC', padding: 4, yearScoped: false, description: 'Succursale / point de service' },
  department_code: { prefix: 'DEP', padding: 4, yearScoped: false, description: 'Département' },
  team_code: { prefix: 'TMB', padding: 4, yearScoped: false, description: 'Équipe' },
};

export function ensureSequencesSchema(db: QatafoDatabase): void {
  db.runSchema(ERP_SEQUENCES_TABLE_SQL);
  const now = new Date().toISOString();
  for (const [key, def] of Object.entries(SEQUENCE_DEFS)) {
    db.run(`INSERT OR IGNORE INTO erp_sequences (sequence_key,prefix,year_scoped,next_value,padding,description,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`, key, def.prefix, def.yearScoped ? 1 : 0, 1, def.padding, def.description, now, now);
  }
}

/**
 * Reserves and returns the next formatted number for a sequence.
 * Single UPDATE … RETURNING-free implementation (better-sqlite3 API used elsewhere
 * is db.run/db.get): the increment happens inside the caller's transaction when one
 * is open, which is what makes it safe for document issuance.
 */
export function nextSequenceNumber(db: QatafoDatabase, key: ErpSequenceKey | string): string {
  const row = db.get<{ prefix: string; padding: number; year_scoped: number; next_value: number }>(
    'SELECT prefix,padding,year_scoped,next_value FROM erp_sequences WHERE sequence_key=?', String(key),
  );
  if (!row) throw new Error(`SEQUENCE_UNAVAILABLE:${key}`);
  const now = new Date().toISOString();
  const value = Number(row.next_value) || 1;
  db.run('UPDATE erp_sequences SET next_value=?,updated_at=? WHERE sequence_key=?', value + 1, now, String(key));
  const year = row.year_scoped ? `-${new Date().getFullYear()}` : '';
  return `${row.prefix}${year}-${String(value).padStart(Number(row.padding) || 6, '0')}`;
}

export function listSequences(db: QatafoDatabase) {
  return db.all<{ sequence_key: string; prefix: string; next_value: number; year_scoped: number; padding: number; description: string }>(
    'SELECT sequence_key,prefix,next_value,year_scoped,padding,description FROM erp_sequences ORDER BY sequence_key',
  );
}
