import React, { useEffect, useMemo, useState } from 'react';
import heroHomme from '../assets/hero-homme.jpg';
import heroFemme from '../assets/hero-femme.jpg';
import heroEnfants from '../assets/hero-enfants.jpg';
import { ContentCard } from '../discovery/ContentCard';
import { ArrowLeft } from './QatafoIcons';
import { PUBLIC_PAGES, type PublicPageId } from '../navigation/publicPages';
import { TabHeader } from '../discovery/TabHeader';
import { useLocale } from '../i18n/LocaleContext';
import { getPublicHome } from '../services/publicApi';
import { StoryTab, HomeStoryStrip } from '../social/StoryTab';
import type { StoryCta } from '../social/types';
import { useNavigationHistory } from '../navigation/NavigationHistory';
import { ShoppingBag, Heart } from './QatafoIcons';
import { catalogProductToScraped, type CatalogProduct } from '../commerce/catalogProduct';
import type { ScrapedProduct } from '../types';

interface HomeData { arrivals: any[]; products: any[]; promotions: any[]; stories: any[]; news: any[]; }
type CmsPage = keyof HomeData;

const emptyHome: HomeData = { arrivals: [], products: [], promotions: [], stories: [], news: [] };
const localMedia: Record<string, string> = {
  '/media/hero-homme.jpg': heroHomme,
  '/media/hero-femme.jpg': heroFemme,
  '/media/hero-enfants.jpg': heroEnfants,
};
const mediaSource = (value: unknown, fallback: string) => localMedia[String(value || '')] || String(value || fallback);
const pad = (value: number) => String(Math.max(0, value)).padStart(2, '0');

/**
 * Les trois destinations de la barre publique (Arrivage, Gift & Cards, Magazine) reçoivent leur
 * libellé (FR et AR) du contrat partagé — une seule source, la même que l'Admin, l'API publique
 * et le routage. Cette table ne décrit plus que ce qui lui appartient en propre : l'accroche et
 * la description éditoriale. « Social » n'est pas une destination du contrat : son libellé reste
 * ici, en attendant une décision produit.
 */
const cmsPageContent: Record<'arrivals' | 'promotions' | 'products' | 'stories' | 'news', { eyebrow: string; eyebrowAr: string; description: string; descriptionAr: string }> = {
  arrivals: { eyebrow: 'Sélections à venir', eyebrowAr: 'اختيارات قادمة', description: 'Les dates officielles et les comptes à rebours AYROVI.', descriptionAr: 'المواعيد الرسمية والعدّ التنازلي لدى AYROVI.' },
  // Espace 01 ACHETER : l'entrée « Tous les produits » du menu existait mais ne menait à rien
  // (la page n'était pas déclarée). Le catalogue est désormais une page réelle, branchée sur les
  // produits ACTIFs servis par l'API — et sur rien d'autre.
  products: { eyebrow: 'Le catalogue AYROVI', eyebrowAr: 'كتالوج AYROVI', description: 'Tout ce qui est commandable aujourd’hui, au prix final en dinars tunisiens.', descriptionAr: 'كل ما يمكن طلبه اليوم، بسعر نهائي بالدينار التونسي.' },
  promotions: { eyebrow: 'Cadeaux, cartes et avantages', eyebrowAr: 'هدايا وبطاقات وامتيازات', description: 'Les avantages et codes publiés par l’équipe AYROVI. Seules les offres disponibles sont affichées.', descriptionAr: 'الامتيازات والرموز المنشورة من فريق AYROVI. نعرض فقط ما هو متاح فعليًا.' },
  stories: { eyebrow: 'Social AYROVI', eyebrowAr: 'تواصل AYROVI', description: 'Stories et publications de la communauté AYROVI.', descriptionAr: 'قصص ومنشورات مجتمع AYROVI.' },
  news: { eyebrow: 'Magazine AYROVI', eyebrowAr: 'مجلة AYROVI', description: 'Mode, tendances et choix éditoriaux reliés aux produits AYROVI.', descriptionAr: 'موضة واتجاهات واختيارات تحريرية مرتبطة بمنتجات AYROVI.' },
};
/** Pages qui ne figurent pas dans la barre publique : leur libellé vit ici, dans les deux langues. */
const localPageLabels: Partial<Record<CmsPage, { label: string; labelAr: string }>> = {
  products: { label: 'Tous les produits', labelAr: 'كل المنتجات' },
  stories: { label: 'Social', labelAr: 'التواصل' },
};
const pageDefinitions: Array<{
  id: CmsPage;
  label: string;
  labelAr: string;
  eyebrow: string;
  eyebrowAr: string;
  description: string;
  descriptionAr: string;
}> = (['products', 'arrivals', 'promotions', 'stories', 'news'] as const).map((id) => {
  // Libellé : contrat partagé quand la page y figure, libellé local sinon (catalogue, Social).
  const shared = PUBLIC_PAGES.find((page) => page.id === id);
  return {
    id,
    label: shared?.label ?? localPageLabels[id]?.label ?? id,
    labelAr: shared?.labelAr ?? localPageLabels[id]?.labelAr ?? id,
    ...cmsPageContent[id],
  };
});


function Countdown({ target, serverOffset }: { target: string; serverOffset: number }) {
  const { tr } = useLocale();
  const [now, setNow] = useState(() => Date.now() + serverOffset);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReady(true));
    const timer = window.setInterval(() => setNow(Date.now() + serverOffset), 1000);
    return () => { window.cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, [serverOffset]);
  const targetTime = new Date(target).getTime();
  if (!target || !Number.isFinite(targetTime)) return null;
  const totalSeconds = Math.max(0, Math.floor((targetTime - now) / 1000));
  const values = [Math.floor(totalSeconds / 86400), Math.floor((totalSeconds % 86400) / 3600), Math.floor((totalSeconds % 3600) / 60), totalSeconds % 60];
  const labels = [tr('J', 'يوم'), tr('H', 'س'), tr('MIN', 'د'), tr('SEC', 'ث')];
  return (
    <div className="flex gap-2" aria-label={tr('Compte à rebours avant l’arrivage', 'العد التنازلي لوصول المنتجات')} aria-busy={!ready}>
      {labels.map((label, index) => (
        <div key={label} className="min-w-12 rounded-control bg-white/10 px-2 py-2 text-center backdrop-blur-sm">
          {ready ? <strong className="block text-lg font-black tabular-nums">{pad(values[index])}</strong> : <span className="mx-auto mb-1 block h-5 w-8 animate-pulse rounded bg-white/20" />}
          <span className="text-xs font-black uppercase tracking-[0.12em] text-white/60">{label}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyContent({ label }: { label: string }) {
  const { tr } = useLocale();
  return <div className="rounded-card border border-line bg-white px-6 py-16 text-center"><p className="text-xs font-black uppercase tracking-[0.2em] text-ink">AYROVI CMS</p><h2 className="mt-3 text-2xl font-black text-ink">{tr(`Aucun contenu ${label.toLowerCase()} pour le moment.`, `لا يوجد محتوى ${label} حاليًا.`)}</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">{tr('Cette page se remplira dès qu’un contenu sera publié depuis l’espace Admin.', 'ستظهر المواد هنا فور نشرها من فضاء الإدارة.')}</p></div>;
}

function PageIntro({ definition }: { definition: (typeof pageDefinitions)[number] }) {
  const { isArabic } = useLocale();
  const localDirection = isArabic ? 'rtl' : 'ltr';
  return (
    <div className="border-b border-line pb-8" dir={localDirection}>
      <div><p className="text-xs font-black uppercase tracking-[0.2em] text-ink">{isArabic ? definition.eyebrowAr : definition.eyebrow}</p><h1 id={`cms-page-${definition.id}`} className="mt-3 font-display text-4xl font-black leading-none tracking-tight text-ink sm:text-6xl">{isArabic ? definition.labelAr : definition.label}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-muted">{isArabic ? definition.descriptionAr : definition.description}</p></div>
    </div>
  );
}

interface PublicCmsSectionsProps {
  isAuthenticated?: boolean;
  onOpenAccount?: () => void;
  /** Ouvre le tiroir de commande sur un produit du catalogue (espace 01 ACHETER). */
  onOpenProduct?: (product: ScrapedProduct) => void;
  homepageVisible?: boolean;
  standalonePage?: PublicPageId;
}

export const PublicCmsSections: React.FC<PublicCmsSectionsProps> = ({ isAuthenticated = false, onOpenAccount, onOpenProduct, homepageVisible = true, standalonePage }) => {
  const navigation = useNavigationHistory();
  const { tr, isArabic, direction, formatMoney } = useLocale();
  const cmsLayerId = navigation.stack[0]?.id || '';
  const cmsPageId = cmsLayerId.startsWith('cms:') ? cmsLayerId.slice(4) : '';
  const overlayPage = pageDefinitions.some((page) => page.id === cmsPageId) ? cmsPageId as CmsPage : null;
  const activePage = overlayPage || standalonePage || null;
  const openCmsPage = (page: CmsPage) => {
    const destination = PUBLIC_PAGES.find(item => item.id === page);
    if (standalonePage && destination) window.location.assign(destination.href);
    else navigation.navigate([{ id: `cms:${page}` }]);
  };
  const closeCmsPage = () => navigation.back();
  const [home, setHome] = useState<HomeData>(emptyHome);
  const [serverOffset, setServerOffset] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    setLoaded(false);
    setFailed(false);
    getPublicHome({ refresh: attempt > 0 })
      .then((payload) => {
        if (cancelled) return;
        if (!payload.success || !payload.data) throw new Error('PUBLIC_CONTENT_UNAVAILABLE');
        setHome({ ...emptyHome, ...payload.data });
        if (payload.serverTime) setServerOffset(new Date(payload.serverTime).getTime() - Math.round((startedAt + Date.now()) / 2));
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) { setFailed(true); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    if (!overlayPage) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeCmsPage(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [overlayPage]);

  const activeArrivals = useMemo(
    () => home.arrivals.filter((arrival) => new Date(arrival.expectedArrivalAt).getTime() > Date.now() + serverOffset),
    [home.arrivals, serverOffset],
  );
  const activeDefinition = pageDefinitions.find((page) => page.id === activePage);

  const handleStoryCta = (cta: StoryCta) => {
    if (cta.action === 'promotions') { openCmsPage('promotions'); return; }
    if (cta.action === 'product') { openCmsPage('arrivals'); return; }
    if (cta.action === 'url' && /^https?:\/\//i.test(cta.targetId || '')) { window.open(cta.targetId, '_blank', 'noopener'); return; }
    openCmsPage('arrivals');
  };

  const renderPageContent = (page: CmsPage) => {
    if (failed) return <div className="public-content-state" role="alert"><p>{tr('Le contenu est momentanément indisponible.', 'المحتوى غير متاح مؤقتًا.')}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{tr('Réessayer', 'أعد المحاولة')}</button></div>;
    if (!loaded) return <div className="grid gap-5 sm:grid-cols-2"><div className="h-96 animate-pulse bg-surface/20" /><div className="h-96 animate-pulse bg-surface/20" /></div>;

    if (page === 'arrivals') return activeArrivals.length ? (
      <div className="grid gap-5 lg:grid-cols-2">
        {activeArrivals.map((arrival, index) => (
          <ContentCard
            key={arrival.id}
            variant="arrival"
            image={mediaSource(arrival.mainImage, index % 2 ? heroFemme : heroHomme)}
            title={arrival.name}
            description={arrival.description}
            eyebrow={tr('Prochain arrivage', 'الوصول القادم')}
            badge={arrival.badge || (arrival.type === 'EXPRESS' ? 'Express' : 'Standard')}
            dir={direction}
          >
            <Countdown target={arrival.expectedArrivalAt} serverOffset={serverOffset} />
          </ContentCard>
        ))}
      </div>
    ) : <EmptyContent label={tr('Arrivages', 'القادم')} />;

    if (page === 'products') return home.products.length ? (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-6 sm:gap-x-4 sm:gap-y-8">
        {(home.products as CatalogProduct[]).map((product) => {
          const soldOut = String(product.stockStatus || '').toUpperCase() === 'OUT_OF_STOCK';
          const open = () => onOpenProduct?.(catalogProductToScraped(product));
          return (
            <article key={product.id} className="lens-product-card group relative flex flex-col text-start">
              <button
                type="button"
                onClick={open}
                disabled={soldOut}
                className="lens-card-open w-full text-start cursor-pointer disabled:cursor-not-allowed"
                aria-label={tr(`Voir le produit : ${product.name}`, `عرض المنتج: ${product.name}`)}
              >
                {/* Media stage Zalando standard: 2/3 portrait, rounded-2xl, soft grey canvas */}
                <div className="lens-card-media relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-[#f0f2f2] flex items-center justify-center">
                  <img
                    src={mediaSource(product.image, heroFemme)}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover mix-blend-multiply transition duration-500 group-hover:scale-105"
                  />
                  {product.originalPrice && product.convertedPrice && product.originalPrice > product.convertedPrice && (
                    <span className="lens-card-promo-badge">Promo</span>
                  )}
                  {/* Floating circular white heart button */}
                  <div className="lens-card-favorite pointer-events-none">
                    <Heart size={20} />
                  </div>
                </div>

                {/* Typography Zalando standard: Bold Brand (700) + Regular title (400) */}
                <h4 className="lens-card-title mt-2.5 text-sm font-bold text-ink truncate">
                  {product.brandName || product.sourcePlatform || 'AYROVI'}
                </h4>
                <p className="lens-card-description mt-0.5 text-xs text-[#595959] line-clamp-2">
                  {product.name}
                </p>

                {/* Price display & action */}
                <div className="lens-card-price mt-1.5 flex items-baseline justify-between gap-2">
                  <strong className="text-sm font-black text-ink">
                    {formatMoney(product.finalPrice)}
                  </strong>
                  <span className={`text-[11px] font-bold ${soldOut ? 'text-danger' : 'text-success'}`}>
                    {soldOut ? tr('Indisponible', 'غير متوفر') : tr('Commander', 'اطلب الآن')}
                  </span>
                </div>
              </button>
            </article>
          );
        })}
      </div>
    ) : <EmptyContent label={tr('produits', 'منتجات')} />;

    if (page === 'promotions') return home.promotions.length ? (
      <div className="grid gap-6 lg:grid-cols-2">{home.promotions.map((promotion, index) => (
        <ContentCard key={promotion.id} variant="promo" image={mediaSource(promotion.image, index % 2 ? heroFemme : heroEnfants)} title={promotion.name} description={promotion.description} eyebrow={tr('Promotion en cours', 'عرض متاح')} dir={direction}>
          {promotion.promo_code && <span className="inline-block rounded-control border border-white/25 bg-white/10 px-4 py-2 ay-number text-sm font-bold">{tr('Code', 'الرمز')} : {promotion.promo_code}</span>}
        </ContentCard>
      ))}</div>
    ) : <div className="public-content-state"><h2>{tr('Aucun cadeau, carte ou avantage publié pour le moment.', 'لا توجد هدايا أو بطاقات أو امتيازات منشورة حاليًا.')}</h2><p>{tr('Les nouveautés apparaîtront ici dès leur publication. Aucune carte payante n’est proposée actuellement.', 'تظهر المستجدات هنا عند نشرها. لا نعرض حاليًا بطاقة مدفوعة.')}</p></div>;

    if (page === 'stories') return <StoryTab isAuthenticated={isAuthenticated} onRequireAuth={() => onOpenAccount?.()} onCta={handleStoryCta} />;

    return home.news.length ? (
      <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">{home.news.map((item) => (
        <ContentCard key={item.id} variant="magazine" image={mediaSource(item.image, heroHomme)} title={item.title} description={item.summary} eyebrow={String(item.category || 'AYROVI').replaceAll('_', ' ')} dir="auto">
          <p className="text-xs font-bold text-muted">{item.author}</p>
        </ContentCard>
      ))}</div>
    ) : <EmptyContent label="مجلتي" />;
  };

  if (standalonePage && !overlayPage && activeDefinition) return <main className="public-standalone-page" data-public-page={standalonePage} dir={direction}>
    <a className="public-page-back" href="/"><ArrowLeft size={20} />{tr('Accueil', 'الرئيسية')}</a>
    <PageIntro definition={activeDefinition} />
    <div className="public-page-content">{renderPageContent(standalonePage)}</div>
  </main>;

  return (
    <>
      {/*
        HOMEPAGE CLEANUP: كتل الصفحة الرئيسية (شريط الستوريز + شريط التبويبات القديم)
        مخفية مؤقتاً من العرض — homepageVisible=false — مع إبقاء صفحات CMS بملء
        الشاشة تعمل أدناه. المكوّن والبيانات لم يُحذفا من المشروع.
      */}
      {homepageVisible && (
        <>
          {/* Strip stories au-dessus des cartes (cahier des charges §7) */}
          <HomeStoryStrip isAuthenticated={isAuthenticated} onRequireAuth={() => onOpenAccount?.()} onCta={handleStoryCta} />

          <section id="arrivages" className="w-full border-y border-line bg-white" aria-label={tr('Contenus AYROVI', 'محتوى AYROVI')}>
            <nav className="mx-auto w-full max-w-7xl px-2 py-6 sm:px-8 sm:py-10" aria-label="Contenus AYROVI">
              <div className="grid w-full grid-cols-4 items-center">
                {pageDefinitions.map((definition) => (
                  <button
                    key={definition.id}
                    type="button"
                    onClick={() => openCmsPage(definition.id)}
                    aria-label={tr(`Ouvrir ${definition.label}`, `فتح ${definition.labelAr}`)}
                    className="min-h-11 min-w-0 whitespace-nowrap bg-transparent px-0.5 py-2 text-center text-xs font-black text-ink transition-colors hover:text-ink focus-visible:text-ink sm:text-lg"
                  >
                    {isArabic ? definition.labelAr : definition.label}
                  </button>
                ))}
              </div>
            </nav>
          </section>
        </>
      )}

      {activePage && activeDefinition && (
        <div className={`no-scrollbar fixed inset-0 z-[70] overflow-y-auto ${activePage === 'stories' ? 'bg-white' : 'bg-surface'}`} dir={activePage === 'news' ? 'rtl' : direction} role="dialog" aria-modal="true" aria-label={isArabic ? activeDefinition.labelAr : activeDefinition.label}>
          <TabHeader
            current={pageDefinitions.findIndex((page) => page.id === activePage) + 1}
            total={pageDefinitions.length}
            title={isArabic ? activeDefinition.labelAr : activeDefinition.label}
            onClose={closeCmsPage}
          />
          <main className={activePage === 'stories' ? 'min-h-[calc(100dvh-3.5rem)] w-full' : 'mx-auto min-h-[calc(100dvh-5rem)] max-w-7xl px-5 py-10 sm:px-8 sm:py-16'}>
            {activePage !== 'stories' && <PageIntro definition={activeDefinition} />}
            <div className={activePage === 'stories' ? '' : 'pt-8 sm:pt-12'}>{renderPageContent(activePage)}</div>
          </main>
        </div>
      )}
    </>
  );
};
