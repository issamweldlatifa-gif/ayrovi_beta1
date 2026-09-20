import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { transcribeMock } = vi.hoisted(() => ({
  transcribeMock: vi.fn(async (_input: { audio: Blob; signal?: AbortSignal }) => ({ text: 'مرحبا أيروفي' })),
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
  onstart: (() => void) | null = null;
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
    speak: vi.fn((utterance: FakeUtterance) => utterance.onstart?.()),
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
  transcribeMock.mockReset().mockResolvedValue({text:'مرحبا أيروفي'});
});

afterEach(() => {
  controller?.stop();
  controller = null;
  vi.useRealTimers();
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
  it('releases a granted microphone immediately while readiness is still pending', async () => {
    let ready!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { ready = resolve; }));
    const voice = makeController(); const startup = voice.start('');
    await flush(); expect(stream.track.enabled).toBe(false);
    voice.stop(); expect(stream.track.stop).toHaveBeenCalledOnce();
    ready(new Response(JSON.stringify({ data: { serverTextToSpeechReady: false } })));
    expect(await startup).toBe(false); expect(stream.track.stop).toHaveBeenCalledOnce();
  });

  it('stops a permission grant that arrives after exit without waiting for readiness', async () => {
    let grant!: (stream: MediaStream) => void, ready!: (response: Response) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(() => new Promise(resolve => { grant = resolve; }));
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { ready = resolve; }));
    const voice = makeController(); const startup = voice.start(''); voice.stop();
    grant(stream as unknown as MediaStream); await flush();
    expect(stream.track.stop).toHaveBeenCalledOnce();
    ready(new Response('{}')); expect(await startup).toBe(false);
  });

  it('a late context resume cannot overwrite or release a newer audio graph', async () => {
    let resume!: () => void;
    const contexts: FakeAudioContext[] = [];
    class DelayedContext extends FakeAudioContext {
      constructor() { super(); contexts.push(this); if (contexts.length === 2) { this.state = 'suspended'; this.resume = vi.fn(() => new Promise<void>(resolve => { resume = resolve; })); } }
    }
    window.AudioContext = DelayedContext as unknown as typeof AudioContext;
    const voice = makeController(); const first = voice.start(''); await flush();
    const nextStream = new FakeStream();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(nextStream as unknown as MediaStream);
    expect(await voice.start('')).toBe(true); const graph = (voice as any).analyser;
    resume(); expect(await first).toBe(false);
    expect((voice as any).analyser).toBe(graph); expect(nextStream.track.stop).not.toHaveBeenCalled();
    expect(contexts[1].createMediaStreamSource).not.toHaveBeenCalled();
  });

  it('resumes listening without a false playback error for a control-tag-only reply', async () => {
    const voice=makeController();await voice.start('');await voice.speak(' [[OPEN_LENS]] ', 'fr');
    expect(voice.getState()).toBe('listening');expect(speechSynthesis.speak).not.toHaveBeenCalled();
    expect((voice as any).options.onError).not.toHaveBeenCalled();
  });

  it('late discarded stop cannot erase the next capture buffer', async () => {
    const voice=makeController(); await voice.start('');
    const previous=FakeRecorder.instances[0];
    previous.stop.mockImplementation(()=>{ previous.state='inactive'; });
    voice.setMuted(true); voice.setMuted(false); await flush();
    const current=FakeRecorder.instances[1]; expect(current).toBeTruthy();
    current.emitChunk(300,42);
    await new Promise(resolve=>setTimeout(resolve,850));
    const audio=await (voice as any).stopCapture(false) as Blob;
    expect(audio.size).toBe(480);
    expect(new Uint8Array(await audio.arrayBuffer())[0]).toBe(42);
  });
  it('delayed old recorder error cannot kill the replacement', async () => {
    const voice=makeController(); await voice.start('');
    const oldError=FakeRecorder.instances[0].onerror!;
    voice.setMuted(true);voice.setMuted(false);await flush();
    expect(FakeRecorder.instances).toHaveLength(2);
    oldError();
    expect(voice.getState()).toBe('listening');
    expect(stream.track.stop).not.toHaveBeenCalled();
  });
  it('late turn finalization cannot disable a restarted microphone', async () => {
    const voice=makeController(); await voice.start('');
    const recorder=FakeRecorder.instances[0];
    recorder.stop.mockImplementation(()=>{ recorder.state='inactive'; });
    (voice as any).state='user_speaking';
    (voice as any).speechStartedAt=performance.now()-1000;
    const pending=(voice as any).finishUserTurn();
    voice.stop(); const next=new FakeStream();
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(next as unknown as MediaStream);
    await voice.start(''); expect(next.track.enabled).toBe(true);
    await pending;
    expect(next.track.enabled).toBe(true);
  });

  it('muting during final flush cancels the pending turn and unmute resumes', async () => {
    const voice=makeController();await voice.start('');
    FakeRecorder.instances[0].stop.mockImplementation(()=>{FakeRecorder.instances[0].state='inactive';});
    (voice as any).state='user_speaking';(voice as any).speechStartedAt=performance.now()-700;
    voice.forceFinishTurn();voice.setMuted(true);voice.setMuted(false);await flush();
    expect(voice.getState()).toBe('listening');expect(stream.track.enabled).toBe(true);expect(transcribeMock).not.toHaveBeenCalled();
  });

  it('resuming input explicitly cancels transcription even when transport ignores abort', async () => {
    let reply!:(value:{text:string})=>void;transcribeMock.mockImplementation(()=>new Promise(resolve=>{reply=resolve;}));
    const voice=makeController();await voice.start('');
    (voice as any).state='user_speaking';(voice as any).speechStartedAt=performance.now()-700;voice.forceFinishTurn();await flush();
    const signal=transcribeMock.mock.calls[0][0].signal!;voice.resumeListening();await flush();expect(signal.aborted).toBe(true);
    reply({text:'STALE'});await flush();expect(turns).toEqual([]);expect(voice.getState()).toBe('listening');
  });

  it('times out hung transcription, stays muted, then resumes without a stuck flag', async () => {
    vi.useFakeTimers();let reply!:(value:{text:string})=>void;transcribeMock.mockImplementation(()=>new Promise(resolve=>{reply=resolve;}));
    const voice=makeController();await voice.start('');
    (voice as any).state='user_speaking';(voice as any).speechStartedAt=performance.now()-700;voice.forceFinishTurn();await vi.advanceTimersByTimeAsync(0);
    voice.setMuted(true);expect(transcribeMock.mock.calls[0][0].signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);expect(voice.getState()).toBe('muted');expect((voice as any).options.onError).toHaveBeenCalledOnce();
    expect((voice as any).options.onError.mock.calls[0][0]).toContain('مهلة');voice.setMuted(false);await vi.advanceTimersByTimeAsync(0);
    expect(voice.getState()).toBe('listening');reply({text:'LATE'});await vi.advanceTimersByTimeAsync(0);expect(turns).toEqual([]);
  });

  it('an unmute continuation cannot reopen input while a newer response starts', async () => {
    const voice=makeController();await voice.start('');voice.setMuted(false);expect(FakeRecorder.instances).toHaveLength(1);
    voice.setMuted(true);voice.setMuted(false);const playback=voice.speak('Réponse','fr');await flush();
    expect(FakeRecorder.instances).toHaveLength(1);expect(stream.track.enabled).toBe(false);expect(voice.getState()).toBe('speaking');
    (speechSynthesis.speak.mock.calls[0][0] as FakeUtterance).onend?.();await playback;expect(voice.getState()).toBe('listening');
  });

  it('fails safely at the upload budget and a mute toggle cannot hide the device failure',async()=>{
    const voice=makeController();await voice.start('');FakeRecorder.instances[0].emitChunk(12*1024*1024+1);
    expect(voice.getState()).toBe('error');expect(stream.track.stop).toHaveBeenCalledOnce();expect(transcribeMock).not.toHaveBeenCalled();
    voice.setMuted(true);voice.setMuted(false);expect(voice.getState()).toBe('error');
  });

  it('an old VAD animation cannot monitor or schedule work in a new lifecycle',async()=>{
    const frames:FrameRequestCallback[]=[];vi.mocked(requestAnimationFrame).mockImplementation(callback=>{frames.push(callback);return frames.length;});
    const voice=makeController();await voice.start('');const previous=frames[0];await voice.start('');
    const calls=(voice as any).options.onLevel.mock.calls.length;previous(0);
    expect(frames).toHaveLength(2);expect((voice as any).options.onLevel.mock.calls).toHaveLength(calls);
  });

});
