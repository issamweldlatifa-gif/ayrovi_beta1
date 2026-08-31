import { afterEach, describe, expect, test, vi } from 'vitest';
import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiModelClass,
  AiResponsesProviderAdapter,
  AiStreamCallbacks,
  AiWorkload,
} from '../src/ai-core/contracts';
import { AiProviderError } from '../src/ai-core/errors';
import { AnthropicAdapter } from '../src/ai-core/adapters/anthropic/AnthropicAdapter';
import { AyroviAIExtractionService } from '../src/arrival-ingestion/aiExtractionService';
import { inspectAnthropicSchema, ANTHROPIC_MAX_UNION_PARAMETERS } from '../src/ai-core/adapters/anthropic/schemaLimits';
import { ARRIVAL_EXTRACTION_SCHEMA } from '../src/arrival-ingestion/arrivalExtractionSchema';
import type { ExtractionRequestContext } from '../src/arrival-ingestion/types';

const emptyOrderMeta = {
  customerName: '', customerEmail: '', customerPhone: '',
  supplier: '', store: '', orderId: '', trackingNumber: '',
  orderDate: '', shipmentStatus: '', currency: '',
};

const validPayload = {
  orderMeta: { ...emptyOrderMeta, supplier: 'TEST', store: 'TEST', orderId: 'ORD-1' },
  products: [{
    productName: 'Sample product',
    sku: 'ABC-1',
    reference: '',
    variant: '',
    color: '',
    size: '',
    quantity: 1,
    unitPrice: 0,
    currency: '',
    productUrl: '',
    productImageRef: '',
    productImageRegion: [],
    confidence: 0.95,
    evidenceFieldNames: ['productName', 'sku', 'quantity'],
    sourceSpecific: [],
  }],
  unresolvedEntries: [],
  expectedProductCount: 1,
  warnings: [],
};

class CompatibilityAdapter implements AiResponsesProviderAdapter {
  readonly id = 'compatibility-fixture';
  readonly kind = 'responses' as const;
  readonly targetRole = 'fallback' as const;
  readonly requests: AiCompletionRequest[] = [];
  constructor(private readonly firstError: AiProviderError | null) {}
  isConfigured() { return true; }
  resolveModel(_workload: AiWorkload, _modelClass: AiModelClass) { return 'fixture-model'; }
  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    this.requests.push(request);
    if (this.requests.length === 1 && this.firstError) throw this.firstError;
    const text = JSON.stringify(validPayload);
    return {
      provider: this.id,
      model: 'fixture-model',
      output: [{ type: 'text', text }],
      textBlocks: [text],
      webResults: [],
    };
  }
  async stream(request: AiCompletionRequest, callbacks: AiStreamCallbacks): Promise<AiCompletionResult> {
    const result = await this.complete(request);
    callbacks.onTextDelta?.(result.textBlocks.join(''));
    return result;
  }
}

function context(): ExtractionRequestContext {
  return {
    jobId: 'job-compatibility',
    arrivalId: 'arrival-1',
    arrivalName: 'Compatibility Arrival',
    arrivalClientId: 'client-1',
    arrivalClientStoreId: 'client-store-1',
    customerId: 'customer-1',
    customerName: 'Customer',
    store: {
      id: 'store-1',
      code: 'TEST',
      name: 'Test',
      active: true,
      sourceType: 'EMAIL',
      strategyKey: 'test-email-v1',
      extractionHints: [],
    },
    source: {
      id: 'source-1',
      arrivalClientId: 'client-1',
      arrivalClientStoreId: 'client-store-1',
      sourceType: 'EMAIL',
      originalFilename: 'fixture.txt',
      mimeType: 'text/plain',
      byteSize: 40,
      sourceHash: 'fixture-hash',
      storageKey: 'source-1/original.txt',
      createdAt: new Date(0).toISOString(),
    },
    unit: {
      reference: 'source-1#email=1',
      ordinal: 1,
      text: 'Sample product ABC-1 Qty 1',
      assets: [],
    },
  };
}

const originalKey = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});

describe('Arrival AI structured-output compatibility policy', () => {
  test('uses exactly one schema-instructions fallback only after a structured-capability rejection', async () => {
    const adapter = new CompatibilityAdapter(new AiProviderError(
      'PROVIDER_CAPABILITY_UNSUPPORTED',
      'fixture',
      'schema unsupported',
      { status: 400, retryable: false },
    ));
    const result = await new AyroviAIExtractionService(adapter).extractUnit(context());
    expect(adapter.requests).toHaveLength(2);
    expect(adapter.requests[0].outputSchema).toBeTruthy();
    expect(adapter.requests[1].outputSchema).toBeUndefined();
    expect(adapter.requests[1].instructions).toContain('STRUCTURED OUTPUT COMPATIBILITY MODE');
    expect(result.products).toHaveLength(1);
    expect(result.warningCodes).toContain('STRUCTURED_OUTPUT_COMPATIBILITY_FALLBACK');
  });

  test.each([
    ['PROVIDER_RATE_LIMITED', 429],
    ['PROVIDER_AUTHENTICATION_FAILED', 401],
    ['PROVIDER_MODEL_NOT_FOUND', 404],
  ] as const)('never compatibility-retries %s failures', async (code, status) => {
    const adapter = new CompatibilityAdapter(new AiProviderError(code, 'fixture', 'sensitive provider detail', {
      status,
      retryable: code === 'PROVIDER_RATE_LIMITED',
    }));
    await expect(new AyroviAIExtractionService(adapter).extractUnit(context())).rejects.toMatchObject({ code });
    expect(adapter.requests).toHaveLength(1);
  });

  test('classifies a mocked output-schema HTTP 400 without requiring tool payloads', async () => {
    process.env.ANTHROPIC_API_KEY = 'synthetic-test-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'output_config json_schema is not supported for this model' } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new AnthropicAdapter();
    await expect(adapter.complete({
      workload: 'arrival-ingestion',
      modelClass: 'default',
      context: {
        requestId: 'mock-schema-400', executionLane: 'active',
        promptVersion: 'fixture-v1', policyVersion: 'fixture-v1',
      },
      instructions: 'fixture',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'fixture' }] }],
      maxOutputTokens: 100,
      outputSchema: { name: 'fixture', schema: { type: 'object' } },
    })).rejects.toMatchObject({ code: 'PROVIDER_CAPABILITY_UNSUPPORTED', status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('arrival extraction schema is union-free and within the provider limit', () => {
    const report = inspectAnthropicSchema(ARRIVAL_EXTRACTION_SCHEMA);
    expect(report.maximumAllowed).toBe(ANTHROPIC_MAX_UNION_PARAMETERS);
    expect(report.unionParameters).toBe(0);
    expect(report.exceeded).toBe(false);
  });

  test('preflight rejects an over-limit union schema locally without calling Anthropic', async () => {
    process.env.ANTHROPIC_API_KEY = 'synthetic-test-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // A schema with 17 nullable string parameters reproduces the deployment
    // HTTP 400 ("too many parameters with union types", limit 16).
    const tooManyUnions = {
      type: 'object',
      properties: Object.fromEntries(
        Array.from({ length: 17 }, (_, i) => [`field${i}`, { type: ['string', 'null'] }]),
      ),
    };
    const adapter = new AnthropicAdapter();
    await expect(adapter.complete({
      workload: 'arrival-ingestion',
      modelClass: 'default',
      context: { requestId: 'preflight-limit', executionLane: 'active', promptVersion: 'v1', policyVersion: 'v1' },
      instructions: 'fixture',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'fixture' }] }],
      maxOutputTokens: 100,
      outputSchema: { name: 'too-many-unions', schema: tooManyUnions },
    })).rejects.toMatchObject({
      code: 'PROVIDER_INVALID_REQUEST',
      status: 400,
      retryable: false,
    });
    // The request must never leave the process.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
