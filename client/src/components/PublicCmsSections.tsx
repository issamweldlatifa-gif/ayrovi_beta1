import React, { useEffect, useMemo, useState } from 'react';
import heroHomme from '../assets/hero-homme.jpg';
import heroFemme from '../assets/hero-femme.jpg';
import heroEnfants from '../assets/hero-enfants.jpg';
import { ContentCard } from '../discovery/ContentCard';
import { TabHeader } from '../discovery/TabHeader';
import { useLocale } from '../i18n/LocaleContext';
import { getPublicHome } from '../services/publicApi';
import { StoryTab, HomeStoryStrip } from '../social/StoryTab';
import type { StoryCta } from '../social/types';
import { useNavigationHistory } from '../navigation/NavigationHistory';

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

const pageDefinitions: Array<{
  id: CmsPage;
  label: string;
  labelAr: string;
  eyebrow: string;
  eyebrowAr: string;
  description: string;
  descriptionAr: string;
}> = [
  { id: 'arrivals', label: 'Arrivages', labelAr: 'القادم', eyebrow: 'Sélections à venir', eyebrowAr: 'اختيارات قادمة', description: 'Les dates officielles et les comptes à rebours AYROVI.', descriptionAr: 'المواعيد الرسمية والعدّ التنازلي لدى AYROVI.' },
  { id: 'promotions', label: 'Promotions', labelAr: 'العروض', eyebrow: 'Offres en cours', eyebrowAr: 'عروض متاحة', description: 'Les avantages et codes publiés par l’équipe AYROVI.', descriptionAr: 'العروض والرموز التي ينشرها فريق AYROVI.' },
  { id: 'stories', label: 'Social', labelAr: 'التواصل', eyebrow: 'Social AYROVI', eyebrowAr: 'تواصل AYROVI', description: 'Stories et publications de la communauté AYROVI.', descriptionAr: 'قصص ومنشورات مجتمع AYROVI.' },
  { id: 'news', label: 'مجلتي', labelAr: 'مجلتي', eyebrow: 'Magazine AYROVI', eyebrowAr: 'مجلة AYROVI', description: 'Mode, tendances et choix éditoriaux reliés aux produits AYROVI.', descriptionAr: 'موضة واتجاهات واختيارات تحريرية مرتبطة بمنتجات AYROVI.' },
];

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
          <span className="text-[8px] font-black uppercase tracking-[0.12em] text-white/60">{label}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyContent({ label }: { label: string }) {
  const { tr } = useLocale();
  return <div className="rounded-card border border-line bg-white px-6 py-16 text-center"><p className="text-xs font-black uppercase tracking-[0.2em] text-brand">AYROVI CMS</p><h2 className="mt-3 text-2xl font-black text-ink">{tr(`Aucun contenu ${label.toLowerCase()} pour le moment.`, `لا يوجد محتوى ${label} حاليًا.`)}</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">{tr('Cette page se remplira dès qu’un contenu sera publié depuis l’espace Admin.', 'ستظهر المواد هنا فور نشرها من فضاء الإدارة.')}</p></div>;
}

function PageIntro({ definition }: { definition: (typeof pageDefinitions)[number] }) {
  const { isArabic } = useLocale();
  const localDirection = definition.id === 'news' ? 'rtl' : (isArabic ? 'rtl' : 'ltr');
  return (
    <div className="border-b border-line pb-8" dir={localDirection}>
      <div><p className="text-xs font-black uppercase tracking-[0.2em] text-brand">{isArabic ? definition.eyebrowAr : definition.eyebrow}</p><h1 id={`cms-page-${definition.id}`} className="mt-3 font-display text-4xl font-black leading-none tracking-tight text-ink sm:text-6xl">{isArabic ? definition.labelAr : definition.label}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-muted">{isArabic ? definition.descriptionAr : definition.description}</p></div>
    </div>
  );
}

interface PublicCmsSectionsProps { isAuthenticated?: boolean; onOpenAccount?: () => void; }

export const PublicCmsSections: React.FC<PublicCmsSectionsProps> = ({ isAuthenticated = false, onOpenAccount }) => {
  const navigation = useNavigationHistory();
  const { tr, isArabic, direction, formatMoney } = useLocale();
  const cmsLayerId = navigation.stack[0]?.id || '';
  const cmsPageId = cmsLayerId.startsWith('cms:') ? cmsLayerId.slice(4) : '';
  const activePage = pageDefinitions.some((page) => page.id === cmsPageId) ? cmsPageId as CmsPage : null;
  const openCmsPage = (page: CmsPage) => navigation.navigate([{ id: `cms:${page}` }]);
  const closeCmsPage = () => navigation.back();
  const [home, setHome] = useState<HomeData>(emptyHome);
  const [serverOffset, setServerOffset] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    getPublicHome()
      .then((payload) => {
        if (cancelled || !payload.success || !payload.data) return;
        setHome({ ...emptyHome, ...payload.data });
        if (payload.serverTime) setServerOffset(new Date(payload.serverTime).getTime() - Math.round((startedAt + Date.now()) / 2));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activePage) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeCmsPage(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [activePage]);

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
    if (!loaded) return <div className="grid gap-5 sm:grid-cols-2"><div className="h-96 animate-pulse bg-brand-light/20" /><div className="h-96 animate-pulse bg-brand-light/20" /></div>;

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
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {home.products.map((product) => <article key={product.id} className="group overflow-hidden border border-line bg-surface-base shadow-card"><div className="aspect-[4/5] overflow-hidden bg-surface-raised p-3"><img src={mediaSource(product.image, heroFemme)} alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" /></div><div className="border-t border-line p-5"><div className="flex items-start justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">{product.brandName || product.sourcePlatform}</p><span className={`text-[9px] font-black uppercase tracking-wider ${product.stockStatus === 'OUT_OF_STOCK' ? 'text-danger' : 'text-success'}`}>{product.stockStatus === 'OUT_OF_STOCK' ? tr('Indisponible', 'غير متوفر') : tr('Disponible', 'متوفر')}</span></div><h2 className="mt-3 text-lg font-black leading-tight text-ink">{product.name}</h2><p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{product.description}</p><div className="mt-5 border-t border-line pt-4"><strong className="text-xl font-black tracking-tight text-ink">{formatMoney(product.finalPrice)}</strong></div></div></article>)}
      </div>
    ) : <EmptyContent label="Produits" />;

    if (page === 'promotions') return home.promotions.length ? (
      <div className="grid gap-6 lg:grid-cols-2">{home.promotions.map((promotion, index) => (
        <ContentCard key={promotion.id} variant="promo" image={mediaSource(promotion.image, index % 2 ? heroFemme : heroEnfants)} title={promotion.name} description={promotion.description} eyebrow={tr('Promotion en cours', 'عرض متاح')} dir={direction}>
          {promotion.promo_code && <span className="inline-block rounded-control border border-white/25 bg-white/10 px-4 py-2 font-mono text-sm font-bold">{tr('Code', 'الرمز')} : {promotion.promo_code}</span>}
        </ContentCard>
      ))}</div>
    ) : <EmptyContent label={tr('Promotions', 'العروض')} />;

    if (page === 'stories') return <StoryTab isAuthenticated={isAuthenticated} onRequireAuth={() => onOpenAccount?.()} onCta={handleStoryCta} />;

    return home.news.length ? (
      <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">{home.news.map((item) => (
        <ContentCard key={item.id} variant="magazine" image={mediaSource(item.image, heroHomme)} title={item.title} description={item.summary} eyebrow={String(item.category || 'AYROVI').replaceAll('_', ' ')} dir="rtl">
          <p className="text-xs font-bold text-muted">{item.author}</p>
        </ContentCard>
      ))}</div>
    ) : <EmptyContent label="مجلتي" />;
  };

  return (
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
                className="min-h-11 min-w-0 whitespace-nowrap bg-transparent px-0.5 py-2 text-center text-xs font-black text-ink transition-colors hover:text-brand focus-visible:text-brand sm:text-lg"
              >
                {isArabic ? definition.labelAr : definition.label}
              </button>
            ))}
          </div>
        </nav>
      </section>

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
