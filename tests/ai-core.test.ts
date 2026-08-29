import { afterEach, describe, expect, test, vi } from 'vitest';
import type {
  AiCompletionRequest,
  AiCoreEvent,
  AiResponsesProviderAdapter,
} from '../src/ai-core/contracts';
import { AnthropicAdapter, toAnthropicMessages } from '../src/ai-core/adapters/anthropic/AnthropicAdapter';
import {
  buildOpenAiResponsesBody,
  OpenAIResponsesAdapter,
  toOpenAiResponsesInput,
} from '../src/ai-core/adapters/openai/OpenAIResponsesAdapter';
import { AyroviAiCore, resetAyroviAiCoreForTests } from '../src/ai-core/core';
import { AiProviderError, providerErrorFromHttp, publicAiError } from '../src/ai-core/errors';
import { AiProviderCircuitBreaker, PolicyResponsesAdapter } from '../src/ai-core/policy';
import { getAssistantToolGateway } from '../src/assistant/toolGateway';

const originalEnv = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_DEFAULT_MODEL: process.env.OPENAI_DEFAULT_MODEL,
};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetAyroviAiCoreForTests();
});

function request(overrides: Partial<AiCompletionRequest> = {}): AiCompletionRequest {
  return {
    workload: 'assistant',
    modelClass: 'fast',
    instructions: 'AYROVI system policy',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Bonjour' }] }],
    maxOutputTokens: 300,
    ...overrides,
  };
}

function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('AYROVI AI Core Phase 1 contracts and routing', () => {
  test('keeps Anthropic active even when OpenAI is configured', async () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-test';
    process.env.OPENAI_API_KEY = 'openai-test';
    const core = new AyroviAiCore();
    const snapshot = core.registrySnapshot();

    expect(core.responses().id).toBe('anthropic');
    expect(core.targetResponses().id).toBe('openai-responses');
    expect(snapshot).toMatchObject({
      phase: 'contract-extraction',
      activeResponses: 'anthropic',
      targetResponses: 'openai-responses',
      targetRealtime: 'openai-realtime',
      legacyRealtime: 'legacy-voice',
    });
    expect(snapshot.entries.find((entry) => entry.id === 'openai-responses')).toMatchObject({
      configured: true,
      active: false,
      role: 'primary',
    });
    await expect(core.targetRealtime().createSession({
      conversationId: 'conv_1',
      sessionId: 'sess_1',
    })).rejects.toMatchObject({ code: 'PROVIDER_NOT_ACTIVE' });
  });

  test('defines sanitized canonical observability without provider state as identity', () => {
    const event: AiCoreEvent = {
      eventId: 'event_1',
      type: 'usage_recorded',
      occurredAt: '2026-08-29T12:00:00.000Z',
      context: {
        requestId: 'request_1',
        conversationId: 'conversation_1',
        turnId: 'turn_1',
        sessionId: 'session_1',
        userIdHash: 'hash_1',
        promptVersion: 'assistant-v1',
        policyVersion: 'ai-core-phase-1',
      },
      workload: 'assistant',
      provider: 'anthropic',
      model: 'model-test',
      usage: {
        inputTokens: 10,
        outputTokens: 4,
        cachedInputTokens: 0,
        audioInputTokens: 0,
        audioOutputTokens: 0,
        imageInputTokens: 0,
        webSearchCalls: 0,
      },
      cost: { amountUsd: 0.001, source: 'metered' },
    };
    expect(event.context).not.toHaveProperty('previous_response_id');
    expect(event.context).not.toHaveProperty('providerSessionId');
    expect(event.cost?.source).toBe('metered');
  });

  test('exposes neutral Assistant tool schemas through the AYROVI gateway', () => {
    const gateway = getAssistantToolGateway();
    expect(gateway.definitions.length).toBeGreaterThan(5);
    expect(gateway.definitions.find((tool) => tool.name === 'calculate_price')).toBeTruthy();
    expect(gateway.definitions[0]).toHaveProperty('parameters');
    expect(gateway.definitions[0]).not.toHaveProperty('input_schema');
    expect(gateway.definitions[0]).not.toHaveProperty('type');
  });
});

describe('AnthropicAdapter', () => {
  test('translates multimodal messages, tools, structured output, results and usage', async () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-test';
    process.env.ANTHROPIC_MODEL = 'claude-test-model';
    const messages: AiCompletionRequest['messages'] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyse' },
          { type: 'image', id: 'img_1', source: { type: 'base64', mediaType: 'image/png', data: 'YWJj' } },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Je vérifie.' },
          { type: 'tool_call', id: 'call_1', name: 'calculate_price', arguments: { item_price: 20 } },
        ],
      },
      { role: 'tool', content: [{ type: 'tool_result', callId: 'call_1', result: { success: true } }] },
    ];

    expect(toAnthropicMessages(messages)).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyse' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'YWJj' } },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Je vérifie.' },
          { type: 'tool_use', id: 'call_1', name: 'calculate_price', input: { item_price: 20 } },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"success":true}' }],
      },
    ]);

    const fetchMock = vi.fn(async (_url: string, options: any) => {
      const body = JSON.parse(String(options.body));
      expect(body.model).toBe('claude-test-model');
      expect(body.tools).toEqual([{
        name: 'calculate_price',
        description: 'Calculate',
        input_schema: { type: 'object', properties: {} },
      }]);
      expect(body.output_config.format.type).toBe('json_schema');
      return new Response(JSON.stringify({
        model: 'claude-test-model',
        content: [
          { type: 'text', text: '{"answer":"ok"}' },
          { type: 'tool_use', id: 'call_2', name: 'calculate_price', input: { item_price: 40 } },
          {
            type: 'web_search_tool_result',
            content: [{ type: 'web_search_result', title: 'Merchant result', url: 'https://shop.example/product' }],
          },
        ],
        usage: {
          input_tokens: 20,
          output_tokens: 8,
          cache_read_input_tokens: 3,
          server_tool_use: { web_search_requests: 1 },
        },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new AnthropicAdapter();
    const result = await adapter.complete(request({
      workload: 'vision',
      messages,
      temperature: 0,
      tools: [{ name: 'calculate_price', description: 'Calculate', parameters: { type: 'object', properties: {} } }],
      outputSchema: { name: 'answer', schema: { type: 'object', properties: { answer: { type: 'string' } } } },
    }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.output).toEqual([
      { type: 'text', text: '{"answer":"ok"}' },
      { type: 'tool_call', id: 'call_2', name: 'calculate_price', arguments: { item_price: 40 } },
    ]);
    expect(result.webResults).toEqual([{ title: 'Merchant result', url: 'https://shop.example/product', source: 'shop.example' }]);
    expect(result.usage).toMatchObject({ inputTokens: 20, outputTokens: 8, cachedInputTokens: 3, webSearchCalls: 1 });
  });

  test('normalizes Anthropic SSE text and tool proposals', async () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-test';
    process.env.ANTHROPIC_MODEL = 'claude-stream-test';
    const fetchMock = vi.fn(async () => sseResponse([
      { type: 'message_start', message: { model: 'claude-stream-test', usage: { input_tokens: 9, cache_read_input_tokens: 2 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'Bon' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'jour' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'call_1', name: 'search_products', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":"Nike"}' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', usage: { output_tokens: 5 } },
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const deltas: string[] = [];

    const result = await new AnthropicAdapter().stream(request({
      workload: 'research',
      tools: [{ name: 'search_products', description: 'Search', parameters: { type: 'object' } }],
      toolChoice: 'auto',
    }), { onTextDelta: (text) => deltas.push(text) }, new AbortController().signal);

    expect(deltas).toEqual(['Bon', 'jour']);
    expect(result.output).toEqual([
      { type: 'text', text: 'Bonjour' },
      { type: 'tool_call', id: 'call_1', name: 'search_products', arguments: { query: 'Nike' } },
    ]);
    expect(result.usage).toMatchObject({ inputTokens: 9, outputTokens: 5, cachedInputTokens: 2 });
  });

  test('does not run its model/schema fallback loop after HTTP 429', async () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-test';
    const fetchMock = vi.fn(async () => new Response('{"error":"quota"}', {
      status: 429,
      headers: { 'retry-after': '2' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new AnthropicAdapter().stream(
      request({ tools: [{ name: 'search_products', description: 'Search', parameters: { type: 'object' } }] }),
      {},
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED', status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('OpenAIResponsesAdapter target boundary', () => {
  test('maps canonical history to Responses input without promoting the adapter', async () => {
    process.env.OPENAI_API_KEY = 'openai-test';
    process.env.OPENAI_DEFAULT_MODEL = 'openai-test-model';
    const messages: AiCompletionRequest['messages'] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image', source: { type: 'url', url: 'https://images.example/item.jpg' } },
        ],
      },
      { role: 'assistant', content: [{ type: 'tool_call', id: 'call_1', name: 'lookup', arguments: { id: 'p1' } }] },
      { role: 'tool', content: [{ type: 'tool_result', callId: 'call_1', result: { found: true } }] },
    ];
    expect(toOpenAiResponsesInput(messages)).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'What is this?' },
          { type: 'input_image', image_url: 'https://images.example/item.jpg', detail: 'auto' },
        ],
      },
      { type: 'function_call', call_id: 'call_1', name: 'lookup', arguments: '{"id":"p1"}' },
      { type: 'function_call_output', call_id: 'call_1', output: '{"found":true}' },
    ]);

    const body = buildOpenAiResponsesBody(request({ messages }), 'openai-test-model', false);
    expect(body).toMatchObject({ model: 'openai-test-model', stream: false, store: false });
    expect(body).not.toHaveProperty('previous_response_id');

    const fetchMock = vi.fn(async (url: string, options: any) => {
      expect(url).toBe('https://api.openai.com/v1/responses');
      expect(options.headers.authorization).toBe('Bearer openai-test');
      return new Response(JSON.stringify({
        model: 'openai-test-model',
        output: [
          {
            type: 'message',
            content: [{
              type: 'output_text',
              text: 'Found it.',
              annotations: [{ type: 'url_citation', title: 'Source', url: 'https://example.com/source' }],
            }],
          },
          { type: 'function_call', call_id: 'call_2', name: 'lookup', arguments: '{"id":"p2"}' },
        ],
        usage: { input_tokens: 12, output_tokens: 4, input_tokens_details: { cached_tokens: 2 } },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new OpenAIResponsesAdapter().complete(request({
      modelClass: 'default',
      messages,
    }));
    expect(result.output).toEqual([
      { type: 'text', text: 'Found it.' },
      { type: 'tool_call', id: 'call_2', name: 'lookup', arguments: { id: 'p2' } },
    ]);
    expect(result.webResults).toEqual([{ title: 'Source', url: 'https://example.com/source', source: 'example.com' }]);
    expect(result.usage).toMatchObject({ inputTokens: 12, outputTokens: 4, cachedInputTokens: 2 });
  });

  test('normalizes Responses semantic streaming events', async () => {
    process.env.OPENAI_API_KEY = 'openai-test';
    process.env.OPENAI_DEFAULT_MODEL = 'openai-stream-model';
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      { type: 'response.output_text.delta', delta: 'Hel' },
      { type: 'response.output_text.delta', delta: 'lo' },
      { type: 'response.output_text.done', text: 'Hello' },
      {
        type: 'response.output_item.added', output_index: 1,
        item: { type: 'function_call', call_id: 'call_7', name: 'lookup', arguments: '' },
      },
      { type: 'response.function_call_arguments.delta', output_index: 1, delta: '{"id":"p7"}' },
      {
        type: 'response.output_item.done', output_index: 1,
        item: { type: 'function_call', call_id: 'call_7', name: 'lookup', arguments: '{"id":"p7"}' },
      },
      {
        type: 'response.completed',
        response: { model: 'openai-stream-model', usage: { input_tokens: 5, output_tokens: 3 } },
      },
    ])));
    const deltas: string[] = [];

    const result = await new OpenAIResponsesAdapter().stream(
      request({ modelClass: 'default' }),
      { onTextDelta: (text) => deltas.push(text) },
      new AbortController().signal,
    );

    expect(deltas).toEqual(['Hel', 'lo']);
    expect(result.output).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'tool_call', id: 'call_7', name: 'lookup', arguments: { id: 'p7' } },
    ]);
    expect(result.usage).toMatchObject({ inputTokens: 5, outputTokens: 3 });
  });
});

describe('AI Core errors and circuit policy', () => {
  test('never serializes raw provider diagnostics to a public error', () => {
    const error = providerErrorFromHttp('provider-test', 400, 'secret raw provider body');
    expect(error.diagnostic).toBe('secret raw provider body');
    expect(JSON.stringify(error)).not.toContain('secret raw provider body');
    expect(publicAiError(error)).toEqual({
      code: 'PROVIDER_INVALID_REQUEST',
      message: 'AI provider rejected the request.',
      retryable: false,
    });
  });

  test('opens on the first 429 and does not retry the delegate', async () => {
    const complete = vi.fn(async () => {
      throw new AiProviderError('PROVIDER_RATE_LIMITED', 'fake-provider', 'Rate limited.', {
        status: 429,
        retryable: true,
        diagnostic: 'private quota detail',
      });
    });
    const delegate: AiResponsesProviderAdapter = {
      id: 'fake-provider',
      kind: 'responses',
      targetRole: 'fallback',
      isConfigured: () => true,
      resolveModel: () => 'fake-model',
      complete,
      stream: async () => { throw new Error('not used'); },
    };
    const policy = new PolicyResponsesAdapter(delegate, new AiProviderCircuitBreaker(60_000));

    await expect(policy.complete(request())).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED', status: 429 });
    await expect(policy.complete(request())).rejects.toMatchObject({ code: 'PROVIDER_CIRCUIT_OPEN', status: 429 });
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
