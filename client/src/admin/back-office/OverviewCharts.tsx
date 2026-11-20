import React, { useId, useMemo, useState } from 'react';
import { CardTitle, StatusBadge } from '../components';
import { formatMoney } from './resource-ui';
import { useOfficeText } from './OfficeLocale';
import { makeRevenueSeries } from './revenueSeries';

const plot = { left: 4, right: 596, top: 12, bottom: 154 };
const palette = ['var(--bo-chart-blue)', 'var(--bo-chart-teal)', 'var(--bo-chart-violet)', 'var(--bo-chart-amber)', 'var(--bo-chart-extra)'];

export function RevenueChart({ daily, total, days }: { daily: { date: string; revenue: number }[]; total: number; days: number }) {
  const t = useOfficeText();
  const fillId = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const series = useMemo(() => makeRevenueSeries(daily, days), [daily, days]);
  const scaleMin = Math.min(0, ...series.map(point => point.value));
  const scaleMax = Math.max(1, ...series.map(point => point.value));
  const x = (index: number) => plot.left + index * (plot.right - plot.left) / Math.max(1, days);
  const y = (value: number) => plot.bottom - (value - scaleMin) / (scaleMax - scaleMin) * (plot.bottom - plot.top);
  const points = series.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const index = Math.min(selected ?? days, days);
  const active = series[index];
  const dayLabel = (date: string) => date.split('-').reverse().slice(0, 2).join('/');
  const valueText = `${dayLabel(active.date)} · ${formatMoney(active.value)}`;
  const title = t('Évolution de la valeur commandée', 'تطوّر قيمة الطلبات');
  return <section className="admin-card bo-chart">
    <CardTitle title={title} subtitle={t('Commandes non annulées · TND · UTC', 'الطلبات غير الملغاة · د.ت · UTC')} />
    <div className="office-chart-heading"><p className="bo-chart-value"><bdi dir="ltr">{formatMoney(total)}</bdi></p>
      {daily.length > 0 && <p className="office-chart-readout" title={t('Montant sur la journée sélectionnée', 'مبلغ النهار المختار')}><time dateTime={active.date}>{dayLabel(active.date)}</time><bdi dir="ltr">{formatMoney(active.value)}</bdi></p>}
    </div>
    {daily.length ? <div className="bo-revenue-plot" dir="ltr">
      <svg data-visualization="sales-trend" viewBox="0 0 600 168" preserveAspectRatio="none" role="img" aria-label={title} onPointerMove={event => {
          if (event.pointerType !== 'mouse') return;
          const rect = event.currentTarget.getBoundingClientRect();
          const unit = ((event.clientX - rect.left) / rect.width * 600 - plot.left) / (plot.right - plot.left);
          setSelected(Math.min(days, Math.max(0, Math.round(unit * days))));
        }}>
        <defs><linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1"><stop stopColor="var(--bo-chart-blue)" stopOpacity=".24"/><stop offset="1" stopColor="var(--bo-chart-blue)" stopOpacity=".01"/></linearGradient></defs>
        {[plot.top, 59, 106, plot.bottom].map(y => <line key={y} x1={plot.left} x2={plot.right} y1={y} y2={y} strokeWidth="1" className="bo-chart-gridline" />)}
        <polygon points={`${plot.left},${y(0)} ${points} ${plot.right},${y(0)}`} fill={`url(#${fillId})`} />
        <polyline points={points} vectorEffect="non-scaling-stroke" strokeWidth="2.5" stroke="var(--bo-chart-blue)" fill="none" strokeLinejoin="round" />
        <line x1={x(index)} x2={x(index)} y1={plot.top} y2={plot.bottom} className="office-chart-crosshair" />
        <ellipse cx={x(index)} cy={y(active.value)} rx="4" ry="4" className="office-chart-point" />
      </svg>
      <div className="bo-chart-dates">{[0, Math.floor(days / 2), days].map(index => <time key={index} dateTime={series[index].date}>{dayLabel(series[index].date)}</time>)}</div>
      <div className="office-chart-scrubber" dir={t('ltr', 'rtl')}>
        <label htmlFor={`${fillId}-day`}>{t('Explorer par jour', 'استعرض حسب النهار')}</label>
        <input id={`${fillId}-day`} dir="ltr" type="range" min={0} max={days} step={1} value={index} aria-valuetext={valueText}
          onChange={event => setSelected(Number(event.target.value))} />
      </div>
    </div> : <div className="bo-chart-placeholder">{t('Aucune vente sur cette période.', 'ما فماش مبيعات في الفترة هاذي.')}</div>}
  </section>;
}

export function OrderStatusChart({ statuses }: { statuses: { status: string; count: number }[] }) {
  const t = useOfficeText();
  const sum = statuses.reduce((total, row) => total + row.count, 0);
  const listed = statuses.length > palette.length ? [...statuses.slice(0, 4), { status: '', count: statuses.slice(4).reduce((total, row) => total + row.count, 0) }] : statuses;
  let offset = 0;
  const gradient = listed.map((row, index) => {
    const from = offset; offset += row.count / sum * 100;
    return `${palette[index]} ${from}% ${offset}%`;
  });
  return <section className="admin-card bo-chart bo-status-card">
    <CardTitle title={t('Statuts des commandes', 'حالات الطلبات')} subtitle={t('Toutes périodes', 'كل الفترات')} />
    <div className="bo-status-ring" style={sum ? { background: `conic-gradient(${gradient.join(',')})` } : undefined}><div><strong>{sum}</strong><span>{t('commandes', 'طلب')}</span></div></div>
    {sum ? <ul className="bo-status-legend">{listed.map((row, i) => <li key={row.status}><span style={{ background: palette[i] }} />{row.status ? <StatusBadge status={row.status} /> : <span className="bo-status-other">{t('Autres', 'أخرى')}</span>}<b>{row.count}</b></li>)}</ul> : <p className="bo-status-empty">{t('Pas encore de commandes.', 'ما فماش طلبات إلى حدّ الآن.')}</p>}
  </section>;
}
