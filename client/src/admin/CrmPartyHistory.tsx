import React, { useEffect, useState } from 'react';
import { adminApi } from './api';
import { Button, DataTable, Field, Select } from './components';
import { useOfficeText } from './back-office/OfficeLocale';
import { formatDate } from './back-office/resource-ui';

type TimelineItem = { id: string; at: string; type: string; title: string; summary?: string };
const EMPTY_FORM = { channel: 'PHONE', direction: 'OUTBOUND', subject: '', body: '' };

/** Keyed by party in the fiche so an outstanding request cannot populate another customer's history. */
export function CrmPartyHistory({ partyId, canRecord, canRead, channels, directions }: {
  partyId: string; canRecord: boolean; canRead: boolean; channels: readonly string[]; directions: readonly string[];
}) {
  const t = useOfficeText();
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<'saved' | 'failed' | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const names: Record<string, string> = {
    PHONE: t('Téléphone', 'تليفون'), EMAIL: t('E-mail', 'إيميل'), SMS: 'SMS', WHATSAPP: 'WhatsApp',
    INTERNAL: t('Interne', 'داخلي'), OTHER: t('Autre', 'آخر'),
    OUTBOUND: t('Sortant', 'صادر'), INBOUND: t('Entrant', 'وارد'),
  };
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    adminApi<{ data: TimelineItem[] }>(`/crm/parties/${encodeURIComponent(partyId)}/timeline?pageSize=25`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setItems(result.data); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [partyId, canRead, revision]);

  async function record(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !canRecord || !form.subject.trim()) return;
    setBusy(true); setNotice(null);
    try {
      await adminApi('/crm/communications', { method: 'POST', body: JSON.stringify({ ...form, partyId }) });
      setNotice('saved'); setForm(EMPTY_FORM); setExpanded(false); setRevision(value => value + 1);
    } catch { setNotice('failed'); setRevision(value => value + 1); }
    finally { setBusy(false); }
  }

  return <section className="admin-stack">
    <h4>{t('Historique 360°', 'تاريخ العميل 360°')}</h4>
    {canRecord && <div>
      {!expanded && <Button type="button" variant="secondary" onClick={() => { setNotice(null); setExpanded(true); }}>{t('Consigner un échange', 'سجّل تواصل')}</Button>}
      {expanded && <form className="admin-stack" onSubmit={record}>
        <p className="admin-muted">{t('Notez un échange déjà effectué. Aucun appel, message ou e-mail ne sera envoyé.', 'سجّل تواصل صار قبل. السيستام ما يبعث حتى مكالمة ولا مساج ولا إيميل.')}</p>
        <div className="admin-form-row">
          <Field label={t('Canal', 'القناة')}><Select aria-label={t('Canal', 'القناة')} value={form.channel} disabled={busy} onChange={event => setForm({ ...form, channel: event.target.value })} options={channels.map(value => ({ value, label: names[value] || value }))} /></Field>
          <Field label={t('Sens', 'الاتجاه')}><Select aria-label={t('Sens', 'الاتجاه')} value={form.direction} disabled={busy} onChange={event => setForm({ ...form, direction: event.target.value })} options={directions.map(value => ({ value, label: names[value] || value }))} /></Field>
        </div>
        <Field label={t('Objet', 'الموضوع')} required><input required maxLength={300} disabled={busy} value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} /></Field>
        <Field label={t('Résumé interne', 'ملخّص داخلي')} hint={t('Ne saisissez pas de numéro de carte ni de secret.', 'ما تكتبش رقم بطاقة ولا معلومة سرّية.')}><textarea rows={3} maxLength={8000} disabled={busy} value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} /></Field>
        <div className="admin-form-actions">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => { setExpanded(false); setNotice(null); }}>{t('Annuler', 'إلغاء')}</Button>
          <Button type="submit" busy={busy} disabled={!form.subject.trim()}>{t('Enregistrer dans le CRM', 'سجّل في الـCRM')}</Button>
        </div>
      </form>}
    </div>}
    {notice === 'saved' && <p role="status">{t('Échange enregistré dans cette fiche.', 'التواصل تسجّل في بطاقة العميل.')}</p>}
    {notice === 'failed' && <p role="alert">{t('Enregistrement non confirmé. Vérifiez l’historique avant de réessayer.', 'التسجيل ما تأكّدش. ثبّت في التاريخ قبل ما تعاود.')}</p>}
    {canRead && <DataTable columns={[
      { key: 'at', label: t('Quand', 'الوقت'), render: item => formatDate(item.at, true) },
      { key: 'type', label: t('Type', 'النوع') },
      { key: 'title', label: t('Événement', 'النشاط') },
      { key: 'summary', label: t('Détail', 'التفاصيل') },
    ]} rows={items} minWidth={650} loading={loading} error={error || undefined} onRetry={() => setRevision(value => value + 1)}
      emptyText={t('Aucun événement pour l’instant.', 'ما فماش نشاط لتوّا.')} />}
  </section>;
}
