/** Bounded social read contracts. Keep legacy selection/order semantics until versioned separately. */
import type { QatafoDatabase } from '../db/database';
import { publishedSocialTarget } from './socialInteractions';
type ReadStore = Pick<QatafoDatabase, 'get' | 'all'>;
/** `loves` / `dislikes` : Z-Reactions (11/11). `likes` reste le seul « J'aime » (compat). */
export interface SocialCounts { likes: number; loves: number; dislikes: number; comments: number; views: number; shares: number }
/** Type matérialisé → champ du contrat public (inchangé). */
const SOCIAL_TOTAL_KEYS = { like: 'likes', comment: 'comments', view: 'views', share: 'shares', love: 'loves', dislike: 'dislikes' } as const;
export function readSocialCounts(db: Pick<ReadStore, 'all'>, input: unknown): Record<string, SocialCounts> {
  const ids = [...new Set(String(input || '').split(',')
    .map((value) => value.trim()).filter((value) => /^[A-Za-z0-9_-]{1,120}$/.test(value)).slice(0, 60))];
  // User-controlled IDs must never invoke Object.prototype setters.
  const out: Record<string, SocialCounts> = Object.create(null);
  for (const id of ids) out[id] = { likes: 0, loves: 0, dislikes: 0, comments: 0, views: 0, shares: 0 };
  if (ids.length) {
    // Compteurs matérialisés (src/db/socialTotals.ts) : une recherche par clé, O(1) —
    // le recomptage COUNT(*) coûtait ~13 ms/requête à 1 M d'interactions.
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.all<any>(`SELECT target_id,type,n FROM social_interaction_totals
      WHERE target_id IN (${placeholders})`, ...ids);
    for (const row of rows) {
      const counts = out[row.target_id];
      if (!counts) continue;
      const key = SOCIAL_TOTAL_KEYS[row.type as keyof typeof SOCIAL_TOTAL_KEYS];
      if (key) counts[key] = Number(row.n);
    }
  }
  return out;
}

export function readSocialComments(db: ReadStore, targetId: string, now: string, viewerAccountId: string | null = null) {
  if (!publishedSocialTarget(db, targetId, now)) return { status: 'not_found' as const };
  const rows = db.all<any>(`SELECT i.id,i.text,i.created_at,c.display_name author,(SELECT parent_id FROM social_comment_replies r WHERE r.comment_id=i.id) parent_id,
      (SELECT COUNT(*) FROM social_comment_reactions x WHERE x.comment_id=i.id AND x.reaction='like') likes_count,
      (SELECT x.reaction FROM social_comment_reactions x WHERE x.comment_id=i.id AND x.account_id=? AND x.reaction='like') my_like
    FROM story_interactions i LEFT JOIN customer_accounts c ON c.id=i.account_id
    WHERE i.target_id=? AND i.type='comment' ORDER BY i.created_at DESC LIMIT 100`, viewerAccountId || '', targetId).reverse();
  return { status: 'ok' as const, data: rows.map((row) => ({
    id: row.id,
    author: row.author || 'Membre ZAYROVI',
    text: row.text,
    createdAt: row.created_at,
    parentId: row.parent_id || null,
    likesCount: Number(row.likes_count || 0),
    myReaction: row.my_like ? 'like' as const : null,
  })) };
}
