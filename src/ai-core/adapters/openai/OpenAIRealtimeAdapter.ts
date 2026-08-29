import type {
  AiRealtimeProviderAdapter,
  AiRealtimeSessionLease,
  AiRealtimeSessionRequest,
} from '../../contracts';
import { AiProviderError } from '../../errors';

/**
 * Phase 1 registration boundary only. The WebRTC/session implementation is
 * deliberately deferred to the approved Voice rebuild phase; legacy Voice is
 * not patched from this adapter.
 */
export class OpenAIRealtimeAdapter implements AiRealtimeProviderAdapter {
  readonly id = 'openai-realtime';
  readonly kind = 'realtime' as const;
  readonly targetRole = 'primary' as const;

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }

  async createSession(_request: AiRealtimeSessionRequest): Promise<AiRealtimeSessionLease> {
    throw new AiProviderError(
      'PROVIDER_NOT_ACTIVE',
      this.id,
      'OpenAI Realtime is registered but not active during contract extraction.',
      { retryable: false },
    );
  }
}
