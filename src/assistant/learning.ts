import { createHash, randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';

/**
 * AYROVI Continuous Learning — couche d'observation sûre.
 * Enregistre des SIGNAUX agrégés et anonymisés (jamais de conversations brutes
 * exposées), détecte les corrections clients, calcule un Resolution Score et
 * alimente le Discovery dashboard. Aucune modification automatique de prompts
 * ou de modèles : les données servent à l'évaluation humaine (Admin).
 */

export type LearningEventType =
  | 'CHAT_TURN' | 'FEEDBACK_UP' | 'FEEDBACK_DOWN' | 'CUSTOMER_CORRECTION'
  | 'HUMAN_INTERVENTION' | 'ORDER_CONVERSION' | 'TOOL_FAILURE' | 'LENS_RESULT';

export function ownerHashOf(customerId: string | null, sessionId: string): string {
  return customerId ? `account:${createHash('sha256').update(customerId).digest('hex').slice(0, 16)}`
    : `guest:${createHash('sha256').update(sessionId).digest('hex').slice(0, 16)}`;
}

export function recordLearningEvent(
  db: QatafoDatabase,
  event: { type: LearningEventType; conversationId?: string; ownerHash?: string; tools?: string[]; success?: boolean; confidence?: number; meta?: Record<string, any> },
): void {
  try {
    db.run(`INSERT INTO ai_learning_events (id,conversation_id,owner_hash,event_type,tool_names,success,confidence,meta_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      `learn_${randomUUID()}`, event.conversationId || '', event.ownerHash || '', event.type,
      (event.tools || []).join(','), event.success ? 1 : 0, event.confidence || 0,
      JSON.stringify(event.meta || {}).slice(0, 4000), new Date().toISOString());
  } catch (error: any) {
    console.warn('[Learning]', error?.message || 'event write failed');
  }
}

/** Détecte une correction de prix par le client : « لا، السعر 39.99 » / « non, 39,99 € ». */
export function detectPriceCorrection(text: string): { value: number; currency: string | null } | null {
  const value = String(text || '');
  if (!/(?:^|\s)(لا|non|no|wrong|faux|incorrect|erreur)(?:\s|,|،|:|!|$)/i.test(value)) return null;
  const match = value.match(/(\d{1,6}(?:[.,]\d{1,3})?)\s*(€|EUR|USD|\$|GBP|£|JPY|¥|DT|TND)?/i);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, '.'));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000) return null;
  const symbol = (match[2] || '').toUpperCase();
  const currencyMap: Record<string, string> = { '€': 'EUR', EUR: 'EUR', '$': 'USD', USD: 'USD', '£': 'GBP', GBP: 'GBP', '¥': 'JPY', JPY: 'JPY', DT: 'TND', TND: 'TND' };
  return { value: parsed, currency: currencyMap[symbol] || null };
}

/** Classe une erreur Lens attendue vs détectée (taxonomie §12). */
export function classifyPriceError(expected: number, detected: number | null, expectedCurrency: string | null, detectedCurrency: string | null): string {
  if (detected == null) return 'PRICE_MISSED';
  if (expectedCurrency && detectedCurrency && expectedCurrency !== detectedCurrency) return 'WRONG_CURRENCY';
  if (detected > expected * 1.2) return 'SALE_VS_ORIGINAL_PRICE';
  if (detected < expected * 0.8) return 'PARTIAL_PRICE_READ';
  return 'WRONG_PRICE';
}

export function recordLensEvaluation(
  db: QatafoDatabase,
  evaluation: { imageHash?: string; expected: Record<string, any>; actual: Record<string, any>; errorType: string; note?: string; source: 'lab' | 'chat' },
): void {
  try {
    db.run(`INSERT INTO lens_evaluations (id,image_hash,expected_json,actual_json,error_type,note,source,created_at) VALUES (?,?,?,?,?,?,?,?)`,
      `lens_eval_${randomUUID()}`, evaluation.imageHash || '', JSON.stringify(evaluation.expected).slice(0, 4000),
      JSON.stringify(evaluation.actual).slice(0, 4000), evaluation.errorType, (evaluation.note || '').slice(0, 500),
      evaluation.source, new Date().toISOString());
  } catch (error: any) {
    console.warn('[Learning eval]', error?.message || 'write failed');
  }
}

/** Aggrégats Discovery pour l'Admin : où l'AI excelle, où elle échoue, gaps. */
export function discoveryAggregates(db: QatafoDatabase) {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const turns = db.all<any>(`SELECT * FROM ai_learning_events WHERE created_at>=? ORDER BY created_at DESC LIMIT 2000`, since);
  const byType = new Map<string, number>();
  const toolFailures = new Map<string, number>();
  let resolutions = 0;
  let resolved = 0;
  let corrections = 0;
  let interventions = 0;
  let lensRuns = 0;
  let lensVerified = 0;
  for (const row of turns) {
    byType.set(row.event_type, (byType.get(row.event_type) || 0) + 1);
    if (row.event_type === 'CHAT_TURN') {
      resolutions += 1;
      if (row.success) resolved += 1;
      if (!row.success && row.tool_names) {
        for (const tool of String(row.tool_names).split(',').filter(Boolean)) {
          toolFailures.set(tool, (toolFailures.get(tool) || 0) + 1);
        }
      }
    }
    if (row.event_type === 'CUSTOMER_CORRECTION') corrections += 1;
    if (row.event_type === 'HUMAN_INTERVENTION') interventions += 1;
    if (row.event_type === 'LENS_RESULT') {
      lensRuns += 1;
      if (row.success) lensVerified += 1;
    }
  }
  const errors = db.all<any>(`SELECT error_type, COUNT(*) count FROM lens_evaluations GROUP BY error_type ORDER BY count DESC LIMIT 8`);
  const questions = db.all<any>(`SELECT meta_json FROM ai_learning_events WHERE event_type='CHAT_TURN' AND meta_json LIKE '%question%' LIMIT 800`);
  const wordCount = new Map<string, number>();
  const STOP = new Set(['le', 'la', 'les', 'un', 'une', 'de', 'des', 'que', 'quoi', 'est', 'pour', 'moi', 'je', 'veux', 'prix', 'combien', 'the', 'a', 'to', 'in', 'is', 'هذا', 'شنوا', 'قداش', 'كيفاش', 'في']);
  for (const row of questions) {
    try {
      const meta = JSON.parse(row.meta_json);
      const question = String(meta.question || '');
      for (const word of question.toLowerCase().split(/[^a-z0-9àâéèêëîïôùûüç]+/i)) {
        if (word.length > 2 && !STOP.has(word)) wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    } catch { /* skip */ }
  }
  return {
    periodDays: 30,
    totals: Object.fromEntries(byType),
    resolutionScore: resolutions ? Math.round((resolved / resolutions) * 100) / 100 : null,
    correctionCount: corrections,
    humanInterventions: interventions,
    lens: { runs: lensRuns, verified: lensVerified, accuracy: lensRuns ? Math.round((lensVerified / lensRuns) * 100) / 100 : null },
    toolFailures: [...toolFailures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tool, count]) => ({ tool, count })),
    topErrorTypes: errors.map((row) => ({ errorType: row.error_type, count: Number(row.count) })),
    topQuestionTerms: [...wordCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([term, count]) => ({ term, count })),
  };
}
