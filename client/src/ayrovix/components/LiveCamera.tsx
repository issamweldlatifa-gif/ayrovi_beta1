import React, { useEffect, useRef, useState } from 'react';
import type { CodeScanResult, CodeScanSession } from '../services/qr';
import { ArrowLeft, Zap, ArrowRight, Barcode, Check, Image as ImageIcon, ScanSearch, ShoppingBag, Info, Search, Link2 } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import { LensDialog, LensGuide } from './LensHelp';
import { useNavigationHistory } from '../../navigation/NavigationHistory';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import './lens-camera.css';
import { LiveVisionRuntime, type LiveDetection, type LiveVisionState } from '../services/liveVisionRuntime';

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
  /** Single-path Google/Amazon Lens : l'image importée reste DANS cette même coque — back + flash + Auto visibles, sheet résultats par-dessus. */
  photoUrl?: string | null;
  overlay?: React.ReactNode;
  onPhotoClose?: () => void;
}

type CameraPanel = 'help' | 'methods' | 'link' | 'scan';
type CamMode = 'photo' | 'video';

/**
 * AYROVIX Lens — photo capture + live product scanning.
 * Entry/help panels suspend sampling; results retain their existing shell.
 * LIVE ≠ تسجيل فيديو. الزر المركزي في LIVE = التقاط الحالة الحالية للنتيجة.
 */
export const LiveCamera: React.FC<LiveCameraProps> = ({ onPhoto, onQrUrl, onBarcode, onCodeText, onLink, onClose, onMenu, onCameraFailed, liveEnabled = false, onLiveResults, photoUrl = null, overlay = null, onPhotoClose }) => {
  const { direction, tr } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigation = useNavigationHistory();
  const panelName = navigation.current?.id.startsWith('camera-panel:') ? navigation.current.id.slice(13) : '';
  const panel = ['help', 'methods', 'link', 'scan'].includes(panelName) ? panelName as CameraPanel : null;
  const modal = panel && panel !== 'scan' ? panel : null;
  const mode = panel === 'scan' ? 'code' : 'search';
  const openPanel = (next: CameraPanel, replace = false) => {
    setNotice(null);
    captureEpoch.current++;
    setCapturing(false);
    if (replace) navigation.replaceTop({ id: `camera-panel:${next}` });
    else navigation.pushLayer({ id: `camera-panel:${next}` });
  };
  const closePanel = () => navigation.back();
  const shellRef = useRef<HTMLDivElement>(null);
  useDialogFocus(shellRef, !photoUrl);
  const [cameraReady, setCameraReady] = useState(false);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const captureEpoch = useRef(0);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  useEffect(() => {
    captureEpoch.current++;
    setCapturing(false);
    return () => { captureEpoch.current++; };
  }, [modal, photoUrl, visible]);
  const [camMode, setCamMode] = useState<CamMode>('photo');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchBusy, setTorchBusy] = useState(false);
  const torchQueue = useRef<Promise<void>>(Promise.resolve());
  const torchRequest = useRef(0);
  const torchPending = useRef(false);
  const torchAllowed = useRef(true);
  torchAllowed.current = visible && !modal && !photoUrl;
  const [notice, setNotice] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [linkInput, setLinkInput] = useState('');

  // ===== LiveVisionRuntime (REAL LIVE) =====
  const [liveState, setLiveState] = useState<LiveVisionState>({ objects: [], status: 'idle' });
  const runtimeRef = useRef<LiveVisionRuntime | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const liveNotice = liveState.status === 'offline'
    ? tr('Hors ligne — reconnectez-vous pour la recherche en ligne.', 'غير متصل — أعد الاتصال بالإنترنت لمتابعة البحث عبر الشبكة.')
    : liveState.status === 'ai-unavailable' ? tr('Recherche en ligne indisponible. Réessayez dans un instant.', 'البحث عبر الإنترنت غير متاح. حاول مجددًا بعد قليل.') : null;
  const isVideo = liveEnabled && camMode === 'video' && mode === 'search' && !modal && !photoUrl && visible && cameraReady;

  useEffect(() => {
    if (!runtimeRef.current) {
      runtimeRef.current = new LiveVisionRuntime({
        getVideo: () => videoRef.current,
        onState: setLiveState,
        onEvent: (type, meta) => {
          try {
            fetch('/api/ayrovix/live-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, meta }), keepalive: true }).catch(() => {});
          } catch { /* analytics غير حرجة */ }
        },
      });
    }
    const runtime = runtimeRef.current;
    if (isVideo) runtime.start(); else runtime.stop();
    return () => runtime.stop();
  }, [isVideo]);

  useEffect(() => () => { runtimeRef.current?.stop(); }, []);

  // Camera lifecycle
  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) { onCameraFailed(); return; }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) { video.srcObject = stream; await video.play(); }
        if (cancelled) return;
        const track = stream.getVideoTracks()[0];
        try { setTorchAvailable(Boolean(((track.getCapabilities?.() || {}) as any).torch)); } catch {}
      })
      .catch(() => {
        if (cancelled) return;
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setCameraReady(false);
        onCameraFailed();
      });
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, []);

  // Code scan (QR/Barcode)
  useEffect(() => {
    if (mode !== 'code' || !visible || !cameraReady || photoUrl) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let session: CodeScanSession | null = null;
    void import('../services/qr').then(({ startCodeScan }) => {
      if (cancelled) return;
      let delivered = false;
      session = startCodeScan(video, (result: CodeScanResult) => {
        if (cancelled || delivered) return;
        delivered = true;
        if (result.kind === 'url') onQrUrl(result.value);
        else if (result.kind === 'barcode') onBarcode(result.value);
        else onCodeText(result.value);
      });
    }).catch(() => { if (!cancelled) setNotice(tr('Le lecteur de code n’a pas pu être chargé. Essayez un lien produit.', 'تعذّر تحميل قارئ الرموز. جرّب رابط المنتج.')); });
    return () => { cancelled = true; session?.stop(); };
  }, [mode, visible, cameraReady, photoUrl, onQrUrl, onBarcode, onCodeText, tr]);

  // Serialize hardware changes: a pending torch-on must settle before an off request.
  // Track identity guards prevent callbacks from touching a released camera.
  const requestTorch = (next: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchAvailable) return;
    const request = ++torchRequest.current;
    torchPending.current = true;
    setTorchBusy(true);
    torchQueue.current = torchQueue.current.then(async () => {
      if (streamRef.current?.getVideoTracks()[0] !== track || (next && !torchAllowed.current)) return;
      try {
        await track.applyConstraints({ advanced: [{ torch: next } as any] });
        if (streamRef.current?.getVideoTracks()[0] === track) setTorchOn(next);
      } catch {
        if (streamRef.current?.getVideoTracks()[0] === track) {
          // Keep the last confirmed state. Never falsely claim the flash was turned off.
          setNotice(tr('Le réglage du flash a échoué. Réessayez ou fermez la caméra.', 'تعذّر تغيير حالة الفلاش. أعد المحاولة أو أغلق الكاميرا.'));
        }
      }
    }).finally(() => {
      if (request !== torchRequest.current) return;
      torchPending.current = false;
      if (streamRef.current?.getVideoTracks()[0] === track) setTorchBusy(false);
    });
  };
  const toggleTorch = () => { if (!torchPending.current) requestTorch(!torchOn); };

  // Panels/background tabs suspend frames AND turn off a supported torch.
  useEffect(() => {
    const enabled = visible && !modal && !photoUrl;
    streamRef.current?.getVideoTracks().forEach(track => { track.enabled = enabled; });
    if (!enabled && (torchOn || torchPending.current)) requestTorch(false);
  }, [visible, modal, photoUrl, cameraReady]);

  const performCapture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || !cameraReady || capturing || modal || !visible) return;
    setCapturing(true);
    const epoch = ++captureEpoch.current;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(blob => {
        if (epoch !== captureEpoch.current) return;
        setCapturing(false);
        if (blob) onPhoto(new File([blob], `ayrovix-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        else setNotice(tr('Photo non capturée. Réessayez.', 'لم تُلتقط الصورة. أعد المحاولة.'));
      }, 'image/jpeg', 0.88);
    } catch { setCapturing(false); setNotice(tr('Photo non capturée. Réessayez.', 'لم تُلتقط الصورة. أعد المحاولة.')); }
  };
  const handleCentralAction = () => {
    if (capturing || !cameraReady || modal) return;
    if (isVideo) {
      if (selectedObjects.length > 0) { openLiveResults(selectedObjects); return; }
      if (active) { openLiveResults([active]); return; }
    }
    performCapture();
  };
  const pickFromGallery = () => { captureEpoch.current++; setCapturing(false); fileRef.current?.click(); };
  const submitLink = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const url = new URL(linkInput.trim());
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('UNSAFE_URL');
      // Network/private-host protections remain enforced by the existing server endpoint.
      onLink(url.href);
    } catch { setNotice(tr('Collez un lien produit HTTP ou HTTPS valide, sans identifiants.', 'ألصق رابط منتج HTTP أو HTTPS صالحًا، دون بيانات دخول.')); }
  };

  // ===== Collection from runtime objects =====
  const lockedObjects = liveState.objects.filter((o) => o.status !== 'lost');
  const selectedObjects = lockedObjects.filter((o) => selected[o.trackingId]);
  const collectionTotal = selectedObjects.reduce((sum, o) => sum + (o.candidates[0]?.priceTnd ?? o.detectedPrice?.totalPriceTND ?? 0), 0);
  const active = [...lockedObjects].reverse().find((o) => o.status === 'locked') || lockedObjects[lockedObjects.length - 1];
  const openLiveResults = (objects: LiveDetection[]) => {
    if (!onLiveResults || !objects.length) return;
    onLiveResults({
      queryLabel: objects.length > 1 ? `${objects.length} ${tr('produits détectés', 'منتجات مكتشفة')}` : objects[0].label,
      list: objects.flatMap((o) => o.candidates),
      eventId: `live_${Date.now()}`,
      detectedPrice: objects[0]?.detectedPrice || null,
    });
  };

  return (
    <div ref={shellRef} tabIndex={-1} className="lens-camera fixed inset-0 z-[76] flex flex-col bg-ink text-white" dir={direction} role="dialog" aria-modal="true" aria-label={tr('AYROVIX Lens — caméra', 'عدسة AYROVIX — الكاميرا')} onKeyDown={event => { if (event.key === 'Escape' && !photoUrl) { event.preventDefault(); event.stopPropagation(); if (panel) closePanel(); else onClose(); } }}>
      <div className="lens-camera-stage" inert={Boolean(modal)} aria-hidden={modal ? true : undefined}>
      <video ref={videoRef} onCanPlay={() => setCameraReady(true)} muted playsInline className={`absolute inset-0 h-full w-full object-cover ${photoUrl ? 'invisible' : ''}`} />
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 ${photoUrl ? 'hidden' : ''}`} />

      {/* Photo mode : l'image + la sheet de résultats vivent ICI, dans la coque — aucune page séparée. */}
      {photoUrl && overlay && (
        <div className="absolute inset-0 z-[15] overflow-hidden">{overlay}</div>
      )}
      {!(photoUrl && overlay) && <header className="lens-camera-header">
        <button type="button" onClick={panel === 'scan' ? closePanel : photoUrl && onPhotoClose ? onPhotoClose : onClose} className="lens-camera-icon" aria-label={photoUrl || panel === 'scan' ? tr('Retour à la caméra', 'العودة إلى الكاميرا') : tr('Quitter Lens', 'مغادرة Lens')}>
          <ArrowLeft size={22} />
        </button>
        <p className="lens-camera-brand" dir="ltr">AYROVIX <span>Lens</span></p>
        {photoUrl ? null : (
          <div className="lens-camera-tools">
            <button type="button" className="lens-camera-icon" onClick={() => openPanel('help')} aria-label={tr('Aide et règles de Lens', 'مساعدة Lens وقواعد الاستخدام')} aria-haspopup="dialog"><Info size={22} /></button>
            <button type="button" onClick={toggleTorch} className="lens-camera-icon" disabled={!torchAvailable || torchBusy} aria-busy={torchBusy} aria-pressed={torchOn}
              title={!torchAvailable ? tr('Flash indisponible sur cet appareil', 'الفلاش غير متاح على هذا الجهاز') : undefined}
              aria-label={!torchAvailable ? tr('Flash indisponible sur cet appareil', 'الفلاش غير متاح على هذا الجهاز') : torchOn ? tr('Éteindre le flash', 'إطفاء الفلاش') : tr('Allumer le flash', 'تشغيل الفلاش')}><Zap size={22} /></button>
          </div>
        )}
      </header>}

      {mode === 'search' && !photoUrl && isVideo && (
        <div className="pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2">
          {liveNotice
            ? <p className="rounded-full bg-black/60 px-4 py-1.5 text-xs font-semibold text-white/80">{liveNotice}</p>
            : <p className="flex items-center gap-1.5 rounded-full bg-black/60 px-4 py-1.5 text-xs font-extrabold text-white backdrop-blur border border-white/30"><span className="h-2 w-2 rounded-full bg-white animate-pulse" />{tr('Live', 'مباشر')}</p>}
        </div>
      )}

      {/* Viewfinder + bounding boxes من الـ runtime */}
      {!photoUrl && (
      <div className="lens-viewfinder pointer-events-none relative z-10 flex flex-1 items-center justify-center px-10">
        <div className="relative aspect-square w-full max-w-[300px]">
          <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-[20px] border-l-2 border-t-2 border-white/90" />
          <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-[20px] border-r-2 border-t-2 border-white/90" />
          <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-[20px] border-b-2 border-l-2 border-white/90" />
          <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-[20px] border-b-2 border-r-2 border-white/90" />

          {isVideo && lockedObjects.filter((o) => o.box).map((o) => {
            const isSel = Boolean(selected[o.trackingId]);
            const priceText = o.candidates[0]?.priceTnd != null ? ` · ${o.candidates[0].priceTnd.toFixed(0)} DT` : o.detectedPrice?.totalPriceTND != null ? ` · ${o.detectedPrice.totalPriceTND.toFixed(0)} DT` : '';
            return (
              <button key={o.trackingId} type="button" onClick={() => setSelected((s) => ({ ...s, [o.trackingId]: !s[o.trackingId] }))}
                className={`pointer-events-auto absolute rounded-[14px] border-2 transition-all ${isSel ? 'border-white bg-white/20 ring-2 ring-white' : 'border-white/90 hover:border-white hover:bg-white/10'}`}
                style={{ left: `${o.box!.x * 100}%`, top: `${o.box!.y * 100}%`, width: `${o.box!.w * 100}%`, height: `${o.box!.h * 100}%` }}
                aria-label={o.label}>
                <span className="absolute -top-5 left-0 truncate rounded bg-white px-1.5 py-0.5 text-xs font-extrabold text-ink max-w-[120px]">
                  {o.label} · {o.confidence}%{priceText}
                </span>
              </button>
            );
          })}

          {isVideo && active && !active.box && (
            <span className="absolute inset-6 rounded-[16px] border-2 border-white" aria-hidden="true">
              <span className="absolute -top-6 left-0 rounded-md bg-white px-2 py-0.5 text-xs font-extrabold text-ink">{active.label} · {active.confidence}%</span>
            </span>
          )}

          {isVideo && active && (
            <button type="button" onClick={() => openLiveResults(selectedObjects.length ? selectedObjects : [active])}
              className="pointer-events-auto absolute -bottom-10 left-1/2 z-10 flex w-[105%] -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-black/75 p-2 text-start backdrop-blur border border-white/10 shadow-lg">
              <span className="h-11 w-11 flex-none overflow-hidden rounded-icon bg-surface">{active.image && <img src={active.image} alt="" className="h-full w-full object-cover" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-extrabold text-white">{active.label}</span>
                <span className="block text-xs font-bold text-white">{active.confidence}%{active.candidates[0]?.priceTnd != null ? ` · ${active.candidates[0].priceTnd.toFixed(2)} DT` : active.detectedPrice?.totalPriceTND != null ? ` · ${active.detectedPrice.totalPriceTND.toFixed(2)} DT` : ''}</span>
              </span>
              <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white/12"><ArrowRight size={15} className={`text-white/80 ${direction === 'rtl' ? 'rotate-180' : ''}`} /></span>
            </button>
          )}


        </div>
      </div>
      )}

      {/* Scan Collection */}
      {isVideo && !photoUrl && lockedObjects.length > 1 && (
        <div className="relative z-10 mx-4 mb-2 rounded-2xl bg-black/60 p-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-white/85">
              <ShoppingBag size={13} className="text-white" />{lockedObjects.length} {tr('produits détectés', 'منتجات مكتشفة')} · {selectedObjects.length} {tr('sél.', 'محدّد')}
            </p>
            <p className="text-xs font-black text-white">{collectionTotal.toFixed(2)} DT</p>
          </div>
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {lockedObjects.map((obj) => (
              <button key={obj.trackingId} type="button" onClick={() => setSelected((s) => ({ ...s, [obj.trackingId]: !s[obj.trackingId] }))} aria-pressed={Boolean(selected[obj.trackingId])}
                className={`flex flex-none items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold ${selected[obj.trackingId] ? 'border-white bg-white/20 text-white' : 'border-white/20 bg-white/10 text-white/70'}`}>
                <span className={`grid h-4 w-4 place-items-center rounded ${selected[obj.trackingId] ? 'bg-white text-ink' : 'bg-white/20'}`}>{selected[obj.trackingId] && <Check size={11} />}</span>
                {obj.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => openLiveResults(selectedObjects)} disabled={!selectedObjects.length}
            className="bg-ink text-white hover:bg-ink/90 mt-2.5 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-extrabold text-white">
            {tr('Sélectionner les produits', 'اختيار المنتجات')}
          </button>
        </div>
      )}

      {!photoUrl && <div className="lens-camera-guidance" role="status" aria-live="polite">
        {notice || (!cameraReady ? tr('Ouverture de la caméra…', 'جارٍ تشغيل الكاميرا…') : mode === 'code' ? tr('Visez un code-barres ou un QR.', 'وجّه الكاميرا إلى باركود أو QR.') : camMode === 'video' && liveEnabled ? tr('Visez un produit. Le scan est automatique.', 'وجّه الكاميرا إلى منتج. المسح تلقائي.') : tr('Cadrez le produit, puis prenez la photo.', 'ضع المنتج في الإطار ثم التقط الصورة.'))}
      </div>}

      {/* PHOTO | VIDÉO selector */}
      {mode !== 'code' && !photoUrl && (
        <div className="relative z-10 mx-auto mb-3 flex w-fit rounded-full bg-black/45 p-1 backdrop-blur" role="tablist" aria-label={tr('Mode caméra', 'وضع الكاميرا')} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const available = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          const index = available.indexOf(document.activeElement as HTMLButtonElement);
          const step = (event.key === 'ArrowRight' ? 1 : -1) * (direction === 'rtl' ? -1 : 1);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (index + step + available.length) % available.length;
          available[next]?.focus(); available[next]?.click();
        }}>
          {(['photo', 'video'] as CamMode[]).map((m) => {
            const disabled = m === 'video' && !liveEnabled;
            return (
              <button key={m} type="button" role="tab" aria-selected={camMode === m} tabIndex={camMode === m ? 0 : -1} disabled={disabled} title={disabled ? tr('Le scan en direct n’est pas activé pour le moment.', 'المسح المباشر غير مفعّل حاليًا.') : undefined}
                onClick={() => { setCamMode(m); setNotice(null); }}
                className={`lens-camera-tab relative rounded-full px-5 py-2 text-sm font-semibold transition-colors ${camMode === m ? 'text-white' : 'text-white/55'} ${disabled ? 'opacity-40' : ''}`}>
                {m === 'photo' ? tr('Photo', 'تصوير') : tr('Scan en direct', 'مسح مباشر')}
                {camMode === m && <span className="absolute -bottom-0.5 left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full bg-white" />}
              </button>
            );
          })}
        </div>
      )}

      {!photoUrl && mode !== 'code' && !liveEnabled && <p className="lens-live-unavailable">{tr('Scan en direct indisponible pour le moment.', 'المسح المباشر غير متاح حاليًا.')}</p>}
      {/* Controls: import / capture / explicit link-or-code chooser. */}
      {!photoUrl && mode !== 'code' && (
      <div className="lens-camera-controls relative z-10">
        <button type="button" onClick={pickFromGallery} className="lens-camera-action">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-transparent"><ImageIcon size={22} /></span>
          {tr('Importer', 'استيراد صورة')}
        </button>

        <>
          <button type="button" onClick={handleCentralAction} disabled={!cameraReady || capturing} aria-busy={capturing} aria-label={isVideo ? tr('Capturer le résultat live', 'التقاط النتيجة الحالية') : tr('Photographier', 'التقاط صورة')}
            className={`lens-camera-shutter grid h-[78px] w-[78px] place-items-center rounded-full border-[3px] border-white/90 bg-transparent transition active:scale-95 ${capturing ? 'scale-90 bg-white/80' : ''}`}>
            <span className={`grid h-12 w-12 place-items-center rounded-full transition-transform ${capturing ? 'scale-75 bg-white' : isVideo ? 'bg-transparent text-white ring-2 ring-white' : 'bg-white/95'}`}>
              {isVideo && !capturing && <ScanSearch size={22} />}
            </span>
          </button>
        </>

        <button type="button" onClick={() => openPanel('methods')} aria-haspopup="dialog"
          className="lens-camera-action">
          <span className={`grid h-14 w-14 place-items-center rounded-2xl bg-transparent `}><Search size={22} /></span>
          {tr('Lien / code', 'رابط أو رمز')}
        </button>
      </div>
      )}

      {mode === 'code' && !photoUrl && <div className="lens-scan-actions"><button type="button" onClick={() => openPanel('methods', true)}>{tr('Changer de méthode', 'تغيير طريقة البحث')}</button><button type="button" onClick={closePanel}>{tr('Retour à la photo', 'العودة إلى التصوير')}</button></div>}

      <div className="relative z-10 h-[max(0.75rem,env(safe-area-inset-bottom))]" />

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) onPhoto(file); e.target.value = ''; }} />
      </div>
      {modal && <LensDialog key={modal} title={modal === 'help' ? tr('Guide et règles de Lens', 'دليل Lens وقواعد الاستخدام') : modal === 'methods' ? tr('Retrouver un produit', 'العثور على منتج') : tr('Coller un lien produit', 'لصق رابط منتج')} onClose={closePanel}>
        {modal === 'help' && <LensGuide />}
        {modal === 'methods' && <div className="lens-methods"><p className="lens-panel-lead">{tr('Choisissez ce que vous avez sous la main.', 'اختر الطريقة المناسبة لما لديك.')}</p>
          <button type="button" onClick={() => openPanel('scan', true)}><Barcode size={24} /><span><strong>{tr('Scanner un code', 'مسح رمز')}</strong><small>{tr('Code-barres ou QR · avec la caméra', 'باركود أو QR · باستخدام الكاميرا')}</small></span></button>
          <button type="button" onClick={() => openPanel('link')}><Link2 size={24} /><span><strong>{tr('Coller un lien produit', 'لصق رابط منتج')}</strong><small>{tr('Depuis la page d’un produit', 'من صفحة منتج في متجر')}</small></span></button>
        </div>}
        {modal === 'link' && <form className="lens-link-form" onSubmit={submitLink}>
          <label htmlFor="lens-product-link">{tr('Lien du produit', 'رابط المنتج')}</label>
          <input id="lens-product-link" data-dialog-autofocus type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} dir="ltr" required value={linkInput} onChange={e => { setLinkInput(e.target.value); setNotice(null); }} placeholder="https://…" aria-describedby="lens-link-hint" />
          <p id="lens-link-hint">{tr('Le lien doit mener à un produit autorisé. Les liens restent soumis aux contrôles du service.', 'يجب أن يؤدي الرابط إلى منتج مسموح به. تبقى الروابط خاضعة لفحوص الخدمة.')}</p>
          {notice && <p role="alert">{notice}</p>}
          <button type="submit" className="lens-panel-primary" disabled={!linkInput.trim()}>{tr('Rechercher ce produit', 'البحث عن هذا المنتج')}</button>
        </form>}
      </LensDialog>}
    </div>
  );
};
