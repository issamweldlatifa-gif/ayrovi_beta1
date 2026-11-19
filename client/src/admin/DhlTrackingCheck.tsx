import React, { useState } from 'react';
import { adminApi } from './api';
import { Button } from './components';
import { useOfficeText } from './back-office/OfficeLocale';
import { formatDate } from './back-office/resource-ui';

export function DhlTrackingCheck({ orderId }: { orderId: string }) {
  const t = useOfficeText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ status: string; observedAt: string | null }>();
  async function check() {
    if (busy) return;
    setBusy(true); setError(''); setResult(undefined);
    try {
      const response = await adminApi<{ data: NonNullable<typeof result> }>(`/orders/${encodeURIComponent(orderId)}/dhl-status`, { method: 'POST' });
      setResult(response.data);
    } catch (reason: any) { setError(reason.message); }
    finally { setBusy(false); }
  }
  const states: Record<string, string> = { 'pre-transit': t('En préparation', 'قيد التحضير'), transit: t('En transit', 'في الطريق'), delivered: t('Livré', 'تسلّم'), failure: t('Incident', 'تعطّل'), unknown: t('Non classé', 'غير مصنّف') };
  return <div className="office-dhl-check">
    <Button variant="secondary" busy={busy} onClick={() => void check()}>{t('Vérifier chez DHL', 'تثبّت عند DHL')}</Button>
    {result && <p role="status">{t('Réponse DHL', 'ردّ DHL')} : {states[result.status]}{result.observedAt ? ` · ${formatDate(result.observedAt, true)}` : ''}. {t('Commande inchangée.', 'ما تبدّلش الطلب.')}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
