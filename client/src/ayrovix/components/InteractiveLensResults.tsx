import { MerchantRating } from './MerchantRating';
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ScanSearch, Loader2, Image as ImageIcon, ShieldCheck } from '../../components/QatafoIcons';
import type { AyrovixCandidate, AyrovixDetectedPrice } from '../types';
import { isDisplayableCandidate, isLenientCandidate } from '../services/resultPolicy';
import { useLocale } from '../../i18n/LocaleContext';

import { containedImageRect, pointInImage, detectedBox, selectionForPoint, resizeSelection, type LensBox, type Corner } from '../services/lensSelectionGeometry';
import { useLensResultsSheet } from './useLensResultsSheet';
import './lens-results.css';

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
  onRoiSearch?: (roi: { x: number; y: number; w: number; h: number }) => void;
  onLassoSearch?: (file: File, cropMs?: number) => void;
  isLoading?: boolean;
  detectedProducts?: Array<{ name: string; box: [number,number,number,number] | null; category: string }>;
  customerIntent?: string;
  /** true = rendu à l'intérieur de la coque caméra (jamais une page séparée) : plein conteneur parent, pas de 100dvh. */
  shell?: boolean;
}

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
    return <img src={urls[index]} alt={alt} loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => setIndex(c => c + 1)} className="h-full w-full object-contain" />;
  }
  if (candidate) {
    if (favicon) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-surface p-2 text-center">
          <div className="grid h-9 w-9 place-items-center rounded-control bg-white text-sm font-black text-ink shadow-sm border border-line">
            <img src={favicon} alt="" width={18} height={18} loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display='none'; }} />
          </div>
          <span className="max-w-[78px] truncate text-xs font-bold text-muted">{candidate.source}</span>
        </div>
      );
    }
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-surface p-2 text-center">
        <div className="grid h-9 w-9 place-items-center rounded-control bg-white text-sm font-black text-ink shadow-sm border border-line">
          <span>{candidate.source.charAt(0).toUpperCase()}</span>
        </div>
        <span className="max-w-[78px] truncate text-xs font-bold text-muted">{candidate.source}</span>
      </div>
    );
  }
  return <div className="grid h-full w-full place-items-center bg-surface text-muted"><ImageIcon size={30} /></div>;
};

const MatchBadge: React.FC<{ value: number }> = ({ value }) => (
  <span className="absolute left-1.5 top-1.5 rounded-icon bg-white/95 px-1.5 py-1 text-center shadow-sm">
    <span className="block text-xs font-extrabold leading-none text-ink">{value}%</span>
    <span className="block text-xs font-bold text-ink">Match</span>
  </span>
);

export const InteractiveLensResults: React.FC<Props> = ({ view, previewUrl, fallbackImage, onChoose, onReset, onCommandDetected, onRoiSearch, onLassoSearch, isLoading, detectedProducts, shell }) => {
  const { tr, direction } = useLocale();
  const visible = useMemo(() => {
    const strict = view.list.filter(isDisplayableCandidate).sort((a, b) => (b.match || 0) - (a.match || 0));
    return strict.length ? strict : view.list.filter(isLenientCandidate).sort((a, b) => (b.match || 0) - (a.match || 0));
  }, [view.list]);
  const name = view.queryLabel || visible[0]?.title || tr('Votre image', 'صورتك');
  const detected = view.detectedPrice;
  const drawer = useLensResultsSheet(Boolean(previewUrl));
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [imgBox, setImgBox] = useState<LensBox | null>(null);
  const [selectedBox, setSelectedBox] = useState<LensBox | null>(null);
  const selectedRef = useRef<LensBox | null>(null);
  const requestEpoch = useRef(0);
  const tap = useRef<{ x: number; y: number; id: number } | null>(null);
  const resizing = useRef<{ box: LensBox; corner: Corner; x: number; y: number } | null>(null);
  const products = useMemo(() => (detectedProducts || []).flatMap(p => {
    const box = detectedBox(p.box); return box ? [{ ...p, box }] : [];
  }), [detectedProducts]);
  const select = (box: LensBox | null) => { selectedRef.current = box; setSelectedBox(box); };
  const clearSelection = () => select(null);
  useEffect(() => {
    select(null); drawer.snap(!previewUrl);
    return () => { requestEpoch.current++; };
  }, [previewUrl]);
  useEffect(() => {
    if (!selectedRef.current && products.length === 1) select(products[0].box);
  }, [products]);
  const measure = useCallback(() => {
    const image = imageRef.current, stage = stageRef.current;
    if (!image || !stage) return;
    setImgBox(containedImageRect(stage.clientWidth, stage.clientHeight, image.naturalWidth, image.naturalHeight));
  }, []);
  useEffect(() => {
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (stageRef.current) observer?.observe(stageRef.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure, previewUrl]);

  const search = async (box: LensBox) => {
    const epoch = ++requestEpoch.current;
    select(box);
    if (onRoiSearch) { onRoiSearch(box); return; }
    // Legacy client-crop fallback; late image/encoder callbacks cannot start a stale search.
    if (!onLassoSearch || !previewUrl) return;
    const started = performance.now();
    try {
      const image = new Image(); image.crossOrigin = 'anonymous';
      const loaded = new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; });
      image.src = previewUrl; await loaded;
      if (epoch !== requestEpoch.current) return;
      const x = box.x / 100 * image.naturalWidth, y = box.y / 100 * image.naturalHeight;
      const w = box.w / 100 * image.naturalWidth, h = box.h / 100 * image.naturalHeight;
      const pad = Math.max(24, Math.max(w, h) * .18);
      const sx = Math.max(0, x - pad), sy = Math.max(0, y - pad);
      const sw = Math.min(image.naturalWidth, x + w + pad) - sx, sh = Math.min(image.naturalHeight, y + h + pad) - sy;
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(sw)); canvas.height = Math.max(1, Math.round(sh));
      const context = canvas.getContext('2d'); if (!context) return;
      context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
      if (blob && epoch === requestEpoch.current) onLassoSearch(new File([blob], 'lens-select.jpg', { type: 'image/jpeg' }), Math.round(performance.now() - started));
    } catch { /* Keep current results if the local crop is unavailable. */ }
  };
  const tapImage = (x: number, y: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || !imgBox) return;
    const point = pointInImage(x - rect.left, y - rect.top, imgBox);
    if (point) void search(selectionForPoint(point, products.map(p => p.box)));
  };
  const cornerLabel = (corner: Corner) => ({
    nw: tr('Ajuster le coin supérieur gauche', 'ضبط الزاوية العلوية اليسرى'),
    ne: tr('Ajuster le coin supérieur droit', 'ضبط الزاوية العلوية اليمنى'),
    sw: tr('Ajuster le coin inférieur gauche', 'ضبط الزاوية السفلية اليسرى'),
    se: tr('Ajuster le coin inférieur droit', 'ضبط الزاوية السفلية اليمنى'),
  }[corner]);
  const priceLine = (c: AyrovixCandidate) => {
    const isPending = c.priceVerificationStatus === 'PENDING_MANUAL' || (c.price == null && c.priceTnd == null);
    if (isPending && c.priceTnd == null) {
      return {
        tnd: tr('Prix à confirmer', 'السعر قيد التأكيد'),
        original: c.price != null ? `${Number(c.price).toFixed(Number(c.price)%1?2:0)} ${c.currency||''}` : null,
        pending: true as const,
      };
    }
    return {
      tnd: c.priceTnd != null ? `${c.priceTnd.toFixed(2)} DT` : '—',
      original: c.price != null ? `${Number(c.price).toFixed(Number(c.price)%1?2:0)} ${c.currency||''}` : null,
      pending: false as const,
    };
  };

  return (
    <div ref={drawer.rootRef} className={`lens-results ${shell ? 'lens-results-shell' : ''}`} data-expanded={drawer.full} data-has-image={Boolean(previewUrl)} dir={direction}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (drawer.full && previewUrl) { drawer.snap(false); handleRef.current?.focus(); } else onReset(); } }}>
      <header className="lens-results-chrome" inert={drawer.full && Boolean(previewUrl)} aria-hidden={drawer.full && previewUrl ? true : undefined}>
        <button type="button" aria-label={tr('Retour à la caméra', 'العودة إلى الكاميرا')} onClick={onReset}><ArrowLeft size={22} className={direction === 'rtl' ? 'rotate-180' : ''} /></button>
        <span dir="ltr"><ScanSearch size={22} /> Lens</span>
      </header>
      {previewUrl && <div ref={stageRef} className="lens-results-image" inert={drawer.full} aria-hidden={drawer.full ? true : undefined}>
        <img ref={imageRef} src={previewUrl} alt={tr('Image à analyser', 'الصورة المراد تحليلها')} draggable={false} onLoad={measure} />
        <div className="lens-image-target" role="button" tabIndex={drawer.full ? -1 : 0} aria-label={tr('Sélectionner un produit dans l’image', 'تحديد منتج في الصورة')}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void search(selectionForPoint({ x: 50, y: 50 }, products.map(p => p.box))); } }}
          onPointerDown={e => { if (!e.isPrimary || e.button !== 0) return; tap.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerUp={e => { const start = tap.current; tap.current = null; if (start?.id === e.pointerId && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 10) tapImage(e.clientX, e.clientY); }}
          onPointerCancel={() => { tap.current = null; }} />
        {imgBox && <div className="lens-image-coordinates" style={{ left: imgBox.x, top: imgBox.y, width: imgBox.w, height: imgBox.h }}>
          {selectedBox && <div className="lens-selection" data-visualization="lens-detections" style={{ left: `${selectedBox.x}%`, top: `${selectedBox.y}%`, width: `${selectedBox.w}%`, height: `${selectedBox.h}%` }}>
            {(['nw', 'ne', 'sw', 'se'] as Corner[]).map(corner => <button type="button" key={corner} className={`lens-selection-corner lens-corner-${corner}`} aria-label={cornerLabel(corner)}
              onPointerDown={e => { if (!e.isPrimary || e.button !== 0) return; e.stopPropagation(); resizing.current = { box: selectedBox, corner, x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
              onPointerMove={e => { const d = resizing.current; if (d && e.currentTarget.hasPointerCapture(e.pointerId)) select(resizeSelection(d.box, d.corner, (e.clientX - d.x) / imgBox.w * 100, (e.clientY - d.y) / imgBox.h * 100)); }}
              onPointerUp={() => { if (resizing.current && selectedRef.current) void search(selectedRef.current); resizing.current = null; }}
              onPointerCancel={() => { if (resizing.current) select(resizing.current.box); resizing.current = null; }}
              onKeyDown={e => { const keys: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }; const delta = keys[e.key]; if (!delta) return; e.preventDefault(); const k = e.shiftKey ? 5 : 1; select(resizeSelection(selectedRef.current || selectedBox, corner, delta[0] * k, delta[1] * k)); }}
              onKeyUp={e => { if (e.key.startsWith('Arrow') && selectedRef.current) void search(selectedRef.current); }}><i aria-hidden="true" /></button>)}
          </div>}
          {products.map((product, i) => <button type="button" key={`${product.name}-${i}`} className="lens-product-dot" aria-label={tr(`Sélectionner : ${product.name}`, `تحديد: ${product.name}`)}
            style={{ left: `${product.box.x + product.box.w / 2}%`, top: `${product.box.y + product.box.h / 2}%` }} onClick={() => void search(product.box)}><i aria-hidden="true" /></button>)}
          {isLoading && <div className="lens-analysis-dots" aria-hidden="true" style={selectedBox ? { left: `${selectedBox.x}%`, top: `${selectedBox.y}%`, width: `${selectedBox.w}%`, height: `${selectedBox.h}%` } : undefined}>
            {[0, 1, 2, 3, 4].map(i => <i key={i} style={{ '--dot-index': i } as React.CSSProperties} />)}
          </div>}
        </div>}
      </div>}
      <section className="lens-results-sheet" aria-label={tr('Résultats Lens', 'نتائج Lens')}>
        {previewUrl && <button ref={handleRef} type="button" className="lens-sheet-handle" aria-label={drawer.full ? tr('Revenir à l’image', 'العودة إلى الصورة') : tr('Afficher tous les résultats', 'عرض كل النتائج')} aria-expanded={drawer.full} aria-controls="lens-result-list"
          onPointerDown={e => { if (!e.isPrimary || e.button !== 0) return; drawer.skipClick.current = false; drawer.begin(e.clientY); e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) drawer.move(e.clientY); }}
          onPointerUp={() => drawer.end()} onPointerCancel={() => drawer.end(true)}
          onClick={() => { if (drawer.skipClick.current) { drawer.skipClick.current = false; return; } drawer.snap(!drawer.full); }}
          onKeyDown={e => { if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) { e.preventDefault(); drawer.snap(e.key === 'ArrowUp' || e.key === 'Home'); } }}><span aria-hidden="true" /></button>}
        <div className="lens-sheet-summary" aria-hidden={drawer.full && previewUrl ? true : undefined}>
          {previewUrl && <img src={previewUrl} alt="" draggable={false} />}
          <div><h3>{tr('Résultats Lens', 'نتائج Lens')}{!isLoading && visible.length > 0 ? ` · ${visible.length}` : ''}</h3>
            <p>{isLoading ? tr('Analyse en cours…', 'جارٍ التحليل…') : name}</p></div>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{isLoading ? tr('Analyse en cours…', 'جارٍ التحليل…') : tr(`${visible.length} résultats disponibles`, `${visible.length} نتيجة متاحة`)}</p>
        <div ref={drawer.bodyRef} id="lens-result-list" className="lens-results-list" aria-busy={Boolean(isLoading)}
          onWheel={e => { if (previewUrl && !drawer.full && e.deltaY > 8) drawer.snap(true); }}
          onFocusCapture={e => { if (previewUrl && !drawer.full && e.target instanceof HTMLElement && e.target.matches('button:focus-visible,a:focus-visible')) drawer.snap(true); }}>
          {isLoading ? (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-xs font-bold text-muted"><Loader2 className="h-4 w-4 animate-spin" />{tr('Analyse en cours…', 'جارٍ التحليل…')}</div>
              <div className="grid grid-cols-2 gap-2.5">{[0,1,2,3].map(i => (<div key={i} className="animate-pulse bg-white p-2"><div className="aspect-square rounded-card bg-line" /><div className="mt-2 h-3 rounded bg-line" /><div className="mt-1 h-2 rounded bg-line w-2/3" /></div>))}</div>

            </div>
          ) : (
            <>
              {detected && detected.sourcePrice > 0 && (
                <div className="mb-3 bg-white p-3">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{tr('Prix repéré', 'سعر مكتشف')}</p>
                  <p className="text-sm font-bold text-ink line-clamp-2">{detected.title || name}</p>
                  <p className="text-lg font-black text-ink">{detected.totalPriceTND?.toFixed(2) || '—'} DT <span className="text-xs font-medium text-muted">{detected.sourcePrice.toFixed(2)} {detected.sourceCurrency}</span></p>
                  {onCommandDetected && <button type="button" onClick={() => onCommandDetected(detected)} className="mt-2 w-full rounded-control bg-ink py-2 text-xs font-bold text-white">{tr('Commander avec ce prix', 'الطلب بهذا السعر')}</button>}
                </div>
              )}
              {visible.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-control bg-surface text-muted"><ImageIcon size={22} /></div>

                  <p className="mt-2 text-sm font-bold text-ink">{tr('Aucune correspondance trouvée', 'لا توجد مطابقة')}</p>
                  <p className="mx-auto mt-1 max-w-[28ch] text-xs text-muted">{tr('Essayez une autre zone ou une image plus nette.', 'جرّب منطقة أخرى أو صورة أوضح.')}</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center"><button type="button" onClick={() => { clearSelection(); onReset(); }} className="rounded-control bg-ink px-5 py-2 text-xs font-bold text-white">{tr('Nouvelle recherche', 'بحث جديد')}</button></div>
                  <p className="mt-2 text-xs font-medium text-muted">{tr('Astuce : touchez directement le produit pour affiner la recherche.', 'نصيحة: المس المنتج مباشرة لتحسين البحث.')}</p>
                </div>
              ) : (
                <>
                  <div className="lens-result-grid grid grid-cols-2 md:grid-cols-3 gap-3">
                    {visible.slice(0, 12).map(c => { const pl = priceLine(c); return (
                      <article key={c.id} className="bg-white p-2.5 rounded-card border border-line/50 flex flex-col">
                        <div className="relative aspect-square overflow-hidden bg-surface"><CandidateImage candidate={c} fallback={fallbackImage} alt={c.title} /><MatchBadge value={c.match} /></div>
                        <h4 className="mt-1.5 line-clamp-2 break-words text-xs font-bold leading-snug text-ink">{c.title}</h4>
                        {c.colors.length > 0 || c.sizes.length > 0 ? (<p className="break-words whitespace-normal text-xs font-semibold leading-snug text-muted">{[c.brand, c.model].filter(Boolean).join(' ') || c.colors.join(' / ') || c.sizes.join(' / ')}</p>) : (<p className="text-xs font-medium text-muted">{tr('Tailles/couleurs : voir la fiche marchand', 'المقاسات/الألوان: انظر صفحة المتجر')}</p>)}
                        <p className="break-words whitespace-normal text-xs font-medium leading-snug text-muted">{c.source}</p>
                        <MerchantRating value={c}/>
                        <div className={`mt-1 px-2 py-1.5 ${pl.pending ? 'bg-amber-50 border border-amber-200' : 'bg-surface'}`}>
                          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{pl.pending ? tr('Prix sur devis', 'سعر عند الطلب') : tr('Prix final estimé', 'السعر النهائي التقديري')}</p>
                          <p className={`text-sm font-black ${pl.pending ? 'text-amber-700' : 'text-ink'}`}>{pl.tnd}</p>
                          <p className="break-words whitespace-normal text-xs font-semibold leading-snug text-muted">{pl.original ? `${tr('Prix boutique', 'سعر المتجر')} ${pl.original} • ${c.source}` : c.source}</p>
                          <p className="text-xs font-medium text-muted">{pl.pending ? tr('AYROVIX confirmera le prix avant commande.', 'سيؤكد AYROVIX السعر قبل الطلب.') : tr('Estimation tout inclus (douane + transport + service).', 'تقدير شامل (جمركة + شحن + خدمة).')}</p>
                        </div>
                        <button type="button" onClick={() => onChoose(c)} className="mt-2 min-h-11 w-full rounded-control bg-ink py-2 text-xs font-bold text-white">{pl.pending ? tr('Demander le prix', 'طلب السعر') : tr('Voir le produit', 'عرض المنتج')}</button>
                      </article>
                    );})}
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-muted"><ShieldCheck size={14} />{tr('Vérifiez le prix et les conditions dans la fiche produit.', 'تحقق من السعر والشروط في بطاقة المنتج.')}</div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
};
