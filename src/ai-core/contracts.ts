/**
 * AYROVI AI Core contracts.
 *
 * These types are application-owned. Provider SDK objects and wire event
 * shapes must be translated inside adapters before crossing this boundary.
 */

export type AiModelClass = 'fast' | 'default' | 'deep';

export type AiWorkload =
  | 'assistant'
  | 'vision'
  | 'research'
  | 'stock-search'
  | 'magazine'
  | 'voice-delegation';

/**
 * Only active execution may touch canonical product/customer state. Shadow and
 * probe are non-canonical audit lanes with no UI, learning, cache, or tool writes.
 */
export type AiExecutionLane = 'active' | 'shadow' | 'probe';

/** AYROVI identifiers remain canonical; provider session/response IDs do not. */
export interface AiExecutionContext {
  requestId: string;
  executionLane: AiExecutionLane;
  conversationId?: string;
  turnId?: string;
  sessionId?: string;
  userIdHash?: string;
  promptVersion: string;
  policyVersion: string;
}

export interface AiTextPart {
  type: 'text';
  text: string;
}

export interface AiImagePart {
  type: 'image';
  id?: string;
  source:
    | { type: 'base64'; mediaType: string; data: string }
    | { type: 'url'; url: string };
}

export interface AiToolCallPart {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiToolResultPart {
  type: 'tool_result';
  callId: string;
  result: unknown;
}

export type AiContentPart = AiTextPart | AiImagePart | AiToolCallPart | AiToolResultPart;

export interface AiMessage {
  role: 'user' | 'assistant' | 'tool';
  content: AiContentPart[];
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type AiToolChoice = 'auto' | 'none' | { type: 'tool'; name: string };

export interface AiOutputSchema {
  name: string;
  schema: Record<string, unknown>;
}

export interface AiWebSearchPolicy {
  enabled: true;
  maxUses: number;
}

export interface AiCompletionRequest {
  workload: AiWorkload;
  modelClass: AiModelClass;
  context?: AiExecutionContext;
  instructions: string;
  messages: AiMessage[];
  maxOutputTokens: number;
  temperature?: number;
  tools?: AiToolDefinition[];
  toolChoice?: AiToolChoice;
  outputSchema?: AiOutputSchema;
  webSearch?: AiWebSearchPolicy;
}

export type AiOutputBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; arguments: Record<string, unknown> };

export interface AiWebSearchResult {
  title: string;
  url: string;
  source?: string;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  audioInputTokens: number;
  audioOutputTokens: number;
  imageInputTokens: number;
  webSearchCalls: number;
}

export interface AiMeasuredCost {
  amountUsd: number;
  /** `estimated` must never be reported as actual provider cost. */
  source: 'provider' | 'metered' | 'estimated';
}

export interface AiUsageRecord {
  context: AiExecutionContext;
  workload: AiWorkload;
  provider: string;
  model: string;
  usage: AiUsage;
  cost?: AiMeasuredCost;
  recordedAt: string;
}

export type AiBudgetScope = 'turn' | 'session' | 'user-day' | 'global-day';

export interface AiBudgetDecision {
  allowed: boolean;
  scope: AiBudgetScope;
  limitUsd: number;
  spentUsd: number;
  reason?: 'within-budget' | 'budget-exhausted' | 'usage-unavailable';
}

export type AiCoreEventType =
  | 'request_started'
  | 'text_delta'
  | 'tool_proposed'
  | 'tool_completed'
  | 'usage_recorded'
  | 'request_completed'
  | 'request_failed';

/** Provider-neutral, sanitized telemetry contract owned by AYROVI. */
export interface AiCoreEvent {
  eventId: string;
  type: AiCoreEventType;
  occurredAt: string;
  context: AiExecutionContext;
  workload: AiWorkload;
  provider?: string;
  model?: string;
  toolCallId?: string;
  toolName?: string;
  usage?: AiUsage;
  cost?: AiMeasuredCost;
  errorCode?: string;
  durationMs?: number;
}

export interface AiObservabilitySink {
  record(event: AiCoreEvent): void | Promise<void>;
}

export interface AiCompletionResult {
  provider: string;
  model: string;
  output: AiOutputBlock[];
  textBlocks: string[];
  webResults: AiWebSearchResult[];
  usage?: AiUsage;
}

export interface AiStreamCallbacks {
  onTextDelta?: (text: string) => void;
}

export interface AiResponsesProviderAdapter {
  readonly id: string;
  readonly kind: 'responses';
  readonly targetRole: 'primary' | 'fallback';
  isConfigured(): boolean;
  resolveModel(workload: AiWorkload, modelClass: AiModelClass): string;
  complete(request: AiCompletionRequest, signal?: AbortSignal): Promise<AiCompletionResult>;
  stream(request: AiCompletionRequest, callbacks: AiStreamCallbacks, signal: AbortSignal): Promise<AiCompletionResult>;
}

export interface AiRealtimeSessionRequest {
  conversationId: string;
  sessionId: string;
  voice?: string;
  language?: string;
}

export interface AiRealtimeSessionLease {
  sessionId: string;
  conversationId: string;
  transport: 'webrtc';
  expiresAt: string;
  negotiationUrl: string;
}

export interface AiRealtimeProviderAdapter {
  readonly id: string;
  readonly kind: 'realtime';
  readonly targetRole: 'primary' | 'fallback';
  isConfigured(): boolean;
  createSession(request: AiRealtimeSessionRequest): Promise<AiRealtimeSessionLease>;
}

export interface CanonicalToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  turnId?: string;
  idempotencyKey?: string;
}

export interface CanonicalToolAudit {
  canonicalCallId: string;
  classification: 'read' | 'compute' | 'external-read' | 'write' | 'unknown';
  executionLane: AiExecutionLane;
  authenticated: boolean;
  authorized: boolean;
  schemaValid: boolean;
  approval: 'not-required' | 'required' | 'approved' | 'denied';
  outcome: 'authorized' | 'denied' | 'succeeded' | 'business-rejected' | 'failed' | 'replayed';
  idempotencyKey?: string;
  auditId?: string;
}

export interface CanonicalToolResult<ModelResult = Record<string, unknown>, Presentation = Record<string, unknown>> {
  modelResult: ModelResult;
  presentation?: Presentation;
  audit?: CanonicalToolAudit;
}

export interface AiToolGateway<Context> {
  readonly definitions: readonly AiToolDefinition[];
  execute(call: CanonicalToolCall, context: Context): Promise<CanonicalToolResult<any, any>>;
}

export interface AiProviderRegistryEntry {
  id: string;
  kind: 'responses' | 'realtime';
  role: 'primary' | 'fallback';
  configured: boolean;
  active: boolean;
}

export interface AiProviderRegistrySnapshot {
  phase: 'contract-extraction';
  activeResponses: string;
  targetResponses: string;
  targetRealtime: string;
  legacyRealtime: string;
  entries: AiProviderRegistryEntry[];
}

export const EMPTY_AI_USAGE: AiUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  audioInputTokens: 0,
  audioOutputTokens: 0,
  imageInputTokens: 0,
  webSearchCalls: 0,
};
