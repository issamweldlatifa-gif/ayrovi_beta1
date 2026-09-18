import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { ArrowUpRight, Camera, Image as ImageIcon, ShieldCheck, Star, X, RefreshCw } from '../../components/QatafoIcons';
import type { AyrovixCandidate, AyrovixDetectedPrice } from '../types';
import { displayRating, isDisplayableCandidate, isLenientCandidate } from '../services/resultPolicy';
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
          <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-sm font-black text-ink shadow-sm border border-line">
            <img src={favicon} alt="" width={18} height={18} loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display='none'; }} />
          </div>
          <span className="max-w-[78px] truncate text-xs font-bold text-muted">{candidate.source}</span>
        </div>
      );
    }
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-surface p-2 text-center">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-sm font-black text-ink shadow-sm border border-line">
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

export const InteractiveLensResults: React.FC<Props> = ({ view, previewUrl, fallbackImage, onChoose, onReset, onCommandDetected, onRoiSearch, onLassoSearch, isLoading, detectedProducts, customerIntent, shell }) => {
  const { tr, direction } = useLocale();
  const visible = useMemo(() => {
    const strict = view.list.filter(isDisplayableCandidate).sort((a, b) => (b.match || 0) - (a.match || 0));
    if (strict.length) return strict;
    // D2-10 lenient PENDING — show "Prix à confirmer" instead of 0 results when lens has matches without price
    return view.list.filter(isLenientCandidate).sort((a, b) => (b.match || 0) - (a.match || 0));
  }, [view.list]);
  const best = visible[0];
  const name = view.queryLabel || best?.title || tr('Produit détecté par AYROVIX', 'منتج اكتشفته AYROVIX');
  const detected = view.detectedPrice;

  const [sheet, setSheet] = useState<'peek'|'full'>('peek');
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  // Phase 1: peek 38% (was 22%) so results are immediately visible without pull — product stays visible above
  // Drawer vrai (référence) : suit le doigt, aimante entre peek (38 %) et page complète (100 %).
  // Tirer vers le bas sous le peek = fermer le tiroir → retour à la caméra Lens (onReset).
  const [dragH, setDragH] = useState<number | null>(null);
  const dragDy = useRef(0);
  const sheetGeom = () => {
    const host = sheetRef.current?.parentElement;
    const ch = host?.clientHeight ?? window.innerHeight;
    return { ch, peek: Math.round(ch * 0.38) };
  };
  const dragStart = (clientY: number) => { startY.current = clientY; dragDy.current = 0; };
  const dragMove = (clientY: number) => {
    if (startY.current == null) return;
    const dy = startY.current - clientY;
    dragDy.current = dy;
    const { ch, peek } = sheetGeom();
    const base = sheet === 'full' ? ch : peek;
    // petit caoutchouc aux bornes, jamais sous 0
    setDragH(Math.max(0, Math.min(ch + 36, base + dy)));
  };
  const dragEnd = () => {
    startY.current = null;
    const { ch, peek } = sheetGeom();
    const h = dragH;
    setDragH(null);
    if (h == null) return;
    if (sheet === 'full') {
      if (h < ch * 0.74) setSheet('peek');
    } else if (h < peek * 0.55) {
      onReset(); // tiré vers le bas sous le peek → on retourne dans Lens (caméra)
    } else if (h > peek * 1.35) {
      setSheet('full');
    }
  };
  const onHandleTouchStart = (e: React.TouchEvent) => { dragStart(e.touches[0].clientY); };
  const onHandleTouchMove = (e: React.TouchEvent) => { dragMove(e.touches[0].clientY); };
  const onHandleTouchEnd = () => { dragEnd(); };

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const lastDist = useRef<number | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgBox, setImgBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // GOOGLE LENS LEVEL: instant tap selection — no freehand lasso, ultra-light
  const [selectedBox, setSelectedBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [showPulse, setShowPulse] = useState(false);
  const tapStart = useRef<{ x: number; y: number; t: number } | null>(null);

  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); };
  const clearSelection = useCallback(() => {
    setSelectedBox(null);
    setShowPulse(false);
  }, []);

  const updateImgBox = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) { setImgBox(null); return; }
    const cRect = container.getBoundingClientRect();
    if (shell && img.naturalWidth && img.naturalHeight) {
      // object-cover : le contenu visible déborde du conteneur — rect réel = image centrée, échelle max, + pan/zoom
      const k = Math.max(cRect.width / img.naturalWidth, cRect.height / img.naturalHeight) * scale;
      const w = img.naturalWidth * k;
      const h = img.naturalHeight * k;
      setImgBox({ x: (cRect.width - w) / 2 + offset.x, y: (cRect.height - h) / 2 + offset.y, w, h });
      return;
    }
    const iRect = img.getBoundingClientRect();
    setImgBox({ x: iRect.left - cRect.left, y: iRect.top - cRect.top, w: iRect.width, h: iRect.height });
  }, [shell, scale, offset.x, offset.y]);

  useEffect(() => {
    updateImgBox();
    const onResize = () => updateImgBox();
    window.addEventListener('resize', onResize);
    const img = imgRef.current;
    if (img) { img.addEventListener('load', updateImgBox); if (img.complete) updateImgBox(); }
    return () => { window.removeEventListener('resize', onResize); if (img) img.removeEventListener('load', updateImgBox); };
  }, [previewUrl, updateImgBox, scale, offset]);
  useEffect(() => { const id = requestAnimationFrame(updateImgBox); return () => cancelAnimationFrame(id); }, [scale, offset, updateImgBox]);

  const clientToPercent = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return null;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }, []);
  const isInsideImage = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return false;
    const r = img.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }, []);

  // Crop selected BOX to File — 18% pad, instant (no path calc)
  const cropBoxToFile = useCallback(async (box: { x:number; y:number; w:number; h:number }): Promise<File | null> => {
    if (!previewUrl) return null;
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = previewUrl;
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('load')); });
      const natW = img.naturalWidth, natH = img.naturalHeight;
      if (!natW || !natH) return null;
      let x = (box.x/100)*natW, y = (box.y/100)*natH, w = (box.w/100)*natW, h = (box.h/100)*natH;
      if (w < 20 || h < 20) return null;
      const pad = Math.max(24, Math.max(w, h) * 0.18);
      let padX = x - pad, padY = y - pad, padW = w + pad*2, padH = h + pad*2;
      if (padX < 0) { padW += padX; padX = 0; }
      if (padY < 0) { padH += padY; padY = 0; }
      if (padX + padW > natW) padW = natW - padX;
      if (padY + padH > natH) padH = natH - padY;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(padW); canvas.height = Math.round(padH);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, padX, padY, padW, padH, 0, 0, padW, padH);
      const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
      if (!blob) return null;
      return new File([blob], 'lens-select.jpg', { type: 'image/jpeg' });
    } catch { return null; }
  }, [previewUrl]);

  // AYROVIX ULTRA-PRECISE TAP: every region of pants/shoes selectable — no dead zone
  // Sleeve→shirt, any pants pixel→pants, any shoe pixel→shoe, instant free search on new tap
  // PERFORMANCE: tap = fast local, no AI per movement
  const findBoxForTap = useCallback((tap: {x:number;y:number}): { x:number;y:number;w:number;h:number } => {
    if (detectedProducts && detectedProducts.length) {
      // Expanded hit-test 9% each side — forgiving for edges, picks smallest containing box (shoe over pants)
      const hits: Array<{box:[number,number,number,number], area:number, dist:number}> = [];
      for (const prod of detectedProducts) {
        if (!prod.box) continue;
        const [bx,by,bw,bh]=prod.box;
        const bx0=bx*100, by0=by*100, bx1=(bx+bw)*100, by1=(by+bh)*100;
        const pad=9;
        const ex0=Math.max(0,bx0-pad), ey0=Math.max(0,by0-pad), ex1=Math.min(100,bx1+pad), ey1=Math.min(100,by1+pad);
        const inside = tap.x >= ex0 && tap.x <= ex1 && tap.y >= ey0 && tap.y <= ey1;
        if (inside) {
          const area=bw*bh;
          const cx=(bx0+bx1)/2, cy=(by0+by1)/2;
          const dist=Math.hypot(tap.x-cx, tap.y-cy);
          hits.push({box: prod.box, area, dist});
        }
      }
      if (hits.length) {
        hits.sort((a,b)=> a.area - b.area || a.dist - b.dist);
        const [bx,by,bw,bh]=hits[0].box;
        return { x: bx*100, y: by*100, w: bw*100, h: bh*100 };
      }
      // No expanded hit → nearest center with 28% forgiving radius (covers far edge taps)
      let best:{box:[number,number,number,number], dist:number} | null=null;
      for (const prod of detectedProducts) {
        if (!prod.box) continue;
        const [bx,by,bw,bh]=prod.box;
        const cx=(bx*100+(bx+bw)*100)/2, cy=(by*100+(by+bh)*100)/2;
        const dist=Math.hypot(tap.x-cx, tap.y-cy);
        if (!best || dist < best.dist) best={box: prod.box, dist};
      }
      if (best && best.dist < 28) {
        const [bx,by,bw,bh]=best.box;
        return { x: bx*100, y: by*100, w: bw*100, h: bh*100 };
      }
    }
    // Fallback: 26% centered box — larger for better visibility, never dead
    const size=26;
    return { x: Math.max(0, tap.x - size/2), y: Math.max(0, tap.y - size/2), w: Math.min(size, 100 - Math.max(0, tap.x - size/2)), h: Math.min(size, 100 - Math.max(0, tap.y - size/2)) };
  }, [detectedProducts]);

  const triggerTapSearch = useCallback(async (box: { x:number;y:number;w:number;h:number }) => {
    setShowPulse(true); setTimeout(()=> setShowPulse(false), 550);
    // D2-8: prefer backend ROI crop (no canvas, saves 80-150ms + 60KB) — backend sharp extracts with 18% pad
    if (onRoiSearch) {
      onRoiSearch(box);
      return;
    }
    if (!onLassoSearch) return;
    const t0 = performance.now();
    const file = await cropBoxToFile(box);
    const cropMs = Math.round(performance.now() - t0);
    if (file) onLassoSearch(file, cropMs);
  }, [onRoiSearch, onLassoSearch, cropBoxToFile]);

  const handleTap = useCallback((clientX:number, clientY:number) => {
    if (scale > 1) return; // pan mode when zoomed
    if (!isInsideImage(clientX, clientY)) return;
    const pt = clientToPercent(clientX, clientY);
    if (!pt) return;
    if (sheet !== 'peek') setSheet('peek');
    const box = findBoxForTap(pt);
    if (!box) return;
    setSelectedBox(box);
    triggerTapSearch(box);
  }, [scale, isInsideImage, clientToPercent, findBoxForTap, triggerTapSearch, sheet]);

  // Pointer handlers — ultra-light: only tap + pinch/pan, no lasso path
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      lastDist.current = d;
      return;
    }
    if (e.touches.length === 1) {
      const t = e.touches[0];
      tapStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      if (scale > 1) {
        panStart.current = { x: t.clientX, y: t.clientY, ox: offset.x, oy: offset.y };
        setIsPanning(true);
      }
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastDist.current != null) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const factor = d / lastDist.current;
      setScale(s => Math.min(3, Math.max(1, s * factor)));
      lastDist.current = d;
      return;
    }
    if (e.touches.length === 1 && panStart.current && scale > 1) {
      const dx = e.touches[0].clientX - panStart.current.x;
      const dy = e.touches[0].clientY - panStart.current.y;
      setOffset({ x: panStart.current.ox + dx, y: panStart.current.oy + dy });
      if (e.cancelable) e.preventDefault();
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      lastDist.current = null;
      if (panStart.current) { panStart.current = null; setIsPanning(false); return; }
      const start = tapStart.current;
      tapStart.current = null;
      if (!start) return;
      const end = e.changedTouches[0];
      if (!end) return;
      const dx = end.clientX - start.x, dy = end.clientY - start.y;
      const dist = Math.hypot(dx, dy);
      const dur = Date.now() - start.t;
      if (dist < 12 && dur < 400) {
        handleTap(end.clientX, end.clientY);
      }
    }
  };
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    tapStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    if (scale > 1) {
      panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      setIsPanning(true);
    }
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (panStart.current && scale > 1) {
      const dx = e.clientX - panStart.current.x, dy = e.clientY - panStart.current.y;
      setOffset({ x: panStart.current.ox + dx, y: panStart.current.oy + dy });
    }
  };
  const onMouseUp = (e: React.MouseEvent) => {
    if (panStart.current) { panStart.current = null; setIsPanning(false); return; }
    const start = tapStart.current; tapStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) < 8 && Date.now() - start.t < 400) handleTap(e.clientX, e.clientY);
  };
  const onMouseLeave = () => { panStart.current = null; setIsPanning(false); tapStart.current = null; };

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
    <div className={`relative flex ${shell ? 'h-full' : 'h-[100dvh]'} w-full flex-col overflow-hidden bg-ink-deep`} dir={direction}>
      <style>{`@keyframes pulseBox{0%{transform:scale(1);opacity:1}50%{transform:scale(1.03);opacity:0.95}100%{transform:scale(1);opacity:1}}`}</style>
      <div
        ref={containerRef}
        className={`relative flex-1 overflow-hidden ${shell ? 'bg-black' : 'bg-surface'} select-none`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        style={{ cursor: isPanning ? 'grabbing' : scale > 1 ? 'grab' : 'pointer', touchAction: scale > 1 ? 'none' : 'pan-y' }}
      >
        <div className={`absolute inset-0 flex justify-center ${shell ? 'items-center' : 'items-start pt-2 sm:pt-3'}`}>
          <div className="relative h-full w-full flex items-center justify-center">
            {previewUrl ? (
              <img ref={imgRef} src={previewUrl} alt={name} draggable={false} className={shell ? 'h-full w-full object-cover select-none' : 'max-h-[calc(100%_-_8px)] max-w-full object-contain select-none'} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transition: isPanning ? 'none' : 'transform 0.2s' }} onLoad={updateImgBox} />
            ) : (
              <div className="h-full w-full bg-[#111] grid place-items-center text-white/50"><ImageIcon size={40} /></div>
            )}
          </div>
          {isLoading && !selectedBox && (
            <div className="absolute inset-0 pointer-events-none" aria-label={tr('Analyse en cours', 'جارٍ التحليل')}>
              <span className="absolute h-2.5 w-2.5 animate-bounce rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.25)]" style={{left:'22%', top:'28%', animationDelay:'-0.3s'}} />
              <span className="absolute h-2.5 w-2.5 animate-bounce rounded-full bg-white/90 shadow-[0_0_0_4px_rgba(255,255,255,0.2)]" style={{left:'68%', top:'42%', animationDelay:'-0.15s'}} />
              <span className="absolute h-2.5 w-2.5 animate-bounce rounded-full bg-white/80 shadow-[0_0_0_4px_rgba(255,255,255,0.15)]" style={{left:'45%', top:'62%'}} />
            </div>
          )}
        </div>

        {/* GOOGLE LENS LEVEL: instant box highlight — 1 rect, no heavy path */}
        {imgBox && selectedBox && (
          <div className="absolute pointer-events-none" style={{ left: imgBox.x, top: imgBox.y, width: imgBox.w, height: imgBox.h }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              {/* dim outside selected */}
              <path d={`M0 0 H100 V100 H0 Z M${selectedBox.x} ${selectedBox.y} H${selectedBox.x+selectedBox.w} V${selectedBox.y+selectedBox.h} H${selectedBox.x} Z`} fill="rgba(0,0,0,0.38)" fillRule="evenodd" />
              {/* white frame */}
              <rect x={selectedBox.x} y={selectedBox.y} width={selectedBox.w} height={selectedBox.h} fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="0.85" rx="1" vectorEffect="non-scaling-stroke" style={showPulse ? { animation: 'pulseBox 0.55s ease' } : undefined} />
              <rect x={selectedBox.x} y={selectedBox.y} width={selectedBox.w} height={selectedBox.h} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1.6" rx="1" vectorEffect="non-scaling-stroke" style={{ filter: 'blur(0.9px)' }} />
            </svg>
          </div>
        )}

        {/* idle: Google Lens dots — minimal, not full boxes */}
        {imgBox && detectedProducts && detectedProducts.length > 1 && !selectedBox && (
          <div className="absolute pointer-events-none" style={{ left: imgBox.x, top: imgBox.y, width: imgBox.w, height: imgBox.h }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              {detectedProducts.map((p,i)=> p.box ? (
                <g key={i}>
                  {/* subtle dot at center — Google Lens style */}
                  <circle cx={(p.box[0]+p.box[2]/2)*100} cy={(p.box[1]+p.box[3]/2)*100} r="1.1" fill="white" opacity="0.9" />
                  <circle cx={(p.box[0]+p.box[2]/2)*100} cy={(p.box[1]+p.box[3]/2)*100} r="2.2" fill="none" stroke="white" strokeWidth="0.25" opacity="0.5" className="animate-pulse" />
                </g>
              ) : null)}
            </svg>
          </div>
        )}

        {!shell && (
        <div className={`absolute left-2 right-2 top-12 flex items-center justify-between pointer-events-none`}>
          {/* shell: icônes blanches à intérieur transparent posées directement sur l'image, comme la référence */}
          <div className="pointer-events-auto flex gap-1.5 items-center">
            <span className="hidden">Sélectionner</span>
            {selectedBox && (
              <button type="button" onClick={clearSelection} className="flex items-center gap-1 rounded-full border border-white/20 bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur"><X size={12} /> {tr('Effacer', 'مسح')}</button>
            )}
          </div>
          <div className="pointer-events-auto flex gap-1.5">
            <button type="button" onClick={() => setScale(s => Math.min(3, s + 0.3))} className="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur">+</button>
            <button type="button" onClick={() => setScale(s => Math.max(1, s - 0.3))} className="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur">−</button>
            <button type="button" onClick={() => { resetView(); clearSelection(); }} className="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur"><RefreshCw size={14} /></button>
          </div>
        </div>
        )}

        <div className={`absolute bottom-[calc(38%+12px)] left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 text-xs font-medium text-center max-w-[92%] leading-tight ${shell ? 'bg-black/55 text-white backdrop-blur' : 'bg-black/60 text-white/90 backdrop-blur'}`}>
          {selectedBox ? tr('Produit sélectionné • Touchez un autre', 'تم التحديد • المس منتجا آخر') : tr('Touchez un produit', 'المس منتجًا')}
          {!selectedBox && scale === 1 ? ` • ${tr('Pincez pour zoomer', 'قرّب بأصابعك')}` : ''}
        </div>
      </div>

      <div ref={sheetRef} className={`absolute bottom-0 left-0 right-0 flex flex-col bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)] ${sheet === 'full' && dragH == null ? 'rounded-none' : 'rounded-t-[20px]'} overflow-hidden`} style={{ height: dragH != null ? `${dragH}px` : sheet === 'full' ? '100%' : '38%', transition: dragH == null ? 'height 0.25s ease' : 'none' }}>
        <div className={`flex shrink-0 flex-col items-center gap-2 border-b border-line bg-white py-2 cursor-grab active:cursor-grabbing ${sheet === 'full' ? 'rounded-none' : 'rounded-t-[20px]'}`} onTouchStart={onHandleTouchStart} onTouchMove={onHandleTouchMove} onTouchEnd={onHandleTouchEnd} onMouseDown={e => { dragStart(e.clientY); const onMove = (ev: MouseEvent) => dragMove(ev.clientY); const onUp = () => { dragEnd(); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }; window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp); }}>
          <span className="h-1.5 w-10 rounded-full bg-black/15" />
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pl-2 pr-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-extrabold text-ink leading-tight break-words">{tr('Résultats Lens', 'نتائج Lens')} • {visible.length}</h3>
              <p className="text-xs font-medium text-muted break-words line-clamp-2 leading-snug">{name}</p>
              {previewUrl && <p className="text-xs font-medium text-muted/70 break-words">{tr('Votre image ci-dessus — touchez pour sélectionner', 'صورتك أعلاه — المس للتحديد')}</p>}
            </div>
            <div className="flex gap-1.5 shrink-0 flex-wrap items-center justify-end">
              {shell && selectedBox && (
                <button type="button" onClick={clearSelection} className="grid h-8 place-items-center shrink-0 rounded-full border border-line bg-surface px-2.5 text-xs font-bold text-ink"><X size={12} /> {tr('Effacer', 'مسح')}</button>
              )}
              {shell && (
                <span className="flex gap-1">
                  <button type="button" onClick={() => setScale(s => Math.min(3, s + 0.3))} aria-label={tr('Zoomer', 'تكبير')} className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-sm font-bold text-ink">+</button>
                  <button type="button" onClick={() => setScale(s => Math.max(1, s - 0.3))} aria-label={tr('Dézoomer', 'تصغير')} className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-sm font-bold text-ink">−</button>
                  <button type="button" onClick={() => { resetView(); clearSelection(); }} aria-label={tr('Réinitialiser la vue', 'إعادة ضبط العرض')} className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-ink"><RefreshCw size={13} /></button>
                </span>
              )}
              <button type="button" onClick={() => setSheet(s => s === 'full' ? 'peek' : 'full')} className="shrink-0 rounded-full border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-ink whitespace-nowrap">{sheet === 'full' ? tr('Réduire', 'تصغير') : tr('Agrandir', 'تكبير')}</button>
              <button type="button" onClick={() => { clearSelection(); onReset(); }} className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white whitespace-nowrap">{tr('Nouvelle recherche', 'بحث جديد')}</button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto w-full px-2 py-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {isLoading ? (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-xs font-bold text-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" />{tr('Analyse en cours…', 'جارٍ التحليل…')}</div>
              <div className="grid grid-cols-2 gap-2.5">{[0,1,2,3].map(i => (<div key={i} className="animate-pulse bg-white p-2"><div className="aspect-square rounded-xl bg-line" /><div className="mt-2 h-3 rounded bg-line" /><div className="mt-1 h-2 rounded bg-line w-2/3" /></div>))}</div>
              <p className="text-center text-xs text-muted">{tr("AYROVIX analyse l'image…", 'تحلل AYROVIX الصورة…')}</p>
            </div>
          ) : (
            <>
              {detected && detected.sourcePrice > 0 && (
                <div className="mb-3 bg-white p-3">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{tr('Prix repéré', 'سعر مكتشف')}</p>
                  <p className="text-sm font-bold text-ink line-clamp-2">{detected.title || name}</p>
                  <p className="text-lg font-black text-ink">{detected.totalPriceTND?.toFixed(2) || '—'} DT <span className="text-xs font-medium text-muted">{detected.sourcePrice.toFixed(2)} {detected.sourceCurrency}</span></p>
                  {onCommandDetected && <button type="button" onClick={() => onCommandDetected(detected)} className="mt-2 w-full rounded-full bg-ink py-2 text-xs font-bold text-white">{tr('Commander avec ce prix', 'الطلب بهذا السعر')}</button>}
                </div>
              )}
              {visible.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface text-muted"><ImageIcon size={22} /></div>
                  <p className="mt-2 text-sm font-bold text-ink">{tr('Aucune correspondance', 'لا توجد نتائج')}</p>
                  <p className="mt-2 text-sm font-bold text-ink">{tr('Aucune correspondance trouvée', 'لا توجد مطابقة')}</p>
                  <p className="mx-auto mt-1 max-w-[28ch] text-xs text-muted">{tr('Essayez une autre zone ou une image plus nette.', 'جرّب منطقة أخرى أو صورة أوضح.')}</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center"><button type="button" onClick={() => { clearSelection(); onReset(); }} className="rounded-full bg-ink px-5 py-2 text-xs font-bold text-white">{tr('Nouvelle recherche', 'بحث جديد')}</button><button type="button" onClick={() => onReset()} className="rounded-full border border-line bg-white px-5 py-2 text-xs font-bold text-ink">{tr('Recherches récentes', 'عمليات البحث الأخيرة')}</button></div>
                  <p className="mt-2 text-xs font-medium text-muted">{tr('Astuce : touchez directement le produit pour affiner la recherche.', 'نصيحة: المس المنتج مباشرة لتحسين البحث.')}</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 auto-rows-fr">
                    {visible.slice(0, 12).map(c => { const pl = priceLine(c); return (
                      <article key={c.id} className="bg-white p-2.5 rounded-xl border border-line/50 flex flex-col">
                        <div className="relative aspect-square overflow-hidden bg-surface"><CandidateImage candidate={c} fallback={fallbackImage} alt={c.title} /><MatchBadge value={c.match} /></div>
                        <h4 className="mt-1.5 line-clamp-2 break-words text-xs font-bold leading-snug text-ink">{c.title}</h4>
                        {c.colors.length > 0 || c.sizes.length > 0 ? (<p className="break-words whitespace-normal text-xs font-semibold leading-snug text-muted">{[c.brand, c.model].filter(Boolean).join(' ') || c.colors.join(' / ') || c.sizes.join(' / ')}</p>) : (<p className="text-xs font-medium text-muted">{tr('Tailles/couleurs : voir la fiche marchand', 'المقاسات/الألوان: انظر صفحة المتجر')}</p>)}
                        <p className="break-words whitespace-normal text-xs font-medium leading-snug text-muted">{c.source}</p>
                        <div className="mt-0.5 flex items-center gap-1 text-xs font-bold" style={{color:'#FF6900'}}><Star size={11} fill="currentColor" />{displayRating(c).toFixed(1)}</div>
                        <div className={`mt-1 px-2 py-1.5 ${pl.pending ? 'bg-amber-50 border border-amber-200' : 'bg-surface'}`}>
                          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{pl.pending ? tr('Prix sur devis', 'سعر عند الطلب') : tr('Prix final estimé', 'السعر النهائي التقديري')}</p>
                          <p className={`text-sm font-black ${pl.pending ? 'text-amber-700' : 'text-ink'}`}>{pl.tnd}</p>
                          <p className="break-words whitespace-normal text-xs font-semibold leading-snug text-muted">{pl.original ? `${tr('Prix boutique', 'سعر المتجر')} ${pl.original} • ${c.source}` : c.source}</p>
                          <p className="text-xs font-medium text-muted">{pl.pending ? tr('AYROVIX confirmera le prix avant commande.', 'سيؤكد AYROVIX السعر قبل الطلب.') : tr('Estimation tout inclus (douane + transport + service).', 'تقدير شامل (جمركة + شحن + خدمة).')}</p>
                        </div>
                        <button type="button" onClick={() => onChoose(c)} className={`mt-2 w-full rounded-full py-2 text-xs font-bold text-white ${pl.pending ? 'bg-amber-600' : 'bg-ink'}`}>{pl.pending ? tr('Demander le prix', 'طلب السعر') : tr('Voir le produit', 'عرض المنتج')}</button>
                      </article>
                    );})}
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-muted"><ShieldCheck size={14} />{tr('Prix vérifiés et marchands fiables', 'أسعار متحقق منها وتجار موثوقون')}</div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
