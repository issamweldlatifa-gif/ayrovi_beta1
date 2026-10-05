import React, { useCallback, useEffect, useState } from 'react';
import './aywebs.css';
import { useLocale } from '../../i18n/LocaleContext';
import { openMerchantPage } from '../../services/nativeShell';
import { getAyWebsCart, setAyWebsCsrfToken, type AyWebsStore } from './api';
import { AyWebsStoresScreen } from './components/AyWebsStoresScreen';
import { AyWebsCartScreen } from './components/AyWebsCartScreen';
import { AyWebsWishScreen } from './components/AyWebsWishScreen';
import { AyWebsVariantSheet } from './components/AyWebsVariantSheet';
import { AyWebsFavoriteSheet } from './components/AyWebsFavoriteSheet';
import { useAyWebsFavorites, type AyWebsFavoriteTarget } from './useAyWebsFavorites';
import type { AyWebsTab } from './components/AyWebsTabBar';

/**
 * AYWEBs V2 — hôte du parcours proxy-shopping (référence Add-to-Buyee).
 *
 * Une seule session AYROVI, un seul panier de paiement : les écrans internes
 * (Boutiques → feuille de variantes → confirmation → panier proxy) reposent
 * sur le backend /api/v1/aywebs existant. L'ouverture d'un magasin passe par
 * openMerchantPage : WebView native à barre flottante dans l'APK, onglet
 * externe sur le web — même contrat, aucune duplication d'UI (§2).
 *
 * ── Correctifs du 04/10/2026 (ملاحظات الواجهة السبع) ───────────────────────
 * §4 — l'en-tête « AyWebs » a été SUPPRIMÉ. Il mangeait ~10 % de la hauteur
 *      utile et dupliquait une sortie déjà présente : « Accueil », dans la
 *      barre basse, EST le retour vers la boutique AYROVI. Chaque écran garde
 *      son propre titre (Boutiques / Wish List / Panier).
 * §2 — tous les onglets restent DANS AyWebs. Seul « Mon compte » ouvre
 *      l'espace client, parce que commandes et adresses y vivent ; c'est une
 *      sortie choisie, pas une fuite d'interface.
 * §3 — la barre AYROVI est démontée pendant AyWebs (App.tsx) : une seule barre
 *      est visible à tout instant.
 */
export interface AyWebsAppProps {
  onClose: () => void;
  onOpenCart: () => void;
  onOpenAccount: () => void;
  onOpenFavorites: () => void;
  cartCount: number;
  customerCsrfToken?: string;
}

export const AyWebsApp: React.FC<AyWebsAppProps> = ({
  onClose, onOpenCart, onOpenAccount, onOpenFavorites, cartCount, customerCsrfToken = '',
}) => {
  const { direction } = useLocale();
  const [tab, setTab] = useState<AyWebsTab>('stores');
  const [sheet, setSheet] = useState<{ url: string; storeId: string | null } | null>(null);
  const [favoriteTarget, setFavoriteTarget] = useState<AyWebsFavoriteTarget | null>(null);
  const [ayWebsCount, setAyWebsCount] = useState(0);
  const favorites = useAyWebsFavorites(customerCsrfToken);

  useEffect(() => { setAyWebsCsrfToken(customerCsrfToken || ''); }, [customerCsrfToken]);

  /** §24/§25 : partage Android / liens profonds → feuille, panier ou favoris. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = window.location.pathname.split('/').filter(Boolean)[1] || '';
    if (section === 'cart') { setTab('cart'); }
    // §2 : « wish » est désormais un écran INTERNE — le lien profond ne sort
    // plus vers l'espace compte.
    if (section === 'wish') { setTab('wish'); }
    const shared = (params.get('url') || params.get('text') || '').trim();
    const match = shared.match(/https?:\/\/[^\s<>]+/i)?.[0];
    if (match) setSheet({ url: match, storeId: params.get('store') });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getAyWebsCart(controller.signal)
      // Panier unifié : le compteur AYROVI (cartCount) inclut déjà les lignes
      // synchronisées — on n'ajoute ici QUE les unités non liées, sans doublon.
      .then((payload) => setAyWebsCount(Number(payload.totals?.unlinked_units ?? 0)))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const onTab = useCallback((next: AyWebsTab) => {
    if (next === 'home') { onClose(); return; }
    if (next === 'account') { onOpenAccount(); return; }
    setTab(next);
  }, [onClose, onOpenAccount]);

  const openStore = useCallback((store: AyWebsStore) => {
    // Navigateur marchand : natif dans l'APK (barre flottante Add to Cart),
    // onglet externe sur le web. La détection produit reste serveur (§11).
    openMerchantPage(store.home_url);
  }, []);

  const openCheckout = useCallback(() => {
    setSheet(null);
    onOpenCart();
  }, [onOpenCart]);

  /** « Gérer depuis mon compte » : sortie explicite vers la page complète. */
  const openAccountFavorites = useCallback(() => {
    setFavoriteTarget(null);
    onOpenFavorites();
  }, [onOpenFavorites]);

  const totalCartCount = cartCount + ayWebsCount;

  return (
    <section
      className="fixed inset-0 z-[25] overflow-y-auto bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label="AyWebs"
      data-app-route="aywebs"
      dir={direction}
    >
      {tab === 'stores' && (
        <AyWebsStoresScreen
          tab={tab}
          onTab={onTab}
          onOpenStore={openStore}
          onOpenProduct={(url, storeId) => setSheet({ url, storeId })}
          onOpenFavorite={setFavoriteTarget}
          isFavorite={favorites.isSaved}
          cartCount={totalCartCount}
        />
      )}
      {tab === 'wish' && (
        <AyWebsWishScreen
          tab={tab}
          onTab={onTab}
          favorites={favorites}
          onOpenProduct={(url) => setSheet({ url, storeId: null })}
          onOpenAccount={openAccountFavorites}
          cartCount={totalCartCount}
        />
      )}
      {tab === 'cart' && (
        <AyWebsCartScreen tab={tab} onTab={onTab} onOpenAyroviCheckout={openCheckout} onCartChanged={setAyWebsCount} />
      )}
      {sheet && (
        <AyWebsVariantSheet
          url={sheet.url}
          storeId={sheet.storeId}
          onClose={() => setSheet(null)}
          onCheckout={openCheckout}
        />
      )}
      {favoriteTarget && (
        <AyWebsFavoriteSheet
          target={favoriteTarget}
          favorites={favorites}
          onClose={() => setFavoriteTarget(null)}
          onOpenAccount={onOpenAccount}
        />
      )}
    </section>
  );
};
