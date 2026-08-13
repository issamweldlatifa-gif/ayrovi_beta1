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
  const [torchHint, setTorchHint] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
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

  /**
   * Torche : nécessite HTTPS + permission caméra + track arrière (Android Chrome).
   * Certains appareils n'exposent la capacité qu'après le premier applyConstraints —
   * on tente réellement la commande et on signale clairement si l'appareil refuse.
   */
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTorch}
            aria-label={torchOn ? 'Éteindre le flash' : 'Allumer le flash'}
            className={`grid h-11 w-11 place-items-center rounded-full backdrop-blur transition active:scale-95 ${torchAvailable ? '' : 'opacity-45'} ${torchOn ? 'bg-amber-300 text-ink' : 'bg-white/15'}`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill={torchOn ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" /></svg>
          </button>
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            aria-label="Conditions et mode d'emploi d'AYROVIX Lens"
            className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur transition active:scale-95"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
          </button>
        </div>
      </header>
      {torchHint && (
        <p className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-[11px] font-semibold text-white/90">
          Flash non proposé par cet appareil/navigateur — rapprochez-vous avec un bon éclairage.
        </p>
      )}

      {/* Viseur - AYROVIX Glassmorphism V2 */}
      <div className="pointer-events-none relative z-10 flex flex-1 items-center justify-center px-10">
        <div className="relative aspect-square w-full max-w-[300px]">
          {/* Glass blur background */}
          <div className="absolute inset-0 rounded-[28px] bg-white/5 backdrop-blur-[2px] border border-white/10" />
          {/* Corners with purple glow */}
          <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-[26px] border-l-[3.5px] border-t-[3.5px] border-white shadow-[0_0_12px_rgba(103,61,230,0.6)]" />
          <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-[26px] border-r-[3.5px] border-t-[3.5px] border-white shadow-[0_0_12px_rgba(103,61,230,0.6)]" />
          <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-[26px] border-b-[3.5px] border-l-[3.5px] border-white shadow-[0_0_12px_rgba(103,61,230,0.6)]" />
          <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-[26px] border-b-[3.5px] border-r-[3.5px] border-white shadow-[0_0_12px_rgba(103,61,230,0.6)]" />
          {/* Laser line with purple gradient and particles */}
          <div className="absolute inset-3 overflow-hidden rounded-[18px]">
            <div className="lens-laser absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#7e57ff] to-transparent shadow-[0_0_8px_#673de6]" />
            <div className="lens-particles absolute inset-0" />
          </div>
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

      {/* ── Sheet : mode d'emploi + conditions d'utilisation ── */}
      {showInfo && (
        <div className="fixed inset-0 z-30 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Mode d'emploi et conditions AYROVIX Lens">
          <button type="button" aria-label="Fermer" onClick={() => setShowInfo(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative max-h-[82vh] w-full max-w-md overflow-y-auto rounded-t-[26px] bg-[#17131f] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 text-white">
            <span className="mx-auto mb-4 block h-1 w-11 rounded-full bg-white/25" />
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-extrabold">AYROVIX Lens</p>
              <button type="button" onClick={() => setShowInfo(false)} aria-label="Fermer l'aide"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition active:scale-95">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>

            <section className="mb-5">
              <p className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-violet-300">Comment l'utiliser</p>
              <ol className="space-y-2.5 text-[13px] leading-relaxed text-white/85">
                <li><b className="text-white">1 · Cadrez</b> le produit (ou visez un QR / code-barres en mode « Code ») dans un bon éclairage.</li>
                <li><b className="text-white">2 · AYROVIX identifie</b> l'article grâce à l'IA, puis recherche les meilleures correspondances.</li>
                <li><b className="text-white">3 · Vous confirmez</b> le bon produit parmi les propositions — jamais de choix automatique.</li>
                <li><b className="text-white">4 · Prix final en DT</b> calculé par le Calculator AYROVI, puis commande avec acompte 20%.</li>
              </ol>
            </section>

            <section>
              <p className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-violet-300">Conditions d'utilisation</p>
              <ul className="list-disc space-y-2 pl-4 text-[12.5px] leading-relaxed text-white/70">
                <li>L'identification par IA est une <b className="text-white/90">aide indicative</b> : vérifiez toujours la fiche (marque, modèle, taille) avant de commander.</li>
                <li>Le prix source peut évoluer ; <b className="text-white/90">le prix final AYROVIX confirmé au panier</b> fait foi.</li>
                <li>Photos et images servent uniquement à l'identification — elles ne sont <b className="text-white/90">pas conservées</b> après analyse.</li>
                <li>Ne scannez ni personnes, ni documents personnels, ni contenus illégaux.</li>
                <li>Usage personnel et raisonnable — un anti-abus limite le nombre d'analyses par période.</li>
                <li>En commandant, les règles habituelles AYROVI s'appliquent (acompte 20%, validation du paiement, suivi).</li>
              </ul>
            </section>

            <button type="button" onClick={() => setShowInfo(false)}
              className="mt-5 min-h-[48px] w-full rounded-2xl bg-white text-sm font-extrabold text-ink transition active:scale-[0.98]">
              C'est compris
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
