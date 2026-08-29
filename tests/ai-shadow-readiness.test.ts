import { afterEach, describe, expect, test, vi } from 'vitest';
import type {
  AiCompletionRequest,
  AiResponsesProviderAdapter,
  AiUsage,
} from '../src/ai-core/contracts';
import { AiLaneBoundResult } from '../src/ai-core/execution';
import {
  evaluateLiveProviderProbeReadiness,
  LiveProviderProbeGateError,
  LiveProviderProbeHarness,
  liveProviderProbeConfigFromEnv,
  type LiveProviderProbeConfig,
} from '../src/ai-core/liveProviderProbe';
import type {
  AiAuditExecutionLane,
  AiShadowDailyUsage,
  AiShadowObservabilitySink,
  AiShadowRunRecord,
} from '../src/ai-core/shadow';
import { SqliteShadowObservabilitySink } from '../src/ai-observability/sqliteShadowSink';
import { QatafoDatabase } from '../src/db/database';
import { readCanonicalLensCache, writeCanonicalLensCache } from '../src/ayrovix/services/lensCache';
import { recordLearningEvent, recordLensEvaluation } from '../src/assistant/learning';

const databases: QatafoDatabase[] = [];
function memoryDatabase(): QatafoDatabase {
  const db = new QatafoDatabase(':memory:');
  databases.push(db);
  return db;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (databases.length) databases.pop()?.close();
});

const zeroDailyUsage = (): AiShadowDailyUsage => ({
  records: 0,
  runs: 0,
  inputTokens: 0,
  outputTokens: 0,
  amountUsd: 0,
});

class MemorySink implements AiShadowObservabilitySink {
  records: AiShadowRunRecord[] = [];
  available = true;
  async isAvailable(): Promise<boolean> { return this.available; }
  async record(record: AiShadowRunRecord): Promise<void> { this.records.push(record); }
  async dailyUsage(_day: string, _lane?: AiAuditExecutionLane): Promise<AiShadowDailyUsage> {
    return zeroDailyUsage();
  }
}

const usage: AiUsage = {
  inputTokens: 3,
  outputTokens: 1,
  cachedInputTokens: 0,
  audioInputTokens: 0,
  audioOutputTokens: 0,
  imageInputTokens: 0,
  webSearchCalls: 0,
};

function fakeCandidate(complete = vi.fn(async (_request: AiCompletionRequest) => ({
  provider: 'candidate-test',
  model: 'candidate-model',
  output: [{ type: 'text' as const, text: 'PRIVATE READY RESPONSE' }],
  textBlocks: ['PRIVATE READY RESPONSE'],
  webResults: [],
  usage,
}))): AiResponsesProviderAdapter {
  return {
    id: 'candidate-test',
    kind: 'responses',
    targetRole: 'primary',
    isConfigured: () => true,
    resolveModel: () => 'candidate-model',
    complete,
    stream: async () => { throw new Error('not used'); },
  };
}

function readyConfig(overrides: Partial<LiveProviderProbeConfig> = {}): LiveProviderProbeConfig {
  return {
    environmentGateEnabled: true,
    configuredApprovalId: 'approval-2026-08-29',
    billingAttested: true,
    budgetEnforcementEnabled: true,
    maxRunCostUsd: 0.02,
    estimatedRunCostUsd: 0.001,
    dailyBudgetUsd: 0.10,
    canonicalIsolationReady: true,
    writeToolsBlocked: true,
    toolsDisabled: true,
    userDataDisabled: true,
    ...overrides,
  };
}

describe('live-provider readiness gate (no live provider)', () => {
  test('fails closed when environment, billing, approval, budgets and controls are absent', async () => {
    const complete = vi.fn();
    const candidate = fakeCandidate(complete);
    candidate.isConfigured = () => false;
    const sink = new MemorySink();
    sink.available = false;
    const harness = new LiveProviderProbeHarness(
      candidate,
      sink,
      liveProviderProbeConfigFromEnv({}),
    );

    const readiness = await harness.readiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.liveCallPerformed).toBe(false);
    expect(readiness.shadowModeActive).toBe(false);
    expect(readiness.canaryActive).toBe(false);
    expect(readiness.blockers).toEqual(expect.arrayContaining([
      'ENVIRONMENT_GATE_CLOSED',
      'EXPLICIT_APPROVAL_MISSING',
      'TARGET_NOT_CONFIGURED',
      'BILLING_NOT_ATTESTED',
      'OBSERVABILITY_UNAVAILABLE',
      'COST_METER_UNAVAILABLE',
      'BUDGET_ENFORCEMENT_DISABLED',
      'CANONICAL_ISOLATION_UNPROVEN',
      'WRITE_TOOL_BLOCK_UNPROVEN',
    ]));
    await expect(harness.run({ approvalId: 'wrong', approvedBy: 'test-reviewer' }))
      .rejects.toBeInstanceOf(LiveProviderProbeGateError);
    expect(complete).not.toHaveBeenCalled();
  });

  test('requires an available sanitized observability sink', () => {
    const report = evaluateLiveProviderProbeReadiness({
      environmentGateEnabled: true,
      explicitApprovalMatches: true,
      targetConfigured: true,
      billingAttested: true,
      observabilityAvailable: false,
      costMeterAvailable: true,
      budgetEnforcementEnabled: true,
      maxRunCostUsd: 0.01,
      estimatedRunCostUsd: 0.001,
      dailyBudgetUsd: 0.1,
      dailySpentUsd: 0,
      canonicalIsolationReady: true,
      writeToolsBlocked: true,
      toolsDisabled: true,
      userDataDisabled: true,
    });
    expect(report.ready).toBe(false);
    expect(report.blockers).toContain('OBSERVABILITY_UNAVAILABLE');
  });

  test('can exercise only a synthetic tool-free probe against an injected fake adapter', async () => {
    const complete = vi.fn(async (request: AiCompletionRequest) => ({
      provider: 'candidate-test',
      model: 'candidate-model',
      output: [{ type: 'text' as const, text: 'PRIVATE READY RESPONSE' }],
      textBlocks: ['PRIVATE READY RESPONSE'],
      webResults: [],
      usage,
    }));
    const sink = new MemorySink();
    const harness = new LiveProviderProbeHarness(
      fakeCandidate(complete),
      sink,
      readyConfig(),
      () => ({ amountUsd: 0.001, source: 'estimated' }),
    );

    const receipt = await harness.run({
      approvalId: 'approval-2026-08-29',
      approvedBy: 'test-reviewer',
    });

    expect(complete).toHaveBeenCalledTimes(1);
    const probeRequest = complete.mock.calls[0][0];
    expect(probeRequest.context?.executionLane).toBe('probe');
    expect(probeRequest.toolChoice).toBe('none');
    expect(probeRequest.tools).toEqual([]);
    expect(probeRequest.webSearch).toBeUndefined();
    expect(probeRequest.messages.flatMap((message) => message.content).some((part) => part.type === 'image')).toBe(false);
    expect(receipt).not.toHaveProperty('output');
    expect(receipt.outputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(sink.records.map((record) => record.phase)).toEqual(['request', 'result']);
    expect(JSON.stringify(sink.records)).not.toContain('PRIVATE READY RESPONSE');
  });

  test('audits and rejects an injected fake result that exceeds the actual run budget', async () => {
    const sink = new MemorySink();
    const harness = new LiveProviderProbeHarness(
      fakeCandidate(),
      sink,
      readyConfig(),
      () => ({ amountUsd: 0.03, source: 'metered' }),
    );

    await expect(harness.run({
      approvalId: 'approval-2026-08-29',
      approvedBy: 'test-reviewer',
    })).rejects.toThrow('PROBE_RUN_BUDGET_EXCEEDED');
    expect(sink.records.map((record) => record.phase)).toEqual(['request', 'error']);
    expect(sink.records[1]).toMatchObject({
      errorCode: 'PROBE_RUN_BUDGET_EXCEEDED',
      cost: { amountUsd: 0.03, source: 'metered' },
      usage,
    });
  });
});

describe('sanitized Shadow observability', () => {
  test('persists only correlated metadata and supports actual daily usage/cost totals', async () => {
    const db = memoryDatabase();
    const sink = new SqliteShadowObservabilitySink(db);
    expect(await sink.isAvailable()).toBe(true);

    await sink.record({
      recordId: 'record-1',
      runId: 'run-1',
      phase: 'result',
      executionLane: 'shadow',
      occurredAt: '2026-08-29T12:00:00.000Z',
      requestId: 'request-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      sessionId: 'session-1',
      userIdHash: 'sha256:user-1',
      workload: 'assistant',
      active: { provider: 'active-provider', model: 'active-model' },
      candidate: { provider: 'candidate-provider', model: 'candidate-model' },
      latencyMs: 125,
      usage,
      cost: { amountUsd: 0.0015, source: 'metered' },
      comparison: {
        status: 'different',
        schemaVersion: 'comparison-v1',
        activeOutputHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        candidateOutputHash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        textSimilarity: 0.75,
        toolCallMatch: true,
        schemaValid: true,
      },
    });

    const row = db.get<any>('SELECT * FROM ai_shadow_run_records WHERE record_id=?', 'record-1');
    expect(row).toMatchObject({
      run_id: 'run-1',
      execution_lane: 'shadow',
      input_tokens: 3,
      output_tokens: 1,
      cost_usd: 0.0015,
      cost_source: 'metered',
    });
    const columns = db.all<any>('PRAGMA table_info(ai_shadow_run_records)').map((entry) => entry.name);
    expect(columns).not.toEqual(expect.arrayContaining([
      'prompt', 'response', 'image', 'provider_diagnostic', 'tool_arguments', 'tool_result',
    ]));
    await expect(sink.record({
      recordId: 'record-unsafe',
      runId: 'run-unsafe',
      phase: 'request',
      executionLane: 'shadow',
      occurredAt: '2026-08-29T12:01:00.000Z',
      requestId: 'request-unsafe',
      workload: 'assistant',
      candidate: { provider: 'candidate-provider', model: 'candidate-model' },
      rawPrompt: 'never persist this',
    } as any)).rejects.toThrow(/Unsafe shadow field/);

    await expect(sink.dailyUsage('2026-08-29', 'shadow')).resolves.toEqual({
      records: 1,
      runs: 1,
      inputTokens: 3,
      outputTokens: 1,
      amountUsd: 0.0015,
    });
  });
});

describe('AYROVIX execution-lane isolation', () => {
  test('lane-bound Shadow/probe results cannot be serialized or published to UI', () => {
    const privateResult = { pricing: { sale_price: 99 }, productFact: 'candidate-only' };
    for (const executionLane of ['shadow', 'probe'] as const) {
      const bound = new AiLaneBoundResult(executionLane, privateResult);
      expect(() => bound.canonicalValue()).toThrow(/forbidden/i);
      expect(JSON.stringify(bound)).not.toContain('candidate-only');
      expect(bound.auditMap((value) => value.pricing.sale_price)).toBe(99);
    }
    const active = new AiLaneBoundResult('active', privateResult);
    expect(active.canonicalValue()).toBe(privateResult);
    expect(() => active.auditMap(() => null)).toThrow(/canonical publication path/i);
  });

  test('shadow/probe cannot read, replace or evict the canonical Lens cache', () => {
    const db = memoryDatabase();
    const createdAt = '2026-08-29T12:00:00.000Z';
    const now = Date.parse(createdAt) + 1_000;
    const activeResult = { pricing: { sale_price: 42 }, source: 'active' };

    expect(writeCanonicalLensCache(db, {
      imageHash: 'image-hash-1', result: activeResult, model: 'active-model', createdAt, lane: 'active',
    }, now)).toBe(true);
    expect(readCanonicalLensCache(db, 'image-hash-1', 'active', now)).toEqual(activeResult);
    expect(readCanonicalLensCache(db, 'image-hash-1', 'shadow', now)).toBeNull();
    expect(readCanonicalLensCache(db, 'image-hash-1', 'probe', now)).toBeNull();

    expect(writeCanonicalLensCache(db, {
      imageHash: 'image-hash-1', result: { source: 'shadow' }, model: 'candidate', createdAt, lane: 'shadow',
    }, now)).toBe(false);
    expect(writeCanonicalLensCache(db, {
      imageHash: 'image-hash-2', result: { source: 'probe' }, model: 'candidate', createdAt, lane: 'probe',
    }, now)).toBe(false);

    expect(db.all<any>('SELECT image_hash,result_json FROM lens_analysis_cache')).toHaveLength(1);
    expect(readCanonicalLensCache(db, 'image-hash-1', 'active', now)).toEqual(activeResult);
  });

  test('shadow/probe never enter canonical evaluations or learning aggregates', () => {
    const db = memoryDatabase();
    const evaluation = {
      expected: { price: 10 }, actual: { price: 12 }, errorType: 'WRONG_PRICE', source: 'lab' as const,
    };

    expect(recordLensEvaluation(db, { ...evaluation, executionLane: 'shadow' })).toBe(false);
    expect(recordLensEvaluation(db, { ...evaluation, executionLane: 'probe' })).toBe(false);
    expect(recordLearningEvent(db, { executionLane: 'shadow', type: 'LENS_RESULT', success: false })).toBe(false);
    expect(recordLearningEvent(db, { executionLane: 'probe', type: 'CHAT_TURN', success: false })).toBe(false);
    expect(db.get<any>('SELECT COUNT(*) count FROM lens_evaluations')?.count).toBe(0);
    expect(db.get<any>('SELECT COUNT(*) count FROM ai_learning_events')?.count).toBe(0);

    expect(recordLensEvaluation(db, { ...evaluation, executionLane: 'active' })).toBe(true);
    expect(recordLearningEvent(db, { executionLane: 'active', type: 'LENS_RESULT', success: true })).toBe(true);
    expect(db.get<any>('SELECT COUNT(*) count FROM lens_evaluations')?.count).toBe(1);
    expect(db.get<any>('SELECT COUNT(*) count FROM ai_learning_events')?.count).toBe(1);
  });
});
