import { cleanAssistantText } from '../composerPolicy';
import { awaitOwned } from '../media/awaitOwned';
import { getSessionId } from '../../../utils/session';

import { DEFAULT_VOICE_SETTINGS, VOICE_PRESETS, type VoiceOutputSettings } from './settings';
export type { VoiceId, VoiceOutputSettings } from './settings';
export type VoicePlaybackResult = 'ended' | 'cancelled' | 'unavailable';

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
  private activeGeneration: number | null = null;
  private playingGeneration: number | null = null;
  private serverTtsAvailable: boolean | null = null;
  private settings: VoiceOutputSettings = { ...DEFAULT_VOICE_SETTINGS };

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
    const preset = VOICE_PRESETS.find(item => item.id === settings.voiceId);
    if (preset) {
      this.settings.voiceId = preset.id; this.settings.gender = preset.gender;
    } else if ((settings.gender === 'female' || settings.gender === 'male') && settings.gender !== this.settings.gender) {
      const matching = VOICE_PRESETS.find(item => item.gender === settings.gender)!;
      this.settings.voiceId = matching.id; this.settings.gender = matching.gender;
    }
    if (settings.rate != null && Number.isFinite(settings.rate)) this.settings.rate = Math.max(0.8, Math.min(1.3, settings.rate));
  }

  public getSettings(): VoiceOutputSettings { return { ...this.settings }; }

  public get busy(): boolean {
    return this.activeGeneration !== null;
  }

  public get playing(): boolean {
    return this.playingGeneration === this.generation;
  }

  public async speak(
    text: string,
    locale: string,
    callbacks: VoicePlaybackCallbacks = {},
    options: { preserveText?: boolean } = {},
  ): Promise<VoicePlaybackResult> {
    this.stop();
    const generation = this.generation;
    const cleanText = options.preserveText ? text.trim() : cleanAssistantText(text);
    const settings = this.getSettings(); // One snapshot for server and fallback; changes affect the next operation.
    this.activeGeneration = generation;
    let started = false;
    const ownedCallbacks: VoicePlaybackCallbacks = {
      onStart: () => {
        if (generation !== this.generation || started) return;
        started = true; this.playingGeneration = generation;
        callbacks.onStart?.();
      },
      onLevel: level => { if (generation === this.generation && started) callbacks.onLevel?.(level); },
    };
    let result: VoicePlaybackResult = 'unavailable';
    try {
      if (cleanText) {
        // The endpoint accepts at most 4096 characters. Never truncate the turn.
        if (this.serverTtsAvailable !== false && cleanText.length <= 4_096) {
          result = await this.playServer(cleanText, generation, ownedCallbacks, settings);
        }
        if (generation !== this.generation) result = 'cancelled';
        else if (result === 'unavailable' && !started) result = await this.playBrowser(cleanText, locale, generation, ownedCallbacks, settings);
      }
    } catch { result = generation === this.generation ? 'unavailable' : 'cancelled'; }
    if (this.activeGeneration === generation) this.activeGeneration = null;
    if (this.playingGeneration === generation) this.playingGeneration = null;
    // A transport attempt is not a terminal playback result. Notify only once,
    // after the fallback (if any), and never announce fallback before it starts.
    if (result === 'unavailable' && generation === this.generation) callbacks.onError?.(locale.toLowerCase().startsWith('ar')
      ? 'تعذّر إخراج الرد صوتيًا. يمكنك متابعته نصيًا أو إعادة المحاولة.'
      : 'Impossible de lire cette réponse. Consultez le texte ou réessayez.');
    callbacks.onEnd?.(result);
    return result;
  }

  public stop(): void {
    this.generation += 1;
    this.activeGeneration = null; this.playingGeneration = null;
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

    if (this.utterance) this.utterance.onstart = this.utterance.onend = this.utterance.onerror = null;
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
    settings: VoiceOutputSettings,
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
      const response = await awaitOwned(fetch('/api/assistant/voice/tts', {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getSessionId(),
        },
        body: JSON.stringify({
          text,
          voice: settings.voiceId,
          speed: settings.rate,
        }),
      }), controller.signal);
      if (generation !== this.generation) return 'cancelled';
      if (controller.signal.aborted) return abortResult();

      const contentType = response.headers.get('content-type') || '';
      const isAudio = contentType.includes('audio') || contentType.includes('octet-stream');
      if (!response.ok || !isAudio) {
        if (response.ok && contentType.includes('json')) this.serverTtsAvailable = false;
        return 'unavailable';
      }

      const bytes = await awaitOwned(response.arrayBuffer(), controller.signal);
      if (generation !== this.generation) return 'cancelled';
      if (controller.signal.aborted) return abortResult();
      const context = this.ensureContext();
      if (!context || bytes.byteLength < 45) return 'unavailable';
      if (context.state === 'suspended') await awaitOwned(context.resume(), controller.signal);
      if (generation !== this.generation || controller.signal.aborted) return generation !== this.generation ? 'cancelled' : abortResult();
      const decoded = await awaitOwned(context.decodeAudioData(bytes.slice(0)), controller.signal);
      if (generation !== this.generation) return 'cancelled';
      if (controller.signal.aborted) return abortResult();
      if (!decoded || !this.analyser || context !== this.context || context.state !== 'running') return 'unavailable';

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
          if (this.playingGeneration === generation) this.playingGeneration = null;
          if (this.safetyTimer) { clearTimeout(this.safetyTimer); this.safetyTimer = null; }
          resolve(result);
        };
        this.finishActive = finish;
        source.onended = () => finish('ended');
        // Native onended can be lost on a suspended/device-disconnected context.
        // This is an error deadline, never fabricated successful completion.
        const duration = Number.isFinite(decoded.duration) && decoded.duration > 0 ? decoded.duration : 60;
        this.safetyTimer = setTimeout(() => {
          if (generation !== this.generation || settled) return;
          source.onended = null;
          try { source.stop(); } catch {}
          finish('unavailable');
        }, Math.min(2_147_483_647, duration * 1000 + 10_000));

        try {
          source.start(0);
          callbacks.onStart?.();
          if (!settled && generation === this.generation && this.source === source) this.startLevelAnimation(callbacks.onLevel, generation, true);
        } catch {
          try { source.stop(); } catch {}
          finish('unavailable');
        }
      });
    } catch {
      if (generation !== this.generation || (controller.signal.aborted && !timedOut)) return 'cancelled';
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
    settings: VoiceOutputSettings,
  ): Promise<VoicePlaybackResult> {
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      return Promise.resolve('unavailable');
    }

    if (generation !== this.generation) return Promise.resolve('cancelled');
    return new Promise<VoicePlaybackResult>((resolve) => {
      let settled = false, started = false;
      const utterance = new SpeechSynthesisUtterance(text);
      const hasArabic = /[\u0600-\u06ff]/.test(text);
      const normalizedLocale = locale.toLowerCase();
      utterance.lang = hasArabic
        ? 'ar-SA'
        : normalizedLocale.startsWith('en') ? 'en-US' : 'fr-FR';
      utterance.rate = settings.rate;
      utterance.pitch = 1;
      utterance.volume = 1;
      const voice = this.findVoice(utterance.lang, settings.gender);
      if (voice) utterance.voice = voice;
      this.utterance = utterance;

      const finish = (result: VoicePlaybackResult) => {
        if (settled) return;
        settled = true;
        if (this.finishActive === finish) this.finishActive = null;
        if (this.utterance === utterance) this.utterance = null;
        utterance.onstart = utterance.onend = utterance.onerror = null;
        if (this.playingGeneration === generation) this.playingGeneration = null;
        if (this.safetyTimer) {
          clearTimeout(this.safetyTimer);
          this.safetyTimer = null;
        }
        this.stopLevelAnimation();
        resolve(result);
      };
      this.finishActive = finish;
      utterance.onstart = () => {
        if (settled || started || generation !== this.generation) return;
        started = true;
        clearTimeout(this.safetyTimer!);
        this.safetyTimer = setTimeout(expire, Math.min(2_147_483_647, Math.max(8_000, text.length / 6 / settings.rate * 1000 + 10_000)));
        callbacks.onStart?.();
        if (!settled && generation === this.generation && this.utterance === utterance) this.startLevelAnimation(callbacks.onLevel, generation, false);
      };
      utterance.onend = () => finish('ended');
      utterance.onerror = (event) => {
        if (settled) return;
        if (generation !== this.generation || event.error === 'canceled' || event.error === 'interrupted') {
          finish('cancelled');
          return;
        }
        finish('unavailable');
      };

      // A queue that never starts has its own deadline. The reading deadline
      // starts on the real onstart event and scales with text and selected rate.
      const expire = () => {
        if (settled || generation !== this.generation) return;
        finish('unavailable'); // Detach events before synchronous cancellation notifications.
        try { window.speechSynthesis.cancel(); } catch {}
      };
      this.safetyTimer = setTimeout(expire, 15_000);

      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      } catch {
        finish('unavailable');
      }
    });
  }

  private findVoice(language: string, gender: VoiceOutputSettings['gender']): SpeechSynthesisVoice | null {
    try {
      const prefix = language.slice(0, 2).toLowerCase();
      const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(prefix));
      if (!voices.length) return null;
      const genderPattern = gender === 'female'
        ? /(?:^|[\s_-])(?:female|femme|zira|audrey|amira|meryem|salma|leila|aoede|kore)(?=$|[\s_-])/i
        : /(?:^|[\s_-])(?:male|homme|david|thomas|nicolas|mehdi|youssef|tariq|ali|puck|fenrir|charon)(?=$|[\s_-])/i;
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
    if (generation !== this.generation) return;
    this.stopLevelAnimation();
    // Web Speech exposes no audio samples. Do not invent a measured level.
    if (!onLevel || !readAnalyser || !this.analyser) { onLevel?.(0); return; }
    const animate = () => {
      if (generation !== this.generation) return;
      if (!this.finishActive) {
        this.animationFrame = null;
        onLevel?.(0);
        return;
      }
      if (readAnalyser && this.analyser) {
        const values = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(values);
        const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
        onLevel?.(Math.min(1, average / 90));
      }
      if (generation === this.generation && this.busy && this.playing) this.animationFrame = requestAnimationFrame(animate);
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
