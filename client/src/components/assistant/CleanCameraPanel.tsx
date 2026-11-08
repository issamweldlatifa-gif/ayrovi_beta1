import React, { useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, MoreVertical, RefreshCw, X, Zap } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import { useDialogFocus } from '../../hooks/useDialogFocus';
/** Real, owned camera stream; stop tracks on hide, navigation and unmount. */
export function CleanCameraPanel({ onClose, onPhoto }: { onClose: () => void; onPhoto: (file: File) => Promise<boolean> }) {
  const { tr } = useLocale();
  const panel = useRef<HTMLElement>(null), video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const epoch = useRef(0), capturing = useRef(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [options, setOptions] = useState(false), [torch, setTorch] = useState(false), [torchSupported, setTorchSupported] = useState(false);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  useDialogFocus(panel, true);
  useEffect(() => {
    const id = ++epoch.current;
    const stop = () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; };
    const hide = () => { if (document.hidden) { stop(); onClose(); } };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    setReady(false); setTorch(false); setError(false);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: false }).then(async next => {
      if (id !== epoch.current) { next.getTracks().forEach(track => track.stop()); return; }
      stream.current = next;
      const caps = next.getVideoTracks()[0]?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
      setTorchSupported(Boolean(caps?.torch));
      if (video.current) { video.current.srcObject = next; await video.current.play(); }
      if (id === epoch.current) setReady(true);
    }).catch(() => { if (id === epoch.current) { stop(); setError(true); } });
    if (!navigator.mediaDevices?.getUserMedia) setError(true);
    document.addEventListener('visibilitychange', hide); document.addEventListener('keydown', escape, true);
    return () => { ++epoch.current; stop(); document.removeEventListener('visibilitychange', hide); document.removeEventListener('keydown', escape, true); };
  }, [facing, onClose]);
  const capture = async () => {
    if (!ready || !video.current?.videoWidth || capturing.current) return;
    capturing.current = true; setBusy(true); setError(false); const id = epoch.current;
    try {
      const canvas = document.createElement('canvas'); canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
      const context = canvas.getContext('2d'); if (!context) throw new Error('canvas');
      context.drawImage(video.current, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('photo')), 'image/jpeg', .85));
      if (id !== epoch.current) return;
      if (await onPhoto(new File([blob], 'clean-photo.jpg', { type: 'image/jpeg' })) && id === epoch.current) onClose();
    } catch { if (id === epoch.current) setError(true); }
    finally { capturing.current = false; if (id === epoch.current) setBusy(false); }
  };
  const flash = async () => {
    try {
      await stream.current?.getVideoTracks()[0]?.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(value => !value);
    } catch { setError(true); }
  };
  const control = 'clean-camera-control';
  return <>
    <button className="absolute inset-0 z-40 bg-black/30" onClick={onClose} aria-label={tr('Fermer la caméra', 'إغلاق الكاميرا')} />
    <section ref={panel} role="dialog" aria-modal="true" aria-label={tr('Appareil photo', 'الكاميرا')} tabIndex={-1} className="clean-camera-panel">
      <video ref={video} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
      <div className="relative flex min-h-0 flex-1 items-center justify-center">{error && <p role="alert" className="px-5 text-center text-sm text-white">{tr('Caméra indisponible. Vérifiez les autorisations ou réessayez en ouvrant la caméra.', 'الكاميرا غير متاحة. ثبّت في الترخيص وعاود افتح الكاميرا.')}</p>}</div>
      {options && <div className="relative mb-3 flex flex-col items-end gap-3">
        <button className={control} disabled={!torchSupported || busy} onClick={() => { void flash(); }} aria-label={tr('Activer ou désactiver le flash', 'تشغيل الفلاش أو إيقافه')}><span className={torch ? undefined : "clean-flash-off"}><Zap appearance="clean" size={24} /></span></button>
        <button className={control} disabled={busy} onClick={() => setFacing(value => value === 'user' ? 'environment' : 'user')} aria-label={tr('Changer de caméra', 'تبديل الكاميرا')}><RefreshCw appearance="clean" size={24} /></button>
      </div>}
      <div className="relative flex items-center justify-between">
        <button className={control} disabled={busy} onClick={onClose} aria-label={tr('Retour', 'رجوع')}><ChevronLeft appearance="clean" size={26} /></button>
        <button className="clean-camera-shutter" disabled={!ready || busy} onClick={() => { void capture(); }} aria-label={tr('Prendre une photo', 'التقاط صورة')}><Camera appearance="clean" className="sr-only" /></button>
        <button className={control} disabled={busy} onClick={() => setOptions(value => !value)} aria-expanded={options} aria-label={tr('Options de la caméra', 'خيارات الكاميرا')}>{options ? <X appearance="clean" size={26} /> : <MoreVertical appearance="clean" size={26} />}</button>
      </div>
    </section>
  </>;
}
