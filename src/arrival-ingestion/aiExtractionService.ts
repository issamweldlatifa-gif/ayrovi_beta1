import { randomUUID } from 'node:crypto';
import type { AiCompletionRequest, AiResponsesProviderAdapter } from '../ai-core/contracts';
import { getAyroviAiCore } from '../ai-core/core';
import { ARRIVAL_EXTRACTION_SCHEMA, ProductExtractionNormalizer } from './productExtractionNormalizer';
import { StoreExtractionStrategyRegistry } from './storeExtractionStrategy';
import type {
  AIExtractionService,
  ExtractionMessageParts,
  ExtractionRequestContext,
} from './types';

function buildMessageParts(
  context: ExtractionRequestContext,
  strategyRegistry = new StoreExtractionStrategyRegistry(),
): ExtractionMessageParts {
  const instructions = strategyRegistry.resolve(context.store).buildInstructions(context);
  const content: ExtractionMessageParts['content'] = [{
    type: 'text',
    text: [
      `SOURCE_UNIT: ${context.unit.reference}`,
      `STORE: ${context.store.code}`,
      `SOURCE_TYPE: ${context.source.sourceType}`,
      context.unit.text ? `SOURCE_TEXT:\n${context.unit.text}` : 'SOURCE_TEXT: none; inspect the supplied visual source.',
    ].join('\n\n').slice(0, 240_000),
  }];
  for (const asset of context.unit.assets) {
    content.push({ type: 'text', text: `ASSET_ID: ${asset.id}\nASSET_LABEL: ${asset.label}` });
    content.push({
      type: 'image',
      id: asset.id,
      source: { type: 'base64', mediaType: asset.mimeType, data: asset.buffer.toString('base64') },
    });
  }
  return { instructions, content };
}

export class AyroviAIExtractionService implements AIExtractionService {
  private readonly normalizer: ProductExtractionNormalizer;

  constructor(
    private readonly adapter: AiResponsesProviderAdapter = getAyroviAiCore().responses(),
    normalizer = new ProductExtractionNormalizer(),
    private readonly strategyRegistry = new StoreExtractionStrategyRegistry(),
  ) {
    this.normalizer = normalizer;
  }

  async extractUnit(context: ExtractionRequestContext, signal?: AbortSignal) {
    if (!this.adapter.isConfigured()) throw new Error('AI_EXTRACTION_NOT_CONFIGURED');
    const message = buildMessageParts(context, this.strategyRegistry);
    const request: AiCompletionRequest = {
      workload: 'arrival-ingestion',
      modelClass: 'default',
      context: {
        requestId: `arrival_extract_${randomUUID()}`,
        executionLane: 'active',
        sessionId: context.jobId,
        userIdHash: context.requestedByUserIdHash,
        promptVersion: 'arrival-ingestion-v1',
        policyVersion: 'evidence-required-v1',
      },
      instructions: message.instructions,
      messages: [{ role: 'user', content: message.content }],
      // Enough headroom for evidence-backed batches of ~50 line items without
      // forcing the model to summarize or silently truncate product records.
      maxOutputTokens: 20_000,
      temperature: 0,
      outputSchema: {
        name: 'ayrovi_arrival_product_extraction',
        schema: ARRIVAL_EXTRACTION_SCHEMA,
      },
    };
    const result = await this.adapter.complete(request, signal || AbortSignal.timeout(90_000));
    return this.normalizer.parse(
      result.textBlocks.join(''),
      new Set(context.unit.assets.map((asset) => asset.id)),
      context.unit.text,
    );
  }
}

export { buildMessageParts };
