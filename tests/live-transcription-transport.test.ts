import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveTranscriptionTransport } from '../client/src/components/assistant/voice/LiveTranscriptionTransport';

const bootstrap = {
  token: 'auth_tokens/one use+token',
  model: 'gemini-3.5-transcribe-live',
  websocketUrl: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained',
  expiresAt: '2026-08-29T13:00:00.000Z',
  setup: {
    setup: {
      model: 'models/gemini-3.5-transcribe-live',
      generationConfig: { responseModalities: ['TEXT'] as ['TEXT'] },
      inputAudioTranscription: {
        languageCodes: [],
        customVocabulary: ['AYROVI', 'AYROVIX'],
        mode: 'VERBATIM' as const,
      },
    },
  },
};

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = FakeSocket.CONNECTING;
  bufferedAmount = 0;
  sent: string[] = [];
  close = vi.fn(() => { this.readyState = FakeSocket.CLOSED; });
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(public readonly url: string) {}

  send(value: string) {
    if (this.readyState !== FakeSocket.OPEN) throw new Error('socket is not open');
    this.sent.push(value);
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  message(value: object) {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent);
  }

  remoteClose() {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code: 1006 } as CloseEvent);
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
let sockets: FakeSocket[];
let transport: LiveTranscriptionTransport | null;

beforeEach(() => {
  sockets = [];
  transport = null;
  vi.stubGlobal('window', {
    localStorage: {
      getItem: vi.fn(() => 'live-transport-session-001'),
      setItem: vi.fn(),
    },
  });
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: bootstrap }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })));
});

afterEach(() => {
  transport?.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function connect(callbacks: ConstructorParameters<typeof LiveTranscriptionTransport>[0] = {}) {
  transport = new LiveTranscriptionTransport(callbacks, (url) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket as unknown as WebSocket;
  });
  const connecting = transport.connect();
  await flush();
  expect(sockets).toHaveLength(1);
  sockets[0].open();
  await flush();
  expect(JSON.parse(sockets[0].sent[0])).toEqual(bootstrap.setup);
  sockets[0].message({ setupComplete: {} });
  await expect(connecting).resolves.toBe(true);
  return { transport, socket: sockets[0] };
}

describe('Gemini Live Transcribe browser transport', () => {
  it('uses only the backend-minted constrained token and sends raw 16 kHz PCM', async () => {
    const { transport: live, socket } = await connect();
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/assistant/voice/live-token', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      headers: expect.objectContaining({ 'x-session-id': 'live-transport-session-001' }),
    }));
    expect(socket.url).toBe(`${bootstrap.websocketUrl}?access_token=auth_tokens%2Fone%20use%2Btoken`);
    expect(socket.url).not.toContain('long-lived');

    expect(live.beginTurn()).toBe(true);
    const pcm = new Int16Array([0, 1, -1, 32767, -32768]);
    expect(live.sendPcm16(pcm.buffer)).toBe(true);
    const audioMessage = JSON.parse(socket.sent.at(-1)!);
    expect(audioMessage).toEqual({
      realtimeInput: {
        audio: {
          data: Buffer.from(pcm.buffer).toString('base64'),
          mimeType: 'audio/pcm;rate=16000',
        },
      },
    });
    expect(JSON.stringify(socket.sent)).not.toContain('clientContent');
    expect(JSON.stringify(socket.sent)).not.toContain('tools');
  });

  it('exposes interim text for display but resolves exactly one finalized transcript', async () => {
    const interim = vi.fn();
    const { transport: live, socket } = await connect({ onInterim: interim });
    expect(live.beginTurn()).toBe(true);
    live.sendPcm16(new Int16Array(1_600).buffer);

    socket.message({ serverContent: { interimInputTranscription: { text: 'احسبلي' } } });
    await flush();
    expect(interim).toHaveBeenCalledWith('احسبلي');

    const final = live.finishTurn();
    // A second finish cannot create another authoritative completion.
    await expect(live.finishTurn()).resolves.toBeNull();
    socket.message({
      serverContent: {
        inputTranscription: { text: 'احسبلي السعر بالدينار' },
        turnComplete: true,
      },
    });
    await expect(final).resolves.toBe('احسبلي السعر بالدينار');
    const endMessages = socket.sent
      .map((value) => JSON.parse(value))
      .filter((value) => value?.realtimeInput?.audioStreamEnd === true);
    expect(endMessages).toHaveLength(1);
  });

  it('drops PCM under WebSocket backpressure and immediately yields to the batch fallback', async () => {
    const { transport: live, socket } = await connect();
    expect(live.beginTurn()).toBe(true);
    socket.bufferedAmount = 300 * 1024;
    expect(live.sendPcm16(new Int16Array(1_600).buffer)).toBe(false);
    await expect(live.finishTurn()).resolves.toBeNull();
    expect(socket.sent.some((value) => value.includes('audioStreamEnd'))).toBe(false);
  });

  it('settles a pending turn as unavailable when the Live socket closes', async () => {
    const unavailable = vi.fn();
    const { transport: live, socket } = await connect({ onUnavailable: unavailable });
    live.beginTurn();
    live.sendPcm16(new Int16Array(1_600).buffer);
    const final = live.finishTurn();
    socket.remoteClose();
    await expect(final).resolves.toBeNull();
    expect(unavailable).toHaveBeenCalledOnce();
  });

  it('renews a go-away session between turns without replaying a transcript', async () => {
    const interim = vi.fn();
    const { transport: live, socket } = await connect({ onInterim: interim });
    socket.message({ goAway: { timeLeft: '30s' } });
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    expect(socket.close).toHaveBeenCalled();

    const replacement = sockets[1];
    replacement.open();
    await flush();
    replacement.message({ setupComplete: {} });
    await vi.waitFor(() => expect(live.ready).toBe(true));
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(interim).not.toHaveBeenCalledWith(expect.stringMatching(/\S/));
  });

  it('fails closed without opening a WebSocket when token bootstrap is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      success: false,
      code: 'LIVE_TRANSCRIPTION_QUOTA_EXCEEDED',
      fallbackToBatch: true,
    }), { status: 503, headers: { 'content-type': 'application/json' } })));
    transport = new LiveTranscriptionTransport({}, (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    });
    await expect(transport.connect()).resolves.toBe(false);
    expect(sockets).toHaveLength(0);
    expect(transport.ready).toBe(false);
  });
});
