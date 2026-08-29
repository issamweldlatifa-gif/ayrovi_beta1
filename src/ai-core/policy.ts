import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiResponsesProviderAdapter,
  AiStreamCallbacks,
} from './contracts';
import { AiProviderError } from './errors';

interface CircuitState {
  consecutiveFailures: number;
  openUntil: number;
  reason: 'rate-limit' | 'failures' | null;
}

/**
 * AYROVI-owned provider circuit breaker. A 429 opens immediately and is never
 * retried in the same request. Repeated transient failures also fail fast.
 */
export class AiProviderCircuitBreaker {
  private readonly states = new Map<string, CircuitState>();

  constructor(
    private readonly rateLimitCooldownMs = 60_000,
    private readonly failureCooldownMs = 30_000,
    private readonly failureThreshold = 3,
  ) {}

  private state(provider: string): CircuitState {
    const existing = this.states.get(provider);
    if (existing) return existing;
    const created: CircuitState = { consecutiveFailures: 0, openUntil: 0, reason: null };
    this.states.set(provider, created);
    return created;
  }

  beforeRequest(provider: string): void {
    const state = this.state(provider);
    if (state.openUntil <= Date.now()) {
      if (state.openUntil) {
        state.openUntil = 0;
        state.reason = null;
        state.consecutiveFailures = 0;
      }
      return;
    }
    throw new AiProviderError('PROVIDER_CIRCUIT_OPEN', provider, 'AI provider circuit is temporarily open.', {
      status: state.reason === 'rate-limit' ? 429 : 503,
      retryable: true,
      retryAt: new Date(state.openUntil).toISOString(),
    });
  }

  recordSuccess(provider: string): void {
    const state = this.state(provider);
    state.consecutiveFailures = 0;
    if (state.openUntil <= Date.now()) {
      state.openUntil = 0;
      state.reason = null;
    }
  }

  recordFailure(provider: string, error: unknown): void {
    if (!(error instanceof AiProviderError)) return;
    const state = this.state(provider);
    if (error.code === 'PROVIDER_RATE_LIMITED' || error.status === 429) {
      const retryAt = Date.parse(error.retryAt || '');
      state.openUntil = Number.isFinite(retryAt) && retryAt > Date.now()
        ? retryAt
        : Date.now() + this.rateLimitCooldownMs;
      state.reason = 'rate-limit';
      state.consecutiveFailures = 0;
      return;
    }
    if (!error.retryable) {
      state.consecutiveFailures = 0;
      return;
    }
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= this.failureThreshold) {
      state.openUntil = Date.now() + this.failureCooldownMs;
      state.reason = 'failures';
    }
  }

  reset(provider?: string): void {
    if (provider) this.states.delete(provider);
    else this.states.clear();
  }
}

/** Applies AYROVI policy without changing provider adapter contracts. */
export class PolicyResponsesAdapter implements AiResponsesProviderAdapter {
  readonly id: string;
  readonly kind = 'responses' as const;
  readonly targetRole: 'primary' | 'fallback';

  constructor(
    private readonly delegate: AiResponsesProviderAdapter,
    private readonly breaker: AiProviderCircuitBreaker,
  ) {
    this.id = delegate.id;
    this.targetRole = delegate.targetRole;
  }

  isConfigured(): boolean { return this.delegate.isConfigured(); }
  resolveModel(...args: Parameters<AiResponsesProviderAdapter['resolveModel']>): string {
    return this.delegate.resolveModel(...args);
  }

  async complete(request: AiCompletionRequest, signal?: AbortSignal): Promise<AiCompletionResult> {
    this.breaker.beforeRequest(this.id);
    try {
      const result = await this.delegate.complete(request, signal);
      this.breaker.recordSuccess(this.id);
      return result;
    } catch (error) {
      this.breaker.recordFailure(this.id, error);
      throw error;
    }
  }

  async stream(request: AiCompletionRequest, callbacks: AiStreamCallbacks, signal: AbortSignal): Promise<AiCompletionResult> {
    this.breaker.beforeRequest(this.id);
    try {
      const result = await this.delegate.stream(request, callbacks, signal);
      this.breaker.recordSuccess(this.id);
      return result;
    } catch (error) {
      this.breaker.recordFailure(this.id, error);
      throw error;
    }
  }
}
