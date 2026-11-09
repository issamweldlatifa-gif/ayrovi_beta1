/** Owner explicitly approved replacing the existing Reel collection with these five clips. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import manifest from '../../assets/media/reels-owned/manifest.json';
type Store = Pick<QatafoDatabase, 'get' | 'all' | 'run' | 'transaction'>;
export const OWNER_REELS_MIGRATION = 'owner_drive_reels_v1';
export function installOwnerReels(db: Store, beforeWrite: () => void, directory = path.resolve('assets/media/reels-owned')): boolean {
  if (db.get('SELECT 1 FROM applied_data_migrations WHERE key=?', OWNER_REELS_MIGRATION)) return false;
  if (manifest.entries.length !== 5 || new Set(manifest.entries.map(entry => entry.id)).size !== 5)
    throw new Error('OWNER_REEL_MANIFEST_INVALID');
  for (const entry of manifest.entries) {
    for (const [file, hash] of [[entry.file, entry.sha256], [entry.poster, entry.posterSha256]]) {
      if (path.basename(file) !== file || createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex') !== hash)
        throw new Error('OWNER_REEL_ASSET_INVALID');
    }
  }
  const publisher = db.get<{id: string}>('SELECT id FROM story_publishers ORDER BY official DESC,id LIMIT 1');
  if (!publisher) throw new Error('OWNER_REEL_PUBLISHER_REQUIRED');
  beforeWrite(); // Snapshot must finish and validate before entering the write transaction.
  return db.transaction(() => {
    if (db.get('SELECT 1 FROM applied_data_migrations WHERE key=?', OWNER_REELS_MIGRATION)) return false;
    const previous = db.all<{id: string}>('SELECT id FROM reels');
    for (const { id } of previous) {
      db.run("DELETE FROM content_products WHERE content_kind='reel' AND content_id=?", id);
      // Interaction IDs are polymorphic: never remove another domain's shared target.
      if (!db.get('SELECT 1 FROM publications WHERE id=?', id) && !db.get('SELECT 1 FROM stories WHERE id=?', id)) {
        db.run('DELETE FROM story_interactions WHERE target_id=?', id);
        db.run('DELETE FROM publication_dislikes WHERE target_id=?', id);
      }
    }
    db.run('DELETE FROM reels');
    const now = new Date().toISOString();
    for (const [index, entry] of manifest.entries.entries()) {
      const published = new Date(Date.parse(now) - index * 1000).toISOString();
      db.run(`INSERT INTO reels(id,title,channel_id,description,video_url,poster_url,duration_seconds,publish_at,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, entry.id, entry.title, publisher.id, '', entry.videoUrl, entry.posterUrl,
        entry.durationSeconds, published, 'publie', now, now);
    }
    db.run('INSERT INTO applied_data_migrations(key,applied_at) VALUES (?,?)', OWNER_REELS_MIGRATION, now);
    return true;
  });
}
