import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { recordAdminAudit, type AdminAuditActor } from '../admin/audit';
import type { AiCompletionRequest, AiCompletionResult, AiResponsesProviderAdapter } from '../ai-core/contracts';
import { getAyroviAiCore } from '../ai-core/core';
import { ArrivalIngestionError } from './errors';
import { CategoryMasterService, normalizeCategoryCode } from './categoryMasterService';
import type {
  CategoryClassificationLineResult,
  CategoryClassificationSummary,
  CategoryValidation,
  ClassificationSource,
} from './types';

/**
 * AI product Category classification for the Arrival CRM.
 *
 * Flow (unchanged Cards system, additive step):
 *
 *   SKU / Reference + Product Name
 *        -> AI (AYROVI AI Core, `arrival-ingestion` workload)
 *        -> Category Master (official, DB-backed, ACTIVE entries only)
 *        -> confident            -> CLASSIFIED  (source=AI)
 *        -> not confident/invalid -> NEEDS_REVIEW -> manual selection (source=MANUAL)
 *
 * Hard rules enforced here (server-side, never trusting the model):
 * - The AI may only pick a code that EXISTS in the official Category Master.
 * - Inactive categories are not even shown to the model and are rejected.
 * - Subcategory must belong to the selected parent category.
 * - Confidence below the configured threshold => NEEDS_REVIEW.
 * - No category is ever invented: an unusable answer means review, not a guess.
 */

export const DEFAULT_CLASSIFICATION_CONFIDENCE = 0.75;

/** Union-free structured output: missing values use stable sentinels ("", 0). */
export const CATEGORY_CLASSIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['lineId', 'categoryCode', 'subcategoryCode', 'confidence', 'reason'],
        properties: {
          lineId: { type: 'string' },
          categoryCode: { type: 'string' },
          subcategoryCode: { type: 'string' },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

const MAX_LINES_PER_CALL = 40;

export class CategoryClassificationService {
  constructor(
    private readonly db: QatafoDatabase,
    readonly categories: CategoryMasterService = new CategoryMasterService(db),
    private readonly adapter: AiResponsesProviderAdapter = getAyroviAiCore().responses(),
  ) {}

  /**
   * Confidence threshold. Configurable (never an arbitrary hardcoded gate):
   * `ARRIVAL_CLASSIFICATION_CONFIDENCE_THRESHOLD` in [0,1], default 0.75.
   */
  confidenceThreshold(): number {
    const raw = Number(process.env.ARRIVAL_CLASSIFICATION_CONFIDENCE_THRESHOLD);
    if (!Number.isFinite(raw) || raw < 0 || raw > 1) return DEFAULT_CLASSIFICATION_CONFIDENCE;
    return raw;
  }

  /** `auto` (default) enforces the category requirement only while an official
   *  Category Master exists; `off` disables the approval/send gate entirely. */
  gateMode(): 'auto' | 'off' {
    return String(process.env.ARRIVAL_CLASSIFICATION_GATE || 'auto').toLowerCase() === 'off' ? 'off' : 'auto';
  }

  gateEnabled(): boolean {
    return this.gateMode() === 'auto' && this.categories.isAvailable();
  }

  aiConfigured(): boolean {
    return this.adapter.isConfigured();
  }

  /**
   * True when a row may be approved / included in a sendable Card.
   * Legacy rows (classification_required=0) are always allowed: Cards created
   * before this feature keep working exactly as before.
   */
  isSatisfied(row: any): boolean {
    if (!Number(row?.classification_required)) return true;
    if (!this.gateEnabled()) return true;
    return String(row?.classification_status) === 'CLASSIFIED';
  }

  /** Throws unless the row may be approved. Used by the manual/batch approval path. */
  assertSatisfied(row: any): void {
    if (this.isSatisfied(row)) return;
    const reasons = this.parseReasons(row?.classification_reasons);
    throw new ArrivalIngestionError(
      'PRODUCT_CATEGORY_REQUIRED',
      'Sélectionnez une catégorie officielle pour ce produit avant l’approbation (revue manuelle requise).',
      409,
      { productId: row?.id, reasons },
    );
  }

  private parseReasons(value: unknown): string[] {
    try {
      const parsed = JSON.parse(String(value || '[]'));
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [];
    }
  }

  /** Rows of one Card that block approval/send because they are not classified. */
  pendingRows(arrivalClientId: string): Array<{ id: string; productName: string | null; sku: string | null }> {
    if (!this.gateEnabled()) return [];
    return this.db.all<any>(`SELECT id,product_name,sku FROM crm_extracted_products
      WHERE arrival_client_id=? AND is_current=1 AND classification_required=1
        AND classification_status!='CLASSIFIED' ORDER BY created_at,id`, arrivalClientId)
      .map((row) => ({ id: row.id, productName: row.product_name || null, sku: row.sku || null }));
  }

  private emptySummary(reason: 'CATEGORY_MASTER_EMPTY'): CategoryClassificationSummary {
    return { skipped: true, skipReason: reason, total: 0, classified: 0, needsReview: 0, aiConfigured: this.aiConfigured(), errorCode: null, results: [] };
  }

  /** Classify every current line of ONE Customer Arrival Card. */
  classifyCard(arrivalClientId: string, actor: AdminAuditActor, options: { force?: boolean } = {}) {
    const rows = this.db.all<any>(`SELECT * FROM crm_extracted_products
      WHERE arrival_client_id=? AND is_current=1 ORDER BY created_at,id`, arrivalClientId);
    return this.classifyRows(rows, actor, options);
  }

  /** Classify the lines produced by ONE extraction job (post-extraction hook). */
  classifyJob(jobId: string, actor: AdminAuditActor, options: { force?: boolean } = {}) {
    const rows = this.db.all<any>(`SELECT * FROM crm_extracted_products
      WHERE job_id=? AND is_current=1 ORDER BY created_at,id`, jobId);
    return this.classifyRows(rows, actor, options);
  }

  /** Classify a single line. */
  classifyProduct(productId: string, actor: AdminAuditActor, options: { force?: boolean } = {}) {
    const row = this.db.get<any>('SELECT * FROM crm_extracted_products WHERE id=? AND is_current=1', productId);
    if (!row) throw new ArrivalIngestionError('PRODUCT_NOT_FOUND', 'Produit extrait introuvable.', 404);
    return this.classifyRows([row], actor, options);
  }

  /**
   * Manual selection. The code must exist in the official master, be ACTIVE and
   * be coherent with the optional subcategory — free text is impossible because
   * only `code` values present in `crm_categories` are ever accepted.
   */
  setManualCategory(
    productId: string,
    input: { categoryCode: unknown; subcategoryCode?: unknown },
    actor: AdminAuditActor,
  ): CategoryClassificationLineResult {
    const row = this.db.get<any>('SELECT * FROM crm_extracted_products WHERE id=? AND is_current=1', productId);
    if (!row) throw new ArrivalIngestionError('PRODUCT_NOT_FOUND', 'Produit extrait introuvable.', 404);
    const client = this.db.get<any>('SELECT a.status FROM crm_arrival_clients ac JOIN crm_arrivals a ON a.id=ac.arrival_id WHERE ac.id=?', row.arrival_client_id);
    if (client?.status === 'CONFIRMED') {
      throw new ArrivalIngestionError('ARRIVAL_CONFIRMED', 'Cet Arrival est déjà confirmé.', 409);
    }
    const validation = this.categories.validate(input?.categoryCode, input?.subcategoryCode);
    if (!validation.valid) {
      throw new ArrivalIngestionError(
        'CATEGORY_INVALID',
        'Cette catégorie n’est pas valide (absente du Category Master officiel, inactive ou incohérente avec son parent).',
        422,
        { reasons: validation.reasons },
      );
    }
    return this.persist(row, {
      status: 'CLASSIFIED',
      source: 'MANUAL',
      categoryCode: validation.categoryCode,
      subcategoryCode: validation.subcategoryCode,
      // A manual decision has no model confidence; provenance says MANUAL.
      confidence: null,
      reasons: [],
      note: null,
      actor,
      auditAction: 'PRODUCT_CATEGORY_MANUAL',
    });
  }

  /** Clears an AI/manual decision and returns the line to review. */
  clearCategory(productId: string, actor: AdminAuditActor): CategoryClassificationLineResult {
    const row = this.db.get<any>('SELECT * FROM crm_extracted_products WHERE id=? AND is_current=1', productId);
    if (!row) throw new ArrivalIngestionError('PRODUCT_NOT_FOUND', 'Produit extrait introuvable.', 404);
    return this.persist(row, {
      status: 'NEEDS_REVIEW',
      source: null,
      categoryCode: null,
      subcategoryCode: null,
      confidence: null,
      reasons: ['MANUAL_RESET'],
      note: null,
      actor,
      auditAction: 'PRODUCT_CATEGORY_CLEARED',
    });
  }

  /**
   * Run the AI classifier over the given rows and persist a validated outcome
   * per row. Never throws for provider problems: an unavailable AI leaves the
   * rows in NEEDS_REVIEW (review is always the safe outcome) so a classification
   * problem can never lose extracted data or fail an extraction job.
   */
  async classifyRows(
    rows: any[],
    actor: AdminAuditActor,
    options: { force?: boolean } = {},
  ): Promise<CategoryClassificationSummary> {
    if (!this.categories.isAvailable()) {
      // Without an official master there is nothing legal to choose from.
      return this.emptySummary('CATEGORY_MASTER_EMPTY');
    }
    const threshold = this.confidenceThreshold();
    const targets = options.force
      ? rows
      : rows.filter((row) => String(row.classification_status) !== 'CLASSIFIED' || String(row.classification_source || '') !== 'AI');

    if (!targets.length) {
      return {
        skipped: false, skipReason: null, total: rows.length, classified: 0, needsReview: 0,
        aiConfigured: this.aiConfigured(), errorCode: null, results: [],
      };
    }
    if (!this.aiConfigured()) {
      const results = targets.map((row) => this.persist(row, {
        status: 'NEEDS_REVIEW', source: null, categoryCode: null, subcategoryCode: null,
        confidence: null, reasons: ['AI_CLASSIFICATION_UNAVAILABLE'], note: null, actor,
        auditAction: 'PRODUCT_CATEGORY_AI_FAILED',
      }));
      return this.summarize(rows.length, results, 'AI_CLASSIFICATION_NOT_CONFIGURED');
    }

    const results: CategoryClassificationLineResult[] = [];
    let errorCode: string | null = null;
    for (let start = 0; start < targets.length; start += MAX_LINES_PER_CALL) {
      const batch = targets.slice(start, start + MAX_LINES_PER_CALL);
      let answers: Map<string, { categoryCode: string; subcategoryCode: string; confidence: number; reason: string }>;
      try {
        answers = await this.askProvider(batch);
      } catch (error) {
        errorCode = error instanceof Error && error.message.startsWith('AI_') ? error.message : 'AI_CLASSIFICATION_FAILED';
        for (const row of batch) {
          results.push(this.persist(row, {
            status: 'NEEDS_REVIEW', source: null, categoryCode: null, subcategoryCode: null,
            confidence: null, reasons: ['AI_CLASSIFICATION_UNAVAILABLE'],
            note: error instanceof Error ? error.message.slice(0, 300) : null, actor,
            auditAction: 'PRODUCT_CATEGORY_AI_FAILED',
          }));
        }
        continue;
      }
      for (const row of batch) {
        const answer = answers.get(row.id);
        results.push(this.applyAnswer(row, answer, threshold, actor));
      }
    }
    return this.summarize(rows.length, results, errorCode);
  }

  private summarize(total: number, results: CategoryClassificationLineResult[], errorCode: string | null): CategoryClassificationSummary {
    return {
      skipped: false,
      skipReason: null,
      total,
      classified: results.filter((item) => item.status === 'CLASSIFIED').length,
      needsReview: results.filter((item) => item.status !== 'CLASSIFIED').length,
      aiConfigured: this.aiConfigured(),
      errorCode,
      results,
    };
  }

  /**
   * Validate the model answer against the official master and persist it.
   * Anything unusable becomes NEEDS_REVIEW — never a guessed category.
   */
  private applyAnswer(
    row: any,
    answer: { categoryCode: string; subcategoryCode: string; confidence: number; reason: string } | undefined,
    threshold: number,
    actor: AdminAuditActor,
  ): CategoryClassificationLineResult {
    if (!answer) {
      return this.persist(row, {
        status: 'NEEDS_REVIEW', source: null, categoryCode: null, subcategoryCode: null, confidence: null,
        reasons: ['AI_RESPONSE_MISSING_LINE'], note: null, actor, auditAction: 'PRODUCT_CATEGORY_REVIEW',
      });
    }
    const confidence = Number.isFinite(answer.confidence) ? Math.min(1, Math.max(0, answer.confidence)) : 0;
    const code = normalizeCategoryCode(answer.categoryCode);
    const sub = normalizeCategoryCode(answer.subcategoryCode);
    if (!code) {
      return this.persist(row, {
        status: 'NEEDS_REVIEW', source: 'AI', categoryCode: null, subcategoryCode: null, confidence,
        reasons: ['AI_UNABLE_TO_CLASSIFY'], note: answer.reason || null, actor, auditAction: 'PRODUCT_CATEGORY_REVIEW',
      });
    }
    const validation: CategoryValidation = this.categories.validate(code, sub || null);
    if (!validation.valid) {
      // The model proposed a code that is not in the official master (or is
      // inactive / not coherent with its parent). It is rejected, not stored.
      return this.persist(row, {
        status: 'NEEDS_REVIEW', source: 'AI', categoryCode: null, subcategoryCode: null, confidence,
        reasons: validation.reasons.map((reason) => `AI_${reason}`),
        note: answer.reason || null, actor, auditAction: 'PRODUCT_CATEGORY_REVIEW',
      });
    }
    if (confidence < threshold) {
      return this.persist(row, {
        status: 'NEEDS_REVIEW', source: 'AI', categoryCode: validation.categoryCode,
        subcategoryCode: validation.subcategoryCode, confidence,
        reasons: ['AI_CONFIDENCE_BELOW_THRESHOLD'], note: answer.reason || null,
        actor, auditAction: 'PRODUCT_CATEGORY_REVIEW',
      });
    }
    return this.persist(row, {
      status: 'CLASSIFIED', source: 'AI', categoryCode: validation.categoryCode,
      subcategoryCode: validation.subcategoryCode, confidence, reasons: [],
      note: answer.reason || null, actor, auditAction: 'PRODUCT_CATEGORY_AI',
    });
  }

  private persist(
    row: any,
    outcome: {
      status: 'CLASSIFIED' | 'NEEDS_REVIEW' | 'UNCLASSIFIED';
      source: ClassificationSource | null;
      categoryCode: string | null;
      subcategoryCode: string | null;
      confidence: number | null;
      reasons: string[];
      note: string | null;
      actor: AdminAuditActor;
      auditAction: string;
    },
  ): CategoryClassificationLineResult {
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(`UPDATE crm_extracted_products SET
        category_code=?, subcategory_code=?, classification_source=?, classification_confidence=?,
        classification_status=?, classification_reasons=?, classification_note=?, classification_required=1,
        classified_at=?, classified_by=?, updated_at=? WHERE id=?`,
      outcome.categoryCode, outcome.subcategoryCode, outcome.source, outcome.confidence,
      outcome.status, JSON.stringify(outcome.reasons), outcome.note, now,
      outcome.status === 'CLASSIFIED' ? outcome.actor.id : null, now, row.id);
      recordAdminAudit(this.db, outcome.actor, outcome.auditAction, 'CRM_ARRIVALS', row.id, {
        categoryCode: row.category_code || null, subcategoryCode: row.subcategory_code || null,
        classificationSource: row.classification_source || null, classificationStatus: row.classification_status,
      }, {
        categoryCode: outcome.categoryCode, subcategoryCode: outcome.subcategoryCode,
        classificationSource: outcome.source, classificationStatus: outcome.status,
        confidence: outcome.confidence, reasons: outcome.reasons,
      });
    });
    return {
      productId: row.id,
      status: outcome.status,
      source: outcome.source,
      categoryCode: outcome.categoryCode,
      subcategoryCode: outcome.subcategoryCode,
      confidence: outcome.confidence,
      reasons: outcome.reasons,
      note: outcome.note,
    };
  }

  /** One AI call per batch of lines; returns answers keyed by our own row id. */
  private async askProvider(
    batch: any[],
  ): Promise<Map<string, { categoryCode: string; subcategoryCode: string; confidence: number; reason: string }>> {
    const master = this.categories.aiSnapshot();
    const lines = batch.map((row) => ({
      lineId: row.id,
      sku: row.sku || '',
      reference: row.reference || '',
      productName: row.product_name || '',
      variant: row.variant || '',
      color: row.color || '',
    }));
    const instructions = [
      'You are the AYROVI Arrival CRM product category classifier.',
      'Task: map each product line to ONE category from the official AYROVI Warehouse Core Category Master.',
      '',
      'ABSOLUTE RULES:',
      '1. Choose ONLY a code that appears in the CATEGORY MASTER below. Never invent, translate, abbreviate or derive a new code.',
      '2. If the master has no category that clearly fits, return categoryCode "" (empty) for that line. Do not guess.',
      '3. Use subcategoryCode ONLY when it is listed in the master with the selected category as its parent.',
      '4. Do not use inactive categories: they are not listed and must never be returned.',
      '5. confidence is your certainty between 0 and 1. Use a low value when the product name is ambiguous or missing.',
      '6. Return exactly one result object per lineId you were given.',
      '',
      master,
      '',
      'Return JSON only, matching the required schema.',
    ].join('\n');
    const request: AiCompletionRequest = {
      workload: 'arrival-ingestion',
      modelClass: 'fast',
      context: {
        requestId: `arrival_classify_${randomUUID()}`,
        executionLane: 'active',
        promptVersion: 'arrival-category-classification-v1',
        policyVersion: 'category-master-constrained-v1',
      },
      instructions,
      messages: [{ role: 'user', content: [{ type: 'text', text: `LINES:\n${JSON.stringify(lines)}` }] }],
      maxOutputTokens: 4000,
      temperature: 0,
      outputSchema: { name: 'ayrovi_arrival_category_classification', schema: CATEGORY_CLASSIFICATION_SCHEMA as unknown as Record<string, unknown> },
    };
    const result = await this.adapter.complete(request, AbortSignal.timeout(60_000) as unknown as AbortSignal);
    const parsed = this.parseResponse(result.textBlocks.join(''));
    const answers = new Map<string, { categoryCode: string; subcategoryCode: string; confidence: number; reason: string }>();
    for (const item of parsed) {
      const lineId = String(item.lineId || '');
      const match = batch.find((row) => row.id === lineId);
      if (!match) continue;
      answers.set(match.id, {
        categoryCode: String(item.categoryCode ?? ''),
        subcategoryCode: String(item.subcategoryCode ?? ''),
        confidence: Number(item.confidence ?? 0),
        reason: String(item.reason ?? '').slice(0, 300),
      });
    }
    return answers;
  }

  /** Tolerant parse: structured output, compatibility JSON, or fenced JSON. */
  private parseResponse(text: string): any[] {
    const tryParse = (candidate: string): any[] | null => {
      try {
        const value = JSON.parse(candidate);
        if (Array.isArray(value)) return value;
        if (value && Array.isArray(value.results)) return value.results;
        return null;
      } catch {
        return null;
      }
    };
    const direct = tryParse(text.trim());
    if (direct) return direct;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      const inner = tryParse(fenced[1].trim());
      if (inner) return inner;
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const braces = tryParse(text.slice(start, end + 1));
      if (braces) return braces;
    }
    const arrStart = text.indexOf('[');
    const arrEnd = text.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      const brackets = tryParse(text.slice(arrStart, arrEnd + 1));
      if (brackets) return brackets;
    }
    throw new Error('AI_CLASSIFICATION_RESPONSE_INVALID');
  }
}
