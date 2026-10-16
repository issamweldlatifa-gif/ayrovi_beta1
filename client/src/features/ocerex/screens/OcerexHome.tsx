import React, { useEffect, useRef, useState } from 'react';
import { Camera, Plus } from '../../../components/QatafoIcons';
import { Button } from '../../../design/Button';
import { useLocale } from '../../../i18n/LocaleContext';

type Mode = 'camera' | 'upload';

/** Dernières photos de CETTE session de la page seulement : jamais écrites sur le disque ni envoyées ailleurs. */
const sessionPhotos: { url: string; file: File }[] = [];
function remember(file: File) {
  sessionPhotos.unshift({ url: URL.createObjectURL(file), file });
  sessionPhotos.splice(2).forEach((item) => URL.revokeObjectURL(item.url));
}

/**
 * Maquette OCEREX (prix d'étiquette) : viseur en direct, cadre sur le prix, déclencheur.
 * Seul le prix est lu, jamais un autre code. Si la caméra est refusée ou absente,
 * la capture native du téléphone reste disponible.
 */
export const OcerexHome: React.FC<{ busy: boolean; onFile: (file: File, capture: boolean) => void }> = ({ busy, onFile }) => {
  const { tr } = useLocale();
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Mode>('camera');
  const [live, setLive] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (mode !== 'camera') { setLive(false); return; }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setLive(false); setDenied(true); return; }
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((granted) => {
        if (cancelled) { granted.getTracks().forEach((track) => track.stop()); return; }
        stream = granted;
        if (videoRef.current) { videoRef.current.srcObject = granted; void videoRef.current.play().catch(() => {}); }
        setDenied(false);
        setLive(true);
      })
      .catch(() => { if (!cancelled) { setLive(false); setDenied(true); } });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      setLive(false);
    };
  }, [mode]);

  const submit = (file: File, capture: boolean) => {
    remember(file);
    onFile(file, capture);
  };

  const take = (list: FileList | null, capture: boolean) => {
    const file = list?.[0];
    if (file) submit(file, capture);
  };

  const shoot = () => {
    const video = videoRef.current;
    if (!live || !video || !video.videoWidth) { cameraRef.current?.click(); return; }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) { cameraRef.current?.click(); return; }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) submit(new File([blob], 'ocerex-price.jpg', { type: 'image/jpeg' }), true);
      else cameraRef.current?.click();
    }, 'image/jpeg', 0.92);
  };

  const modeTabs = (
    <div className="mt-6 grid grid-cols-2 rounded-full border border-line bg-white p-1" role="group" aria-label={tr('Mode de capture', 'طريقة الالتقاط')}>
      <button type="button" aria-pressed={mode === 'camera'} onClick={() => setMode('camera')}
        className={`min-h-11 rounded-full px-3 text-sm font-bold transition ${mode === 'camera' ? 'bg-accent-soft text-on-accent-soft ring-1 ring-inset ring-cta' : 'text-ink'}`}>
        {tr('Prendre une photo', 'التقاط صورة')}
      </button>
      <button type="button" aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}
        className={`min-h-11 rounded-full px-3 text-sm font-bold transition ${mode === 'upload' ? 'bg-accent-soft text-on-accent-soft ring-1 ring-inset ring-cta' : 'text-ink'}`}>
        {tr('Importer une image', 'رفع صورة')}
      </button>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 py-8">
      <h2 className="text-center font-display text-3xl font-black text-ink">{tr('Importez l’image du prix', 'ارفع صورة السعر')}</h2>

      {modeTabs}

      {mode === 'camera' ? (
        <>
          <div className="relative mt-5 aspect-[3/4] w-full overflow-hidden rounded-card bg-ink">
            <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted aria-hidden />
            {/* Cadre de lecture : le prix doit tenir entièrement dans le cadre. */}
            <div className="pointer-events-none absolute inset-[12%] border-2 border-white/90 rounded-md" aria-hidden />
            <span className="pointer-events-none absolute bottom-[10%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/95 px-4 py-1.5 text-sm font-bold text-ink">
              {tr('Cadrez le prix sur l’étiquette', 'ضع السعر داخل الإطار')}
            </span>
            {!live && (
              <span className="absolute inset-0 grid place-items-center p-6 text-center text-sm font-bold text-white">
                {denied
                  ? tr('La caméra n’est pas disponible. Utilisez la capture de votre téléphone ci-dessous.', 'الكاميرا غير متاحة. استعمل التقاط الهاتف بالأسفل.')
                  : tr('Ouverture de la caméra…', 'جارٍ تشغيل الكاميرا…')}
              </span>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div className="flex w-28 gap-2">
              {sessionPhotos.slice(0, 2).map((item, index) => (
                <button key={item.url} type="button" disabled={busy} onClick={() => onFile(item.file, false)}
                  aria-label={tr('Utiliser cette photo', 'استعمال هذه الصورة')}
                  className="h-14 w-14 overflow-hidden rounded-full border border-line bg-white transition disabled:opacity-50">
                  <img src={item.url} alt="" className="h-full w-full object-cover" data-index={index} />
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={shoot}
              aria-label={tr('Prendre la photo du prix', 'التقاط صورة السعر')}
              className="grid h-20 w-20 place-items-center rounded-full border-4 border-ink bg-white transition disabled:opacity-50"
            >
              <span className="h-14 w-14 rounded-full bg-ink" aria-hidden />
            </button>
            <span className="w-28" aria-hidden />
          </div>

          {denied && (
            <Button variant="secondary" className="mt-4 w-full" disabled={busy} onClick={() => cameraRef.current?.click()} aria-label={tr('Prendre une photo', 'التقاط صورة')}>
              <Camera className="h-5 w-5" aria-hidden />
              {tr('ou prenez une photo maintenant', 'أو التقط صورة الآن')}
            </Button>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => uploadRef.current?.click()}
            className="mt-6 grid min-h-52 place-items-center rounded-card border-2 border-dashed border-line bg-white px-6 text-center transition hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            aria-label={tr('Importer une image', 'رفع صورة')}
          >
            <span>
              <Plus className="mx-auto h-8 w-8 text-ink" aria-hidden />
              <span className="mt-3 block text-base font-black text-ink">{tr('+ Importer une image', '+ رفع صورة')}</span>
            </span>
          </button>
          <Button variant="secondary" className="mt-4 w-full" disabled={busy} onClick={() => cameraRef.current?.click()} aria-label={tr('Prendre une photo', 'التقاط صورة')}>
            <Camera className="h-5 w-5" aria-hidden />
            {tr('ou prenez une photo maintenant', 'أو التقط صورة الآن')}
          </Button>
        </>
      )}

      <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="sr-only" aria-hidden tabIndex={-1} onChange={(event) => { take(event.target.files, false); event.target.value = ''; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-hidden tabIndex={-1} onChange={(event) => { take(event.target.files, true); event.target.value = ''; }} />

      <p className="mt-6 text-center text-sm leading-6 text-muted">{tr('Ocerex lit le prix de référence sur l’image et calcule le prix Zayrovi.', 'Ocerex يقرأ السعر المرجعي من الصورة ويحسب سعر Zayrovi.')}</p>
    </div>
  );
};
