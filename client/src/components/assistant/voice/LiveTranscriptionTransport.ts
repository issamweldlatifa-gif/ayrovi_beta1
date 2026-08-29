import { getSessionId } from '../../../utils/session';

interface LiveBootstrap {
  token: string;
  model: string;
  websocketUrl: string;
  expiresAt: string;
  setup: {
    setup: {
      model: string;
      generationConfig: { responseModalities: ['TEXT'] };
      inputAudioTranscription: {
        languageCodes: string[];
        customVocabulary: string[];
        mode: 'VERBATIM';
      };
    };
  };
}

interface LiveServerMessage {
  setupComplete?: object;
  serverContent?: {
    interimInputTranscription?: { text?: string };
    inputTranscription?: { text?: string };
    turnComplete?: boolean;
  };
  goAway?: { timeLeft?: string };
}

export interface LiveTranscriptionCallbacks {
  onInterim?: (text: string) => void;
  onUnavailable?: () => void;
}

type SocketFactory = (url: string) => WebSocket;

const SETUP_TIMEOUT_MS = 5_000;
const FINAL_TRANSCRIPT_TIMEOUT_MS = 4_500;
const FINAL_SETTLE_MS = 180;
const MAX_BUFFERED_AUDIO_BYTES = 256 * 1024;
// Dedicated Live Transcribe sessions are currently bounded to ten minutes.
const SESSION_RENEW_MS = 9 * 60_000;

function normalizeTranscript(value: unknown): string {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8_000);
}

function mergeFinalTranscript(current: string, nextValue: string): string {
  const next = normalizeTranscript(nextValue);
  if (!next) return current;
  if (!current) return next;
  const a = current.toLocaleLowerCase();
  const b = next.toLocaleLowerCase();
  if (a === b || a.endsWith(` ${b}`)) return current;
  if (b.startsWith(a)) return next;
  if (a.startsWith(b)) return current;
  return normalizeTranscript(`${current} ${next}`);
}

function pcmToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // PCM worklet chunks are around 3.2 KB. Chunking here also keeps this safe
  // if a browser supplies a larger transfer in the future.
  for (let offset = 0; offset < bytes.length; offset += 0x4000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x4000));
  }
  return btoa(binary);
}

/**
 * One dedicated Gemini Live Transcribe session. It never sends text prompts,
 * accepts no model response as an assistant answer, and exposes only finalized
 * user transcription to the existing Claude turn pipeline.
 */
export class LiveTranscriptionTransport {
  private socket: WebSocket | null = null;
  private connectAbort: AbortController | null = null;
  private readyState = false;
  private disposed = false;
  private turnActive = false;
  private finishing = false;
  private sentAudio = false;
  private finalText = '';
  private turnGeneration = 0;
  private finalTimer: ReturnType<typeof setTimeout> | null = null;
  private finalTimeout: ReturnType<typeof setTimeout> | null = null;
  private renewalTimer: ReturnType<typeof setTimeout> | null = null;
  private resolveFinal: ((text: string | null) => void) | null = null;
  private renewalRequested = false;
  private reconnecting = false;

  public constructor(
    private readonly callbacks: LiveTranscriptionCallbacks = {},
    private readonly createSocket: SocketFactory = (url) => new WebSocket(url),
  ) {}

  public static supported(): boolean {
    return typeof WebSocket !== 'undefined' && typeof btoa === 'function';
  }

  public get ready(): boolean {
    return this.readyState && this.socket?.readyState === WebSocket.OPEN && !this.disposed;
  }

  public async connect(): Promise<boolean> {
    if (this.disposed || this.connectAbort || !LiveTranscriptionTransport.supported()) return false;
    if (this.turnActive || this.finishing) {
      this.renewalRequested = true;
      return false;
    }
    this.clearRenewalTimer();
    this.disconnectSocket();
    const abort = new AbortController();
    this.connectAbort = abort;

    try {
      const response = await fetch('/api/assistant/voice/live-token', {
        method: 'POST',
        credentials: 'same-origin',
        signal: abort.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getSessionId(),
        },
        body: '{}',
      });
      const payload: any = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) return false;
      const bootstrap = payload.data as LiveBootstrap;
      if (!this.validBootstrap(bootstrap)) return false;
      if (abort.signal.aborted || this.disposed) return false;

      const socketUrl = `${bootstrap.websocketUrl}?access_token=${encodeURIComponent(bootstrap.token)}`;
      const socket = this.createSocket(socketUrl);
      this.socket = socket;

      const connected = await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (value: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          abort.signal.removeEventListener('abort', onAbort);
          resolve(value);
        };
        const onAbort = () => {
          try { socket.close(1000, 'cancelled'); } catch {}
          finish(false);
        };
        const timer = setTimeout(() => {
          try { socket.close(1000, 'setup-timeout'); } catch {}
          finish(false);
        }, SETUP_TIMEOUT_MS);
        abort.signal.addEventListener('abort', onAbort, { once: true });

        socket.onopen = () => {
          if (abort.signal.aborted || this.disposed) {
            try { socket.close(1000, 'cancelled'); } catch {}
            finish(false);
            return;
          }
          try {
            socket.send(JSON.stringify(bootstrap.setup));
          } catch {
            finish(false);
          }
        };
        socket.onmessage = (event) => {
          void this.parseSocketMessage(event.data).then((message) => {
            if (!message) return;
            if (message.setupComplete && this.socket === socket) {
              this.readyState = true;
              this.renewalRequested = false;
              this.scheduleSessionRenewal();
              finish(true);
            }
            this.handleServerMessage(message);
          });
        };
        socket.onerror = () => finish(false);
        socket.onclose = () => {
          if (this.socket !== socket) return;
          const wasReady = this.readyState;
          this.readyState = false;
          this.clearRenewalTimer();
          if (wasReady && !this.disposed) {
            this.renewalRequested = true;
            this.callbacks.onUnavailable?.();
          }
          this.settleFinal(null);
          this.maybeReconnect();
          finish(false);
        };
      });

      if (!connected && this.socket === socket) this.disconnectSocket();
      return connected;
    } catch {
      return false;
    } finally {
      if (this.connectAbort === abort) this.connectAbort = null;
    }
  }

  /** Start exactly one user turn. MediaRecorder runs beside it only as fallback. */
  public beginTurn(): boolean {
    if (!this.ready || this.turnActive || this.finishing) return false;
    this.turnGeneration += 1;
    this.turnActive = true;
    this.sentAudio = false;
    this.finalText = '';
    this.clearFinalTimers();
    this.callbacks.onInterim?.('');
    return true;
  }

  public sendPcm16(buffer: ArrayBuffer): boolean {
    const socket = this.socket;
    if (!this.turnActive || this.finishing || !this.ready || !socket || !buffer.byteLength) return false;
    // Backpressure: drop live chunks rather than unboundedly queueing them. The
    // complete encoded MediaRecorder container remains available for Groq.
    if (socket.bufferedAmount > MAX_BUFFERED_AUDIO_BYTES) return false;
    try {
      socket.send(JSON.stringify({
        realtimeInput: {
          audio: {
            data: pcmToBase64(buffer),
            mimeType: 'audio/pcm;rate=16000',
          },
        },
      }));
      this.sentAudio = true;
      return true;
    } catch {
      return false;
    }
  }

  /** Signal end-of-stream and resolve only one authoritative final transcript. */
  public finishTurn(): Promise<string | null> {
    if (this.finishing) {
      // Controller finalization is idempotent; never create a second promise or
      // a second Claude trigger for the same microphone turn.
      return Promise.resolve(null);
    }
    if (!this.turnActive || !this.ready || !this.socket || !this.sentAudio) {
      this.cancelTurn();
      return Promise.resolve(null);
    }

    this.turnActive = false;
    this.finishing = true;
    const turn = this.turnGeneration;
    try {
      this.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    } catch {
      this.finishing = false;
      return Promise.resolve(null);
    }

    return new Promise<string | null>((resolve) => {
      this.resolveFinal = resolve;
      this.finalTimeout = setTimeout(() => {
        if (turn === this.turnGeneration) this.settleFinal(this.finalText || null);
      }, FINAL_TRANSCRIPT_TIMEOUT_MS);
      if (this.finalText) this.scheduleFinalSettlement(turn);
    });
  }

  public cancelTurn(): void {
    const hadAudio = this.sentAudio;
    this.turnGeneration += 1;
    this.turnActive = false;
    this.finishing = false;
    this.sentAudio = false;
    this.finalText = '';
    this.clearFinalTimers();
    this.settleFinal(null);
    if (hadAudio && this.ready && this.socket) {
      try { this.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })); } catch {}
    }
    this.callbacks.onInterim?.('');
    this.maybeReconnect();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.connectAbort?.abort();
    this.connectAbort = null;
    this.renewalRequested = false;
    this.clearRenewalTimer();
    this.cancelTurn();
    this.disconnectSocket();
  }

  private validBootstrap(value: LiveBootstrap): boolean {
    if (!value || typeof value.token !== 'string' || !value.token || value.token.length > 4_096) return false;
    if (value.model !== 'gemini-3.5-transcribe-live') return false;
    if (value.websocketUrl !== 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained') return false;
    return value.setup?.setup?.model === `models/${value.model}`
      && value.setup.setup.generationConfig?.responseModalities?.[0] === 'TEXT';
  }

  private async parseSocketMessage(data: unknown): Promise<LiveServerMessage | null> {
    try {
      if (typeof data === 'string') return JSON.parse(data) as LiveServerMessage;
      if (data instanceof Blob) return JSON.parse(await data.text()) as LiveServerMessage;
      if (data instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(data)) as LiveServerMessage;
    } catch {}
    return null;
  }

  private handleServerMessage(message: LiveServerMessage): void {
    if (this.disposed) return;
    if (message.goAway) {
      this.renewalRequested = true;
      this.maybeReconnect();
    }
    if (!this.turnActive && !this.finishing) return;
    const serverContent = message.serverContent;
    const interim = normalizeTranscript(serverContent?.interimInputTranscription?.text);
    if (interim && this.turnActive) this.callbacks.onInterim?.(interim);

    const final = normalizeTranscript(serverContent?.inputTranscription?.text);
    if (final) {
      this.finalText = mergeFinalTranscript(this.finalText, final);
      this.callbacks.onInterim?.(this.finalText);
      if (this.finishing) this.scheduleFinalSettlement(this.turnGeneration);
    }
    if (serverContent?.turnComplete && this.finishing) this.settleFinal(this.finalText || null);
  }

  private scheduleFinalSettlement(turn: number): void {
    if (this.finalTimer) clearTimeout(this.finalTimer);
    this.finalTimer = setTimeout(() => {
      if (turn === this.turnGeneration && this.finishing) this.settleFinal(this.finalText || null);
    }, FINAL_SETTLE_MS);
  }

  private settleFinal(text: string | null): void {
    const resolve = this.resolveFinal;
    this.resolveFinal = null;
    this.clearFinalTimers();
    this.finishing = false;
    this.sentAudio = false;
    this.finalText = '';
    if (resolve) resolve(text ? normalizeTranscript(text) : null);
    this.maybeReconnect();
  }

  private scheduleSessionRenewal(): void {
    this.clearRenewalTimer();
    this.renewalTimer = setTimeout(() => {
      this.renewalTimer = null;
      this.renewalRequested = true;
      this.maybeReconnect();
    }, SESSION_RENEW_MS);
  }

  private clearRenewalTimer(): void {
    if (this.renewalTimer) clearTimeout(this.renewalTimer);
    this.renewalTimer = null;
  }

  private maybeReconnect(): void {
    if (this.disposed || !this.renewalRequested || this.reconnecting || this.turnActive || this.finishing) return;
    this.renewalRequested = false;
    this.reconnecting = true;
    void this.connect().then((connected) => {
      this.reconnecting = false;
      if (!connected && !this.disposed) this.callbacks.onUnavailable?.();
    });
  }

  private clearFinalTimers(): void {
    if (this.finalTimer) clearTimeout(this.finalTimer);
    if (this.finalTimeout) clearTimeout(this.finalTimeout);
    this.finalTimer = null;
    this.finalTimeout = null;
  }

  private disconnectSocket(): void {
    const socket = this.socket;
    this.socket = null;
    this.readyState = false;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try { socket.close(1000, 'client-close'); } catch {}
    }
  }
}
