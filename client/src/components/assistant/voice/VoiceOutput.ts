import { getSessionId } from '../../../utils/session';

export type VoiceId = 'Aoede' | 'Kore' | 'Puck' | 'Fenrir';
export type VoicePlaybackResult = 'ended' | 'cancelled' | 'unavailable';

export interface VoiceOutputSettings {
  voiceId: VoiceId;
  gender: 'female' | 'male';
  rate: number;
}

export interface VoicePlaybackCallbacks {
  onStart?: () => void;
  onEnd?: (result: VoicePlaybackResult) => void;
  onLevel?: (level: number) => void;
  onError?: (message: string) => void;
}

/**
 * Single-shot voice output.
 *
 * There is deliberately no sentence queue. One assistant turn becomes one
 * playback operation, and a new operation always cancels the old one first.
 */
export class VoiceOutput {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserConnected = false;
  private source: AudioBufferSourceNode | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private requestAbort: AbortController | null = null;
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;
  private animationFrame: number | null = null;
  private finishActive: ((result: VoicePlaybackResult) => void) | null = null;
  private generation = 0;
  private serverTtsAvailable: boolean | null = null;
  private settings: VoiceOutputSettings = {
    voiceId: 'Aoede',
    gender: 'female',
    rate: 1.05,
  };

  public warmUp(): void {
    const context = this.ensureContext();
    if (context?.state === 'suspended') void context.resume().catch(() => {});
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis?.paused) {
        window.speechSynthesis.resume();
      }
    } catch {}
  }

  public setServerTtsAvailable(available: boolean | null): void {
    this.serverTtsAvailable = available;
  }

  public configure(settings: Partial<VoiceOutputSettings>): void {
    if (settings.voiceId) this.settings.voiceId = settings.voiceId;
    if (settings.gender) this.settings.gender = settings.gender;
    if (settings.rate != null) this.settings.rate = Math.max(0.8, Math.min(1.3, settings.rate));
  }

  public get busy(): boolean {
    return Boolean(this.requestAbort || this.source || this.utterance || this.finishActive);
  }

  public get playing(): boolean {
    return Boolean(this.source || this.utterance);
  }

  public async speak(
    text: string,
    locale: string,
    callbacks: VoicePlaybackCallbacks = {},
  ): Promise<VoicePlaybackResult> {
    this.stop();
    const generation = this.generation;
    const cleanText = this.cleanText(text);
    if (!cleanText) return 'unavailable';

    // The server endpoint accepts at most 4096 characters. Never let it
    // silently truncate a longer answer; read that complete turn locally.
    if (this.serverTtsAvailable !== false && cleanText.length <= 4_096) {
      const serverResult = await this.playServer(cleanText, generation, callbacks);
      if (serverResult !== 'unavailable') return serverResult;
      if (generation !== this.generation) return 'cancelled';
    }

    return this.playBrowser(cleanText, locale, generation, callbacks);
  }

  public stop(): void {
    this.generation += 1;
    this.requestAbort?.abort();
    this.requestAbort = null;

    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }

    const finish = this.finishActive;
    this.finishActive = null;

    if (this.source) {
      this.source.onended = null;
      try { this.source.stop(); } catch {}
      try { this.source.disconnect(); } catch {}
      this.source = null;
    }

    if (this.utterance && typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    this.utterance = null;
    this.stopLevelAnimation();
    finish?.('cancelled');
  }

  public dispose(): void {
    this.stop();
    const context = this.context;
    this.context = null;
    this.analyser = null;
    this.analyserConnected = false;
    if (context && context.state !== 'closed') {
      try { void context.close().catch(() => {}); } catch {}
    }
  }

  private cleanText(text: string): string {
    return text
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\[\[.*?\]\]/g, '')
      .replace(/[*_#`~>]/g, '')
      .replace(/\{.*?\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      if (!this.context || this.context.state === 'closed') {
        this.context = new AudioCtx();
        this.analyser = null;
        this.analyserConnected = false;
      }
      if (!this.analyser) {
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 128;
        this.analyser.smoothingTimeConstant = 0.25;
      }
      if (!this.analyserConnected) {
        this.analyser.connect(this.context.destination);
        this.analyserConnected = true;
      }
      return this.context;
    } catch {
      return null;
    }
  }

  private async playServer(
    text: string,
    generation: number,
    callbacks: VoicePlaybackCallbacks,
  ): Promise<VoicePlaybackResult> {
    const controller = new AbortController();
    let timedOut = false;
    this.requestAbort = controller;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 22_000);
    const abortResult = (): VoicePlaybackResult => timedOut ? 'unavailable' : 'cancelled';

    try {
      const response = await fetch('/api/assistant/voice/tts', {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getSessionId(),
        },
        body: JSON.stringify({
          text,
          voice: this.settings.voiceId,
          speed: this.settings.rate,
        }),
      });
      if (generation !== this.generation) return 'cancelled';
      if (controller.signal.aborted) return abortResult();

      const contentType = response.headers.get('content-type') || '';
      const isAudio = contentType.includes('audio') || contentType.includes('octet-stream');
      if (!response.ok || !isAudio) {
        if (response.ok && contentType.includes('json')) this.serverTtsAvailable = false;
        return 'unavailable';
      }

      const bytes = await response.arrayBuffer();
      if (generation !== this.generation) return 'cancelled';
      if (controller.signal.aborted) return abortResult();
      const context = this.ensureContext();
      if (!context || bytes.byteLength < 45) return 'unavailable';
      if (context.state === 'suspended') await context.resume();
      const decoded = await context.decodeAudioData(bytes.slice(0)).catch(() => null);
      if (generation !== this.generation) return 'cancelled';
      if (controller.signal.aborted) return abortResult();
      if (!decoded || !this.analyser) return 'unavailable';

      clearTimeout(timeout);
      if (this.requestAbort === controller) this.requestAbort = null;
      this.serverTtsAvailable = true;
      return await new Promise<VoicePlaybackResult>((resolve) => {
        let settled = false;
        const source = context.createBufferSource();
        source.buffer = decoded;
        source.connect(this.analyser!);
        this.source = source;

        const finish = (result: VoicePlaybackResult) => {
          if (settled) return;
          settled = true;
          if (this.finishActive === finish) this.finishActive = null;
          if (this.source === source) this.source = null;
          source.onended = null;
          try { source.disconnect(); } catch {}
          this.stopLevelAnimation();
          callbacks.onEnd?.(result);
          resolve(result);
        };
        this.finishActive = finish;
        source.onended = () => finish('ended');

        callbacks.onStart?.();
        this.startLevelAnimation(callbacks.onLevel, generation, true);
        try {
          source.start(0);
        } catch {
          finish('unavailable');
        }
      });
    } catch {
      if (generation !== this.generation || (controller.signal.aborted && !timedOut)) return 'cancelled';
      callbacks.onError?.('تعذّر تشغيل صوت الخادم. تم الانتقال إلى صوت الجهاز.');
      return 'unavailable';
    } finally {
      clearTimeout(timeout);
      if (this.requestAbort === controller) this.requestAbort = null;
    }
  }

  private playBrowser(
    text: string,
    locale: string,
    generation: number,
    callbacks: VoicePlaybackCallbacks,
  ): Promise<VoicePlaybackResult> {
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      callbacks.onError?.('لا يتوفر محرك صوت في هذا المتصفح.');
      return Promise.resolve('unavailable');
    }

    return new Promise<VoicePlaybackResult>((resolve) => {
      let settled = false;
      const utterance = new SpeechSynthesisUtterance(text);
      const hasArabic = /[\u0600-\u06ff]/.test(text);
      const normalizedLocale = locale.toLowerCase();
      utterance.lang = hasArabic
        ? 'ar-SA'
        : normalizedLocale.startsWith('en') ? 'en-US' : 'fr-FR';
      utterance.rate = this.settings.rate;
      utterance.pitch = 1;
      utterance.volume = 1;
      const voice = this.findVoice(utterance.lang);
      if (voice) utterance.voice = voice;
      this.utterance = utterance;

      const finish = (result: VoicePlaybackResult) => {
        if (settled) return;
        settled = true;
        if (this.finishActive === finish) this.finishActive = null;
        if (this.utterance === utterance) this.utterance = null;
        if (this.safetyTimer) {
          clearTimeout(this.safetyTimer);
          this.safetyTimer = null;
        }
        this.stopLevelAnimation();
        callbacks.onEnd?.(result);
        resolve(result);
      };
      this.finishActive = finish;
      utterance.onend = () => finish('ended');
      utterance.onerror = (event) => {
        if (generation !== this.generation || event.error === 'canceled' || event.error === 'interrupted') {
          finish('cancelled');
          return;
        }
        callbacks.onError?.('تعذّر على صوت الجهاز قراءة هذا الرد.');
        finish('unavailable');
      };

      // Keep a watchdog for engines that never dispatch `onend`, but allow a
      // complete long response to finish instead of cutting it at one minute.
      const estimatedMs = Math.max(8_000, Math.min(10 * 60_000, (text.length / 6) * 1_000 + 10_000));
      this.safetyTimer = setTimeout(() => {
        try { window.speechSynthesis.cancel(); } catch {}
        finish('unavailable');
      }, estimatedMs);

      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        callbacks.onStart?.();
        this.startLevelAnimation(callbacks.onLevel, generation, false);
        window.speechSynthesis.speak(utterance);
      } catch {
        finish('unavailable');
      }
    });
  }

  private findVoice(language: string): SpeechSynthesisVoice | null {
    try {
      const prefix = language.slice(0, 2).toLowerCase();
      const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
      if (!voices.length) return null;
      const genderPattern = this.settings.gender === 'female'
        ? /female|femme|zira|siri|google|audrey|amira|meryem|salma|leila|aoede|kore/i
        : /male|homme|david|thomas|nicolas|mehdi|youssef|tariq|ali|puck|fenrir|charon/i;
      return voices.find((voice) => genderPattern.test(voice.name)) || voices[0] || null;
    } catch {
      return null;
    }
  }

  private startLevelAnimation(
    onLevel: VoicePlaybackCallbacks['onLevel'],
    generation: number,
    readAnalyser: boolean,
  ): void {
    this.stopLevelAnimation();
    let phase = 0;
    const animate = () => {
      if (generation !== this.generation || !this.finishActive) {
        this.animationFrame = null;
        onLevel?.(0);
        return;
      }
      if (readAnalyser && this.analyser) {
        const values = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(values);
        const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
        onLevel?.(Math.min(1, average / 90));
      } else {
        phase += 0.22;
        onLevel?.(0.34 + Math.sin(phase) * 0.16);
      }
      this.animationFrame = requestAnimationFrame(animate);
    };
    this.animationFrame = requestAnimationFrame(animate);
  }

  private stopLevelAnimation(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }
}
