import type {
  AiRealtimeProviderAdapter,
  AiRealtimeSessionLease,
  AiRealtimeSessionRequest,
} from '../../contracts';
import { AiProviderError } from '../../errors';

/**
 * Marker for the existing Groq/Gemini/browser voice subsystem. Phase 1 leaves
 * its routes and behavior untouched; the clean Realtime rebuild will replace
 * this adapter capability-by-capability in a later reviewed phase.
 */
export class LegacyVoiceAdapter implements AiRealtimeProviderAdapter {
  readonly id = 'legacy-voice';
  readonly kind = 'realtime' as const;
  readonly targetRole = 'fallback' as const;

  isConfigured(): boolean {
    return Boolean(
      process.env.GROQ_API_KEY?.trim()
      || process.env.GEMINI_API_KEY?.trim()
      || process.env.GOOGLE_API_KEY?.trim()
      || process.env.OPENAI_API_KEY?.trim(),
    );
  }

  async createSession(_request: AiRealtimeSessionRequest): Promise<AiRealtimeSessionLease> {
    throw new AiProviderError(
      'PROVIDER_NOT_ACTIVE',
      this.id,
      'Legacy Voice remains on its existing routes during contract extraction.',
      { retryable: false },
    );
  }
}
