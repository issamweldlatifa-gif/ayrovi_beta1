import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Image as ImageIcon, Mic, MicOff, Plus, SlidersHorizontal, Sparkles, Volume2, VolumeX, X } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import type { AssistantAttachment } from './types';
import type { VoiceState } from './voice/types';
import { globalVoicePlayer } from './voicePlayer';
import { voiceSoundEffects } from './voice/voiceSoundEffects';

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
  onTapOrb?: () => void;
  onOpenAttachments?: () => void;
  onOpenLens?: () => void;
  onAddAttachment?: (file: File) => void;
  onRemoveAttachment?: (id: string) => void;
  onSelectSuggestion?: (suggestion: string) => void;
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
  onTapOrb,
  onOpenAttachments,
  onOpenLens,
  onAddAttachment,
  onRemoveAttachment,
  onSelectSuggestion,
}) => {
  const { tr, direction } = useLocale();
  const [smoothedVolume, setSmoothedVolume] = useState(0);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<'Aoede' | 'Kore' | 'Puck' | 'Fenrir'>('Aoede');
  const [voiceRate, setVoiceRate] = useState<number>(1.05);
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const frameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const triggerHaptic = () => {
    if (hapticsEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(12); } catch {}
    }
  };

  // Handle escape key to exit voice mode or close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSettingsModal) {
          setShowSettingsModal(false);
        } else {
          onExit();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit, showSettingsModal]);

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
      triggerHaptic();
      onAddAttachment(file);
    }
    e.target.value = '';
  };

  const handleVoiceSelect = (voiceId: 'Aoede' | 'Kore' | 'Puck' | 'Fenrir', gender: 'female' | 'male') => {
    setSelectedVoiceId(voiceId);
    globalVoicePlayer.setVoiceSettings({ voiceId, gender, rate: voiceRate });
    triggerHaptic();
  };

  const handleVoiceRateChange = (rate: number) => {
    setVoiceRate(rate);
    const gender = selectedVoiceId === 'Aoede' || selectedVoiceId === 'Kore' ? 'female' : 'male';
    globalVoicePlayer.setVoiceSettings({ voiceId: selectedVoiceId, gender, rate });
    triggerHaptic();
  };

  const handleToggleSoundEffects = () => {
    const next = !soundEffectsEnabled;
    setSoundEffectsEnabled(next);
    voiceSoundEffects.setSoundEnabled(next);
    triggerHaptic();
  };

  const sampleSuggestions = [
    { ar: 'احسبلي سوم هذا 🧮', fr: 'Calculer le prix total 🧮' },
    { ar: 'تبعلي طلبيتي 📦', fr: 'Suivre ma commande 📦' },
    { ar: 'عطيني أفضل العروض ✨', fr: 'Meilleures offres du moment ✨' },
    { ar: 'قداش التوصيل لتونس؟ 🚚', fr: 'Prix de livraison en Tunisie 🚚' },
  ];

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
          onClick={() => { triggerHaptic(); onExit(); }}
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

        <button
          type="button"
          onClick={() => { triggerHaptic(); setShowSettingsModal(true); }}
          className={`grid h-11 w-11 place-items-center rounded-full transition active:scale-90 ${
            showSettingsModal
              ? 'bg-[#FF7A00] text-white'
              : isDark
                ? 'bg-white/10 text-white hover:bg-white/15'
                : 'bg-white text-[#111111] shadow-sm hover:bg-black/5'
          }`}
          aria-label={tr('Options du mode vocal', 'خيارات الوضع الصوتي')}
          title={tr('Options du mode vocal', 'خيارات الوضع الصوتي')}
        >
          <SlidersHorizontal size={20} />
        </button>
      </header>

      {/* 2. Center Stage: Large Reactive Voice Orb & Visualizer */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-4 text-center">
        {/* Active Product or Image context pill if present */}
        {(activeProduct || (attachments && attachments.length > 0)) && (
          <div className="mb-4 flex max-w-xs items-center gap-2 rounded-full border border-black/5 bg-white/85 px-3.5 py-1.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-black/45">
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
            {attachments?.[0]?.id && onRemoveAttachment && (
              <button
                type="button"
                onClick={() => onRemoveAttachment(attachments[0].id)}
                className="grid h-4 w-4 place-items-center rounded-full bg-black/10 text-black hover:bg-black/20 dark:bg-white/20 dark:text-white"
                title={tr('Supprimer la photo', 'حذف الصورة')}
              >
                <X size={10} />
              </button>
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
          <button
            type="button"
            onClick={() => {
              triggerHaptic();
              if (onTapOrb) onTapOrb();
            }}
            className={`relative flex h-44 w-44 cursor-pointer items-center justify-center rounded-full bg-gradient-to-tr ${orbGradient} shadow-2xl transition-transform duration-100 active:scale-95 sm:h-52 sm:w-52`}
            style={{
              transform: `scale(${scale})`,
              boxShadow: isDark
                ? `0 0 ${glow * 1.5}px rgba(255, 122, 0, 0.45)`
                : `0 0 ${glow * 1.8}px rgba(255, 122, 0, 0.55)`,
            }}
            aria-label={tr('Appuyer pour envoyer ou parler', 'اضغط للإرسال أو التحدث')}
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
          </button>
        </div>

        {/* Real State Label */}
        <p className={`mt-8 text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-[#111111]'}`}>
          {stateLabel}
        </p>

        {/* Live Subtitle Transcript */}
        {liveTranscript ? (
          <p
            className={`mt-3 max-w-sm rounded-2xl px-4 py-2 text-sm font-bold italic transition-all ${
              isDark ? 'bg-white/10 text-white/90' : 'bg-white text-[#111111] shadow-sm'
            }`}
          >
            « {liveTranscript} »
          </p>
        ) : (state === 'listening' || state === 'idle') && onSelectSuggestion ? (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5 max-w-xs sm:max-w-md">
            {sampleSuggestions.map((sug, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  triggerHaptic();
                  onSelectSuggestion(tr(sug.fr, sug.ar));
                }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition active:scale-95 ${
                  isDark
                    ? 'bg-white/10 text-white/90 hover:bg-white/15'
                    : 'bg-white text-[#111111] shadow-sm hover:bg-black/5'
                }`}
              >
                <Sparkles size={12} className="text-[#FF7A00]" />
                <span>{tr(sug.fr, sug.ar)}</span>
              </button>
            ))}
          </div>
        ) : null}

        {/* Real-time Audio Waveform Bars */}
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
                onClick={() => { triggerHaptic(); onOpenAttachments(); }}
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
                onClick={() => { triggerHaptic(); onOpenLens(); }}
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
                onClick={() => { triggerHaptic(); fileInputRef.current?.click(); }}
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
              onClick={() => { triggerHaptic(); onToggleMute(); }}
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
              onClick={() => { triggerHaptic(); onExit(); }}
              className="grid h-14 w-14 place-items-center rounded-full bg-[#FF7A00] text-white shadow-lg shadow-[#FF7A00]/30 transition hover:bg-[#e05f00] active:scale-95"
              aria-label={tr('Quitter le mode vocal', 'إيقاف والخروج من الوضع الصوتي')}
            >
              <X size={26} strokeWidth={2.5} />
            </button>

            {/* Speaker / Voice Sound Output Toggle */}
            <button
              type="button"
              onClick={() => { triggerHaptic(); onToggleSpeaker(); }}
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

      {/* 4. Voice Settings Bottom Sheet Modal */}
      {showSettingsModal && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-sm">
          <div
            className={`flex max-h-[85vh] flex-col rounded-t-3xl p-6 shadow-2xl transition-all ${
              isDark ? 'bg-[#1a1a1a] text-white' : 'bg-white text-[#111111]'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-black/5 dark:border-white/10">
              <h3 className="text-base font-black">
                {tr('Paramètres du mode vocal', 'إعدادات الوضع الصوتي')}
              </h3>
              <button
                type="button"
                onClick={() => { triggerHaptic(); setShowSettingsModal(false); }}
                className="grid h-8 w-8 place-items-center rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 space-y-6 overflow-y-auto py-1">
              {/* Voice Selection (Gemini Live & Natural AI Voices) */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-[#6B6B6B]">
                  {tr('Voix de l’assistant (Gemini Live / Realtime)', 'صوت المساعد (Gemini Live)')}
                </label>
                <div className="mt-2.5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleVoiceSelect('Aoede', 'female')}
                    className={`flex items-center justify-between rounded-2xl p-3.5 text-xs font-bold transition ${
                      selectedVoiceId === 'Aoede'
                        ? 'border-2 border-[#FF7A00] bg-[#FF7A00]/10 text-[#FF7A00]'
                        : isDark
                          ? 'border border-white/10 bg-white/5 text-white'
                          : 'border border-black/5 bg-black/5 text-[#111111]'
                    }`}
                  >
                    <span>Aoede (Féminin)</span>
                    {selectedVoiceId === 'Aoede' && <Check size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVoiceSelect('Kore', 'female')}
                    className={`flex items-center justify-between rounded-2xl p-3.5 text-xs font-bold transition ${
                      selectedVoiceId === 'Kore'
                        ? 'border-2 border-[#FF7A00] bg-[#FF7A00]/10 text-[#FF7A00]'
                        : isDark
                          ? 'border border-white/10 bg-white/5 text-white'
                          : 'border border-black/5 bg-black/5 text-[#111111]'
                    }`}
                  >
                    <span>Kore (Féminin Doux)</span>
                    {selectedVoiceId === 'Kore' && <Check size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVoiceSelect('Puck', 'male')}
                    className={`flex items-center justify-between rounded-2xl p-3.5 text-xs font-bold transition ${
                      selectedVoiceId === 'Puck'
                        ? 'border-2 border-[#FF7A00] bg-[#FF7A00]/10 text-[#FF7A00]'
                        : isDark
                          ? 'border border-white/10 bg-white/5 text-white'
                          : 'border border-black/5 bg-black/5 text-[#111111]'
                    }`}
                  >
                    <span>Puck (Masculin)</span>
                    {selectedVoiceId === 'Puck' && <Check size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVoiceSelect('Fenrir', 'male')}
                    className={`flex items-center justify-between rounded-2xl p-3.5 text-xs font-bold transition ${
                      selectedVoiceId === 'Fenrir'
                        ? 'border-2 border-[#FF7A00] bg-[#FF7A00]/10 text-[#FF7A00]'
                        : isDark
                          ? 'border border-white/10 bg-white/5 text-white'
                          : 'border border-black/5 bg-black/5 text-[#111111]'
                    }`}
                  >
                    <span>Fenrir (Masculin Calme)</span>
                    {selectedVoiceId === 'Fenrir' && <Check size={16} />}
                  </button>
                </div>
              </div>

              {/* Voice Speed / Rate */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-[#6B6B6B]">
                  {tr('Vitesse de diction', 'سرعة الكلام')}
                </label>
                <div className="mt-2.5 grid grid-cols-4 gap-2">
                  {[
                    { label: '0.9x', val: 0.9 },
                    { label: '1.0x', val: 1.0 },
                    { label: '1.1x', val: 1.08 },
                    { label: '1.25x', val: 1.25 },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => handleVoiceRateChange(item.val)}
                      className={`rounded-xl py-2.5 text-xs font-bold transition ${
                        Math.abs(voiceRate - item.val) < 0.04
                          ? 'bg-[#FF7A00] text-white shadow-md'
                          : isDark
                            ? 'bg-white/5 text-white hover:bg-white/10'
                            : 'bg-black/5 text-[#111111] hover:bg-black/10'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sound Effects Earcons */}
              <div className="flex items-center justify-between rounded-2xl border border-black/5 p-3.5 dark:border-white/10">
                <div>
                  <p className="text-xs font-bold">
                    {tr('Sons de notification vocale', 'نغمات التنبيه الصوتي')}
                  </p>
                  <p className="text-[11px] text-[#6B6B6B]">
                    {tr('Bips d’écoute et de réponse', 'نغمات لطيفة عند بدء الاستماع والرد')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleSoundEffects}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    soundEffectsEnabled ? 'bg-[#FF7A00]' : 'bg-gray-400/40'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      soundEffectsEnabled ? 'right-0.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Haptics & Feedback */}
              <div className="flex items-center justify-between rounded-2xl border border-black/5 p-3.5 dark:border-white/10">
                <div>
                  <p className="text-xs font-bold">
                    {tr('Retours haptiques / Vibrations', 'الاهتزاز والتفاعل اللمسي')}
                  </p>
                  <p className="text-[11px] text-[#6B6B6B]">
                    {tr('Micro-vibration lors des interactions', 'اهتزاز خفيف عند التحدث والمقاطعة')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !hapticsEnabled;
                    setHapticsEnabled(next);
                    if (next) triggerHaptic();
                  }}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    hapticsEnabled ? 'bg-[#FF7A00]' : 'bg-gray-400/40'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      hapticsEnabled ? 'right-0.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => { triggerHaptic(); setShowSettingsModal(false); }}
              className="mt-6 w-full rounded-2xl bg-[#FF7A00] py-3.5 text-center text-xs font-black text-white shadow-lg shadow-[#FF7A00]/25 active:scale-95"
            >
              {tr('Appliquer', 'تطبيق الإعدادات')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
