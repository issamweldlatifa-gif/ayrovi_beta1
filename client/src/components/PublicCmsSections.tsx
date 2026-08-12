import React, { useEffect, useMemo, useState } from 'react';
import heroHomme from '../assets/hero-homme.jpg';
import heroFemme from '../assets/hero-femme.jpg';
import heroEnfants from '../assets/hero-enfants.jpg';
import { X } from './QatafoIcons';
import { FigLogoIcon } from './Icons';

interface HomeData { arrivals: any[]; products: any[]; promotions: any[]; stories: any[]; news: any[]; }
type CmsPage = keyof HomeData;

const emptyHome: HomeData = { arrivals: [], products: [], promotions: [], stories: [], news: [] };
const localMedia: Record<string, string> = {
  '/media/hero-homme.jpg': heroHomme,
  '/media/hero-femme.jpg': heroFemme,
  '/media/hero-enfants.jpg': heroEnfants,
};
const mediaSource = (value: unknown, fallback: string) => localMedia[String(value || '')] || String(value || fallback);
const formatPrice = (value: unknown) => `${Number(value || 0).toLocaleString('fr-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;
const pad = (value: number) => String(Math.max(0, value)).padStart(2, '0');

const pageDefinitions: Array<{
  id: CmsPage;
  label: string;
  eyebrow: string;
  description: string;
}> = [
  { id: 'arrivals', label: 'Arrivages', eyebrow: 'Sélections à venir', description: 'Les dates officielles et les comptes à rebours AYROVI.' },
  { id: 'promotions', label: 'Promotions', eyebrow: 'Offres en cours', description: 'Les avantages et codes publiés par l’équipe AYROVI.' },
  { id: 'stories', label: 'Stories', eyebrow: 'À la une', description: 'Les nouveautés AYROVI dans un format visuel.' },
  { id: 'news', label: 'Actualités', eyebrow: 'Journal AYROVI', description: 'Les informations, arrivages et annonces de la plateforme.' },
];

function Countdown({ target, serverOffset }: { target: string; serverOffset: number }) {
  const [now, setNow] = useState(() => Date.now() + serverOffset);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + serverOffset), 1000);
    return () => window.clearInterval(timer);
  }, [serverOffset]);
  const targetTime = new Date(target).getTime();
  if (!target || !Number.isFinite(targetTime)) return null;
  const totalSeconds = Math.max(0, Math.floor((targetTime - now) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return (
    <div className="mt-5 flex gap-2" aria-label={`Compte à rebours : ${days} jours, ${hours} heures, ${minutes} minutes`}>
      {[[days, 'J'], [hours, 'H'], [minutes, 'MIN'], [seconds, 'SEC']].map(([value, label]) => (
        <div key={String(label)} className="min-w-12 bg-white/10 px-2 py-2 text-center backdrop-blur-sm"><strong className="block text-lg font-black tabular-nums">{pad(Number(value))}</strong><span className="text-[8px] font-black uppercase tracking-[0.16em] text-white/55">{label}</span></div>
      ))}
    </div>
  );
}

function EmptyContent({ label }: { label: string }) {
  return <div className="border border-black/10 bg-white px-6 py-20 text-center"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#673de6]">AYROVI CMS</p><h2 className="mt-3 text-2xl font-black text-[#17131f]">Aucun contenu {label.toLowerCase()} pour le moment.</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">Cette page se remplira automatiquement dès qu’un contenu sera publié depuis l’espace Admin.</p></div>;
}

function PageIntro({ definition, count }: { definition: (typeof pageDefinitions)[number]; count: number }) {
  return (
    <div className="grid gap-8 border-b border-black/10 pb-10 sm:grid-cols-[1fr_auto] sm:items-end sm:pb-14">
      <div><p className="text-xs font-black uppercase tracking-[0.22em] text-[#673de6]">{definition.eyebrow}</p><h1 id={`cms-page-${definition.id}`} className="mt-3 text-5xl font-black leading-[0.9] tracking-[-0.055em] text-[#17131f] sm:text-7xl">{definition.label}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">{definition.description}</p></div>
      <div className="flex items-end gap-3"><strong className="text-5xl font-black tabular-nums text-[#673de6]">{String(count).padStart(2, '0')}</strong><span className="pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">contenus<br />publiés</span></div>
    </div>
  );
}

export const PublicCmsSections: React.FC = () => {
  const [home, setHome] = useState<HomeData>(emptyHome);
  const [serverOffset, setServerOffset] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [activePage, setActivePage] = useState<CmsPage | null>(null);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    fetch('/api/public/home')
      .then((response) => response.ok ? response.json() : Promise.reject())
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
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setActivePage(null); };
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
  const pageData: HomeData = { ...home, arrivals: activeArrivals };
  const activeDefinition = pageDefinitions.find((page) => page.id === activePage);

  const renderPageContent = (page: CmsPage) => {
    if (!loaded) return <div className="grid gap-5 sm:grid-cols-2"><div className="h-96 animate-pulse bg-[#e8e3f1]" /><div className="h-96 animate-pulse bg-[#e8e3f1]" /></div>;

    if (page === 'arrivals') return activeArrivals.length ? (
      <div className="grid gap-5 lg:grid-cols-2">
        {activeArrivals.map((arrival, index) => (
          <article key={arrival.id} className="relative min-h-[420px] overflow-hidden bg-[#24104f] text-white shadow-[0_24px_60px_-32px_rgba(36,16,79,0.85)]">
            <img src={mediaSource(arrival.mainImage, index % 2 ? heroFemme : heroHomme)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-65" /><div className="absolute inset-0 bg-gradient-to-t from-[#160b30] via-[#24104f]/30 to-black/10" />
            <div className="relative flex min-h-[420px] flex-col justify-end p-7 sm:p-9"><div className="mb-auto flex items-center justify-between gap-3"><span className="bg-[#fbbf24] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#17131f]">{arrival.type === 'EXPRESS' ? 'Express' : 'Standard'}</span>{arrival.badge && <span className="text-xs font-bold text-white/75">{arrival.badge}</span>}</div><h2 className="text-3xl font-black tracking-[-0.04em]">{arrival.name}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-white/75">{arrival.description}</p><Countdown target={arrival.expectedArrivalAt} serverOffset={serverOffset} /></div>
          </article>
        ))}
      </div>
    ) : <EmptyContent label="Arrivages" />;

    if (page === 'products') return home.products.length ? (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {home.products.map((product) => <article key={product.id} className="overflow-hidden border border-black/7 bg-white shadow-[0_18px_50px_-38px_rgba(24,19,31,0.55)]"><div className="aspect-[4/5] overflow-hidden bg-[#eeeaf4]"><img src={mediaSource(product.image, heroFemme)} alt={product.name} className="h-full w-full object-cover transition duration-700 hover:scale-105" /></div><div className="p-5"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#673de6]">{product.brandName || product.sourcePlatform}</p><h2 className="mt-2 text-lg font-black text-[#17131f]">{product.name}</h2><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{product.description}</p><div className="mt-4 flex items-center justify-between gap-3"><strong className="text-lg text-[#24104f]">{formatPrice(product.finalPrice)}</strong><span className={`text-[9px] font-black uppercase tracking-wider ${product.stockStatus === 'OUT_OF_STOCK' ? 'text-red-600' : 'text-emerald-700'}`}>{product.stockStatus === 'OUT_OF_STOCK' ? 'Indisponible' : 'Disponible'}</span></div></div></article>)}
      </div>
    ) : <EmptyContent label="Produits" />;

    if (page === 'promotions') return home.promotions.length ? (
      <div className="grid gap-6 lg:grid-cols-2">{home.promotions.map((promotion, index) => <article key={promotion.id} className="grid min-h-[420px] overflow-hidden bg-[#673de6] text-white shadow-[0_24px_70px_-36px_rgba(103,61,230,0.9)] sm:grid-cols-[1fr_42%]"><div className="flex flex-col justify-between p-7 sm:p-9"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#fbbf24]">Promotion en cours</p><h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">{promotion.name}</h2><p className="mt-3 text-sm leading-6 text-white/75">{promotion.description}</p></div><div>{promotion.promo_code && <span className="inline-block border border-white/25 bg-white/10 px-4 py-2 font-mono text-sm font-bold">Code : {promotion.promo_code}</span>}</div></div><img src={mediaSource(promotion.image, index % 2 ? heroFemme : heroEnfants)} alt="" className="h-60 w-full object-cover sm:h-full" /></article>)}</div>
    ) : <EmptyContent label="Promotions" />;

    if (page === 'stories') return home.stories.length ? (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{home.stories.map((story) => <article key={story.id} className="group relative min-h-[500px] overflow-hidden bg-[#24104f] text-white"><img src={mediaSource(story.media_url, heroFemme)} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-black/20" /><div className="absolute inset-x-0 bottom-0 p-6"><h2 className="text-2xl font-black leading-tight">{story.title}</h2><p className="mt-2 text-sm leading-6 text-white/75">{story.description}</p>{story.cta && <span className="mt-4 inline-block border-b border-[#fbbf24] pb-1 text-xs font-black uppercase tracking-widest">{story.cta}</span>}</div></article>)}</div>
    ) : <EmptyContent label="Stories" />;

    return home.news.length ? (
      <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">{home.news.map((item) => <article key={item.id} className="border-t border-black/15 pt-5"><img src={mediaSource(item.image, heroHomme)} alt="" className="aspect-[16/10] w-full object-cover" /><p className="mt-5 text-[10px] font-black uppercase tracking-[0.16em] text-[#673de6]">{String(item.category || 'AYROVI').replaceAll('_', ' ')}</p><h2 className="mt-2 text-2xl font-black tracking-tight text-[#17131f]">{item.title}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{item.summary}</p><p className="mt-4 text-xs font-bold text-slate-400">{item.author}</p></article>)}</div>
    ) : <EmptyContent label="Actualités" />;
  };

  return (
    <>
      <section id="arrivages" className="border-y border-black/10 bg-white" aria-label="Catégories AYROVI">
        <nav className="mx-auto max-w-7xl overflow-x-auto px-5 py-7 [scrollbar-width:none] sm:px-8 sm:py-10 [&::-webkit-scrollbar]:hidden" aria-label="Contenus AYROVI">
          <div className="flex w-max items-center gap-10 sm:gap-14 lg:mx-auto lg:gap-16">
            {pageDefinitions.map((definition) => (
              <button
                key={definition.id}
                type="button"
                onClick={() => setActivePage(definition.id)}
                aria-label={`Ouvrir ${definition.label}`}
                className="shrink-0 bg-transparent p-0 text-2xl font-black tracking-[-0.03em] text-[#050505] [font-weight:950] transition-colors hover:text-[#673de6] focus-visible:text-[#673de6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-[#673de6] sm:text-3xl lg:text-[2rem]"
              >
                {definition.label}
              </button>
            ))}
          </div>
        </nav>
      </section>

      {activePage && activeDefinition && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#f7f5fb]" role="dialog" aria-modal="true" aria-labelledby={`cms-page-${activePage}`}>
          <header className="sticky top-0 z-20 border-b border-black/10 bg-white/95 backdrop-blur-xl">
            <div className="h-1 w-full bg-[#fbbf24]" />
            <div className="mx-auto grid h-16 max-w-7xl grid-cols-[52px_1fr_52px] items-center px-3 sm:h-20 sm:grid-cols-[70px_1fr_70px] sm:px-8">
              <button type="button" autoFocus onClick={() => setActivePage(null)} aria-label={`Fermer ${activeDefinition.label}`} className="grid h-11 w-11 place-items-center border border-[#ded8eb] bg-white text-[#17131f] transition hover:border-[#673de6] hover:bg-[#673de6] hover:text-white"><X className="h-5 w-5" /></button>
              <div className="flex items-center justify-center gap-2.5 text-[#17131f]"><span className="text-[#673de6]"><FigLogoIcon className="h-8 w-8 sm:h-9 sm:w-9" /></span><strong className="text-2xl font-black tracking-tight sm:text-3xl">AYROVI</strong></div>
              <span className="justify-self-end text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 sm:text-[10px]">{String(pageDefinitions.findIndex((page) => page.id === activePage) + 1).padStart(2, '0')} / {String(pageDefinitions.length).padStart(2, '0')}</span>
            </div>
          </header>
          <main className="mx-auto min-h-[calc(100dvh-5rem)] max-w-7xl px-5 py-10 sm:px-8 sm:py-16">
            <PageIntro definition={activeDefinition} count={pageData[activePage].length} />
            <div className="pt-8 sm:pt-12">{renderPageContent(activePage)}</div>
          </main>
        </div>
      )}
    </>
  );
};
