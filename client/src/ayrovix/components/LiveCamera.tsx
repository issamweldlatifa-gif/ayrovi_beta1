import React, { useEffect, useRef, useState } from 'react';
import type { CodeScanResult, CodeScanSession } from '../services/qr';
import { Barcode, Camera, Image as ImageIcon, Zap } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import { LensContextHeader } from './LensNavigation';

interface LiveCameraProps {
  onPhoto: (file: File) => void;
  onQrUrl: (url: string) => void;
  onBarcode: (code: string) => void;
  onCodeText: (value: string) => void;
  onLink: (url: string) => void;
  onClose: () => void;
  onMenu: () => void;
  onCameraFailed: () => void;
}

type CameraMode = 'search' | 'upload' | 'code';

/**
 * AYROVIX Lens — caméra sans effets (user request: remove stars/Xray, keep clean & fast)
 * Radical performance: no animations, no particles, simple white corners only.
 */
export const LiveCamera: React.FC<LiveCameraProps> = ({ onPhoto, onQrUrl, onBarcode, onCodeText, onLink, onClose, onMenu, onCameraFailed }) => {
  const { direction, tr } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<CameraMode>('search');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchHint, setTorchHint] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const modeRef = useRef<CameraMode>('search');
  modeRef.current = mode;

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

  useEffect(() => {
    if (mode !== 'code') return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let session: CodeScanSession | null = null;
    // ZXing est chargé uniquement si l'utilisateur ouvre réellement le mode Code.
    void import('../services/qr').then(({ startCodeScan }) => {
      if (cancelled) return;
      session = startCodeScan(video, (result: CodeScanResult) => {
        if (result.kind === 'url') onQrUrl(result.value);
        else if (result.kind === 'barcode') onBarcode(result.value);
        else onCodeText(result.value);
      });
    }).catch(() => setNotice(tr('Le lecteur de code n’a pas pu être chargé.', 'تعذّر تحميل قارئ الرموز.')));
    return () => {
      cancelled = true;
      session?.stop();
    };
  }, [mode, onQrUrl, onBarcode, onCodeText]);

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

  // تفاعل «قبل الالتقاط»: ردّة فعل لمسية + رسالة، ثم الالتقاط الفعلي بعد تأخير قصير.
  const capturePhoto = () => {
    if (capturing) return;
    setCapturing(true);
    window.setTimeout(() => { setCapturing(false); performCapture(); }, 300);
  };

  const pickFromGallery = () => fileRef.current?.click();

  const MODES: Array<{ id: CameraMode; label: string; icon: React.ReactNode; action?: () => void }> = [
    {
      id: 'search', label: tr('Recherche', 'بحث'),
      icon: <Camera size={19} strokeWidth={1.8} />,
    },
    {
      id: 'upload', label: tr('Importer', 'رفع'),
      icon: <ImageIcon size={19} strokeWidth={1.8} />,
      action: pickFromGallery,
    },
    {
      id: 'code', label: tr('Code', 'رمز'),
      icon: <Barcode size={19} strokeWidth={1.8} />,
    },
  ];

  return (
    <div className="fixed inset-0 z-[76] flex flex-col bg-ink text-white" dir={direction} role="dialog" aria-modal="true" aria-label={tr('AYROVIX Lens — caméra', 'عدسة AYROVIX — الكاميرا')}>
      <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

      <LensContextHeader
        mode="camera"
        onExit={onClose}
        onMenu={onMenu}
        dark
        flashControl={(
          <button
            type="button"
            onClick={toggleTorch}
            aria-label={torchOn ? tr('Éteindre le flash', 'إطفاء الفلاش') : tr('Allumer le flash', 'تشغيل الفلاش')}
            className={`grid h-11 w-11 place-items-center rounded-full backdrop-blur ${torchAvailable ? '' : 'opacity-45'} ${torchOn ? 'bg-accent text-ink' : 'bg-white/15'}`}
          >
            <Zap size={16} strokeWidth={1.9} fill={torchOn ? 'currentColor' : 'none'} />
          </button>
        )}
      />
      {torchHint && (
        <p className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-[11px] font-semibold text-white/90">
          {tr('Flash non disponible — utilisez un bon éclairage.', 'الفلاش غير متاح — استخدم إضاءة جيدة.')}
        </p>
      )}

      {/* Viseur SANS effets - clean & fast */}
      <div className="pointer-events-none relative z-10 flex flex-1 items-center justify-center px-10">
        <div className="relative aspect-square w-full max-w-[300px]">
          <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-[20px] border-l-2 border-t-2 border-white/90" />
          <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-[20px] border-r-2 border-t-2 border-white/90" />
          <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-[20px] border-b-2 border-l-2 border-white/90" />
          <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-[20px] border-b-2 border-r-2 border-white/90" />
          <div className="lens-scan absolute inset-5 rounded-[18px]" aria-hidden="true" />
        </div>
      </div>

      <div className="relative z-10 px-6 pb-2 text-center">
        {mode === 'search' && (
          capturing ? (
            <p className="text-xs font-extrabold text-accent">{tr('Capture en cours…', 'جارٍ الالتقاط…')}</p>
          ) : (
            <p className="text-xs font-semibold text-white/80">{tr("Cadrez le produit, puis touchez l'obturateur pour le capturer.", 'ضع المنتج داخل الإطار ثم اضغط زر التصوير للالتقاط.')}</p>
          )
        )}
        {mode === 'code' && (
          notice
            ? <p className="mx-auto max-w-xs rounded-2xl bg-danger/25 px-4 py-2.5 text-xs font-semibold text-white">{notice}</p>
            : <p className="text-xs font-semibold text-white/80">{tr('Visez un QR code ou un code-barres.', 'وجّه الكاميرا إلى رمز QR أو رمز شريطي.')}</p>
        )}
      </div>

      {mode === 'search' && (
        <div className="relative z-10 flex justify-center pb-3 pt-1">
          <button
            type="button"
            onClick={capturePhoto}
            aria-label={tr('Photographier', 'التقاط صورة')}
            className={`grid h-[74px] w-[74px] place-items-center rounded-full border-[4px] border-white/90 backdrop-blur transition active:scale-95 ${capturing ? 'scale-90 bg-accent' : 'bg-white/10'}`}
          >
            <span className={`h-12 w-12 rounded-full bg-white transition-transform ${capturing ? 'scale-75' : ''}`} />
          </button>
        </div>
      )}

      {mode === 'code' && (
        <form
          className="relative z-10 mx-5 mb-2 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (linkInput.trim()) onLink(linkInput.trim()); }}
        >
          <input
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            type="url"
            inputMode="url"
            placeholder={tr('…ou collez le lien', '…أو ألصق الرابط')}
            className="min-h-[46px] min-w-0 flex-1 rounded-full border border-white/25 bg-white/15 px-4 text-sm text-white placeholder:text-white/60 backdrop-blur focus:outline-none"
          />
          <button type="submit" disabled={!linkInput.trim()}
            className="ay-btn-primary flex-none rounded-full text-xs">
            {tr('Analyser', 'تحليل')}
          </button>
        </form>
      )}

      <nav className="relative z-10 grid grid-cols-3 border-t border-white/10 bg-black/35 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur" aria-label={tr('Modes', 'الأوضاع')}>
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setNotice(null);
              if (item.id === 'upload') { setMode('upload'); item.action?.(); setMode((m) => (m === 'upload' ? 'search' : m)); return; }
              setMode(item.id);
            }}
            aria-pressed={mode === item.id}
            className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.08em] ${mode === item.id ? 'text-white' : 'text-white/55'}`}
          >
            {mode === item.id && <span className="absolute -top-1 h-[3px] w-10 rounded-full bg-white" />}
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) { setMode('search'); onPhoto(file); }
          else setMode('search');
          e.target.value = '';
        }}
      />

    </div>
  );
};
