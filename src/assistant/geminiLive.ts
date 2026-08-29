import { getGeminiLiveTranscriptionRuntimeStatus } from './geminiRealtime';

/**
 * AYROVI voice session configuration and Gemini text-to-speech adapter.
 *
 * The REST TTS endpoint returns raw signed 16-bit little-endian PCM by default.
 * Browsers cannot reliably decode that byte stream with decodeAudioData(), so this
 * module always wraps raw PCM in a standards-compliant WAV container first.
 */

export interface GeminiVoiceSessionConfig {
  sessionId: string;
  conversationId: string;
  provider: 'gemini-tts';
  model: string;
  voice: {
    id: string;
    name: string;
    gender: 'female' | 'male';
    language: string;
  };
  availableVoices: Array<{
    id: string;
    name: string;
    gender: 'female' | 'male';
    description: string;
  }>;
  audioInput: {
    format: 'webm_opus';
    sampleRate: number;
    channelCount: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  };
  turnDetection: {
    type: 'client_vad';
    speechStartThreshold: number;
    silenceThreshold: number;
    silenceDurationMs: number;
    prefixPaddingMs: number;
  };
  capabilities: {
    vision: boolean;
    pricingCalculator: boolean;
    orderTracking: boolean;
    orderCreation: boolean;
    realtimeAudioStreaming: boolean;
    serverTextToSpeech: boolean;
    instantBargeIn: boolean;
  };
}

export const SUPPORTED_GEMINI_VOICES = [
  { id: 'Aoede', name: 'AYROVI Féminin (Aoede)', gender: 'female' as const, description: 'Voix féminine chaleureuse et naturelle' },
  { id: 'Kore', name: 'AYROVI Féminin Doux (Kore)', gender: 'female' as const, description: 'Voix féminine posée et claire' },
  { id: 'Puck', name: 'AYROVI Masculin (Puck)', gender: 'male' as const, description: 'Voix masculine énergique et dynamique' },
  { id: 'Fenrir', name: 'AYROVI Masculin Calme (Fenrir)', gender: 'male' as const, description: 'Voix masculine posée et professionnelle' },
  { id: 'Charon', name: 'AYROVI Masculin Profond (Charon)', gender: 'male' as const, description: 'Voix masculine profonde et rassurante' },
];

const DEFAULT_GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
const DEFAULT_PCM_SAMPLE_RATE = 24_000;
const MAX_TTS_TEXT_LENGTH = 4_096;
const MAX_GENERATED_AUDIO_BYTES = 24 * 1024 * 1024;
const DEFAULT_QUOTA_COOLDOWN_MS = 60 * 60 * 1_000;
const MIN_QUOTA_COOLDOWN_MS = 60_000;
const MAX_QUOTA_COOLDOWN_MS = 24 * 60 * 60 * 1_000;
const GEMINI_TTS_ENDPOINT = 'generativelanguage.googleapis.com/v1beta/models/:generateContent';
const GEMINI_TTS_STREAMING_ENDPOINT = 'generativelanguage.googleapis.com/v1beta/models/:streamGenerateContent';

export interface GeminiTtsRuntimeStatus {
  provider: 'gemini';
  model: string;
  endpoint: string;
  streamingEndpoint: string;
  transport: 'server-sse-pcm';
  state: 'disabled' | 'unconfigured' | 'ready' | 'quota_exceeded';
  debugCode?: 'TTS_QUOTA_EXCEEDED';
  lastFailureAt?: string;
  retryAt?: string;
}

let quotaBlockedUntil = 0;
let quotaLastFailureAt = 0;

function geminiTtsModel(): string {
  return process.env.GEMINI_TTS_MODEL?.trim()
    || process.env.GEMINI_VOICE_MODEL?.trim()
    || DEFAULT_GEMINI_TTS_MODEL;
}

/** Allow operations to select browser SpeechSynthesis without removing provider keys. */
export function serverTextToSpeechEnabled(): boolean {
  // Browser output is the safe temporary default while Gemini quota is paused.
  // Set ASSISTANT_TTS_MODE=auto to opt back into configured server providers.
  return (process.env.ASSISTANT_TTS_MODE?.trim().toLowerCase() || 'browser') === 'auto';
}

function geminiTtsKeyConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim());
}

function geminiQuotaCircuitOpen(now = Date.now()): boolean {
  return quotaBlockedUntil > now;
}

function configuredQuotaCooldownMs(): number {
  const configured = Number(process.env.GEMINI_TTS_QUOTA_COOLDOWN_MS || DEFAULT_QUOTA_COOLDOWN_MS);
  if (!Number.isFinite(configured)) return DEFAULT_QUOTA_COOLDOWN_MS;
  return Math.max(MIN_QUOTA_COOLDOWN_MS, Math.min(MAX_QUOTA_COOLDOWN_MS, Math.trunc(configured)));
}

function retryAfterMs(response: Response): number {
  const raw = response.headers.get('retry-after')?.trim();
  if (!raw) return configuredQuotaCooldownMs();
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(MIN_QUOTA_COOLDOWN_MS, Math.min(MAX_QUOTA_COOLDOWN_MS, Math.ceil(seconds * 1_000)));
  }
  const retryAt = Date.parse(raw);
  if (!Number.isFinite(retryAt)) return configuredQuotaCooldownMs();
  return Math.max(MIN_QUOTA_COOLDOWN_MS, Math.min(MAX_QUOTA_COOLDOWN_MS, retryAt - Date.now()));
}

function openGeminiQuotaCircuit(response: Response, model: string): void {
  const now = Date.now();
  quotaLastFailureAt = now;
  quotaBlockedUntil = Math.max(quotaBlockedUntil, now + retryAfterMs(response));
  console.warn(
    `[Gemini TTS] TTS_QUOTA_EXCEEDED status=429 model=${model} retryAt=${new Date(quotaBlockedUntil).toISOString()}`,
  );
}

export function getGeminiTtsRuntimeStatus(now = Date.now()): GeminiTtsRuntimeStatus {
  const base = {
    provider: 'gemini' as const,
    model: geminiTtsModel(),
    endpoint: GEMINI_TTS_ENDPOINT,
    streamingEndpoint: GEMINI_TTS_STREAMING_ENDPOINT,
    transport: 'server-sse-pcm' as const,
  };
  if (!serverTextToSpeechEnabled()) return { ...base, state: 'disabled' };
  if (!geminiTtsKeyConfigured()) return { ...base, state: 'unconfigured' };
  if (geminiQuotaCircuitOpen(now)) {
    return {
      ...base,
      state: 'quota_exceeded',
      debugCode: 'TTS_QUOTA_EXCEEDED',
      lastFailureAt: new Date(quotaLastFailureAt).toISOString(),
      retryAt: new Date(quotaBlockedUntil).toISOString(),
    };
  }
  return { ...base, state: 'ready' };
}

export function resetGeminiTtsRuntimeState(): void {
  quotaBlockedUntil = 0;
  quotaLastFailureAt = 0;
}

export function serverTextToSpeechReady(): boolean {
  if (!serverTextToSpeechEnabled()) return false;
  const geminiReady = getGeminiTtsRuntimeStatus().state === 'ready';
  return geminiReady || Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function createGeminiVoiceSession(
  conversationId: string,
  preferredVoiceId = 'Aoede',
  sessionId?: string,
): GeminiVoiceSessionConfig {
  const chosenVoice = SUPPORTED_GEMINI_VOICES.find((voice) => voice.id.toLowerCase() === preferredVoiceId.toLowerCase())
    || SUPPORTED_GEMINI_VOICES[0];

  return {
    sessionId: sessionId || `sess_gemini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    conversationId,
    provider: 'gemini-tts',
    model: geminiTtsModel(),
    voice: {
      id: chosenVoice.id,
      name: chosenVoice.name,
      gender: chosenVoice.gender,
      language: 'ar-TN,fr-FR,en-US',
    },
    availableVoices: SUPPORTED_GEMINI_VOICES,
    // The browser records an encoded MediaRecorder stream for Whisper fallback.
    // This is not a raw Gemini Live PCM input stream.
    audioInput: {
      format: 'webm_opus',
      sampleRate: 48_000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    turnDetection: {
      type: 'client_vad',
      speechStartThreshold: 0.18,
      silenceThreshold: 0.05,
      silenceDurationMs: 650,
      prefixPaddingMs: 300,
    },
    capabilities: {
      vision: true,
      pricingCalculator: true,
      orderTracking: true,
      orderCreation: true,
      // Dedicated Live Transcribe streams input; TTS streaming remains a
      // deterministic rendering transport and never owns assistant reasoning.
      realtimeAudioStreaming: getGeminiLiveTranscriptionRuntimeStatus().state === 'ready'
        || serverTextToSpeechReady(),
      serverTextToSpeech: serverTextToSpeechReady(),
      instantBargeIn: true,
    },
  };
}

/** Wrap raw mono/stereo signed PCM16 little-endian bytes in a RIFF/WAVE file. */
export function pcm16leToWav(
  input: Buffer,
  sampleRate = DEFAULT_PCM_SAMPLE_RATE,
  channelCount = 1,
): Buffer {
  const channels = Math.max(1, Math.min(2, Math.trunc(channelCount) || 1));
  const rate = Math.max(8_000, Math.min(192_000, Math.trunc(sampleRate) || DEFAULT_PCM_SAMPLE_RATE));
  const blockAlign = channels * 2;
  const usableLength = input.length - (input.length % blockAlign);
  const pcm = usableLength === input.length ? input : input.subarray(0, usableLength);
  const header = Buffer.alloc(44);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM fmt chunk length
  header.writeUInt16LE(1, 20); // Linear PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function looksLikeWav(buffer: Buffer): boolean {
  return buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WAVE';
}

function pcmSampleRateFromMime(mimeType: string): number {
  const value = /(?:rate|sample[_-]?rate)\s*=\s*(\d{4,6})/i.exec(mimeType)?.[1];
  const parsed = Number(value || DEFAULT_PCM_SAMPLE_RATE);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PCM_SAMPLE_RATE;
}

/** Normalize Gemini output into a browser-decodable payload. */
export function normalizeGeminiAudio(
  audioBuffer: Buffer,
  mimeType = '',
): { audioBuffer: Buffer; mimeType: string } | null {
  if (!audioBuffer.length || audioBuffer.length > MAX_GENERATED_AUDIO_BYTES) return null;

  if (looksLikeWav(audioBuffer)) {
    return { audioBuffer, mimeType: 'audio/wav' };
  }

  const normalizedMime = mimeType.toLowerCase().trim();
  const rawPcm = !normalizedMime
    || normalizedMime.includes('audio/pcm')
    || normalizedMime.includes('audio/l16')
    || normalizedMime.includes('pcm_s16le')
    // Some responses have historically claimed WAV while returning headerless PCM.
    || normalizedMime.includes('audio/wav');

  if (rawPcm) {
    const wav = pcm16leToWav(audioBuffer, pcmSampleRateFromMime(normalizedMime), 1);
    return wav.length > 44 ? { audioBuffer: wav, mimeType: 'audio/wav' } : null;
  }

  if (normalizedMime.includes('mpeg') || normalizedMime.includes('mp3')) {
    return { audioBuffer, mimeType: 'audio/mpeg' };
  }
  if (normalizedMime.includes('ogg')) {
    return { audioBuffer, mimeType: 'audio/ogg' };
  }

  return null;
}

function chosenGeminiVoice(voiceName: string) {
  return SUPPORTED_GEMINI_VOICES.find((voice) => voice.id.toLowerCase() === voiceName.toLowerCase())
    || SUPPORTED_GEMINI_VOICES[0];
}

function geminiTtsPayload(text: string, voiceName: string) {
  const chosenVoice = chosenGeminiVoice(voiceName);
  return {
    contents: [{
      role: 'user',
      parts: [{
        text: `Read only the following text aloud. Preserve its language and wording exactly. Use a warm, natural conversational tone.\n\n${text}`,
      }],
    }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: chosenVoice.id,
          },
        },
      },
    },
  };
}

function geminiTtsTimeoutMs(): number {
  const configured = Number(process.env.GEMINI_TTS_TIMEOUT_MS || 20_000);
  return Number.isFinite(configured)
    ? Math.max(3_000, Math.min(60_000, configured))
    : 20_000;
}

export interface GeminiTtsStreamResponse {
  response: Response;
  model: string;
  sampleRate: number;
}

/**
 * Open Gemini's SSE generation response. The route incrementally decodes each
 * inline PCM block and forwards it as one cancellable binary response.
 */
export async function openGeminiTtsPcmStream(
  text: string,
  voiceName = 'Aoede',
  externalSignal?: AbortSignal,
): Promise<GeminiTtsStreamResponse | null> {
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  const cleanText = text.trim().slice(0, MAX_TTS_TEXT_LENGTH);
  if (!key || !cleanText || !serverTextToSpeechEnabled() || geminiQuotaCircuitOpen()) return null;

  const model = geminiTtsModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const startupAbort = new AbortController();
  const startupTimeout = setTimeout(() => startupAbort.abort(), geminiTtsTimeoutMs());
  const signal = externalSignal && typeof (AbortSignal as any).any === 'function'
    ? (AbortSignal as any).any([externalSignal, startupAbort.signal]) as AbortSignal
    : externalSignal || startupAbort.signal;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify(geminiTtsPayload(cleanText, voiceName)),
      signal,
    });
    clearTimeout(startupTimeout);
    if (!response.ok) {
      if (response.status === 429) openGeminiQuotaCircuit(response, model);
      else console.warn(`[Gemini TTS] streaming API HTTP ${response.status} model=${model}`);
      await response.text().catch(() => '');
      return null;
    }
    // A successful provider response closes a prior elapsed circuit. Individual
    // stream parse/playback failures are transport errors, not quota evidence.
    resetGeminiTtsRuntimeState();
    return { response, model, sampleRate: DEFAULT_PCM_SAMPLE_RATE };
  } catch (error: any) {
    if (!externalSignal?.aborted) console.warn('[Gemini TTS] streaming synthesis failed:', error?.message || error);
    return null;
  } finally {
    clearTimeout(startupTimeout);
  }
}

/** Generate a browser-decodable speech clip with Gemini TTS. */
export async function synthesizeGeminiLiveAudio(
  text: string,
  voiceName = 'Aoede',
): Promise<{ audioBuffer: Buffer; mimeType: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  const cleanText = text.trim().slice(0, MAX_TTS_TEXT_LENGTH);
  if (!apiKey || !cleanText || !serverTextToSpeechEnabled() || geminiQuotaCircuitOpen()) return null;

  const model = geminiTtsModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(geminiTtsPayload(cleanText, voiceName)),
      signal: AbortSignal.timeout(geminiTtsTimeoutMs()),
    });

    if (!response.ok) {
      if (response.status === 429) {
        openGeminiQuotaCircuit(response, model);
        await response.text().catch(() => '');
        return null;
      }
      const detail = await response.text().catch(() => '');
      console.warn(`[Gemini TTS] API HTTP ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ''}`);
      return null;
    }

    const payload: any = await response.json();
    const parts = Array.isArray(payload?.candidates?.[0]?.content?.parts)
      ? payload.candidates[0].content.parts
      : [];
    const inlineData = parts.find((part: any) => part?.inlineData?.data)?.inlineData;
    if (!inlineData?.data || typeof inlineData.data !== 'string') return null;

    const audioBuffer = Buffer.from(inlineData.data, 'base64');
    const normalized = normalizeGeminiAudio(audioBuffer, String(inlineData.mimeType || 'audio/pcm;rate=24000'));
    if (normalized) resetGeminiTtsRuntimeState();
    return normalized;
  } catch (error: any) {
    console.warn('[Gemini TTS] Audio synthesis failed:', error?.message || error);
    return null;
  }
}
