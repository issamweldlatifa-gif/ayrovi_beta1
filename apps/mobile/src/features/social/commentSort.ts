/**
 * Tri des commentaires d'un Reel — menu « Commentaires populaires /
 * Commentaires récents » de la référence vidéo du 10/11/2026 (24.5–25.5 s).
 *
 * Fonction PURE : la feuille ne fait que l'appeler, les tests la vérifient
 * sans React Native.
 */
export type CommentSort = 'popular' | 'recent';

export const COMMENT_SORTS: readonly CommentSort[] = ['popular', 'recent'] as const;

export interface SortableComment {
  id: string;
  createdAt: string;
  parentId?: string | null;
  likesCount?: number;
}

const byRecent = (a: SortableComment, b: SortableComment) => b.createdAt.localeCompare(a.createdAt);

/**
 * « Populaires » : le plus de « j'aime » d'abord, puis le plus de réponses
 * (une discussion vivante), puis le plus récent — à égalité parfaite (aucun
 * « j'aime » nulle part), l'ordre est donc exactement celui de « Récents ».
 * « Récents » : du plus récent au plus ancien.
 * Ne modifie jamais le tableau reçu.
 */
export function sortComments<T extends SortableComment>(rows: readonly T[], sort: CommentSort): T[] {
  const copy = rows.slice();
  if (sort === 'recent') return copy.sort(byRecent);
  const replies = new Map<string, number>();
  for (const row of rows) {
    if (row.parentId) replies.set(row.parentId, (replies.get(row.parentId) ?? 0) + 1);
  }
  return copy.sort((a, b) =>
    (b.likesCount ?? 0) - (a.likesCount ?? 0)
    || (replies.get(b.id) ?? 0) - (replies.get(a.id) ?? 0)
    || byRecent(a, b));
}
