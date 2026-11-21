import React, { useEffect, useState } from 'react';
import { adminApi } from './api';
import { Button, DataTable, Field, PageHeader, Select } from './components';
import { useOfficeText } from './back-office/OfficeLocale';
import { formatDate, formatMoney } from './back-office/resource-ui';
import { giftDesignsFor, giftFormats, parseGiftPreviewAmount, type GiftDesign, type GiftFormat, type GiftLabRow } from '../../../shared/giftCardPreview';

const endpoint = '/finance/gift-card-specimens';
const designLabels: Record<GiftDesign, [string, string]> = {
  sunburst: ['Éclat solaire', 'ضوّ الشمس'], ribbon: ['Ruban graphique', 'ربطة ملوّنة'], bloom: ['En fleurs', 'ورد'],
  confetti: ['Confettis', 'فرحة'], orbit: ['En orbite', 'في المدار'], mosaic: ['Mosaïque', 'فسيفساء'],
};

export function FinanceGiftCardLab({ canWrite }: { canWrite: boolean }) {
  const t = useOfficeText();
  const [rows, setRows] = useState<GiftLabRow[]>([]);
  const [actor, setActor] = useState('');
  const [format, setFormat] = useState<GiftFormat>('digital');
  const [design, setDesign] = useState<GiftDesign>('sunburst');
  const [amount, setAmount] = useState('50');
  const [pending, setPending] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [serial, reload] = useState(0);
  const [specimen, setSpecimen] = useState('');
  const [review, setReview] = useState<GiftLabRow | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    adminApi<{ data: { rows: GiftLabRow[]; actorId: string } }>(endpoint, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) { setRows(response.data.rows); setActor(response.data.actorId); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [serial]);

  const create = async () => {
    if (!canWrite || pending || parseGiftPreviewAmount(amount, format) === null) return;
    setError(''); setSpecimen(''); setPending('create');
    try {
      await adminApi(endpoint, { method: 'POST', body: JSON.stringify({ format, design, amount }) });
      reload(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('Opération impossible.', 'العملية ما نجحتش.')); }
    finally { setPending(''); }
  };
  const approve = async (row: GiftLabRow) => {
    if (!canWrite || pending || !actor || row.createdBy === actor || row.status !== 'DRAFT') return;
    setError(''); setSpecimen(''); setPending(row.id);
    try {
      const result = await adminApi<{ data: { row: GiftLabRow; specimen: string } }>(`${endpoint}/${encodeURIComponent(row.id)}/approve`, { method: 'POST' });
      setSpecimen(result.data.specimen); setReview(null);
      reload(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('Opération impossible.', 'العملية ما نجحتش.')); }
    finally { setPending(''); }
  };
  const formatLabel = (value: GiftFormat) => value === 'physical' ? t('Physique', 'ورقية') : t('Numérique', 'رقمية');
  return <>
    <PageHeader title={t('Cartes cadeaux · Démonstration', 'بطاقات الهدايا · تجربة')} eyebrow="ZAYROVI FINANCE"
      description={t('Préparez un spécimen ; un second administrateur habilité doit l’approuver.', 'حضّر نموذج. يلزم مسؤول آخر عندو الصلاحية يوافق عليه.')} />
    <p className="bo-notice">{t('Hors production financière : aucun débit, e-mail, crédit au panier ou retrait. Les codes DEMO ne sont utilisables nulle part.', 'تجربة من غير فلوس: لا دفع، لا إيميل، لا رصيد شراء ولا سحب. رموز DEMO ما تتستعملش.')}</p>
    {canWrite && <section className="admin-list-card">
      <form className="admin-grid" onSubmit={event => { event.preventDefault(); void create(); }}>
        <Field label={t('Support', 'نوع البطاقة')}><Select aria-label={t('Support', 'نوع البطاقة')} value={format} onChange={event => {
          const next = event.target.value as GiftFormat;
          setFormat(next);
          if (!giftDesignsFor(next).includes(design)) setDesign(giftDesignsFor(next)[0]);
        }}
          options={giftFormats.map(value => ({ value, label: formatLabel(value) }))} /></Field>
        <Field label={t('Design', 'التصميم')}><Select aria-label={t('Design', 'التصميم')} value={design} onChange={event => setDesign(event.target.value as GiftDesign)}
          options={giftDesignsFor(format).map(value => ({ value, label: t(...designLabels[value]) }))} /></Field>
        <Field label={t('Montant indicatif (TND)', 'المبلغ التجريبي (د.ت)')}><input inputMode="decimal" maxLength={8} value={amount} onChange={event => setAmount(event.target.value)} /></Field>
        <Button type="submit" disabled={Boolean(pending) || parseGiftPreviewAmount(amount, format) === null}>{t('Créer un brouillon', 'حضّر مسودّة')}</Button>
      </form>
    </section>}
    {error && <p role="alert" className="bo-notice">{error}</p>}
    {review && <section className="admin-list-card" aria-label={t('Confirmation', 'التأكيد')}>
      <p>{t('Approuver ce spécimen à usage de test uniquement ?', 'توافق على النموذج هذا للتجربة فقط؟')} <bdi>{formatMoney(review.amountMillimes / 1000)}</bdi></p>
      <Button type="button" disabled={Boolean(pending)} onClick={() => void approve(review)}>{t('Confirmer et générer le code de test', 'أكّد وولّد رمز التجربة')}</Button>
      <Button type="button" variant="ghost" disabled={Boolean(pending)} onClick={() => setReview(null)}>{t('Annuler', 'إلغاء')}</Button>
    </section>}
    {specimen && <section className="admin-list-card" aria-live="polite">
      <p>{t('Code sans valeur, affiché une seule fois.', 'رمز من غير قيمة، يظهر مرّة برك.')}</p>
      <p><bdi><code>{specimen}</code></bdi></p>
      <Button variant="ghost" onClick={() => setSpecimen('')}>{t('Masquer', 'خبّي')}</Button>
    </section>}
    <section className="admin-list-card">
      <Button variant="ghost" onClick={() => { setError(''); reload(value => value + 1); }} disabled={loading || Boolean(pending)}>{t('Actualiser', 'حدّث')}</Button>
      <DataTable<GiftLabRow> rows={rows} loading={loading} caption={t('Derniers spécimens', 'آخر النماذج')}
        emptyText={t('Aucun spécimen enregistré.', 'ما فماش نماذج مسجّلة.')} columns={[
          { key: 'design', label: t('Design', 'التصميم'), render: row => t(...designLabels[row.design]) },
          { key: 'format', label: t('Support', 'نوع البطاقة'), render: row => formatLabel(row.format) },
          { key: 'amountMillimes', label: t('Montant indicatif', 'المبلغ التجريبي'), render: row => <bdi>{formatMoney(row.amountMillimes / 1000)}</bdi> },
          { key: 'createdAt', label: t('Créé le', 'تاريخ الإنشاء'), render: row => formatDate(row.createdAt, true) },
          { key: 'status', label: t('Statut', 'الحالة'), render: row => row.status === 'APPROVED' ? t('Approuvé', 'تمّت الموافقة') : t('En attente d’approbation', 'يستنّى الموافقة') },
          { key: 'reviewedAt', label: t('Approbation', 'الموافقة'), render: row => row.status === 'DRAFT' && canWrite ? row.createdBy === actor
            ? t('Autre administrateur requis', 'يلزم مسؤول آخر') : <Button variant="ghost" disabled={Boolean(pending)} onClick={() => { setReview(row); setSpecimen(''); }}>{t('Examiner', 'راجع')}</Button>
            : row.reviewedAt ? formatDate(row.reviewedAt, true) : '—' },
        ]} />
    </section>
  </>;
}
