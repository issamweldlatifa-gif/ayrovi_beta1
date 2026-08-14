import React, { useEffect, useState } from 'react';
import type { AyrovixHistoryItem } from '../types';
import { loadAyrovixHistory, readLocalAyrovixHistory } from '../services/history';

interface LensHistoryProps {
  open: boolean;
  onClose: () => void;
  scope?: string | null;
  onRepeat: (item: AyrovixHistoryItem) => void;
  onNewScan: () => void;
}

const KIND_LABELS: Record<AyrovixHistoryItem['kind'], string> = {
  image: 'Photo', url: 'Lien', qr: 'QR', barcode: 'Code-barres', code: 'Code',
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-TN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
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
  return <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><circle cx="12" cy="12" r="3"/></svg>;
};

export const LensHistory: React.FC<LensHistoryProps> = ({ open, onClose, scope, onRepeat, onNewScan }) => {
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
    <div className="fixed inset-0 z-[95] flex flex-col bg-surface text-ink" role="dialog" aria-modal="true" aria-label="Historique AYROVIX Lens">
      <header className="grid min-h-[62px] grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-white px-3 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onClose} className="inline-flex min-h-[44px] w-fit items-center gap-1 rounded-xl px-2 text-xs font-extrabold text-ink" aria-label="Retour à AYROVIX Lens">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"><path d="m15 5-7 7 7 7" /></svg>
          Retour
        </button>
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>
          Historique
        </div>
        <span />
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-md">
          <div className="mb-4">
            <h2 className="text-lg font-extrabold">Vos recherches Lens</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">Synchronisées avec votre compte quand vous êtes connecté, disponibles sur cet appareil sinon. Les photos originales ne sont jamais conservées.</p>
          </div>

          {loading && items.length === 0 ? (
            <div className="grid h-40 place-items-center"><span className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand border-r-transparent" /></div>
          ) : items.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-line bg-white p-7 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-light text-brand">
                <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>
              </div>
              <h3 className="mt-3 text-sm font-extrabold">Aucune recherche pour le moment</h3>
              <p className="mt-1 text-xs text-muted">Photographiez, scannez ou collez le lien d'un produit.</p>
              <button type="button" onClick={onNewScan} className="bg-brand-gradient mt-4 min-h-[46px] rounded-xl px-5 text-xs font-extrabold text-white">Lancer une recherche</button>
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
                        <span className="rounded-full bg-brand-light px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-brand">{KIND_LABELS[item.kind]}</span>
                        <time className="text-[9px] font-semibold text-muted">{formatDate(item.createdAt)}</time>
                      </div>
                      <h3 className="mt-1 line-clamp-2 text-xs font-extrabold leading-snug">{item.title}</h3>
                      <p className="mt-0.5 truncate text-[10px] text-muted">{item.source || item.queryLabel || `${item.resultsCount} résultat(s)`}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-extrabold text-ink">{item.price != null && item.currency ? `${item.price.toFixed(2)} ${item.currency}` : 'Prix à confirmer'}</span>
                        {canRepeat(item) ? (
                          <button type="button" onClick={() => onRepeat(item)} className="rounded-lg bg-ink px-3 py-1.5 text-[10px] font-extrabold text-white">Relancer</button>
                        ) : (
                          <button type="button" onClick={onNewScan} className="rounded-lg border border-line px-3 py-1.5 text-[10px] font-extrabold">Nouvelle photo</button>
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
