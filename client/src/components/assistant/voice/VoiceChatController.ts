import { transcribeAssistantAudio } from '../assistantApi';
import { getSessionId } from '../../../utils/session';
import { VoiceOutput, type VoiceOutputSettings } from './VoiceOutput';
import type { VoiceChatState } from './types';

export interface VoiceChatControllerOptions {
  language: string;
  csrfToken?: string;
  onState: (state: VoiceChatState) => void;
  onLevel: (level: number) => void;
  onTranscript: (text: string) => void;
  onTurn: (text: string) => void;
  onError: (message: string) => void;
}

const SPEECH_START_HOLD_MS = 140;
const SILENCE_TO_END_MS = 750;
const MIN_SPEECH_MS = 280;
const MAX_SPEECH_MS = 15_000;
const OUTPUT_ECHO_GUARD_MS = 100;

/**
 * A fresh, half-duplex hands-free voice controller.
 *
 * Input has exactly one path: microphone -> VAD -> MediaRecorder -> server STT.
 * Output has exactly one path: one complete assistant turn -> VoiceOutput.
 * The microphone recorder is never active while output is loading or playing.
 */
export class VoiceChatController {
  private readonly output = new VoiceOutput();
  private state: VoiceChatState = 'idle';
  private lifecycle = 0;
  private speechOperation = 0;
  private active = false;
  private muted = false;
  private speakerMuted = false;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private monitorFrame: number | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private captureMimeType = 'audio/webm';
  private listeningSince = 0;
  private speechCandidateSince = 0;
  private speechStartedAt = 0;
  private lastVoiceAt = 0;
  private noiseFloor = 0.012;
  private finalizingTurn = false;
  private waitingForReply = false;
  private transcriptionAbort: AbortController | null = null;

  constructor(private readonly options: VoiceChatControllerOptions) {}

  public getState(): VoiceChatState {
    return this.state;
  }

  public configureVoice(settings: Partial<VoiceOutputSettings>): void {
    this.output.configure(settings);
  }

  public async start(greeting: string): Promise<boolean> {
    this.stop(false);
    const lifecycle = ++this.lifecycle;
    this.active = true;
    this.muted = false;
    this.setState('starting');
    this.output.warmUp();

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('VOICE_CAPTURE_UNSUPPORTED');
      }

      const [stream, serverTtsReady] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        }).then((inputStream) => {
          // Permission can resolve before the readiness probe. Keep capture
          // electrically muted until the controller deliberately listens.
          inputStream.getAudioTracks().forEach((track) => { track.enabled = false; });
          return inputStream;
        }),
        this.readServerTtsReadiness(),
      ]);

      if (!this.active || lifecycle !== this.lifecycle) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      this.stream = stream;
      this.output.setServerTtsAvailable(serverTtsReady);
      await this.setupInputGraph(stream);
      if (!this.active || lifecycle !== this.lifecycle) {
        this.releaseInput();
        return false;
      }
      this.startMonitoring();

      if (greeting.trim() && !this.speakerMuted) {
        await this.speak(greeting, this.options.language);
      } else {
        this.beginListening();
      }
      return this.active && lifecycle === this.lifecycle;
    } catch (error: unknown) {
      if (!this.active || lifecycle !== this.lifecycle) return false;
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      this.options.onError(denied
        ? 'يرجى السماح باستعمال الميكروفون لتشغيل المحادثة الصوتية.'
        : 'تعذّر تشغيل المحادثة الصوتية على هذا الجهاز.');
      this.setState('error');
      this.releaseInput();
      return false;
    }
  }

  public async speak(text: string, locale = this.options.language): Promise<void> {
    if (!this.active) return;
    this.waitingForReply = false;
    const lifecycle = this.lifecycle;
    const operation = ++this.speechOperation;
    this.setInputEnabled(false);
    await this.stopCapture(true);
    if (!this.active || lifecycle !== this.lifecycle || operation !== this.speechOperation) return;

    if (this.speakerMuted || !text.trim()) {
      this.beginListening();
      return;
    }

    this.setState('thinking');
    let result: Awaited<ReturnType<VoiceOutput['speak']>>;
    try {
      result = await this.output.speak(text, locale, {
        onStart: () => {
          if (this.active && lifecycle === this.lifecycle && operation === this.speechOperation) this.setState('speaking');
        },
        onLevel: (level) => {
          if (this.active && lifecycle === this.lifecycle && operation === this.speechOperation && this.state === 'speaking') {
            this.options.onLevel(level);
          }
        },
        onError: (message) => {
          if (this.active && lifecycle === this.lifecycle && operation === this.speechOperation) this.options.onError(message);
        },
      });
    } catch {
      result = 'unavailable';
    }

    if (!this.active || lifecycle !== this.lifecycle || operation !== this.speechOperation) return;
    this.options.onLevel(0);
    if (result === 'unavailable') {
      this.options.onError('تعذّر إخراج الرد صوتيًا، ويمكنك متابعة الحوار نصيًا.');
    }
    if (this.muted) this.setState('muted');
    else this.beginListening();
  }

  /** Stop microphone capture while the assistant text response is generated. */
  public markThinking(): void {
    if (!this.active) return;
    this.waitingForReply = true;
    this.speechOperation += 1;
    this.output.stop();
    this.setInputEnabled(false);
    this.setState('thinking');
    void this.stopCapture(true);
  }

  public resumeListening(): void {
    if (!this.active) return;
    this.waitingForReply = false;
    const lifecycle = this.lifecycle;
    const operation = ++this.speechOperation;
    this.output.stop();
    this.setInputEnabled(false);
    void (async () => {
      await this.stopCapture(true);
      if (!this.active || lifecycle !== this.lifecycle || operation !== this.speechOperation) return;
      if (this.muted) this.setState('muted');
      else this.beginListening();
    })();
  }

  public interruptOutput(): void {
    if (!this.active) return;
    this.waitingForReply = false;
    const lifecycle = this.lifecycle;
    const operation = ++this.speechOperation;
    this.output.stop();
    this.setInputEnabled(false);
    this.options.onLevel(0);
    void (async () => {
      await this.stopCapture(true);
      if (!this.active || lifecycle !== this.lifecycle || operation !== this.speechOperation) return;
      if (this.muted) this.setState('muted');
      else this.beginListening();
    })();
  }

  public forceFinishTurn(): void {
    if (this.state === 'user_speaking') void this.finishUserTurn();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.setInputEnabled(false);
    if (muted) {
      this.setState('muted');
      void this.stopCapture(true);
      return;
    }
    void (async () => {
      await this.stopCapture(true);
      if (!this.active || this.muted) return;
      if (this.finalizingTurn || this.transcriptionAbort) {
        this.setState('transcribing');
      } else if (this.waitingForReply || (this.output.busy && !this.output.playing)) {
        this.setState('thinking');
      } else if (this.output.playing) {
        this.setState('speaking');
      } else {
        this.beginListening();
      }
    })();
  }

  public setSpeakerMuted(muted: boolean): void {
    this.speakerMuted = muted;
    if (muted) this.output.stop();
  }

  public stop(emitIdle = true): void {
    this.active = false;
    this.lifecycle += 1;
    this.speechOperation += 1;
    this.finalizingTurn = false;
    this.waitingForReply = false;
    this.transcriptionAbort?.abort();
    this.transcriptionAbort = null;
    this.output.dispose();
    this.stopRecorderImmediately();
    this.releaseInput();
    this.options.onLevel(0);
    this.options.onTranscript('');
    if (emitIdle) this.setState('idle');
    else this.state = 'idle';
  }

  private setState(state: VoiceChatState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onState(state);
  }

  private async readServerTtsReadiness(): Promise<boolean | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch('/api/assistant/status', {
        credentials: 'same-origin',
        signal: controller.signal,
        headers: { 'x-session-id': getSessionId() },
      });
      if (!response.ok) return null;
      const payload = await response.json();
      return payload?.data?.serverTextToSpeechReady === true;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async setupInputGraph(stream: MediaStream): Promise<void> {
    const AudioCtx = window.AudioContext
      || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) throw new Error('AUDIO_CONTEXT_UNAVAILABLE');
    const context = new AudioCtx();
    this.context = context;
    if (context.state === 'suspended') await context.resume();

    const source = context.createMediaStreamSource(stream);
    const highPass = context.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 90;
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.12;
    source.connect(highPass);
    highPass.connect(analyser);

    this.analyser = analyser;
  }

  private startMonitoring(): void {
    if (this.monitorFrame !== null) cancelAnimationFrame(this.monitorFrame);
    const samples = new Uint8Array(512);

    const monitor = () => {
      if (!this.active || !this.analyser) return;
      if (this.state === 'listening' || this.state === 'user_speaking') {
        this.analyser.getByteTimeDomainData(samples);
        let squareSum = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          squareSum += centered * centered;
        }
        const rms = Math.sqrt(squareSum / samples.length);
        this.options.onLevel(Math.min(1, rms * 8));
        this.updateVoiceActivity(rms, performance.now());
      }
      this.monitorFrame = requestAnimationFrame(monitor);
    };

    this.monitorFrame = requestAnimationFrame(monitor);
  }

  private updateVoiceActivity(rms: number, now: number): void {
    if (this.muted || this.finalizingTurn) return;
    if (this.state === 'listening') {
      if (now - this.listeningSince < OUTPUT_ECHO_GUARD_MS) return;

      this.noiseFloor = Math.max(0.004, Math.min(0.035, this.noiseFloor * 0.97 + rms * 0.03));
      const startThreshold = Math.max(0.022, Math.min(0.09, this.noiseFloor * 2.2 + 0.008));
      if (rms >= startThreshold) {
        if (!this.speechCandidateSince) this.speechCandidateSince = now;
        if (now - this.speechCandidateSince >= SPEECH_START_HOLD_MS) {
          this.speechStartedAt = this.speechCandidateSince;
          this.lastVoiceAt = now;
          this.speechCandidateSince = 0;
          this.options.onTranscript('…');
          this.setState('user_speaking');
        }
      } else {
        this.speechCandidateSince = 0;
      }
      return;
    }

    if (this.state !== 'user_speaking') return;
    const continueThreshold = Math.max(0.014, Math.min(0.065, this.noiseFloor * 1.5 + 0.005));
    if (rms >= continueThreshold) this.lastVoiceAt = now;

    const speechDuration = now - this.speechStartedAt;
    if (speechDuration >= MAX_SPEECH_MS
      || (speechDuration >= MIN_SPEECH_MS && now - this.lastVoiceAt >= SILENCE_TO_END_MS)) {
      void this.finishUserTurn();
    }
  }

  private beginListening(): void {
    if (!this.active) return;
    if (this.muted) {
      this.setState('muted');
      return;
    }

    this.waitingForReply = false;
    this.setInputEnabled(true);
    this.listeningSince = performance.now();
    this.speechCandidateSince = 0;
    this.speechStartedAt = 0;
    this.lastVoiceAt = 0;
    this.noiseFloor = 0.012;
    this.finalizingTurn = false;
    this.options.onTranscript('');
    this.setState('listening');
    this.startCapture();
  }

  private startCapture(): void {
    if (!this.active || this.muted || !this.stream || this.recorder) return;
    try {
      const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
        ? [
            'audio/webm;codecs=opus',
            'audio/ogg;codecs=opus',
            'audio/mp4',
            'audio/webm',
          ].find((type) => MediaRecorder.isTypeSupported(type))
        : undefined;
      const recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.captureMimeType = recorder.mimeType || mimeType || 'audio/webm';
      this.chunks = [];
      recorder.ondataavailable = (event) => {
        if (!event.data?.size) return;
        // MediaRecorder chunks are fragments of one WebM/Ogg container. The
        // first chunk carries its initialization header, so pruning old chunks
        // makes Firefox/Android uploads undecodable. Keep the complete container
        // from the start of this listening turn; a fresh recorder starts after
        // every assistant response.
        this.chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (this.active) this.failInput('حدث خطأ أثناء تسجيل الصوت.');
      };
      this.recorder = recorder;
      recorder.start(200);
    } catch {
      this.failInput('تعذّر بدء تسجيل الصوت في هذا المتصفح.');
    }
  }

  private failInput(message: string): void {
    this.options.onError(message);
    this.active = false;
    this.setInputEnabled(false);
    this.stopRecorderImmediately();
    this.releaseInput();
    this.options.onLevel(0);
    this.setState('error');
  }

  private async finishUserTurn(): Promise<void> {
    if (!this.active || this.state !== 'user_speaking' || this.finalizingTurn) return;
    this.finalizingTurn = true;
    const lifecycle = this.lifecycle;
    const duration = performance.now() - this.speechStartedAt;
    this.setState('transcribing');
    this.options.onLevel(0);

    const audio = await this.stopCapture(false);
    this.setInputEnabled(false);
    if (!this.active || lifecycle !== this.lifecycle) return;
    if (!audio || audio.size < 120 || duration < MIN_SPEECH_MS) {
      this.options.onTranscript('');
      this.beginListening();
      return;
    }

    const controller = new AbortController();
    this.transcriptionAbort?.abort();
    this.transcriptionAbort = controller;
    try {
      const result = await transcribeAssistantAudio({
        audio,
        csrfToken: this.options.csrfToken,
        signal: controller.signal,
      });
      if (!this.active || lifecycle !== this.lifecycle || controller.signal.aborted) return;
      const text = result.text.trim();
      if (!text) {
        this.options.onError('لم يتم التعرّف على الكلام بوضوح. حاول مرة أخرى.');
        this.beginListening();
        return;
      }
      this.options.onTranscript(text);
      this.waitingForReply = true;
      this.setState('thinking');
      this.finalizingTurn = false;
      this.options.onTurn(text);
    } catch (error: unknown) {
      if (!this.active || lifecycle !== this.lifecycle || controller.signal.aborted) return;
      this.options.onError(error instanceof Error ? error.message : 'تعذّر تحويل الصوت إلى نص.');
      this.beginListening();
    } finally {
      if (this.transcriptionAbort === controller) this.transcriptionAbort = null;
    }
  }

  private stopCapture(discard: boolean): Promise<Blob | null> {
    const recorder = this.recorder;
    if (!recorder) {
      if (discard) this.chunks = [];
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        recorder.removeEventListener('stop', finish);
        if (this.recorder === recorder) this.recorder = null;
        const chunks = this.chunks;
        this.chunks = [];
        resolve(discard || !chunks.length ? null : new Blob(chunks, { type: this.captureMimeType }));
      };
      timeout = setTimeout(finish, 800);
      recorder.addEventListener('stop', finish, { once: true });
      try {
        if (recorder.state === 'recording') {
          if (typeof recorder.requestData === 'function') recorder.requestData();
          recorder.stop();
        } else {
          finish();
        }
      } catch {
        finish();
      }
    });
  }

  private stopRecorderImmediately(): void {
    const recorder = this.recorder;
    this.recorder = null;
    this.chunks = [];
    if (!recorder) return;
    recorder.ondataavailable = null;
    recorder.onerror = null;
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch {}
  }

  private setInputEnabled(enabled: boolean): void {
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled && !this.muted;
    });
  }

  private releaseInput(): void {
    if (this.monitorFrame !== null) {
      cancelAnimationFrame(this.monitorFrame);
      this.monitorFrame = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.context && this.context.state !== 'closed') {
      try { void this.context.close().catch(() => {}); } catch {}
    }
    this.context = null;
    this.analyser = null;
  }
}
