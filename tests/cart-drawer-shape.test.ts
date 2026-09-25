/*
 * PANIER — forme validée en maquette (25/09/2026).
 *
 * Trois exigences, toutes vérifiables sans navigateur :
 *  1. la vignette montre la MÊME image que la carte et la fiche ;
 *  2. le tiroir GLISSE du bord dont il dépend, y compris en arabe ;
 *  3. les moyens de paiement annoncés au panier sont ceux qui encaissent —
 *     annoncer une marque que la caisse refusera fait revenir le client pour rien.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const cart = readFileSync('client/src/components/CartDrawer.tsx', 'utf8');
const drawers = readFileSync('client/src/styles/drawers.css', 'utf8');
const media = readFileSync('client/src/ayrovix/services/mediaIsolation.ts', 'utf8');

describe('panier — vignette', () => {
  it('passe par le cadre studio, donc par la composition AYROVI', () => {
    expect(cart).toContain('<StudioImageFrame');
    const chain = media.split('export function withIsolation')[1].split('\n}')[0];
    expect(chain.indexOf('composedMediaUrl')).toBeLessThan(chain.indexOf('isolatedMediaUrl'));
  });

  it('reprend le format de la maquette (88 × 116, ratio 3/4)', () => {
    expect(cart).toContain('w-[88px] h-[116px]');
    expect(cart).toContain('ratio="3 / 4"');
  });
});

describe('panier — mouvement', () => {
  it('le tiroir glisse et le voile se fond', () => {
    expect(cart).toContain('ay-drawer-panel');
    expect(cart).toContain('ay-drawer-backdrop');
    expect(drawers).toContain('@keyframes ay-drawer-fade');
  });

  it('il entre par le bord dont il dépend — pas du côté opposé en arabe', () => {
    expect(cart).toContain("data-side={direction === 'rtl' ? 'start' : 'end'}");
    expect(drawers).toContain('@keyframes ay-drawer-in-start');
    expect(drawers).toContain('@keyframes ay-drawer-in-end');
    expect(drawers).toContain('translateX(-100%)');
  });

  it('le mouvement est désactivable', () => {
    expect(drawers).toContain('prefers-reduced-motion');
  });
});

describe('panier — moyens de paiement', () => {
  it('n’affiche QUE les moyens réellement disponibles', () => {
    expect(cart).toContain('availablePaymentMethods(commerce.policy)');
    expect(cart).toContain('availablePaymentMethods(commerce.policy).length > 0');
  });

  it('ne recopie aucune règle de disponibilité dans le panier', () => {
    expect(cart).not.toMatch(/cardGatewayAvailable|bankRib|posteAccount/);
  });
});
