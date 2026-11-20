import React, { useId, useMemo, useState } from 'react';
import { CardTitle } from '../components';
import { useOfficeText } from './OfficeLocale';
import { makeRevenueSeries } from './revenueSeries';

type DailyOrders = { date: string; orders: number };

/** Max 18 buckets even for the annual view. Zero denotes no recorded orders. */
export function orderVolumeBuckets(daily: readonly DailyOrders[], days: number, now = new Date()) {
  const series = makeRevenueSeries(daily.map(row => ({ date: row.date, revenue: row.orders })), days, now);
  const width = Math.ceil(series.length / 18);
  return Array.from({ length: Math.ceil(series.length / width) }, (_, index) => {
    const span = series.slice(index * width, (index + 1) * width);
    return { from: span[0].date, until: span[span.length - 1].date, orders: span.reduce((sum, day) => sum + day.value, 0) };
  });
}

const labelDate = (value: string) => value.slice(5).split('-').reverse().join('/');

export function OrderVolumeChart({ daily, days }: { daily: DailyOrders[]; days: number }) {
  const t = useOfficeText();
  const title = t('Volume de commandes', 'حجم الطلبات');
  const id = useId();
  const buckets = useMemo(() => orderVolumeBuckets(daily, days), [daily, days]);
  const [cursor, setCursor] = useState<number | null>(null);
  const index = Math.min(cursor ?? buckets.length - 1, buckets.length - 1);
  const selected = buckets[index];
  const spanLabel = ({ from, until }: typeof selected) => from === until ? labelDate(from) : `${labelDate(from)} – ${labelDate(until)}`;
  const totals = buckets.reduce((sum, bucket) => sum + bucket.orders, 0);
  const peak = Math.max(1, ...buckets.map(bucket => bucket.orders));
  return <section className="admin-card office-volume" aria-label={title}>
    <CardTitle title={title} subtitle={t('Commandes non annulées · UTC', 'الطلبات غير الملغاة · UTC')} />
    <div className="office-volume-head"><strong>{totals.toLocaleString(t('fr-TN', 'ar-TN'))}</strong><span dir="ltr">{spanLabel(selected)} · {selected.orders}</span></div>
    {totals ? <>
      <div className="office-volume-plot" dir="ltr" aria-hidden="true">
        {buckets.map((bucket, i) => <span key={bucket.from} data-chosen={i === index || undefined} title={`${spanLabel(bucket)} · ${bucket.orders}`} onPointerEnter={() => setCursor(i)}>
          <i style={{ blockSize: `${Math.max(1, bucket.orders / peak * 100)}%` }} />
        </span>)}
      </div>
      <div className="office-volume-axis" aria-hidden="true" dir="ltr"><span>{labelDate(buckets[0].from)}</span><span>{labelDate(buckets[buckets.length - 1].until)}</span></div>
      <div className="office-chart-scrubber"><label htmlFor={id}>{t('Explorer la période', 'استعرض الفترة')}</label><input id={id} dir="ltr" type="range" min={0} max={buckets.length - 1} value={index} aria-valuetext={`${spanLabel(selected)} · ${selected.orders}`} onChange={event => setCursor(Number(event.target.value))} /></div>
    </> : <div className="bo-chart-placeholder">{t('Aucune commande sur cette période.', 'ما فماش طلبات في الفترة هاذي.')}</div>}
  </section>;
}
