import React from 'react';
import { Star } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import { displayRating } from '../services/resultPolicy';

/** Merchant reviews are not similarity/confidence or a made-up listing-quality score. */
export function MerchantRating({ value }: { value: { rating?: number | null; ratingKind?: string; ratingCount?: number | null } }) {
  const { tr, locale } = useLocale();
  const rating = displayRating(value);
  if (rating === null) return null;
  const count = value.ratingCount;
  return <span className="inline-flex flex-wrap items-center gap-1 text-xs font-medium" data-merchant-rating title={tr('Note publiée par le marchand','تقييم منشور لدى المتجر')}>
    <Star size={14}/><bdi dir="ltr">{rating.toFixed(1)}/5</bdi><span>{tr('marchand','المتجر')}</span>
    {count != null && Number.isInteger(count) && count > 0 && <bdi>({count.toLocaleString(locale==='ar'?'ar-TN':'fr-TN')})</bdi>}
  </span>;
}
