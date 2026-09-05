/**
 * AYROVI ERP Core — boot sequence (P1).
 *
 * Called once from src/server.ts right after the database instance exists, and
 * idempotent so a test can call it again. It only creates tables, mirrors the
 * legacy role map and backfills employee identities — it never touches an
 * existing row of an existing table.
 */
import type { QatafoDatabase } from '../db/database';
import { ensureSequencesSchema } from './sequences';
import { ensureIdentitySchema, backfillEmployeesFromAdminUsers } from './identity';
import { ensureAuditSchema } from './audit';
import { ensureEventsSchemaIfMissing } from './events';
import { ensurePermissionSchema, seedLegacyPermissions } from './permissions';
import { ensureNotificationSchema } from './notifications';

export interface ErpCoreBootReport {
  employeesCreated: number;
  permissionGrantsSeeded: number;
  storage: { publicRoot: string; privateRoot: string; publicDirs: string[]; privateDirs: string[] };
}

let lastReport: ErpCoreBootReport | null = null;

/** DDL only — safe to call from QatafoDatabase's constructor and from tests. */
export function ensureErpCoreSchema(db: QatafoDatabase): void {
  ensureSequencesSchema(db);
  ensureEventsSchemaIfMissing(db);
  ensureIdentitySchema(db);
  ensureAuditSchema(db);
  ensurePermissionSchema(db);
  ensureNotificationSchema(db);
}

export function bootstrapErpCore(db: QatafoDatabase): ErpCoreBootReport {
  ensureErpCoreSchema(db);
  const { created } = backfillEmployeesFromAdminUsers(db);
  const { inserted } = seedLegacyPermissions(db);
  lastReport = {
    employeesCreated: created,
    permissionGrantsSeeded: inserted,
    storage: {
      publicRoot: 'data/uploads (et data/uploads/hero)',
      privateRoot: 'data/private/documents',
      publicDirs: ['hero'],
      privateDirs: ['invoices', 'payment-proofs', 'employee-documents', 'arrival-sources'],
    },
  };
  return lastReport;
}

export function lastErpCoreBootReport(): ErpCoreBootReport | null {
  return lastReport;
}
