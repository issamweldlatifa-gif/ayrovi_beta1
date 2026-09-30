import React, { useRef } from 'react';
import { Camera, Plus } from '../../../components/QatafoIcons';
import { Button } from '../../../design/Button';
import { useLocale } from '../../../i18n/LocaleContext';

export const OcerexHome: React.FC<{ busy: boolean; onFile: (file: File, capture: boolean) => void }> = ({ busy, onFile }) => {
  const { tr } = useLocale();
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const take = (list: FileList | null, capture: boolean) => {
    const file = list?.[0];
    if (file) onFile(file, capture);
  };
  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 py-8">
      <h2 className="text-center font-display text-3xl font-black text-ink">{tr('Importez l’image du prix', 'ارفع صورة السعر')}</h2>
      <button
        type="button"
        disabled={busy}
        onClick={() => uploadRef.current?.click()}
        className="mt-6 grid min-h-52 place-items-center rounded-card border-2 border-dashed border-line bg-white px-6 text-center transition hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
        aria-label={tr('Importer une image', 'رفع صورة')}
      >
        <span>
          <Plus className="mx-auto h-8 w-8 text-ink" aria-hidden />
          <span className="mt-3 block text-base font-black text-ink">{tr('+ Importer une image', '+ رفع صورة')}</span>
        </span>
      </button>
      <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="sr-only" aria-hidden tabIndex={-1} onChange={(event) => { take(event.target.files, false); event.target.value = ''; }} />
      <Button variant="secondary" className="mt-4 w-full" disabled={busy} onClick={() => cameraRef.current?.click()} aria-label={tr('Prendre une photo', 'التقاط صورة')}>
        <Camera className="h-5 w-5" aria-hidden />
        {tr('ou prenez une photo maintenant', 'أو التقط صورة الآن')}
      </Button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-hidden tabIndex={-1} onChange={(event) => { take(event.target.files, true); event.target.value = ''; }} />
      <p className="mt-6 text-center text-sm leading-6 text-muted">{tr('Ocerex lit le prix de référence sur l’image et calcule le prix Ayrovi.', 'Ocerex يقرأ السعر المرجعي من الصورة ويحسب سعر Ayrovi.')}</p>
    </div>
  );
};
