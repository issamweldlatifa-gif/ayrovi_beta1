/** Owner-approved, one-shot publication of bundled licensed test content. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import manifest from '../../assets/media/reel-test-pack/cover-manifest.json';
type Store = Pick<QatafoDatabase, 'get' | 'run' | 'transaction'>;
export const REEL_TEST_PACK_MIGRATION = 'licensed_reel_test_pack_v1';
export function installReelTestPack(db: Store, beforeWrite: () => void, directory = path.resolve('assets/media/reel-test-pack')): boolean {
  if (db.get('SELECT 1 FROM applied_data_migrations WHERE key=?', REEL_TEST_PACK_MIGRATION)) return false;
  for (const entry of manifest.entries) {
    for (const [file, hash] of [[entry.file, entry.sha256], [entry.poster, entry.posterSha256]]) {
      if (path.basename(file) !== file || createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex') !== hash)
        throw new Error('REEL_TEST_ASSET_INVALID');
    }
  }
  const publisher = db.get<{id: string}>('SELECT id FROM story_publishers ORDER BY official DESC,id LIMIT 1');
  if (!publisher) throw new Error('REEL_TEST_PUBLISHER_REQUIRED');
  const check = () => {
    for (const entry of manifest.entries) {
      const old = db.get<{video_url: string}>('SELECT video_url FROM reels WHERE id=?', entry.id);
      if (old && old.video_url !== entry.videoUrl && old.video_url !== entry.videoUrl.replace('-cover-v2.mp4', '.mp4')) throw new Error('REEL_TEST_ID_CONFLICT');
    }
  };
  check();
  // Called outside the write transaction: SQLite VACUUM INTO cannot run inside one.
  beforeWrite();
  return db.transaction(() => {
    if (db.get('SELECT 1 FROM applied_data_migrations WHERE key=?', REEL_TEST_PACK_MIGRATION)) return false;
    check();
    const now = new Date().toISOString();
    for (const entry of manifest.entries) db.run(`INSERT INTO reels(id,title,channel_id,description,video_url,poster_url,duration_seconds,publish_at,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`, entry.id, entry.title, publisher.id,
      'TEST ONLY / تجريبي. CC0 samples edited for playback testing; not a product advertisement. See /media/reel-test-pack/NOTICE.md',
      entry.videoUrl, entry.posterUrl, entry.durationSeconds, now, 'publie', now, now);
    db.run('INSERT INTO applied_data_migrations(key,applied_at) VALUES (?,?)', REEL_TEST_PACK_MIGRATION, now);
    return true;
  });
}

/** Upgrade only our exact padded v1 URLs. Keep owner edits, status and deletions. */
export function upgradeReelTestPackCover(db: Store, beforeWrite: () => void): boolean {
  const key = 'licensed_reel_test_pack_cover_v2';
  if (db.get('SELECT 1 FROM applied_data_migrations WHERE key=?', key)) return false;
  const changes = manifest.entries.filter(entry => db.get('SELECT 1 FROM reels WHERE id=? AND video_url=?',
    entry.id, entry.videoUrl.replace('-cover-v2.mp4', '.mp4')));
  if (changes.length) {
    // Verify every new video/poster before touching database rows.
    for (const entry of changes) for (const [file, hash] of [[entry.file, entry.sha256], [entry.poster, entry.posterSha256]]) {
      if (createHash('sha256').update(fs.readFileSync(path.resolve('assets/media/reel-test-pack', file))).digest('hex') !== hash)
        throw new Error('REEL_TEST_ASSET_INVALID');
    }
    beforeWrite();
  }
  return db.transaction(() => {
    for (const entry of changes) db.run(`UPDATE reels SET video_url=?,
      poster_url=CASE WHEN poster_url=? THEN ? ELSE poster_url END WHERE id=? AND video_url=?`,
      entry.videoUrl, entry.posterUrl.replace('-cover-v2.jpg', '.jpg'), entry.posterUrl,
      entry.id, entry.videoUrl.replace('-cover-v2.mp4', '.mp4'));
    db.run('INSERT INTO applied_data_migrations(key,applied_at) VALUES (?,?)', key, new Date().toISOString());
    return true;
  });
}
