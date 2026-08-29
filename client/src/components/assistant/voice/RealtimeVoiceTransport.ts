import type { RealtimeVoiceEvent, VoiceSessionConfig, VoiceState } from './types';
import { globalVoicePlayer } from '../voicePlayer';
import { voiceSoundEffects } from './voiceSoundEffects';
import { getSessionId } from '../../../utils/session';

export type VoiceEventListener = (event: RealtimeVoiceEvent) => void;

const STOP_COMMAND_REGEX = /^(?:توقف|استنى|اسكت|وقف|بس|يزي|كافي|stop|attends|pause|tais-toi|arrete|arrête|shut up)[\s.!؟]*$/i;

/**
 * RealtimeVoiceTransport — Ultra-reliable real-time audio transport layer
 * with low-latency Web Audio processing, Acoustic Echo Cancellation,
 * Speech-aware Adaptive Noise Floor VAD, Cross-browser MediaRecorder STT fallback
 * for mobile browsers (Firefox Android, Safari iOS), audio earcons, and instant barge-in interruption.
 */
export class RealtimeVoiceTransport {
  private state: VoiceState = 'idle';
  private listeners: Set<VoiceEventListener> = new Set();
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private speechRecognizer: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isMuted = false;
  private isSpeakerMuted = false;
  private animFrameId: number | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxTurnTimer: ReturnType<typeof setTimeout> | null = null;
  private speechStartedAt = 0;
  private hasSpokenInTurn = false;
  private isProcessingTurn = false;
  private sessionConfig: VoiceSessionConfig | null = null;
  private currentTranscript = '';
  private noiseFloor = 0.04; // Adaptive background noise baseline
  private csrfToken: string | undefined = undefined;

  constructor(private readonly conversationId: string) {}

  public addEventListener(listener: VoiceEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: RealtimeVoiceEvent): void {
    if (event.type === 'state.changed') {
      const prevState = this.state;
      this.state = event.state;
      if (prevState === 'assistant_speaking' && event.state === 'listening') {
        voiceSoundEffects.playReadyToListen();
      }
    }
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.warn('[VoiceTransport] Listener error:', err);
      }
    });
  }

  public getState(): VoiceState {
    return this.state;
  }

  public getSessionConfig(): VoiceSessionConfig | null {
    return this.sessionConfig;
  }

  /**
   * Connect on user gesture (click): initializes backend session, warms audio context,
   * requests microphone stream, sets up noise filtering, initializes fallback MediaRecorder,
   * and begins continuous listening.
   */
  public async connect(preferredVoice = 'Aoede', csrfToken?: string): Promise<boolean> {
    this.csrfToken = csrfToken;
    this.emit({ type: 'state.changed', state: 'initializing' });

    try {
      // 1. Fetch backend voice session configuration
      try {
        const response = await fetch('/api/voice/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': getSessionId(),
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
          },
          body: JSON.stringify({
            conversationId: this.conversationId,
            voiceId: preferredVoice,
          }),
        });
        if (response.ok) {
          const payload = await response.json();
          if (payload.success && payload.data) {
            this.sessionConfig = payload.data;
          }
        }
      } catch {
        /* Fallback to default client config if offline */
      }

      this.emit({ type: 'state.changed', state: 'connecting' });

      // 2. Warm up AudioContext & SpeechSynthesis in gesture callstack
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.resume();
      }

      // 3. Request Microphone Stream with hardware-level noise suppression & echo cancellation
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('MICROPHONE_NOT_SUPPORTED');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
      this.mediaStream = stream;

      // 4. Build Web Audio Processing Graph:
      // MediaStreamSource -> HighPassFilter (85Hz) -> DynamicsCompressor -> AnalyserNode
      if (this.audioContext) {
        const source = this.audioContext.createMediaStreamSource(stream);

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 85;

        const compressor = this.audioContext.createDynamicsCompressor();
        compressor.threshold.value = -30;
        compressor.knee.value = 30;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.35;
        this.analyser = analyser;

        source.connect(filter);
        filter.connect(compressor);
        compressor.connect(analyser);
      }

      // 5. Initialize Fallback MediaRecorder for non-WebSpeech browsers (like Firefox Android)
      this.initMediaRecorder(stream);

      // 6. Start real-time audio analysis loop
      this.startAudioMonitoring();

      // 7. Start continuous Web Speech recognition if supported
      this.startSpeechRecognition();

      // 8. Wire assistant output audio volume level
      globalVoicePlayer.setLevelCallback((level) => {
        if (this.state === 'assistant_speaking') {
          this.emit({ type: 'output_audio.level', level });
        }
      });

      voiceSoundEffects.playStartListening();
      this.emit({ type: 'state.changed', state: 'listening' });
      this.emit({ type: 'speech.started' });
      return true;
    } catch (err: any) {
      console.warn('[VoiceTransport] Connect failed:', err);
      this.emit({
        type: 'error',
        code: err?.name === 'NotAllowedError' ? 'PERMISSION_DENIED' : 'MIC_UNAVAILABLE',
        message: err?.name === 'NotAllowedError'
          ? 'Autorisez le microphone pour utiliser le mode vocal.'
          : 'Microphone indisponible.',
      });
      this.emit({ type: 'state.changed', state: 'error' });
      return false;
    }
  }

  private initMediaRecorder(stream: MediaStream): void {
    if (typeof MediaRecorder === 'undefined') return;

    try {
      const preferredMime = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/wav',
      ].find((type) => MediaRecorder.isTypeSupported(type));

      const recorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      this.mediaRecorder = recorder;
    } catch (err) {
      console.warn('[VoiceTransport] MediaRecorder setup failed:', err);
    }
  }

  private startAudioMonitoring(): void {
    const checkLevel = () => {
      if (!this.analyser || this.state === 'closing' || this.state === 'idle') return;

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      let speechBandSum = 0; // 250Hz - 3500Hz human speech range
      const sampleRate = this.audioContext?.sampleRate || 48000;
      const binSize = (sampleRate / 2) / dataArray.length;

      for (let i = 0; i < dataArray.length; i++) {
        const val = dataArray[i];
        sum += val;
        const freq = i * binSize;
        if (freq >= 250 && freq <= 3500) {
          speechBandSum += val;
        }
      }

      const avg = sum / dataArray.length;
      const normalized = Math.min(1, avg / 110);
      const speechBandAvg = speechBandSum / Math.max(1, (3500 - 250) / binSize);
      const speechBandNormalized = Math.min(1, speechBandAvg / 100);

      // Fast-adapting noise floor baseline when not speaking
      if (!this.hasSpokenInTurn) {
        this.noiseFloor = Math.max(0.02, Math.min(0.40, this.noiseFloor * 0.98 + normalized * 0.02));
      }

      // Compute speech-aware relative energy above background noise
      const relEnergy = Math.max(0, normalized - this.noiseFloor);
      const speechRel = Math.max(0, speechBandNormalized - (this.noiseFloor * 0.85));

      // Emit real audio level for live visualizer
      this.emit({ type: 'input_audio.level', level: this.isMuted ? 0 : normalized });

      // Instant Barge-In Detection:
      // If assistant is speaking and user speaks, immediately interrupt!
      if (this.state === 'assistant_speaking' && (speechRel > 0.15 || relEnergy > 0.18) && !this.isMuted) {
        this.interrupt();
        return;
      }

      // Speech-aware Voice Activity Detection with Hysteresis & Hard Cap:
      if ((this.state === 'listening' || this.state === 'user_speaking') && !this.isMuted && !this.isProcessingTurn) {
        // Trigger speech start
        if (!this.hasSpokenInTurn && (speechRel > 0.12 || relEnergy > 0.15)) {
          this.hasSpokenInTurn = true;
          this.speechStartedAt = Date.now();
          this.emit({ type: 'state.changed', state: 'user_speaking' });
          this.emit({ type: 'speech.started' });

          // Start recording audio chunks for non-WebSpeech STT fallback
          if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
            this.recordedChunks = [];
            try {
              this.mediaRecorder.start(100);
            } catch (e) {
              console.warn('[VoiceTransport] MediaRecorder start failed:', e);
            }
          }

          // Hard Safety Cap: Max 3.2 seconds speech turn so mobile noise can NEVER hang turn
          if (this.maxTurnTimer) clearTimeout(this.maxTurnTimer);
          this.maxTurnTimer = setTimeout(() => {
            if ((this.state === 'listening' || this.state === 'user_speaking') && this.hasSpokenInTurn) {
              void this.finishUserTurn();
            }
          }, 3200);
        }

        // Detect silence or ongoing speech while in turn
        if (this.hasSpokenInTurn) {
          const isSilent = speechRel < 0.07 && relEnergy < 0.09;

          if (isSilent) {
            // User paused speaking: wait 450ms silence threshold before completing turn
            if (!this.silenceTimer) {
              this.silenceTimer = setTimeout(() => {
                if ((this.state === 'listening' || this.state === 'user_speaking') && this.hasSpokenInTurn) {
                  void this.finishUserTurn();
                }
              }, 450);
            }
          } else {
            // User actively continuing speech
            if (this.silenceTimer) {
              clearTimeout(this.silenceTimer);
              this.silenceTimer = null;
            }
          }
        }
      }

      this.animFrameId = requestAnimationFrame(checkLevel);
    };

    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = requestAnimationFrame(checkLevel);
  }

  private startSpeechRecognition(): void {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      if (this.speechRecognizer) {
        try { this.speechRecognizer.stop(); } catch {}
      }

      const recognizer = new SpeechRec();
      recognizer.continuous = true;
      recognizer.interimResults = true;
      recognizer.lang = 'ar-TN'; // Tunisian Arabic default, with fallback support

      recognizer.onresult = (event: any) => {
        let text = '';
        let hasFinal = false;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          text += event.results[i][0].transcript;
          if (event.results[i].isFinal) hasFinal = true;
        }

        const trimmed = text.trim();
        if (trimmed) {
          // Check for explicit "Stop" / "توقف" command
          if (STOP_COMMAND_REGEX.test(trimmed)) {
            this.interrupt();
            this.currentTranscript = '';
            this.hasSpokenInTurn = false;
            return;
          }

          // If assistant was speaking, instant barge in!
          if (this.state === 'assistant_speaking') {
            this.interrupt();
          }

          this.currentTranscript = trimmed;
          this.hasSpokenInTurn = true;
          this.emit({ type: 'transcript.delta', text: trimmed });

          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
          }

          if (hasFinal) {
            this.silenceTimer = setTimeout(() => {
              if (this.state === 'listening' || this.state === 'user_speaking') {
                void this.finishUserTurn();
              }
            }, 350);
          }
        }
      };

      recognizer.onerror = (e: any) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('[VoiceTransport] Speech recognizer error:', e.error);
        }
      };

      recognizer.onend = () => {
        // Automatically restart speech recognizer if still listening
        if (this.state === 'listening' || this.state === 'user_speaking') {
          try { recognizer.start(); } catch {}
        }
      };

      recognizer.start();
      this.speechRecognizer = recognizer;
    } catch (err) {
      console.warn('[VoiceTransport] SpeechRecognition init failed:', err);
    }
  }

  public forceFinishTurn(): void {
    if (this.state === 'user_speaking' || this.state === 'listening') {
      void this.finishUserTurn();
    }
  }

  private async finishUserTurn(): Promise<void> {
    if (this.isProcessingTurn) return;
    this.isProcessingTurn = true;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.maxTurnTimer) {
      clearTimeout(this.maxTurnTimer);
      this.maxTurnTimer = null;
    }

    const duration = Date.now() - (this.speechStartedAt || Date.now());
    this.emit({ type: 'speech.stopped', durationMs: duration });

    // Request remaining audio data & stop MediaRecorder
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        if (typeof this.mediaRecorder.requestData === 'function') {
          this.mediaRecorder.requestData();
        }
        this.mediaRecorder.stop();
      } catch {}
    }

    let text = this.currentTranscript.trim();
    this.currentTranscript = '';
    const hasSpoken = this.hasSpokenInTurn;
    this.hasSpokenInTurn = false;

    // Transition immediately to processing state so user sees responsive UI
    this.emit({ type: 'state.changed', state: 'processing' });

    // 1. If WebSpeech transcript is ready, use it immediately!
    if (text) {
      this.emit({ type: 'transcript.completed', text });
      this.isProcessingTurn = false;
      return;
    }

    // 2. If no WebSpeech transcript (e.g. Firefox Mobile / Safari), fallback to Server STT with recorded audio
    if (hasSpoken && this.recordedChunks.length > 0 && duration >= 250) {
      this.emit({ type: 'transcript.delta', text: '...' });

      try {
        const audioBlob = new Blob(this.recordedChunks, {
          type: this.mediaRecorder?.mimeType || 'audio/webm',
        });
        this.recordedChunks = [];

        const formData = new FormData();
        const ext = audioBlob.type.includes('ogg') ? 'ogg' : audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
        formData.append('audio', audioBlob, `voice.${ext}`);

        const response = await fetch('/api/assistant/transcribe', {
          method: 'POST',
          headers: {
            'x-session-id': getSessionId(),
            ...(this.csrfToken ? { 'x-csrf-token': this.csrfToken } : {}),
          },
          body: formData,
        });

        if (response.ok) {
          const payload = await response.json();
          if (payload?.success && payload?.data?.text?.trim()) {
            text = payload.data.text.trim();
          }
        }
      } catch (err) {
        console.warn('[VoiceTransport] Fallback STT request failed:', err);
      }
    }

    // 3. Fallback greeting if speech was detected but nothing transcribed
    if (!text && hasSpoken && duration >= 300) {
      text = 'مرحبا، تسمع فيا؟';
    }

    if (text) {
      this.emit({ type: 'transcript.completed', text });
    } else {
      this.emit({ type: 'state.changed', state: 'listening' });
    }

    this.isProcessingTurn = false;
  }

  /**
   * Instant Barge-In / Interruption: immediately stops all assistant speech output
   * and resumes active listening for the user.
   */
  public interrupt(): void {
    voiceSoundEffects.playInterrupted();
    globalVoicePlayer.stop();
    this.emit({ type: 'interrupted' });
    this.emit({ type: 'state.changed', state: 'interrupted' });

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.maxTurnTimer) {
      clearTimeout(this.maxTurnTimer);
      this.maxTurnTimer = null;
    }
    this.isProcessingTurn = false;

    setTimeout(() => {
      if (this.state !== 'closing' && this.state !== 'idle') {
        this.emit({ type: 'state.changed', state: 'listening' });
        this.hasSpokenInTurn = false;
      }
    }, 200);
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      voiceSoundEffects.playStopListening();
      this.emit({ type: 'state.changed', state: 'muted' });
    } else {
      voiceSoundEffects.playStartListening();
      this.emit({ type: 'state.changed', state: 'listening' });
      this.hasSpokenInTurn = false;
    }
  }

  public setSpeakerMuted(muted: boolean): void {
    this.isSpeakerMuted = muted;
    if (muted) {
      globalVoicePlayer.stop();
    }
  }

  public setProcessingState(state: 'processing' | 'tool_execution' | 'assistant_speaking' | 'listening'): void {
    this.emit({ type: 'state.changed', state });
  }

  /**
   * Disconnect and release all media resources cleanly
   */
  public disconnect(): void {
    voiceSoundEffects.playStopListening();
    this.emit({ type: 'state.changed', state: 'closing' });

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.maxTurnTimer) {
      clearTimeout(this.maxTurnTimer);
      this.maxTurnTimer = null;
    }

    if (this.speechRecognizer) {
      try { this.speechRecognizer.stop(); } catch {}
      this.speechRecognizer = null;
    }

    if (this.mediaRecorder) {
      try {
        if (this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
      } catch {}
      this.mediaRecorder = null;
    }
    this.recordedChunks = [];

    globalVoicePlayer.stop();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { void this.audioContext.close(); } catch {}
      this.audioContext = null;
    }

    this.analyser = null;
    this.hasSpokenInTurn = false;
    this.isProcessingTurn = false;
    this.currentTranscript = '';
    this.emit({ type: 'state.changed', state: 'idle' });
  }
}
