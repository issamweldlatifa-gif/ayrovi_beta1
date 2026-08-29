import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import {
  normalizeGeminiAudio,
  pcm16leToWav,
  resetGeminiTtsRuntimeState,
} from '../src/assistant/geminiLive';

afterEach(() => {
  resetGeminiTtsRuntimeState();
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
