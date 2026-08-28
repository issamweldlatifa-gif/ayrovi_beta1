import React, { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Square, Volume2, X } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

interface AssistantVoiceOrbProps {
  state: VoiceState;
  volumeLevel: number; // 0.0 to 1.0
  isDark: boolean;
  liveTranscript?: string;
  onInterrupt: () => void;
  onExitVoice: () => void;
  onManualFinish: () => void;
}

export const AssistantVoiceOrb: React.FC<AssistantVoiceOrbProps> = ({
  state,
  volumeLevel,
  isDark,
  liveTranscript,
  onInterrupt,
  onExitVoice,
  onManualFinish,
}) => {
  const { tr, isArabic } = useLocale();
  const [smoothedVolume, setSmoothedVolume] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    let current = smoothedVolume;
    const update = () => {
      current += (volumeLevel - current) * 0.3;
      setSmoothedVolume(current);
      frameRef.current = requestAnimationFrame(update);
    };
    frameRef.current = requestAnimationFrame(update);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [volumeLevel]);

  if (state === 'idle') return null;

  const scale = 1 + Math.min(0.35, smoothedVolume * 0.6);
  const glow = Math.min(28, 8 + smoothedVolume * 35);

  const stateLabel = {
    listening: tr('Écoute en cours…', 'يستمع إليك الآن…'),
    processing: tr('Réflexion en cours…', 'يفكر في الإجابة…'),
    speaking: tr('AYROVI vous répond…', 'يتحدث معك الآن…'),
  }[state];

  const orbTheme = {
    listening: 'from-[#fe7003] via-[#ff8f33] to-[#e05f00]',
    processing: 'from-[#3b82f6] via-[#60a5fa] to-[#2563eb]',
    speaking: 'from-[#10b981] via-[#34d399] to-[#059669]',
  }[state];

  return (
    <div
      className={`relative mx-auto my-3 w-full max-w-sm overflow-hidden rounded-[24px] border p-4 shadow-lg backdrop-blur-md transition-all duration-300 ${
        isDark
          ? 'border-white/15 bg-neutral-900/90 text-white'
          : 'border-orange-200/80 bg-white/95 text-ink'
      }`}
      role="status"
      aria-live="polite"
    >
      {/* Header controls */}
      <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-2.5 w-2.5 rounded-full ${
              state === 'listening'
                ? 'animate-pulse bg-cta'
                : state === 'processing'
                  ? 'animate-spin bg-blue-500'
                  : 'animate-bounce bg-emerald-500'
            }`}
          />
          <span className="text-xs font-black uppercase tracking-wider text-muted">
            {tr('Mode Vocal Actif', 'الوضع الصوتي اللحظي')}
          </span>
        </div>

        <button
          type="button"
          onClick={onExitVoice}
          className="grid h-7 w-7 place-items-center rounded-full text-muted transition hover:bg-black/5 hover:text-ink active:scale-90"
          title={tr('Fermer le mode vocal', 'إغلاق الوضع الصوتي')}
          aria-label={tr('Fermer le mode vocal', 'إغلاق الوضع الصوتي')}
        >
          <X size={15} />
        </button>
      </div>

      {/* Dynamic Voice Orb & Animation */}
      <div className="flex flex-col items-center justify-center py-4 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          {/* Pulsing Outer Rings */}
          <div
            className={`absolute inset-0 rounded-full bg-gradient-to-tr ${orbTheme} opacity-25 blur-md transition-transform duration-150`}
            style={{
              transform: `scale(${scale * 1.25})`,
              filter: `blur(${glow}px)`,
            }}
          />
          <div
            className={`absolute inset-2 rounded-full bg-gradient-to-br ${orbTheme} opacity-40 transition-transform duration-100`}
            style={{ transform: `scale(${scale * 1.1})` }}
          />

          {/* Central Orb Core */}
          <div
            className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr ${orbTheme} shadow-md transition-transform duration-100`}
            style={{ transform: `scale(${scale})` }}
          >
            {state === 'listening' ? (
              <Mic className="h-7 w-7 text-white drop-shadow-sm" />
            ) : state === 'processing' ? (
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Volume2 className="h-7 w-7 animate-pulse text-white drop-shadow-sm" />
            )}
          </div>
        </div>

        {/* State Label */}
        <p className="mt-3 text-sm font-extrabold tracking-tight text-ink">{stateLabel}</p>

        {/* Live Audio Visualizer Bars */}
        {state === 'listening' && (
          <div className="mt-2.5 flex items-center justify-center gap-1">
            {[0.4, 0.8, 0.6, 1, 0.7, 0.9, 0.5, 0.75, 0.3].map((factor, idx) => {
              const barHeight = Math.max(4, Math.min(22, smoothedVolume * 40 * factor + 4));
              return (
                <span
                  key={idx}
                  className="w-1 rounded-full bg-cta transition-[height] duration-75"
                  style={{ height: `${barHeight}px` }}
                />
              );
            })}
          </div>
        )}

        {/* Live Transcript / Subtitle preview */}
        {liveTranscript && (
          <p className="mt-2.5 max-w-xs rounded-xl bg-surface px-3 py-1.5 text-xs font-semibold italic text-muted">
            « {liveTranscript} »
          </p>
        )}
      </div>

      {/* Action Buttons: Barge-in interruption & Manual Send */}
      <div className="flex items-center justify-center gap-2 border-t border-line/60 pt-2.5">
        {state === 'speaking' ? (
          <button
            type="button"
            onClick={onInterrupt}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-danger/10 px-4 text-xs font-black text-danger transition hover:bg-danger/20 active:scale-95"
          >
            <Square size={13} className="fill-current" />
            <span>{tr('Interrompre la réponse', 'مقاطعة والتحدث')}</span>
          </button>
        ) : state === 'listening' ? (
          <button
            type="button"
            onClick={onManualFinish}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-cta px-4 text-xs font-black text-white shadow-sm transition hover:bg-cta-dark active:scale-95"
          >
            <Pause size={14} className="fill-current" />
            <span>{tr('Terminer et envoyer', 'إنهاء وإرسال')}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
};
