import React from 'react';
import { ArrowLeft, CheckCircle2, Volume2, VolumeX } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';

interface FullscreenMediaHeaderProps {
  title?: string;
  subtitle?: string;
  avatarUrl?: string;
  official?: boolean;
  verified?: boolean;
  muted: boolean;
  onBack: () => void;
  onToggleMute: () => void;
  offsetForProgress?: boolean;
}

export const FullscreenMediaHeader: React.FC<FullscreenMediaHeaderProps> = ({ title, subtitle, avatarUrl, official, verified, muted, onBack, onToggleMute, offsetForProgress = false }) => {
  const { tr, direction } = useLocale();
  return (
    <div className={`absolute inset-x-0 z-40 flex items-center gap-2.5 bg-gradient-to-b from-black/60 to-transparent px-3 pb-8 ${offsetForProgress ? 'top-3 pt-[max(1.25rem,env(safe-area-inset-top))]' : 'top-0 pt-[max(.75rem,env(safe-area-inset-top))]'}`} dir={direction}>
      <button type="button" onClick={onBack} aria-label={tr('Retour', 'رجوع')} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/10 active:scale-90"><ArrowLeft className={`h-6 w-6 ${direction === 'rtl' ? 'rotate-180' : ''}`} /></button>
      {title && <>
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-white/40 bg-white">
          {official ? <img src="/media/logo-ayrovi-final.png?v=fig3" alt="" className="h-full w-full object-contain p-1" /> : avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-xs font-black text-brand">{title.slice(0, 2).toUpperCase()}</span>}
        </span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-white">{title}{verified && <CheckCircle2 className="ms-1 inline h-3.5 w-3.5 text-white" />}</p>{subtitle && <p className="truncate text-[10px] font-semibold text-white/75">{subtitle}</p>}</div>
      </>}
      {!title && <span className="flex-1" />}
      <button type="button" onClick={onToggleMute} aria-label={muted ? tr('Activer le son', 'تشغيل الصوت') : tr('Couper le son', 'كتم الصوت')} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/40 text-white transition active:scale-90">{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button>
    </div>
  );
};
