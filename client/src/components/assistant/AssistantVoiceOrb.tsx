import React from 'react';
import { Loader2, Pause, Square, X } from '../QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import { VoiceLevel } from './VoiceLevel';
import '../../styles/editorial-voice.css';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';
interface AssistantVoiceOrbProps {
  state: VoiceState;
  volumeLevel: number;
  isDark: boolean;
  liveTranscript?: string;
  onInterrupt: () => void;
  onExitVoice: () => void;
  onManualFinish: () => void;
}
/** Compatibility inline voice panel uses the same visualizer, geometry and actual actions. */
export const AssistantVoiceOrb: React.FC<AssistantVoiceOrbProps> = ({ state, volumeLevel, isDark, liveTranscript, onInterrupt, onExitVoice, onManualFinish }) => {
  const { tr, direction } = useLocale();
  if (state === 'idle') return null;
  const label = state === 'listening' ? tr('Écoute en cours…','يستمع إليك الآن…') : state === 'processing' ? tr('Réflexion en cours…','يفكر في الإجابة…') : tr('AYROVI vous répond…','يتحدث معك الآن…');
  return <section className="editorial-voice-inline" dir={direction} data-ay-design="editorial" data-tone={isDark ? 'dark' : 'light'} aria-label={tr('Mode vocal','الوضع الصوتي')}>
    <header><p role="status">{label}</p><button type="button" className="voice-icon-button" onClick={onExitVoice} aria-label={tr('Fermer le mode vocal','إغلاق الوضع الصوتي')}><X size={20}/></button></header>
    <div className="editorial-voice-inline__level"><VoiceLevel level={volumeLevel}/></div>
    {liveTranscript && <p dir="auto">{liveTranscript}</p>}
    {state === 'processing' ? <Loader2 size={24} className="animate-spin"/> : <button type="button" className="voice-done" onClick={state === 'speaking' ? onInterrupt : onManualFinish}>
      {state === 'speaking' ? <Square size={18}/> : <Pause size={18}/>}{' '}{state === 'speaking' ? tr('Interrompre la réponse','مقاطعة والتحدث') : tr('Terminer et envoyer','إنهاء وإرسال')}
    </button>}
  </section>;
};
