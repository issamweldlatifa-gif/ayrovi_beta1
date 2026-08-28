/**
 * AssistantVoicePlayer — Multi-lingual TTS & real-time streaming audio playback with instant interruption.
 * Cleans formatting, emojis, markdown, and brackets for natural conversational speech.
 */
export class AssistantVoicePlayer {
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private isSpeaking = false;
  private queue: string[] = [];
  private locale = 'fr';
  private onStartCb?: () => void;
  private onEndCb?: () => void;
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;

  public cleanText(text: string): string {
    return text
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\[\[.*?\]\]/g, '')
      .replace(/[*_#`~>]/g, '')
      .replace(/\{.*?\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public speak(
    text: string,
    locale: string,
    onStart?: () => void,
    onEnd?: () => void,
  ): void {
    this.stop();
    const clean = this.cleanText(text);
    if (!clean) {
      onEnd?.();
      return;
    }
    this.locale = locale;
    this.onStartCb = onStart;
    this.onEndCb = onEnd;
    this.queue = [clean];
    this.playNext();
  }

  public queueSentence(
    sentence: string,
    locale: string,
    onStart?: () => void,
    onEnd?: () => void,
  ): void {
    const clean = this.cleanText(sentence);
    if (!clean) return;
    this.locale = locale;
    if (onStart) this.onStartCb = onStart;
    if (onEnd) this.onEndCb = onEnd;
    this.queue.push(clean);
    if (!this.isSpeaking) {
      this.playNext();
    }
  }

  private playNext(): void {
    if (this.queue.length === 0) {
      this.isSpeaking = false;
      this.activeUtterance = null;
      this.onEndCb?.();
      return;
    }

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      this.queue = [];
      this.onEndCb?.();
      return;
    }

    const currentText = this.queue.shift()!;
    const isArabic = /[\u0600-\u06FF]/.test(currentText) || this.locale.startsWith('ar');
    const lang = isArabic ? 'ar-SA' : 'fr-FR';

    const utterance = new SpeechSynthesisUtterance(currentText);
    utterance.lang = lang;
    utterance.rate = 1.08;
    utterance.pitch = 1.0;

    try {
      const voices = window.speechSynthesis.getVoices?.() || [];
      const match = voices.find((v) => v.lang.toLowerCase().startsWith(isArabic ? 'ar' : 'fr'));
      if (match) utterance.voice = match;
    } catch {
      /* Use default voice */
    }

    let ended = false;
    const safeEnd = () => {
      if (ended) return;
      ended = true;
      if (this.safetyTimer) {
        clearTimeout(this.safetyTimer);
        this.safetyTimer = null;
      }
      this.playNext();
    };

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.onStartCb?.();
    };

    utterance.onend = safeEnd;
    utterance.onerror = safeEnd;

    const estimatedMs = Math.max(3000, Math.min(30000, (currentText.length / 12) * 1000));
    this.safetyTimer = setTimeout(() => {
      if (this.isSpeaking) {
        safeEnd();
      }
    }, estimatedMs);

    this.activeUtterance = utterance;

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
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
    this.queue = [];
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

