import type { QatafoDatabase } from '../db/database';
import {
  assertSanitizedShadowRunRecord,
  type AiAuditExecutionLane,
  type AiShadowDailyUsage,
  type AiShadowObservabilitySink,
  type AiShadowRunRecord,
} from '../ai-core/shadow';

const boolOrNull = (value: boolean | undefined): number | null => (
  value === undefined ? null : value ? 1 : 0
);

/** Durable, queryable sink dedicated to sanitized Shadow/probe metadata. */
export class SqliteShadowObservabilitySink implements AiShadowObservabilitySink {
  constructor(private readonly db: QatafoDatabase) {}

  async isAvailable(): Promise<boolean> {
    try {
      const table = this.db.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_shadow_run_records'",
      );
      this.db.get('SELECT 1 AS ready');
      return table?.name === 'ai_shadow_run_records';
    } catch {
      return false;
    }
  }

  async record(record: AiShadowRunRecord): Promise<void> {
    // Validate before preparing any persistence statement. Unexpected fields
    // (for example rawPrompt/providerDiagnostic) fail closed rather than being ignored.
    assertSanitizedShadowRunRecord(record);
    const usage = record.usage;
    const comparison = record.comparison;
    this.db.run(`INSERT INTO ai_shadow_run_records (
      record_id,run_id,phase,execution_lane,occurred_at,request_id,
      conversation_id,turn_id,session_id,user_id_hash,workload,
      active_provider,active_model,candidate_provider,candidate_model,latency_ms,
      input_tokens,output_tokens,cached_input_tokens,audio_input_tokens,audio_output_tokens,image_input_tokens,web_search_calls,
      cost_usd,cost_source,comparison_status,comparison_schema_version,active_output_hash,candidate_output_hash,
      text_similarity,tool_call_match,schema_valid,error_code,retryable
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    record.recordId,
    record.runId,
    record.phase,
    record.executionLane,
    record.occurredAt,
    record.requestId,
    record.conversationId || '',
    record.turnId || '',
    record.sessionId || '',
    record.userIdHash || '',
    record.workload,
    record.active?.provider || '',
    record.active?.model || '',
    record.candidate.provider,
    record.candidate.model,
    record.latencyMs ?? null,
    usage?.inputTokens ?? null,
    usage?.outputTokens ?? null,
    usage?.cachedInputTokens ?? null,
    usage?.audioInputTokens ?? null,
    usage?.audioOutputTokens ?? null,
    usage?.imageInputTokens ?? null,
    usage?.webSearchCalls ?? null,
    record.cost?.amountUsd ?? null,
    record.cost?.source ?? null,
    comparison?.status ?? null,
    comparison?.schemaVersion ?? null,
    comparison?.activeOutputHash ?? null,
    comparison?.candidateOutputHash ?? null,
    comparison?.textSimilarity ?? null,
    boolOrNull(comparison?.toolCallMatch),
    boolOrNull(comparison?.schemaValid),
    record.errorCode ?? null,
    boolOrNull(record.retryable));
  }

  async dailyUsage(day: string, executionLane?: AiAuditExecutionLane): Promise<AiShadowDailyUsage> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid observability day.');
    const laneClause = executionLane ? ' AND execution_lane=?' : '';
    const params = executionLane ? [day, executionLane] : [day];
    const row = this.db.get<any>(`SELECT
      COUNT(*) records,
      COUNT(DISTINCT run_id) runs,
      COALESCE(SUM(input_tokens),0) input_tokens,
      COALESCE(SUM(output_tokens),0) output_tokens,
      COALESCE(SUM(cost_usd),0) amount_usd
      FROM ai_shadow_run_records
      WHERE substr(occurred_at,1,10)=?${laneClause}`, ...params);
    return {
      records: Number(row?.records || 0),
      runs: Number(row?.runs || 0),
      inputTokens: Number(row?.input_tokens || 0),
      outputTokens: Number(row?.output_tokens || 0),
      amountUsd: Number(row?.amount_usd || 0),
    };
  }
}
