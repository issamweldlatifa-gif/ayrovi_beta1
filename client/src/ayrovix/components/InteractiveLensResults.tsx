import { LensProductCard } from './LensProductCard';
import { useLensFavorites } from './useLensFavorites';
import type { CustomerSession } from '../../types';
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ScanSearch, Loader2, Image as ImageIcon } from '../../components/QatafoIcons';
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
  customerSession?: CustomerSession | null;
  onOpenFavorites?: () => void;
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

export const InteractiveLensResults: React.FC<Props> = ({ view, previewUrl, fallbackImage, onChoose, onReset, onCommandDetected, onRoiSearch, onLassoSearch, isLoading, detectedProducts, shell, customerSession, onOpenFavorites }) => {
  const { tr, direction } = useLocale();
  const favorites = useLensFavorites(customerSession, onOpenFavorites);
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
                  {favorites.message && <p className="lens-favorite-notice" role="status">{favorites.message === 'auth' ? tr('Connectez-vous à votre compte pour enregistrer vos favoris.', 'سجّل الدخول إلى حسابك لحفظ المفضلة.') : tr('Impossible de mettre à jour les favoris. Réessayez avec le cœur.', 'تعذر تحديث المفضلة. أعد المحاولة من زر القلب.')}</p>}
                  <div className="lens-result-grid grid grid-cols-2 md:grid-cols-3 gap-3">
                    {visible.slice(0, 12).map(candidate => <LensProductCard key={candidate.id} candidate={candidate} onChoose={onChoose} saved={favorites.isSaved(candidate)} busy={favorites.busy} onFavorite={favorites.toggle} />)}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
};
