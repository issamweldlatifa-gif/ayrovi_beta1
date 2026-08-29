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
  emitChunk(size = 180) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(size)], { type: this.mimeType }) });
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
    FakeRecorder.instances[0].emitChunk();
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
    expect(submittedAudio.size).toBeGreaterThanOrEqual(360);
    expect(turns).toEqual(['مرحبا أيروفي']);
    expect(voice.getState()).toBe('thinking');
    expect(states).toEqual(expect.arrayContaining(['starting', 'listening', 'user_speaking', 'transcribing', 'thinking']));
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
