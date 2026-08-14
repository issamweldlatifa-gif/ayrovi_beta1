import React, { useEffect, useMemo, useState } from 'react';
import heroHomme from '../assets/hero-homme.jpg';
import heroFemme from '../assets/hero-femme.jpg';
import heroEnfants from '../assets/hero-enfants.jpg';
import { ArrowRight, ShoppingBag, Tag, Package } from '../components/QatafoIcons';
import type { CatalogProduct } from './types';

/* ------------------------------------------------------------------ */
/* Médias & formats partagés                                           */
/* ------------------------------------------------------------------ */

const localMedia: Record<string, string> = {
  '/media/hero-homme.jpg': heroHomme,
  '/media/hero-femme.jpg': heroFemme,
  '/media/hero-enfants.jpg': heroEnfants,
};

export const mediaSource = (value: unknown, fallback: string = heroFemme) =>
  localMedia[String(value || '')] || (String(value || '').startsWith('http') ? String(value) : fallback);

export const pad = (value: number) => String(Math.max(0, value)).padStart(2, '0');

export const formatPrice = (value: unknown) =>
  `${Number(value || 0).toLocaleString('fr-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;

export const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase();
};

/* ------------------------------------------------------------------ */
/* Compte à rebours temps réel (jamais statique)                        */
/* ------------------------------------------------------------------ */

export function useNow(serverOffset: number): number {
  const [now, setNow] = useState(() => Date.now() + serverOffset);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + serverOffset), 1000);
    return () => window.clearInterval(timer);
  }, [serverOffset]);
  return now;
}

export function countdownParts(target: string, now: number) {
  const targetTime = new Date(target).getTime();
  const totalSeconds = Math.max(0, Math.floor((targetTime - now) / 1000));
  return {
    expired: targetTime <= now,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export const CountdownBlocks: React.FC<{ target: string; now: number; tone?: 'dark' | 'light' }> = ({ target, now, tone = 'dark' }) => {
  const parts = countdownParts(target, now);
  const cell = tone === 'dark'
    ? 'bg-white/10 backdrop-blur-sm text-white'
    : 'bg-ink text-white';
  if (parts.expired) {
    return <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-accent">Arrivage en cours de livraison</p>;
  }
  return (
    <div className="mt-5 flex gap-2" role="timer" aria-label={`Compte à rebours : ${parts.days} jours ${parts.hours} heures ${parts.minutes} minutes`}>
      {([[parts.days, 'J'], [parts.hours, 'H'], [parts.minutes, 'MIN'], [parts.seconds, 'SEC']] as const).map(([value, label]) => (
        <div key={label} className={`min-w-12 px-2 py-2 text-center ${cell}`}>
          <strong className="block text-lg font-black tabular-nums leading-none">{pad(value)}</strong>
          <span className="mt-1 block text-[8px] font-black uppercase tracking-[0.16em] opacity-60">{label}</span>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Intro de page : compteur contextuel (jamais "contenus publiés")     */
/* ------------------------------------------------------------------ */

export const PageIntro: React.FC<{ eyebrow: string; title: string; description: string; count: number; countLabel: string }> = ({
  eyebrow, title, description, count, countLabel,
}) => (
  <div className="grid gap-8 border-b border-black/10 pb-10 sm:grid-cols-[1fr_auto] sm:items-end sm:pb-14">
    <div>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-brand">{eyebrow}</p>
      <h1 className="mt-3 text-5xl font-black leading-[0.9] tracking-[-0.055em] text-ink sm:text-7xl">{title}</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted">{description}</p>
    </div>
    <div className="flex items-end gap-3">
      <strong className="text-5xl font-black tabular-nums text-brand">{pad(count)}</strong>
      <span className="max-w-28 pb-1 text-[10px] font-black uppercase leading-4 tracking-[0.18em] text-muted">{countLabel}</span>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* États vide / chargement / erreur                                    */
/* ------------------------------------------------------------------ */

export const EmptyState: React.FC<{ title: string; text: string }> = ({ title, text }) => (
  <div className="border border-black/10 bg-white px-6 py-20 text-center">
    <span className="mx-auto grid h-14 w-14 place-items-center bg-brand/10 text-brand"><Package className="h-6 w-6" /></span>
    <h2 className="mt-5 text-2xl font-black text-ink">{title}</h2>
    <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">{text}</p>
  </div>
);

export const LoadingSkeleton: React.FC<{ cards?: number }> = ({ cards = 2 }) => (
  <div className="grid gap-5 sm:grid-cols-2" aria-busy="true" aria-label="Chargement du contenu">
    {Array.from({ length: cards }).map((_, index) => (
      <div key={index} className="h-96 animate-pulse bg-brand-light/20" />
    ))}
  </div>
);

export const ErrorState: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <div className="border border-red-200 bg-red-50 px-6 py-16 text-center">
    <h2 className="text-xl font-black text-red-700">Le contenu n’a pas pu être chargé.</h2>
    <p className="mt-2 text-sm text-red-600">Vérifiez votre connexion puis réessayez.</p>
    {onRetry && (
      <button type="button" onClick={onRetry} className="mt-6 bg-ink px-6 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-brand">
        Réessayer
      </button>
    )}
  </div>
);

/* ------------------------------------------------------------------ */
/* Section "Comment ça marche" (Arrivages)                             */
/* ------------------------------------------------------------------ */

const STEPS = [
  { index: '01', title: 'Choisissez', text: 'Découvrez la sélection disponible.' },
  { index: '02', title: 'Commandez', text: 'Envoyez votre demande à AYROVI.' },
  { index: '03', title: 'Recevez', text: 'Suivez votre commande jusqu’à son arrivée.' },
];

export const StepsSection: React.FC = () => (
  <section className="mt-14 border-t border-black/10 pt-10 sm:mt-20 sm:pt-14" aria-label="Comment ça marche">
    <p className="text-xs font-black uppercase tracking-[0.22em] text-brand">Comment ça marche</p>
    <h2 className="mt-3 text-3xl font-black tracking-tight text-ink sm:text-4xl">Préparez votre commande</h2>
    <div className="mt-8 grid gap-5 sm:grid-cols-3">
      {STEPS.map((step) => (
        <div key={step.index} className="border border-black/10 bg-white p-6">
          <span className="text-4xl font-black text-brand/20">{step.index}</span>
          <h3 className="mt-3 text-lg font-black text-ink">{step.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{step.text}</p>
        </div>
      ))}
    </div>
  </section>
);

/* ------------------------------------------------------------------ */
/* CTA final de page                                                   */
/* ------------------------------------------------------------------ */

export const CtaSection: React.FC<{ title: string; description?: string; button: string; onClick: () => void; icon?: 'bag' | 'tag' }> = ({
  title, description, button, onClick, icon = 'bag',
}) => (
  <section className="mt-14 bg-ink px-6 py-14 text-center text-white sm:mt-20 sm:py-20">
    <h2 className="mx-auto max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">{title}</h2>
    {description && <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/70">{description}</p>}
    <button
      type="button"
      onClick={onClick}
      className="mt-8 inline-flex min-h-12 items-center gap-2.5 bg-accent px-8 text-xs font-black uppercase tracking-[0.18em] text-ink transition hover:bg-white active:scale-95"
    >
      {icon === 'bag' ? <ShoppingBag className="h-4 w-4" /> : <Tag className="h-4 w-4" />}
      {button}
    </button>
  </section>
);

/* ------------------------------------------------------------------ */
/* Carte produit du catalogue (sélection d'un arrivage)                */
/* ------------------------------------------------------------------ */

export const ProductCard: React.FC<{ product: CatalogProduct; onOrder: (product: CatalogProduct) => void }> = ({ product, onOrder }) => (
  <article className="flex flex-col overflow-hidden border border-black/10 bg-white">
    <div className="aspect-[4/5] overflow-hidden bg-surface">
      <img src={mediaSource(product.image)} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-700 hover:scale-105" />
    </div>
    <div className="flex flex-1 flex-col p-4 sm:p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand">{product.brandName || product.sourcePlatform}</p>
      <h3 className="mt-1.5 line-clamp-2 text-sm font-black text-ink sm:text-base">{product.name}</h3>
      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <strong className="text-base font-black text-brand-dark">{formatPrice(product.finalPrice)}</strong>
        <button
          type="button"
          onClick={() => onOrder(product)}
          className="inline-flex min-h-10 items-center gap-1.5 bg-ink px-4 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-brand active:scale-95"
        >
          Commander<ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </article>
);

/* ------------------------------------------------------------------ */
/* Copie de code promo avec retour visuel                              */
/* ------------------------------------------------------------------ */

export function useCopyFeedback(timeout = 2000) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useMemo(() => async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement('textarea');
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(value);
    window.setTimeout(() => setCopied((current) => (current === value ? null : current)), timeout);
  }, [timeout]);
  return { copied, copy };
}
