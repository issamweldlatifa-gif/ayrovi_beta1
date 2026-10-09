/**
 * المساعد الذكي — العميل (مرحلة P5، الشريحة 4).
 *
 * الخادم `/api/assistant/chat` يرجّع **SSE**: كل سطر `data: {json}` وفيه حدث
 * (`state` / `delta` / `tool` / `done` / `error`). لهذا:
 *
 *  • **فكّ SSE دالة نقية هنا** (`parseAssistantEvents`) — تتختبر بلا شبكة ولا
 *    جهاز؛ الخطأ الشائع (نصّ مقسوم على حدثين) يتغطّى في الاختبار، موش في الجهاز.
 *  • **الاتصال يتقرا بتيّار**: `fetch` متاع React Native ما يعطيش `body`؛
 *    نستعمل `expo/fetch` (يوفّر `getReader()` في Expo SDK 52+) — وهذي هي
 *    الحدود الوحيدة اللي تلمس الجهاز في الملف هذا.
 *  • **الحالة تتقال**: `state` من الخادم (thinking/analyzing/reasoning/creating)
 *    تتعرض كما هي؛ و`error` بكوده. ما نصنعوش «ردّاً» كان الخادم ما ردّش.
 *  • `GET /api/assistant/status` يحكم: كان المساعد ما هوش جاهز (`ready:false`)
 *    أو 503 ⇒ الشاشة تقولها بصراحة بدل صندوق دردشة ميّت.
 */
import { ApiError } from './errors';
import { API_BASE_URL } from './config';
import { authHeaders, type RequestOptions } from './client';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** حالات المساعد المعلنة من الخادم — قاموس مغلق. */
export type AssistantState = 'thinking' | 'analyzing' | 'reasoning' | 'creating';

export type AssistantEvent =
  | { type: 'state'; state: AssistantState }
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; data: Record<string, unknown> }
  | { type: 'done'; model: string }
  | { type: 'error'; code: string; message: string };

const STATES: AssistantState[] = ['thinking', 'analyzing', 'reasoning', 'creating'];

/** حدث واحد من كائن JSON — أو `null` كان ما نعرفوهش (ما نخمّنوش معناه). */
export function parseAssistantEvent(payload: unknown): AssistantEvent | null {
  if (!isRecord(payload)) return null;
  const type = str(payload.type);
  if (type === 'delta' && typeof payload.text === 'string') return { type: 'delta', text: payload.text };
  if (type === 'state') {
    const state = str(payload.state) as AssistantState;
    return STATES.includes(state) ? { type: 'state', state } : null;
  }
  if (type === 'tool' && str(payload.name)) {
    return { type: 'tool', name: str(payload.name), data: isRecord(payload.data) ? payload.data : {} };
  }
  if (type === 'done') return { type: 'done', model: str(payload.model) };
  if (type === 'error') {
    return { type: 'error', code: str(payload.code) || 'ASSISTANT_ERROR', message: str(payload.message) };
  }
  return null;
}

export interface AssistantDecodeResult {
  events: AssistantEvent[];
  /** الجزء غير المكتمل من آخر حدث — يتخزّن ويتبعث مع الدفعة الجاية. */
  rest: string;
}

/**
 * يفكّ دفعة نصّية من التيّار. `data:` وحدها، والأسطر الفارغة تفصل الأحداث
 * (مواصفة SSE). النصّ الناقص في الآخر **ما يترماش**: يرجّع في `rest`.
 */
export function parseAssistantEvents(buffer: string): AssistantDecodeResult {
  const events: AssistantEvent[] = [];
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      try {
        const event = parseAssistantEvent(JSON.parse(raw));
        if (event) events.push(event);
      } catch {
        // سطر غير JSON: نتجاهلوه بلا ما نوفّروا ردّاً مخترعاً.
      }
    }
  }
  return { events, rest };
}

/** جلسة محادثة: معرّف جديد لكل محادثة (نفس قيد الخادم `^[A-Za-z0-9:_-]{1,120}$`). */
export function newAssistantConversationId(random: () => string): string {
  const value = String(random()).replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 120);
  return value || 'conv-fallback';
}

export interface AssistantStatus {
  ready: boolean;
  provider: string;
  streaming: boolean;
  vision: boolean;
  voiceReady: boolean;
}

export async function fetchAssistantStatus(options: RequestOptions = {}): Promise<AssistantStatus> {
  const response = await fetch(`${API_BASE_URL}/api/assistant/status`, {
    method: 'GET',
    headers: { Accept: 'application/json', ...authHeaders('GET'), ...(options.headers ?? {}) },
    signal: options.signal,
  });
  const payload = await response.json().catch(() => null);
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null;
  if (!response.ok || !data) {
    throw new ApiError('http', 'Assistant indisponible.', { status: response.status });
  }
  return {
    ready: data.ready === true,
    provider: str(data.provider),
    streaming: data.streaming === true,
    vision: data.vision === true,
    voiceReady: data.voiceReady === true,
  };
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * الحدّ الأدنى من `fetch` اللي نحتاجوه: ردّ فيه `body` متاع تيّار. `expo/fetch`
 * يوفّرو؛ و`fetch` متاع المتصفّح/Node كذلك — وهذا اللي يخلّي الاختبار ممكن.
 */
export type StreamFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; ok: boolean; body: ReadableStream<Uint8Array> | null }>;

export interface AssistantStreamInput {
  conversationId: string;
  sessionId: string;
  messages: AssistantMessage[];
}

/** رسائل الخادم تُقصّ 30 سطراً و8000 رمز للسطر — نبعثو اللي يلزم وحدو. */
export const ASSISTANT_MAX_MESSAGES = 30;
export const ASSISTANT_MAX_CHARS = 8000;

export function assistantOutgoingMessages(messages: AssistantMessage[]): AssistantMessage[] {
  return messages
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.text.trim().length > 0)
    .slice(-ASSISTANT_MAX_MESSAGES)
    .map((message) => ({ role: message.role, text: message.text.trim().slice(0, ASSISTANT_MAX_CHARS) }));
}

/**
 * يفتح التيّار ويستدعي `onEvent` لكل حدث. يرجّع كائن فيه `abort()`.
 *
 * ملاحظة صدق: كان التيّار انقطع بلا `done`، ما نعتبروهش نجاحاً — الشاشة تقولها.
 */
export function streamAssistantChat(
  input: AssistantStreamInput,
  onEvent: (event: AssistantEvent) => void,
  options: RequestOptions & { fetchImpl?: StreamFetch } = {},
): { abort: () => void; finished: Promise<'done' | 'aborted' | 'error'> } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort);

  const doFetch = options.fetchImpl ?? (globalThis.fetch as unknown as StreamFetch);

  const finished = (async (): Promise<'done' | 'aborted' | 'error'> => {
    const response = await doFetch(`${API_BASE_URL}/api/assistant/chat`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        // الجلسة من الترويسة (موش من الجسم): `validSessionId` في الخادم يقرا
        // `x-session-id` وحدها. بلاها كل محادثة تولّي بلا جلسة ⇒ 400.
        'x-session-id': input.sessionId,
        ...authHeaders('POST'),
        ...(options.headers ?? {}),
      },
      body: JSON.stringify({
        conversationId: input.conversationId,
        state: 'mobile',
        messages: assistantOutgoingMessages(input.messages),
      }),
      signal: controller.signal,
    });

    if (response.status === 503) {
      onEvent({ type: 'error', code: 'ASSISTANT_UNAVAILABLE', message: 'L’assistant AYROVI n’est pas encore disponible.' });
      return 'error';
    }
    if (!response.ok || !response.body) {
      onEvent({
        type: 'error',
        code: 'ASSISTANT_HTTP',
        message: `HTTP ${response.status}`,
      });
      return 'error';
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;
    let sawDone = false;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const decoded = parseAssistantEvents(buffer);
        buffer = decoded.rest;
        for (const event of decoded.events) {
          onEvent(event);
          if (event.type === 'done') { done = true; sawDone = true; }
          if (event.type === 'error') done = true;
        }
        if (done) break;
      }
    } catch (error) {
      if (controller.signal.aborted) return 'aborted';
      throw error;
    }
    return sawDone ? 'done' : 'error';
  })();

  return { abort, finished };
}
