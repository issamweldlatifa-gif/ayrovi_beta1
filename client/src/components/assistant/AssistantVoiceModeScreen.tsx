import React, { useRef, useState } from 'react';
import { Calculator, Camera, Check, Image as ImageIcon, Loader2, Mic, MicOff, Package, Plus, SlidersHorizontal, Sparkles, Square, Truck, Volume2, VolumeX, X } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { Price } from '../../design/ui/Price';
import { VoiceLevel } from './VoiceLevel';
import { DEFAULT_VOICE_SETTINGS, VOICE_PRESETS, VOICE_RATES, type VoiceOutputSettings } from './voice/settings';
import type { AssistantAttachment } from './types';
import type { VoiceChatState } from './voice/types';
import '../../styles/editorial-voice.css';

interface AssistantVoiceModeScreenProps {
  state: VoiceChatState;
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
  initialSettings?: VoiceOutputSettings;
  onVoiceSettingsChange?: (settings: Partial<VoiceOutputSettings>) => void;
}

export const AssistantVoiceModeScreen: React.FC<AssistantVoiceModeScreenProps> = ({
  state, volumeLevel, isDark, isMuted, isSpeakerMuted, liveTranscript, attachments, activeProduct,
  onToggleMute, onToggleSpeaker, onExit, onTapOrb, onOpenAttachments, onOpenLens, onAddAttachment,
  onRemoveAttachment, onSelectSuggestion, onVoiceSettingsChange, initialSettings = DEFAULT_VOICE_SETTINGS,
}) => {
  const { tr, direction } = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<VoiceOutputSettings>({ ...initialSettings });
  const [haptics, setHaptics] = useState(true);
  const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  useDialogFocus(rootRef, true);
  useDialogFocus(settingsRef, showSettings);
  const vibrate = () => { if (haptics && canVibrate) { try { navigator.vibrate(12); } catch { /* optional device feedback */ } } };
  const changeSettings = (next: Partial<VoiceOutputSettings>) => {
    if (!onVoiceSettingsChange) return;
    setSettings(current => ({ ...current, ...next })); onVoiceSettingsChange(next); vibrate();
  };
  const labels: Record<VoiceChatState, string> = {
    idle: tr('Prêt à vous écouter', 'جاهز للاستماع إليك'),
    starting: tr('Connexion au microphone…', 'جارٍ الاتصال بالميكروفون…'),
    listening: tr('Je vous écoute', 'أنا أستمع إليك'),
    user_speaking: tr('Vous avez la parole', 'تفضل، أنا أستمع'),
    transcribing: tr('Transcription en cours…', 'جارٍ تحويل كلامك إلى نص…'),
    thinking: tr('Je prépare la réponse…', 'جارٍ تحضير الإجابة…'),
    speaking: tr('Je vous réponds', 'إليك الإجابة'),
    muted: tr('Microphone coupé', 'الميكروفون مكتوم'),
    error: tr('Le mode vocal est indisponible', 'الوضع الصوتي غير متاح'),
  };
  const interruptible = state === 'speaking' || state === 'thinking';
  const mayFinish = !isMuted && (state === 'listening' || state === 'user_speaking');
  const tapLabel = interruptible ? tr('Interrompre la réponse', 'مقاطعة الإجابة') : tr('Terminer et envoyer', 'إنهاء وإرسال');
  const suggestions = [
    { fr: 'Calculer le prix total', ar: 'احسبلي سوم هذا', icon: Calculator },
    { fr: 'Suivre ma commande', ar: 'تبعلي طلبيتي', icon: Package },
    { fr: 'Meilleures offres du moment', ar: 'عطيني أفضل العروض', icon: Sparkles },
    { fr: 'Prix de livraison en Tunisie', ar: 'قداش التوصيل لتونس؟', icon: Truck },
  ];
  return <div ref={rootRef} tabIndex={-1} dir={direction} data-ay-design="editorial" data-tone={isDark ? 'dark' : 'light'} data-voice-state={state}
    className="editorial-voice" role="dialog" aria-modal="true" aria-label={tr('Mode vocal AYROVI', 'الوضع الصوتي AYROVI')}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (showSettings) setShowSettings(false); else onExit(); } }}>
    <input ref={fileRef} type="file" accept="image/*" hidden onChange={event => { const file = event.target.files?.[0]; if (file && onAddAttachment) onAddAttachment(file); event.target.value = ''; }} />
    <header className="editorial-voice__header" inert={showSettings}>
      <button type="button" className="voice-icon-button" onClick={onExit} aria-label={tr('Fermer le mode vocal', 'إغلاق الوضع الصوتي')}><X size={22}/></button>
      <span className="editorial-voice__brand" dir="ltr"><i aria-hidden/>AYROVI VOICE</span>
      <button type="button" className="voice-icon-button" onClick={() => setShowSettings(true)} aria-haspopup="dialog" aria-expanded={showSettings} aria-label={tr('Options du mode vocal', 'خيارات الوضع الصوتي')}><SlidersHorizontal size={22}/></button>
    </header>
    <main className="editorial-voice__body" inert={showSettings}>
      {(activeProduct || attachments?.length) ? <section className="editorial-voice__context" aria-label={tr('Contexte de la conversation', 'سياق المحادثة')}>
        {activeProduct?.image || attachments?.[0]?.preview ? <img src={activeProduct?.image || attachments?.[0]?.preview} alt=""/> : <Camera size={24}/>}
        <div><strong>{activeProduct?.title || tr('Photo jointe', 'صورة مرفقة')}</strong>
          {activeProduct?.priceTnd != null && Number.isFinite(activeProduct.priceTnd) && <Price amount={activeProduct.priceTnd} size="sm" currencyLabel={tr('DT', 'د.ت')}/>}
          {(attachments?.length || 0) > 1 && <small>{tr(`${attachments!.length} pièces jointes`, `${attachments!.length} مرفقات`)}</small>}
        </div>
        {attachments?.[0]?.id && onRemoveAttachment && <button type="button" className="voice-icon-button" onClick={() => onRemoveAttachment(attachments[0].id)} aria-label={tr('Supprimer la photo', 'حذف الصورة')}><X size={18}/></button>}
      </section> : null}
      <div className="editorial-voice__signal">
        <button type="button" className="editorial-voice__talk" onClick={() => { vibrate(); onTapOrb?.(); }} disabled={!onTapOrb || !(interruptible || mayFinish)} aria-label={tapLabel}>
          <VoiceLevel level={volumeLevel} muted={isMuted}/>
          <span>{state === 'starting' || state === 'transcribing' ? <Loader2 size={20} className="animate-spin"/> : interruptible ? <Square size={20}/> : isMuted ? <MicOff size={20}/> : <Mic size={20}/>}</span>
        </button>
        <h2 role="status" aria-live="polite">{isMuted ? labels.muted : labels[state]}</h2>
        <p>{state === 'error' ? tr('Revenez au chat pour réessayer ou écrire votre demande.', 'عد إلى المحادثة لإعادة المحاولة أو كتابة طلبك.') : interruptible ? tr('Vous pouvez interrompre la réponse.', 'يمكنك مقاطعة الإجابة.') : tr('Le tracé suit le niveau audio reçu.', 'الرسم يتبع مستوى الصوت المستقبَل.')}</p>
      </div>
      {liveTranscript ? <blockquote dir="auto">{liveTranscript}</blockquote> : (state === 'listening' || state === 'idle') && onSelectSuggestion ? <div className="editorial-voice__suggestions">
        {suggestions.map(item => <button type="button" key={item.fr} onClick={() => onSelectSuggestion(tr(item.fr, item.ar))}><item.icon size={18}/><span>{tr(item.fr,item.ar)}</span></button>)}
      </div> : null}
    </main>
    <footer className="editorial-voice__footer" inert={showSettings}>
      <div className="editorial-voice__controls">
        {onOpenAttachments && <button type="button" className="voice-icon-button" onClick={onOpenAttachments} aria-label={tr('Ajouter une photo','إضافة صورة')}><Plus size={22}/></button>}
        <button type="button" className="voice-icon-button" disabled={!onOpenLens && !onAddAttachment} onClick={() => onOpenLens ? onOpenLens() : fileRef.current?.click()} aria-label={onOpenLens ? tr('Scanner avec AYROVIX Lens','فحص مع AYROVIX Lens') : tr('Choisir une photo','اختيار صورة')}>{onOpenLens ? <Camera size={22}/> : <ImageIcon size={22}/>}</button>
        <button type="button" className="voice-icon-button" onClick={onToggleMute} aria-pressed={isMuted} aria-label={isMuted ? tr('Activer le microphone','إلغاء كتم الصوت') : tr('Couper le microphone','كتم الصوت')}>{isMuted ? <MicOff size={22}/> : <Mic size={22}/>}</button>
        <button type="button" className="voice-icon-button voice-icon-button--exit" onClick={onExit} aria-label={tr('Quitter le mode vocal','إيقاف والخروج من الوضع الصوتي')}><X size={22}/></button>
        <button type="button" className="voice-icon-button" onClick={onToggleSpeaker} aria-pressed={!isSpeakerMuted} aria-label={isSpeakerMuted ? tr('Activer le haut-parleur','تشغيل الصوت') : tr('Couper le haut-parleur','إيقاف الصوت')}>{isSpeakerMuted ? <VolumeX size={22}/> : <Volume2 size={22}/>}</button>
      </div>
    </footer>
    {showSettings && <div className="editorial-voice__veil"><div ref={settingsRef} tabIndex={-1} className="editorial-voice__settings" role="dialog" aria-modal="true" aria-labelledby="voice-settings-title">
      <header><h3 id="voice-settings-title">{tr('Paramètres vocaux','إعدادات الصوت')}</h3><button type="button" className="voice-icon-button" onClick={() => setShowSettings(false)} aria-label={tr('Fermer les paramètres','إغلاق الإعدادات')}><X size={20}/></button></header>
      <div className="editorial-voice__settings-scroll">
        <p className="voice-caption">{onVoiceSettingsChange ? tr('Les changements sont appliqués immédiatement.','تُطبَّق التغييرات مباشرةً.') : tr('Réglages indisponibles dans cette session.','الإعدادات غير متاحة في هذه الجلسة.')}</p>
        <fieldset disabled={!onVoiceSettingsChange}><legend>{tr('Voix de l’assistant','صوت المساعد')}</legend><div className="voice-choices">
          {VOICE_PRESETS.map(preset => <button type="button" key={preset.id} aria-pressed={settings.voiceId===preset.id} onClick={() => changeSettings({voiceId:preset.id,gender:preset.gender})}><span><bdi>{preset.id}</bdi><small>{tr(preset.fr,preset.ar)}</small></span>{settings.voiceId===preset.id && <Check size={18}/>}</button>)}
        </div></fieldset>
        <fieldset disabled={!onVoiceSettingsChange}><legend>{tr('Vitesse de diction','سرعة الكلام')}</legend><div className="voice-rates">
          {VOICE_RATES.map(rate => <button type="button" key={rate} aria-pressed={settings.rate===rate} onClick={() => changeSettings({rate})}><bdi>{rate}x</bdi></button>)}
        </div></fieldset>
        <div className="voice-haptics"><span>{tr('Retours haptiques','التفاعل بالاهتزاز')}<small>{canVibrate ? tr('Vibration légère lors des interactions.','اهتزاز خفيف عند التفاعل.') : tr('Non pris en charge par ce navigateur.','غير مدعوم في هذا المتصفح.')}</small></span>
          <button type="button" className="voice-icon-button" role="switch" aria-checked={haptics && canVibrate} disabled={!canVibrate} aria-label={tr('Retours haptiques','التفاعل بالاهتزاز')} onClick={() => { const next=!haptics;setHaptics(next);if(next && canVibrate){try{navigator.vibrate(12);}catch{}} }}><span aria-hidden>{haptics && canVibrate ? <Check size={20}/> : <X size={20}/>}</span></button>
        </div>
      </div>
      <button type="button" className="voice-done" onClick={() => setShowSettings(false)}>{tr('Terminé','تم')}</button>
    </div></div>}
  </div>;
};
