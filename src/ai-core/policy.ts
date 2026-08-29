import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiResponsesProviderAdapter,
  AiStreamCallbacks,
  AiWorkload,
} from './contracts';
import { AiProviderError } from './errors';

interface CircuitState {
  consecutiveFailures: number;
  openUntil: number;
  reason: 'rate-limit' | 'failures' | null;
}

export interface AiCircuitSnapshot {
  provider: string;
  capability: AiWorkload;
  open: boolean;
  consecutiveFailures: number;
  reason: 'rate-limit' | 'failures' | null;
  retryAt?: string;
}

/**
 * AYROVI-owned, capability-isolated circuit breaker. State is keyed by the
 * provider AND canonical AYROVI workload: quota or transient failures in one
 * capability cannot disable unrelated capabilities on the same provider.
 * A 429 opens its scoped circuit immediately and is never retried here.
 */
export class AiProviderCircuitBreaker {
  private readonly states = new Map<string, CircuitState>();

  constructor(
    private readonly rateLimitCooldownMs = 60_000,
    private readonly failureCooldownMs = 30_000,
    private readonly failureThreshold = 3,
  ) {}

  private key(provider: string, capability: AiWorkload): string {
    // JSON encoding avoids delimiter collisions in provider/workload names.
    return JSON.stringify([provider, capability]);
  }

  private state(provider: string, capability: AiWorkload): CircuitState {
    const key = this.key(provider, capability);
    const existing = this.states.get(key);
    if (existing) return existing;
    const created: CircuitState = { consecutiveFailures: 0, openUntil: 0, reason: null };
    this.states.set(key, created);
    return created;
  }

  beforeRequest(provider: string, capability: AiWorkload): void {
    const state = this.state(provider, capability);
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

  recordSuccess(provider: string, capability: AiWorkload): void {
    const state = this.state(provider, capability);
    state.consecutiveFailures = 0;
    if (state.openUntil <= Date.now()) {
      state.openUntil = 0;
      state.reason = null;
    }
  }

  recordFailure(provider: string, capability: AiWorkload, error: unknown): void {
    if (!(error instanceof AiProviderError)) return;
    const state = this.state(provider, capability);
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

  snapshot(provider: string, capability: AiWorkload): AiCircuitSnapshot {
    const state = this.state(provider, capability);
    const open = state.openUntil > Date.now();
    return {
      provider,
      capability,
      open,
      consecutiveFailures: state.consecutiveFailures,
      reason: open ? state.reason : null,
      ...(open ? { retryAt: new Date(state.openUntil).toISOString() } : {}),
    };
  }

  reset(provider?: string, capability?: AiWorkload): void {
    if (!provider) {
      this.states.clear();
      return;
    }
    if (capability) {
      this.states.delete(this.key(provider, capability));
      return;
    }
    for (const key of this.states.keys()) {
      const parsed = JSON.parse(key) as [string, AiWorkload];
      if (parsed[0] === provider) this.states.delete(key);
    }
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
    const capability = request.workload;
    this.breaker.beforeRequest(this.id, capability);
    try {
      const result = await this.delegate.complete(request, signal);
      this.breaker.recordSuccess(this.id, capability);
      return result;
    } catch (error) {
      this.breaker.recordFailure(this.id, capability, error);
      throw error;
    }
  }

  async stream(request: AiCompletionRequest, callbacks: AiStreamCallbacks, signal: AbortSignal): Promise<AiCompletionResult> {
    const capability = request.workload;
    this.breaker.beforeRequest(this.id, capability);
    try {
      const result = await this.delegate.stream(request, callbacks, signal);
      this.breaker.recordSuccess(this.id, capability);
      return result;
    } catch (error) {
      this.breaker.recordFailure(this.id, capability, error);
      throw error;
    }
  }
}
