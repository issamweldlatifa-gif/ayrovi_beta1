import React from 'react';
import { Button } from '../components';
import { useOfficeText } from './OfficeLocale';

export function StatusBoard<Row>({ lanes, rows, statusOf, rowKey, renderCard, loading, error, onRetry, paged = false }: {
  lanes: { value: string; label: string }[];
  rows: Row[];
  statusOf: (row: Row) => string;
  rowKey: (row: Row) => string;
  renderCard: (row: Row) => React.ReactNode;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  paged?: boolean;
}) {
  const t = useOfficeText();
  if (loading) return <p className="bo-kanban-note" role="status">{t('Chargement du kanban…', 'جاري تحميل اللوحة…')}</p>;
  if (error) return <div role="alert"><p>{error}</p><Button variant="secondary" onClick={onRetry}>{t('Réessayer', 'عاود المحاولة')}</Button></div>;
  const groups = new Map(lanes.map(lane => [lane.value, { label: lane.label, rows: [] as Row[] }]));
  const other = { label: t('Autres statuts', 'حالات أخرى'), rows: [] as Row[] };
  for (const row of rows) (groups.get(statusOf(row)) ?? other).rows.push(row);
  if (other.rows.length) groups.set('__other', other);
  return <>{paged && <p className="bo-kanban-note">{t('Cartes de la page en cours · les filtres et la pagination s’appliquent.', 'بطاقات الصفحة الحالية · الفلاتر وتقسيم الصفحات مطبّقين.')}</p>}
    <div className="bo-kanban" style={{ gridTemplateColumns: `repeat(${groups.size}, minmax(155px, 1fr))` }} tabIndex={0} role="region" aria-label={t('Tableau kanban', 'لوحة كانبان')}>
      {[...groups].map(([key, lane]) => <section className="bo-kanban-lane" key={key} aria-label={lane.label}>
        <h3>{lane.label}<span>{lane.rows.length}</span></h3>
        {lane.rows.length ? lane.rows.map(row => <article key={rowKey(row)}>{renderCard(row)}</article>) : <p className="bo-kanban-note">{t('Aucune carte', 'ما فماش بطاقات')}</p>}
      </section>)}
    </div>
  </>;
}
