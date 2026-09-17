import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { ArrowUpRight, Camera, Image as ImageIcon, ShieldCheck, Star, X, RefreshCw } from '../../components/QatafoIcons';
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
  onRoiSearch?: (roi: { x: number; y: number; w: number; h: number }) => void;
  onLassoSearch?: (file: File) => void;
  isLoading?: boolean;
  detectedProducts?: Array<{ name: string; box: [number,number,number,number] | null; category: string }>;
  customerIntent?: string;
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
    <span className="block text-[12px] font-extrabold leading-none text-ink">{value}%</span>
    <span className="block text-[8px] font-bold text-ink">Match</span>
  </span>
);

export const InteractiveLensResults: React.FC<Props> = ({ view, previewUrl, fallbackImage, onChoose, onReset, onCommandDetected, onLassoSearch, isLoading, detectedProducts, customerIntent }) => {
  const { tr, direction } = useLocale();
  const visible = useMemo(() => view.list.filter(isDisplayableCandidate).sort((a, b) => (b.match || 0) - (a.match || 0)), [view.list]);
  const best = visible[0];
  const name = view.queryLabel || best?.title || tr('Produit détecté par AYROVIX', 'منتج اكتشفته AYROVIX');
  const detected = view.detectedPrice;

  const [sheet, setSheet] = useState<'peek'|'half'|'full'>('peek');
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const sheetHeight = sheet === 'peek' ? '22%' : sheet === 'half' ? '45%' : '100%';
  const onHandleTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY; };
  const onHandleTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = startY.current - e.touches[0].clientY;
    if (dy > 60 && sheet !== 'full') setSheet('full');
    else if (dy < -60 && sheet === 'full') setSheet('half');
    else if (dy < -60 && sheet === 'half') setSheet('peek');
    else if (dy > 60 && sheet === 'peek') setSheet('half');
  };
  const onHandleTouchEnd = () => { startY.current = null; };

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
    const iRect = img.getBoundingClientRect();
    setImgBox({ x: iRect.left - cRect.left, y: iRect.top - cRect.top, w: iRect.width, h: iRect.height });
  }, []);

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
    if (!onLassoSearch) return;
    setShowPulse(true); setTimeout(()=> setShowPulse(false), 550);
    const file = await cropBoxToFile(box);
    if (file) onLassoSearch(file);
  }, [onLassoSearch, cropBoxToFile]);

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

  const priceLine = (c: AyrovixCandidate) => ({
    tnd: c.priceTnd != null ? `${c.priceTnd.toFixed(2)} DT` : '—',
    original: c.price != null ? `${Number(c.price).toFixed(Number(c.price)%1?2:0)} ${c.currency||''}` : null,
  });

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0A0A0A]" dir={direction}>
      <style>{`@keyframes pulseBox{0%{transform:scale(1);opacity:1}50%{transform:scale(1.03);opacity:0.95}100%{transform:scale(1);opacity:1}}`}</style>
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-black select-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        style={{ cursor: isPanning ? 'grabbing' : scale > 1 ? 'grab' : 'pointer', touchAction: scale > 1 ? 'none' : 'pan-y' }}
      >
        <div className="absolute inset-0 flex items-start justify-center pt-2 sm:pt-3">
          <div className="relative w-full h-full flex items-start justify-center">
            {previewUrl ? (
              <img ref={imgRef} src={previewUrl} alt={name} draggable={false} className="max-h-[calc(100%_-_8px)] max-w-full object-contain select-none" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transition: isPanning ? 'none' : 'transform 0.2s' }} onLoad={updateImgBox} />
            ) : (
              <div className="h-full w-full bg-[#111] grid place-items-center text-white/50"><ImageIcon size={40} /></div>
            )}
          </div>
          {isLoading && !selectedBox && (
            <div className="absolute inset-0 pointer-events-none">
              <span className="absolute h-2 w-2 rounded-full bg-white/80" style={{left:'22%', top:'28%'}} />
              <span className="absolute h-2 w-2 rounded-full bg-white/70" style={{left:'68%', top:'42%'}} />
              <span className="absolute h-2 w-2 rounded-full bg-white/60" style={{left:'45%', top:'62%'}} />
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
                  <circle cx={(p.box[0]+p.box[2]/2)*100} cy={(p.box[1]+p.box[3]/2)*100} r="2.2" fill="none" stroke="white" strokeWidth="0.25" opacity="0.5" />
                </g>
              ) : null)}
            </svg>
          </div>
        )}

        <div className="absolute left-2 right-2 top-12 flex items-center justify-between pointer-events-none">
          <div className="pointer-events-auto flex gap-1.5 items-center">
            <span className="hidden">Sélectionner</span>
            <span className="rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white/0 select-none pointer-events-none" aria-hidden>{tr('Sélectionner', 'تحديد')}</span>
            {selectedBox && (
              <button type="button" onClick={clearSelection} className="rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-bold text-white border border-white/20 backdrop-blur flex items-center gap-1"><X size={12} /> {tr('Effacer', 'مسح')}</button>
            )}
          </div>
          <div className="pointer-events-auto flex gap-1.5">
            <button type="button" onClick={() => setScale(s => Math.min(3, s + 0.3))} className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white border border-white/20 backdrop-blur">+</button>
            <button type="button" onClick={() => setScale(s => Math.max(1, s - 0.3))} className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white border border-white/20 backdrop-blur">−</button>
            <button type="button" onClick={() => { resetView(); clearSelection(); }} className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white border border-white/20 backdrop-blur"><RefreshCw size={14} /></button>
          </div>
        </div>

        <div className="absolute bottom-[calc(22%+10px)] left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[10px] font-medium text-white/80 backdrop-blur text-center max-w-[92%] leading-tight">
          {selectedBox ? tr('Produit sélectionné • Touchez un autre', 'تم التحديد • المس منتجا آخر') : tr('Touchez un produit', 'المس منتجًا')}
          {!selectedBox && scale === 1 ? ` • ${tr('Pincez pour zoomer', 'قرّب بأصابعك')}` : ''}
        </div>
      </div>

      <div ref={sheetRef} className={`absolute bottom-0 left-0 right-0 flex flex-col bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)] ${sheet === 'full' ? 'rounded-none' : 'rounded-t-[20px]'} overflow-hidden`} style={{ height: sheetHeight, transition: startY.current == null ? 'height 0.25s ease' : 'none' }}>
        <div className={`flex shrink-0 flex-col items-center gap-2 border-b border-line bg-white py-2 cursor-grab active:cursor-grabbing ${sheet === 'full' ? 'rounded-none' : 'rounded-t-[20px]'}`} onTouchStart={onHandleTouchStart} onTouchMove={onHandleTouchMove} onTouchEnd={onHandleTouchEnd} onMouseDown={e => { startY.current = e.clientY; const onMove = (ev: MouseEvent) => { if (startY.current == null) return; const dy = startY.current - ev.clientY; if (dy > 60 && sheet !== 'full') setSheet('full'); else if (dy < -60 && sheet === 'full') setSheet('half'); else if (dy < -60 && sheet === 'half') setSheet('peek'); else if (dy > 60 && sheet === 'peek') setSheet('half'); }; const onUp = () => { startY.current=null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }; window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp); }}>
          <span className="h-1.5 w-10 rounded-full bg-black/15" />
          <div className="flex w-full items-center justify-between pl-14 pr-2">
            <div>
              <h3 className="text-[14px] font-extrabold text-ink">{tr('Résultats Lens', 'نتائج Lens')} • {visible.length}</h3>
              <p className="text-[11px] font-medium text-muted truncate max-w-[22ch]">{name}</p>
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setSheet(s => s === 'full' ? 'half' : 'full')} className="rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-bold text-ink">{sheet === 'full' ? tr('Réduire', 'تصغير') : tr('Agrandir', 'تكبير')}</button>
              <button type="button" onClick={() => { clearSelection(); onReset(); }} className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-white">{tr('Nouvelle recherche', 'بحث جديد')}</button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto w-full px-2 py-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {isLoading ? (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-[12px] font-bold text-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" />{tr('Analyse en cours…', 'جارٍ التحليل…')}</div>
              <div className="grid grid-cols-2 gap-2.5">{[0,1,2,3].map(i => (<div key={i} className="animate-pulse bg-white p-2"><div className="aspect-square rounded-xl bg-line" /><div className="mt-2 h-3 rounded bg-line" /><div className="mt-1 h-2 rounded bg-line w-2/3" /></div>))}</div>
              <p className="text-center text-[11px] text-muted">{tr("AYROVIX analyse l'image…", 'تحلل AYROVIX الصورة…')}</p>
            </div>
          ) : (
            <>
              {detected && detected.sourcePrice > 0 && (
                <div className="mb-3 bg-white p-3">
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
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center"><button type="button" onClick={() => { clearSelection(); onReset(); }} className="rounded-full bg-ink px-5 py-2 text-xs font-bold text-white">{tr('Nouvelle recherche', 'بحث جديد')}</button><button type="button" onClick={() => onReset()} className="rounded-full border border-line bg-white px-5 py-2 text-xs font-bold text-ink">{tr('Recherches récentes', 'عمليات البحث الأخيرة')}</button></div>
                  <p className="mt-2 text-[11px] font-medium text-muted">{tr('Astuce : touchez directement le produit pour affiner la recherche.', 'نصيحة: المس المنتج مباشرة لتحسين البحث.')}</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 auto-rows-fr">
                    {visible.slice(0, 12).map(c => (
                      <article key={c.id} className="bg-white p-2.5 rounded-xl border border-line/50 flex flex-col">
                        <div className="relative aspect-square overflow-hidden bg-surface"><CandidateImage candidate={c} fallback={fallbackImage} alt={c.title} /><MatchBadge value={c.match} /></div>
                        <h4 className="mt-1.5 line-clamp-2 break-words text-[12px] font-bold leading-snug text-ink">{c.title}</h4>
                        {c.colors.length > 0 || c.sizes.length > 0 ? (<p className="break-words whitespace-normal text-[10px] font-semibold leading-snug text-muted">{[c.brand, c.model].filter(Boolean).join(' ') || c.colors.join(' / ') || c.sizes.join(' / ')}</p>) : (<p className="text-[10px] font-medium text-muted">{tr('Tailles/couleurs : voir la fiche marchand', 'المقاسات/الألوان: انظر صفحة المتجر')}</p>)}
                        <p className="break-words whitespace-normal text-[10px] font-medium leading-snug text-muted">{c.source}</p>
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold" style={{color:'#FFC107'}}><Star size={11} fill="currentColor" />{displayRating(c).toFixed(1)}</div>
                        <div className="mt-1 bg-surface px-2 py-1.5">
                          <p className="text-[9px] font-extrabold uppercase tracking-wide text-muted">{tr('Prix final estimé', 'السعر النهائي التقديري')}</p>
                          <p className="text-[13px] font-black text-ink">{priceLine(c).tnd}</p>
                          <p className="break-words whitespace-normal text-[10px] font-semibold leading-snug text-muted">{priceLine(c).original ? `${tr('Prix boutique', 'سعر المتجر')} ${priceLine(c).original} • ${c.source}` : c.source}</p>
                          <p className="text-[9px] font-medium text-muted">{tr('Estimation tout inclus (douane + transport + service).', 'تقدير شامل (جمركة + شحن + خدمة).')}</p>
                        </div>
                        <button type="button" onClick={() => onChoose(c)} className="mt-2 w-full rounded-full bg-ink py-2 text-[11px] font-bold text-white">{tr('Voir le produit', 'عرض المنتج')}</button>
                      </article>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium text-muted"><ShieldCheck size={14} />{tr('Prix vérifiés et marchands fiables', 'أسعار متحقق منها وتجار موثوقون')}</div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
