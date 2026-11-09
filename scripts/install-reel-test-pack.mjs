/** Explicit, opt-in content installation. No implicit default DB and no overwrites. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
const Database = createRequire(import.meta.url)('better-sqlite3');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'assets/media/reel-test-pack');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
let db;
try {
  const args = process.argv.slice(2);
  if (!(args.length === 2 || args.length === 3) || args[0] !== '--database' || !args[1] || (args[2] && args[2] !== '--apply'))
    throw new Error('Usage: npm run reels:test-pack -- --database /path/to/existing.sqlite [--apply]');
  const database = path.resolve(args[1]), apply = args[2] === '--apply';
  for (const entry of manifest.entries) {
    for (const [file, hash] of [[entry.file, entry.sha256], [entry.poster, entry.posterSha256]]) {
      if (path.basename(file) !== file || createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex') !== hash)
        throw new Error('REEL_TEST_ASSET_INVALID');
    }
  }
  db = new Database(database, { readonly: !apply, fileMustExist: true, timeout: 5000 });
  db.pragma('foreign_keys = ON');
  const publisher = db.prepare('SELECT id FROM story_publishers ORDER BY official DESC,id LIMIT 1').get();
  if (!publisher) throw new Error('REEL_TEST_PUBLISHER_REQUIRED');
  const plan = () => {
    let pending = 0;
    for (const entry of manifest.entries) {
      const old = db.prepare('SELECT video_url FROM reels WHERE id=?').get(entry.id);
      if (old && old.video_url !== entry.videoUrl) throw new Error('REEL_TEST_ID_CONFLICT');
      if (!old) pending++;
    }
    return pending;
  };
  const pending = plan();
  let backup = null, inserted = 0;
  if (apply && pending) {
    const backupDir = path.join(path.dirname(database), 'backups');
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    backup = path.join(backupDir, `pre-reel-test-pack-${randomUUID()}.sqlite`);
    await db.backup(backup);
    fs.chmodSync(backup, 0o600);
    const check = new Database(backup, { readonly: true, fileMustExist: true });
    try {
      const integrity = check.pragma('integrity_check');
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' || check.pragma('foreign_key_check').length)
        throw new Error('REEL_TEST_BACKUP_INVALID');
    } finally { check.close(); }
    db.transaction(() => {
      plan(); // Recheck collisions inside the write transaction.
      const insert = db.prepare(`INSERT INTO reels(id,title,channel_id,description,video_url,poster_url,duration_seconds,publish_at,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`);
      const now = new Date().toISOString();
      for (const entry of manifest.entries) inserted += insert.run(entry.id, entry.title, publisher.id,
        'TEST ONLY / تجريبي. CC0 samples edited for playback testing; not a product advertisement. See /media/reel-test-pack/NOTICE.md',
        entry.videoUrl, entry.posterUrl, entry.durationSeconds, now, 'publie', now, now).changes;
    })();
  }
  console.log(JSON.stringify({ success: true, mode: apply ? 'apply' : 'dry-run', pending, inserted, backup, publishedOnApply: true }));
} catch (error) {
  // Fixed diagnostics only; never dump SQL or DB contents.
  console.error(error instanceof Error && /^(Usage:|REEL_TEST_)/.test(error.message) ? error.message : 'REEL_TEST_PACK_INSTALL_FAILED');
  process.exitCode = 1;
} finally { db?.close(); }
