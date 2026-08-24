import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from './QatafoIcons';
import { getPublicHome } from '../services/publicApi';
import { useNavigationHistory } from '../navigation/NavigationHistory';

/**
 * DISCOVERY TABS — منطقة اكتشاف ديناميكية واحدة (وليست 4 أقسام طويلة)
 * كل Tab له تخطيط مختلف جذرياً:
 *  - Arrivages: اكتشاف منتجات بصورة رئيسية
 *  - Promotions: سلايدر حملات
 *  - Communauté AYROVI: بطاقات Reels بنسبة 9:16
 *  - Magazine AYOVI: قصة تحريرية بعرض كامل
 * الصفحة الرئيسية تعرض Preview فقط — التجربة الكاملة في صفحات CMS القائمة.
 */

interface HomeData { arrivals: any[]; products: any[]; promotions: any[]; stories: any[]; news: any[]; }

const FALLBACK_ARRIVAL_IMAGE = '/media/hero-default.jpg';

const mediaSource = (value: unknown, fallback: string) => String(value || fallback);

export const DiscoveryTabs: React.FC = () => {
  const navigation = useNavigationHistory();
  const [home, setHome] = useState<HomeData | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicHome()
      .then((payload) => { if (!cancelled && payload.success && payload.data) setHome(payload.data as HomeData); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // التبويبات المتاحة: تخفى تلقائياً إن لم يكن لها محتوى (باستثناء Arrivages الافتراضي)
  const tabs = useMemo(() => {
    const list: Array<{ key: string; label: string; target: string }> = [
      { key: 'arrivages', label: 'Arrivages', target: 'arrivals' },
      { key: 'promotions', label: 'Promotions', target: 'promotions' },
      { key: 'communaute', label: 'Communauté AYROVI', target: 'stories' },
      { key: 'magazine', label: 'Magazine AYROVI', target: 'news' },
    ];
    return list.filter((tab) => {
      if (tab.key === 'arrivages') return true;
      if (tab.key === 'promotions') return Boolean(home?.promotions?.length);
      if (tab.key === 'communaute') return Boolean(home?.stories?.length);
      if (tab.key === 'magazine') return Boolean(home?.news?.length);
      return false;
    });
  }, [home]);

  const [activeKey, setActiveKey] = useState('arrivages');
  const active = tabs.find((tab) => tab.key === activeKey) ? activeKey : (tabs[0]?.key || 'arrivages');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tablistRef = useRef<HTMLDivElement>(null);

  // لوحة المفاتيح: أسهم يمين/يسار + Enter/Space (semantics)
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!tabs.length) return;
    const index = tabs.findIndex((tab) => tab.key === active);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else return;
    event.preventDefault();
    const key = tabs[next].key;
    setActiveKey(key);
    tabRefs.current[key]?.focus();
  };

  const openCms = (target: string) => navigation.navigate([{ id: `cms:${target}` }]);

  return (
    <section aria-label="Découvrir AYROVI" className="mx-5 mt-10 sm:mx-6 lg:mx-auto lg:mt-14 lg:max-w-7xl lg:px-8">
      {/* ===== TABS — سطر واحد، تمرير أفقي على الموبايل بلا scrollbar ===== */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Découverte AYROVI"
        onKeyDown={onKeyDown}
        className="no-scrollbar -mx-1 flex gap-6 overflow-x-auto px-1 pb-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            ref={(el) => { tabRefs.current[tab.key] = el; }}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            tabIndex={active === tab.key ? 0 : -1}
            onClick={() => setActiveKey(tab.key)}
            className={`relative shrink-0 whitespace-nowrap pb-2.5 text-[13px] font-bold tracking-[0.02em] transition-colors sm:text-sm ${active === tab.key ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            {tab.label.toUpperCase()}
            <span aria-hidden className={`absolute inset-x-0 bottom-0 h-[2.5px] rounded-full transition-opacity duration-300 ${active === tab.key ? 'bg-[#FF7A00] opacity-100' : 'opacity-0'}`} />
          </button>
        ))}
      </div>

      {/* ===== المحتوى النشط — fade + translate خفيف ===== */}
      <div className="discovery-panel mt-6" key={active} role="tabpanel" aria-label={tabs.find((tab) => tab.key === active)?.label}>
        {active === 'arrivages' && <ArrivagesPanel home={home} onExplore={() => openCms('arrivals')} />}
        {active === 'promotions' && <PromotionsPanel promotions={home?.promotions || []} onExplore={() => openCms('promotions')} />}
        {active === 'communaute' && <CommunityPanel stories={(home?.stories || []).slice(0, 8)} onExplore={() => openCms('stories')} />}
        {active === 'magazine' && <MagazinePanel article={home?.news?.[0]} onExplore={() => openCms('news')} />}
      </div>
    </section>
  );
};

const CtaLink: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-bold text-[#FF7A00] transition hover:text-[#e56a00]">
    {children}
  </button>
);

/* ================= TAB 1 — ARRIVAGES: Product Discovery ================= */
const ArrivagesPanel: React.FC<{ home: HomeData | null; onExplore: () => void }> = ({ home, onExplore }) => {
  const arrival = home?.arrivals?.[0];
  const highlights = (home?.products || []).slice(0, 3);
  const image = mediaSource(arrival?.main_image, FALLBACK_ARRIVAL_IMAGE);
  return (
    <div className="lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-10">
      <div className="relative overflow-hidden rounded-[20px] bg-[#1b1c23]">
        <img src={image} alt={arrival?.name || 'Arrivages AYROVI'} className="aspect-[16/10] w-full object-cover" loading="lazy" />
      </div>
      <div className="mt-5 lg:mt-0">
        <h3 className="text-[24px] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[28px] lg:text-[32px]">Les nouveautés viennent d’arriver.</h3>
        <p className="mt-3 text-[15px] leading-[1.6] text-muted sm:text-base">Découvrez une sélection de produits récemment disponibles auprès de vos boutiques préférées.</p>
        {highlights.length > 0 && (
          <div className="mt-5 flex gap-3">
            {highlights.map((product: any) => (
              <div key={product.id} className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-white">
                <img src={mediaSource(product.image, FALLBACK_ARRIVAL_IMAGE)} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                <p className="truncate px-2.5 py-2 text-[11px] font-bold text-ink">{product.name}</p>
              </div>
            ))}
          </div>
        )}
        <CtaLink onClick={onExplore}>Explorer les arrivages →</CtaLink>
      </div>
    </div>
  );
};

/* ================= TAB 2 — PROMOTIONS: Campaign Slider ================= */
const PromotionsPanel: React.FC<{ promotions: any[]; onExplore: () => void }> = ({ promotions, onExplore }) => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = Math.max(promotions.length, 1);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (paused || reduced || promotions.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % count), 6000);
    return () => window.clearInterval(timer);
  }, [paused, count, promotions.length, reduced]);

  if (!promotions.length) return null;
  const promo = promotions[index % promotions.length];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div className="relative overflow-hidden rounded-[20px] bg-[#111217]">
        <img key={promo.id} src={mediaSource(promo.image, FALLBACK_ARRIVAL_IMAGE)} alt={promo.name} className="discovery-fade aspect-[16/9] w-full object-cover opacity-90 sm:aspect-[21/9]" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" aria-hidden />
        <div className="discovery-fade absolute inset-x-0 bottom-0 p-5 sm:p-7" key={`${promo.id}-copy`}>
          {promo.badge && <span className="mb-2 inline-block rounded-full bg-[#FF7A00] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">{promo.badge}</span>}
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{promo.name}</p>
          <h3 className="mt-1 max-w-xl text-[20px] font-bold leading-snug text-white sm:text-2xl">{promo.name}</h3>
          {promo.description && <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-white/80 sm:text-sm">{String(promo.description).slice(0, 120)}</p>}
          {(promo.starts_at || promo.ends_at) && (
            <p className="mt-2 text-[11px] font-semibold text-white/60">{promo.starts_at ? new Date(promo.starts_at).toLocaleDateString('fr-TN') : ''} → {promo.ends_at ? new Date(promo.ends_at).toLocaleDateString('fr-TN') : ''}</p>
          )}
        </div>
        {promotions.length > 1 && (
          <>
            <button type="button" onClick={() => setIndex((index - 1 + count) % count)} aria-label="Campagne précédente" className="absolute start-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60 sm:grid">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => setIndex((index + 1) % count)} aria-label="Campagne suivante" className="absolute end-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60 sm:grid">
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
      {promotions.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
          {promotions.map((_, dot) => (
            <button key={dot} type="button" onClick={() => setIndex(dot)} className={`h-1.5 rounded-full transition-all ${dot === index % count ? 'w-5 bg-[#FF7A00]' : 'w-1.5 bg-line'}`} aria-label={`Campagne ${dot + 1}`} />
          ))}
        </div>
      )}
      <CtaLink onClick={onExplore}>Explorer les promotions →</CtaLink>
    </div>
  );
};

/* ================= TAB 3 — COMMUNAUTÉ: Reels 9:16 ================= */
const CommunityPanel: React.FC<{ stories: any[]; onExplore: () => void }> = ({ stories, onExplore }) => (
  <div>
    <h3 className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[26px]">Communauté AYROVI</h3>
    <p className="mt-2 max-w-xl text-[15px] leading-[1.6] text-muted">Découvrez les sélections, découvertes et expériences partagées par la communauté AYROVI.</p>
    <div className="no-scrollbar -mx-5 mt-5 flex gap-3 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      {stories.map((story: any) => (
        <div key={story.id} className="relative aspect-[9/16] w-[46%] shrink-0 overflow-hidden rounded-[18px] bg-[#111217] sm:w-[220px]">
          <img src={mediaSource(story.media_url, FALLBACK_ARRIVAL_IMAGE)} alt={story.title} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
          <span aria-hidden className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink text-lg font-black">▶</span>
          {story.title && <p className="absolute inset-x-0 bottom-0 line-clamp-2 p-3 text-[12px] font-bold leading-snug text-white">{story.title}</p>}
        </div>
      ))}
    </div>
    <CtaLink onClick={onExplore}>Découvrir la communauté →</CtaLink>
  </div>
);

/* ================= TAB 4 — MAGAZINE: Editorial Feature ================= */
const MagazinePanel: React.FC<{ article: any; onExplore: () => void }> = ({ article, onExplore }) => {
  if (!article) return null;
  return (
    <div className="relative overflow-hidden rounded-[20px] bg-[#111217]">
      <img src={mediaSource(article.image, FALLBACK_ARRIVAL_IMAGE)} alt={article.title} className="aspect-[4/5] w-full object-cover opacity-95 sm:aspect-[21/10] lg:aspect-[21/9]" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 lg:p-10">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#FF7A00]">{article.category || 'Magazine AYROVI'}</span>
        <h3 className="mt-2 max-w-2xl text-[22px] font-bold leading-snug text-white sm:text-3xl lg:text-4xl">{article.title}</h3>
        {article.summary && <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-white/80 sm:text-[15px]">{String(article.summary).slice(0, 140)}</p>}
        <button type="button" onClick={onExplore} className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-bold text-white transition hover:text-[#FF7A00]">
          Explorer le magazine →
        </button>
      </div>
    </div>
  );
};
