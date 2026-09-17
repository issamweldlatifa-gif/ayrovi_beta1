import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ArrowUpRight, Camera, Image as ImageIcon, ShieldCheck, Star, X, RefreshCw, Square } from '../../components/QatafoIcons';
import type { AyrovixCandidate, AyrovixDetectedPrice } from '../types';
import { displayRating, isDisplayableCandidate } from '../services/resultPolicy';
import { useLocale } from '../../i18n/LocaleContext';

export interface InteractiveLensView {
  queryLabel: string | null;
  list: AyrovixCandidate[];
  eventId: string;
  detectedPrice?: AyrovixDetectedPrice | null;
}

interface Props {
  view: InteractiveLensView;
  previewUrl: string | null;
  fallbackImage: string | null;
  onChoose: (candidate: AyrovixCandidate) => void;
  onReset: () => void;
  onCommandDetected?: (detected: AyrovixDetectedPrice) => void;
  onROISelect?: (roi: { x: number; y: number; w: number; h: number } | null) => void;
  onReSearch?: (croppedFile: File | null) => void;
}

// Reuse image helper
function faviconUrl(sourceUrl: string): string | null {
  try {
    const host = new URL(sourceUrl).hostname;
    if (!host || host === 'localhost') return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  } catch { return null; }
}

const CandidateImage: React.FC<{ candidate?: AyrovixCandidate; fallback?: string | null; alt: string }> = ({ candidate, fallback, alt }) => {
  const urls = useMemo(() => {
    const fromCandidate = candidate ? [...new Set([...(candidate.images || []), candidate.image].filter(Boolean))] : [] as string[];
    return fromCandidate.length ? fromCandidate : ([fallback].filter(Boolean) as string[]);
  }, [candidate, fallback]);
  const [index, setIndex] = useState(0);
  const favicon = candidate?.sourceUrl ? faviconUrl(candidate.sourceUrl) : null;
  if (urls[index]) {
    return <img src={urls[index]} alt={alt} loading="lazy" draggable={false} referrerPolicy="no-referrer" onError={() => setIndex(c => c + 1)} className="h-full w-full object-contain" />;
  }
  if (candidate) {
    if (favicon) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-surface p-2 text-center">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-[14px] font-black text-ink shadow-sm border border-line">
            <img src={favicon} alt="" width={18} height={18} loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display='none'; }} />
          </div>
          <span className="max-w-[78px] truncate text-[10px] font-bold text-muted">{candidate.source}</span>
        </div>
      );
    }
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-surface p-2 text-center">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-[14px] font-black text-ink shadow-sm border border-line">
          <span>{candidate.source.charAt(0).toUpperCase()}</span>
        </div>
        <span className="max-w-[78px] truncate text-[10px] font-bold text-muted">{candidate.source}</span>
      </div>
    );
  }
  return <div className="grid h-full w-full place-items-center bg-surface text-muted"><ImageIcon size={30} /></div>;
};

const MatchBadge: React.FC<{ value: number }> = ({ value }) => (
  <span className="absolute left-1.5 top-1.5 rounded-lg bg-white/95 px-1.5 py-1 text-center shadow-sm">
    <span className="block text-[12px] font-extrabold leading-none text-brand">{value}%</span>
    <span className="block text-[8px] font-bold text-ink">Match</span>
  </span>
);

export const InteractiveLensResults: React.FC<Props> = ({ view, previewUrl, fallbackImage, onChoose, onReset, onCommandDetected }) => {
  const { tr, direction } = useLocale();
  const visible = useMemo(() => view.list.filter(isDisplayableCandidate).sort((a, b) => (b.match || 0) - (a.match || 0)), [view.list]);
  const best = visible[0];
  const name = view.queryLabel || best?.title || tr('Produit détecté par AYROVIX', 'منتج اكتشفته AYROVIX');
  const detected = view.detectedPrice;

  // Bottom sheet drag
  const [sheet, setSheet] = useState<'peek'|'half'|'full'>('half');
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const startHeight = useRef<number>(0);

  const sheetHeight = sheet === 'peek' ? '32%' : sheet === 'half' ? '55%' : '88%';

  const onHandleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    const rect = sheetRef.current?.getBoundingClientRect();
    if (rect) startHeight.current = rect.height;
  };
  const onHandleTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = startY.current - e.touches[0].clientY;
    // dy positive = drag up (expand), negative = drag down (collapse)
    if (dy > 60 && sheet !== 'full') setSheet('full');
    else if (dy < -60 && sheet === 'full') setSheet('half');
    else if (dy < -60 && sheet === 'half') setSheet('peek');
    else if (dy > 60 && sheet === 'peek') setSheet('half');
  };
  const onHandleTouchEnd = () => { startY.current = null; };

  // Image viewer: zoom/pan/ROI
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const lastDist = useRef<number | null>(null);
  const [roiMode, setRoiMode] = useState(false);
  const [roi, setRoi] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const roiStart = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); setRoi(null); };

  // Pinch zoom
  const onTouchStart = (e: React.TouchEvent) => {
    if (roiMode && e.touches.length === 1) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
      const y = ((e.touches[0].clientY - rect.top) / rect.height) * 100;
      roiStart.current = { x, y };
      setRoi({ x, y, w: 0, h: 0 });
      return;
    }
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      lastDist.current = d;
    } else if (e.touches.length === 1 && scale > 1 && !roiMode) {
      panStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: offset.x, oy: offset.y };
      setIsPanning(true);
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (roiMode && roiStart.current && e.touches.length === 1) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
      const y = ((e.touches[0].clientY - rect.top) / rect.height) * 100;
      const sx = roiStart.current.x;
      const sy = roiStart.current.y;
      setRoi({ x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) });
      return;
    }
    if (e.touches.length === 2 && lastDist.current != null) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const factor = d / lastDist.current;
      setScale(s => Math.min(3, Math.max(1, s * factor)));
      lastDist.current = d;
    } else if (e.touches.length === 1 && panStart.current && scale > 1) {
      const dx = e.touches[0].clientX - panStart.current.x;
      const dy = e.touches[0].clientY - panStart.current.y;
      setOffset({ x: panStart.current.ox + dx, y: panStart.current.oy + dy });
    }
  };
  const onTouchEnd = () => {
    lastDist.current = null;
    panStart.current = null;
    setIsPanning(false);
    roiStart.current = null;
  };

  // Mouse drag for desktop ROI / pan
  const onMouseDown = (e: React.MouseEvent) => {
    if (roiMode) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      roiStart.current = { x, y };
      setRoi({ x, y, w: 0, h: 0 });
    } else if (scale > 1) {
      panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      setIsPanning(true);
    }
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (roiMode && roiStart.current) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const sx = roiStart.current.x;
      const sy = roiStart.current.y;
      setRoi({ x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) });
    } else if (panStart.current && scale > 1) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setOffset({ x: panStart.current.ox + dx, y: panStart.current.oy + dy });
    }
  };
  const onMouseUp = () => { panStart.current = null; setIsPanning(false); roiStart.current = null; };

  const priceLine = (c: AyrovixCandidate) => ({
    tnd: c.priceTnd != null ? `${c.priceTnd.toFixed(2)} DT` : '—',
    original: c.price != null ? `${Number(c.price).toFixed(Number(c.price)%1?2:0)} ${c.currency||''}` : null,
  });

  return (
    <div className="relative flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-[#0A0A0A]" dir={direction}>
      {/* Image viewer - takes remaining space above sheet */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-black select-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ cursor: roiMode ? 'crosshair' : isPanning ? 'grabbing' : scale > 1 ? 'grab' : 'default', touchAction: 'none' }}
      >
        <div className="absolute inset-0 grid place-items-center">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={name}
              draggable={false}
              className="max-h-full max-w-full object-contain"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transition: isPanning ? 'none' : 'transform 0.2s' }}
            />
          ) : (
            <div className="h-full w-full bg-[#111] grid place-items-center text-white/50"><ImageIcon size={40} /></div>
          )}
        </div>

        {/* ROI overlay */}
        {roi && roi.w > 2 && roi.h > 2 && (
          <div
            className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{ left: `${roi.x}%`, top: `${roi.y}%`, width: `${roi.w}%`, height: `${roi.h}%` }}
          >
            <span className="absolute -left-1 -top-1 h-2 w-2 bg-white" />
            <span className="absolute -right-1 -top-1 h-2 w-2 bg-white" />
            <span className="absolute -left-1 -bottom-1 h-2 w-2 bg-white" />
            <span className="absolute -right-1 -bottom-1 h-2 w-2 bg-white" />
          </div>
        )}

        {/* Top controls */}
        <div className="absolute left-2 right-2 top-2 flex items-center justify-between">
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setRoiMode(v => !v)} className={`rounded-full px-3 py-1.5 text-[11px] font-bold backdrop-blur ${roiMode ? 'bg-white text-black' : 'bg-black/50 text-white border border-white/20'}`}>
              <span className="inline-flex items-center gap-1"><Square size={12} />{roiMode ? tr('ROI actif', 'تحديد نشط') : tr('Sélectionner', 'تحديد')}</span>
            </button>
            {roi && <button type="button" onClick={() => setRoi(null)} className="rounded-full bg-black/50 px-2.5 py-1.5 text-[11px] font-bold text-white border border-white/20"><X size={12} /></button>}
          </div>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setScale(s => Math.min(3, s + 0.3))} className="grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white border border-white/20">+</button>
            <button type="button" onClick={() => setScale(s => Math.max(1, s - 0.3))} className="grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white border border-white/20">−</button>
            <button type="button" onClick={resetView} className="grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white border border-white/20"><RefreshCw size={14} /></button>
          </div>
        </div>

        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[10px] font-medium text-white/80 backdrop-blur">
          {tr('Pincez pour zoomer • Glissez pour déplacer', 'قرّب بأصابعك • اسحب للتحريك')} {roiMode && `• ${tr('Dessinez la zone', 'ارسم المنطقة')}`}
        </div>
      </div>

      {/* Draggable Bottom Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-[20px] bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)]"
        style={{ height: sheetHeight, transition: startY.current == null ? 'height 0.25s ease' : 'none' }}
      >
        {/* Handle */}
        <div
          className="flex shrink-0 flex-col items-center gap-2 border-b border-line bg-white py-2 rounded-t-[20px] cursor-grab active:cursor-grabbing"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          onMouseDown={e => { startY.current = e.clientY; const rect = sheetRef.current?.getBoundingClientRect(); if (rect) startHeight.current = rect.height; const onMove = (ev: MouseEvent) => {
            if (startY.current == null) return;
            const dy = startY.current - ev.clientY;
            if (dy > 60 && sheet !== 'full') setSheet('full');
            else if (dy < -60 && sheet === 'full') setSheet('half');
            else if (dy < -60 && sheet === 'half') setSheet('peek');
            else if (dy > 60 && sheet === 'peek') setSheet('half');
          }; const onUp = () => { startY.current=null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }; window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp); }}
        >
          <span className="h-1.5 w-10 rounded-full bg-black/15" />
          <div className="flex w-full items-center justify-between px-3">
            <div>
              <h3 className="text-[14px] font-extrabold text-ink">{tr('Résultats Lens', 'نتائج Lens')} • {visible.length}</h3>
              <p className="text-[11px] font-medium text-muted truncate max-w-[22ch]">{name}</p>
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setSheet(s => s === 'full' ? 'half' : 'full')} className="rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-bold text-ink">{sheet === 'full' ? tr('Réduire', 'تصغير') : tr('Agrandir', 'تكبير')}</button>
              <button type="button" onClick={onReset} className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-white">{tr('Nouvelle recherche', 'بحث جديد')}</button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {/* Detected price if exists */}
          {detected && detected.sourcePrice > 0 && (
            <div className="mb-3 rounded-[16px] border border-brand bg-brand/5 p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{tr('Prix repéré', 'سعر مكتشف')}</p>
              <p className="text-[13px] font-bold text-ink line-clamp-2">{detected.title || name}</p>
              <p className="text-[18px] font-black text-ink">{detected.totalPriceTND?.toFixed(2) || '—'} DT <span className="text-[11px] font-medium text-muted">{detected.sourcePrice.toFixed(2)} {detected.sourceCurrency}</span></p>
              {onCommandDetected && <button type="button" onClick={() => onCommandDetected(detected)} className="mt-2 w-full rounded-full bg-ink py-2 text-xs font-bold text-white">{tr('Commander avec ce prix', 'الطلب بهذا السعر')}</button>}
            </div>
          )}

          {visible.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface text-muted"><ImageIcon size={22} /></div>
              <p className="mt-2 text-sm font-bold text-ink">{tr('Aucune correspondance', 'لا توجد نتائج')}</p>
              <p className="mt-2 text-sm font-bold text-ink">{tr('Aucune correspondance trouvée', 'لا توجد مطابقة')}</p>
              <p className="mx-auto mt-1 max-w-[28ch] text-xs text-muted">{tr('Essayez une autre zone ou une image plus nette.', 'جرّب منطقة أخرى أو صورة أوضح.')}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <button type="button" onClick={onReset} className="rounded-full bg-ink px-5 py-2 text-xs font-bold text-white">{tr('Nouvelle recherche', 'بحث جديد')}</button>
                <button type="button" onClick={onReset} className="rounded-full border border-line bg-white px-5 py-2 text-xs font-bold text-ink">{tr('Recherches récentes', 'عمليات البحث الأخيرة')}</button>
              </div>
              <p className="mt-2 text-[11px] font-medium text-muted">{tr('Astuce : le lien produit donne le prix le plus fiable. Les tailles/couleurs manquantes se vérifient sur la fiche marchand.', 'نصيحة: رابط المنتج يعطي السعر الأكثر موثوقية. المقاسات/الألوان الناقصة تُتحقق على صفحة المتجر.')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {visible.slice(0, 12).map(c => (
                <article key={c.id} className="rounded-[16px] border border-line bg-white p-2">
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-surface">
                    <CandidateImage candidate={c} fallback={fallbackImage} alt={c.title} />
                    <MatchBadge value={c.match} />
                  </div>
                  <h4 className="mt-1.5 line-clamp-2 text-[12px] font-bold leading-snug text-ink">{c.title}</h4>
                  {c.colors.length > 0 || c.sizes.length > 0 ? (
                    <p className="truncate text-[10px] font-semibold text-muted">{[c.brand, c.model].filter(Boolean).join(' ') || c.colors.join(' / ') || c.sizes.join(' / ')}</p>
                  ) : (
                    <p className="text-[10px] font-medium text-muted">{tr('Tailles/couleurs : voir la fiche marchand', 'المقاسات/الألوان: انظر صفحة المتجر')}</p>
                  )}
                  <p className="truncate text-[10px] font-medium text-muted">{c.source}</p>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-ink"><Star size={11} fill="currentColor" />{displayRating(c).toFixed(1)}</div>
                  <div className="mt-1 rounded-lg bg-surface border border-line px-2 py-1.5">
                    <p className="text-[9px] font-extrabold uppercase tracking-wide text-muted">{tr('Prix final estimé', 'السعر النهائي التقديري')}</p>
                    <p className="text-[13px] font-black text-ink">{priceLine(c).tnd}</p>
                    <p className="text-[10px] font-semibold text-muted truncate">{priceLine(c).original ? `${tr('Prix boutique', 'سعر المتجر')} ${priceLine(c).original} • ${c.source}` : c.source}</p>
                    <p className="text-[9px] font-medium text-muted">{tr('Estimation tout inclus (douane + transport + service).', 'تقدير شامل (جمركة + شحن + خدمة).')}</p>
                  </div>
                  <button type="button" onClick={() => onChoose(c)} className="mt-2 w-full rounded-full bg-ink py-2 text-[11px] font-bold text-white">{tr('Voir le produit', 'عرض المنتج')}</button>
                </article>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface p-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-ink border border-line"><ShieldCheck size={16} /></span>
            <div className="min-w-0 flex-1">
              <strong className="block text-[11px] font-extrabold text-ink">{tr('Prix vérifiés et marchands fiables', 'أسعار متحقق منها وتجار موثوقون')}</strong>
              <p className="text-[10.5px] font-semibold text-muted leading-snug">{tr('Aucune donnée n’est inventée. Les prix varient selon le marchand — vérification manuelle incluse après acompte.', 'لا يتم اختراع أي بيانات. الأسعار تختلف حسب المتجر — التحقق اليدوي مشمول بعد العربون.')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
