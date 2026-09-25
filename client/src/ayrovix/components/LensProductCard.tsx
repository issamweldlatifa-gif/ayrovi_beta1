import React, { useEffect, useMemo, useState, useId } from 'react';
import { Heart, HeartFilled, Image as ImageIcon } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import type { AyrovixCandidate } from '../types';
import { MerchantRating } from './MerchantRating';
import { QuietPromoPrice } from './quiet-card';
import { withIsolation } from '../services/mediaIsolation';
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
function CardImage({ candidate }: { candidate: AyrovixCandidate }) {
  const urls = useMemo(() => withIsolation([...new Set([candidate.image, ...(candidate.images || [])].filter(Boolean))]), [candidate.image, candidate.images]);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [candidate.id, candidate.image, candidate.images]);
  return urls[index]
    ? <img src={urls[index]} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => setIndex(value => value + 1)} />
    : <span className="lens-card-placeholder"><ImageIcon size={32} /><span>{candidate.source}</span></span>;
}
export function LensProductCard({ candidate, onChoose, saved, busy, onFavorite }: {
  candidate: AyrovixCandidate; onChoose: (candidate: AyrovixCandidate) => void;
  saved: boolean; busy: boolean; onFavorite: (candidate: AyrovixCandidate) => void;
}) {
  const { tr } = useLocale();
  const priceId = useId();
  const { heading, description } = lensCardCopy(candidate);
  const hasPrice = typeof candidate.priceTnd === 'number' && Number.isFinite(candidate.priceTnd) && candidate.priceTnd > 0;
  return <article className="lens-product-card" data-candidate-id={candidate.id}>
    <button type="button" className="lens-card-open" onClick={() => onChoose(candidate)} aria-describedby={priceId} aria-label={tr(`Voir le produit : ${candidate.title}`, `عرض المنتج: ${candidate.title}`)}>
      <div className="lens-card-media">
        <CardImage candidate={candidate} />
        {candidate.promo ? <span className="lens-card-promo-badge">Promo</span> : null}
      </div>
      <h4 className="lens-card-title" dir="auto">{heading}</h4>
      {description ? <p className="lens-card-description" dir="auto">{description}</p> : null}
      <MerchantRating value={candidate} stars />
      {/* Quiet Card v2 : promo rouge (barré + remisé + badge) quand elle existe. */}
      <div id={priceId} className="lens-card-price">
        {hasPrice
          ? <QuietPromoPrice priceTnd={candidate.priceTnd} promo={candidate.promo ?? null} format={(value) => `${value.toFixed(2)} DT`} variant="grid" />
          : tr('Prix à confirmer', 'السعر قيد التأكيد')}
      </div>
    </button>
    <button type="button" className="lens-card-favorite" aria-pressed={saved} disabled={busy} aria-busy={busy}
      aria-label={saved ? tr(`Retirer des favoris : ${candidate.title}`, `إزالة من المفضلة: ${candidate.title}`) : tr(`Ajouter aux favoris : ${candidate.title}`, `إضافة إلى المفضلة: ${candidate.title}`)}
      onClick={() => onFavorite(candidate)}>{saved ? <HeartFilled size={20} /> : <Heart size={20} />}</button>
  </article>;
}
