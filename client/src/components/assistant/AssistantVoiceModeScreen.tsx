import React, { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Mic, MicOff, Plus, SlidersHorizontal, Volume2, VolumeX, X } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import type { AssistantAttachment } from './types';
import type { VoiceState } from './voice/types';

interface AssistantVoiceModeScreenProps {
  state: VoiceState;
  volumeLevel: number; // 0.0 to 1.0 (real audio level)
  isDark: boolean;
  isMuted: boolean;
  isSpeakerMuted: boolean;
  liveTranscript?: string;
  attachments?: AssistantAttachment[];
  activeProduct?: {
    title: string;
    brand?: string;
    price?: number;
    currency?: string;
    image?: string;
    priceTnd?: number;
  } | null;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onExit: () => void;
  onOpenSettings?: () => void;
  onOpenAttachments?: () => void;
  onOpenLens?: () => void;
  onAddAttachment?: (file: File) => void;
}

export const AssistantVoiceModeScreen: React.FC<AssistantVoiceModeScreenProps> = ({
  state,
  volumeLevel,
  isDark,
  isMuted,
  isSpeakerMuted,
  liveTranscript,
  attachments,
  activeProduct,
  onToggleMute,
  onToggleSpeaker,
  onExit,
  onOpenSettings,
  onOpenAttachments,
  onOpenLens,
  onAddAttachment,
}) => {
  const { tr, direction } = useLocale();
  const [smoothedVolume, setSmoothedVolume] = useState(0);
  const frameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle escape key to exit voice mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit]);

  // Smooth real-time volume animation
  useEffect(() => {
    let current = smoothedVolume;
    const update = () => {
      current += (volumeLevel - current) * 0.35;
      setSmoothedVolume(current);
      frameRef.current = requestAnimationFrame(update);
    };
    frameRef.current = requestAnimationFrame(update);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [volumeLevel]);

  const scale = 1 + Math.min(0.4, smoothedVolume * 0.75);
  const glow = Math.min(40, 12 + smoothedVolume * 50);

  // Dynamic status text matching real states
  const stateLabel = isMuted
    ? tr('Microphone coupé', 'تم كتم الميكروفون...')
    : state === 'listening'
      ? tr('Écoute en cours…', 'استمع...')
      : state === 'user_speaking'
        ? tr('Vous parlez…', 'أنت تتحدث...')
        : state === 'processing'
          ? tr('Je réfléchis…', 'يفكر...')
          : state === 'tool_execution'
            ? tr('Recherche et calcul en cours…', 'جاري البحث والحساب...')
            : state === 'assistant_speaking'
              ? tr('Je vous réponds…', 'يتحدث...')
              : state === 'interrupted'
                ? tr('Interrompu', 'تمت المقاطعة...')
                : state === 'error'
                  ? tr('Erreur microphone', 'خطأ في الميكروفون')
                  : tr('Prêt', 'جاهز');

  // Dynamic gradient reflecting exact state
  const orbGradient = state === 'interrupted'
    ? 'from-[#f97316] via-[#fb923c] to-[#ea580c]'
    : state === 'processing' || state === 'tool_execution'
      ? 'from-[#3b82f6] via-[#60a5fa] to-[#2563eb]'
      : state === 'assistant_speaking'
        ? 'from-[#FF7A00] via-[#ffa34d] to-[#e06600]'
        : state === 'error'
          ? 'from-[#ef4444] via-[#f87171] to-[#dc2626]'
          : 'from-[#FF7A00] via-[#ff9433] to-[#e05f00]';

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onAddAttachment) {
      onAddAttachment(file);
    }
    e.target.value = '';
  };

  return (
    <div
      dir={direction}
      className={`absolute inset-0 z-40 flex flex-col justify-between overflow-hidden transition-all duration-300 ${
        isDark ? 'bg-[#111111] text-white' : 'bg-[#F7F7F7] text-[#111111]'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={tr('Mode Vocal AYROVI', 'الوضع الصوتي AYROVI')}
    >
      {/* Hidden file input for camera/gallery attachments */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* 1. Top Header: Exit (X), Center Brand & Settings */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))]">
        <button
          type="button"
          onClick={onExit}
          className={`grid h-11 w-11 place-items-center rounded-full transition active:scale-90 ${
            isDark
              ? 'bg-white/10 text-white hover:bg-white/15'
              : 'bg-white text-[#111111] shadow-sm hover:bg-black/5'
          }`}
          aria-label={tr('Fermer le mode vocal', 'إغلاق الوضع الصوتي')}
          title={tr('Fermer le mode vocal', 'إغلاق الوضع الصوتي')}
        >
          <X size={20} />
        </button>

        {/* Center Live Mode Indicator */}
        <div className="flex items-center gap-2 rounded-full border border-black/5 bg-white/70 px-3.5 py-1.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-black/30">
          <span className="h-2 w-2 rounded-full bg-[#FF7A00] animate-pulse" />
          <span className="text-xs font-black tracking-wide">
            AYROVI VOICE
          </span>
        </div>

        {onOpenSettings ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className={`grid h-11 w-11 place-items-center rounded-full transition active:scale-90 ${
              isDark
                ? 'bg-white/10 text-white hover:bg-white/15'
                : 'bg-white text-[#111111] shadow-sm hover:bg-black/5'
            }`}
            aria-label={tr('Options du mode vocal', 'خيارات الوضع الصوتي')}
            title={tr('Options du mode vocal', 'خيارات الوضع الصوتي')}
          >
            <SlidersHorizontal size={20} />
          </button>
        ) : (
          <div className="w-11" />
        )}
      </header>

      {/* 2. Center Stage: Large Reactive Voice Orb & Visualizer */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-4 text-center">
        {/* Active Product or Image context pill if present */}
        {(activeProduct || (attachments && attachments.length > 0)) && (
          <div className="mb-4 flex max-w-xs items-center gap-2 rounded-full border border-black/5 bg-white/80 px-3.5 py-1.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-black/40">
            {activeProduct?.image || attachments?.[0]?.preview ? (
              <img
                src={activeProduct?.image || attachments?.[0]?.preview}
                alt=""
                className="h-7 w-7 rounded-full object-cover shadow-sm"
              />
            ) : (
              <Camera size={16} className="text-[#FF7A00]" />
            )}
            <span className="truncate text-xs font-bold">
              {activeProduct?.title || tr('Photo attachée pour analyse', 'صورة مرفقة للتحليل')}
            </span>
            {activeProduct?.priceTnd != null && (
              <span className="rounded bg-[#FF7A00]/10 px-1.5 py-0.5 text-[11px] font-black text-[#FF7A00]">
                {activeProduct.priceTnd} TND
              </span>
            )}
          </div>
        )}

        {/* Ambient background glow */}
        <div
          className="pointer-events-none absolute h-72 w-72 rounded-full bg-[#FF7A00]/15 blur-3xl transition-all duration-300"
          style={{ transform: `scale(${scale * 1.35})` }}
        />

        {/* Outer Orb Rings */}
        <div className="relative flex h-60 w-60 items-center justify-center sm:h-72 sm:w-72">
          {/* Pulsing ring 1 */}
          <div
            className={`absolute inset-0 rounded-full bg-gradient-to-tr ${orbGradient} opacity-20 blur-xl transition-all duration-200`}
            style={{
              transform: `scale(${scale * 1.22})`,
              filter: `blur(${glow}px)`,
            }}
          />

          {/* Pulsing ring 2 */}
          <div
            className={`absolute inset-4 rounded-full bg-gradient-to-br ${orbGradient} opacity-35 transition-all duration-150`}
            style={{
              transform: `scale(${scale * 1.1})`,
            }}
          />

          {/* Floating satellite dots */}
          <div
            className="pointer-events-none absolute -left-2 top-10 h-3 w-3 rounded-full bg-[#FF7A00] opacity-80 shadow-md transition-transform duration-300"
            style={{ transform: `translateY(${Math.sin(smoothedVolume * 10) * 8}px)` }}
          />
          <div
            className="pointer-events-none absolute -right-2 top-20 h-4 w-4 rounded-full bg-[#FF7A00] opacity-90 shadow-md transition-transform duration-300"
            style={{ transform: `translateY(${-Math.sin(smoothedVolume * 10) * 10}px)` }}
          />
          <div
            className="pointer-events-none absolute bottom-8 left-4 h-2.5 w-2.5 rounded-full bg-[#FF7A00] opacity-75 shadow-md"
          />

          {/* Core Central Glowing Orb */}
          <div
            className={`relative flex h-44 w-44 items-center justify-center rounded-full bg-gradient-to-tr ${orbGradient} shadow-2xl transition-transform duration-100 sm:h-52 sm:w-52`}
            style={{
              transform: `scale(${scale})`,
              boxShadow: isDark
                ? `0 0 ${glow * 1.5}px rgba(255, 122, 0, 0.45)`
                : `0 0 ${glow * 1.8}px rgba(255, 122, 0, 0.55)`,
            }}
          >
            {/* Waveform texture overlay inside orb */}
            <div className="pointer-events-none absolute inset-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-[2px]" />
            <svg
              className="h-24 w-28 text-white/80 transition-transform duration-100"
              viewBox="0 0 100 40"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path
                d={`M 10 20 Q 30 ${20 - smoothedVolume * 18} 50 20 T 90 20`}
                className="transition-all duration-75"
              />
            </svg>
          </div>
        </div>

        {/* Real State Label */}
        <p className={`mt-8 text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-[#111111]'}`}>
          {stateLabel}
        </p>

        {/* Live Subtitle Transcript */}
        {liveTranscript && (
          <p
            className={`mt-3 max-w-sm rounded-2xl px-4 py-2 text-sm font-bold italic transition-all ${
              isDark ? 'bg-white/10 text-white/90' : 'bg-white text-[#111111] shadow-sm'
            }`}
          >
            « {liveTranscript} »
          </p>
        )}

        {/* Real-time Audio Waveform Bars (reacting strictly to real volume) */}
        <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden="true">
          {[
            0.2, 0.35, 0.5, 0.7, 0.45, 0.85, 0.6, 1.0, 0.75, 0.9, 0.55, 0.8, 0.4, 0.65, 0.3, 0.2,
          ].map((factor, idx) => {
            const barH = Math.max(
              3,
              Math.min(28, isMuted ? 3 : smoothedVolume * 45 * factor + 3),
            );
            return (
              <span
                key={idx}
                className={`w-1 rounded-full transition-[height] duration-75 ${
                  state === 'processing' || state === 'tool_execution'
                    ? 'bg-blue-500'
                    : state === 'error'
                      ? 'bg-red-500'
                      : 'bg-[#FF7A00]'
                }`}
                style={{ height: `${barH}px` }}
              />
            );
          })}
        </div>
      </main>

      {/* 3. Bottom Composer & Voice Controls */}
      <footer className="relative z-10 px-6 pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+1.25rem))] pt-4">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 sm:gap-5">
          {/* Left Side: Multimodal Image & Lens Actions */}
          <div className="flex items-center gap-2">
            {onOpenAttachments ? (
              <button
                type="button"
                onClick={onOpenAttachments}
                className={`grid h-12 w-12 place-items-center rounded-full transition active:scale-95 ${
                  attachments && attachments.length > 0
                    ? 'bg-[#FF7A00] text-white shadow-md'
                    : isDark
                      ? 'bg-white/10 text-white hover:bg-white/15'
                      : 'bg-white text-[#111111] shadow-sm hover:bg-black/5'
                }`}
                title={tr('Ajouter une photo', 'إضافة صورة')}
                aria-label={tr('Ajouter une photo', 'إضافة صورة')}
              >
                <Plus size={20} />
              </button>
            ) : null}

            {onOpenLens ? (
              <button
                type="button"
                onClick={onOpenLens}
                className={`grid h-12 w-12 place-items-center rounded-full transition active:scale-95 ${
                  isDark
                    ? 'bg-white/10 text-white hover:bg-white/15'
                    : 'bg-white text-[#111111] shadow-sm hover:bg-black/5'
                }`}
                title={tr('Scanner avec AYROVIX Lens', 'فحص مع AYROVIX Lens')}
                aria-label={tr('Scanner avec AYROVIX Lens', 'فحص مع AYROVIX Lens')}
              >
                <Camera size={20} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`grid h-12 w-12 place-items-center rounded-full transition active:scale-95 ${
                  isDark
                    ? 'bg-white/10 text-white hover:bg-white/15'
                    : 'bg-white text-[#111111] shadow-sm hover:bg-black/5'
                }`}
                title={tr('Choisir une photo', 'اختيار صورة')}
                aria-label={tr('Choisir une photo', 'اختيار صورة')}
              >
                <ImageIcon size={20} />
              </button>
            )}
          </div>

          {/* Right Side: Mute | Central Exit [X] | Speaker Controls */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Mute / Unmute Button */}
            <button
              type="button"
              onClick={onToggleMute}
              className={`grid h-14 w-14 place-items-center rounded-full transition active:scale-95 ${
                isMuted
                  ? 'bg-danger/15 text-danger ring-2 ring-danger/30'
                  : isDark
                    ? 'bg-white/10 text-white hover:bg-white/15'
                    : 'bg-white text-[#111111] shadow-md hover:bg-black/5'
              }`}
              aria-label={isMuted ? tr('Activer le microphone', 'إلغاء كتم الصوت') : tr('Couper le microphone', 'كتم الصوت')}
              aria-pressed={isMuted}
            >
              {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>

            {/* Central Exit Button (X) */}
            <button
              type="button"
              onClick={onExit}
              className="grid h-14 w-14 place-items-center rounded-full bg-[#FF7A00] text-white shadow-lg shadow-[#FF7A00]/30 transition hover:bg-[#e05f00] active:scale-95"
              aria-label={tr('Quitter le mode vocal', 'إيقاف والخروج من الوضع الصوتي')}
            >
              <X size={26} strokeWidth={2.5} />
            </button>

            {/* Speaker / Voice Sound Output Toggle */}
            <button
              type="button"
              onClick={onToggleSpeaker}
              className={`grid h-14 w-14 place-items-center rounded-full transition active:scale-95 ${
                isSpeakerMuted
                  ? 'bg-white/5 text-[#6B6B6B]'
                  : isDark
                    ? 'bg-white/10 text-white hover:bg-white/15'
                    : 'bg-white text-[#111111] shadow-md hover:bg-black/5'
              }`}
              aria-label={isSpeakerMuted ? tr('Activer le haut-parleur', 'تشغيل الصوت') : tr('Couper le haut-parleur', 'إيقاف الصوت')}
              aria-pressed={!isSpeakerMuted}
            >
              {isSpeakerMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
