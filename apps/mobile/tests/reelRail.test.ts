/**
 * Rail d'actions du Reel plein écran — contrat de présence (24/10/2026).
 *
 * Le bug signalé sur l'appareil : un Reel **sans article** n'affichait aucun
 * bouton ni icône — ni cœur, ni commentaire, ni partage, ni son. La cause était
 * une seule condition : `overlay && rail && products.length > 0`. La pastille
 * (« Voir les articles ») doit rester conditionnée aux articles ; le rail, non.
 *
 * Ces tests lisent la source des deux composants (même méthode que
 * `design-system.test.ts`) : un rendu React Native complet n'est pas nécessaire
 * pour garantir qu'on ne réintroduit pas la condition.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('rail du Reel — toujours visible en plein écran', () => {
  const tray = src('src/features/reels/ReelShopTray.tsx');

  it('le rail n’est PAS conditionné par la présence d’articles', () => {
    expect(tray).not.toMatch(/railView\s*=\s*overlay\s*&&\s*rail\s*&&\s*products\.length/);
    expect(tray).toMatch(/const railView = overlay && rail \?/);
  });

  it('la pastille, elle, reste conditionnée : pas de porte qui n’ouvre rien', () => {
    expect(tray).toMatch(/const pill = products\.length > 0 \?/);
  });

  it('les quatre actions sont posées sur la vidéo : commentaire, son, partage, cœur', () => {
    for (const key of ['comment', 'sound', 'share', 'like']) {
      expect(tray).toContain(`key: '${key}'`);
      expect(tray).toContain('reel-rail-${action.key}-${reel.id}');
    }
  });

  it('le cœur suit l’état et ne ment pas pour un invité', () => {
    expect(tray).toMatch(/rail\.liked \? 'heart' : 'heart-outline'/);
    expect(tray).toMatch(/dim: !rail\.canLike/);
    expect(tray).toMatch(/disabled=\{action\.dim\}/);
  });

  it('l’écran plein écran branche le cœur sur le vrai état de session', () => {
    const card = src('src/features/social/ReelCard.tsx');
    expect(card).toMatch(/canLike: signedIn/);
    expect(card).toMatch(/onLike: toggleLike/);
    expect(card).toMatch(/liked,/);
  });

  it('la légende réserve la colonne du rail (pas de texte sous les icônes)', () => {
    const card = src('src/features/social/ReelCard.tsx');
    expect(card).toMatch(/paddingEnd: 64/);
  });
});
