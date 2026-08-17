import React, { useEffect, useState } from 'react';
import type { AyrovixHistoryItem } from '../types';
import { loadAyrovixHistory, readLocalAyrovixHistory } from '../services/history';
import { ArrowLeft, History, LensBox } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';

interface LensHistoryProps {
  open: boolean;
  onClose: () => void;
  scope?: string | null;
  onRepeat: (item: AyrovixHistoryItem) => void;
  onNewScan: () => void;
}

const KIND_LABELS: Record<AyrovixHistoryItem['kind'], [string, string]> = {
  image: ['Photo', 'صورة'], url: ['Lien', 'رابط'], qr: ['QR', 'QR'], barcode: ['Code-barres', 'رمز شريطي'], code: ['Code', 'رمز'],
};

function formatDate(value: string, locale: 'fr' | 'ar'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-TN-u-hc-h23' : 'fr-TN-u-hc-h23', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function canRepeat(item: AyrovixHistoryItem): boolean {
  return Boolean(item.sourceUrl || (item.inputValue && item.kind !== 'image'));
}

const HistoryThumbnail: React.FC<{ item: AyrovixHistoryItem }> = ({ item }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.imageUrl]);
  if (item.imageUrl && !failed) {
    return <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />;
  }
  return <LensBox size={25} strokeWidth={1.6} />;
};

export const LensHistory: React.FC<LensHistoryProps> = ({ open, onClose, scope, onRepeat, onNewScan }) => {
  const { locale, direction, isArabic, tr } = useLocale();
  const [items, setItems] = useState<AyrovixHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    setItems(readLocalAyrovixHistory(scope));
    setLoading(true);
    loadAyrovixHistory(scope, controller.signal)
      .then((result) => { if (active) setItems(result); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [open, scope]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-surface text-ink" role="dialog" aria-modal="true" dir={direction} aria-label={tr('Historique AYROVIX Lens', 'سجل عدسة AYROVIX')}>
      <header className="grid min-h-[62px] grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-white px-3 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onClose} className="inline-flex min-h-[44px] w-fit items-center gap-1 rounded-xl px-2 text-xs font-extrabold text-ink" aria-label={tr('Retour à AYROVIX Lens', 'العودة إلى عدسة AYROVIX')}>
          <ArrowLeft size={18} strokeWidth={2.1} className={isArabic ? 'rotate-180' : ''} />
          {tr('Retour', 'رجوع')}
        </button>
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <History size={18} strokeWidth={1.9} />
          {tr('Historique', 'السجل')}
        </div>
        <span />
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-md">
          <div className="mb-4">
            <h2 className="text-lg font-extrabold">{tr('Vos recherches Lens', 'عمليات بحث Lens')}</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{tr('Synchronisées avec votre compte quand vous êtes connecté, disponibles sur cet appareil sinon. Les photos originales ne sont jamais conservées.', 'تتزامن مع حسابك عند تسجيل الدخول، أو تبقى متاحة على هذا الجهاز. لا نحتفظ أبدًا بالصور الأصلية.')}</p>
          </div>

          {loading && items.length === 0 ? (
            <div className="grid h-40 place-items-center"><span className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand border-r-transparent" /></div>
          ) : items.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-line bg-white p-7 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-light text-brand">
                <History size={25} strokeWidth={1.8} />
              </div>
              <h3 className="mt-3 text-sm font-extrabold">{tr('Aucune recherche pour le moment', 'لا يوجد بحث حتى الآن')}</h3>
              <p className="mt-1 text-xs text-muted">{tr("Photographiez, scannez ou collez le lien d'un produit.", 'صوّر منتجًا أو امسحه أو ألصق رابطه.')}</p>
              <button type="button" onClick={onNewScan} className="ay-btn-primary mt-4 text-xs">{tr('Lancer une recherche', 'بدء البحث')}</button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((item) => (
                <article key={item.id} className="rounded-[20px] border border-line bg-white p-3">
                  <div className="flex gap-3">
                    <div className="grid h-[72px] w-[62px] flex-none place-items-center overflow-hidden rounded-xl bg-surface text-muted">
                      <HistoryThumbnail item={item} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-brand-light px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-brand">{KIND_LABELS[item.kind][isArabic ? 1 : 0]}</span>
                        <time className="text-[9px] font-semibold text-muted">{formatDate(item.createdAt, locale)}</time>
                      </div>
                      <h3 className="mt-1 line-clamp-2 text-xs font-extrabold leading-snug">{item.title}</h3>
                      <p className="mt-0.5 truncate text-[10px] text-muted">{item.source || item.queryLabel || `${item.resultsCount} ${tr('résultat(s)', 'نتيجة')}`}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-extrabold text-ink">{item.price != null && item.currency ? `${item.price.toFixed(2)} ${item.currency}` : tr('Prix à confirmer', 'السعر يحتاج إلى تأكيد')}</span>
                        {canRepeat(item) ? (
                          <button type="button" onClick={() => onRepeat(item)} className="ay-btn-primary min-h-8 px-3 py-1.5 text-[10px]">{tr('Relancer', 'إعادة')}</button>
                        ) : (
                          <button type="button" onClick={onNewScan} className="ay-btn-secondary min-h-8 px-3 py-1.5 text-[10px]">{tr('Nouvelle photo', 'صورة جديدة')}</button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
