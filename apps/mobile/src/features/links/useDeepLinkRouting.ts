/**
 * Branchement des liens profonds sur le routeur.
 *
 * Pourquoi un crochet séparé : la traduction (le raisonnement) est une fonction
 * pure testable sans appareil ; ce fichier ne fait que brancher le système
 * d'exploitation. Le garder mince est ce qui permet de tester l'essentiel.
 *
 * Deux moments, et ils ne se confondent pas :
 *   • **ouverture froide** — l'application a été lancée PAR le lien
 *     (`getInitialURL`) ;
 *   • **ouverture chaude** — elle tournait déjà (`addEventListener('url')`).
 *
 * Dans les deux cas on attend que la navigation soit prête : pousser une route
 * avant que le navigateur existe est sans effet, et le lien serait perdu sans
 * que rien ne l'indique.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { resolveDeepLink } from './resolve';

export function useDeepLinkRouting(enabled: boolean): void {
  // Un lien reçu trop tôt n'est pas jeté : il est rejoué dès que c'est prêt.
  const pending = useRef<string | null>(null);

  const open = useCallback((raw: string | null) => {
    if (!raw) return;
    const route = resolveDeepLink(raw);
    // Rien à ouvrir n'est pas une erreur : resolveDeepLink écarte déjà les
    // hôtes étrangers et les chemins inconnus. On n'affiche donc rien.
    if (!route) return;
    router.push(route as never);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (pending.current) {
      const held = pending.current;
      pending.current = null;
      open(held);
    }
    void Linking.getInitialURL().then((url) => open(url)).catch(() => null);
    const subscription = Linking.addEventListener('url', (event) => {
      if (enabled) open(event.url);
      else pending.current = event.url;
    });
    return () => subscription.remove();
  }, [enabled, open]);
}
