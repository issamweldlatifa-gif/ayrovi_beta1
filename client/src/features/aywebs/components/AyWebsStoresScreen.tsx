import React, { useEffect, useMemo, useState } from 'react';
import { Heart, Search, ShoppingBag, X } from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import { getAyWebsHome, getAyWebsStores, trackAyWebsEvent, type AyWebsHomePayload, type AyWebsStore } from '../api';
import { AyWebsTabBar, type AyWebsTab } from './AyWebsTabBar';

/**
 * AYWEBs — écran « Stores » (référence Add-to-Buyee, capture 2).
 *
 * Recherche par nom de boutique (le registre reste serveur : shared/aywebsStores),
 * carte résultat (logo, nom, description, favori) et barre d'onglets basse.
 * Amazon en tête : magasin de test phase 1 (capture_supported=true).
 * Aucun magasin codé en dur ici : tout vient de GET /api/v1/aywebs/stores.
 */
export interface AyWebsStoresScreenProps {
  tab: AyWebsTab;
  onTab: (tab: AyWebsTab) => void;
  onOpenStore: (store: AyWebsStore) => void;
  /** Une carte produit recentrée ouvre la feuille de variantes (§13). */
  onOpenProduct?: (url: string, storeId: string) => void;
  cartCount: number;
}

export const AyWebsStoresScreen: React.FC<AyWebsStoresScreenProps> = ({ tab, onTab, onOpenStore, onOpenProduct, cartCount }) => {
  const { tr } = useLocale();
  const [stores, setStores] = useState<AyWebsStore[]>([]);
  const [home, setHome] = useState<AyWebsHomePayload | null>(null);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<AyWebsStore | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getAyWebsStores(controller.signal)
      .then((result) => {
        setStores(result.stores);
        setOffline(result.offline);
      })
      .catch(() => setOffline(true));
    void getAyWebsHome(controller.signal).then((result) => setHome(result.data)).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const results = useMemo(() => {
    const ordered = [...stores].sort((a, b) => (a.id === 'amazon' ? -1 : b.id === 'amazon' ? 1 : 0));
    const active = ordered.filter((store) => store.enabled);
    if (chosen) return active.filter((store) => store.id === chosen.id);
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter((store) => store.name.toLowerCase().includes(q) || store.domains.some((d) => d.includes(q)));
  }, [stores, query, chosen]);

  const toggleFavorite = (id: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="ayw-screen" data-aywebs-screen="stores">
      <header className="ayw-head">
        <h1 className="ayw-title">{tr('Boutiques', 'المتاجر')}</h1>
      </header>

      <div className="ayw-searchwrap">
        <Search size={18} className="ayw-search-icon" aria-hidden="true" />
        <input
          className="ayw-search"
          type="search"
          value={query}
          placeholder={tr('Search a store', 'ابحث عن متجر')}
          aria-label={tr('Search a store', 'ابحث عن متجر')}
          onChange={(event) => { setQuery(event.target.value); setChosen(null); }}
        />
        {chosen && (
          <button type="button" className="ayw-chip" onClick={() => setChosen(null)}>
            {chosen.name}
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Cartes produit façon fiche marchand (captures 1-2, 04/10/2026) :
          image, titre, prix source, équivalent TND serveur, disponibilité. */}
      {home && home.recent_products.length > 0 && (
        <>
          <h2 className="ayw-section">{tr('Recent products', 'منتجات حديثة')}</h2>
          <div className="ayw-cardrow ayw-pad-h">
            {home.recent_products.map((product) => (
              <button
                type="button"
                className="ayw-variantcard ayw-prodcard"
                key={product.product_id}
                onClick={() => onOpenProduct?.(product.source_url, product.store_id)}
              >
                {product.image && <img className="ayw-variantcard-img" src={product.image} alt="" loading="lazy" />}
                <span className="ayw-variantcard-name">{product.title}</span>
                {product.price > 0 && (
                  <span className="ayw-variantcard-price">{product.price.toLocaleString()} {product.currency}</span>
                )}
                {product.pricing_tnd > 0 && (
                  <span className="ayw-variantcard-stock">≈ {product.pricing_tnd.toFixed(2)} {tr('DT', 'د.ت')}</span>
                )}
                {product.availability === 'AVAILABLE' && (
                  <span className="ayw-variantcard-stock">{tr('In Stock', 'متوفر')}</span>
                )}
                {product.availability === 'OUT_OF_STOCK' && (
                  <span className="ayw-variantcard-stock">{tr('Out of stock', 'غير متوفر')}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      <h2 className="ayw-section">{tr('Search Results', 'نتائج البحث')}</h2>

      {offline && (
        <p className="ayw-notice">{tr('Store registry unreachable — retry soon.', 'تعذّر جلب سجل المتاجر — أعد المحاولة لاحقاً.')}</p>
      )}

      <div className="ayw-storegrid">
        {results.map((store) => (
          <div className="ayw-storecard" key={store.id}>
            <button
              type="button"
              className="ayw-storelogo"
              onClick={() => { trackAyWebsEvent('aywebs_open', { store: store.id }); onOpenStore(store); }}
            >
              {store.logo ? (
                <img src={store.logo} alt="" loading="lazy" />
              ) : (
                <ShoppingBag size={34} aria-hidden="true" />
              )}
            </button>
            <div className="ayw-storerow">
              <span className="ayw-storename">{store.display_name || store.name}</span>
              <button
                type="button"
                className={`ayw-fav${favorites.has(store.id) ? ' is-on' : ''}`}
                aria-label={tr('Favorite', 'مفضلة')}
                aria-pressed={favorites.has(store.id)}
                onClick={() => toggleFavorite(store.id)}
              >
                <Heart size={17} aria-hidden="true" />
              </button>
            </div>
            <p className="ayw-storedesc">
              {tr(
                store.id === 'amazon'
                  ? 'Test store #1 — proxy capture enabled.'
                  : `Ships via AYROVI proxy — ${store.country || 'international'}.`,
                store.id === 'amazon' ? 'متجر التجربة #1 — الالتقاط بالوكالة مفعّل.' : `يشحن عبر وكالة AYROVI — ${store.country || 'دولي'}.`,
              )}
            </p>
          </div>
        ))}
      </div>

      <AyWebsTabBar tab={tab} onTab={onTab} cartCount={cartCount} />
    </div>
  );
};
