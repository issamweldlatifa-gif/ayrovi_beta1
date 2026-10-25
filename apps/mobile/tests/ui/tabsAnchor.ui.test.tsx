/**
 * Régression (25/10/2026) — l'ACCUEIL doit rester l'écran d'ouverture ET rester
 * ouvrable, alors que la barre ne montre que AYWEBs et Profil.
 *
 * Deux ruptures successives ont été constatées à la montée SDK 58 :
 *  1. La prop `initialRouteName="index"` a été retirée de `<Tabs>` (erreur de
 *     type) sans remplacement : l'ancre du groupe devenait indéfinie et
 *     l'application ouvrait sur le premier onglet déclaré (AYWEBs). Le
 *     remplacement officiel est `unstable_settings.anchor`.
 *  2. `href: null` pose désormais `hidden: true`, et
 *     `useVisibleTabsWithRedirect` remplace toute route masquée qui reçoit le
 *     focus par la première route visible : l'accueil (et le panier) étaient
 *     redevenus inaccessibles. Le contrat « route ouvrable sans bouton » passe
 *     donc par `NO_TAB_BUTTON` (bouton nul, encombrement nul, pas de `hidden`).
 */
import { existsSync, readFileSync } from 'node:fs';
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

import { NO_TAB_BUTTON, unstable_settings } from '../../app/(tabs)/_layout';

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
    expect(['aywebs', 'account', 'cart']).not.toContain(unstable_settings.anchor);
  });
});

describe('routes ouvrables sans bouton (accueil, panier)', () => {
  it('le bouton ne rend rien et l’élément n’occupe aucune place', () => {
    expect(NO_TAB_BUTTON.tabBarButton()).toBeNull();
    expect(NO_TAB_BUTTON.tabBarItemStyle).toEqual({ display: 'none' });
  });

  it('n’utilise plus `href: null` : il déclencherait la redirection SDK 58', () => {
    // Garde-fou source : toute réintroduction d'une prop `href: null` rendrait
    // la route cachée (hidden) et redirigée au focus. On cible la prop JSX
    // réelle, jamais les mentions dans les commentaires.
    const source = readFileSync(join(__dirname, '..', '..', 'app', '(tabs)', '_layout.tsx'), 'utf8');
    expect(source).not.toMatch(/options=\{\{[^}]*href:\s*null/);
    expect(source).not.toMatch(/href=\{null\}/);
  });

  it('les deux écrans sans bouton référencent bien NO_TAB_BUTTON', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'app', '(tabs)', '_layout.tsx'), 'utf8');
    expect(source).toContain('<Tabs.Screen name="index" options={{ ...NO_TAB_BUTTON');
    expect(source).toContain('<Tabs.Screen name="cart" options={{ ...NO_TAB_BUTTON');
  });
});
