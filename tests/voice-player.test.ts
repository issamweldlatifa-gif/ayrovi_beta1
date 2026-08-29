import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantVoicePlayer } from '../client/src/components/assistant/voicePlayer';

class FakeAnalyser {
  fftSize = 128;
  smoothingTimeConstant = 0.3;
  frequencyBinCount = 64;
  connect = vi.fn();
  getByteFrequencyData(array: Uint8Array) { array.fill(24); }
}

class FakeAudioBuffer {
  private data: Float32Array;
  constructor(length = 480) { this.data = new Float32Array(length); }
  getChannelData() { return this.data; }
}

class FakeBufferSource {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

const contexts: FakeAudioContext[] = [];
class FakeAudioContext {
  state: AudioContextState = 'running';
  destination = {} as AudioDestinationNode;
  sources: FakeBufferSource[] = [];
  analyser = new FakeAnalyser();
  constructor() { contexts.push(this); }
  createAnalyser() { return this.analyser as unknown as AnalyserNode; }
  createBufferSource() {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
  createBuffer(_channels: number, length: number) { return new FakeAudioBuffer(length) as unknown as AudioBuffer; }
  decodeAudioData = vi.fn(async () => new FakeAudioBuffer() as unknown as AudioBuffer);
  resume = vi.fn(async () => undefined);
}

class FakeUtterance {
  lang = '';
  volume = 1;
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onboundary: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  constructor(public text: string) {}
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let activePlayer: AssistantVoicePlayer | null = null;

beforeEach(() => {
  contexts.length = 0;
  const speechSynthesis = {
    paused: false,
    speaking: false,
    onvoiceschanged: null as (() => void) | null,
    getVoices: vi.fn(() => []),
    resume: vi.fn(),
    cancel: vi.fn(),
    speak: vi.fn(),
  };
  vi.stubGlobal('window', {
    AudioContext: FakeAudioContext,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: vi.fn(() => 'ayrovi-test-session'),
      setItem: vi.fn(),
    },
    speechSynthesis,
  });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  activePlayer?.stop();
  activePlayer = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AssistantVoicePlayer', () => {
  it('serializes streamed sentence TTS requests instead of overlapping audio clips', async () => {
    const pending: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
    vi.stubGlobal('fetch', fetchMock);
    const player = new AssistantVoicePlayer();
    activePlayer = player;
    player.warmUp();
    const onStart = vi.fn();
    const onEnd = vi.fn();

    player.queueSentence('Première phrase.', 'fr', onStart, onEnd);
    player.queueSentence('Deuxième phrase.', 'fr', onStart, onEnd);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
    pending.shift()?.(new Response(new Uint8Array(128), { headers: { 'content-type': 'audio/wav' } }));
    await flush();
    await flush();

    expect(contexts[0].sources).toHaveLength(1);
    expect(contexts[0].sources[0].start).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    contexts[0].sources[0].onended?.();
    await flush();
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts a pending server TTS request and prevents ghost playback after stop', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const player = new AssistantVoicePlayer();
    activePlayer = player;
    player.warmUp();

    player.queueSentence('Cette réponse doit être annulée.', 'fr');
    await flush();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(player.speaking).toBe(true);

    player.stop();
    await flush();
    expect(player.speaking).toBe(false);
    expect(contexts[0].sources).toHaveLength(0);
  });

  it('falls back to one browser utterance when server TTS is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ fallbackToClient: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));
    const player = new AssistantVoicePlayer();
    activePlayer = player;
    player.warmUp();

    player.queueSentence('Bonjour AYROVI.', 'fr');
    player.queueSentence('Comment allez-vous ?', 'fr');
    await flush();
    await flush();

    const synth = (window as any).speechSynthesis;
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const firstUtterance = synth.speak.mock.calls[0][0] as FakeUtterance;
    firstUtterance.onstart?.();
    firstUtterance.onend?.();
    await flush();
    await flush();
    expect(synth.speak).toHaveBeenCalledTimes(2);
  });
});
