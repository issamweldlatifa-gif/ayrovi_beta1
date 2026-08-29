import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';

describe('AYROVI Realtime Voice Transport & Session Subsystem', () => {
  it('initializes real-time voice session with verified voice configs and VAD parameters', async () => {
    const res = await request(app)
      .post('/api/voice/session')
      .set('x-session-id', 'sess_test_987654321')
      .send({ conversationId: 'conv_voice_001', voiceId: 'ayrovi-warm-01' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBe('sess_test_987654321');
    expect(res.body.data.conversationId).toBe('conv_voice_001');
    expect(res.body.data.voice.id).toBe('ayrovi-warm-01');
    expect(res.body.data.voice.gender).toBe('female');
    expect(res.body.data.turnDetection.type).toBe('client_vad');
    expect(res.body.data.turnDetection.silenceDurationMs).toBe(650);
    expect(res.body.data.capabilities.vision).toBe(true);
    expect(res.body.data.capabilities.pricingCalculator).toBe(true);
    expect(res.body.data.capabilities.orderTracking).toBe(true);
    expect(res.body.data.capabilities.instantBargeIn).toBe(true);
  });

  it('provides available voices list and audio input specifications', async () => {
    const res = await request(app)
      .get('/api/voice/config')
      .set('x-session-id', 'sess_test_11223344');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.availableVoices.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.audioInput.sampleRate).toBe(48000);
    expect(res.body.data.audioInput.echoCancellation).toBe(true);
    expect(res.body.data.audioInput.noiseSuppression).toBe(true);
  });

  it('supports alternative voice selection (e.g. Masculin)', async () => {
    const res = await request(app)
      .post('/api/assistant/voice/session')
      .set('x-session-id', 'sess_test_99887766')
      .send({ conversationId: 'conv_voice_002', voiceId: 'ayrovi-calm-02' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.voice.id).toBe('ayrovi-calm-02');
    expect(res.body.data.voice.gender).toBe('male');
  });

  it('recognizes voice stop and interruption commands in Arabic, Tunisian, and French', () => {
    const stopRegex = /^(?:توقف|استنى|اسكت|وقف|بس|يزي|كافي|stop|attends|pause|tais-toi|arrete|arrête|shut up)[\s.!؟]*$/i;

    expect(stopRegex.test('توقف')).toBe(true);
    expect(stopRegex.test('اسكت !')).toBe(true);
    expect(stopRegex.test('استنى')).toBe(true);
    expect(stopRegex.test('وقف')).toBe(true);
    expect(stopRegex.test('يزي')).toBe(true);
    expect(stopRegex.test('stop')).toBe(true);
    expect(stopRegex.test('attends')).toBe(true);
    expect(stopRegex.test('arrête !')).toBe(true);

    // Regular queries should NOT trigger stop
    expect(stopRegex.test('احسبلي سوم هذا')).toBe(false);
    expect(stopRegex.test('combien coûte la livraison')).toBe(false);
  });
});
