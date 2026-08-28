/**
 * AssistantVoicePlayer — Multi-lingual TTS & audio playback with interruption support.
 * Cleans formatting, emojis, markdown, and brackets for natural conversational speech.
 */
export class AssistantVoicePlayer {
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private isSpeaking = false;

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

    utterance.onstart = () => {
      this.isSpeaking = true;
      onStart?.();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.activeUtterance = null;
      onEnd?.();
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this.activeUtterance = null;
      onEnd?.();
    };

    this.activeUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  public stop(): void {
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
