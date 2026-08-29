import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import {
  normalizeGeminiAudio,
  pcm16leToWav,
  resetGeminiTtsRuntimeState,
} from '../src/assistant/geminiLive';
import { resetGeminiLiveTranscriptionRuntimeState } from '../src/assistant/geminiRealtime';

afterEach(() => {
  resetGeminiTtsRuntimeState();
  resetGeminiLiveTranscriptionRuntimeState();
  vi.unstubAllGlobals();
});

describe('AYROVI voice transport and session subsystem', () => {
  it('initializes a hybrid voice session with verified voice configs and client VAD parameters', async () => {
    const res = await request(app)
      .post('/api/voice/session')
      .set('x-session-id', 'sess_test_987654321')
      .send({ conversationId: 'conv_voice_001', voiceId: 'Aoede' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBe('sess_test_987654321');
    expect(res.body.data.conversationId).toBe('conv_voice_001');
    expect(res.body.data.provider).toBe('gemini-tts');
    expect(res.body.data.voice.id).toBe('Aoede');
    expect(res.body.data.voice.gender).toBe('female');
    expect(res.body.data.turnDetection.type).toBe('client_vad');
    expect(res.body.data.turnDetection.silenceDurationMs).toBe(650);
    expect(res.body.data.capabilities.vision).toBe(true);
    expect(res.body.data.capabilities.pricingCalculator).toBe(true);
    expect(res.body.data.capabilities.orderTracking).toBe(true);
    expect(res.body.data.capabilities.instantBargeIn).toBe(true);
  });

  it('reports the MediaRecorder input format actually used by the browser', async () => {
    const res = await request(app)
      .get('/api/voice/config')
      .set('x-session-id', 'sess_test_11223344');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.availableVoices.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.audioInput.format).toBe('webm_opus');
    expect(res.body.data.audioInput.sampleRate).toBe(48000);
    expect(res.body.data.audioInput.echoCancellation).toBe(true);
    expect(res.body.data.audioInput.noiseSuppression).toBe(true);
  });

  it('supports alternative voice selection (e.g. Masculin - Puck)', async () => {
    const res = await request(app)
      .post('/api/assistant/voice/session')
      .set('x-session-id', 'sess_test_99887766')
      .send({ conversationId: 'conv_voice_002', voiceId: 'Puck' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.voice.id).toBe('Puck');
    expect(res.body.data.voice.gender).toBe('male');
  });

  it('keeps the legacy /api/voice/live-audio route reachable instead of returning 404', async () => {
    const previous = {
      mode: process.env.ASSISTANT_TTS_MODE,
      gemini: process.env.GEMINI_API_KEY,
      google: process.env.GOOGLE_API_KEY,
      openai: process.env.OPENAI_API_KEY,
    };
    process.env.ASSISTANT_TTS_MODE = 'auto';
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const session = await request(app)
        .post('/api/voice/session')
        .set('x-session-id', 'sess_voice_capability_001')
        .send({ conversationId: 'conv_voice_capability_001', voiceId: 'Aoede' });
      expect(session.status).toBe(200);
      expect(session.body.data.capabilities.serverTextToSpeech).toBe(false);

      const res = await request(app)
        .post('/api/voice/live-audio')
        .set('x-session-id', 'sess_voice_route_001')
        .send({ text: 'مرحبا' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: false,
        code: 'SERVER_TTS_UNAVAILABLE',
        fallbackToClient: true,
      });
    } finally {
      if (previous.mode === undefined) delete process.env.ASSISTANT_TTS_MODE;
      else process.env.ASSISTANT_TTS_MODE = previous.mode;
      if (previous.gemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous.gemini;
      if (previous.google === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = previous.google;
      if (previous.openai === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous.openai;
    }
  });

  it('defaults to browser-only output even while a Gemini key remains configured', async () => {
    const previousMode = process.env.ASSISTANT_TTS_MODE;
    const previousGemini = process.env.GEMINI_API_KEY;
    delete process.env.ASSISTANT_TTS_MODE;
    process.env.GEMINI_API_KEY = 'configured-but-paused';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    try {
      const status = await request(app).get('/api/assistant/status');
      expect(status.status).toBe(200);
      expect(status.body.data).toMatchObject({
        speechToTextReady: expect.any(Boolean),
        serverTextToSpeechReady: false,
        clientSpeechFallback: true,
        ttsMode: 'browser',
        geminiTtsReady: false,
      });

      const session = await request(app)
        .get('/api/voice/config')
        .set('x-session-id', 'sess_browser_tts_mode_001');
      expect(session.body.data.capabilities.serverTextToSpeech).toBe(false);

      const tts = await request(app)
        .post('/api/assistant/voice/tts')
        .set('x-session-id', 'sess_browser_tts_mode_001')
        .send({ text: 'مرحبا', voice: 'Aoede' });
      expect(tts.status).toBe(200);
      expect(tts.body).toMatchObject({
        success: false,
        code: 'SERVER_TTS_DISABLED',
        fallbackToClient: true,
      });
      const stream = await request(app)
        .post('/api/assistant/voice/tts-stream')
        .set('x-session-id', 'sess_browser_tts_mode_001')
        .send({ text: 'مرحبا', voice: 'Aoede' });
      expect(stream.status).toBe(200);
      expect(stream.body).toMatchObject({
        success: false,
        code: 'SERVER_TTS_DISABLED',
        fallbackToClient: true,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (previousMode === undefined) delete process.env.ASSISTANT_TTS_MODE;
      else process.env.ASSISTANT_TTS_MODE = previousMode;
      if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousGemini;
    }
  });

  it('opens one quota circuit on Gemini HTTP 429 and does not retry subsequent TTS requests', async () => {
    const previous = {
      mode: process.env.ASSISTANT_TTS_MODE,
      gemini: process.env.GEMINI_API_KEY,
      google: process.env.GOOGLE_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      cooldown: process.env.GEMINI_TTS_QUOTA_COOLDOWN_MS,
    };
    process.env.ASSISTANT_TTS_MODE = 'auto';
    process.env.GEMINI_API_KEY = 'quota-test-key';
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.GEMINI_TTS_QUOTA_COOLDOWN_MS = '3600000';
    resetGeminiTtsRuntimeState();

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded' },
    }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      for (const text of ['الطلب الأول', 'الطلب الثاني']) {
        const response = await request(app)
          .post('/api/assistant/voice/tts')
          .set('x-session-id', 'sess_tts_quota_guard_001')
          .send({ text, voice: 'Aoede' });
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: false,
          code: 'SERVER_TTS_UNAVAILABLE',
          fallbackToClient: true,
          debugCode: 'TTS_QUOTA_EXCEEDED',
        });
        expect(response.body).not.toHaveProperty('error');
        expect(response.body.retryAt).toEqual(expect.any(String));
      }

      expect(fetchMock).toHaveBeenCalledOnce();
      const status = await request(app).get('/api/assistant/status');
      expect(status.body.data).toMatchObject({
        ttsMode: 'auto',
        serverTextToSpeechReady: false,
        geminiTtsReady: false,
        ttsRuntime: {
          provider: 'gemini',
          model: 'gemini-3.1-flash-tts-preview',
          endpoint: 'generativelanguage.googleapis.com/v1beta/models/:generateContent',
          state: 'quota_exceeded',
          debugCode: 'TTS_QUOTA_EXCEEDED',
        },
      });
    } finally {
      resetGeminiTtsRuntimeState();
      if (previous.mode === undefined) delete process.env.ASSISTANT_TTS_MODE;
      else process.env.ASSISTANT_TTS_MODE = previous.mode;
      if (previous.gemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous.gemini;
      if (previous.google === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = previous.google;
      if (previous.openai === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous.openai;
      if (previous.cooldown === undefined) delete process.env.GEMINI_TTS_QUOTA_COOLDOWN_MS;
      else process.env.GEMINI_TTS_QUOTA_COOLDOWN_MS = previous.cooldown;
    }
  });

  it('wraps Gemini raw 24 kHz PCM in a valid WAV response before browser playback', async () => {
    const previousMode = process.env.ASSISTANT_TTS_MODE;
    const previousKey = process.env.GEMINI_API_KEY;
    const previousModel = process.env.GEMINI_TTS_MODEL;
    process.env.ASSISTANT_TTS_MODE = 'auto';
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    process.env.GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
    const rawPcm = Buffer.alloc(960);
    for (let offset = 0; offset < rawPcm.length; offset += 2) rawPcm.writeInt16LE((offset * 31) % 32767, offset);

    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            inlineData: {
              data: rawPcm.toString('base64'),
              mimeType: 'audio/L16;codec=pcm;rate=24000',
            },
          }],
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const res = await request(app)
        .post('/api/assistant/voice/tts')
        .set('x-session-id', 'sess_voice_tts_001')
        .send({ text: 'أهلاً بك في أيروفي', voice: 'Aoede' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('audio/wav');
      expect(res.headers['x-voice-provider']).toBe('gemini-tts');
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.toString('ascii', 0, 4)).toBe('RIFF');
      expect(res.body.toString('ascii', 8, 12)).toBe('WAVE');
      expect(res.body.readUInt32LE(24)).toBe(24000);
      expect(res.body.subarray(44)).toEqual(rawPcm);
      expect(String(fetchMock.mock.calls[0][0])).toContain('gemini-3.1-flash-tts-preview:generateContent');
      expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'gemini-test-key' });
    } finally {
      if (previousMode === undefined) delete process.env.ASSISTANT_TTS_MODE;
      else process.env.ASSISTANT_TTS_MODE = previousMode;
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
      if (previousModel === undefined) delete process.env.GEMINI_TTS_MODEL;
      else process.env.GEMINI_TTS_MODEL = previousModel;
    }
  });

  it('mints only a single-use constrained Live Transcribe token and never exposes the long-lived key', async () => {
    const previous = {
      mode: process.env.ASSISTANT_REALTIME_TRANSCRIPTION,
      key: process.env.GEMINI_API_KEY,
      google: process.env.GOOGLE_API_KEY,
      model: process.env.GEMINI_LIVE_TRANSCRIBE_MODEL,
    };
    process.env.ASSISTANT_REALTIME_TRANSCRIPTION = 'auto';
    process.env.GEMINI_API_KEY = 'long-lived-server-key-must-not-leak';
    delete process.env.GOOGLE_API_KEY;
    process.env.GEMINI_LIVE_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe-live';
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ name: 'auth_tokens/ephemeral-one-use' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const response = await request(app)
        .post('/api/assistant/voice/live-token')
        .set('x-session-id', 'sess_live_token_security_001')
        .send({});

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toMatchObject({
        success: true,
        data: {
          token: 'auth_tokens/ephemeral-one-use',
          model: 'gemini-3.5-transcribe-live',
          websocketUrl: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained',
          setup: {
            setup: {
              model: 'models/gemini-3.5-transcribe-live',
              generationConfig: { responseModalities: ['TEXT'] },
            },
          },
        },
      });
      expect(JSON.stringify(response.body)).not.toContain('long-lived-server-key-must-not-leak');
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(String(fetchMock.mock.calls[0][0])).toBe('https://generativelanguage.googleapis.com/v1beta/auth_tokens');
      expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
        'x-goog-api-key': 'long-lived-server-key-must-not-leak',
      });
      const tokenRequest = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
      expect(tokenRequest).toMatchObject({
        uses: 1,
        liveConnectConstraints: {
          model: 'models/gemini-3.5-transcribe-live',
          config: {
            responseModalities: ['TEXT'],
            inputAudioTranscription: { languageCodes: [], mode: 'VERBATIM' },
          },
        },
      });
      expect(tokenRequest.liveConnectConstraints.config).not.toHaveProperty('tools');
      expect(tokenRequest.liveConnectConstraints.config).not.toHaveProperty('systemInstruction');

      const shell = await request(app).get('/api/health');
      expect(shell.headers['content-security-policy']).toContain(
        "connect-src 'self' wss://generativelanguage.googleapis.com",
      );
    } finally {
      if (previous.mode === undefined) delete process.env.ASSISTANT_REALTIME_TRANSCRIPTION;
      else process.env.ASSISTANT_REALTIME_TRANSCRIPTION = previous.mode;
      if (previous.key === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous.key;
      if (previous.google === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = previous.google;
      if (previous.model === undefined) delete process.env.GEMINI_LIVE_TRANSCRIBE_MODEL;
      else process.env.GEMINI_LIVE_TRANSCRIBE_MODEL = previous.model;
    }
  });

  it('rejects Live token requests without a valid browser session before calling Gemini', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await request(app).post('/api/assistant/voice/live-token').send({});
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, code: 'VOICE_SESSION_REQUIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens a Live Transcribe quota circuit after one 429 and fails closed to batch STT', async () => {
    const previous = {
      mode: process.env.ASSISTANT_REALTIME_TRANSCRIPTION,
      key: process.env.GEMINI_API_KEY,
      google: process.env.GOOGLE_API_KEY,
      cooldown: process.env.GEMINI_LIVE_QUOTA_COOLDOWN_MS,
    };
    process.env.ASSISTANT_REALTIME_TRANSCRIPTION = 'auto';
    process.env.GEMINI_API_KEY = 'live-quota-test-key';
    delete process.env.GOOGLE_API_KEY;
    process.env.GEMINI_LIVE_QUOTA_COOLDOWN_MS = '3600000';
    resetGeminiLiveTranscriptionRuntimeState();
    const fetchMock = vi.fn(async () => new Response('{}', {
      status: 429,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      for (const suffix of ['001', '002']) {
        const response = await request(app)
          .post('/api/assistant/voice/live-token')
          .set('x-session-id', `sess_live_quota_${suffix}`)
          .send({});
        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({
          success: false,
          code: 'LIVE_TRANSCRIPTION_QUOTA_EXCEEDED',
          fallbackToBatch: true,
          retryAt: expect.any(String),
        });
        expect(response.body).not.toHaveProperty('error');
      }
      expect(fetchMock).toHaveBeenCalledOnce();

      const status = await request(app).get('/api/assistant/status');
      expect(status.body.data).toMatchObject({
        reasoningProvider: 'anthropic',
        voiceProvidersAreReasoningAgents: false,
        liveTranscriptionReady: false,
        liveTranscriptionRuntime: {
          provider: 'gemini',
          purpose: 'transcription-only',
          model: 'gemini-3.5-transcribe-live',
          state: 'quota_exceeded',
          debugCode: 'LIVE_TRANSCRIPTION_QUOTA_EXCEEDED',
        },
      });
    } finally {
      resetGeminiLiveTranscriptionRuntimeState();
      if (previous.mode === undefined) delete process.env.ASSISTANT_REALTIME_TRANSCRIPTION;
      else process.env.ASSISTANT_REALTIME_TRANSCRIPTION = previous.mode;
      if (previous.key === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous.key;
      if (previous.google === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = previous.google;
      if (previous.cooldown === undefined) delete process.env.GEMINI_LIVE_QUOTA_COOLDOWN_MS;
      else process.env.GEMINI_LIVE_QUOTA_COOLDOWN_MS = previous.cooldown;
    }
  });

  it('never retries streaming Gemini TTS after the first 429 and preserves browser fallback', async () => {
    const previous = {
      mode: process.env.ASSISTANT_TTS_MODE,
      key: process.env.GEMINI_API_KEY,
      google: process.env.GOOGLE_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      cooldown: process.env.GEMINI_TTS_QUOTA_COOLDOWN_MS,
    };
    process.env.ASSISTANT_TTS_MODE = 'auto';
    process.env.GEMINI_API_KEY = 'stream-quota-test-key';
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.GEMINI_TTS_QUOTA_COOLDOWN_MS = '3600000';
    resetGeminiTtsRuntimeState();
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response('{}', {
      status: 429,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      for (const suffix of ['001', '002']) {
        const response = await request(app)
          .post('/api/assistant/voice/tts-stream')
          .set('x-session-id', `sess_stream_quota_${suffix}`)
          .send({ text: `رد محفوظ ${suffix}`, voice: 'Aoede' });
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: false,
          code: 'SERVER_TTS_UNAVAILABLE',
          fallbackToClient: true,
          debugCode: 'TTS_QUOTA_EXCEEDED',
          retryAt: expect.any(String),
        });
      }
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      resetGeminiTtsRuntimeState();
      if (previous.mode === undefined) delete process.env.ASSISTANT_TTS_MODE;
      else process.env.ASSISTANT_TTS_MODE = previous.mode;
      if (previous.key === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous.key;
      if (previous.google === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = previous.google;
      if (previous.openai === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous.openai;
      if (previous.cooldown === undefined) delete process.env.GEMINI_TTS_QUOTA_COOLDOWN_MS;
      else process.env.GEMINI_TTS_QUOTA_COOLDOWN_MS = previous.cooldown;
    }
  });

  it('proxies Gemini streaming TTS as one ordered cancellable PCM response', async () => {
    const previous = {
      mode: process.env.ASSISTANT_TTS_MODE,
      key: process.env.GEMINI_API_KEY,
      google: process.env.GOOGLE_API_KEY,
      openai: process.env.OPENAI_API_KEY,
    };
    process.env.ASSISTANT_TTS_MODE = 'auto';
    process.env.GEMINI_API_KEY = 'streaming-tts-test-key';
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    resetGeminiTtsRuntimeState();
    const first = Buffer.from([0, 0, 1, 0, 2, 0, 3, 0]);
    const second = Buffer.from([4, 0, 5, 0, 6, 0, 7, 0]);
    const sse = [first, second].map((chunk) => `data: ${JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: {
        data: chunk.toString('base64'),
        mimeType: 'audio/L16;codec=pcm;rate=24000',
      } }] } }],
    })}\n\n`).join('');
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(sse, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const response = await request(app)
        .post('/api/assistant/voice/tts-stream')
        .set('x-session-id', 'sess_streaming_tts_001')
        .send({ text: 'هذه إجابة كلود النهائية.', voice: 'Aoede' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('audio/L16');
      expect(response.headers['x-voice-provider']).toBe('gemini-tts-stream');
      expect(response.headers['x-audio-sample-rate']).toBe('24000');
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(response.body).toEqual(Buffer.concat([first, second]));
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(String(fetchMock.mock.calls[0][0])).toContain('gemini-3.1-flash-tts-preview:streamGenerateContent?alt=sse');
      const providerBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
      expect(providerBody.contents[0].parts[0].text).toContain('هذه إجابة كلود النهائية.');
      expect(providerBody.generationConfig.responseModalities).toEqual(['AUDIO']);
      expect(providerBody).not.toHaveProperty('tools');
    } finally {
      if (previous.mode === undefined) delete process.env.ASSISTANT_TTS_MODE;
      else process.env.ASSISTANT_TTS_MODE = previous.mode;
      if (previous.key === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previous.key;
      if (previous.google === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = previous.google;
      if (previous.openai === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous.openai;
    }
  });

  it('normalizes headerless PCM and preserves an existing WAV container', () => {
    const pcm = Buffer.from([0, 0, 1, 0, 255, 127, 0, 128]);
    const normalized = normalizeGeminiAudio(pcm, 'audio/pcm;rate=24000');
    expect(normalized?.mimeType).toBe('audio/wav');
    expect(normalized?.audioBuffer.toString('ascii', 0, 4)).toBe('RIFF');
    expect(normalized?.audioBuffer.readUInt32LE(24)).toBe(24000);

    const wav = pcm16leToWav(pcm, 16000, 1);
    expect(normalizeGeminiAudio(wav, 'audio/wav')?.audioBuffer).toEqual(wav);
  });

  it('recognizes voice stop commands without matching normal questions', () => {
    const stopRegex = /^(?:توقف|استنى|اسكت|وقف|بس|يزي|كافي|stop|attends|pause|tais-toi|arrete|arrête|shut up)[\s.!؟]*$/i;
    for (const command of ['توقف', 'اسكت !', 'استنى', 'وقف', 'يزي', 'stop', 'attends', 'arrête !']) {
      expect(stopRegex.test(command)).toBe(true);
    }
    expect(stopRegex.test('احسبلي سوم هذا')).toBe(false);
    expect(stopRegex.test('combien coûte la livraison')).toBe(false);
  });

  it('streams audible text response over SSE for voice queries', async () => {
    const res = await request(app)
      .post('/api/assistant/chat')
      .set('x-session-id', 'sess_voice_test_77')
      .send({
        conversationId: 'conv_voice_stream_01',
        messages: [{ role: 'user', text: 'احسبلي سوم هذا 50 يورو' }],
        state: {},
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('data:');
    expect(res.text).toContain('التكلفة التقديرية بالدينار التونسي');
  });
});
