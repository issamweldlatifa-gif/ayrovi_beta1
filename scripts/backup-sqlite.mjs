import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const projectRoot = process.cwd();
const databasePath = path.resolve(projectRoot, process.env.DATABASE_PATH || 'data/qatafo.sqlite');
const backupDirectory = path.resolve(projectRoot, process.env.BACKUP_DIR || 'data/backups');
const retentionDays = Math.max(1, Math.min(365, Number(process.env.BACKUP_RETENTION_DAYS || 14)));

if (!fs.existsSync(databasePath)) {
  console.error(`[backup] قاعدة البيانات غير موجودة: ${databasePath}`);
  process.exit(1);
}
fs.mkdirSync(backupDirectory, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.join(backupDirectory, `ayrovi-${timestamp}.sqlite`);
const source = new Database(databasePath, { readonly: true, fileMustExist: true });

try {
  await source.backup(destination);
} finally {
  source.close();
}

const copy = new Database(destination, { readonly: true, fileMustExist: true });
let integrity = '';
try {
  integrity = String(copy.pragma('quick_check', { simple: true }) || '');
} finally {
  copy.close();
}
if (integrity.toLowerCase() !== 'ok') {
  fs.rmSync(destination, { force: true });
  console.error(`[backup] فشل فحص النسخة: ${integrity || 'unknown'}`);
  process.exit(1);
}

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
let removed = 0;
for (const entry of fs.readdirSync(backupDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || !/^ayrovi-.*\.sqlite$/.test(entry.name)) continue;
  const filePath = path.join(backupDirectory, entry.name);
  if (filePath === destination) continue;
  if (fs.statSync(filePath).mtimeMs < cutoff) {
    fs.rmSync(filePath, { force: true });
    removed += 1;
  }
}

console.log(JSON.stringify({
  success: true,
  database: databasePath,
  backup: destination,
  bytes: fs.statSync(destination).size,
  integrity,
  retentionDays,
  removed,
}, null, 2));
