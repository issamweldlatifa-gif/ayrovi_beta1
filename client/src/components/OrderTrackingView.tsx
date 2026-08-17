import React, { useEffect, useMemo, useState } from 'react';
import { AppHeader } from '../design/AppHeader';
import { customerApi } from '../customer/api';
import { useLocale } from '../i18n/LocaleContext';
import {
  ArrowUpRight, Check, CheckCircle2, Clock3, Copy, Loader2, MapPin, Package,
  PackageCheck, RefreshCw, Truck,
} from './QatafoIcons';

interface TrackingPayload {
  id: string;
  orderNumber: string;
  trackingCode: string;
  status: string;
  paymentStatus: string;
  depositStatus: string;
  createdAt: string;
  updatedAt: string;
  destination: { governorate: string; address: string; latitude: number | null; longitude: number | null };
  delivery: null | {
    status: string;
    carrier: string;
    trackingNumber: string;
    expectedAt: string | null;
    deliveredAt: string | null;
    notes: string;
    updatedAt: string;
  };
  history: Array<{ id: string; from_status: string | null; to_status: string; note: string; created_at: string }>;
}

interface OrderTrackingViewProps {
  orderId: string;
  onBack: () => void;
}

const progressFor = (orderStatus: string, deliveryStatus = '') => {
  if (orderStatus === 'DELIVERED' || deliveryStatus === 'DELIVERED') return 5;
  if (orderStatus === 'OUT_FOR_DELIVERY' || deliveryStatus === 'OUT_FOR_DELIVERY') return 4;
  if (['IN_TRANSIT', 'ARRIVED'].includes(orderStatus) || deliveryStatus === 'SHIPPED') return 3;
  if (['PURCHASED'].includes(orderStatus) || deliveryStatus === 'PREPARING') return 2;
  if (['CONFIRMED', 'PAID', 'PURCHASING'].includes(orderStatus)) return 1;
  return 0;
};

export const OrderTrackingView: React.FC<OrderTrackingViewProps> = ({ orderId, onBack }) => {
  const { tr, direction, formatDate } = useLocale();
  const [tracking, setTracking] = useState<TrackingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const result = await customerApi<{ success: true; data: TrackingPayload }>(`/api/customer/account/orders/${orderId}/tracking`);
      setTracking(result.data);
      setError('');
    } catch (reason: any) {
      setError(reason?.message || tr('Impossible de charger le suivi.', 'تعذر تحميل التتبع.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [orderId]);

  const mapQuery = useMemo(() => {
    if (!tracking) return '';
    const { latitude, longitude, address, governorate } = tracking.destination;
    return latitude != null && longitude != null
      ? `${latitude},${longitude}`
      : [address, governorate, 'Tunisie'].filter(Boolean).join(', ');
  }, [tracking]);
  const encodedMapQuery = encodeURIComponent(mapQuery);
  const mapEmbedUrl = mapQuery ? `https://www.google.com/maps?q=${encodedMapQuery}&output=embed` : '';
  const directionsUrl = mapQuery ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent('Tunis, Tunisie')}&destination=${encodedMapQuery}` : '#';

  const copyTracking = async () => {
    if (!tracking?.trackingCode) return;
    try {
      await navigator.clipboard.writeText(tracking.trackingCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const milestones = [
    { icon: Package, fr: 'Commande enregistrée', ar: 'تم تسجيل الطلب', frText: 'Référence et facture créées', arText: 'تم إنشاء المرجع والفاتورة' },
    { icon: CheckCircle2, fr: 'Commande confirmée', ar: 'تم تأكيد الطلب', frText: 'Acompte vérifié par AYROVI', arText: 'تحققت AYROVI من العربون' },
    { icon: PackageCheck, fr: 'Préparation', ar: 'قيد التجهيز', frText: 'Achat et préparation des articles', arText: 'شراء المنتجات وتجهيزها' },
    { icon: Truck, fr: 'En transit', ar: 'قيد الشحن', frText: 'Acheminement vers la Tunisie', arText: 'في الطريق إلى تونس' },
    { icon: MapPin, fr: 'En livraison', ar: 'خرج للتوصيل', frText: 'Le colis rejoint votre adresse', arText: 'الطرد في طريقه إلى عنوانك' },
    { icon: Check, fr: 'Livrée', ar: 'تم التسليم', frText: 'Commande remise au client', arText: 'تم تسليم الطلب للحريف' },
  ];
  const currentStep = tracking ? progressFor(tracking.status, tracking.delivery?.status) : 0;
  const cancelled = tracking?.status === 'CANCELLED' || ['FAILED', 'RETURNED'].includes(String(tracking?.delivery?.status || ''));

  return (
    <div className="fixed inset-0 z-[125] overflow-y-auto bg-surface" dir={direction} role="dialog" aria-modal="true" aria-label={tr('Suivi de commande', 'تتبع الطلب')}>
      <AppHeader sticky title={tr('Suivi de commande', 'تتبع الطلب')} subtitle={tracking?.orderNumber || 'AYROVI'} onBack={onBack} />
      {loading ? (
        <div className="grid min-h-[70dvh] place-items-center"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-brand" /><p className="mt-3 text-sm font-bold text-muted">{tr('Chargement du suivi…', 'جارٍ تحميل التتبع…')}</p></div></div>
      ) : error || !tracking ? (
        <main className="mx-auto max-w-xl px-5 py-16 text-center"><Package className="mx-auto h-10 w-10 text-muted" /><h1 className="mt-4 text-xl font-black text-ink">{tr('Suivi indisponible', 'التتبع غير متاح')}</h1><p className="mt-2 text-sm text-muted">{error}</p><button type="button" onClick={() => void load()} className="ay-btn-primary mt-6">{tr('Réessayer', 'إعادة المحاولة')}</button></main>
      ) : (
        <main className="ay-safe-bottom mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-7 sm:py-8">
          <section className="overflow-hidden bg-ink text-surface-base shadow-card">
            <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-brand px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-surface-base">AYROVI TRACK</span>
                  <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-wide ${cancelled ? 'bg-danger text-surface-base' : 'bg-surface-base/10 text-surface-base'}`}>{cancelled ? tr('Action requise', 'يلزم التدخل') : milestones[currentStep][direction === 'rtl' ? 'ar' : 'fr']}</span>
                </div>
                <h1 className="mt-5 text-3xl font-black tracking-[-0.04em] sm:text-4xl">{tracking.orderNumber}</h1>
                <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-surface-base/65">{tr('Chaque mise à jour de préparation et de livraison apparaît ici automatiquement.', 'كل تحديث للتجهيز والتوصيل يظهر هنا آليًا.')}</p>
              </div>
              <button type="button" onClick={() => void load(true)} disabled={refreshing} className="flex min-h-11 items-center justify-center gap-2 border border-surface-base/25 px-4 text-xs font-black text-surface-base hover:bg-surface-base/10 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />{tr('Actualiser', 'تحديث')}
              </button>
            </div>
            <div className="border-t border-surface-base/10 bg-surface-base/5 p-5 sm:px-8">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-surface-base/55">{tr('Numéro de suivi AYROVI', 'رقم تتبع AYROVI')}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3"><strong className="font-mono text-lg tracking-[0.08em] text-surface-base sm:text-xl">{tracking.trackingCode}</strong><button type="button" onClick={() => void copyTracking()} className="grid h-10 w-10 place-items-center bg-surface-base text-ink" aria-label={tr('Copier le numéro de suivi', 'نسخ رقم التتبع')}>{copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}</button></div>
            </div>
          </section>

          <section className="border border-line bg-surface-base p-5 shadow-card sm:p-7">
            <div className="mb-6 flex items-center justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand">{tr('Progression', 'تقدم الطلب')}</p><h2 className="mt-1 text-xl font-black text-ink">{tr('Parcours de votre commande', 'مسار طلبك')}</h2></div><span className="text-sm font-black text-brand">{Math.round(((currentStep + 1) / milestones.length) * 100)}%</span></div>
            <div className="grid gap-0 md:grid-cols-6">
              {milestones.map((item, index) => {
                const Icon = item.icon;
                const reached = !cancelled && index <= currentStep;
                const active = !cancelled && index === currentStep;
                return <div key={item.fr} className="relative flex gap-4 pb-6 last:pb-0 md:block md:pb-0 md:text-center">
                  {index < milestones.length - 1 && <span className={`absolute start-[1.35rem] top-11 h-[calc(100%-2.25rem)] w-0.5 md:start-1/2 md:top-[1.35rem] md:h-0.5 md:w-full ${index < currentStep ? 'bg-brand' : 'bg-line'}`} />}
                  <span className={`relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 md:mx-auto ${active ? 'border-brand bg-brand text-surface-base ring-4 ring-brand/10' : reached ? 'border-brand bg-brand text-surface-base' : 'border-line bg-surface-base text-muted'}`}><Icon className="h-5 w-5" /></span>
                  <div className="pt-0.5 md:mt-3 md:px-2"><strong className={`block text-sm ${reached ? 'text-ink' : 'text-muted'}`}>{direction === 'rtl' ? item.ar : item.fr}</strong><span className="mt-1 block text-[10px] font-semibold leading-4 text-muted">{direction === 'rtl' ? item.arText : item.frText}</span></div>
                </div>;
              })}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
            <section className="overflow-hidden border border-line bg-surface-base shadow-card">
              <div className="flex items-center justify-between gap-4 border-b border-line p-5 sm:px-6"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand">Maps</p><h2 className="mt-1 text-xl font-black text-ink">{tr('Destination de livraison', 'وجهة التوصيل')}</h2></div><MapPin className="h-6 w-6 text-brand" /></div>
              <div className="relative min-h-[320px] bg-surface-raised">
                {mapEmbedUrl && <iframe title={tr('Carte de destination', 'خريطة وجهة التوصيل')} src={mapEmbedUrl} className="absolute inset-0 h-full w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />}
                <div className="pointer-events-none absolute inset-x-3 bottom-3 bg-surface-base/95 p-4 shadow-overlay backdrop-blur-sm sm:inset-x-5 sm:bottom-5"><strong className="block text-sm text-ink">{tracking.destination.governorate}</strong><span className="mt-1 block text-xs leading-5 text-muted">{tracking.destination.address}</span></div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:px-6"><p className="max-w-md text-[11px] font-semibold leading-5 text-muted">{tr('La carte indique la destination enregistrée, pas la position en temps réel du livreur.', 'توضح الخريطة وجهة التسليم المسجلة وليست موقع الموزع لحظيًا.')}</p><a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 bg-ink px-4 text-xs font-black text-surface-base">{tr('Ouvrir dans Maps', 'فتح في Maps')}<ArrowUpRight className="h-4 w-4" /></a></div>
            </section>

            <div className="space-y-5">
              <section className="border border-line bg-surface-base p-5 shadow-card sm:p-6"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand">{tr('Livraison', 'التوصيل')}</p><h2 className="mt-1 text-xl font-black text-ink">{tracking.delivery?.carrier || 'AYROVI Delivery'}</h2><dl className="mt-5 divide-y divide-line text-sm"><div className="flex justify-between gap-4 py-3"><dt className="text-muted">{tr('Statut', 'الحالة')}</dt><dd className="text-end font-black text-ink">{tracking.delivery?.status || tr('En préparation', 'قيد التجهيز')}</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-muted">{tr('Arrivée estimée', 'الوصول المتوقع')}</dt><dd className="text-end font-black text-ink">{tracking.delivery?.expectedAt ? formatDate(tracking.delivery.expectedAt) : tr('À confirmer', 'يُحدد لاحقًا')}</dd></div>{tracking.delivery?.trackingNumber && <div className="flex justify-between gap-4 py-3"><dt className="text-muted">{tr('Référence transporteur', 'مرجع الناقل')}</dt><dd className="break-all text-end font-mono font-black text-ink">{tracking.delivery.trackingNumber}</dd></div>}<div className="flex justify-between gap-4 py-3"><dt className="text-muted">{tr('Dernière mise à jour', 'آخر تحديث')}</dt><dd className="text-end font-black text-ink">{formatDate(tracking.delivery?.updatedAt || tracking.updatedAt, true)}</dd></div></dl></section>
              <a href={`/api/customer/account/orders/${tracking.id}/invoice`} className="flex min-h-14 items-center justify-center gap-2 border border-brand bg-brand/5 px-5 text-sm font-black text-brand-dark"><PackageCheck className="h-5 w-5" />{tr('Télécharger la facture électronique', 'تنزيل الفاتورة الإلكترونية')}</a>
            </div>
          </div>

          {tracking.history.length > 0 && <section className="border border-line bg-surface-base p-5 shadow-card sm:p-7"><div className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-brand" /><h2 className="text-lg font-black text-ink">{tr('Historique des mises à jour', 'سجل التحديثات')}</h2></div><div className="mt-5 space-y-0">{[...tracking.history].reverse().map((item, index) => <div key={item.id} className="relative flex gap-4 pb-6 last:pb-0">{index < tracking.history.length - 1 && <span className="absolute start-[.45rem] top-5 h-full w-px bg-line" />}<span className="relative mt-1.5 h-4 w-4 shrink-0 rounded-full border-4 border-surface-base bg-brand ring-1 ring-brand" /><div><strong className="text-sm text-ink">{item.to_status.replaceAll('_', ' ')}</strong>{item.note && <p className="mt-1 text-xs leading-5 text-muted">{item.note}</p>}<time className="mt-1 block text-[10px] font-bold text-muted">{formatDate(item.created_at, true)}</time></div></div>)}</div></section>}
        </main>
      )}
    </div>
  );
};
