import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiContentPart,
  AiMessage,
  AiModelClass,
  AiOutputBlock,
  AiResponsesProviderAdapter,
  AiStreamCallbacks,
  AiUsage,
  AiWebSearchResult,
  AiWorkload,
} from '../../contracts';
import { AiProviderError, providerErrorFromHttp, retryAtFromHeader } from '../../errors';
import { dedupeWebResults, emptyUsage } from '../shared';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

function cleanModel(value: unknown, fallback: string): string {
  return String(value || fallback).trim().slice(0, 160) || fallback;
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

function openAiMessageContent(part: AiContentPart): Record<string, unknown> | null {
  if (part.type === 'text') return { type: 'input_text', text: part.text };
  if (part.type === 'image') {
    const imageUrl = part.source.type === 'url'
      ? part.source.url
      : `data:${part.source.mediaType};base64,${part.source.data}`;
    return { type: 'input_image', image_url: imageUrl, detail: 'auto' };
  }
  return null;
}

/** Exported for contract tests and Phase 2 shadow review. */
export function toOpenAiResponsesInput(messages: AiMessage[]): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    const messageParts = message.content.map(openAiMessageContent).filter(Boolean) as Array<Record<string, unknown>>;
    if (messageParts.length) {
      const onlyText = messageParts.length === 1 && messageParts[0].type === 'input_text';
      input.push({
        role: message.role === 'tool' ? 'user' : message.role,
        content: onlyText ? messageParts[0].text : messageParts,
      });
    }
    for (const part of message.content) {
      if (part.type === 'tool_call') {
        input.push({
          type: 'function_call',
          call_id: part.id,
          name: part.name,
          arguments: jsonValue(part.arguments),
        });
      } else if (part.type === 'tool_result') {
        input.push({
          type: 'function_call_output',
          call_id: part.callId,
          output: jsonValue(part.result),
        });
      }
    }
  }
  return input;
}

/**
 * Build the provider wire request without exporting provider SDK types.
 * Phase 1 deliberately keeps current non-strict tool schemas; schema hardening
 * is evaluated before enabling OpenAI shadow traffic.
 */
export function buildOpenAiResponsesBody(request: AiCompletionRequest, model: string, stream: boolean): Record<string, unknown> {
  const tools: Array<Record<string, unknown>> = (request.tools || []).map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: false,
  }));
  if (request.webSearch?.enabled) tools.push({ type: 'web_search' });

  let toolChoice: unknown;
  if (request.toolChoice === 'auto') toolChoice = 'auto';
  else if (request.toolChoice === 'none') toolChoice = 'none';
  else if (request.toolChoice?.type === 'tool') toolChoice = { type: 'function', name: request.toolChoice.name };

  return {
    model,
    instructions: request.instructions,
    input: toOpenAiResponsesInput(request.messages),
    max_output_tokens: request.maxOutputTokens,
    stream,
    store: false,
    ...(tools.length ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    ...(request.outputSchema ? {
      text: {
        format: {
          type: 'json_schema',
          name: request.outputSchema.name,
          schema: request.outputSchema.schema,
          strict: true,
        },
      },
    } : {}),
  };
}

function webResultsOf(value: any): AiWebSearchResult[] {
  const results: AiWebSearchResult[] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const url = String(node.url || node?.source?.url || '').trim();
    if (/^https?:\/\//i.test(url) && (node.type === 'url_citation' || node.type === 'web_search_result')) {
      let source = '';
      try { source = new URL(url).hostname.replace(/^www\./, ''); } catch { /* optional */ }
      results.push({ title: String(node.title || node?.source?.title || source || 'Web result').slice(0, 500), url, source });
    }
    if (Array.isArray(node)) node.forEach(visit);
    else Object.values(node).forEach(visit);
  };
  visit(value);
  return dedupeWebResults(results);
}

function usageOf(payload: any): AiUsage | undefined {
  const usage = payload?.usage;
  if (!usage || typeof usage !== 'object') return undefined;
  return {
    ...emptyUsage(),
    inputTokens: Number(usage.input_tokens) || 0,
    outputTokens: Number(usage.output_tokens) || 0,
    cachedInputTokens: Number(usage?.input_tokens_details?.cached_tokens) || 0,
    audioInputTokens: Number(usage?.input_tokens_details?.audio_tokens) || 0,
    imageInputTokens: Number(usage?.input_tokens_details?.image_tokens) || 0,
    audioOutputTokens: Number(usage?.output_tokens_details?.audio_tokens) || 0,
    webSearchCalls: (Array.isArray(payload?.output) ? payload.output : [])
      .filter((item: any) => item?.type === 'web_search_call').length,
  };
}

function resultOf(payload: any, model: string): AiCompletionResult {
  const output: AiOutputBlock[] = [];
  const textBlocks: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type === 'function_call') {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(String(item.arguments || '{}')); } catch { /* validated by the gateway later */ }
      output.push({ type: 'tool_call', id: String(item.call_id || item.id || ''), name: String(item.name || ''), arguments: parsed });
      continue;
    }
    if (item?.type !== 'message') continue;
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (part?.type !== 'output_text') continue;
      const text = String(part.text || '');
      output.push({ type: 'text', text });
      if (text) textBlocks.push(text);
    }
  }
  return {
    provider: 'openai-responses',
    model: String(payload?.model || model),
    output,
    textBlocks,
    webResults: webResultsOf(payload),
    usage: usageOf(payload),
  };
}

async function readSse(response: Response, onEvent: (event: any) => void): Promise<void> {
  if (!response.body) {
    throw new AiProviderError('PROVIDER_INVALID_RESPONSE', 'openai-responses', 'OpenAI returned no response stream.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const packet = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = packet.split('\n').filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim()).join('\n');
      if (data && data !== '[DONE]') {
        try { onEvent(JSON.parse(data)); } catch { /* Ignore malformed provider event. */ }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }
}

export class OpenAIResponsesAdapter implements AiResponsesProviderAdapter {
  readonly id = 'openai-responses';
  readonly kind = 'responses' as const;
  readonly targetRole = 'primary' as const;

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }

  resolveModel(workload: AiWorkload, modelClass: AiModelClass): string {
    if (workload === 'arrival-ingestion' && process.env.OPENAI_ARRIVAL_INGESTION_MODEL) {
      return cleanModel(process.env.OPENAI_ARRIVAL_INGESTION_MODEL, 'gpt-5.6-terra');
    }
    if (modelClass === 'deep') return cleanModel(process.env.OPENAI_DEEP_MODEL, 'gpt-5.6-sol');
    if (modelClass === 'fast') return cleanModel(process.env.OPENAI_FAST_MODEL, 'gpt-5.6-luna');
    return cleanModel(process.env.OPENAI_DEFAULT_MODEL, 'gpt-5.6-terra');
  }

  private key(): string {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) {
      throw new AiProviderError('PROVIDER_NOT_CONFIGURED', this.id, 'OpenAI is not configured.', { retryable: false });
    }
    return key;
  }

  private async post(request: AiCompletionRequest, stream: boolean, signal?: AbortSignal): Promise<{ response: Response; model: string }> {
    const model = this.resolveModel(request.workload, request.modelClass);
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      signal: combinedSignal(signal, request.workload === 'magazine' ? 58_000 : 55_000),
      headers: {
        authorization: `Bearer ${this.key()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildOpenAiResponsesBody(request, model, stream)),
    }).catch((error: any) => {
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        throw new AiProviderError('PROVIDER_TIMEOUT', this.id, 'OpenAI request timed out.', {
          retryable: true, diagnostic: String(error?.message || ''),
        });
      }
      throw new AiProviderError('PROVIDER_UNAVAILABLE', this.id, 'OpenAI request failed.', {
        retryable: true, diagnostic: String(error?.message || ''),
      });
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn(`[AI Core OpenAI] HTTP ${response.status} ${detail.slice(0, 280)}`);
      if (response.status === 400 && request.outputSchema && request.webSearch?.enabled) {
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
    return { response, model };
  }

  async complete(request: AiCompletionRequest, signal?: AbortSignal): Promise<AiCompletionResult> {
    const { response, model } = await this.post(request, false, signal);
    const payload = await response.json().catch(() => {
      throw new AiProviderError('PROVIDER_INVALID_RESPONSE', this.id, 'OpenAI returned invalid JSON.');
    });
    return resultOf(payload, model);
  }

  async stream(request: AiCompletionRequest, callbacks: AiStreamCallbacks, signal: AbortSignal): Promise<AiCompletionResult> {
    const { response, model } = await this.post(request, true, signal);
    const calls = new Map<number, { id: string; name: string; arguments: string }>();
    const output: AiOutputBlock[] = [];
    const textBlocks: string[] = [];
    let finalPayload: any = null;

    await readSse(response, (event) => {
      if (event?.type === 'response.output_text.delta') {
        const text = String(event.delta || '');
        if (text) callbacks.onTextDelta?.(text);
      } else if (event?.type === 'response.output_text.done') {
        const text = String(event.text || '');
        if (text) {
          output.push({ type: 'text', text });
          textBlocks.push(text);
        }
      } else if (event?.type === 'response.output_item.added' && event.item?.type === 'function_call') {
        calls.set(Number(event.output_index) || 0, {
          id: String(event.item.call_id || event.item.id || ''),
          name: String(event.item.name || ''),
          arguments: String(event.item.arguments || ''),
        });
      } else if (event?.type === 'response.function_call_arguments.delta') {
        const call = calls.get(Number(event.output_index) || 0);
        if (call) call.arguments += String(event.delta || '');
      } else if (event?.type === 'response.output_item.done' && event.item?.type === 'function_call') {
        const index = Number(event.output_index) || 0;
        const call = calls.get(index) || {
          id: String(event.item.call_id || event.item.id || ''),
          name: String(event.item.name || ''),
          arguments: '',
        };
        call.id = String(event.item.call_id || event.item.id || call.id);
        call.name = String(event.item.name || call.name);
        call.arguments = String(event.item.arguments || call.arguments || '{}');
        calls.set(index, call);
      } else if (event?.type === 'response.completed') {
        finalPayload = event.response;
      }
    });

    for (const call of calls.values()) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.arguments || '{}'); } catch { /* Tool Gateway rejects invalid input. */ }
      output.push({ type: 'tool_call', id: call.id, name: call.name, arguments: args });
    }

    return {
      provider: this.id,
      model: String(finalPayload?.model || model),
      output,
      textBlocks,
      webResults: webResultsOf(finalPayload),
      usage: usageOf(finalPayload),
    };
  }
}
