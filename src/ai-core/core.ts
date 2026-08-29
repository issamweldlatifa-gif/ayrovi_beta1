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
 * AYROVI owns routing. Phase 1 intentionally keeps the production-compatible
 * adapter active so contract extraction is behavior-preserving. Environment
 * variables cannot silently promote the candidate before reviewed gates.
 */
export class AyroviAiCore {
  private readonly activeResponsesAdapter: AiResponsesProviderAdapter;
  private readonly candidateResponsesAdapter: AiResponsesProviderAdapter;
  private readonly candidateRealtimeAdapter: AiRealtimeProviderAdapter;
  private readonly legacyRealtimeAdapter: AiRealtimeProviderAdapter;
  readonly circuitBreaker: AiProviderCircuitBreaker;

  constructor(adapters: {
    activeResponses?: AiResponsesProviderAdapter;
    candidateResponses?: AiResponsesProviderAdapter;
    candidateRealtime?: AiRealtimeProviderAdapter;
    legacyRealtime?: AiRealtimeProviderAdapter;
  } = {}) {
    this.circuitBreaker = new AiProviderCircuitBreaker();
    this.activeResponsesAdapter = new PolicyResponsesAdapter(
      adapters.activeResponses || new AnthropicAdapter(),
      this.circuitBreaker,
    );
    this.candidateResponsesAdapter = new PolicyResponsesAdapter(
      adapters.candidateResponses || new OpenAIResponsesAdapter(),
      this.circuitBreaker,
    );
    this.candidateRealtimeAdapter = adapters.candidateRealtime || new OpenAIRealtimeAdapter();
    this.legacyRealtimeAdapter = adapters.legacyRealtime || new LegacyVoiceAdapter();
  }

  /** Current production-compatible route for Phase 1. */
  responses(): AiResponsesProviderAdapter {
    return this.activeResponsesAdapter;
  }

  /** Candidate adapter available to gates/tests; never routed to active traffic. */
  targetResponses(): AiResponsesProviderAdapter {
    return this.candidateResponsesAdapter;
  }

  /** Candidate Voice adapter; session creation remains disabled until a later phase. */
  targetRealtime(): AiRealtimeProviderAdapter {
    return this.candidateRealtimeAdapter;
  }

  /** Provider-neutral status for the frozen legacy Voice transport. */
  legacyVoiceReadiness(): { available: boolean; input: boolean; output: boolean } {
    const sharedFallback = Boolean(process.env.OPENAI_API_KEY?.trim());
    const input = Boolean(process.env.GROQ_API_KEY?.trim()) || sharedFallback;
    const output = Boolean(
      process.env.GEMINI_API_KEY?.trim()
      || process.env.GOOGLE_API_KEY?.trim(),
    ) || sharedFallback;
    return { available: input || output, input, output };
  }

  registrySnapshot(): AiProviderRegistrySnapshot {
    return {
      phase: 'contract-extraction',
      activeResponses: this.responses().id,
      targetResponses: this.targetResponses().id,
      targetRealtime: this.targetRealtime().id,
      legacyRealtime: this.legacyRealtimeAdapter.id,
      entries: [
        { id: this.activeResponsesAdapter.id, kind: 'responses', role: this.activeResponsesAdapter.targetRole, configured: this.activeResponsesAdapter.isConfigured(), active: true },
        { id: this.candidateResponsesAdapter.id, kind: 'responses', role: this.candidateResponsesAdapter.targetRole, configured: this.candidateResponsesAdapter.isConfigured(), active: false },
        { id: this.candidateRealtimeAdapter.id, kind: 'realtime', role: this.candidateRealtimeAdapter.targetRole, configured: this.candidateRealtimeAdapter.isConfigured(), active: false },
        { id: this.legacyRealtimeAdapter.id, kind: 'realtime', role: this.legacyRealtimeAdapter.targetRole, configured: this.legacyRealtimeAdapter.isConfigured(), active: true },
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
