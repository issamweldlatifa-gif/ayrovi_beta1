import { createHash } from 'node:crypto';
import type {
  AiExecutionLane,
  AiMeasuredCost,
  AiUsage,
  AiWorkload,
} from './contracts';

export type AiAuditExecutionLane = Exclude<AiExecutionLane, 'active'>;
export type AiShadowRunPhase = 'request' | 'result' | 'error' | 'blocked';

export interface AiShadowProviderRef {
  provider: string;
  model: string;
}

/** Comparison metadata contains hashes/scores only, never model content. */
export interface AiShadowComparison {
  status: 'not-compared' | 'equivalent' | 'different' | 'invalid';
  schemaVersion: string;
  activeOutputHash?: string;
  candidateOutputHash?: string;
  textSimilarity?: number;
  toolCallMatch?: boolean;
  schemaValid?: boolean;
}

/**
 * Sanitized, correlated record for Shadow/probe audit storage. Deliberately no
 * prompt, response, image, provider diagnostic, tool arguments/results, or
 * side-effect field exists in this contract.
 */
export interface AiShadowRunRecord {
  recordId: string;
  runId: string;
  phase: AiShadowRunPhase;
  executionLane: AiAuditExecutionLane;
  occurredAt: string;
  requestId: string;
  conversationId?: string;
  turnId?: string;
  sessionId?: string;
  userIdHash?: string;
  workload: AiWorkload;
  active?: AiShadowProviderRef;
  candidate: AiShadowProviderRef;
  latencyMs?: number;
  usage?: AiUsage;
  cost?: AiMeasuredCost;
  comparison?: AiShadowComparison;
  errorCode?: string;
  retryable?: boolean;
}

export interface AiShadowDailyUsage {
  records: number;
  runs: number;
  inputTokens: number;
  outputTokens: number;
  amountUsd: number;
}

export interface AiShadowObservabilitySink {
  isAvailable(): Promise<boolean>;
  record(record: AiShadowRunRecord): Promise<void>;
  dailyUsage(day: string, executionLane?: AiAuditExecutionLane): Promise<AiShadowDailyUsage>;
}

const TOP_LEVEL_KEYS = new Set([
  'recordId', 'runId', 'phase', 'executionLane', 'occurredAt', 'requestId',
  'conversationId', 'turnId', 'sessionId', 'userIdHash', 'workload', 'active',
  'candidate', 'latencyMs', 'usage', 'cost', 'comparison', 'errorCode', 'retryable',
]);
const PROVIDER_KEYS = new Set(['provider', 'model']);
const USAGE_KEYS = new Set([
  'inputTokens', 'outputTokens', 'cachedInputTokens', 'audioInputTokens',
  'audioOutputTokens', 'imageInputTokens', 'webSearchCalls',
]);
const COST_KEYS = new Set(['amountUsd', 'source']);
const COMPARISON_KEYS = new Set([
  'status', 'schemaVersion', 'activeOutputHash', 'candidateOutputHash',
  'textSimilarity', 'toolCallMatch', 'schemaValid',
]);

function assertOnlyKeys(value: unknown, allowed: Set<string>, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label} record.`);
  }
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) throw new Error(`Unsafe ${label} field: ${unexpected[0]}`);
}

function assertIdentifier(value: unknown, label: string, maximum = 180): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > maximum || !/^[A-Za-z0-9._:@/+\-=]+$/.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function assertNonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`Invalid ${label}.`);
}

function assertProviderRef(value: unknown, label: string): void {
  assertOnlyKeys(value, PROVIDER_KEYS, label);
  assertIdentifier(value.provider, `${label}.provider`, 100);
  assertIdentifier(value.model, `${label}.model`, 180);
}

/** Runtime allowlist prevents `as any` or object spreading from persisting raw data. */
export function assertSanitizedShadowRunRecord(record: AiShadowRunRecord): void {
  assertOnlyKeys(record, TOP_LEVEL_KEYS, 'shadow');
  assertIdentifier(record.recordId, 'recordId');
  assertIdentifier(record.runId, 'runId');
  assertIdentifier(record.requestId, 'requestId');
  for (const [label, value] of [
    ['conversationId', record.conversationId],
    ['turnId', record.turnId],
    ['sessionId', record.sessionId],
    ['userIdHash', record.userIdHash],
  ] as const) {
    if (value !== undefined) assertIdentifier(value, label);
  }
  if (!['request', 'result', 'error', 'blocked'].includes(record.phase)) throw new Error('Invalid shadow phase.');
  if (!['shadow', 'probe'].includes(record.executionLane)) throw new Error('Invalid audit execution lane.');
  if (!['assistant', 'vision', 'research', 'stock-search', 'magazine', 'voice-delegation'].includes(record.workload)) {
    throw new Error('Invalid shadow workload.');
  }
  if (!Number.isFinite(Date.parse(record.occurredAt))) throw new Error('Invalid occurredAt.');
  assertProviderRef(record.candidate, 'candidate');
  if (record.active) assertProviderRef(record.active, 'active');
  if (record.latencyMs !== undefined) assertNonNegative(record.latencyMs, 'latencyMs');
  if (record.usage) {
    assertOnlyKeys(record.usage, USAGE_KEYS, 'usage');
    for (const key of USAGE_KEYS) assertNonNegative((record.usage as any)[key], `usage.${key}`);
  }
  if (record.cost) {
    assertOnlyKeys(record.cost, COST_KEYS, 'cost');
    assertNonNegative(record.cost.amountUsd, 'cost.amountUsd');
    if (!['provider', 'metered', 'estimated'].includes(record.cost.source)) throw new Error('Invalid cost source.');
  }
  if (record.comparison) {
    assertOnlyKeys(record.comparison, COMPARISON_KEYS, 'comparison');
    if (!['not-compared', 'equivalent', 'different', 'invalid'].includes(record.comparison.status)) {
      throw new Error('Invalid comparison status.');
    }
    assertIdentifier(record.comparison.schemaVersion, 'comparison.schemaVersion', 80);
    if (record.comparison.activeOutputHash !== undefined) assertIdentifier(record.comparison.activeOutputHash, 'activeOutputHash', 128);
    if (record.comparison.candidateOutputHash !== undefined) assertIdentifier(record.comparison.candidateOutputHash, 'candidateOutputHash', 128);
    if (record.comparison.textSimilarity !== undefined) {
      assertNonNegative(record.comparison.textSimilarity, 'textSimilarity');
      if (record.comparison.textSimilarity > 1) throw new Error('Invalid textSimilarity.');
    }
    if (record.comparison.toolCallMatch !== undefined && typeof record.comparison.toolCallMatch !== 'boolean') throw new Error('Invalid toolCallMatch.');
    if (record.comparison.schemaValid !== undefined && typeof record.comparison.schemaValid !== 'boolean') throw new Error('Invalid schemaValid.');
  }
  if (record.errorCode !== undefined) assertIdentifier(record.errorCode, 'errorCode', 100);
  if (record.retryable !== undefined && typeof record.retryable !== 'boolean') throw new Error('Invalid retryable.');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const pairs = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Raw values are consumed in memory and reduced to a one-way audit digest. */
export function shadowOutputDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}
