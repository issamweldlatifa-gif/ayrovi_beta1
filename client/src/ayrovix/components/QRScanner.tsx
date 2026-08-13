import React, { useEffect, useRef, useState } from 'react';
import { startQrScan } from '../services/qr';

interface QRScannerProps {
  onResult: (url: string) => void;
  onClose: () => void;
}

/**
 * Scanner QR réel : caméra arrière, BarcodeDetector natif puis repli jsQR.
 * QR sans URL → message clair, le scan continue. Caméra refusée → fallback « coller le lien ».
 */
export const QRScanner: React.FC<QRScannerProps> = ({ onResult, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const session = startQrScan(
      video,
      (url) => onResult(url),
      (text) => {
        if (text === '__CAMERA_UNAVAILABLE__') setCameraFailed(true);
        else setNotice('Ce QR ne contient pas de lien valide. Visez le code du produit ou collez son lien.');
      },
    );
    return () => session.stop();
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-ink text-white" role="dialog" aria-modal="true" aria-label="Scanner un code QR">
      <div className="flex items-center justify-between p-4">
        <p className="text-sm font-extrabold">Scanner un QR</p>
        <button type="button" onClick={onClose} aria-label="Fermer le scanner"
          className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition active:scale-95">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>

      {cameraFailed ? (
        <div className="mx-6 mt-10 rounded-3xl bg-white/10 p-6 text-center">
          <p className="text-sm font-bold">Caméra indisponible</p>
          <p className="mt-1 text-xs text-white/70">Autorisez l'accès caméra, ou collez directement le lien du produit dans l'écran précédent.</p>
          <button type="button" onClick={onClose} className="mt-4 min-h-[46px] w-full rounded-2xl bg-white px-4 text-sm font-extrabold text-ink">Coller un lien à la place</button>
        </div>
      ) : (
        <>
          <div className="relative mx-6 flex-1 overflow-hidden rounded-3xl bg-black">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
            {/* viseur Lens */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative h-52 w-52">
                <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-white" />
                <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-white" />
                <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-white" />
                <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-white" />
                <span className="lens-scan absolute inset-0 opacity-70" />
              </div>
            </div>
          </div>
          <div className="p-6 text-center">
            {notice
              ? <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-xs font-semibold text-red-200">{notice}</p>
              : <p className="text-xs font-semibold text-white/70">Placez le QR code dans le cadre — l'analyse démarre toute seule dès qu'un lien est lu.</p>}
          </div>
        </>
      )}
    </div>
  );
};
