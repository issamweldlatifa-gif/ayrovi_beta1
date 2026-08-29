export type AiProviderErrorCode =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_NOT_ACTIVE'
  | 'PROVIDER_AUTHENTICATION_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_CIRCUIT_OPEN'
  | 'PROVIDER_INVALID_REQUEST'
  | 'PROVIDER_CAPABILITY_UNSUPPORTED'
  | 'PROVIDER_MODEL_NOT_FOUND'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_INVALID_RESPONSE';

/**
 * Provider-neutral failure. Raw provider bodies are diagnostic-only and must
 * never be exposed directly to UI contracts.
 */
export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly provider: string;
  private readonly details: {
    status?: number;
    retryable?: boolean;
    diagnostic?: string;
    retryAt?: string;
  };

  constructor(
    code: AiProviderErrorCode,
    provider: string,
    message: string,
    details: {
      status?: number;
      retryable?: boolean;
      diagnostic?: string;
      retryAt?: string;
    } = {},
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.code = code;
    this.provider = provider;
    this.details = details;
    // Raw diagnostics are server-only and must not leak through accidental
    // JSON serialization of an Error object.
    Object.defineProperty(this, 'details', { enumerable: false, value: details });
  }

  get status(): number | undefined { return this.details.status; }
  get retryable(): boolean { return this.details.retryable === true; }
  get diagnostic(): string | undefined { return this.details.diagnostic; }
  get retryAt(): string | undefined { return this.details.retryAt; }
}

export interface PublicAiError {
  code: AiProviderErrorCode;
  message: string;
  retryable: boolean;
  retryAt?: string;
}

export function publicAiError(error: AiProviderError): PublicAiError {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    ...(error.retryAt ? { retryAt: error.retryAt } : {}),
  };
}

export function retryAtFromHeader(value: string | null, now = Date.now()): string | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  const timestamp = Number.isFinite(seconds)
    ? now + Math.max(0, seconds) * 1000
    : Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now
    ? new Date(timestamp).toISOString()
    : undefined;
}

export function providerErrorFromHttp(provider: string, status: number, diagnostic = '', retryAt?: string): AiProviderError {
  if (status === 401 || status === 403) {
    return new AiProviderError('PROVIDER_AUTHENTICATION_FAILED', provider, 'AI provider authentication failed.', {
      status, retryable: false, diagnostic,
    });
  }
  if (status === 429) {
    return new AiProviderError('PROVIDER_RATE_LIMITED', provider, 'AI provider rate limit reached.', {
      status, retryable: true, diagnostic, retryAt,
    });
  }
  if (status === 400 || status === 422) {
    return new AiProviderError('PROVIDER_INVALID_REQUEST', provider, 'AI provider rejected the request.', {
      status, retryable: false, diagnostic,
    });
  }
  if (status === 404) {
    return new AiProviderError('PROVIDER_MODEL_NOT_FOUND', provider, 'AI provider model was not found.', {
      status, retryable: false, diagnostic,
    });
  }
  return new AiProviderError('PROVIDER_UNAVAILABLE', provider, 'AI provider is unavailable.', {
    status, retryable: status >= 500, diagnostic,
  });
}
