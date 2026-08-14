import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowLeft, Check, Copy, Calendar, User } from '../components/QatafoIcons';
import {
  CountdownBlocks, CtaSection, EmptyState, ProductCard, StepsSection, formatDate,
  mediaSource, useCopyFeedback,
} from './components';
import type { ArrivalItem, CatalogProduct, ContentActions, NewsItem, PromotionItem, StoryItem } from './types';

const CATEGORY_LABELS: Record<string, string> = {
  NEW_ARRIVAL: 'Nouvel arrivage', NEW_BRAND: 'Nouvelle marque', PROMOTION: 'Promotion',
  DELIVERY: 'Livraison', AYROVI: 'Plateforme', INFORMATION: 'Information', OTHER: 'AYROVI',
};

/* ------------------------------------------------------------------ */
/* ARRIVAGES — conversion + countdown                                  */
/* ------------------------------------------------------------------ */

const ArrivalSelection: React.FC<{ arrival: ArrivalItem; actions: ContentActions }> = ({ arrival, actions }) => {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetch(`/api/public/products?arrivalId=${encodeURIComponent(arrival.id)}&limit=12`)
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled) return;
        if (!payload?.success) throw new Error('fetch');
        setProducts(Array.isArray(payload.data) ? payload.data : []);
        setState('ready');
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [arrival.id]);

  return (
    <div className="border-t-2 border-accent bg-white p-5 sm:p-7">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">Sélection {arrival.name}</p>
      {state === 'loading' && <div className="mt-4 grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-64 animate-pulse bg-brand-light/20" />)}</div>}
      {state === 'error' && <p className="mt-4 text-sm font-bold text-red-600">La sélection n’a pas pu être chargée.</p>}
      {state === 'ready' && !products.length && (
        <p className="mt-4 text-sm leading-6 text-muted">La sélection sera publiée à l’ouverture de l’arrivage. Préparez vos liens avec Lens en attendant.</p>
      )}
      {state === 'ready' && products.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {products.map((product) => <ProductCard key={product.id} product={product} onOrder={actions.onOrderProduct} />)}
        </div>
      )}
    </div>
  );
};

export const ArrivagesPage: React.FC<{
  arrivals: ArrivalItem[]; now: number; actions: ContentActions; initialArrivalId?: string | null;
}> = ({ arrivals, now, actions, initialArrivalId }) => {
  const sorted = useMemo(() => [...arrivals].sort((a, b) => (a.type === b.type
    ? new Date(a.expectedArrivalAt).getTime() - new Date(b.expectedArrivalAt).getTime()
    : a.type === 'EXPRESS' ? -1 : 1)), [arrivals]);
  const [openId, setOpenId] = useState<string | null>(initialArrivalId || sorted[0]?.id || null);
  useEffect(() => { if (initialArrivalId) setOpenId(initialArrivalId); }, [initialArrivalId]);
  const hero = sorted[0];
  const rest = sorted.slice(1);

  if (!hero) return <EmptyState title="Aucun arrivage à venir." text="Cette page se remplit automatiquement dès qu’un arrivage est publié depuis l’espace Admin." />;

  return (
    <div>
      {/* Hero opérationnel : premier arrivage (Express prioritaire) */}
      <article className="relative overflow-hidden bg-brand-deep text-white">
        <img src={mediaSource(hero.mainImage)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#160b30] via-brand-deep/40 to-black/10" />
        <div className="relative flex min-h-[480px] flex-col justify-end p-6 sm:min-h-[560px] sm:p-10">
          <div className="mb-auto flex items-center gap-3">
            <span className="bg-accent px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-ink">{hero.type === 'EXPRESS' ? 'Express' : 'Standard'}</span>
            {hero.badge && <span className="text-xs font-bold text-white/75">{hero.badge}</span>}
          </div>
          <h2 className="max-w-2xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">{hero.name}</h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-white/80">{hero.description}</p>
          <CountdownBlocks target={hero.expectedArrivalAt} now={now} />
          <button
            type="button"
            onClick={() => setOpenId((current) => (current === hero.id ? null : hero.id))}
            className="mt-7 inline-flex min-h-12 w-fit items-center gap-2.5 bg-accent px-7 text-xs font-black uppercase tracking-[0.18em] text-ink transition hover:bg-white active:scale-95"
          >
            Découvrir<ArrowRight className="h-4 w-4" />
          </button>
        </div>
        {openId === hero.id && <div className="relative"><ArrivalSelection arrival={hero} actions={actions} /></div>}
      </article>

      {/* Arrivages secondaires : cartes countdown */}
      {rest.length > 0 && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {rest.map((arrival) => (
            <article key={arrival.id} className="border border-black/10 bg-white">
              <div className="p-6 sm:p-8">
                <div className="flex items-center justify-between gap-3">
                  <span className="bg-ink px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white">{arrival.type === 'EXPRESS' ? 'Express' : 'Standard'}</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">{formatDate(arrival.expectedArrivalAt)}</span>
                </div>
                <h3 className="mt-4 text-2xl font-black tracking-tight text-ink sm:text-3xl">{arrival.name}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{arrival.description}</p>
                <CountdownBlocks target={arrival.expectedArrivalAt} now={now} tone="light" />
                <button
                  type="button"
                  onClick={() => setOpenId((current) => (current === arrival.id ? null : arrival.id))}
                  className="mt-6 inline-flex min-h-11 items-center gap-2 border border-ink px-5 text-[10px] font-black uppercase tracking-widest text-ink transition hover:bg-ink hover:text-white active:scale-95"
                >
                  Voir la sélection<ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              {openId === arrival.id && <ArrivalSelection arrival={arrival} actions={actions} />}
            </article>
          ))}
        </div>
      )}

      <StepsSection />
      <CtaSection
        title="Prêt pour le prochain arrivage ?"
        button="Découvrir les sélections"
        onClick={() => setOpenId(hero.id)}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* PROMOTIONS — offre + discount + CTA                                 */
/* ------------------------------------------------------------------ */

const discountLabel = (promo: PromotionItem) =>
  promo.discount_type === 'PERCENTAGE' ? `-${Math.round(promo.value)}%` : `-${Number(promo.value).toFixed(2)} DT`;

const PromoCodeChip: React.FC<{ code: string; tone?: 'light' | 'dark' }> = ({ code, tone = 'dark' }) => {
  const { copied, copy } = useCopyFeedback();
  const base = tone === 'dark' ? 'border-white/25 bg-white/10 text-white' : 'border-brand/30 bg-brand/5 text-brand-dark';
  return (
    <button
      type="button"
      onClick={() => void copy(code)}
      className={`inline-flex min-h-10 items-center gap-2 border px-4 font-mono text-sm font-bold transition active:scale-95 ${base}`}
      aria-label={`Copier le code ${code}`}
    >
      {copied === code ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4 opacity-70" />}
      {copied === code ? 'Code copié' : `Code : ${code}`}
    </button>
  );
};

export const PromotionsPage: React.FC<{ promotions: PromotionItem[]; now: number; actions: ContentActions }> = ({ promotions, now, actions }) => {
  const hero = promotions[0];
  const rest = promotions.slice(1);
  if (!hero) return <EmptyState title="Aucune offre active." text="Les promotions publiées depuis l’espace Admin apparaissent ici automatiquement." />;

  const profit = (promo: PromotionItem) => {
    if (promo.promo_code) void (async () => {})();
    actions.onOpenPage('arrivals', promo.arrival_ids[0] || undefined);
  };

  return (
    <div>
      {/* Hero commercial */}
      <article className="grid overflow-hidden bg-brand text-white lg:grid-cols-[1fr_44%]">
        <div className="flex flex-col justify-between gap-8 p-6 sm:p-10">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-accent">Promotion en cours</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">{hero.name}</h2>
            <p className="mt-6 text-7xl font-black leading-none tracking-[-0.05em] text-accent sm:text-8xl">{discountLabel(hero)}</p>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/80">{hero.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {hero.promo_code && <PromoCodeChip code={hero.promo_code} />}
            <button
              type="button"
              onClick={() => profit(hero)}
              className="inline-flex min-h-12 items-center gap-2.5 bg-accent px-7 text-xs font-black uppercase tracking-[0.18em] text-ink transition hover:bg-white active:scale-95"
            >
              Profiter de l’offre<ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <img src={mediaSource(hero.image)} alt="" className="h-64 w-full object-cover lg:h-full" />
      </article>

      {/* Bandeau validité */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border border-black/10 bg-white px-5 py-4 text-[11px] font-black uppercase tracking-[0.14em] text-muted">
        <span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4 text-brand" />Valable jusqu’au {formatDate(hero.ends_at)}</span>
        {hero.arrival_ids.length > 0 && <span>Sur la sélection liée</span>}
        {hero.promo_code && <span className="normal-case">Code : {hero.promo_code}</span>}
      </div>

      {/* Offres secondaires */}
      {rest.length > 0 && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {rest.map((promo) => (
            <article key={promo.id} className="flex flex-col border border-black/10 bg-white">
              <div className="relative h-52 overflow-hidden">
                <img src={mediaSource(promo.image)} alt="" className="h-full w-full object-cover" />
                <span className="absolute left-0 top-4 bg-accent px-3 py-1.5 text-sm font-black text-ink">{discountLabel(promo)}</span>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h3 className="text-xl font-black tracking-tight text-ink">{promo.name}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{promo.description}</p>
                <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted">Valable jusqu’au {formatDate(promo.ends_at)}</p>
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
                  {promo.promo_code && <PromoCodeChip code={promo.promo_code} tone="light" />}
                  <button
                    type="button"
                    onClick={() => profit(promo)}
                    className="inline-flex min-h-10 items-center gap-2 bg-ink px-5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-brand active:scale-95"
                  >
                    Profiter de l’offre<ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <CtaSection
        title="Une offre vous intéresse ?"
        description="Découvrez les produits éligibles et préparez votre commande."
        button="Voir la sélection"
        icon="tag"
        onClick={() => actions.onOpenPage('arrivals', hero.arrival_ids[0] || undefined)}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* STORIES — flux visuel                                               */
/* ------------------------------------------------------------------ */

const storyTarget = (story: StoryItem, actions: ContentActions) => {
  if (story.arrival_id) return actions.onOpenPage('arrivals', story.arrival_id);
  if (story.promotion_id) return actions.onOpenPage('promotions');
  if (story.target_url.includes('promotions')) return actions.onOpenPage('promotions');
  if (story.target_url.includes('news')) return actions.onOpenPage('news');
  return actions.onOpenPage('arrivals');
};

export const StoriesPage: React.FC<{ stories: StoryItem[]; now: number; actions: ContentActions }> = ({ stories, now, actions }) => {
  const hero = stories[0];
  const rest = stories.slice(1);
  if (!hero) return <EmptyState title="Aucune story publiée." text="Les stories publiées depuis l’espace Admin apparaissent ici dans un format visuel." />;

  return (
    <div>
      {/* Story héro plein cadre */}
      <article className="group relative min-h-[70svh] overflow-hidden bg-brand-deep text-white">
        <img src={mediaSource(hero.media_url)} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
          <span className="bg-accent px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-ink">{hero.category}</span>
          <h2 className="mt-4 max-w-2xl text-4xl font-black leading-[0.95] tracking-[-0.04em] sm:text-6xl">{hero.title}</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/80">{hero.description}</p>
          <button
            type="button"
            onClick={() => storyTarget(hero, actions)}
            className="mt-6 inline-flex min-h-11 items-center gap-2 border-b-2 border-accent pb-1 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:text-accent"
          >
            {hero.cta || 'Découvrir'}<ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </article>

      {/* Grille visuelle */}
      {rest.length > 0 && (
        <>
          <p className="mt-10 text-xs font-black uppercase tracking-[0.22em] text-brand">Dernières stories</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((story) => (
              <button
                key={story.id}
                type="button"
                onClick={() => storyTarget(story, actions)}
                className="group relative aspect-[3/4] overflow-hidden bg-brand-deep text-left text-white"
              >
                <img src={mediaSource(story.media_url)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/10" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">{story.category}</span>
                  <h3 className="mt-2 text-xl font-black leading-tight">{story.title}</h3>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/80 transition group-hover:text-accent">
                    {story.cta || 'Découvrir'}<ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <CtaSection
        title="Envie de voir la sélection en vrai ?"
        description="Ouvrez les arrivages et préparez votre commande avec Lens."
        button="Ouvrir les arrivages"
        onClick={() => actions.onOpenPage('arrivals')}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* ACTUALITÉS — journal éditorial + article                            */
/* ------------------------------------------------------------------ */

function useSeo(article: NewsItem | null) {
  useEffect(() => {
    const previousTitle = document.title;
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const previousDescription = meta?.content || '';
    if (article) {
      document.title = `${article.title} — AYROVI`;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        document.head.appendChild(meta);
      }
      meta.content = article.summary;
    }
    return () => {
      document.title = previousTitle;
      if (meta) meta.content = previousDescription;
    };
  }, [article]);
}

export const NewsPage: React.FC<{ news: NewsItem[]; now: number; actions: ContentActions }> = ({ news, now, actions }) => {
  const [selected, setSelected] = useState<NewsItem | null>(null);
  useSeo(selected);

  if (!news.length) return <EmptyState title="Aucun article publié." text="Le journal AYROVI se remplit automatiquement depuis l’espace Admin." />;

  if (selected) {
    const related = news.filter((item) => item.id !== selected.id && item.category === selected.category).slice(0, 2);
    return (
      <article className="mx-auto max-w-3xl">
        <button type="button" onClick={() => setSelected(null)} className="inline-flex min-h-10 items-center gap-2 text-xs font-black uppercase tracking-widest text-brand transition hover:text-brand-dark">
          <ArrowLeft className="h-4 w-4" />Toutes les actualités
        </button>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.22em] text-brand">{CATEGORY_LABELS[selected.category] || selected.category}</p>
        <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-ink sm:text-5xl">{selected.title}</h1>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-black uppercase tracking-[0.14em] text-muted">
          <span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4 text-brand" />{formatDate(selected.published_at)}</span>
          <span className="inline-flex items-center gap-2"><User className="h-4 w-4 text-brand" />{selected.author}</span>
        </div>
        <img src={mediaSource(selected.image)} alt="" className="mt-8 aspect-[16/9] w-full object-cover" />
        <div className="mt-8 space-y-5 text-base leading-8 text-ink/90">
          {selected.content.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>

        {related.length > 0 && (
          <section className="mt-12 border-t border-black/10 pt-8">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-brand">À lire aussi</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {related.map((item) => (
                <button key={item.id} type="button" onClick={() => { setSelected(item); window.scrollTo({ top: 0 }); }} className="border border-black/10 bg-white p-5 text-left transition hover:border-brand">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand">{CATEGORY_LABELS[item.category] || item.category}</p>
                  <h3 className="mt-2 text-lg font-black leading-snug text-ink">{item.title}</h3>
                  <p className="mt-2 text-xs text-muted">{formatDate(item.published_at)}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        <CtaSection
          title="Prêt pour le prochain arrivage ?"
          button="Découvrir les sélections"
          onClick={() => actions.onOpenPage('arrivals')}
        />
      </article>
    );
  }

  const featured = news[0];
  const list = news.slice(1);
  return (
    <div>
      {/* Article à la une */}
      <article className="grid overflow-hidden border border-black/10 bg-white lg:grid-cols-2">
        <img src={mediaSource(featured.image)} alt="" className="h-64 w-full object-cover lg:h-full" />
        <div className="flex flex-col justify-center p-6 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-brand">{CATEGORY_LABELS[featured.category] || featured.category}</p>
          <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">{featured.title}</h2>
          <p className="mt-4 text-sm leading-7 text-muted">{featured.summary}</p>
          <p className="mt-4 text-[11px] font-black uppercase tracking-[0.14em] text-muted">{formatDate(featured.published_at)} · {featured.author}</p>
          <button
            type="button"
            onClick={() => setSelected(featured)}
            className="mt-7 inline-flex min-h-12 w-fit items-center gap-2.5 bg-ink px-7 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-brand active:scale-95"
          >
            Lire l’article<ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </article>

      {/* Fil du journal */}
      {list.length > 0 && (
        <>
          <p className="mt-12 text-xs font-black uppercase tracking-[0.22em] text-brand">Dernières actualités</p>
          <div className="mt-4 divide-y divide-black/10 border-y border-black/10">
            {list.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelected(item)} className="group grid w-full gap-4 py-6 text-left sm:grid-cols-[110px_1fr_auto] sm:items-center">
                <time className="text-[11px] font-black uppercase tracking-[0.12em] text-muted">{formatDate(item.published_at)}</time>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand">{CATEGORY_LABELS[item.category] || item.category}</p>
                  <h3 className="mt-1.5 text-xl font-black tracking-tight text-ink transition group-hover:text-brand">{item.title}</h3>
                  <p className="mt-1.5 line-clamp-2 max-w-2xl text-sm leading-6 text-muted">{item.summary}</p>
                </div>
                <span className="hidden items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-brand sm:inline-flex">
                  Lire<ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <CtaSection
        title="Une question sur une annonce ?"
        description="L’assistant AYROVI répond en temps réel avec les informations réelles de la plateforme."
        button="Ouvrir les arrivages"
        onClick={() => actions.onOpenPage('arrivals')}
      />
    </div>
  );
};

/* Indique aux pages parentes le libellé de compteur contextuel. */
export const pageCounterLabel = (page: 'arrivals' | 'promotions' | 'stories' | 'news', count: number) => {
  if (page === 'arrivals') return count > 1 ? 'Arrivages à venir' : 'Arrivage à venir';
  if (page === 'promotions') return count > 1 ? 'Offres actives' : 'Offre active';
  if (page === 'stories') return count > 1 ? 'Stories publiées' : 'Story publiée';
  return count > 1 ? 'Articles au journal' : 'Article au journal';
};

