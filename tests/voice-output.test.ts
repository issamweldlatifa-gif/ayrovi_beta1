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
  onstart: (() => void) | null = null;
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
  it('waits for the actual browser start and never fabricates audio measurements', async () => {
    output = new VoiceOutput(); output.setServerTtsAvailable(false);
    const onStart = vi.fn(), onLevel = vi.fn();
    const playback = output.speak('Texte', 'fr', { onStart, onLevel });
    const utterance = speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    expect(onStart).not.toHaveBeenCalled();
    utterance.onstart?.(); expect(onStart).toHaveBeenCalledOnce();
    expect(onLevel).toHaveBeenCalledWith(0);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    utterance.onend?.(); await expect(playback).resolves.toBe('ended');
  });

  it('preserves the displayed message including URL, braces, punctuation and paragraphs when requested', async () => {
    output = new VoiceOutput(); output.setServerTtsAvailable(false);
    const text = 'A {30 TND} _identifiant_\n\nhttps://example.test/item#size';
    const playback = output.speak(text, 'fr', {}, { preserveText: true });
    const utterance = speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe(text); utterance.onend?.(); await playback;
  });

  it('settles interrupted ownership and ignores late start/end events after replacement', async () => {
    output = new VoiceOutput(); output.setServerTtsAvailable(false);
    const onStart = vi.fn();
    const first = output.speak('Première', 'fr', { onStart });
    const old = speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    const second = output.speak('Deuxième', 'fr');
    await expect(first).resolves.toBe('cancelled');
    old.onstart?.(); old.onend?.(); expect(onStart).not.toHaveBeenCalled();
    expect(output.busy).toBe(true);
    output.dispose(); await expect(second).resolves.toBe('cancelled');
    expect(output.busy).toBe(false);
  });

  it('reports unavailable when there is no local speech API', async () => {
    vi.stubGlobal('window', {});
    output = new VoiceOutput(); output.setServerTtsAvailable(false);
    await expect(output.speak('Test', 'fr')).resolves.toBe('unavailable');
  });

  it('reports a device failure without ever announcing successful playback', async () => {
    output = new VoiceOutput(); output.setServerTtsAvailable(false);
    const onStart = vi.fn();
    const playback = output.speak('Test', 'fr', { onStart });
    const utterance = speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    utterance.onerror?.({ error: 'not-allowed' });
    await expect(playback).resolves.toBe('unavailable'); expect(onStart).not.toHaveBeenCalled();
  });

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
  it('does not report playing while the browser utterance is only queued', async () => {
    output = new VoiceOutput(); output.setServerTtsAvailable(false);
    const playback = output.speak('En attente', 'fr');
    expect(output.busy).toBe(true); expect(output.playing).toBe(false);
    const utterance = speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    utterance.onstart?.(); expect(output.playing).toBe(true);
    utterance.onend?.(); await playback; expect(output.playing).toBe(false);
  });

  it('announces browser start once and ignores errors after completion', async () => {
    output = new VoiceOutput(); output.setServerTtsAvailable(false);
    const onStart = vi.fn(), onError = vi.fn(), onEnd = vi.fn();
    const playback = output.speak('Bonjour', 'fr', { onStart, onError, onEnd });
    const utterance = speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    const start = utterance.onstart, error = utterance.onerror;
    start?.(); start?.(); utterance.onend?.(); await playback; error?.({error:'not-allowed'});
    expect(onStart).toHaveBeenCalledOnce(); expect(onError).not.toHaveBeenCalled(); expect(onEnd).toHaveBeenCalledExactlyOnceWith('ended');
  });

  it('does not restart metering after onStart cancels its own operation', async () => {
    output = new VoiceOutput(); output.setServerTtsAvailable(false); const onLevel = vi.fn();
    const playback = output.speak('Stop', 'fr', {onStart:()=>output!.stop(),onLevel});
    (speechSynthesis.speak.mock.calls[0][0] as FakeUtterance).onstart?.();
    await expect(playback).resolves.toBe('cancelled'); expect(onLevel).not.toHaveBeenCalled(); expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('preserves prices, identifiers, links and paragraphs in hands-free speech too', async () => {
    output = new VoiceOutput(); output.setServerTtsAvailable(false);
    const text='Prix {30 TND} — item_code\n\nhttps://example.test/a#size';
    const playback=output.speak(text+' [[OPEN_LENS]]','fr');
    const utterance=speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe(text);utterance.onend?.();await playback;
  });

  it('settles stop even when fetch ignores AbortSignal', async () => {
    let release!:(response:Response)=>void;
    vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;})));
    output=new VoiceOutput();let settled:string|undefined;
    const playback=output.speak('Annuler','fr').then(result=>{settled=result;return result;});output.stop();await flush();const observed=settled;
    release(new Response(new Uint8Array(128),{headers:{'content-type':'audio/wav'}}));await playback;
    expect(observed).toBe('cancelled');expect(speechSynthesis.speak).not.toHaveBeenCalled();expect(contexts).toHaveLength(0);
  });

  it('settles stop while audio decoding is unresolved and discards its late result', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(128),{headers:{'content-type':'audio/wav'}})));
    output=new VoiceOutput();output.warmUp();let release!:(audio:AudioBuffer)=>void;
    contexts[0].decodeAudioData.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
    let settled:string|undefined;const playback=output.speak('Décodage','fr').then(result=>{settled=result;return result;});await flush();
    expect(contexts[0].decodeAudioData).toHaveBeenCalledOnce();output.stop();await flush();const observed=settled;
    release({duration:1} as AudioBuffer);await playback;expect(observed).toBe('cancelled');expect(contexts[0].sources).toHaveLength(0);
  });

  it('bounds decoding by the same server deadline instead of hanging forever', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(128),{headers:{'content-type':'audio/wav'}})));
    output=new VoiceOutput();output.warmUp();let release!:(audio:AudioBuffer)=>void;
    contexts[0].decodeAudioData.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
    vi.useFakeTimers();const playback=output.speak('Délai','fr');await vi.advanceTimersByTimeAsync(22_000);
    const calls=speechSynthesis.speak.mock.calls.length;release({duration:1} as AudioBuffer);await vi.advanceTimersByTimeAsync(0);
    const utterance=speechSynthesis.speak.mock.calls[0]?.[0] as FakeUtterance;utterance?.onstart?.();utterance?.onend?.();await playback;
    expect(calls).toBe(1);expect(contexts[0].sources).toHaveLength(0);
  });

  it('holds one settings snapshot across server failure and local fallback', async () => {
    let fail!:(error:Error)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise((_resolve,reject)=>{fail=reject;})));
    output=new VoiceOutput();output.configure({voiceId:'Puck',gender:'male',rate:.9});
    const playback=output.speak('Même réglage','fr');output.configure({voiceId:'Kore',gender:'female',rate:1.25});fail(new Error('503'));await flush();
    const utterance=speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.rate).toBe(.9);expect(output.getSettings().rate).toBe(1.25);utterance.onend?.();await playback;
  });

  it('does not claim fallback success or emit an error when local playback succeeds', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline');}));output=new VoiceOutput();const onError=vi.fn(),onEnd=vi.fn();
    const playback=output.speak('Repli local','fr',{onError,onEnd});await flush();expect(onError).not.toHaveBeenCalled();expect(onEnd).not.toHaveBeenCalled();
    const utterance=speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;utterance.onstart?.();utterance.onend?.();await playback;expect(onEnd).toHaveBeenCalledExactlyOnceWith('ended');
  });

  it('reports a terminal French error once if neither output is available', async () => {
    vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline');}));vi.stubGlobal('window',{localStorage:{getItem:()=> 'test'},speechSynthesis:undefined});
    output=new VoiceOutput();const onError=vi.fn(),onEnd=vi.fn();await expect(output.speak('Bonjour','fr',{onError,onEnd})).resolves.toBe('unavailable');
    expect(onError).toHaveBeenCalledOnce();expect(onError.mock.calls[0][0]).toMatch(/Impossible/);expect(onEnd).toHaveBeenCalledExactlyOnceWith('unavailable');
  });

  it('does not mistake the word female for an explicitly male local voice', async () => {
    speechSynthesis.getVoices.mockReturnValue([{lang:'fr-FR',name:'French female voice'},{lang:'fr-FR',name:'French male voice'}]);
    output=new VoiceOutput();output.setServerTtsAvailable(false);output.configure({voiceId:'Puck',gender:'male'});
    const playback=output.speak('Voix','fr');const utterance=speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.voice?.name).toBe('French male voice');utterance.onend?.();await playback;
  });

  it('keeps preset and fallback gender coherent for partial configuration',()=>{
    output=new VoiceOutput();output.configure({voiceId:'Puck'});expect(output.getSettings().gender).toBe('male');
    output.configure({gender:'female'});expect(output.getSettings().voiceId).toBe('Aoede');
    output.configure({voiceId:'Kore'});output.configure({gender:'female'});expect(output.getSettings().voiceId).toBe('Kore');
  });

  it('a synchronous cancel event cannot disguise a watchdog failure as user cancellation',async()=>{
    vi.useFakeTimers();output=new VoiceOutput();output.setServerTtsAvailable(false);
    const playback=output.speak('Silence','fr');const utterance=speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;
    speechSynthesis.cancel.mockImplementation(()=>utterance.onerror?.({error:'canceled'}));await vi.advanceTimersByTimeAsync(30_000);
    await expect(playback).resolves.toBe('unavailable');
  });

  it('does not cut a healthy long reading at the old ten-minute ceiling',async()=>{
    vi.useFakeTimers();output=new VoiceOutput();output.setServerTtsAvailable(false);
    const playback=output.speak('Long '.repeat(2500),'fr');const utterance=speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;utterance.onstart?.();
    await vi.advanceTimersByTimeAsync(600_000);expect(speechSynthesis.cancel).not.toHaveBeenCalled();utterance.onend?.();await playback;
  });

  it('cancels a suspended audio-context resume without waiting for the native promise',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(128),{headers:{'content-type':'audio/wav'}})));
    output=new VoiceOutput();output.warmUp();const context=contexts[0];context.state='suspended';let resume!:()=>void;
    context.resume.mockImplementation(()=>new Promise<void>(resolve=>{resume=resolve;}));let settled:string|undefined;
    const playback=output.speak('Suspendu','fr').then(result=>{settled=result;return result;});await flush();output.stop();await flush();const observed=settled;
    context.state='running';resume();await playback;expect(observed).toBe('cancelled');expect(context.decodeAudioData).not.toHaveBeenCalled();
  });

  it('uses a single terminal callback after server source-start failure and browser fallback',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(128),{headers:{'content-type':'audio/wav'}})));
    output=new VoiceOutput();output.warmUp();const create=contexts[0].createBufferSource.bind(contexts[0]);
    vi.spyOn(contexts[0],'createBufferSource').mockImplementation(()=>{const source=create();vi.mocked(source.start).mockImplementation(()=>{throw new Error('start failed');});return source;});
    const onEnd=vi.fn(),onError=vi.fn();const playback=output.speak('Repli','fr',{onEnd,onError});await flush();
    expect(onEnd).not.toHaveBeenCalled();expect(onError).not.toHaveBeenCalled();
    const utterance=speechSynthesis.speak.mock.calls[0][0] as FakeUtterance;utterance.onstart?.();utterance.onend?.();await playback;
    expect(onEnd).toHaveBeenCalledExactlyOnceWith('ended');expect(contexts[0].sources[0].stop).toHaveBeenCalledOnce();
  });

  it('reports a lost source-end event as failure without replaying already-started speech',async()=>{
    vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(128),{headers:{'content-type':'audio/wav'}})));
    output=new VoiceOutput();output.warmUp();contexts[0].decodeAudioData.mockResolvedValue({duration:1} as AudioBuffer);
    const onEnd=vi.fn(),onError=vi.fn();const playback=output.speak('Fin absente','fr',{onEnd,onError});await vi.advanceTimersByTimeAsync(0);
    expect(output.playing).toBe(true);await vi.advanceTimersByTimeAsync(11_000);await expect(playback).resolves.toBe('unavailable');
    expect(speechSynthesis.speak).not.toHaveBeenCalled();expect(onEnd).toHaveBeenCalledExactlyOnceWith('unavailable');expect(onError).toHaveBeenCalledOnce();expect(output.busy).toBe(false);
  });

  it('late animation callbacks cannot erase the newer operation’s frame handle',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(128),{headers:{'content-type':'audio/wav'}})));
    let serial=0;const frames=new Map<number,FrameRequestCallback>();vi.mocked(requestAnimationFrame).mockImplementation(callback=>{frames.set(++serial,callback);return serial;});
    output=new VoiceOutput();const firstLevel=vi.fn(),secondLevel=vi.fn();const first=output.speak('Un','fr',{onLevel:firstLevel});await flush();const stale=frames.get(serial)!;
    const second=output.speak('Deux','fr',{onLevel:secondLevel});await flush();const current=serial;stale(0);output.stop();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(current);expect(firstLevel).not.toHaveBeenCalled();expect(secondLevel).not.toHaveBeenCalled();await Promise.all([first,second]);
  });

  it('stops metering immediately when a level callback cancels playback',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(128),{headers:{'content-type':'audio/wav'}})));
    let frame!:FrameRequestCallback;vi.mocked(requestAnimationFrame).mockImplementation(callback=>{frame=callback;return 1;});
    output=new VoiceOutput();const playback=output.speak('Arrêt','fr',{onLevel:()=>output!.stop()});await flush();frame(0);
    await expect(playback).resolves.toBe('cancelled');expect(requestAnimationFrame).toHaveBeenCalledOnce();
  });

  it('reports terminal output failure in Arabic for an Arabic UI',async()=>{
    vi.stubGlobal('window',{});output=new VoiceOutput();output.setServerTtsAvailable(false);const onError=vi.fn();
    await expect(output.speak('مرحبا','ar-TN',{onError})).resolves.toBe('unavailable');expect(onError.mock.calls[0][0]).toContain('تعذّر إخراج الرد');
  });

});
