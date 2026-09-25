import React, { useId } from 'react';
import { Heart, HeartFilled } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import type { AyrovixCandidate } from '../types';
import { MerchantRating } from './MerchantRating';
import { QuietPromoPrice, StudioImageFrame } from './quiet-card';
import { presentCandidate } from '../services/presentCandidate';
import { formatSourceMoney } from '../../commerce/formatSourceMoney';
import './lens-product-card.css';

export function lensCardCopy(candidate: AyrovixCandidate) {
  return { heading: candidate.title.trim(), description: candidate.description?.trim() || '' };
}
function CardImage({ candidate }: { candidate: AyrovixCandidate }) {
  return <StudioImageFrame key={candidate.canonical?.id || candidate.id} src={candidate.image}
    fallbackSources={candidate.images || []} alt="" placeholderLabel={candidate.source} ratio="1 / 1" />;
}
export function LensProductCard({ candidate, onChoose, saved, busy, onFavorite }: {
  candidate: AyrovixCandidate; onChoose: (candidate: AyrovixCandidate) => void;
  saved: boolean; busy: boolean; onFavorite: (candidate: AyrovixCandidate) => void;
}) {
  const { tr, locale, formatMoney } = useLocale();
  const item = presentCandidate(candidate);
  const priceId = useId();
  const merchantPrice = formatSourceMoney(item.price, item.currency, locale);
  const { heading, description } = lensCardCopy(item);
  const hasPrice = typeof item.priceTnd === 'number' && Number.isFinite(item.priceTnd) && item.priceTnd > 0;
  return <article className="lens-product-card" data-candidate-id={candidate.id}>
    <button type="button" className="lens-card-open" onClick={() => onChoose(candidate)} aria-describedby={priceId} aria-label={tr(`Voir le produit : ${item.title}`, `عرض المنتج: ${item.title}`)}>
      <div className="lens-card-media">
        <CardImage candidate={item} />
        {item.promo ? <span className="lens-card-promo-badge">Promo</span> : null}
      </div>
      {item.brand && <p className="lens-card-brand" dir="auto">{item.brand}</p>}
      <h4 className="lens-card-title" dir="auto">{heading}</h4>
      {description ? <p className="lens-card-description" dir="auto">{description}</p> : null}
      <span className="lens-card-source">{item.source || tr('Marchand non renseigné', 'المتجر غير مذكور')}</span>
      <MerchantRating value={item} stars />
      {/* Quiet Card v2 : promo rouge (barré + remisé + badge) quand elle existe. */}
      <div id={priceId} className="lens-card-price">
        {hasPrice
          ? <QuietPromoPrice priceTnd={item.priceTnd} promo={item.promo ?? null} format={formatMoney} variant="grid" />
          : tr('Prix à confirmer', 'السعر قيد التأكيد')}
      </div>
      {merchantPrice && <span className="lens-card-source-price">{tr('Prix marchand', 'سعر المتجر')} : {merchantPrice}</span>}
    </button>
    <button type="button" className="lens-card-favorite" aria-pressed={saved} disabled={busy} aria-busy={busy}
      aria-label={saved ? tr(`Retirer des favoris : ${item.title}`, `إزالة من المفضلة: ${item.title}`) : tr(`Ajouter aux favoris : ${item.title}`, `إضافة إلى المفضلة: ${item.title}`)}
      onClick={() => onFavorite(item)}>{saved ? <HeartFilled size={20} /> : <Heart size={20} />}</button>
  </article>;
}
