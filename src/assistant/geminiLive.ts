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

export function serverTextToSpeechReady(): boolean {
  return serverTextToSpeechEnabled() && Boolean(
    process.env.GEMINI_API_KEY?.trim()
    || process.env.GOOGLE_API_KEY?.trim()
    || process.env.OPENAI_API_KEY?.trim(),
  );
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
      // The chat text is streamed, while output is one complete playback.
      realtimeAudioStreaming: false,
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

/** Generate a browser-decodable speech clip with Gemini TTS. */
export async function synthesizeGeminiLiveAudio(
  text: string,
  voiceName = 'Aoede',
): Promise<{ audioBuffer: Buffer; mimeType: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  const cleanText = text.trim().slice(0, MAX_TTS_TEXT_LENGTH);
  if (!apiKey || !cleanText) return null;

  const chosenVoice = SUPPORTED_GEMINI_VOICES.find((voice) => voice.id.toLowerCase() === voiceName.toLowerCase())
    || SUPPORTED_GEMINI_VOICES[0];
  const model = geminiTtsModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const configuredTimeout = Number(process.env.GEMINI_TTS_TIMEOUT_MS || 20_000);
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.max(3_000, Math.min(60_000, configuredTimeout))
    : 20_000;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: `Read only the following text aloud. Preserve its language and wording exactly. Use a warm, natural conversational tone.\n\n${cleanText}`,
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
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
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
    return normalizeGeminiAudio(audioBuffer, String(inlineData.mimeType || 'audio/pcm;rate=24000'));
  } catch (error: any) {
    console.warn('[Gemini TTS] Audio synthesis failed:', error?.message || error);
    return null;
  }
}
