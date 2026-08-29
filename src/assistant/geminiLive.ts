/**
 * AYROVI Gemini Live Realtime Voice Transport & Audio Engine
 *
 * Architecture:
 * - Claude (Brain & Agent Core): Reasoning, Context, Prompt, Tools (Lens, Pricing, Order, Tracking)
 * - Gemini Live (Realtime Voice Layer): Bi-directional Realtime Audio I/O, Supported Realtime Voices, VAD
 * - Web Audio Player: Low-latency PCM / WAV streaming directly to device Speaker with Instant Barge-In
 */

export interface GeminiVoiceSessionConfig {
  sessionId: string;
  conversationId: string;
  provider: 'gemini-live-realtime';
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
    format: 'pcm_s16le' | 'webm_opus';
    sampleRate: number;
    channelCount: number;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  };
  turnDetection: {
    type: 'speech_aware_vad';
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

export function createGeminiVoiceSession(
  conversationId: string,
  preferredVoiceId = 'Aoede',
  sessionId?: string,
): GeminiVoiceSessionConfig {
  const chosenVoice = SUPPORTED_GEMINI_VOICES.find((v) => v.id.toLowerCase() === preferredVoiceId.toLowerCase())
    || SUPPORTED_GEMINI_VOICES[0];

  return {
    sessionId: sessionId || `sess_gemini_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    conversationId,
    provider: 'gemini-live-realtime',
    model: process.env.GEMINI_VOICE_MODEL || 'gemini-2.0-flash-exp',
    voice: {
      id: chosenVoice.id,
      name: chosenVoice.name,
      gender: chosenVoice.gender,
      language: 'ar-TN,fr-FR,en-US',
    },
    availableVoices: SUPPORTED_GEMINI_VOICES,
    audioInput: {
      format: 'pcm_s16le',
      sampleRate: 24000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    turnDetection: {
      type: 'speech_aware_vad',
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
      realtimeAudioStreaming: true,
      instantBargeIn: true,
    },
  };
}

/**
 * Generate native audio speech bytes using Gemini Audio generation if key is present
 */
export async function synthesizeGeminiLiveAudio(
  text: string,
  voiceName = 'Aoede',
): Promise<{ audioBuffer: Buffer; mimeType: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey || !text.trim()) return null;

  const model = process.env.GEMINI_VOICE_MODEL || 'gemini-2.0-flash-exp';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Lis ce texte à haute voix de manière chaleureuse, naturelle et fluide. Ne rajoute aucun mot supplémentaire, prononce uniquement ce texte :\n\n${text}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceName || 'Aoede',
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[Gemini Live] API HTTP ${response.status}`);
      return null;
    }

    const payload = await response.json();
    const candidate = payload?.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const inlineData = part?.inlineData;

    if (inlineData?.data) {
      const audioBuffer = Buffer.from(inlineData.data, 'base64');
      const mimeType = inlineData.mimeType || 'audio/wav';
      return { audioBuffer, mimeType };
    }
  } catch (err: any) {
    console.warn('[Gemini Live] Audio synthesis failed:', err?.message || err);
  }

  return null;
}
