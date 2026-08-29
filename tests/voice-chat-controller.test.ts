import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { transcribeMock } = vi.hoisted(() => ({
  transcribeMock: vi.fn(async (_input: { audio: Blob }) => ({ text: 'مرحبا أيروفي' })),
}));
vi.mock('../client/src/components/assistant/assistantApi', () => ({
  transcribeAssistantAudio: transcribeMock,
}));

import { VoiceChatController } from '../client/src/components/assistant/voice/VoiceChatController';

class FakeTrack {
  enabled = true;
  stop = vi.fn();
}

class FakeStream {
  track = new FakeTrack();
  getTracks() { return [this.track] as unknown as MediaStreamTrack[]; }
  getAudioTracks() { return [this.track] as unknown as MediaStreamTrack[]; }
}

class FakeNode {
  connect = vi.fn();
}

class FakeAnalyser extends FakeNode {
  fftSize = 1024;
  smoothingTimeConstant = 0;
  frequencyBinCount = 512;
  getByteTimeDomainData(values: Uint8Array) { values.fill(128); }
}

class FakeAudioContext {
  state: AudioContextState = 'running';
  sampleRate = 48_000;
  createMediaStreamSource = vi.fn(() => new FakeNode() as unknown as MediaStreamAudioSourceNode);
  createBiquadFilter = vi.fn(() => {
    const node = new FakeNode() as FakeNode & { type: BiquadFilterType; frequency: { value: number } };
    node.type = 'highpass';
    node.frequency = { value: 0 };
    return node as unknown as BiquadFilterNode;
  });
  createAnalyser = vi.fn(() => new FakeAnalyser() as unknown as AnalyserNode);
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
}

class FakeGainNode extends FakeNode {
  gain = { value: 1 };
  disconnect = vi.fn();
}

class FakeLiveAudioContext extends FakeAudioContext {
  destination = {} as AudioDestinationNode;
  audioWorklet = { addModule: vi.fn(async () => undefined) } as unknown as AudioWorklet;
  createGain = vi.fn(() => new FakeGainNode() as unknown as GainNode);
}

class FakeWorkletNode extends FakeNode {
  static instances: FakeWorkletNode[] = [];
  port = { onmessage: null as ((event: MessageEvent<ArrayBuffer>) => void) | null };
  disconnect = vi.fn();
  constructor(_context: AudioContext, _name: string) {
    super();
    FakeWorkletNode.instances.push(this);
  }
  emit(buffer: ArrayBuffer) {
    this.port.onmessage?.({ data: buffer } as MessageEvent<ArrayBuffer>);
  }
}

class FakeLiveSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeLiveSocket[] = [];
  readyState = FakeLiveSocket.CONNECTING;
  bufferedAmount = 0;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  constructor(public url: string) { FakeLiveSocket.instances.push(this); }
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = FakeLiveSocket.CLOSED; }
  open() {
    this.readyState = FakeLiveSocket.OPEN;
    this.onopen?.(new Event('open'));
  }
  message(value: object) {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent);
  }
}

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = vi.fn(() => true);
  state: RecordingState = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  private stopListeners = new Set<() => void>();

  constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {
    FakeRecorder.instances.push(this);
  }

  start = vi.fn(() => { this.state = 'recording'; });
  requestData = vi.fn(() => this.emitChunk(180));
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.stopListeners.forEach((listener) => listener());
  });
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type !== 'stop') return;
    const callback = typeof listener === 'function' ? listener : () => listener.handleEvent(new Event('stop'));
    this.stopListeners.add(callback as () => void);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'stop' && typeof listener === 'function') this.stopListeners.delete(listener as () => void);
  }
  emitChunk(size = 180, marker = 0) {
    const bytes = new Uint8Array(size);
    bytes.fill(marker);
    this.ondataavailable?.({ data: new Blob([bytes], { type: this.mimeType }) });
  }
}

class FakeUtterance {
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
let controller: VoiceChatController | null = null;
let stream: FakeStream;
let states: string[];
let turns: string[];
let speechSynthesis: {
  paused: boolean;
  cancel: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  getVoices: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  FakeRecorder.instances.length = 0;
  FakeWorkletNode.instances.length = 0;
  FakeLiveSocket.instances.length = 0;
  states = [];
  turns = [];
  stream = new FakeStream();
  speechSynthesis = {
    paused: false,
    cancel: vi.fn(),
    resume: vi.fn(),
    speak: vi.fn(),
    getVoices: vi.fn(() => []),
  };

  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn(async () => stream as unknown as MediaStream) },
  });
  vi.stubGlobal('window', {
    AudioContext: FakeAudioContext,
    speechSynthesis,
    localStorage: {
      getItem: vi.fn(() => 'voice-controller-test-session'),
      setItem: vi.fn(),
    },
  });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    success: true,
    data: { serverTextToSpeechReady: false },
  }), { headers: { 'content-type': 'application/json' } })));
  transcribeMock.mockClear();
});

afterEach(() => {
  controller?.stop();
  controller = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const makeController = () => {
  controller = new VoiceChatController({
    language: 'ar-TN',
    onState: (state) => states.push(state),
    onLevel: vi.fn(),
    onTranscript: vi.fn(),
    onTurn: (text) => turns.push(text),
    onError: vi.fn(),
  });
  return controller;
};

describe('VoiceChatController clean hands-free lifecycle', () => {
  it('speaks the opening greeting once, then begins hands-free capture', async () => {
    const voice = makeController();
    const startup = voice.start('مرحباً بك في أيروفي.');
    await flush();
    await flush();

    expect(voice.getState()).toBe('speaking');
    expect(stream.track.enabled).toBe(false);
    expect(FakeRecorder.instances).toHaveLength(0);
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();

    const utterance = speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe('مرحباً بك في أيروفي.');
    utterance.onend?.();
    await expect(startup).resolves.toBe(true);

    expect(voice.getState()).toBe('listening');
    expect(stream.track.enabled).toBe(true);
    expect(FakeRecorder.instances).toHaveLength(1);
    expect(FakeRecorder.instances[0].state).toBe('recording');
  });

  it('captures the first word with pre-roll, transcribes once, then waits for the reply', async () => {
    const voice = makeController();
    await expect(voice.start('')).resolves.toBe(true);
    expect(voice.getState()).toBe('listening');
    expect(FakeRecorder.instances).toHaveLength(1);

    const internal = voice as unknown as {
      listeningSince: number;
      speechStartedAt: number;
      updateVoiceActivity: (rms: number, now: number) => void;
    };
    const base = internal.listeningSince;
    // Wait beyond the former rolling-chunk window. The first fragment carries
    // the real WebM/Ogg initialization header and must remain in the upload.
    for (let marker = 1; marker <= 8; marker += 1) {
      FakeRecorder.instances[0].emitChunk(180, marker);
    }
    internal.updateVoiceActivity(0.12, base + 600);
    internal.updateVoiceActivity(0.12, base + 760);
    expect(voice.getState()).toBe('user_speaking');

    internal.speechStartedAt = performance.now() - 500;
    FakeRecorder.instances[0].emitChunk();
    voice.forceFinishTurn();
    await flush();
    await flush();

    expect(transcribeMock).toHaveBeenCalledOnce();
    const submittedAudio = transcribeMock.mock.calls[0][0].audio as Blob;
    expect(submittedAudio.size).toBeGreaterThanOrEqual(1_800);
    const submittedBytes = new Uint8Array(await submittedAudio.arrayBuffer());
    expect(submittedBytes[0]).toBe(1);
    expect(turns).toEqual(['مرحبا أيروفي']);
    expect(voice.getState()).toBe('thinking');
    expect(states).toEqual(expect.arrayContaining(['starting', 'listening', 'user_speaking', 'transcribing', 'thinking']));
  });

  it('commits one Live final transcript to Claude and never uploads the same turn to Groq', async () => {
    const liveBootstrap = {
      token: 'auth_tokens/controller-one-use',
      model: 'gemini-3.5-transcribe-live',
      websocketUrl: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained',
      expiresAt: '2026-08-29T13:30:00.000Z',
      setup: {
        setup: {
          model: 'models/gemini-3.5-transcribe-live',
          generationConfig: { responseModalities: ['TEXT'] },
          inputAudioTranscription: { languageCodes: [], customVocabulary: ['AYROVI'], mode: 'VERBATIM' },
        },
      },
    };
    vi.stubGlobal('window', {
      AudioContext: FakeLiveAudioContext,
      speechSynthesis,
      localStorage: {
        getItem: vi.fn(() => 'voice-controller-live-session'),
        setItem: vi.fn(),
      },
    });
    vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
    vi.stubGlobal('WebSocket', FakeLiveSocket);
    vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'));
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/assistant/status')) {
        return new Response(JSON.stringify({
          success: true,
          data: { serverTextToSpeechReady: false, liveTranscriptionReady: true },
        }), { headers: { 'content-type': 'application/json' } });
      }
      if (url.endsWith('/api/assistant/voice/live-token')) {
        return new Response(JSON.stringify({ success: true, data: liveBootstrap }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const voice = makeController();
    const startup = voice.start('');
    await vi.waitFor(() => expect(FakeLiveSocket.instances).toHaveLength(1));
    const socket = FakeLiveSocket.instances[0];
    socket.open();
    await flush();
    socket.message({ setupComplete: {} });
    await expect(startup).resolves.toBe(true);
    expect(FakeWorkletNode.instances).toHaveLength(1);
    expect(FakeRecorder.instances).toHaveLength(1);

    FakeWorkletNode.instances[0].emit(new Int16Array(1_600).buffer);
    const internal = voice as unknown as {
      listeningSince: number;
      speechStartedAt: number;
      updateVoiceActivity: (rms: number, now: number) => void;
    };
    const base = internal.listeningSince;
    internal.updateVoiceActivity(0.12, base + 600);
    internal.updateVoiceActivity(0.12, base + 760);
    internal.speechStartedAt = performance.now() - 500;

    voice.forceFinishTurn();
    voice.forceFinishTurn();
    await flush();
    socket.message({
      serverContent: {
        inputTranscription: { text: 'احسبلي السعر بالدينار' },
        turnComplete: true,
      },
    });
    await vi.waitFor(() => expect(turns).toEqual(['احسبلي السعر بالدينار']));

    expect(transcribeMock).not.toHaveBeenCalled();
    expect(stream.track.enabled).toBe(false);
    expect(voice.getState()).toBe('thinking');
    const endSignals = socket.sent
      .map((value) => JSON.parse(value))
      .filter((value) => value?.realtimeInput?.audioStreamEnd === true);
    expect(endSignals).toHaveLength(1);
    expect(socket.sent.some((value) => value.includes('clientContent'))).toBe(false);
  });

  it('stops microphone recording for the entire output and resumes hands-free listening afterward', async () => {
    const voice = makeController();
    await voice.start('');
    const firstRecorder = FakeRecorder.instances[0];
    expect(firstRecorder.state).toBe('recording');

    const playback = voice.speak('Bonjour, réponse complète.', 'fr-FR');
    await flush();
    await flush();

    expect(firstRecorder.stop).toHaveBeenCalled();
    expect(stream.track.enabled).toBe(false);
    expect(voice.getState()).toBe('speaking');
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();

    const utterance = speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    utterance.onend?.();
    await playback;

    expect(voice.getState()).toBe('listening');
    expect(stream.track.enabled).toBe(true);
    expect(FakeRecorder.instances).toHaveLength(2);
    expect(FakeRecorder.instances[1].state).toBe('recording');
  });

  it('cancels output without an interrupted state or a synthetic pop loop', async () => {
    const voice = makeController();
    await voice.start('');
    const playback = voice.speak('Réponse à interrompre.', 'fr-FR');
    await flush();
    await flush();
    expect(voice.getState()).toBe('speaking');

    voice.interruptOutput();
    await playback;
    await flush();

    expect(voice.getState()).toBe('listening');
    expect(states).not.toContain('interrupted');
    expect(speechSynthesis.cancel).toHaveBeenCalledOnce();
  });
});
