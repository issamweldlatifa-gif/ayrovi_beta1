import React, { useEffect, useRef, useState } from 'react';
import { getPublicHome } from '../services/publicApi';
import { useNavigationHistory } from '../navigation/NavigationHistory';
import heroHomme from '../assets/hero-homme.jpg';
import heroFemme from '../assets/hero-femme.jpg';
import heroEnfants from '../assets/hero-enfants.jpg';

/**
 * DISCOVERY HUB — منطقة اكتشاف واحدة ديناميكية تحت البطاقة البرتقالية
 * (فجوة مقصودة 56px فوقها). خلفية الصفحة البيضاء كما هي.
 * أربعة أبعاد مختلفة: منتجات / عرض / مجتمع / تحريري — Preview فقط ثم Explore.
 */

interface HomeData { arrivals: any[]; products: any[]; promotions: any[]; stories: any[]; news: any[]; }

const TABS = [
  { key: 'arrivages', label: 'ARRIVAGES', target: 'arrivals' },
  { key: 'promotions', label: 'PROMOTIONS', target: 'promotions' },
  { key: 'communaute', label: 'COMMUNAUTÉ AYROVI', target: 'stories' },
  { key: 'magazine', label: 'MAGAZINE AYROVI', target: 'news' },
] as const;

const media = (value: unknown, fallback: string) => String(value || fallback);

const Cta: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-bold text-[#FF7A00] transition-colors hover:text-[#e56a00]">
    {children}
  </button>
);

export const DiscoveryHub: React.FC = () => {
  const navigation = useNavigationHistory();
  const [home, setHome] = useState<HomeData | null>(null);
  const [active, setActive] = useState<string>('arrivages');
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    getPublicHome()
      .then((payload) => { if (!cancelled && payload.success && payload.data) setHome(payload.data as HomeData); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = TABS.findIndex((tab) => tab.key === active);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else return;
    event.preventDefault();
    const key = TABS[next].key;
    setActive(key);
    refs.current[key]?.focus();
    refs.current[key]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  const open = (target: string) => navigation.navigate([{ id: `cms:${target}` }]);
  const products = (home?.products || []).slice(0, 3);
  const promo = home?.promotions?.[0];
  const stories = (home?.stories || []).slice(0, 4);
  const article = home?.news?.[0];

  return (
    <section aria-label="Discovery AYROVI" className="mx-5 mt-14 sm:mx-6 lg:mx-auto lg:mt-16 lg:max-w-7xl lg:px-8">
      {/* مقدمة تحريرية مضغوطة */}
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#FF7A00]">DISCOVERY</p>
      <h2 className="mt-1.5 text-[22px] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[26px]">Ce qui mérite votre attention.</h2>

      {/* التبويبات: سطر واحد، تمرير أفقي بلا scrollbar، خط برتقالي للنشط */}
      <div role="tablist" aria-label="Discovery AYROVI" onKeyDown={onKeyDown} className="no-scrollbar -mx-5 mt-6 flex gap-6 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            ref={(el) => { refs.current[tab.key] = el; }}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            tabIndex={active === tab.key ? 0 : -1}
            onClick={() => setActive(tab.key)}
            className={`relative shrink-0 whitespace-nowrap pb-2.5 text-[12.5px] font-bold tracking-[0.02em] transition-colors sm:text-[13.5px] ${active === tab.key ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            {tab.label}
            <span aria-hidden className={`absolute inset-x-0 bottom-0 h-[2.5px] rounded-full transition-opacity duration-300 ${active === tab.key ? 'bg-[#FF7A00] opacity-100' : 'opacity-0'}`} />
          </button>
        ))}
      </div>

      {/* منطقة المحتوى الديناميكية — المعاينة النشطة فقط */}
      <div className="discovery-panel mt-6" key={active} role="tabpanel" aria-label={TABS.find((tab) => tab.key === active)?.label}>

        {/* ARRIVAGES — اكتشاف منتجات: صف صور مضغوط */}
        {active === 'arrivages' && (
          <div>
            <div className="grid grid-cols-3 gap-3">
              {(products.length ? products : [{ id: 'f1', image: heroFemme }, { id: 'f2', image: heroHomme }, { id: 'f3', image: heroEnfants }]).map((product: any, index: number) => (
                <div key={product.id || index} className="overflow-hidden rounded-2xl border border-line bg-white">
                  <img src={media(product.image, heroFemme)} alt={product.name || ''} className="aspect-[4/5] w-full object-cover" loading={index === 0 ? 'eager' : 'lazy'} />
                </div>
              ))}
            </div>
            <h3 className="mt-5 text-[20px] font-bold leading-snug tracking-[-0.01em] text-ink sm:text-[24px]">Les nouveautés viennent d’arriver.</h3>
            <p className="mt-2 max-w-lg text-[14px] leading-[1.6] text-muted sm:text-[15px]">Découvrez une sélection de produits récemment disponibles.</p>
            <Cta onClick={() => open('arrivals')}>Explorer les arrivages →</Cta>
          </div>
        )}

        {/* PROMOTIONS — عرض واحد مضغوط (معالجة مختلفة تماماً) */}
        {active === 'promotions' && (
          <div className="overflow-hidden rounded-[20px] border border-line bg-white">
            <div className="relative">
              <img src={media(promo?.image, heroHomme)} alt={promo?.name || 'Offre du moment'} className="aspect-[16/9] w-full object-cover" loading="lazy" />
              <span className="absolute bottom-3 start-3 rounded-full bg-[#FF7A00] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">OFFRE DU MOMENT</span>
            </div>
            <div className="p-5">
              <h3 className="text-[18px] font-bold leading-snug text-ink sm:text-[21px]">{promo?.name || 'Les offres AYROVI'}</h3>
              {promo?.description && <p className="mt-1.5 text-[13.5px] leading-[1.55] text-muted sm:text-sm">{String(promo.description).slice(0, 110)}</p>}
              {promo?.ends_at && <p className="mt-2 text-[11.5px] font-semibold text-muted">Jusqu’au {new Date(promo.ends_at).toLocaleDateString('fr-TN')}</p>}
              <Cta onClick={() => open('promotions')}>Explorer les promotions →</Cta>
            </div>
          </div>
        )}

        {/* COMMUNAUTÉ — بطاقات Reels رأسية (نظام الستوريز القائم) */}
        {active === 'communaute' && (
          <div>
            <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 sm:mx-0 sm:px-0">
              {(stories.length ? stories : [{ id: 'r1', media_url: heroFemme, title: 'Sélection communauté' }, { id: 'r2', media_url: heroHomme, title: 'Découverte' }, { id: 'r3', media_url: heroEnfants, title: 'Style du jour' }]).map((story: any, index: number) => (
                <div key={story.id || index} className="relative aspect-[9/16] w-[44%] shrink-0 overflow-hidden rounded-[18px] bg-[#111217] sm:w-[200px]">
                  <img src={media(story.media_url, heroFemme)} alt={story.title || ''} className="absolute inset-0 h-full w-full object-cover" loading={index === 0 ? 'eager' : 'lazy'} />
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <span aria-hidden className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-lg text-ink">▶</span>
                  {story.title && <p className="absolute inset-x-0 bottom-0 line-clamp-2 p-3 text-[11.5px] font-bold leading-snug text-white">{story.title}</p>}
                </div>
              ))}
            </div>
            <h3 className="mt-5 text-[20px] font-bold leading-snug tracking-[-0.01em] text-ink sm:text-[24px]">Ce que la communauté découvre.</h3>
            <Cta onClick={() => open('stories')}>Découvrir la communauté →</Cta>
          </div>
        )}

        {/* MAGAZINE — قصة تحريرية بعرض كامل */}
        {active === 'magazine' && (
          <div className="relative overflow-hidden rounded-[20px] bg-[#111217]">
            <img src={media(article?.image, heroFemme)} alt={article?.title || 'Magazine AYROVI'} className="aspect-[4/3] w-full object-cover opacity-95 sm:aspect-[21/10]" loading="lazy" />
            <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/5" />
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
              <span className="text-[10.5px] font-black uppercase tracking-[0.2em] text-[#FF7A00]">{article?.category || 'STYLE'}</span>
              <h3 className="mt-1.5 max-w-xl text-[20px] font-bold leading-snug text-white sm:text-[26px]">{article?.title || 'Les tendances qui méritent votre attention.'}</h3>
              <p className="mt-2 max-w-lg text-[12.5px] leading-relaxed text-white/80 sm:text-[14px]">{article?.summary || 'Découvrez les inspirations et nouveautés sélectionnées par AYROVI.'}</p>
              <button type="button" onClick={() => open('news')} className="mt-3.5 inline-flex items-center gap-1.5 text-[14.5px] font-bold text-white transition-colors hover:text-[#FF7A00]">
                Explorer le magazine →
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
