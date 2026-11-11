/**
 * Menu de tri des commentaires de Reel (référence vidéo 10/11/2026, 25 s) :
 * « Commentaires populaires » (défaut, en tête du menu) / « Commentaires récents ».
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMENT_SORTS, sortComments } from '@/features/social/commentSort';

const row = (id: string, createdAt: string, likesCount = 0, parentId: string | null = null) => ({ id, createdAt, likesCount, parentId });

describe('sortComments', () => {
  const rows = [
    row('a', '2026-11-01T10:00:00Z', 2),
    row('b', '2026-11-09T10:00:00Z', 0),
    row('c', '2026-10-01T10:00:00Z', 5),
    row('d', '2026-11-05T10:00:00Z', 2),
    row('r1', '2026-11-10T10:00:00Z', 0, 'a'),
  ];

  it('récents : du plus récent au plus ancien', () => {
    expect(sortComments(rows, 'recent').map((r) => r.id)).toEqual(['r1', 'b', 'd', 'a', 'c']);
  });

  it('populaires : j’aime, puis réponses, puis récence', () => {
    // c (5) ; a et d à 2 → a a une réponse, passe devant ; puis b et r1 (0) par récence.
    expect(sortComments(rows, 'popular').map((r) => r.id)).toEqual(['c', 'a', 'd', 'r1', 'b']);
  });

  it('sans aucun j’aime, populaires = récents', () => {
    const flat = rows.map((r) => ({ ...r, likesCount: 0, parentId: null }));
    expect(sortComments(flat, 'popular').map((r) => r.id)).toEqual(sortComments(flat, 'recent').map((r) => r.id));
  });

  it('ne modifie pas le tableau reçu', () => {
    const before = rows.map((r) => r.id);
    sortComments(rows, 'popular');
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it('ordre du menu = référence (populaires d’abord)', () => {
    expect(COMMENT_SORTS).toEqual(['popular', 'recent']);
  });
});

describe('branchement dans la feuille', () => {
  const sheet = readFileSync(path.resolve(__dirname, '../src/features/social/ReelCommentsModal.tsx'), 'utf8');
  it('défaut « populaires », bouton qui OUVRE le menu (plus de bascule récents/anciens)', () => {
    expect(sheet).toContain("useState<CommentSort>('popular')");
    expect(sheet).toContain('onPress={openSortMenu}');
    expect(sheet).not.toContain("'oldest'");
    expect(sheet).toContain('<CommentSortMenu');
  });
});
