/**
 * Secure bootstrap for Gemini Live Transcribe.
 *
 * The browser receives a single-use, short-lived token constrained to the
 * dedicated transcription model and text-only transcription configuration.
 * The long-lived Gemini API key never crosses the server boundary.
 */

const DEFAULT_MODEL = 'gemini-3.5-transcribe-live';
const TOKEN_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
const WEBSOCKET_ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
const SANITIZED_TOKEN_ENDPOINT = 'generativelanguage.googleapis.com/v1beta/auth_tokens';
const DEFAULT_TOKEN_TTL_MS = 10 * 60_000;
const DEFAULT_CONNECT_WINDOW_MS = 60_000;
const DEFAULT_QUOTA_COOLDOWN_MS = 15 * 60_000;
const MIN_QUOTA_COOLDOWN_MS = 60_000;
const MAX_QUOTA_COOLDOWN_MS = 24 * 60 * 60_000;

const CUSTOM_VOCABULARY = [
  'AYROVI',
  'AYROVIX',
  'Airovi',
  'Tunisie',
  'Tunisian dinar',
  'TND',
  'euro',
  'Amazon',
  'AliExpress',
  'Temu',
  'Shein',
];

export interface GeminiLiveTranscriptionRuntimeStatus {
  provider: 'gemini';
  purpose: 'transcription-only';
  model: string;
  endpoint: string;
  transport: 'direct-wss-ephemeral-token';
  state: 'disabled' | 'unconfigured' | 'ready' | 'quota_exceeded';
  debugCode?: 'LIVE_TRANSCRIPTION_QUOTA_EXCEEDED';
  lastFailureAt?: string;
  retryAt?: string;
}

export interface GeminiLiveTranscriptionBootstrap {
  token: string;
  model: string;
  websocketUrl: string;
  expiresAt: string;
  setup: {
    setup: {
      model: string;
      generationConfig: { responseModalities: ['TEXT'] };
      inputAudioTranscription: {
        languageCodes: string[];
        customVocabulary: string[];
        mode: 'VERBATIM';
      };
    };
  };
}

export type GeminiLiveTokenResult =
  | { ok: true; bootstrap: GeminiLiveTranscriptionBootstrap }
  | {
      ok: false;
      code: 'LIVE_TRANSCRIPTION_DISABLED' | 'LIVE_TRANSCRIPTION_UNCONFIGURED' | 'LIVE_TRANSCRIPTION_QUOTA_EXCEEDED' | 'LIVE_TRANSCRIPTION_UNAVAILABLE';
      retryAt?: string;
    };

let quotaBlockedUntil = 0;
let quotaLastFailureAt = 0;

function modelName(): string {
  // Fail closed against accidental configuration of a conversational Live
  // model. This transport is intentionally limited to dedicated transcription.
  const configured = process.env.GEMINI_LIVE_TRANSCRIBE_MODEL?.trim();
  return configured === DEFAULT_MODEL ? configured : DEFAULT_MODEL;
}

function apiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || '';
}

/** `auto` is safe: any bootstrap/session failure falls through to Groq upload STT. */
export function liveTranscriptionEnabled(): boolean {
  return (process.env.ASSISTANT_REALTIME_TRANSCRIPTION?.trim().toLowerCase() || 'auto') !== 'off';
}

function configuredCooldownMs(): number {
  const value = Number(process.env.GEMINI_LIVE_QUOTA_COOLDOWN_MS || DEFAULT_QUOTA_COOLDOWN_MS);
  if (!Number.isFinite(value)) return DEFAULT_QUOTA_COOLDOWN_MS;
  return Math.max(MIN_QUOTA_COOLDOWN_MS, Math.min(MAX_QUOTA_COOLDOWN_MS, Math.trunc(value)));
}

function responseRetryAfterMs(response: Response): number {
  const value = response.headers.get('retry-after')?.trim();
  if (!value) return configuredCooldownMs();
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(MIN_QUOTA_COOLDOWN_MS, Math.min(MAX_QUOTA_COOLDOWN_MS, Math.ceil(seconds * 1_000)));
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return configuredCooldownMs();
  return Math.max(MIN_QUOTA_COOLDOWN_MS, Math.min(MAX_QUOTA_COOLDOWN_MS, date - Date.now()));
}

function openQuotaCircuit(response: Response): void {
  const now = Date.now();
  quotaLastFailureAt = now;
  quotaBlockedUntil = Math.max(quotaBlockedUntil, now + responseRetryAfterMs(response));
  console.warn(
    `[Gemini Live Transcribe] LIVE_TRANSCRIPTION_QUOTA_EXCEEDED status=429 model=${modelName()} retryAt=${new Date(quotaBlockedUntil).toISOString()}`,
  );
}

export function resetGeminiLiveTranscriptionRuntimeState(): void {
  quotaBlockedUntil = 0;
  quotaLastFailureAt = 0;
}

export function getGeminiLiveTranscriptionRuntimeStatus(now = Date.now()): GeminiLiveTranscriptionRuntimeStatus {
  const base = {
    provider: 'gemini' as const,
    purpose: 'transcription-only' as const,
    model: modelName(),
    endpoint: SANITIZED_TOKEN_ENDPOINT,
    transport: 'direct-wss-ephemeral-token' as const,
  };
  if (!liveTranscriptionEnabled()) return { ...base, state: 'disabled' };
  if (!apiKey()) return { ...base, state: 'unconfigured' };
  if (quotaBlockedUntil > now) {
    return {
      ...base,
      state: 'quota_exceeded',
      debugCode: 'LIVE_TRANSCRIPTION_QUOTA_EXCEEDED',
      lastFailureAt: new Date(quotaLastFailureAt).toISOString(),
      retryAt: new Date(quotaBlockedUntil).toISOString(),
    };
  }
  return { ...base, state: 'ready' };
}

function setupForModel(model: string): GeminiLiveTranscriptionBootstrap['setup'] {
  return {
    setup: {
      model: `models/${model}`,
      generationConfig: { responseModalities: ['TEXT'] },
      inputAudioTranscription: {
        // Empty means automatic multilingual detection, including Arabic,
        // French, and English within the same hands-free session.
        languageCodes: [],
        customVocabulary: CUSTOM_VOCABULARY,
        mode: 'VERBATIM',
      },
    },
  };
}

/** Mint one constrained token. Never return or log the long-lived API key. */
export async function createGeminiLiveTranscriptionToken(): Promise<GeminiLiveTokenResult> {
  if (!liveTranscriptionEnabled()) return { ok: false, code: 'LIVE_TRANSCRIPTION_DISABLED' };
  const key = apiKey();
  if (!key) return { ok: false, code: 'LIVE_TRANSCRIPTION_UNCONFIGURED' };
  if (quotaBlockedUntil > Date.now()) {
    return {
      ok: false,
      code: 'LIVE_TRANSCRIPTION_QUOTA_EXCEEDED',
      retryAt: new Date(quotaBlockedUntil).toISOString(),
    };
  }

  const model = modelName();
  const now = Date.now();
  const expiresAt = new Date(now + DEFAULT_TOKEN_TTL_MS).toISOString();
  const setup = setupForModel(model);

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        uses: 1,
        expireTime: expiresAt,
        newSessionExpireTime: new Date(now + DEFAULT_CONNECT_WINDOW_MS).toISOString(),
        liveConnectConstraints: {
          model: `models/${model}`,
          config: {
            responseModalities: ['TEXT'],
            inputAudioTranscription: setup.setup.inputAudioTranscription,
          },
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      if (response.status === 429) openQuotaCircuit(response);
      // Drain without exposing provider diagnostics or credentials to the client.
      await response.text().catch(() => '');
      const runtime = getGeminiLiveTranscriptionRuntimeStatus();
      if (runtime.state === 'quota_exceeded') {
        return { ok: false, code: 'LIVE_TRANSCRIPTION_QUOTA_EXCEEDED', retryAt: runtime.retryAt };
      }
      console.warn(`[Gemini Live Transcribe] token bootstrap HTTP ${response.status} model=${model}`);
      return { ok: false, code: 'LIVE_TRANSCRIPTION_UNAVAILABLE' };
    }

    const payload: any = await response.json().catch(() => null);
    const token = typeof payload?.name === 'string' ? payload.name.trim() : '';
    if (!token || token.length > 4_096) {
      console.warn(`[Gemini Live Transcribe] token bootstrap returned no usable token model=${model}`);
      return { ok: false, code: 'LIVE_TRANSCRIPTION_UNAVAILABLE' };
    }

    return {
      ok: true,
      bootstrap: {
        token,
        model,
        websocketUrl: WEBSOCKET_ENDPOINT,
        expiresAt,
        setup,
      },
    };
  } catch (error: any) {
    console.warn(`[Gemini Live Transcribe] token bootstrap failed model=${model}: ${error?.name || 'error'}`);
    return { ok: false, code: 'LIVE_TRANSCRIPTION_UNAVAILABLE' };
  }
}
