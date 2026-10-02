import React, { useEffect, useMemo, useState, useId } from 'react';
import { Heart, HeartFilled, Image as ImageIcon, RefreshCw } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import type { AyrovixCandidate } from '../types';
import { MerchantRating } from './MerchantRating';
import { QuietPromoPrice } from './quiet-card';
import { isComposedUrl, withIsolation } from '../services/mediaIsolation';
import { refreshLiveStock, type LiveStockResult } from '../services/lensApi';
import './lens-product-card.css';

export function lensCardCopy(candidate: AyrovixCandidate) {
  const brand = candidate.brand?.trim();
  const title = candidate.title.trim();
  let description = candidate.description?.trim() || '';
  if (brand) {
    // Remove only the actual supplied brand prefix, never infer a brand from a title.
    const afterBrand = title.toLocaleLowerCase().startsWith(brand.toLocaleLowerCase() + ' ') ? title.slice(brand.length).replace(/^\s*[-–—|:]?\s*/, '') : title;
    description = afterBrand.toLocaleLowerCase() === brand.toLocaleLowerCase() ? description : afterBrand;
  } else if (!description && candidate.model?.trim() !== title) description = candidate.model?.trim() || '';
  return { heading: brand || title, description };
}

/**
 * STOCK VIVANT SUR LA CARTE (01/10/2026) — la fiche affiche ce que la source
 * affirme. Un silence reste un silence : pas de badge « en stock » inventé, et
 * une taille que le marchand déclare indisponible est montrée barrée plutôt que
 * cachée (le client doit voir POURQUOI il ne peut pas la prendre).
 */
const AVAILABILITY_LABEL: Record<string, [string, string]> = {
  in_stock: ['En stock', 'متوفر'],
  limited: ['Stock limité', 'آخر القطع'],
  out_of_stock: ['Épuisé', 'نفدت الكمية'],
};

function StockBadge({ availability }: { availability: AyrovixCandidate['availability'] }) {
  const { tr } = useLocale();
  const label = availability ? AVAILABILITY_LABEL[availability] : undefined;
  if (!label) return null;
  return (
    <span className="lens-card-stock" data-stock={availability}>
      {tr(label[0], label[1])}
    </span>
  );
}

function SizeChips({ sizes, variants }: { sizes: string[]; variants?: LiveStockResult['variants'] }) {
  const { tr } = useLocale();
  if (!sizes.length) return null;
  return (
    <span className="lens-card-sizes" aria-label={tr('Tailles publiées par le marchand', 'المقاسات التي نشرها المتجر')}>
      {sizes.slice(0, 8).map((size) => {
        const known = variants?.find((variant) => variant.value.toLocaleLowerCase('fr') === size.toLocaleLowerCase('fr'));
        const state = known?.availability;
        return (
          <span
            key={size}
            className="lens-card-size"
            data-state={state === 'unavailable' ? 'out' : state === 'available' ? 'in' : undefined}
            aria-disabled={state === 'unavailable' ? true : undefined}
            title={state === 'unavailable' ? tr('Indisponible chez le marchand', 'غير متوفر عند المتجر') : undefined}
          >
            {size}
          </span>
        );
      })}
      {sizes.length > 8 ? <span className="lens-card-size">+{sizes.length - 8}</span> : null}
    </span>
  );
}

function checkedAtLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function CardImage({ candidate }: { candidate: AyrovixCandidate }) {
  const urls = useMemo(() => withIsolation([...new Set([candidate.image, ...(candidate.images || [])].filter(Boolean))]), [candidate.image, candidate.images]);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [candidate.id, candidate.image, candidate.images]);
  return urls[index]
    ? <img src={urls[index]} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer"
        /* composé côté serveur : le cadrage est déjà fait, donc « contain » sans blend ;
           une image de repli (brute) garde l'ancien rendu multiply. */
        data-composed={isComposedUrl(urls[index]) ? 'true' : undefined}
        onError={() => setIndex(value => value + 1)} />
    : <span className="lens-card-placeholder"><ImageIcon size={32} /><span>{candidate.source}</span></span>;
}

export function LensProductCard({ candidate, onChoose, saved, busy, onFavorite }: {
  candidate: AyrovixCandidate; onChoose: (candidate: AyrovixCandidate) => void;
  saved: boolean; busy: boolean; onFavorite: (candidate: AyrovixCandidate) => void;
}) {
  const { tr } = useLocale();
  const priceId = useId();
  const { heading, description } = lensCardCopy(candidate);

  /* Preuve fraîche demandée par le client : elle remplace ce que la grille savait,
     et elle porte sa date. Sans elle, on affiche ce que la grille a rapporté. */
  const [live, setLive] = useState<LiveStockResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setLive(null); setFailed(false); }, [candidate.id, candidate.sourceUrl]);

  const availability = live?.availability ?? candidate.availability;
  const sizes = live && live.sizes.length ? live.sizes : (candidate.sizes || []);
  /* Le prix suit la même règle que le stock : la relecture fraîche remplace ce
     que la grille savait. Et quand le marchand affiche lui-même un prix barré,
     il s'affiche barré ici — sans promo AYROVI par-dessus, jamais additionnées. */
  const priceTnd = live?.priceTnd ?? candidate.priceTnd;
  const sourceAmount = live?.price ?? candidate.price;
  const originalAmount = live ? live.originalPrice : (candidate.originalPrice ?? null);
  const originalTnd = live ? live.originalPriceTnd : (candidate.originalPriceTnd ?? null);
  const merchantPromo = !candidate.promo && originalTnd != null && priceTnd != null && originalTnd > priceTnd
    && sourceAmount != null && originalAmount != null && originalAmount > sourceAmount
    ? { percent: Math.round((1 - sourceAmount / originalAmount) * 100), label: tr('Remise marchand', 'تخفيض المتجر'), priceTnd, originalPriceTnd: originalTnd }
    : null;
  const promo = candidate.promo ?? merchantPromo;
  const hasPrice = typeof priceTnd === 'number' && Number.isFinite(priceTnd) && priceTnd > 0;
  const variants = live?.variants;
  const canVerify = /^https?:\/\//i.test(candidate.sourceUrl || '');

  const verify = async () => {
    if (verifying || !canVerify) return;
    setVerifying(true);
    setFailed(false);
    try {
      const [result] = await refreshLiveStock([candidate.sourceUrl]);
      setLive(result ?? null);
      if (!result || result.availability === 'unknown') setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setVerifying(false);
    }
  };

  return <article className="lens-product-card" data-candidate-id={candidate.id}>
    <button type="button" className="lens-card-open" onClick={() => onChoose(candidate)} aria-describedby={priceId} aria-label={tr(`Voir le produit : ${candidate.title}`, `عرض المنتج: ${candidate.title}`)}>
      <div className="lens-card-media">
        <CardImage candidate={candidate} />
        {promo ? <span className="lens-card-promo-badge">{candidate.promo ? 'Promo' : `-${promo.percent}%`}</span> : null}
      </div>
      <h4 className="lens-card-title" dir="auto">{heading}</h4>
      {description ? <p className="lens-card-description" dir="auto">{description}</p> : null}
      <MerchantRating value={candidate} stars />
      {/* Quiet Card v2 : promo rouge (barré + remisé + badge) quand elle existe. */}
      <div id={priceId} className="lens-card-price">
        {hasPrice
          ? <QuietPromoPrice priceTnd={priceTnd} promo={promo} format={(value) => `${value.toFixed(2)} DT`} variant="grid" />
          : tr('Prix à confirmer', 'السعر قيد التأكيد')}
      </div>
      <StockBadge availability={availability} />
      <SizeChips sizes={sizes} variants={variants} />
    </button>
    <button type="button" className="lens-card-favorite" aria-pressed={saved} disabled={busy} aria-busy={busy}
      aria-label={saved
        ? tr(`Retirer des favoris : ${candidate.title}`, `إزالة من المفضلة: ${candidate.title}`)
        : tr(`Ajouter aux favoris : ${candidate.title}`, `إضافة إلى المفضلة: ${candidate.title}`)}
      onClick={() => onFavorite(candidate)}>{saved ? <HeartFilled size={20} /> : <Heart size={20} />}</button>
    {canVerify ? (
      <button type="button" className="lens-card-verify" onClick={verify} disabled={verifying} aria-busy={verifying}
        aria-label={tr(`Vérifier le stock : ${candidate.title}`, `تحقّق من التوفر: ${candidate.title}`)}>
        <RefreshCw size={13} />
        <span>{verifying ? tr('Vérification…', 'جارٍ التحقّق…') : tr('Vérifier le stock', 'تحقّق من التوفر')}</span>
      </button>
    ) : null}
    {live && !failed && live.checkedAt ? (
      <p className="lens-card-verified-at">
        {tr('Vérifié à', 'تم التحقّق في')} {checkedAtLabel(live.checkedAt)}
      </p>
    ) : null}
    {failed ? (
      <p className="lens-card-verified-at" data-failed="true">
        {tr('Stock non confirmé par le marchand', 'لم يؤكّد المتجر التوفر')}
      </p>
    ) : null}
  </article>;
}
