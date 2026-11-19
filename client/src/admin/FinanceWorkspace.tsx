import React, { useEffect, useState } from 'react';
import { AlertCircle, CreditCard } from '../components/QatafoIcons';
import { OfficeIcon } from '../design/admin/OfficeIcon';
import { OfficeListToolbar } from '../design/admin/OfficeListToolbar';
import { OfficeViewSwitch } from '../design/admin/OfficeViewSwitch';
import { adminApi, queryString } from './api';
import { Button, DataTable, Field, PageHeader, Pagination, Select, StatusBadge } from './components';
import { useOfficeText } from './back-office/OfficeLocale';
import { formatDate, formatMoney, options } from './back-office/resource-ui';
import type { BackOfficeRenderContext } from './back-office/BackOfficeShell';
import { FINANCE_REGISTER_PERIODS, FINANCE_TRANSACTION_STATUSES, type FinanceRegisterResult, type FinanceRegisterRow } from '../../../shared/financeTransactionRegister';

export function FinanceWorkspace({ navigate, canRead, renderReports }: { navigate: BackOfficeRenderContext['navigate']; canRead: boolean; renderReports: () => React.ReactNode }) {
  const t = useOfficeText();
  const [view, setView] = useState<'reports' | 'register'>('reports');
  if (!canRead) return <p role="alert">{t('Ce module exige le droit de lecture des rapports.', 'القسم هذا يلزمو صلاحية قراءة التقارير.')}</p>;
  return <>
    <OfficeViewSwitch label={t('Vues de la finance', 'طرق عرض المالية')} value={view} onChange={setView} options={[
      { value: 'reports', icon: 'analytics', label: t('Rapports et dépenses', 'التقارير والمصاريف') },
      { value: 'register', icon: 'table', label: t('Registre des transactions', 'سجل المعاملات') },
    ]} />
    {view === 'register' ? <TransactionRegister navigate={navigate} /> : renderReports()}
  </>;
}

const DEFAULT_FILTERS = { days: '30', status: '', reference: '' };

function TransactionRegister({ navigate }: { navigate: BackOfficeRenderContext['navigate'] }) {
  const t = useOfficeText();
  const [draft, setDraft] = useState(DEFAULT_FILTERS);
  const [filter, setFilter] = useState({ ...DEFAULT_FILTERS, page: 1 });
  const [result, setResult] = useState<FinanceRegisterResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setResult(null); setError('');
    adminApi<{ data: FinanceRegisterResult }>(`/finance/transactions?${queryString(filter)}`, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setResult(response.data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, revision]);
  return <>
    <PageHeader title={t('Registre des transactions', 'سجل المعاملات')} eyebrow="ZAYROVI FINANCE"
      description={t('Consultez les tentatives enregistrées par date de création, sans modifier les paiements.', 'شوف محاولات الدفع المسجّلة حسب تاريخ الإنشاء، من غير تعديل الدفوعات.')} />
    <p className="bo-notice"><AlertCircle size={18} /><span>{t('Lecture seule : ce registre opérationnel ne représente ni le solde bancaire ni un rapprochement.', 'قراءة فقط: السجل هذا موش رصيد بنكي ولا مطابقة مع كشف حساب.')}</span></p>
    <section className="admin-list-card office-finance-register">
      <form onSubmit={event => { event.preventDefault(); setFilter({ ...draft, page: 1 }); }}>
        <OfficeListToolbar label={t('Filtres du registre', 'فلاتر السجل')} trailing={<>
          <Button type="button" variant="ghost" onClick={() => { setDraft(DEFAULT_FILTERS); setFilter({ ...DEFAULT_FILTERS, page: 1 }); }}>{t('Réinitialiser', 'فسّخ الفلاتر')}</Button>
          <Button type="submit" disabled={loading}>{t('Appliquer', 'طبّق')}</Button>
        </>}>
          <Field label={t('Référence exacte', 'المرجع الكامل')}><input dir="ltr" maxLength={80} pattern="[A-Za-z0-9_\\-]*" placeholder="TXN… / AYR…" value={draft.reference} onChange={event => setDraft({ ...draft, reference: event.target.value.trim() })} /></Field>
          <Field label={t('Période', 'الفترة')}><Select aria-label={t('Période', 'الفترة')} value={draft.days} onChange={event => setDraft({ ...draft, days: event.target.value })} options={FINANCE_REGISTER_PERIODS.map(value => ({ value: String(value), label: t(`${value} jours`, `${value} يوم`) }))} /></Field>
          <Field label={t('Statut', 'الحالة')}><Select aria-label={t('Statut', 'الحالة')} value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })} options={[{ value: '', label: t('Tous les statuts', 'كل الحالات') }, ...options([...FINANCE_TRANSACTION_STATUSES])]} /></Field>
        </OfficeListToolbar>
      </form>
      <DataTable<FinanceRegisterRow> rows={result?.rows ?? []} loading={loading} error={error || undefined} onRetry={() => setRevision(value => value + 1)}
        caption={t('Tentatives de paiement', 'محاولات الدفع')} emptyText={t('Aucune tentative pour ces filtres.', 'ما فماش محاولات بالفلاتر هاذم.')}
        columns={[
          { key: 'transactionNumber', label: t('Transaction', 'المعاملة'), render: row => <bdi><strong>{row.transactionNumber}</strong></bdi> },
          { key: 'orderNumber', label: t('Commande', 'الطلب') },
          { key: 'provider', label: t('Canal', 'القناة'), render: row => <span className="office-finance-channel"><CreditCard size={16} />{row.provider}</span> },
          { key: 'status', label: t('Statut', 'الحالة'), render: row => <StatusBadge status={row.status} /> },
          { key: 'amountTnd', label: t('Montant de la tentative', 'مبلغ المحاولة'), render: row => <bdi className="admin-cell-num">{formatMoney(row.amountTnd)}</bdi> },
          { key: 'createdAt', label: t('Enregistrée le', 'تاريخ التسجيل'), render: row => formatDate(row.createdAt, true) },
          { key: 'confirmedAt', label: t('Confirmée le', 'تاريخ التأكيد'), render: row => row.confirmedAt ? formatDate(row.confirmedAt, true) : '—' },
        ]} rowActions={[{ key: 'open', label: t('Voir la commande', 'شوف الطلب'), hideLabel: true, icon: <OfficeIcon name="view" />,
          onRun: row => navigate('orders', undefined, row.orderId) }]} />
      {result && <Pagination {...result.pagination} onChange={page => setFilter(previous => ({ ...previous, page }))} />}
    </section>
  </>;
}
