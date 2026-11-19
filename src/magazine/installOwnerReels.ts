/** Versioned owner-approved collection replacements. Legacy media also backs Publication blocks. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import legacy from '../../assets/media/reels-owned/manifest.json';
import current from '../../assets/media/reels-owned-v2/manifest.json';
import { REEL_DRIVE_TITLES } from '../../shared/reelDriveTitles';
type Store = Pick<QatafoDatabase, 'get' | 'all' | 'run' | 'transaction'>;
export const OWNER_REELS_MIGRATION = 'owner_drive_reels_v1';
export const OWNER_REELS_V2_MIGRATION = 'owner_drive_reels_v2';

type Entry = Pick<(typeof legacy.entries)[number], 'id' | 'title' | 'file' | 'poster' | 'sha256' | 'posterSha256' | 'videoUrl' | 'posterUrl' | 'durationSeconds' | 'bytes'>;

export function installOwnerReels(db: Store, beforeWrite: () => void, directory = path.resolve('assets/media/reels-owned')): boolean {
  return replaceCollection(db, beforeWrite, legacy.entries, 5, OWNER_REELS_MIGRATION, '/media/reels-owned', directory);
}

export function installOwnerReelsV2(db: Store, beforeWrite: () => void, directory = path.resolve('assets/media/reels-owned-v2')): boolean {
  const entries = current.entries.map(entry => ({ ...entry, title: REEL_DRIVE_TITLES[entry.id]?.ar ?? '' }));
  return replaceCollection(db, beforeWrite, entries, 15, OWNER_REELS_V2_MIGRATION, '/media/reels-owned-v2', directory);
}

function replaceCollection(db: Store, beforeWrite: () => void, entries: Entry[], expected: number, key: string, prefix: string, directory: string): boolean {
  if (db.get('SELECT 1 FROM applied_data_migrations WHERE key=?', key)) return false;
  if (entries.length !== expected || new Set(entries.map(entry => entry.id)).size !== expected || new Set(entries.map(entry => entry.sha256)).size !== expected)
    throw new Error('OWNER_REEL_MANIFEST_INVALID');
  for (const entry of entries) {
    if (!entry.title || !Number.isInteger(entry.durationSeconds) || entry.durationSeconds < 1 ||
        entry.videoUrl !== `${prefix}/${entry.file}` || entry.posterUrl !== `${prefix}/${entry.poster}`)
      throw new Error('OWNER_REEL_MANIFEST_INVALID');
    for (const [file, hash] of [[entry.file, entry.sha256], [entry.poster, entry.posterSha256]]) {
      if (!/^[a-z0-9-]+\.(mp4|jpg)$/.test(file)) throw new Error('OWNER_REEL_ASSET_INVALID');
      const bytes = fs.readFileSync(path.join(directory, file));
      if ((file === entry.file && bytes.length !== entry.bytes) || createHash('sha256').update(bytes).digest('hex') !== hash)
        throw new Error('OWNER_REEL_ASSET_INVALID');
    }
  }
  const publisher = db.get<{id: string}>('SELECT id FROM story_publishers ORDER BY official DESC,id LIMIT 1');
  if (!publisher) throw new Error('OWNER_REEL_PUBLISHER_REQUIRED');
  beforeWrite(); // Snapshot must finish and validate before entering the write transaction.
  return db.transaction(() => {
    if (db.get('SELECT 1 FROM applied_data_migrations WHERE key=?', key)) return false;
    const previous = db.all<{id: string}>('SELECT id FROM reels');
    for (const { id } of previous) {
      db.run("DELETE FROM content_products WHERE content_kind='reel' AND content_id=?", id);
      // Interaction IDs are polymorphic: never remove another domain's shared target.
      if (!db.get('SELECT 1 FROM publications WHERE id=?', id) && !db.get('SELECT 1 FROM stories WHERE id=?', id)) {
        db.run('DELETE FROM story_interactions WHERE target_id=?', id);
        db.run('DELETE FROM publication_dislikes WHERE target_id=?', id);
        db.run('DELETE FROM social_loves WHERE target_id=?', id);
      }
    }
    db.run('DELETE FROM reels');
    const now = new Date().toISOString();
    for (const [index, entry] of entries.entries()) {
      const published = new Date(Date.parse(now) - index * 1000).toISOString();
      db.run(`INSERT INTO reels(id,title,channel_id,description,video_url,poster_url,duration_seconds,publish_at,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, entry.id, entry.title, publisher.id, '', entry.videoUrl, entry.posterUrl,
        entry.durationSeconds, published, 'publie', now, now);
    }
    db.run('INSERT INTO applied_data_migrations(key,applied_at) VALUES (?,?)', key, now);
    return true;
  });
}
