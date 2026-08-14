import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Calendar, Tag, Image as ImageIcon, FileText, ArrowRight } from './QatafoIcons';
import { FigLogoIcon } from './Icons';
import { getPublicHome } from '../services/publicApi';
import { ErrorState, PageIntro, countdownParts, formatDate, useNow } from '../content/components';
import { ArrivagesPage, PromotionsPage, StoriesPage, NewsPage, pageCounterLabel } from '../content/pages';
import type { CatalogProduct, ContentActions, ContentHomeData, CmsPageId } from '../content/types';
import type { ScrapedProduct, StoreType } from '../types';

const emptyHome: ContentHomeData = { arrivals: [], products: [], promotions: [], stories: [], news: [] };

const pageDefinitions: Array<{ id: CmsPageId; label: string; eyebrow: string; description: string }> = [
  { id: 'arrivals', label: 'Arrivages', eyebrow: 'Sélections à venir', description: 'Les prochaines sélections AYROVI et leurs dates officielles.' },
  { id: 'promotions', label: 'Promotions', eyebrow: 'Offres en cours', description: 'Les avantages et offres actuellement disponibles sur AYROVI.' },
  { id: 'stories', label: 'Stories', eyebrow: 'À la une', description: 'Les nouveautés AYROVI dans un format visuel.' },
  { id: 'news', label: 'Actualités', eyebrow: 'Journal AYROVI', description: 'Les informations, arrivages et annonces de la plateforme.' },
];

const toStore = (platform: string): StoreType => {
  const value = platform.toLowerCase();
  return (['shein', 'amazon', 'temu', 'aliexpress'] as StoreType[]).includes(value as StoreType) ? (value as StoreType) : 'generic';
};

export const catalogToScraped = (product: CatalogProduct): ScrapedProduct => ({
  id: `catalog_${product.id}`,
  store: toStore(product.sourcePlatform),
  storeName: product.brandName || product.sourcePlatform,
  url: product.sourceUrl || 'https://www.shein.com/',
  externalId: product.id,
  title: product.name,
  description: product.description,
  images: product.image ? [product.image] : [],
  mainImage: product.image,
  sourcePrice: product.originalPrice,
  sourceCurrency: product.currency,
  convertedPriceTND: product.finalPrice,
  estimatedShippingTND: 0,
  serviceFeeTND: 0,
  totalPriceTND: product.finalPrice,
  variants: { sizes: [], colors: [] },
  availability: product.stockStatus === 'OUT_OF_STOCK' ? 'out_of_stock' : 'in_stock',
  brand: product.brandName || null,
  scrapedAt: new Date().toISOString(),
});

interface PublicCmsSectionsProps {
  onOrderProduct: (product: ScrapedProduct) => void;
}

export const PublicCmsSections: React.FC<PublicCmsSectionsProps> = ({ onOrderProduct }) => {
  const [home, setHome] = useState<ContentHomeData>(emptyHome);
  const [serverOffset, setServerOffset] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [activePage, setActivePage] = useState<CmsPageId | null>(null);
  const [focusArrivalId, setFocusArrivalId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoaded(false);
    setLoadFailed(false);
    const startedAt = Date.now();
    getPublicHome()
      .then((payload) => {
        if (!payload.success || !payload.data) throw new Error('home');
        const data = payload.data as Partial<ContentHomeData> & { promotions?: any[] };
        // /home renvoie les promotions brutes : normalise les relations manquantes.
        const promotions = (data.promotions || []).map((promo: any) => ({
          ...promo,
          arrival_ids: Array.isArray(promo.arrival_ids) ? promo.arrival_ids : [],
          product_ids: Array.isArray(promo.product_ids) ? promo.product_ids : [],
        }));
        setHome({ ...emptyHome, ...data, promotions } as ContentHomeData);
        if (payload.serverTime) setServerOffset(new Date(payload.serverTime).getTime() - Math.round((startedAt + Date.now()) / 2));
        setLoaded(true);
      })
      .catch(() => { setLoadFailed(true); setLoaded(true); });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!activePage) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setActivePage(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [activePage]);

  const now = useNow(serverOffset);

  const activeArrivals = useMemo(
    () => home.arrivals.filter((arrival) => new Date(arrival.expectedArrivalAt).getTime() > now),
    [home.arrivals, now],
  );
  const activePromotions = useMemo(
    () => home.promotions.filter((promo) => new Date(promo.ends_at).getTime() > now),
    [home.promotions, now],
  );

  const openPage = useCallback((page: CmsPageId, arrivalId?: string) => {
    setFocusArrivalId(arrivalId || null);
    setActivePage(page);
  }, []);

  const actions: ContentActions = useMemo(() => ({
    onOrderProduct: (product) => onOrderProduct(catalogToScraped(product)),
    onOpenPage: openPage,
    onClose: () => setActivePage(null),
  }), [onOrderProduct, openPage]);

  const activeDefinition = pageDefinitions.find((page) => page.id === activePage);
  const pageCounts: Record<CmsPageId, number> = {
    arrivals: activeArrivals.length,
    promotions: activePromotions.length,
    stories: home.stories.length,
    news: home.news.length,
  };

  const nextPage = activePage ? pageDefinitions[pageDefinitions.findIndex((page) => page.id === activePage) + 1] : undefined;
  const featuredStory = home.stories[0];
  const latestNews = home.news[0];
  const nextArrival = activeArrivals[0];
  const activePromo = activePromotions[0];

  const renderPageContent = (page: CmsPageId) => {
    if (loadFailed) return <ErrorState onRetry={load} />;
    if (!loaded) return null; // le shell affiche le skeleton
    if (page === 'arrivals') return <ArrivagesPage arrivals={activeArrivals} now={now} actions={actions} initialArrivalId={focusArrivalId} />;
    if (page === 'promotions') return <PromotionsPage promotions={activePromotions} now={now} actions={actions} />;
    if (page === 'stories') return <StoriesPage stories={home.stories} now={now} actions={actions} />;
    return <NewsPage news={home.news} now={now} actions={actions} />;
  };

  return (
    <>
      {/* ===== Homepage : navigation + intégration du contenu publié ===== */}
      <section id="arrivages" className="w-full border-y border-black/10 bg-white" aria-label="Catégories AYROVI">
        <nav className="mx-auto w-full max-w-7xl px-2 py-6 sm:px-8 sm:py-10" aria-label="Contenus AYROVI">
          <div className="grid w-full grid-cols-4 items-center">
            {pageDefinitions.map((definition) => (
              <button
                key={definition.id}
                type="button"
                onClick={() => openPage(definition.id)}
                aria-label={`Ouvrir ${definition.label}`}
                className="min-h-11 min-w-0 whitespace-nowrap bg-transparent px-0.5 py-2 text-center text-[clamp(0.62rem,3.55vw,2rem)] font-black tracking-[-0.035em] text-ink transition-colors hover:text-brand focus-visible:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {definition.label}
              </button>
            ))}
          </div>

          {/* Tuiles dynamiques : le contenu publié vient de la base, jamais en dur */}
          {loaded && !loadFailed && (nextArrival || activePromo || featuredStory || latestNews) && (
            <div className="mt-4 grid gap-3 sm:mt-6 sm:grid-cols-2 lg:grid-cols-4">
              {nextArrival && (
                <button type="button" onClick={() => openPage('arrivals', nextArrival.id)} className="group border border-black/10 bg-surface p-4 text-left transition hover:border-brand">
                  <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-brand"><Calendar className="h-3.5 w-3.5" />Prochain arrivage</p>
                  <strong className="mt-2 block truncate text-sm font-black text-ink group-hover:text-brand">{nextArrival.name}</strong>
                  <span className="mt-1 block text-[11px] font-bold tabular-nums text-muted">
                    {(() => { const p = countdownParts(nextArrival.expectedArrivalAt, now); return p.expired ? 'En cours' : `J-${p.days} · ${String(p.hours).padStart(2, '0')}h ${String(p.minutes).padStart(2, '0')}`; })()}
                  </span>
                </button>
              )}
              {activePromo && (
                <button type="button" onClick={() => openPage('promotions')} className="group border border-black/10 bg-surface p-4 text-left transition hover:border-brand">
                  <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-brand"><Tag className="h-3.5 w-3.5" />Promotion</p>
                  <strong className="mt-2 block truncate text-sm font-black text-ink group-hover:text-brand">{activePromo.name}</strong>
                  <span className="mt-1 block text-[11px] font-black text-accent-deep">
                    {activePromo.discount_type === 'PERCENTAGE' ? `-${Math.round(activePromo.value)}%` : `-${Number(activePromo.value).toFixed(2)} DT`}
                    {activePromo.promo_code ? ` · ${activePromo.promo_code}` : ''}
                  </span>
                </button>
              )}
              {featuredStory && (
                <button type="button" onClick={() => openPage('stories')} className="group border border-black/10 bg-surface p-4 text-left transition hover:border-brand">
                  <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-brand"><ImageIcon className="h-3.5 w-3.5" />À la une</p>
                  <strong className="mt-2 block truncate text-sm font-black text-ink group-hover:text-brand">{featuredStory.title}</strong>
                  <span className="mt-1 block text-[11px] font-bold text-muted">{featuredStory.category}</span>
                </button>
              )}
              {latestNews && (
                <button type="button" onClick={() => openPage('news')} className="group border border-black/10 bg-surface p-4 text-left transition hover:border-brand">
                  <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-brand"><FileText className="h-3.5 w-3.5" />Journal</p>
                  <strong className="mt-2 block truncate text-sm font-black text-ink group-hover:text-brand">{latestNews.title}</strong>
                  <span className="mt-1 block text-[11px] font-bold text-muted">{formatDate(latestNews.published_at)}</span>
                </button>
              )}
            </div>
          )}
        </nav>
      </section>

      {/* ===== Pages contenu plein écran ===== */}
      {activePage && activeDefinition && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-surface" role="dialog" aria-modal="true" aria-labelledby={`cms-page-${activePage}`}>
          <header className="sticky top-0 z-20 border-b border-black/10 bg-white/95 backdrop-blur-xl">
            <div className="h-1 w-full bg-accent" />
            <div className="mx-auto grid h-16 max-w-7xl grid-cols-[52px_1fr_52px] items-center px-3 sm:h-20 sm:grid-cols-[70px_1fr_70px] sm:px-8">
              <button type="button" autoFocus onClick={() => setActivePage(null)} aria-label={`Fermer ${activeDefinition.label}`} className="grid h-11 w-11 place-items-center border border-line bg-white text-ink transition hover:border-brand hover:bg-brand hover:text-white">
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center justify-center gap-2.5 text-ink">
                <span className="text-brand"><FigLogoIcon className="h-8 w-8 sm:h-9 sm:w-9" /></span>
                <strong className="text-2xl font-black tracking-tight sm:text-3xl">AYROVI</strong>
              </div>
              <span className="justify-self-end text-[9px] font-black uppercase tracking-[0.16em] text-muted sm:text-[10px]">
                {String(pageDefinitions.findIndex((page) => page.id === activePage) + 1).padStart(2, '0')} / {String(pageDefinitions.length).padStart(2, '0')}
              </span>
            </div>
          </header>

          <main className="mx-auto min-h-[calc(100dvh-5rem)] max-w-7xl px-5 py-10 sm:px-8 sm:py-16">
            <PageIntro
              eyebrow={activeDefinition.eyebrow}
              title={activeDefinition.label}
              description={activeDefinition.description}
              count={pageCounts[activePage]}
              countLabel={pageCounterLabel(activePage, pageCounts[activePage])}
            />

            <div className="pt-8 sm:pt-12">
              {!loaded && (
                <div className="grid gap-5 sm:grid-cols-2" aria-busy="true">
                  <div className="h-96 animate-pulse bg-brand-light/20" />
                  <div className="h-96 animate-pulse bg-brand-light/20" />
                </div>
              )}
              {loaded && renderPageContent(activePage)}
            </div>

            {/* Pagination discrète entre les 4 pages */}
            {nextPage && (
              <button
                type="button"
                onClick={() => openPage(nextPage.id)}
                className="mt-14 flex w-full items-center justify-between border-t border-black/10 pt-6 text-left transition hover:text-brand"
              >
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">Page suivante</span>
                <span className="inline-flex items-center gap-2 text-xl font-black tracking-tight">{nextPage.label}<ArrowRight className="h-5 w-5" /></span>
              </button>
            )}
          </main>
        </div>
      )}
    </>
  );
};
