/**
 * AssistantVoicePlayer — Multi-lingual TTS & audio playback with interruption support.
 * Cleans formatting, emojis, markdown, and brackets for natural conversational speech.
 */
export class AssistantVoicePlayer {
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private isSpeaking = false;
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;

  public speak(
    text: string,
    locale: string,
    onStart?: () => void,
    onEnd?: () => void,
  ): void {
    this.stop();

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      onEnd?.();
      return;
    }

    // Clean text for speech synthesis
    const clean = text
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\[\[.*?\]\]/g, '')
      .replace(/[*_#`~>]/g, '')
      .replace(/\{.*?\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) {
      onEnd?.();
      return;
    }

    const isArabic = /[\u0600-\u06FF]/.test(clean) || locale.startsWith('ar');
    const lang = isArabic ? 'ar-SA' : 'fr-FR';

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = lang;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Pick best available matching voice
    try {
      const voices = window.speechSynthesis.getVoices?.() || [];
      const match = voices.find((v) => v.lang.toLowerCase().startsWith(isArabic ? 'ar' : 'fr'));
      if (match) utterance.voice = match;
    } catch {
      /* Use default */
    }

    let ended = false;
    const safeEnd = () => {
      if (ended) return;
      ended = true;
      if (this.safetyTimer) {
        clearTimeout(this.safetyTimer);
        this.safetyTimer = null;
      }
      this.isSpeaking = false;
      this.activeUtterance = null;
      onEnd?.();
    };

    utterance.onstart = () => {
      this.isSpeaking = true;
      onStart?.();
    };

    utterance.onend = safeEnd;
    utterance.onerror = safeEnd;

    // Safety timeout: roughly 150 words per minute plus buffer
    const estimatedMs = Math.max(4000, Math.min(45000, (clean.length / 15) * 1000));
    this.safetyTimer = setTimeout(() => {
      if (this.isSpeaking) {
        this.stop();
        safeEnd();
      }
    }, estimatedMs);

    this.activeUtterance = utterance;

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
      // Extra resume for Chrome webkit bug
      setTimeout(() => {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 50);
    } catch {
      safeEnd();
    }
  }

  public stop(): void {
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    this.isSpeaking = false;
    this.activeUtterance = null;
  }

  public get speaking(): boolean {
    return this.isSpeaking;
  }
}

export const globalVoicePlayer = new AssistantVoicePlayer();
