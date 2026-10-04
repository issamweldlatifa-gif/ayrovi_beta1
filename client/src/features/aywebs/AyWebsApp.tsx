import React, { useCallback, useEffect, useState } from 'react';
import './aywebs.css';
import { useLocale } from '../../i18n/LocaleContext';
import { AppHeader } from '../../design/AppHeader';
import { openMerchantPage } from '../../services/nativeShell';
import { getAyWebsCart, setAyWebsCsrfToken, type AyWebsStore } from './api';
import { AyWebsStoresScreen } from './components/AyWebsStoresScreen';
import { AyWebsCartScreen } from './components/AyWebsCartScreen';
import { AyWebsVariantSheet, } from './components/AyWebsVariantSheet';
import type { AyWebsTab } from './components/AyWebsTabBar';

/**
 * AYWEBs V2 — hôte du parcours proxy-shopping (référence Add-to-Buyee).
 *
 * Une seule session AYROVI, un seul panier de paiement : les écrans internes
 * (Boutiques → feuille de variantes → confirmation → panier proxy) reposent
 * sur le backend /api/v1/aywebs existant. L'ouverture d'un magasin passe par
 * openMerchantPage : WebView native à barre flottante dans l'APK, onglet
 * externe sur le web — même contrat, aucune duplication d'UI (§2).
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
  const { tr, direction } = useLocale();
  const [tab, setTab] = useState<AyWebsTab>('stores');
  const [sheet, setSheet] = useState<{ url: string; storeId: string | null } | null>(null);
  const [ayWebsCount, setAyWebsCount] = useState(0);

  useEffect(() => { setAyWebsCsrfToken(customerCsrfToken || ''); }, [customerCsrfToken]);

  /** §24/§25 : partage Android / liens profonds → feuille, panier ou favoris. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = window.location.pathname.split('/').filter(Boolean)[1] || '';
    if (section === 'cart') { setTab('cart'); }
    if (section === 'wish') { onOpenFavorites(); }
    const shared = (params.get('url') || params.get('text') || '').trim();
    const match = shared.match(/https?:\/\/[^\s<>]+/i)?.[0];
    if (match) setSheet({ url: match, storeId: params.get('store') });
  }, [onOpenFavorites]);

  useEffect(() => {
    const controller = new AbortController();
    void getAyWebsCart(controller.signal)
      .then((payload) => setAyWebsCount(payload.totals?.units || 0))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const onTab = useCallback((next: AyWebsTab) => {
    if (next === 'home') { onClose(); return; }
    if (next === 'wish') { onOpenFavorites(); return; }
    if (next === 'account') { onOpenAccount(); return; }
    setTab(next);
  }, [onClose, onOpenFavorites, onOpenAccount]);

  const openStore = useCallback((store: AyWebsStore) => {
    // Navigateur marchand : natif dans l'APK (barre flottante Add to Cart),
    // onglet externe sur le web. La détection produit reste serveur (§11).
    openMerchantPage(store.home_url);
  }, []);

  const openCheckout = useCallback(() => {
    setSheet(null);
    onOpenCart();
  }, [onOpenCart]);

  return (
    <section
      className="fixed inset-0 z-[25] overflow-y-auto bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label="AyWebs"
      data-app-route="aywebs"
      dir={direction}
    >
      <AppHeader
        title="AyWebs"
        subtitle={tr('Proxy shopping — Add to Cart', 'التسوق بالوكالة — أضف إلى السلة')}
        onClose={onClose}
      />
      {tab === 'stores' && (
        <AyWebsStoresScreen
          tab={tab}
          onTab={onTab}
          onOpenStore={openStore}
          onOpenProduct={(url, storeId) => setSheet({ url, storeId })}
          cartCount={cartCount + ayWebsCount}
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
    </section>
  );
};
