/** Synthetic schema audit only. No production connection or existing DB is accepted. */
import fs from 'node:fs';
import path from 'node:path';
import { inspectDatabaseSchema } from '../src/db/schemaInspection';
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_PATH: ':memory:', ADMIN_EMAIL: 'schema@localhost',
  ADMIN_PASSWORD: 'LocalSchemaFixtureOnly123!', CUSTOMER_AUTH_SECRET: 'schema-fixture-secret-0123456789abcdef0123456789',
  MAIL_PROVIDER: '', CUSTOMER_OTP_PROVIDER: 'console', FX_RATES_ENABLED: 'false', BACKUP_INTERVAL_HOURS: '0',
  FIREBASE_PROJECT_ID: '', FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '' });
async function main() {
  const { db } = await import('../src/server');
  try {
    const tables = inspectDatabaseSchema(db);
    const violations = db.all<{ table: string; parent: string; fkid: number }>('PRAGMA foreign_key_check');
    const foreignKeyViolations = new Map<string, { table: string; parent: string; foreignKeyId: number; count: number }>();
    for (const row of violations) {
      const key = JSON.stringify([row.table, row.parent, row.fkid]);
      const item = foreignKeyViolations.get(key) ?? { table: row.table, parent: row.parent, foreignKeyId: row.fkid, count: 0 };
      item.count++; foreignKeyViolations.set(key, item);
    }
    const report = {
      scope: 'Fresh synthetic in-memory application database, all server bootstraps; not the deployed database. Metadata only; no business rows exported.',
      caveats: ['An absent child FK index is a review candidate, not proof of a defect or slow query.',
        'No FK declaration does not prove no logical relationships; polymorphic links need domain-specific checks.',
        'A fresh schema inspection does not validate historical upgrades or all stored data.'],
      summary: { tables: tables.length, indexes: tables.reduce((n, t) => n + t.indexes.length, 0), foreignKeys: tables.reduce((n, t) => n + t.foreignKeys.length, 0),
        integrityCheck: db.all('PRAGMA integrity_check'), foreignKeyViolationCount: violations.length },
      foreignKeyViolations: [...foreignKeyViolations.values()],
      childIndexReviewCandidates: tables.flatMap(t => t.foreignKeys.filter(fk => !fk.childLookupIndexed).map(fk => ({ table: t.name, ...fk }))),
      tables,
    };
    const file = path.resolve('.cache/database-structure-audit.json');
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report.summary)); console.log(`Schema audit: ${file}`);
    if (violations.length || report.summary.integrityCheck.some((r: any) => r.integrity_check !== 'ok')) process.exitCode = 1;
  } finally { db.close(); }
}
main().then(() => process.exit(process.exitCode ?? 0), error => { console.error(error); process.exit(1); });
