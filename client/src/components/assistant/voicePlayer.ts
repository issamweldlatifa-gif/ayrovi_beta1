import { getSessionId } from '../../utils/session';

type ServerTtsAvailability = 'unknown' | 'available' | 'unavailable';
type PlaybackMode = 'server' | 'browser' | null;

/**
 * Serial TTS queue with server audio and browser SpeechSynthesis fallback.
 *
 * Important invariants:
 * - Only one TTS request/playback may run at a time.
 * - stop() invalidates and aborts every pending asynchronous operation.
 * - Headerless PCM is decoded explicitly instead of being treated as WAV.
 */
export class AssistantVoicePlayer {
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private audioContext: AudioContext | null = null;
  private currentAudioSource: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserConnected = false;
  private isSpeaking = false;
  private isStarting = false;
  private queue: string[] = [];
  private locale = 'fr';
  private rate = 1.05;
  private pitch = 1.0;
  private voiceId = 'Aoede';
  private voiceGender: 'female' | 'male' = 'female';
  private onStartCb?: () => void;
  private onEndCb?: () => void;
  private onLevelCb?: (level: number) => void;
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private levelAnimFrame: number | null = null;
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private playbackGeneration = 0;
  private serverAudioAbort: AbortController | null = null;
  private serverTtsAvailability: ServerTtsAvailability = 'unknown';
  private playbackMode: PlaybackMode = null;
  private endNotified = true;

  constructor() {
    this.initVoices();
  }

  private initVoices(): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadVoices = () => {
      try {
        const voices = window.speechSynthesis.getVoices();
        if (voices?.length) this.cachedVoices = voices;
      } catch {}
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
        this.analyser = null;
        this.analyserConnected = false;
      }
      if (!this.analyser) {
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 128;
        this.analyser.smoothingTimeConstant = 0.3;
      }
      if (!this.analyserConnected) {
        this.analyser.connect(this.audioContext.destination);
        this.analyserConnected = true;
      }
      return this.audioContext;
    } catch {
      return null;
    }
  }

  /** Warm the browser audio engines while still inside the user's click gesture. */
  public warmUp(): void {
    if (typeof window === 'undefined') return;
    const context = this.ensureAudioContext();
    if (context?.state === 'suspended') void context.resume().catch(() => {});

    try {
      if (window.speechSynthesis?.paused) window.speechSynthesis.resume();
      this.initVoices();
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

  public setVoiceSettings(settings: { rate?: number; pitch?: number; gender?: 'female' | 'male'; voiceId?: string }): void {
    if (settings.rate != null) this.rate = Math.max(0.7, Math.min(1.5, settings.rate));
    if (settings.pitch != null) this.pitch = Math.max(0.7, Math.min(1.3, settings.pitch));
    if (settings.gender) {
      this.voiceGender = settings.gender;
      this.voiceId = settings.gender === 'female' ? 'Aoede' : 'Puck';
    }
    if (settings.voiceId) this.voiceId = settings.voiceId;
  }

  public setLevelCallback(callback?: (level: number) => void): void {
    this.onLevelCb = callback;
  }

  /** Seed provider readiness from the voice-session response. */
  public setServerTtsAvailability(available?: boolean): void {
    this.serverTtsAvailability = available === true
      ? 'available'
      : available === false
        ? 'unavailable'
        : 'unknown';
  }

  public get serverTtsAvailable(): boolean | null {
    if (this.serverTtsAvailability === 'unknown') return null;
    return this.serverTtsAvailability === 'available';
  }

  /** True only while decoded speech is actually audible, not while a request is pending. */
  public get activelyPlaying(): boolean {
    return this.isSpeaking;
  }

  /** Browser speech cannot be reliably separated from microphone input on mobile speakers. */
  public get browserFallbackActive(): boolean {
    return this.isSpeaking && this.playbackMode === 'browser';
  }

  public speak(text: string, locale: string, onStart?: () => void, onEnd?: () => void): void {
    this.stop();
    const clean = this.cleanText(text);
    if (!clean) {
      onEnd?.();
      return;
    }

    this.locale = locale;
    this.onStartCb = onStart;
    this.onEndCb = onEnd;
    this.endNotified = false;
    this.queue = [clean];
    void this.playNext();
  }

  public queueSentence(sentence: string, locale: string, onStart?: () => void, onEnd?: () => void): void {
    const clean = this.cleanText(sentence);
    if (!clean) return;

    this.locale = locale;
    if (onStart) this.onStartCb = onStart;
    if (onEnd) this.onEndCb = onEnd;
    this.endNotified = false;
    this.queue.push(clean);
    void this.playNext();
  }

  private startLevelAnimation(): void {
    if (this.levelAnimFrame !== null) cancelAnimationFrame(this.levelAnimFrame);
    let step = 0;
    const animate = () => {
      if (!this.isSpeaking) {
        this.levelAnimFrame = null;
        this.onLevelCb?.(0);
        return;
      }

      if (this.analyser && this.currentAudioSource) {
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(data);
        let sum = 0;
        for (const value of data) sum += value;
        this.onLevelCb?.(Math.min(1, (sum / Math.max(1, data.length)) / 90));
      } else {
        step += 0.18;
        const base = 0.28 + Math.sin(step) * 0.18 + Math.cos(step * 1.7) * 0.12;
        this.onLevelCb?.(Math.max(0.08, Math.min(0.85, base)));
      }
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
    const voices = this.cachedVoices.length
      ? this.cachedVoices
      : (typeof window !== 'undefined' && window.speechSynthesis?.getVoices()) || [];
    if (!voices.length) return null;

    const langPrefix = isArabic ? 'ar' : 'fr';
    const languageVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith(langPrefix));
    if (!languageVoices.length) {
      // Do not force (for example) a French default voice onto Arabic text.
      // Leaving utterance.voice unset lets the browser resolve utterance.lang
      // itself or report that the language pack is unavailable.
      return null;
    }

    const genderMatch = languageVoices.find((voice) => {
      const name = voice.name.toLowerCase();
      return this.voiceGender === 'female'
        ? /female|femme|zira|siri|google|audrey|amira|meryem|salma|leila|aoede|kore/i.test(name)
        : /male|homme|david|thomas|nicolas|mehdi|youssef|tariq|ali|puck|fenrir|charon/i.test(name);
    });
    return genderMatch || languageVoices[0] || null;
  }

  private async decodeServerAudio(arrayBuffer: ArrayBuffer, contentType: string): Promise<AudioBuffer | null> {
    const context = this.ensureAudioContext();
    if (!context || arrayBuffer.byteLength < 2) return null;
    if (context.state === 'suspended') await context.resume();

    const mime = contentType.toLowerCase();
    if (mime.includes('audio/pcm') || mime.includes('audio/l16') || mime.includes('pcm_s16le')) {
      const sampleRateMatch = /(?:rate|sample[_-]?rate)\s*=\s*(\d{4,6})/i.exec(mime);
      const sampleRate = Math.max(8_000, Math.min(192_000, Number(sampleRateMatch?.[1] || 24_000)));
      const sampleCount = Math.floor(arrayBuffer.byteLength / 2);
      if (!sampleCount) return null;
      const decoded = context.createBuffer(1, sampleCount, sampleRate);
      const channel = decoded.getChannelData(0);
      const view = new DataView(arrayBuffer);
      for (let index = 0; index < sampleCount; index += 1) {
        channel[index] = view.getInt16(index * 2, true) / 32_768;
      }
      return decoded;
    }

    try {
      return await context.decodeAudioData(arrayBuffer.slice(0));
    } catch (error) {
      console.warn('[VoicePlayer] Server audio could not be decoded; using browser speech fallback.', error);
      return null;
    }
  }

  private async tryPlayServerAudio(text: string, generation: number): Promise<boolean> {
    if (this.serverTtsAvailability === 'unavailable') return false;

    const controller = new AbortController();
    this.serverAudioAbort?.abort();
    this.serverAudioAbort = controller;
    const timeout = window.setTimeout(() => controller.abort(), 22_000);

    try {
      const response = await fetch('/api/assistant/voice/tts', {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getSessionId(),
        },
        body: JSON.stringify({ text, voice: this.voiceId, speed: this.rate }),
      });
      if (generation !== this.playbackGeneration || controller.signal.aborted) return false;

      const contentType = response.headers.get('content-type') || '';
      const isAudioResponse = contentType.includes('audio') || contentType.includes('octet-stream');
      if (!response.ok || !isAudioResponse) {
        // The endpoint returns a structured JSON fallback when no server TTS key
        // is configured. Cache that fact so every sentence does not make another
        // doomed round trip before using the browser voice.
        if (response.ok && contentType.includes('json')) this.serverTtsAvailability = 'unavailable';
        return false;
      }

      const bytes = await response.arrayBuffer();
      if (generation !== this.playbackGeneration || controller.signal.aborted || bytes.byteLength <= 44) return false;
      const decoded = await this.decodeServerAudio(bytes, contentType);
      if (!decoded || generation !== this.playbackGeneration || controller.signal.aborted) return false;

      const context = this.audioContext;
      if (!context || !this.analyser) return false;
      const source = context.createBufferSource();
      source.buffer = decoded;
      source.connect(this.analyser);
      this.serverTtsAvailability = 'available';
      this.playbackMode = 'server';
      this.currentAudioSource = source;
      this.isSpeaking = true;
      this.startLevelAnimation();
      this.onStartCb?.();

      source.onended = () => {
        if (generation !== this.playbackGeneration || this.currentAudioSource !== source) return;
        this.currentAudioSource = null;
        this.playbackMode = null;
        this.isSpeaking = false;
        // Keep a streamed answer as one playback turn. onEnd fires only after
        // the entire sentence queue drains, preventing listen earcons and VAD
        // restarts between clips.
        void this.playNext();
      };
      source.start(0);
      return true;
    } catch (error: any) {
      if (error?.name !== 'AbortError' && generation === this.playbackGeneration) {
        console.warn('[VoicePlayer] Server TTS failed; using browser speech fallback.', error);
      }
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (this.serverAudioAbort === controller) this.serverAudioAbort = null;
    }
  }

  private finishQueue(generation: number): void {
    if (generation !== this.playbackGeneration || this.queue.length || this.isStarting || this.isSpeaking) return;
    this.activeUtterance = null;
    this.currentAudioSource = null;
    this.playbackMode = null;
    this.stopLevelAnimation();
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (!this.endNotified) {
      this.endNotified = true;
      this.onEndCb?.();
    }
  }

  private startBrowserSpeech(text: string, generation: number): boolean {
    if (typeof window === 'undefined' || !window.speechSynthesis) return false;

    const isArabic = /[\u0600-\u06FF]/.test(text) || this.locale.startsWith('ar');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = isArabic ? 'ar-SA' : 'fr-FR';
    utterance.volume = 1;
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    const chosenVoice = this.getBestVoice(isArabic);
    if (chosenVoice) utterance.voice = chosenVoice;

    let ended = false;
    const safeEnd = () => {
      if (ended) return;
      ended = true;
      if (this.safetyTimer) {
        clearTimeout(this.safetyTimer);
        this.safetyTimer = null;
      }
      if (generation !== this.playbackGeneration || this.activeUtterance !== utterance) return;
      this.activeUtterance = null;
      this.playbackMode = null;
      this.isSpeaking = false;
      void this.playNext();
    };

    let startNotified = false;
    const notifyStart = () => {
      if (startNotified || generation !== this.playbackGeneration) return;
      startNotified = true;
      this.isSpeaking = true;
      this.startLevelAnimation();
      this.onStartCb?.();
    };
    utterance.onstart = notifyStart;
    utterance.onboundary = () => {
      if (this.isSpeaking) this.onLevelCb?.(0.45 + Math.random() * 0.35);
    };
    utterance.onend = safeEnd;
    utterance.onerror = (event) => {
      if (generation === this.playbackGeneration) console.warn('[VoicePlayer] Utterance error:', event.error);
      safeEnd();
    };

    this.activeUtterance = utterance;
    this.playbackMode = 'browser';
    // Mark busy before speak(); some engines dispatch onstart asynchronously.
    this.isSpeaking = true;
    const estimatedMs = Math.max(4_000, Math.min(45_000, (text.length / 7) * 1_000));
    this.safetyTimer = setTimeout(safeEnd, estimatedMs);

    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = setInterval(() => {
        if (window.speechSynthesis?.speaking && window.speechSynthesis.paused) window.speechSynthesis.resume();
      }, 1_000);
      // The server request has completed; mark assistant_speaking immediately
      // before handing audio to the browser engine, not while TTS was loading.
      notifyStart();
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      safeEnd();
      return false;
    }
  }

  private async playNext(): Promise<void> {
    if (this.isStarting || this.isSpeaking) return;
    const generation = this.playbackGeneration;
    const currentText = this.queue.shift();
    if (!currentText) {
      this.finishQueue(generation);
      return;
    }

    this.isStarting = true;
    const serverPlayed = await this.tryPlayServerAudio(currentText, generation);
    if (generation !== this.playbackGeneration) return;
    this.isStarting = false;
    if (serverPlayed) return;

    if (!this.startBrowserSpeech(currentText, generation)) {
      this.isSpeaking = false;
      void this.playNext();
    }
  }

  public stop(): void {
    this.playbackGeneration += 1;
    this.endNotified = true;
    this.queue = [];
    this.isStarting = false;
    this.serverAudioAbort?.abort();
    this.serverAudioAbort = null;

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
      this.currentAudioSource.onended = null;
      try { this.currentAudioSource.stop(); } catch {}
      try { this.currentAudioSource.disconnect(); } catch {}
      this.currentAudioSource = null;
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    this.isSpeaking = false;
    this.playbackMode = null;
    this.activeUtterance = null;
    this.onStartCb = undefined;
    this.onEndCb = undefined;
  }

  public get speaking(): boolean {
    return this.isSpeaking || this.isStarting || this.queue.length > 0;
  }
}

export const globalVoicePlayer = new AssistantVoicePlayer();
