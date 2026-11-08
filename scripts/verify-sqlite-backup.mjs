/** Isolated restore drill; never overwrites a database or runs application migrations. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const Database = createRequire(import.meta.url)('better-sqlite3');
const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run backup:verify -- /path/to/backup.sqlite');
  process.exit(1);
}
let root, source, restored;
try {
  source = new Database(path.resolve(input), { readonly: true, fileMustExist: true });
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-restore-drill-'));
  fs.chmodSync(root, 0o700);
  const destination = path.join(root, 'restored.sqlite');
  // SQLite backup API includes committed WAL data; never copy an open main file alone.
  await source.backup(destination);
  source.close(); source = undefined;
  restored = new Database(destination, { readonly: true, fileMustExist: true });
  const integrity = restored.pragma('integrity_check');
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('RESTORE_INTEGRITY_FAILED');
  if (restored.pragma('foreign_key_check').length) throw new Error('RESTORE_FOREIGN_KEYS_FAILED');
  const tables = restored.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  let rows = 0;
  for (const { name } of tables) {
    const quoted = '"' + name.replaceAll('"', '""') + '"';
    rows += Number(restored.prepare(`SELECT COUNT(*) n FROM ${quoted}`).get().n);
  }
  console.log(JSON.stringify({ success: true, integrity: 'ok', foreignKeyViolations: 0, tables: tables.length, rows, applicationBootTested: false, uploadsVerified: false }));
} catch {
  // Do not print database contents, SQL or external configuration in diagnostics.
  console.error('BACKUP_RESTORE_VERIFICATION_FAILED');
  process.exitCode = 1;
} finally {
  restored?.close(); source?.close();
  if (root) fs.rmSync(root, { recursive: true, force: true });
}
