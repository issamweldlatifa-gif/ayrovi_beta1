import React, { useEffect, useRef, useState } from 'react';
import { startCodeScan } from '../services/qr';
import type { CodeScanResult } from '../services/qr';

interface LiveCameraProps {
  /** Photo capturée depuis le flux (mode Recherche) ou choisie (mode Importer). */
  onPhoto: (file: File) => void;
  /** QR avec lien lu → analyse URL directe. */
  onQrUrl: (url: string) => void;
  /** Code-barres lu → recherche par code. */
  onBarcode: (code: string) => void;
  /** Lien collé manuellement (mode Code). */
  onLink: (url: string) => void;
  onClose: () => void;
  /** Caméra impossible (permission refusée, appareil sans caméra…) → menu de repli. */
  onCameraFailed: () => void;
}

type CameraMode = 'search' | 'upload' | 'code';

/**
 * AYROVIX Lens — expérience caméra live (style scanner) :
 * la caméra s'ouvre DÈS l'appui sur Lens. En bas, trois modes :
 * Recherche (obturateur) · Importer (galerie) · Code (QR + code-barres en direct).
 */
export const LiveCamera: React.FC<LiveCameraProps> = ({ onPhoto, onQrUrl, onBarcode, onLink, onClose, onCameraFailed }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<CameraMode>('search');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const modeRef = useRef<CameraMode>('search');
  modeRef.current = mode;

  // ── Ouverture caméra (une seule fois pour toute la session Lens) ──
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
        } catch { /* torche non supportée */ }
      })
      .catch(() => { if (!cancelled) onCameraFailed(); });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Scan codes actif uniquement en mode Code ──
  useEffect(() => {
    if (mode !== 'code') return;
    const video = videoRef.current;
    if (!video) return;
    const session = startCodeScan(video, (result: CodeScanResult) => {
      if (result.kind === 'url') onQrUrl(result.value);
      else if (result.kind === 'barcode') onBarcode(result.value);
      else setNotice('Ce code ne contient ni lien ni code-barres produit. Essayez un autre code.');
    });
    return () => session.stop();
  }, [mode, onQrUrl, onBarcode]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch { /* ignoré */ }
  };

  /** Obturateur — fige la frame courante en JPEG et lance la suite (~analyse immédiate). */
  const capturePhoto = () => {
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
    }, 'image/jpeg', 0.92);
  };

  const pickFromGallery = () => fileRef.current?.click();

  const MODES: Array<{ id: CameraMode; label: string; icon: React.ReactNode; action?: () => void }> = [
    {
      id: 'search', label: 'Recherche',
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="7" width="18" height="13" rx="3" /><circle cx="12" cy="13.5" r="3.5" /><path d="M8.5 7 10 4.5h4L15.5 7" /></svg>,
    },
    {
      id: 'upload', label: 'Importer',
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-4.5-4.5L6 21" /></svg>,
      action: pickFromGallery,
    },
    {
      id: 'code', label: 'Code',
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6v12M8 6v12M12 6v12M17 6v12M20 6v12" strokeLinecap="round" /></svg>,
    },
  ];

  return (
    <div className="fixed inset-0 z-[76] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="AYROVIX Lens — caméra">
      {/* Flux caméra plein écran */}
      <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/70" />

      {/* Barre haute : fermer · titre · flash */}
      <header className="relative z-10 flex items-center justify-between px-4 pt-4">
        <button type="button" onClick={onClose} aria-label="Fermer AYROVIX"
          className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur transition active:scale-95">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <p className="text-sm font-extrabold tracking-wide drop-shadow">AYROVIX Lens</p>
        <button
          type="button"
          onClick={toggleTorch}
          disabled={!torchAvailable}
          aria-label={torchOn ? 'Éteindre le flash' : 'Allumer le flash'}
          className={`grid h-11 w-11 place-items-center rounded-full backdrop-blur transition active:scale-95 disabled:opacity-35 ${torchOn ? 'bg-amber-300 text-ink' : 'bg-white/15'}`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={torchOn ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" /></svg>
        </button>
      </header>

      {/* Viseur */}
      <div className="pointer-events-none relative z-10 flex flex-1 items-center justify-center px-10">
        <div className="relative aspect-square w-full max-w-[290px]">
          <span className="absolute left-0 top-0 h-9 w-9 rounded-tl-[18px] border-l-[3.5px] border-t-[3.5px] border-white" />
          <span className="absolute right-0 top-0 h-9 w-9 rounded-tr-[18px] border-r-[3.5px] border-t-[3.5px] border-white" />
          <span className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-[18px] border-b-[3.5px] border-l-[3.5px] border-white" />
          <span className="absolute bottom-0 right-0 h-9 w-9 rounded-br-[18px] border-b-[3.5px] border-r-[3.5px] border-white" />
          <span className="lens-scan absolute inset-3 opacity-60" />
        </div>
      </div>

      {/* Zone messages / actions selon le mode */}
      <div className="relative z-10 px-6 pb-2 text-center">
        {mode === 'search' && (
          <p className="text-xs font-semibold text-white/85 drop-shadow">Cadrez le produit, puis touchez l'obturateur — AYROVIX l'identifie en quelques secondes.</p>
        )}
        {mode === 'code' && (
          notice
            ? <p className="mx-auto max-w-xs rounded-2xl bg-red-500/25 px-4 py-2.5 text-xs font-semibold text-red-100">{notice}</p>
            : <p className="text-xs font-semibold text-white/85 drop-shadow">Visez un QR code ou un code-barres — la détection est automatique.</p>
        )}
      </div>

      {/* Obturateur (mode Recherche) */}
      {mode === 'search' && (
        <div className="relative z-10 flex justify-center pb-3 pt-1">
          <button
            type="button"
            onClick={capturePhoto}
            aria-label="Photographier le produit"
            className="grid h-[74px] w-[74px] place-items-center rounded-full border-[5px] border-white/95 bg-white/15 backdrop-blur transition active:scale-90"
          >
            <span className="h-12 w-12 rounded-full bg-white" />
          </button>
        </div>
      )}

      {/* Coller un lien (mode Code) */}
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
            placeholder="…ou collez le lien du produit ici"
            aria-label="Lien du produit"
            className="min-h-[46px] min-w-0 flex-1 rounded-full border border-white/25 bg-white/15 px-4 text-sm text-white placeholder:text-white/60 backdrop-blur focus:border-white focus:outline-none"
          />
          <button type="submit" disabled={!linkInput.trim()}
            className="min-h-[46px] flex-none rounded-full bg-white px-4 text-xs font-extrabold text-ink transition active:scale-95 disabled:opacity-40">
            Analyser
          </button>
        </form>
      )}

      {/* Onglets bas — Recherche / Importer / Code */}
      <nav className="relative z-10 grid grid-cols-3 border-t border-white/10 bg-black/35 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur" aria-label="Mode de recherche">
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
            className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.08em] transition ${mode === item.id ? 'text-white' : 'text-white/55'}`}
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
        aria-hidden="true"
        tabIndex={-1}
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
