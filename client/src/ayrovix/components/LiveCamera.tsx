import React, { useEffect, useRef, useState } from 'react';
import type { CodeScanResult, CodeScanSession } from '../services/qr';
import { ArrowRight, Barcode, Camera, Check, Image as ImageIcon, ScanSearch, ShoppingBag, Sparkles, Zap } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import { LensContextHeader } from './LensNavigation';
import { analyzeImage } from '../services/lensApi';
import { frameSignature, signatureDistance, liveObjectId, type LiveDetectedObject } from '../services/liveScanner';

export interface LiveResultsView {
  queryLabel: string | null;
  list: import('../types').AyrovixCandidate[];
  eventId: string;
  detectedPrice?: import('../types').AyrovixDetectedPrice | null;
}

interface LiveCameraProps {
  onPhoto: (file: File) => void;
  onQrUrl: (url: string) => void;
  onBarcode: (code: string) => void;
  onCodeText: (value: string) => void;
  onLink: (url: string) => void;
  onClose: () => void;
  onMenu: () => void;
  onCameraFailed: () => void;
  liveEnabled?: boolean;
  onLiveResults?: (view: LiveResultsView) => void;
}

type CameraMode = 'search' | 'upload' | 'code';
type CamMode = 'photo' | 'video';

/**
 * AYROVIX Lens — Camera UX (PHOTO + VIDÉO LIVE).
 * الكاميرا full-screen والـcontrols overlay. نفس الـstream يستمر عند التبديل
 * PHOTO↔VIDÉO (لا إعادة فتح). VIDÉO = live detection فقط (لا تسجيل/رفع فيديو).
 * الأسعار من الـ Core Engine عبر الـ candidates — لا pricing في الـ client.
 */
export const LiveCamera: React.FC<LiveCameraProps> = ({ onPhoto, onQrUrl, onBarcode, onCodeText, onLink, onClose, onMenu, onCameraFailed, liveEnabled = false, onLiveResults }) => {
  const { direction, tr } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<CameraMode>('search');
  const [camMode, setCamMode] = useState<CamMode>('photo');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchHint, setTorchHint] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const modeRef = useRef<CameraMode>('search');
  modeRef.current = mode;

  // ===== LIVE multi-product vision =====
  const [lockedObjects, setLockedObjects] = useState<LiveDetectedObject[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [liveGuidance, setLiveGuidance] = useState<string | null>(null);
  const [liveScanning, setLiveScanning] = useState(false);
  const lastSigRef = useRef('');
  const lastDescRef = useRef('');
  const confirmRef = useRef(0);
  const pendingAbortRef = useRef<AbortController | null>(null);
  const inflightRef = useRef(false);

  // Camera lifecycle: init once, stop tracks on unmount
  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) { onCameraFailed(); return; }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) { video.srcObject = stream; await video.play().catch(() => {}); }
        const track = stream.getVideoTracks()[0];
        try {
          const capabilities = (track.getCapabilities?.() || {}) as any;
          setTorchAvailable(Boolean(capabilities.torch));
        } catch {}
      })
      .catch(() => { if (!cancelled) onCameraFailed(); });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Contextual hint: يظهر عند تبديل الوضع ثم يختفي تلقائيًا
  useEffect(() => {
    if (mode === 'code') { setHint(tr('Visez un QR code ou un code-barres.', 'وجّه الكاميرا إلى رمز QR أو رمز شريطي.')); }
    else if (camMode === 'video') { setHint(tr('Déplacez la caméra pour détecter les produits.', 'حرّك الكاميرا لاكتشاف المنتجات.')); }
    else { setHint(tr('Cadrez le produit et prenez une photo.', 'ضع المنتج في الإطار والتقط صورة.')); }
    const t = window.setTimeout(() => setHint(null), 2600);
    return () => window.clearTimeout(t);
  }, [mode, camMode, tr]);

  // Code scan (QR/Barcode) — priorité identifiant exact
  useEffect(() => {
    if (mode !== 'code') return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let session: CodeScanSession | null = null;
    void import('../services/qr').then(({ startCodeScan }) => {
      if (cancelled) return;
      session = startCodeScan(video, (result: CodeScanResult) => {
        if (result.kind === 'url') onQrUrl(result.value);
        else if (result.kind === 'barcode') onBarcode(result.value);
        else onCodeText(result.value);
      });
    }).catch(() => setNotice(tr('Le lecteur de code n’a pas pu être chargé.', 'تعذّر تحميل قارئ الرموز.')));
    return () => { cancelled = true; session?.stop(); };
  }, [mode, onQrUrl, onBarcode, onCodeText]);

  // ===== LIVE: échantillonnage adaptatif + confirmation temporelle (VIDÉO فقط) =====
  useEffect(() => {
    if (mode !== 'search' || !liveEnabled || camMode !== 'video') { setLiveScanning(false); return undefined; }
    setLiveScanning(true);
    let cancelled = false;

    const drawSample = (): HTMLCanvasElement | null => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return null;
      const scale = Math.min(1, 512 / video.videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas;
    };

    const lockObject = (result: any, canvas: HTMLCanvasElement) => {
      const desc = result.identification?.description || result.query || '';
      const best = (result.candidates || [])[0];
      const id = liveObjectId(desc);
      const thumb = canvas.toDataURL('image/jpeg', 0.6);
      setLockedObjects((prev) => {
        const next: LiveDetectedObject = {
          id, label: best?.title || desc,
          confidence: best?.match ?? Math.round((result.identification?.confidence || 0) * 100),
          image: thumb, candidates: result.candidates || [], detectedPrice: result.detectedPrice || null,
          status: 'locked', box: null, code: null,
        };
        const existing = prev.find((o) => o.id === id);
        if (existing) return prev.map((o) => (o.id === id ? { ...next, confidence: Math.max(o.confidence, next.confidence) } : o));
        return [...prev, next];
      });
      setSelected((s) => (s[id] === undefined ? { ...s, [id]: true } : s));
    };

    const sample = () => {
      if (cancelled || inflightRef.current) return;
      const canvas = drawSample();
      if (!canvas) return;
      const sig = frameSignature(canvas);
      if (sig && lastSigRef.current && signatureDistance(sig, lastSigRef.current) < 0.06) return;
      lastSigRef.current = sig;
      inflightRef.current = true;
      canvas.toBlob(async (blob) => {
        if (cancelled || !blob) { inflightRef.current = false; return; }
        pendingAbortRef.current?.abort();
        const ctrl = new AbortController();
        pendingAbortRef.current = ctrl;
        try {
          const result = await analyzeImage(new File([blob], 'ayrovix-live.jpg', { type: 'image/jpeg' }), ctrl.signal);
          const desc = result.identification?.description || '';
          const usable = (result.identification?.confidence || 0) > 0 && desc !== 'PRODUIT_NON_IDENTIFIE';
          if (!usable) { confirmRef.current = 0; lastDescRef.current = ''; setLiveGuidance(tr('Keep the product visible', 'أبقِ المنتج ظاهرًا')); return; }
          if (desc === lastDescRef.current) confirmRef.current += 1; else { lastDescRef.current = desc; confirmRef.current = 1; }
          if (confirmRef.current >= 2) { lockObject(result, canvas); setLiveGuidance(null); }
        } catch { /* abort / réseau : aucun faux résultat */ }
        finally { inflightRef.current = false; }
      }, 'image/jpeg', 0.8);
    };

    const timer = window.setInterval(sample, 2200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      pendingAbortRef.current?.abort();
      inflightRef.current = false;
      setLiveScanning(false);
    };
  }, [mode, liveEnabled, camMode, tr]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) { setTorchHint(true); setTimeout(() => setTorchHint(false), 2200); return; }
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchAvailable(true);
      setTorchOn(next);
    } catch {
      setTorchOn(false);
      setTorchHint(true);
      setTimeout(() => setTorchHint(false), 2200);
    }
  };

  const performCapture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onPhoto(new File([blob], `ayrovix-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.88);
  };

  const capturePhoto = () => {
    if (capturing) return;
    setCapturing(true);
    window.setTimeout(() => { setCapturing(false); performCapture(); }, 300);
  };

  const pickFromGallery = () => fileRef.current?.click();

  // ===== Scan Collection =====
  const selectedObjects = lockedObjects.filter((o) => selected[o.id]);
  const collectionTotal = selectedObjects.reduce((sum, o) => sum + (o.candidates[0]?.priceTnd ?? o.detectedPrice?.totalPriceTND ?? 0), 0);
  const active = lockedObjects[lockedObjects.length - 1];
  const openLiveResults = (objects: LiveDetectedObject[]) => {
    if (!onLiveResults || !objects.length) return;
    onLiveResults({
      queryLabel: objects.length > 1 ? `${objects.length} ${tr('produits détectés', 'منتجات مكتشفة')}` : objects[0].label,
      list: objects.flatMap((o) => o.candidates),
      eventId: `live_${Date.now()}`,
      detectedPrice: objects[0]?.detectedPrice || null,
    });
  };

  const isVideo = liveEnabled && camMode === 'video' && mode === 'search';

  return (
    <div className="fixed inset-0 z-[76] flex flex-col bg-ink text-white" dir={direction} role="dialog" aria-modal="true" aria-label={tr('AYROVIX Lens — caméra', 'عدسة AYROVIX — الكاميرا')}>
      <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

      <LensContextHeader mode="camera" onExit={onClose} onMenu={onMenu} dark
        flashControl={(
          <button type="button" onClick={toggleTorch}
            aria-label={torchOn ? tr('Éteindre le flash', 'إطفاء الفلاش') : tr('Allumer le flash', 'تشغيل الفلاش')}
            className={`grid h-11 w-11 place-items-center rounded-full backdrop-blur ${torchAvailable ? '' : 'opacity-45'} ${torchOn ? 'bg-accent text-ink' : 'bg-white/15'}`}>
            <Zap size={16} strokeWidth={1.9} fill={torchOn ? 'currentColor' : 'none'} />
          </button>
        )}
      />

      {torchHint && (
        <p className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-[11px] font-semibold text-white/90">
          {tr('Flash non disponible — utilisez un bon éclairage.', 'الفلاش غير متاح — استخدم إضاءة جيدة.')}
        </p>
      )}

      {/* pill الحالة: Auto (PHOTO) / Live (VIDÉO) + guidance discrète */}
      {mode === 'search' && (
        <div className="pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2">
          {liveGuidance && isVideo
            ? <p className="rounded-full bg-black/60 px-4 py-1.5 text-[11px] font-semibold text-white/85">{liveGuidance}</p>
            : isVideo
              ? <p className="flex items-center gap-1.5 rounded-full bg-black/50 px-4 py-1.5 text-[11px] font-extrabold text-accent backdrop-blur"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{tr('Live', 'مباشر')}</p>
              : <p className="flex items-center gap-1.5 rounded-full bg-black/50 px-4 py-1.5 text-[11px] font-extrabold text-white/85 backdrop-blur"><Sparkles size={13} className="text-accent" />{tr('Auto', 'تلقائي')}</p>}
        </div>
      )}

      {/* Viseur full-screen + bounding box stable (VIDÉO) */}
      <div className="pointer-events-none relative z-10 flex flex-1 items-center justify-center px-10">
        <div className="relative aspect-square w-full max-w-[300px]">
          <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-[20px] border-l-2 border-t-2 border-white/90" />
          <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-[20px] border-r-2 border-t-2 border-white/90" />
          <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-[20px] border-b-2 border-l-2 border-white/90" />
          <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-[20px] border-b-2 border-r-2 border-white/90" />
          {isVideo && active && (
            <span className="absolute inset-6 rounded-[16px] border-2 border-accent" aria-hidden="true">
              <span className="absolute -top-6 left-0 rounded-md bg-accent px-2 py-0.5 text-[10px] font-extrabold text-ink">{active.label} · {active.confidence}%</span>
            </span>
          )}
          {/* بطاقة منتج خفيفة مثبّتة أسفل الـ box — tap → page résultats existante */}
          {isVideo && active && (
            <button
              type="button"
              onClick={() => openLiveResults(selectedObjects.length ? selectedObjects : [active])}
              className="pointer-events-auto absolute -bottom-10 left-1/2 z-10 flex w-[105%] -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-black/75 p-2 text-start backdrop-blur"
            >
              <span className="h-11 w-11 flex-none overflow-hidden rounded-lg bg-surface">{active.image && <img src={active.image} alt="" className="h-full w-full object-cover" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-extrabold text-white">{active.label}</span>
                <span className="block text-[11px] font-bold text-accent">{active.confidence}%{active.candidates[0]?.priceTnd != null ? ` · ${active.candidates[0].priceTnd.toFixed(2)} DT` : ''}</span>
              </span>
              <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white/12"><ArrowRight size={15} className="text-white/80" /></span>
            </button>
          )}
          {!isVideo && <div className="lens-scan absolute inset-5 rounded-[18px]" aria-hidden="true" />}
        </div>
      </div>

      {/* Scan Collection (multi) */}
      {isVideo && lockedObjects.length > 1 && (
        <div className="relative z-10 mx-4 mb-2 rounded-2xl bg-black/60 p-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-white/85">
              <ShoppingBag size={13} className="text-accent" />{lockedObjects.length} {tr('produits détectés', 'منتجات مكتشفة')} · {selectedObjects.length} {tr('sél.', 'محدّد')}
            </p>
            <p className="text-[12px] font-black text-accent">{collectionTotal.toFixed(2)} DT</p>
          </div>
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {lockedObjects.map((obj) => (
              <button key={obj.id} type="button" onClick={() => setSelected((s) => ({ ...s, [obj.id]: !s[obj.id] }))} aria-pressed={Boolean(selected[obj.id])}
                className={`flex flex-none items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold ${selected[obj.id] ? 'border-accent bg-accent/20 text-white' : 'border-white/20 bg-white/10 text-white/70'}`}>
                <span className={`grid h-4 w-4 place-items-center rounded ${selected[obj.id] ? 'bg-accent text-ink' : 'bg-white/20'}`}>{selected[obj.id] && <Check size={11} />}</span>
                {obj.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => openLiveResults(selectedObjects)} disabled={!selectedObjects.length}
            className="ay-cta-orange mt-2.5 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-extrabold text-white">
            {tr('Sélectionner les produits', 'اختيار المنتجات')}
          </button>
        </div>
      )}

      {/* Hint contextuel (سطرين + أيقونة) يختفي تلقائيًا */}
      {hint && mode === 'search' && (
        <div className="pointer-events-none relative z-10 mx-auto mb-3 flex w-fit items-center gap-2.5 rounded-2xl bg-black/55 px-4 py-2.5 backdrop-blur">
          {isVideo ? <ScanSearch size={16} className="text-accent" /> : <Sparkles size={16} className="text-accent" />}
          <span>
            <span className="block text-[12px] font-extrabold text-white">{isVideo ? tr('Déplacez la caméra', 'حرّك الكاميرا') : tr('Cadrez le produit', 'ضع المنتج في الإطار')}</span>
            <span className="block text-[10.5px] font-semibold text-white/70">{isVideo ? tr('pour détecter les produits', 'لاكتشاف المنتجات') : tr('Nous détectons automatiquement', 'نكتشف تلقائيًا')}</span>
          </span>
        </div>
      )}
      {hint && mode === 'code' && (
        <p className="relative z-10 mx-auto mb-2 w-fit rounded-full bg-black/50 px-4 py-1.5 text-[11px] font-semibold text-white/85 backdrop-blur">{hint}</p>
      )}

      {/* PHOTO / VIDÉO selector */}
      {liveEnabled && mode !== 'code' && (
        <div className="relative z-10 mx-auto mb-3 flex w-fit rounded-full bg-black/45 p-1 backdrop-blur" role="tablist" aria-label={tr('Mode caméra', 'وضع الكاميرا')}>
          {(['photo', 'video'] as CamMode[]).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={camMode === m}
              onClick={() => { setCamMode(m); setMode('search'); }}
              className={`relative rounded-full px-5 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] transition-colors ${camMode === m ? 'text-white' : 'text-white/55'}`}>
              {m === 'photo' ? tr('Photo', 'صورة') : tr('Vidéo (Live)', 'فيديو (مباشر)')}
              {camMode === m && <span className="absolute -bottom-0.5 left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      )}

      {/* Controls: Importer | Capture | Code */}
      <div className="relative z-10 flex items-end justify-between px-8 pb-2">
        <button type="button" onClick={pickFromGallery} className="flex flex-col items-center gap-1 text-[10px] font-extrabold text-white/80">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/12 backdrop-blur"><ImageIcon size={22} strokeWidth={1.8} /></span>
          {tr('Importer', 'استيراد')}
        </button>

        {mode !== 'code' ? (
          <button type="button" onClick={capturePhoto} aria-label={tr('Photographier', 'التقاط صورة')}
            className={`grid h-[78px] w-[78px] place-items-center rounded-full border-4 border-white/90 backdrop-blur transition active:scale-95 ${capturing ? 'scale-90 bg-accent' : isVideo ? 'bg-black/30' : 'bg-white/10'}`}>
            <span className={`grid h-12 w-12 place-items-center rounded-full transition-transform ${capturing ? 'scale-75 bg-white' : isVideo ? 'bg-black/40 text-accent ring-2 ring-accent' : 'bg-white'}`}>
              {isVideo && !capturing && <ScanSearch size={22} strokeWidth={1.9} />}
            </span>
          </button>
        ) : (
          <span className="h-[78px] w-[78px]" />
        )}

        <button type="button" onClick={() => { setNotice(null); setMode(mode === 'code' ? 'search' : 'code'); }} aria-pressed={mode === 'code'}
          className={`flex flex-col items-center gap-1 text-[10px] font-extrabold ${mode === 'code' ? 'text-accent' : 'text-white/80'}`}>
          <span className={`grid h-14 w-14 place-items-center rounded-2xl backdrop-blur ${mode === 'code' ? 'bg-accent text-ink' : 'bg-white/12'}`}><Barcode size={22} strokeWidth={1.8} /></span>
          {tr('Code', 'رمز')}
        </button>
      </div>

      {mode === 'code' && (
        <form className="relative z-10 mx-5 mb-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (linkInput.trim()) onLink(linkInput.trim()); }}>
          <input value={linkInput} onChange={(e) => setLinkInput(e.target.value)} type="url" inputMode="url" placeholder={tr('…ou collez le lien', '…أو ألصق الرابط')}
            className="min-h-[46px] min-w-0 flex-1 rounded-full border border-white/25 bg-white/15 px-4 text-sm text-white placeholder:text-white/60 backdrop-blur focus:outline-none" />
          <button type="submit" disabled={!linkInput.trim()} className="ay-btn-primary flex-none rounded-full text-xs">{tr('Analyser', 'تحليل')}</button>
        </form>
      )}
      {mode === 'code' && notice && (
        <p className="relative z-10 mx-auto mb-2 max-w-xs rounded-2xl bg-danger/25 px-4 py-2 text-center text-xs font-semibold text-white">{notice}</p>
      )}

      {/* بطاقة شرح الوضعين (PHOTO | VIDÉO) — تُبرز الوضع النشط */}
      {mode !== 'code' && (
        <div className="relative z-10 mx-4 mb-2 grid grid-cols-2 rounded-2xl bg-black/50 p-3 backdrop-blur">
          <div className={`pe-3 ${isVideo ? 'opacity-55' : ''}`}>
            <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-accent"><Camera size={13} />{tr('Photo', 'صورة')}</p>
            <p className="mt-1 text-[10.5px] font-semibold leading-snug text-white/75">{tr("Prenez une photo, l'analyse se fait automatiquement.", 'التقط صورة، ويتم التحليل تلقائيًا.')}</p>
          </div>
          <div className={`border-s border-white/10 ps-3 ${isVideo ? '' : 'opacity-55'}`}>
            <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-accent"><ScanSearch size={13} />{tr('Vidéo (Live)', 'فيديو (مباشر)')}</p>
            <p className="mt-1 text-[10.5px] font-semibold leading-snug text-white/75">{tr('Déplacez la caméra pour détecter les produits en direct.', 'حرّك الكاميرا لاكتشاف المنتجات مباشرة.')}</p>
          </div>
        </div>
      )}

      <div className="relative z-10 h-[max(0.75rem,env(safe-area-inset-bottom))]" />

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) { setMode('search'); onPhoto(file); } else setMode('search'); e.target.value = ''; }} />
    </div>
  );
};
