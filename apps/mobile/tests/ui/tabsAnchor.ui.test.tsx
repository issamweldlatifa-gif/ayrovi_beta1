/**
 * Régression (25/10/2026) — l'ACCUEIL doit rester l'écran d'ouverture.
 *
 * À la montée SDK 58, la prop `initialRouteName="index"` avait été retirée de
 * `<Tabs>` (elle n'existe plus sur le composant) SANS la remplacer. Expo Router
 * 58 choisit l'ancre du groupe via `unstable_settings.anchor` ; sans cette
 * export, l'ancre est indéfinie et l'application ouvrait sur le premier onglet
 * déclaré (AYWEBs) — l'accueil (Hero, sections, Reels, Lens) disparaissait de
 * l'ouverture. Ce verrou empêche de réintroduire la régression :
 *   1. le layout exporte `unstable_settings.anchor === 'index'` ;
 *   2. la route cible `(tabs)/index` existe bien (sinon le routeur lève au boot) ;
 *   3. l'ancre ne pointe jamais vers une autre section.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('expo-router', () => {
  const React = require('react');
  const Tabs = ({ children }: { children?: React.ReactNode }) => React.createElement('Tabs', null, children);
  Tabs.Screen = () => null;
  return {
    Tabs,
    usePathname: () => '/',
  };
});

import { unstable_settings } from '../../app/(tabs)/_layout';

describe('ancre du groupe d’onglets — écran d’accueil à l’ouverture', () => {
  it('exporte une ancre unique pointant vers la route index', () => {
    expect(unstable_settings).toBeDefined();
    expect(unstable_settings.anchor).toBe('index');
  });

  it('la route d’accueil ciblée par l’ancre existe sur le disque', () => {
    const indexPath = join(__dirname, '..', '..', 'app', '(tabs)', 'index.tsx');
    expect(existsSync(indexPath)).toBe(true);
  });

  it('l’ancre ne pointe jamais vers un onglet ou une autre section', () => {
    // Un renversement vers aywebs/account/cart serait la régression constatée.
    expect(['aywebs', 'account', 'cart']).not.toContain(unstable_settings.anchor);
  });
});
