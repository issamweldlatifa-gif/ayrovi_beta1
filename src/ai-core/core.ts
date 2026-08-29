import type {
  AiProviderRegistrySnapshot,
  AiRealtimeProviderAdapter,
  AiResponsesProviderAdapter,
} from './contracts';
import { AnthropicAdapter } from './adapters/anthropic/AnthropicAdapter';
import { LegacyVoiceAdapter } from './adapters/legacy/LegacyVoiceAdapter';
import { OpenAIRealtimeAdapter } from './adapters/openai/OpenAIRealtimeAdapter';
import { OpenAIResponsesAdapter } from './adapters/openai/OpenAIResponsesAdapter';
import { AiProviderCircuitBreaker, PolicyResponsesAdapter } from './policy';

/**
 * AYROVI owns routing. Phase 1 intentionally keeps Anthropic active so
 * contract extraction is behavior-preserving. Environment variables cannot
 * silently promote OpenAI before the reviewed Shadow/Canary phases.
 */
export class AyroviAiCore {
  readonly anthropic: AiResponsesProviderAdapter;
  readonly openAiResponses: AiResponsesProviderAdapter;
  readonly openAiRealtime: AiRealtimeProviderAdapter;
  readonly legacyVoice: AiRealtimeProviderAdapter;
  readonly circuitBreaker: AiProviderCircuitBreaker;

  constructor(adapters: {
    anthropic?: AiResponsesProviderAdapter;
    openAiResponses?: AiResponsesProviderAdapter;
    openAiRealtime?: AiRealtimeProviderAdapter;
    legacyVoice?: AiRealtimeProviderAdapter;
  } = {}) {
    this.circuitBreaker = new AiProviderCircuitBreaker();
    this.anthropic = new PolicyResponsesAdapter(
      adapters.anthropic || new AnthropicAdapter(),
      this.circuitBreaker,
    );
    this.openAiResponses = new PolicyResponsesAdapter(
      adapters.openAiResponses || new OpenAIResponsesAdapter(),
      this.circuitBreaker,
    );
    this.openAiRealtime = adapters.openAiRealtime || new OpenAIRealtimeAdapter();
    this.legacyVoice = adapters.legacyVoice || new LegacyVoiceAdapter();
  }

  /** Current production-compatible route for Phase 1. */
  responses(): AiResponsesProviderAdapter {
    return this.anthropic;
  }

  /** Target adapter available for contract tests; not routed to live traffic. */
  targetResponses(): AiResponsesProviderAdapter {
    return this.openAiResponses;
  }

  /** Target Voice adapter; session creation remains disabled until Phase 6. */
  targetRealtime(): AiRealtimeProviderAdapter {
    return this.openAiRealtime;
  }

  registrySnapshot(): AiProviderRegistrySnapshot {
    return {
      phase: 'contract-extraction',
      activeResponses: this.responses().id,
      targetResponses: this.targetResponses().id,
      targetRealtime: this.targetRealtime().id,
      legacyRealtime: this.legacyVoice.id,
      entries: [
        { id: this.anthropic.id, kind: 'responses', role: this.anthropic.targetRole, configured: this.anthropic.isConfigured(), active: true },
        { id: this.openAiResponses.id, kind: 'responses', role: this.openAiResponses.targetRole, configured: this.openAiResponses.isConfigured(), active: false },
        { id: this.openAiRealtime.id, kind: 'realtime', role: this.openAiRealtime.targetRole, configured: this.openAiRealtime.isConfigured(), active: false },
        { id: this.legacyVoice.id, kind: 'realtime', role: this.legacyVoice.targetRole, configured: this.legacyVoice.isConfigured(), active: true },
      ],
    };
  }
}

let singleton: AyroviAiCore | null = null;

export function getAyroviAiCore(): AyroviAiCore {
  if (!singleton) singleton = new AyroviAiCore();
  return singleton;
}

/** Test-only dependency reset; production code should use the singleton. */
export function resetAyroviAiCoreForTests(): void {
  singleton = null;
}
