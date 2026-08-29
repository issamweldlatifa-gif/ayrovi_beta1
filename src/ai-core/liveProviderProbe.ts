import { randomUUID } from 'node:crypto';
import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiMeasuredCost,
  AiResponsesProviderAdapter,
} from './contracts';
import { AiProviderError } from './errors';
import {
  shadowOutputDigest,
  type AiShadowObservabilitySink,
  type AiShadowRunRecord,
} from './shadow';

export type LiveProviderReadinessBlocker =
  | 'ENVIRONMENT_GATE_CLOSED'
  | 'EXPLICIT_APPROVAL_MISSING'
  | 'TARGET_NOT_CONFIGURED'
  | 'BILLING_NOT_ATTESTED'
  | 'OBSERVABILITY_UNAVAILABLE'
  | 'COST_METER_UNAVAILABLE'
  | 'BUDGET_ENFORCEMENT_DISABLED'
  | 'RUN_BUDGET_INVALID'
  | 'RUN_BUDGET_EXCEEDED'
  | 'DAILY_BUDGET_INVALID'
  | 'DAILY_BUDGET_EXCEEDED'
  | 'CANONICAL_ISOLATION_UNPROVEN'
  | 'WRITE_TOOL_BLOCK_UNPROVEN'
  | 'TOOLS_NOT_DISABLED'
  | 'USER_DATA_NOT_DISABLED';

export interface LiveProviderProbeReadinessInput {
  environmentGateEnabled: boolean;
  explicitApprovalMatches: boolean;
  targetConfigured: boolean;
  billingAttested: boolean;
  observabilityAvailable: boolean;
  costMeterAvailable: boolean;
  budgetEnforcementEnabled: boolean;
  maxRunCostUsd: number;
  estimatedRunCostUsd: number;
  dailyBudgetUsd: number;
  dailySpentUsd: number;
  canonicalIsolationReady: boolean;
  writeToolsBlocked: boolean;
  toolsDisabled: boolean;
  userDataDisabled: boolean;
}

export interface LiveProviderProbeReadiness {
  ready: boolean;
  blockers: LiveProviderReadinessBlocker[];
  shadowModeActive: false;
  canaryActive: false;
  liveCallPerformed: false;
  checks: Omit<LiveProviderProbeReadinessInput, 'maxRunCostUsd' | 'estimatedRunCostUsd' | 'dailyBudgetUsd' | 'dailySpentUsd'> & {
    runBudgetWithinLimit: boolean;
    dailyBudgetWithinLimit: boolean;
  };
}

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Pure, deterministic and fail-closed readiness evaluation. */
export function evaluateLiveProviderProbeReadiness(
  input: LiveProviderProbeReadinessInput,
): LiveProviderProbeReadiness {
  const blockers: LiveProviderReadinessBlocker[] = [];
  if (!input.environmentGateEnabled) blockers.push('ENVIRONMENT_GATE_CLOSED');
  if (!input.explicitApprovalMatches) blockers.push('EXPLICIT_APPROVAL_MISSING');
  if (!input.targetConfigured) blockers.push('TARGET_NOT_CONFIGURED');
  if (!input.billingAttested) blockers.push('BILLING_NOT_ATTESTED');
  if (!input.observabilityAvailable) blockers.push('OBSERVABILITY_UNAVAILABLE');
  if (!input.costMeterAvailable) blockers.push('COST_METER_UNAVAILABLE');
  if (!input.budgetEnforcementEnabled) blockers.push('BUDGET_ENFORCEMENT_DISABLED');
  if (!validPositive(input.maxRunCostUsd) || !validPositive(input.estimatedRunCostUsd)) blockers.push('RUN_BUDGET_INVALID');
  else if (input.estimatedRunCostUsd > input.maxRunCostUsd) blockers.push('RUN_BUDGET_EXCEEDED');
  if (!validPositive(input.dailyBudgetUsd) || !Number.isFinite(input.dailySpentUsd) || input.dailySpentUsd < 0) blockers.push('DAILY_BUDGET_INVALID');
  else if (input.dailySpentUsd + input.estimatedRunCostUsd > input.dailyBudgetUsd) blockers.push('DAILY_BUDGET_EXCEEDED');
  if (!input.canonicalIsolationReady) blockers.push('CANONICAL_ISOLATION_UNPROVEN');
  if (!input.writeToolsBlocked) blockers.push('WRITE_TOOL_BLOCK_UNPROVEN');
  if (!input.toolsDisabled) blockers.push('TOOLS_NOT_DISABLED');
  if (!input.userDataDisabled) blockers.push('USER_DATA_NOT_DISABLED');

  return {
    ready: blockers.length === 0,
    blockers,
    shadowModeActive: false,
    canaryActive: false,
    liveCallPerformed: false,
    checks: {
      environmentGateEnabled: input.environmentGateEnabled,
      explicitApprovalMatches: input.explicitApprovalMatches,
      targetConfigured: input.targetConfigured,
      billingAttested: input.billingAttested,
      observabilityAvailable: input.observabilityAvailable,
      costMeterAvailable: input.costMeterAvailable,
      budgetEnforcementEnabled: input.budgetEnforcementEnabled,
      canonicalIsolationReady: input.canonicalIsolationReady,
      writeToolsBlocked: input.writeToolsBlocked,
      toolsDisabled: input.toolsDisabled,
      userDataDisabled: input.userDataDisabled,
      runBudgetWithinLimit: validPositive(input.maxRunCostUsd)
        && validPositive(input.estimatedRunCostUsd)
        && input.estimatedRunCostUsd <= input.maxRunCostUsd,
      dailyBudgetWithinLimit: validPositive(input.dailyBudgetUsd)
        && Number.isFinite(input.dailySpentUsd)
        && input.dailySpentUsd >= 0
        && input.dailySpentUsd + input.estimatedRunCostUsd <= input.dailyBudgetUsd,
    },
  };
}

export interface LiveProviderProbeConfig {
  environmentGateEnabled: boolean;
  configuredApprovalId: string;
  billingAttested: boolean;
  budgetEnforcementEnabled: boolean;
  maxRunCostUsd: number;
  estimatedRunCostUsd: number;
  dailyBudgetUsd: number;
  canonicalIsolationReady: boolean;
  writeToolsBlocked: boolean;
  toolsDisabled: boolean;
  userDataDisabled: boolean;
}

export function liveProviderProbeConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  controls: Pick<LiveProviderProbeConfig,
    'canonicalIsolationReady' | 'writeToolsBlocked' | 'toolsDisabled' | 'userDataDisabled'> = {
      canonicalIsolationReady: false,
      writeToolsBlocked: false,
      toolsDisabled: false,
      userDataDisabled: false,
    },
): LiveProviderProbeConfig {
  return {
    environmentGateEnabled: env.AYROVI_LIVE_PROVIDER_PROBE_ENABLED === 'true',
    configuredApprovalId: String(env.AYROVI_LIVE_PROVIDER_PROBE_APPROVAL_ID || '').trim(),
    billingAttested: env.AYROVI_TARGET_PROVIDER_BILLING_READY === 'attested',
    budgetEnforcementEnabled: env.AYROVI_AI_BUDGET_ENFORCEMENT === 'true',
    maxRunCostUsd: Number(env.AYROVI_PROBE_MAX_RUN_USD),
    estimatedRunCostUsd: Number(env.AYROVI_PROBE_ESTIMATED_RUN_USD),
    dailyBudgetUsd: Number(env.AYROVI_PROBE_DAILY_BUDGET_USD),
    ...controls,
  };
}

export interface LiveProviderProbeApproval {
  approvalId: string;
  approvedBy: string;
}

export type LiveProviderProbeCostMeter = (
  result: AiCompletionResult,
) => AiMeasuredCost | undefined;

export interface LiveProviderProbeReceipt {
  runId: string;
  requestId: string;
  provider: string;
  model: string;
  latencyMs: number;
  usage: NonNullable<AiCompletionResult['usage']>;
  cost: AiMeasuredCost;
  outputHash: string;
}

export class LiveProviderProbeGateError extends Error {
  readonly code = 'LIVE_PROVIDER_PROBE_NOT_READY';
  constructor(readonly readiness: LiveProviderProbeReadiness) {
    super('Live provider probe is not ready.');
    this.name = 'LiveProviderProbeGateError';
  }
}

class LiveProviderProbeBudgetError extends Error {
  constructor(
    code: 'PROBE_RUN_BUDGET_EXCEEDED' | 'PROBE_DAILY_BUDGET_EXCEEDED',
    readonly usage: NonNullable<AiCompletionResult['usage']>,
    readonly cost: AiMeasuredCost,
  ) {
    super(code);
    this.name = 'LiveProviderProbeBudgetError';
  }
}

/**
 * Not wired to any route or scheduler. It can issue one fixed, synthetic,
 * tool-free probe only after every independent gate is explicitly satisfied.
 */
export class LiveProviderProbeHarness {
  constructor(
    private readonly candidate: AiResponsesProviderAdapter,
    private readonly sink: AiShadowObservabilitySink,
    private readonly config: LiveProviderProbeConfig,
    private readonly costMeter?: LiveProviderProbeCostMeter,
  ) {}

  async readiness(approval?: LiveProviderProbeApproval): Promise<LiveProviderProbeReadiness> {
    const day = new Date().toISOString().slice(0, 10);
    const observabilityAvailable = await this.sink.isAvailable().catch(() => false);
    const dailySpentUsd = observabilityAvailable
      ? (await this.sink.dailyUsage(day, 'probe').catch(() => ({ amountUsd: Number.NaN } as any))).amountUsd
      : Number.NaN;
    const explicitApprovalMatches = Boolean(
      approval?.approvalId
      && approval?.approvedBy
      && this.config.configuredApprovalId
      && approval.approvalId === this.config.configuredApprovalId,
    );
    return evaluateLiveProviderProbeReadiness({
      environmentGateEnabled: this.config.environmentGateEnabled,
      explicitApprovalMatches,
      targetConfigured: this.candidate.isConfigured(),
      billingAttested: this.config.billingAttested,
      observabilityAvailable,
      costMeterAvailable: Boolean(this.costMeter),
      budgetEnforcementEnabled: this.config.budgetEnforcementEnabled,
      maxRunCostUsd: this.config.maxRunCostUsd,
      estimatedRunCostUsd: this.config.estimatedRunCostUsd,
      dailyBudgetUsd: this.config.dailyBudgetUsd,
      dailySpentUsd,
      canonicalIsolationReady: this.config.canonicalIsolationReady,
      writeToolsBlocked: this.config.writeToolsBlocked,
      toolsDisabled: this.config.toolsDisabled,
      userDataDisabled: this.config.userDataDisabled,
    });
  }

  async run(approval: LiveProviderProbeApproval, signal?: AbortSignal): Promise<LiveProviderProbeReceipt> {
    const readiness = await this.readiness(approval);
    if (!readiness.ready) throw new LiveProviderProbeGateError(readiness);

    const runId = `probe_${randomUUID()}`;
    const requestId = `request_${randomUUID()}`;
    const model = this.candidate.resolveModel('assistant', 'fast');
    const startedAt = Date.now();
    const baseRecord = {
      runId,
      executionLane: 'probe' as const,
      requestId,
      workload: 'assistant' as const,
      candidate: { provider: this.candidate.id, model },
    };
    const requestRecord: AiShadowRunRecord = {
      ...baseRecord,
      recordId: `shadow_record_${randomUUID()}`,
      phase: 'request',
      occurredAt: new Date(startedAt).toISOString(),
    };

    // If the audit write fails, no provider call is permitted.
    await this.sink.record(requestRecord);

    const request: AiCompletionRequest = {
      workload: 'assistant',
      modelClass: 'fast',
      context: {
        requestId,
        executionLane: 'probe',
        promptVersion: 'synthetic-readiness-v1',
        policyVersion: 'ai-core-probe-v1',
      },
      instructions: 'This is a synthetic readiness check. Return only the word READY.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'READY' }] }],
      maxOutputTokens: 8,
      temperature: 0,
      tools: [],
      toolChoice: 'none',
    };

    try {
      const timeoutSignal = AbortSignal.timeout(15_000);
      const guardedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      const result = await this.candidate.complete(request, guardedSignal);
      if (!result.usage) throw new Error('PROBE_USAGE_UNAVAILABLE');
      const cost = this.costMeter?.(result);
      if (!cost || !Number.isFinite(cost.amountUsd) || cost.amountUsd < 0) throw new Error('PROBE_COST_UNAVAILABLE');
      const spentToday = (await this.sink.dailyUsage(new Date().toISOString().slice(0, 10), 'probe')).amountUsd;
      if (cost.amountUsd > this.config.maxRunCostUsd) {
        throw new LiveProviderProbeBudgetError('PROBE_RUN_BUDGET_EXCEEDED', result.usage, cost);
      }
      if (spentToday + cost.amountUsd > this.config.dailyBudgetUsd) {
        throw new LiveProviderProbeBudgetError('PROBE_DAILY_BUDGET_EXCEEDED', result.usage, cost);
      }
      const outputHash = shadowOutputDigest(result.output);
      const latencyMs = Date.now() - startedAt;
      await this.sink.record({
        ...baseRecord,
        recordId: `shadow_record_${randomUUID()}`,
        phase: 'result',
        occurredAt: new Date().toISOString(),
        candidate: { provider: result.provider, model: result.model },
        latencyMs,
        usage: result.usage,
        cost,
        comparison: {
          status: 'not-compared',
          schemaVersion: 'probe-v1',
          candidateOutputHash: outputHash,
          schemaValid: true,
        },
      });
      return {
        runId,
        requestId,
        provider: result.provider,
        model: result.model,
        latencyMs,
        usage: result.usage,
        cost,
        outputHash,
      };
    } catch (error) {
      const providerError = error instanceof AiProviderError ? error : null;
      const budgetError = error instanceof LiveProviderProbeBudgetError ? error : null;
      const rawCode = providerError?.code || (error instanceof Error ? error.message : 'PROBE_FAILED');
      const errorCode = /^[A-Z0-9_]{2,100}$/.test(rawCode) ? rawCode : 'PROBE_FAILED';
      await this.sink.record({
        ...baseRecord,
        recordId: `shadow_record_${randomUUID()}`,
        phase: 'error',
        occurredAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        ...(budgetError ? { usage: budgetError.usage, cost: budgetError.cost } : {}),
        errorCode,
        retryable: providerError?.retryable === true,
      });
      throw error;
    }
  }
}
