import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceOutput } from '../client/src/components/assistant/voice/VoiceOutput';

class FakeAnalyser {
  fftSize = 128;
  smoothingTimeConstant = 0;
  frequencyBinCount = 64;
  connect = vi.fn();
  getByteFrequencyData(values: Uint8Array) { values.fill(20); }
}

class FakeSource {
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
  analyser = new FakeAnalyser();
  sources: FakeSource[] = [];
  constructor() { contexts.push(this); }
  createAnalyser() { return this.analyser as unknown as AnalyserNode; }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
  decodeAudioData = vi.fn(async () => ({}) as AudioBuffer);
  resume = vi.fn(async () => undefined);
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
let output: VoiceOutput | null = null;
let speechSynthesis: {
  paused: boolean;
  cancel: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  getVoices: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  contexts.length = 0;
  speechSynthesis = {
    paused: false,
    cancel: vi.fn(),
    resume: vi.fn(),
    speak: vi.fn(),
    getVoices: vi.fn(() => []),
  };
  vi.stubGlobal('window', {
    AudioContext: FakeAudioContext,
    speechSynthesis,
    localStorage: {
      getItem: vi.fn(() => 'voice-output-test-session'),
      setItem: vi.fn(),
    },
  });
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  output?.stop();
  output = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('VoiceOutput single-shot playback', () => {
  it('plays one server audio response and completes only when that source ends', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(128), {
      headers: { 'content-type': 'audio/wav' },
    })));
    output = new VoiceOutput();
    const onStart = vi.fn();
    const onEnd = vi.fn();

    const playback = output.speak('Bonjour AYROVI.', 'fr-FR', { onStart, onEnd });
    await flush();
    await flush();

    expect(contexts).toHaveLength(1);
    expect(contexts[0].sources).toHaveLength(1);
    expect(contexts[0].sources[0].start).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onEnd).not.toHaveBeenCalled();

    contexts[0].sources[0].onended?.();
    await expect(playback).resolves.toBe('ended');
    expect(onEnd).toHaveBeenCalledWith('ended');
  });

  it('uses exactly one browser utterance for a complete turn when server TTS is absent', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    output = new VoiceOutput();
    output.setServerTtsAvailable(false);

    const playback = output.speak('هذه إجابة كاملة في عملية صوتية واحدة.', 'ar-TN');
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    const utterance = speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe('هذه إجابة كاملة في عملية صوتية واحدة.');
    expect(utterance.lang).toBe('ar-SA');
    expect(speechSynthesis.cancel).not.toHaveBeenCalled();
    utterance.onend?.();
    await expect(playback).resolves.toBe('ended');
    expect(speechSynthesis.cancel).not.toHaveBeenCalled();
  });

  it('never truncates a long turn to the server limit', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    output = new VoiceOutput();
    const text = `Réponse complète ${'longue '.repeat(700)}`.trim();

    const playback = output.speak(text, 'fr-FR');
    await flush();

    expect(text.length).toBeGreaterThan(4_096);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    const utterance = speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe(text);
    utterance.onend?.();
    await expect(playback).resolves.toBe('ended');
  });

  it('does not force a wrong-language local voice onto Arabic text', async () => {
    speechSynthesis.getVoices.mockReturnValue([{
      default: true,
      lang: 'fr-FR',
      localService: true,
      name: 'French voice',
      voiceURI: 'fr-test',
    } as SpeechSynthesisVoice]);
    vi.stubGlobal('fetch', vi.fn());
    output = new VoiceOutput();
    output.setServerTtsAvailable(false);

    const playback = output.speak('مرحبا بك', 'ar-TN');
    await flush();
    const utterance = speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.voice).toBeNull();
    utterance.onend?.();
    await playback;
  });

  it('falls back locally when the server request times out instead of treating it as user cancellation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
    })));
    output = new VoiceOutput();

    const playback = output.speak('Réponse après délai serveur.', 'fr-FR');
    await vi.advanceTimersByTimeAsync(22_000);

    expect(speechSynthesis.speak).toHaveBeenCalledOnce();
    const utterance = speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    utterance.onend?.();
    await expect(playback).resolves.toBe('ended');
  });

  it('aborts a pending request and never creates ghost playback after stop', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    output = new VoiceOutput();

    const playback = output.speak('Cette réponse sera annulée.', 'fr-FR');
    await flush();
    expect(output.busy).toBe(true);
    output.stop();

    await expect(playback).resolves.toBe('cancelled');
    expect(contexts.flatMap((context) => context.sources)).toHaveLength(0);
    expect(speechSynthesis.speak).not.toHaveBeenCalled();
  });
});
