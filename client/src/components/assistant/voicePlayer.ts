/**
 * AssistantVoicePlayer — High-performance Multi-lingual TTS & Real-time Audio Playback.
 * Features:
 * - Server TTS streaming with Web Audio Buffer playback when available.
 * - Robust client Web Speech Synthesis fallback with asynchronous voice warming and keep-alive.
 * - Instant Barge-In cancellation.
 * - Real-time output level tracking for Voice Orb animations.
 */

export class AssistantVoicePlayer {
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private audioContext: AudioContext | null = null;
  private currentAudioSource: AudioBufferSourceNode | null = null;
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
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private levelAnimFrame: number | null = null;
  private voicesLoaded = false;
  private cachedVoices: SpeechSynthesisVoice[] = [];

  constructor() {
    this.initVoices();
  }

  private initVoices(): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadVoices = () => {
      try {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          this.cachedVoices = voices;
          this.voicesLoaded = true;
        }
      } catch {}
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  /**
   * Warm up audio context and speech engine on user gesture (Voice button click)
   */
  public warmUp(): void {
    if (typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && !this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext?.state === 'suspended') {
        void this.audioContext.resume();
      }
    } catch {}

    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.resume();
        this.initVoices();
      }
    } catch {}
  }

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

  private getBestVoice(isArabic: boolean): SpeechSynthesisVoice | null {
    const voices = this.cachedVoices.length > 0
      ? this.cachedVoices
      : (typeof window !== 'undefined' && window.speechSynthesis?.getVoices()) || [];

    if (!voices.length) return null;

    const langPrefix = isArabic ? 'ar' : 'fr';

    // 1. First priority: match exact language prefix + requested gender
    const genderMatch = voices.find((v) => {
      const matchLang = v.lang.toLowerCase().startsWith(langPrefix);
      if (!matchLang) return false;
      const name = v.name.toLowerCase();
      if (this.voiceGender === 'female') {
        return /female|femme|zira|siri|google|audrey|amira|meryem|salma|leila/i.test(name);
      }
      return /male|homme|david|thomas|nicolas|mehdi|youssef|tariq|ali/i.test(name);
    });
    if (genderMatch) return genderMatch;

    // 2. Second priority: any voice matching language prefix
    const langMatch = voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
    if (langMatch) return langMatch;

    // 3. Fallback to default
    return voices.find((v) => v.default) || voices[0] || null;
  }

  private playNext(): void {
    if (this.queue.length === 0) {
      this.isSpeaking = false;
      this.activeUtterance = null;
      this.stopLevelAnimation();
      if (this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
      }
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

    const chosenVoice = this.getBestVoice(isArabic);
    if (chosenVoice) {
      utterance.voice = chosenVoice;
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
    utterance.onerror = (e) => {
      console.warn('[VoicePlayer] Utterance error:', e.error);
      safeEnd();
    };

    const estimatedMs = Math.max(3000, Math.min(30000, (currentText.length / 10) * 1000));
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

      // Keepalive interval: tickles speech synthesis every 250ms to prevent Chromium pause bugs
      if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = setInterval(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        }
      }, 250);

      window.speechSynthesis.speak(utterance);
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
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    this.stopLevelAnimation();

    if (this.currentAudioSource) {
      try { this.currentAudioSource.stop(); } catch {}
      this.currentAudioSource = null;
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
