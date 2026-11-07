import type { QatafoDatabase } from '../db/database';
import dimensions from './publicationMediaDimensions.json';
/** Metadata-only, one-shot upgrade. No reseeding, copy, stock, price or authored fit changes. */
export function upgradePublicationMediaPresentation(db: QatafoDatabase) {
  for (const row of db.all<any>('SELECT id,media_json FROM publications')) {
    let media: any[];
    try {
      media = JSON.parse(row.media_json || '[]');
    } catch {
      continue;
    }
    if (!Array.isArray(media)) continue;
    let changed = false;
    const next = media.map((item) => {
      if (!item || typeof item.url !== 'string') return item;
      const known = dimensions[item.url as keyof typeof dimensions];
      if (!known) return item;
      const patch = Object.fromEntries(
        Object.entries(known).filter(([key]) => item[key] === undefined)
      );
      if (!Object.keys(patch).length) return item;
      changed = true;
      return { ...item, ...patch };
    });
    if (changed)
      db.run(
        'UPDATE publications SET media_json=? WHERE id=?',
        JSON.stringify(next),
        row.id
      );
  }
}
