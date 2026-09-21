import React from 'react';
import { Star } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import { displayRating } from '../services/resultPolicy';

/** Merchant reviews are not similarity/confidence or a made-up listing-quality score. */
export function MerchantRating({ value, stars = false }: { value: { rating?: number | null; ratingKind?: string; ratingCount?: number | null }; stars?: boolean }) {
  const { tr, locale } = useLocale();
  const rating = displayRating(value);
  if (rating === null) return null;
  const count = value.ratingCount;
  if (stars) return <span className="lens-card-rating" data-merchant-rating title={tr('Note publiée par le marchand', 'تقييم منشور لدى المتجر')}>
    <span className="lens-rating-stars" aria-hidden="true">{[0,1,2,3,4].map(index => <span className="lens-rating-star" key={index}>
      <Star size={14} fill="currentColor" /><span style={{width:`${Math.max(0, Math.min(1, rating - index)) * 100}%`}}><Star size={14} fill="currentColor" /></span>
    </span>)}</span>
    <bdi dir="ltr">{rating.toFixed(1)}/5</bdi><span className="sr-only">{tr('Note publiée par le marchand', 'تقييم منشور لدى المتجر')}</span>
    {count != null && Number.isInteger(count) && count > 0 && <bdi>({count.toLocaleString(locale==='ar'?'ar-TN':'fr-TN')})</bdi>}
  </span>;
  return <span className="inline-flex flex-wrap items-center gap-1 text-xs font-medium" data-merchant-rating title={tr('Note publiée par le marchand','تقييم منشور لدى المتجر')}>
    <Star size={14}/><bdi dir="ltr">{rating.toFixed(1)}/5</bdi><span>{tr('marchand','المتجر')}</span>
    {count != null && Number.isInteger(count) && count > 0 && <bdi>({count.toLocaleString(locale==='ar'?'ar-TN':'fr-TN')})</bdi>}
  </span>;
}
