/**
 * AssistantVoicePlayer — Multi-lingual TTS & real-time streaming audio playback with instant interruption.
 * Cleans formatting, emojis, markdown, and brackets for natural conversational speech.
 */
export class AssistantVoicePlayer {
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private isSpeaking = false;
  private queue: string[] = [];
  private locale = 'fr';
  private rate = 1.08;
  private pitch = 1.0;
  private voiceGender: 'female' | 'male' = 'female';
  private onStartCb?: () => void;
  private onEndCb?: () => void;
  private onLevelCb?: (level: number) => void;
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;
  private levelAnimFrame: number | null = null;

  public cleanText(text: string): string {
    return text
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\[\[.*?\]\]/g, '')
      .replace(/[*_#`~>]/g, '')
      .replace(/\{.*?\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public setVoiceSettings(settings: { rate?: number; pitch?: number; gender?: 'female' | 'male' }): void {
    if (settings.rate != null) this.rate = Math.max(0.7, Math.min(1.5, settings.rate));
    if (settings.pitch != null) this.pitch = Math.max(0.7, Math.min(1.3, settings.pitch));
    if (settings.gender) this.voiceGender = settings.gender;
  }

  public setLevelCallback(cb?: (level: number) => void): void {
    this.onLevelCb = cb;
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

  private startLevelAnimation(): void {
    if (this.levelAnimFrame !== null) cancelAnimationFrame(this.levelAnimFrame);
    let step = 0;
    const animate = () => {
      if (!this.isSpeaking) {
        this.onLevelCb?.(0);
        return;
      }
      step += 0.18;
      // Speech cadence envelope simulation
      const base = 0.28 + Math.sin(step) * 0.18 + Math.cos(step * 1.7) * 0.12;
      const level = Math.max(0.08, Math.min(0.85, base));
      this.onLevelCb?.(level);
      this.levelAnimFrame = requestAnimationFrame(animate);
    };
    this.levelAnimFrame = requestAnimationFrame(animate);
  }

  private stopLevelAnimation(): void {
    if (this.levelAnimFrame !== null) {
      cancelAnimationFrame(this.levelAnimFrame);
      this.levelAnimFrame = null;
    }
    this.onLevelCb?.(0);
  }

  private playNext(): void {
    if (this.queue.length === 0) {
      this.isSpeaking = false;
      this.activeUtterance = null;
      this.stopLevelAnimation();
      this.onEndCb?.();
      return;
    }

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      this.queue = [];
      this.stopLevelAnimation();
      this.onEndCb?.();
      return;
    }

    const currentText = this.queue.shift()!;
    const isArabic = /[\u0600-\u06FF]/.test(currentText) || this.locale.startsWith('ar');
    const lang = isArabic ? 'ar-SA' : 'fr-FR';

    const utterance = new SpeechSynthesisUtterance(currentText);
    utterance.lang = lang;
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;

    try {
      const voices = window.speechSynthesis.getVoices?.() || [];
      const match = voices.find((v) => {
        const matchesLang = v.lang.toLowerCase().startsWith(isArabic ? 'ar' : 'fr');
        if (!matchesLang) return false;
        if (this.voiceGender === 'female') {
          return /female|femme|zira|siri|google|audrey|amira|meryem/i.test(v.name);
        }
        return /male|homme|david|thomas|nicolas|mehdi|youssef/i.test(v.name);
      }) || voices.find((v) => v.lang.toLowerCase().startsWith(isArabic ? 'ar' : 'fr'));

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
      this.startLevelAnimation();
      this.onStartCb?.();
    };

    utterance.onboundary = () => {
      if (this.isSpeaking) {
        this.onLevelCb?.(0.45 + Math.random() * 0.35);
      }
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
    this.stopLevelAnimation();
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
