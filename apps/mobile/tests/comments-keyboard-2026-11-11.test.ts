/**
 * Commentaires & clavier — 2e retour du 11/11/2026 (captures Reels + Facebook).
 *  • Reels : la feuille ne grandit plus à chaque message (hauteur fixe), la
 *    liste rétrécit, le champ reste visible ; son propre commentaire en tête.
 *  • Publication (galerie) : la couche `absoluteFill` suit le clavier ; pendant
 *    la frappe, les commentaires prennent toute la place (comme Facebook).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');
const sheet = read('src/design/sheet/AppSheet.tsx');
const reel = read('src/features/social/ReelCommentsModal.tsx');
const viewer = read('src/features/publications/PublicationViewer.tsx');
const commentsSheet = read('src/features/publications/PublicationCommentsSheet.tsx');

describe('commentaires : le champ de saisie reste toujours visible', () => {
  it('AppSheet : liste rétrécissable + hauteur fixe optionnelle bornée par le clavier', () => {
    expect(sheet).toContain('scrollWrapBottom: { flexGrow: 0, flexShrink: 1, minHeight: 0 }');
    expect(sheet).toContain('bottomScroll: { flexGrow: 0, flexShrink: 1 }');
    expect(sheet).toContain('Math.min(availableHeight, Math.round(windowHeight * heightRatio))');
  });

  it('Reels : hauteur fixe, son commentaire en tête, « Répondre » ouvre le clavier', () => {
    expect(reel).toContain('export const REEL_COMMENTS_HEIGHT = 0.7;');
    expect(reel).toContain('heightRatio={REEL_COMMENTS_HEIGHT}');
    expect(reel).toContain('setMine((prev) => [id, ...prev.filter((row) => row !== id)]);');
    expect(reel).toContain('list.current?.scrollTo({ y: 0, animated: true })');
    expect(reel).toContain('input.current?.focus();');
  });

  it('Publication : la galerie (absoluteFill) suit le clavier, les commentaires prennent la place', () => {
    expect(viewer).not.toContain('KeyboardAvoider');
    expect(viewer).toContain('bottom: keyboard.overlap,');
    expect(viewer).toContain('flex: typingInGallery ? 1 : 0.55,');
    expect(viewer).toContain('typingInGallery ? styles.collapsed : styles.viewerActions');
    expect(commentsSheet).toContain("height: typing ? '100%' : expanded ? '94%' : '72%',");
  });
});
