import { VoiceInputCapture, type VoiceCaptureFailure } from './VoiceInputCapture';
import { awaitOwned } from '../media/awaitOwned';
import { cleanAssistantText } from '../composerPolicy';
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
  private capture: VoiceInputCapture | null = null;
  private inputOperation = 0;
  private muteOperation = 0;
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

  public getVoiceSettings(): VoiceOutputSettings { return this.output.getSettings(); }

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
          if (!this.active || lifecycle !== this.lifecycle) {
            inputStream.getTracks().forEach(track => track.stop());
            return inputStream;
          }
          // Own the granted stream immediately, even while readiness is pending.
          this.stream = inputStream;
          inputStream.getAudioTracks().forEach((track) => { track.enabled = false; });
          return inputStream;
        }),
        this.readServerTtsReadiness(),
      ]);

      if (!this.active || lifecycle !== this.lifecycle) return false;

      this.stream = stream;
      this.output.setServerTtsAvailable(serverTtsReady);
      await this.setupInputGraph(stream, lifecycle);
      if (!this.active || lifecycle !== this.lifecycle) return false;
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
      this.failInput(denied
        ? this.localized('Autorisez le microphone pour activer le mode vocal.', 'يرجى السماح باستعمال الميكروفون لتشغيل المحادثة الصوتية.')
        : this.localized('Le mode vocal est indisponible sur cet appareil.', 'تعذّر تشغيل المحادثة الصوتية على هذا الجهاز.'));
      return false;
    }
  }

  public async speak(text: string, locale = this.options.language): Promise<void> {
    if (!this.active) return;
    this.waitingForReply = false;
    this.cancelInputTurn();
    const lifecycle = this.lifecycle;
    const operation = ++this.speechOperation;
    this.setInputEnabled(false);
    await this.stopCapture(true);
    if (!this.active || lifecycle !== this.lifecycle || operation !== this.speechOperation) return;

    const spokenText = cleanAssistantText(text);
    if (this.speakerMuted || !spokenText) {
      this.beginListening();
      return;
    }

    this.setState('thinking');
    let result: Awaited<ReturnType<VoiceOutput['speak']>>;
    try {
      result = await this.output.speak(spokenText, locale, {
        onStart: () => {
          if (this.active && lifecycle === this.lifecycle && operation === this.speechOperation) this.setState('speaking');
        },
        onLevel: (level) => {
          if (this.active && lifecycle === this.lifecycle && operation === this.speechOperation && this.state === 'speaking') {
            this.options.onLevel(level);
          }
        },
      });
    } catch {
      result = 'unavailable';
    }

    if (!this.active || lifecycle !== this.lifecycle || operation !== this.speechOperation) return;
    this.options.onLevel(0);
    if (result === 'unavailable') {
      this.options.onError(locale.toLowerCase().startsWith('ar')
        ? 'تعذّر إخراج الرد صوتيًا، ويمكنك متابعة الحوار نصيًا.'
        : 'Impossible de lire la réponse. Vous pouvez poursuivre par écrit.');
    }
    if (this.muted) this.setState('muted');
    else this.beginListening();
  }

  /** Stop microphone capture while the assistant text response is generated. */
  public markThinking(): void {
    if (!this.active) return;
    this.waitingForReply = true;
    this.cancelInputTurn();
    this.speechOperation += 1;
    this.output.stop();
    this.setInputEnabled(false);
    this.setState('thinking');
    void this.stopCapture(true);
  }

  public resumeListening(): void {
    if (!this.active) return;
    this.waitingForReply = false;
    this.cancelInputTurn();
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
    this.cancelInputTurn();
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
    if (!this.active || this.muted === muted) return;
    const lifecycle = this.lifecycle, speech = this.speechOperation, mute = ++this.muteOperation;
    this.muted = muted;
    this.setInputEnabled(false);
    if (muted) {
      if (!this.transcriptionAbort) this.cancelInputTurn();
      this.setState('muted');
      void this.stopCapture(true);
      return;
    }
    void (async () => {
      await this.stopCapture(true);
      if (!this.active || this.muted || lifecycle !== this.lifecycle || speech !== this.speechOperation || mute !== this.muteOperation) return;
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
    this.cancelInputTurn();
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
      const response = await awaitOwned(fetch('/api/assistant/status', {
        credentials: 'same-origin',
        signal: controller.signal,
        headers: { 'x-session-id': getSessionId() },
      }), controller.signal);
      if (!response.ok) return null;
      const payload = await awaitOwned(response.json(), controller.signal);
      return payload?.data?.serverTextToSpeechReady === true;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async setupInputGraph(stream: MediaStream, lifecycle: number): Promise<void> {
    const AudioCtx = window.AudioContext
      || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) throw new Error('AUDIO_CONTEXT_UNAVAILABLE');
    const context = new AudioCtx();
    this.context = context;
    if (context.state === 'suspended') await context.resume();
    if (!this.active || lifecycle !== this.lifecycle || this.context !== context || this.stream !== stream) return;

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
    const lifecycle = this.lifecycle;
    const samples = new Uint8Array(512);

    const monitor = () => {
      if (!this.active || lifecycle !== this.lifecycle || !this.analyser) return;
      if (this.state === 'listening' || this.state === 'user_speaking') {
        this.analyser.getByteTimeDomainData(samples);
        let squareSum = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          squareSum += centered * centered;
        }
        const rms = Math.sqrt(squareSum / samples.length);
        this.options.onLevel(Math.min(1, rms * 8));
        if (this.active && lifecycle === this.lifecycle) this.updateVoiceActivity(rms, performance.now());
      }
      if (this.active && lifecycle === this.lifecycle) this.monitorFrame = requestAnimationFrame(monitor);
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
    this.waitingForReply = false; this.finalizingTurn = false;
    this.options.onTranscript('');
    if (this.muted) {
      this.setState('muted');
      return;
    }

    this.setInputEnabled(true);
    this.listeningSince = performance.now();
    this.speechCandidateSince = 0;
    this.speechStartedAt = 0;
    this.lastVoiceAt = 0;
    this.noiseFloor = 0.012;
    this.setState('listening');
    this.startCapture();
  }

  private localized(fr: string, ar: string): string { return this.options.language.toLowerCase().startsWith('ar') ? ar : fr; }

  private startCapture(): void {
    if (!this.active || this.muted || !this.stream || this.capture) return;
    try {
      const capture = new VoiceInputCapture(this.stream, failure => {
        if (this.capture === capture && this.active) this.failInput(this.captureError(failure));
      }, () => { if (this.capture === capture) this.capture = null; });
      this.capture = capture;
      capture.start();
    } catch { this.failInput(this.captureError('recording')); }
  }

  private captureError(failure: VoiceCaptureFailure): string {
    if (failure === 'large') return this.localized('Enregistrement trop volumineux (12 Mo maximum). Rouvrez le mode vocal.', 'بلغ التسجيل الحد الأقصى للحجم (12 ميغابايت). أعد فتح الوضع الصوتي.');
    if (failure === 'flush-timeout') return this.localized('L’enregistrement n’a pas pu se terminer. Aucun son incomplet n’a été envoyé. Rouvrez le mode vocal.', 'تعذّر إنهاء التسجيل. لم يُرسل صوت غير مكتمل. أعد فتح الوضع الصوتي.');
    return this.localized('Erreur d’enregistrement. Rouvrez le mode vocal pour réessayer.', 'حدث خطأ في التسجيل. أعد فتح الوضع الصوتي للمحاولة مجددًا.');
  }

  private cancelInputTurn(): void {
    this.inputOperation += 1;
    this.transcriptionAbort?.abort(); this.transcriptionAbort = null;
    this.finalizingTurn = false;
  }

  private failInput(message: string): void {
    this.stop(false);
    this.setState('error');
    this.options.onError(message);
  }

  private async finishUserTurn(): Promise<void> {
    if (!this.active || this.state !== 'user_speaking' || this.finalizingTurn) return;
    this.finalizingTurn = true;
    const lifecycle = this.lifecycle;
    const operation = ++this.inputOperation;
    const ownsTurn = () => this.active && lifecycle === this.lifecycle && operation === this.inputOperation;
    const duration = performance.now() - this.speechStartedAt;
    this.setState('transcribing');
    this.options.onLevel(0);

    this.setInputEnabled(false);
    const audio = await this.stopCapture(false);
    if (!ownsTurn()) return;
    if (!audio || audio.size < 120 || duration < MIN_SPEECH_MS) {
      this.options.onTranscript('');
      this.beginListening();
      return;
    }

    const controller = new AbortController();
    this.transcriptionAbort?.abort();
    this.transcriptionAbort = controller;
    let timedOut = false;
    const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    try {
      const result = await awaitOwned(transcribeAssistantAudio({
        audio,
        csrfToken: this.options.csrfToken,
        signal: controller.signal,
      }), controller.signal);
      if (!ownsTurn() || this.transcriptionAbort !== controller || controller.signal.aborted) return;
      const text = typeof result.text === 'string' ? result.text.trim() : '';
      if (!text) {
        this.options.onError(this.localized('Aucune parole reconnue. Réessayez.', 'لم يتم التعرّف على الكلام بوضوح. حاول مرة أخرى.'));
        this.beginListening();
        return;
      }
      this.options.onTranscript(text);
      if (!ownsTurn()) return;
      this.waitingForReply = true;
      this.setState('thinking');
      this.finalizingTurn = false;
      if (ownsTurn()) this.options.onTurn(text);
    } catch {
      if (!ownsTurn() || this.transcriptionAbort !== controller || (controller.signal.aborted && !timedOut)) return;
      this.options.onError(timedOut
        ? this.localized('La transcription a dépassé le délai. Aucun message n’a été envoyé.', 'انتهت مهلة تحويل الصوت إلى نص. لم تُرسل أي رسالة.')
        : this.localized('Impossible de transcrire cet enregistrement. Réessayez.', 'تعذّر تحويل هذا التسجيل إلى نص. أعد المحاولة.'));
      this.beginListening();
    } finally {
      clearTimeout(deadline);
      if (this.transcriptionAbort === controller) this.transcriptionAbort = null;
    }
  }

  private stopCapture(discard: boolean): Promise<Blob | null> {
    if (discard) { this.stopRecorderImmediately(); return Promise.resolve(null); }
    return this.capture?.finish() || Promise.resolve(null);
  }

  private stopRecorderImmediately(): void {
    const capture = this.capture; this.capture = null;
    capture?.cancel();
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
