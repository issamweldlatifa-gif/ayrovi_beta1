import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiContentPart,
  AiMessage,
  AiModelClass,
  AiOutputBlock,
  AiResponsesProviderAdapter,
  AiStreamCallbacks,
  AiToolDefinition,
  AiUsage,
  AiWebSearchResult,
  AiWorkload,
} from '../../contracts';
import { AiProviderError, providerErrorFromHttp, retryAtFromHeader } from '../../errors';
import { dedupeWebResults, emptyUsage } from '../shared';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_SONNET_MODEL = 'claude-sonnet-4-5-20250929';

function cleanText(value: unknown, max = 100_000): string {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  try {
    if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout]);
  } catch { /* Older runtimes can still use the caller signal. */ }
  return signal;
}

function jsonValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return '{}'; }
}

function toAnthropicPart(part: AiContentPart): Record<string, unknown> | null {
  if (part.type === 'text') return { type: 'text', text: part.text };
  if (part.type === 'image') {
    return {
      type: 'image',
      source: part.source.type === 'url'
        ? { type: 'url', url: part.source.url }
        : { type: 'base64', media_type: part.source.mediaType, data: part.source.data },
    };
  }
  if (part.type === 'tool_call') {
    return { type: 'tool_use', id: part.id, name: part.name, input: part.arguments };
  }
  if (part.type === 'tool_result') {
    return { type: 'tool_result', tool_use_id: part.callId, content: jsonValue(part.result) };
  }
  return null;
}

/** Exported for contract tests; provider wire shapes stay inside this adapter. */
export function toAnthropicMessages(messages: AiMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    const parts = message.content.map(toAnthropicPart).filter(Boolean) as Array<Record<string, unknown>>;
    const role = message.role === 'tool' ? 'user' : message.role;
    if (parts.length === 1 && parts[0].type === 'text') {
      return { role, content: parts[0].text };
    }
    return { role, content: parts };
  });
}

function toAnthropicTools(tools: AiToolDefinition[], custom = false): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    ...(custom ? { type: 'custom' } : {}),
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

function fallbackModels(preferred: string): string[] {
  const known = [
    preferred,
    DEFAULT_HAIKU_MODEL,
    'claude-haiku-4-5',
    DEFAULT_SONNET_MODEL,
    'claude-sonnet-4-5',
  ];
  return [...new Set(known.map((item) => cleanText(item, 160)).filter(Boolean))];
}

function textBlocksOf(payload: any): string[] {
  return (Array.isArray(payload?.content) ? payload.content : []).flatMap((block: any) => {
    if (block?.type === 'text' && block.text) return [String(block.text)];
    if ((block?.type === 'json' || block?.type === 'output_json') && block.json) return [jsonValue(block.json)];
    return [];
  }).filter(Boolean);
}

function outputBlocksOf(payload: any): AiOutputBlock[] {
  return (Array.isArray(payload?.content) ? payload.content : []).flatMap((block: any) => {
    if (block?.type === 'text') return [{ type: 'text' as const, text: String(block.text || '') }];
    if (block?.type === 'tool_use') {
      return [{
        type: 'tool_call' as const,
        id: String(block.id || ''),
        name: String(block.name || ''),
        arguments: block.input && typeof block.input === 'object' ? block.input : {},
      }];
    }
    if ((block?.type === 'json' || block?.type === 'output_json') && block.json) {
      return [{ type: 'text' as const, text: jsonValue(block.json) }];
    }
    return [];
  });
}

function webResultsOf(payload: any): AiWebSearchResult[] {
  const results: AiWebSearchResult[] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'web_search_result') {
      const url = String(node.url || '').trim();
      if (/^https?:\/\//i.test(url)) {
        let source = '';
        try { source = new URL(url).hostname.replace(/^www\./, ''); } catch { /* optional */ }
        results.push({ title: cleanText(node.title || 'Web result', 500), url, source });
      }
    }
    if (Array.isArray(node)) node.forEach(visit);
    else Object.values(node).forEach(visit);
  };
  visit(payload?.content);
  return dedupeWebResults(results);
}

function usageOf(payload: any): AiUsage | undefined {
  const usage = payload?.usage;
  if (!usage || typeof usage !== 'object') return undefined;
  return {
    ...emptyUsage(),
    inputTokens: Number(usage.input_tokens) || 0,
    outputTokens: Number(usage.output_tokens) || 0,
    cachedInputTokens: Number(usage.cache_read_input_tokens) || 0,
    webSearchCalls: Number(usage?.server_tool_use?.web_search_requests) || 0,
  };
}

function resultOf(payload: any, model: string): AiCompletionResult {
  const output = outputBlocksOf(payload);
  return {
    provider: 'anthropic',
    model: String(payload?.model || model),
    output,
    textBlocks: textBlocksOf(payload),
    webResults: webResultsOf(payload),
    usage: usageOf(payload),
  };
}

function baseBody(request: AiCompletionRequest, model: string): Record<string, unknown> {
  const tools: Array<Record<string, unknown>> = [];
  if (request.tools?.length) tools.push(...toAnthropicTools(request.tools));
  if (request.webSearch?.enabled) {
    tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: request.webSearch.maxUses });
  }
  const body: Record<string, unknown> = {
    model,
    max_tokens: request.maxOutputTokens,
    ...(request.temperature == null ? {} : { temperature: request.temperature }),
    system: request.instructions,
    messages: toAnthropicMessages(request.messages),
    ...(tools.length ? { tools } : {}),
    ...(request.outputSchema ? {
      output_config: { format: { type: 'json_schema', schema: request.outputSchema.schema } },
    } : {}),
  };
  if (request.toolChoice === 'auto') body.tool_choice = { type: 'auto' };
  else if (request.toolChoice === 'none') delete body.tools;
  else if (request.toolChoice?.type === 'tool') body.tool_choice = { type: 'tool', name: request.toolChoice.name };
  return body;
}

async function readSse(response: Response, onEvent: (event: any) => void): Promise<void> {
  if (!response.body) {
    throw new AiProviderError('PROVIDER_INVALID_RESPONSE', 'anthropic', 'Anthropic returned no response stream.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const packet = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = packet.split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (data && data !== '[DONE]') {
        try { onEvent(JSON.parse(data)); } catch { /* Ignore malformed provider event. */ }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }
}

async function streamResult(response: Response, model: string, callbacks: AiStreamCallbacks): Promise<AiCompletionResult> {
  const blocks: Array<(AiOutputBlock & { partialJson?: string }) | undefined> = [];
  const usage = emptyUsage();
  let hasUsage = false;
  let responseModel = model;
  await readSse(response, (event) => {
    if (event?.type === 'message_start') {
      responseModel = String(event?.message?.model || model);
      const startUsage = event?.message?.usage;
      if (startUsage && typeof startUsage === 'object') {
        usage.inputTokens = Number(startUsage.input_tokens) || 0;
        usage.cachedInputTokens = Number(startUsage.cache_read_input_tokens) || 0;
        usage.webSearchCalls = Number(startUsage?.server_tool_use?.web_search_requests) || 0;
        hasUsage = true;
      }
    } else if (event?.type === 'message_delta' && event?.usage) {
      usage.outputTokens = Number(event.usage.output_tokens) || usage.outputTokens;
      usage.webSearchCalls = Number(event.usage?.server_tool_use?.web_search_requests) || usage.webSearchCalls;
      hasUsage = true;
    } else if (event?.type === 'content_block_start') {
      const block = event.content_block;
      if (block?.type === 'tool_use') {
        blocks[event.index] = {
          type: 'tool_call', id: String(block.id || ''), name: String(block.name || ''),
          arguments: block.input && typeof block.input === 'object' ? block.input : {}, partialJson: '',
        };
      } else if (block?.type === 'text') {
        const text = cleanText(block.text || '');
        blocks[event.index] = { type: 'text', text };
        if (text) callbacks.onTextDelta?.(text);
      }
    } else if (event?.type === 'content_block_delta') {
      const block = blocks[event.index];
      if (!block) return;
      if (event.delta?.type === 'text_delta' && block.type === 'text') {
        const text = String(event.delta.text || '');
        block.text += text;
        if (text) callbacks.onTextDelta?.(text);
      } else if (event.delta?.type === 'input_json_delta' && block.type === 'tool_call') {
        block.partialJson = `${block.partialJson || ''}${String(event.delta.partial_json || '')}`;
      }
    } else if (event?.type === 'content_block_stop') {
      const block = blocks[event.index];
      if (block?.type === 'tool_call' && block.partialJson) {
        try { block.arguments = JSON.parse(block.partialJson); } catch { block.arguments = {}; }
        delete block.partialJson;
      }
    }
  });
  const output = blocks.filter(Boolean).map((block) => {
    if (block?.type === 'tool_call') {
      const { partialJson: _partial, ...clean } = block;
      return clean;
    }
    return block as AiOutputBlock;
  });
  return {
    provider: 'anthropic',
    model: responseModel,
    output,
    textBlocks: output.filter((block): block is Extract<AiOutputBlock, { type: 'text' }> => block.type === 'text').map((block) => block.text),
    webResults: [],
    ...(hasUsage ? { usage } : {}),
  };
}

export class AnthropicAdapter implements AiResponsesProviderAdapter {
  readonly id = 'anthropic';
  readonly kind = 'responses' as const;
  readonly targetRole = 'fallback' as const;

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  }

  resolveModel(workload: AiWorkload, modelClass: AiModelClass): string {
    if (workload === 'magazine') {
      return cleanText(
        process.env.MAGAZINE_AGENT_MODEL
        || process.env.ASSISTANT_SONNET_MODEL
        || process.env.ANTHROPIC_MODEL
        || DEFAULT_SONNET_MODEL,
        160,
      );
    }
    if (workload === 'vision' || workload === 'research') {
      return cleanText(process.env.ANTHROPIC_MODEL || DEFAULT_HAIKU_MODEL, 160);
    }
    if (workload === 'stock-search') {
      return cleanText(process.env.ASSISTANT_HAIKU_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_HAIKU_MODEL, 160);
    }
    if (modelClass === 'deep') {
      return cleanText(process.env.ASSISTANT_SONNET_MODEL || DEFAULT_SONNET_MODEL, 160);
    }
    return cleanText(
      process.env.ASSISTANT_HAIKU_MODEL
      || process.env.ANTHROPIC_MODEL
      || DEFAULT_HAIKU_MODEL,
      160,
    );
  }

  private key(): string {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) {
      throw new AiProviderError('PROVIDER_NOT_CONFIGURED', this.id, 'Anthropic is not configured.', { retryable: false });
    }
    return key;
  }

  private async post(body: Record<string, unknown>, signal: AbortSignal | undefined, timeoutMs: number): Promise<Response> {
    const response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      signal: combinedSignal(signal, timeoutMs),
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.key(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    }).catch((error: any) => {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        throw new AiProviderError('PROVIDER_TIMEOUT', this.id, 'Anthropic request timed out.', {
          retryable: true, diagnostic: String(error?.message || ''),
        });
      }
      throw new AiProviderError('PROVIDER_UNAVAILABLE', this.id, 'Anthropic request failed.', {
        retryable: true, diagnostic: String(error?.message || ''),
      });
    });
    if (response.ok) return response;
    const detail = await response.text().catch(() => '');
    console.warn(`[AI Core Anthropic] HTTP ${response.status} ${detail.slice(0, 280)}`);
    if (
      response.status === 400
      && 'output_config' in body
      && 'tools' in body
      && /output_config|json_schema|structured|tool|web.search/i.test(detail)
    ) {
      throw new AiProviderError(
        'PROVIDER_CAPABILITY_UNSUPPORTED',
        this.id,
        'AI provider does not support this capability combination.',
        { status: 400, retryable: false, diagnostic: detail.slice(0, 2_000) },
      );
    }
    throw providerErrorFromHttp(
      this.id,
      response.status,
      detail.slice(0, 2_000),
      retryAtFromHeader(response.headers.get('retry-after')),
    );
  }

  async complete(request: AiCompletionRequest, signal?: AbortSignal): Promise<AiCompletionResult> {
    const model = this.resolveModel(request.workload, request.modelClass);
    const response = await this.post(baseBody(request, model), signal, request.workload === 'magazine' ? 58_000 : 20_000);
    const payload = await response.json().catch(() => {
      throw new AiProviderError('PROVIDER_INVALID_RESPONSE', this.id, 'Anthropic returned invalid JSON.');
    });
    return resultOf(payload, model);
  }

  async stream(request: AiCompletionRequest, callbacks: AiStreamCallbacks, signal: AbortSignal): Promise<AiCompletionResult> {
    const preferred = this.resolveModel(request.workload, request.modelClass);
    const models = fallbackModels(preferred);
    let lastError: unknown;
    let schemaRejected = false;

    for (const model of models) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const standardTools = toAnthropicTools(request.tools || []);
      const customTools = toAnthropicTools(request.tools || [], true);
      const forcedChoice = request.toolChoice && typeof request.toolChoice === 'object'
        ? { type: 'tool', name: request.toolChoice.name }
        : undefined;
      const variants: Array<{ tools?: Array<Record<string, unknown>>; tool_choice?: Record<string, unknown> }> = schemaRejected
        ? [{}]
        : [
          ...(forcedChoice && standardTools.length ? [{ tools: standardTools, tool_choice: forcedChoice }] : []),
          ...(standardTools.length ? [{ tools: standardTools, tool_choice: { type: 'auto' } }] : []),
          ...(customTools.length ? [{ tools: customTools, tool_choice: { type: 'auto' } }] : []),
          {},
        ];

      for (const extra of variants) {
        try {
          const body = {
            ...baseBody({ ...request, tools: undefined, toolChoice: undefined, outputSchema: undefined }, model),
            stream: true,
            ...extra,
          };
          const response = await this.post(body, signal, 55_000);
          return await streamResult(response, model, callbacks);
        } catch (error) {
          lastError = error;
          if (signal.aborted || (error as any)?.name === 'AbortError') throw error;
          if (!(error instanceof AiProviderError)) continue;
          if (error.code === 'PROVIDER_NOT_CONFIGURED' || error.code === 'PROVIDER_AUTHENTICATION_FAILED') throw error;
          if (error.status === 400) {
            schemaRejected = true;
            if (!extra.tools) {
              throw new AiProviderError('PROVIDER_UNAVAILABLE', this.id, 'Anthropic did not accept a compatible request.', {
                status: 400, retryable: false, diagnostic: error.diagnostic,
              });
            }
            continue;
          }
          if (error.status === 429 || error.code === 'PROVIDER_RATE_LIMITED') throw error;
          if (error.status === 404) break;
          if (Number(error.status) >= 500 || error.code === 'PROVIDER_TIMEOUT') continue;
        }
      }
    }
    throw lastError instanceof AiProviderError
      ? lastError
      : new AiProviderError('PROVIDER_UNAVAILABLE', this.id, 'Anthropic is unavailable.', { retryable: true });
  }
}
