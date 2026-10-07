/**
 * المساعد (P5.4) — فكّ التيّار، الحدود، والحالات.
 *
 * أهمّ اختبار هنا: **نصّ مقسوم على دفعتين**. التطبيق يقرا تيّاراً، وحدث واحد
 * يجي على زوز `read()` — فكّ خاطئ يعني نصّاً مقطوعاً أو رسالة خطأ مخترعة.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assistantOutgoingMessages, fetchAssistantStatus, newAssistantConversationId, parseAssistantEvent,
  parseAssistantEvents, streamAssistantChat, type StreamFetch,
} from '../src/api/assistant';
import { API_BASE_URL } from '../src/api/config';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('فكّ الأحداث', () => {
  it('كل نوع معروف يتقرا كما هو، والمجهول يترمى بلا تخمين', () => {
    expect(parseAssistantEvent({ type: 'delta', text: 'مرحبا' })).toEqual({ type: 'delta', text: 'مرحبا' });
    expect(parseAssistantEvent({ type: 'state', state: 'analyzing' })).toEqual({ type: 'state', state: 'analyzing' });
    expect(parseAssistantEvent({ type: 'done', model: 'gpt-x' })).toEqual({ type: 'done', model: 'gpt-x' });
    expect(parseAssistantEvent({ type: 'tool', name: 'lens_search', data: { q: 'x' } }))
      .toEqual({ type: 'tool', name: 'lens_search', data: { q: 'x' } });
    expect(parseAssistantEvent({ type: 'state', state: 'inventée' })).toBeNull();
    expect(parseAssistantEvent({ type: 'peut_être' })).toBeNull();
    expect(parseAssistantEvent(null)).toBeNull();
  });

  it('الحدث المقسوم على زوز دفعات ما يضيعش', () => {
    const first = parseAssistantEvents('data: {"type":"delta","text":"السل');
    expect(first.events).toEqual([]);
    expect(first.rest).toContain('السل');

    const second = parseAssistantEvents(`${first.rest}ّة"}\n\n`);
    expect(second.events).toEqual([{ type: 'delta', text: 'السلّة' }]);
    expect(second.rest).toBe('');
  });

  it('أسطر غير JSON ولا `[DONE]` ما تولّدش أحداثاً كاذبة', () => {
    const buffer = [
      'data: pas du json',
      '',
      'data: [DONE]',
      '',
      'data: {"type":"done","model":"m1"}',
      '',
      '',
    ].join('\n');
    expect(parseAssistantEvents(buffer).events).toEqual([{ type: 'done', model: 'm1' }]);
  });
});

describe('حدود المحادثة', () => {
  it('نبعثو آخر 30 رسالة و8000 رمز للسطر، والفارغ يترمى', () => {
    const messages = Array.from({ length: 40 }, (_, index) => ({
      role: (index % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: `m${index}`,
    }));
    messages.push({ role: 'user', text: '   ' });
    const outgoing = assistantOutgoingMessages(messages);
    expect(outgoing).toHaveLength(30);
    expect(outgoing.at(-1)?.text).toBe('m39');

    const long = assistantOutgoingMessages([{ role: 'user', text: 'x'.repeat(9000) }]);
    expect(long[0].text).toHaveLength(8000);
  });

  it('معرّف المحادثة يتنقّى لقيد الخادم', () => {
    expect(newAssistantConversationId(() => 'conv:123-abc')).toBe('conv:123-abc');
    expect(newAssistantConversationId(() => '!!!')).toBe('conv-fallback');
  });
});

describe('الحالة', () => {
  it('جاهزية المساعد تتقرا من الخادم، موش مُفترضة', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      success: true,
      data: { ready: false, provider: 'anthropic', streaming: true, vision: true, voiceReady: false },
    })));
    const status = await fetchAssistantStatus();
    expect(status.ready).toBe(false);
    expect(status.streaming).toBe(true);
  });
});

/* ── التيّار: ردّ صناعي فيه body متاع تيّار ─────────────────────────────── */

const streamResponse = (chunks: string[], status = 200) => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return { status, ok: status >= 200 && status < 300, body };
};

describe('تيّار المحادثة', () => {
  it('الأحداث توصل بالترتيب، والنصّ يتجمّع كي يجي مقسوماً', async () => {
    const calls: { url: string; init: { headers: Record<string, string>; body: string } }[] = [];
    const fetchImpl: StreamFetch = async (url, init) => {
      calls.push({ url, init });
      return streamResponse([
        'data: {"type":"state","state":"thinking"}\n\ndata: {"type":"delta","text":"السل',
        'ّة فيها"}\n\ndata: {"type":"delta","text":" 3 منتوجات"}\n\n',
        'data: {"type":"done","model":"m1"}\n\n',
      ]);
    };

    const seen: string[] = [];
    const run = streamAssistantChat(
      { conversationId: 'conv:1', sessionId: 'sess-1', messages: [{ role: 'user', text: 'شوفلي' }] },
      (event) => { seen.push(event.type === 'delta' ? event.text : event.type); },
      { fetchImpl },
    );

    expect(await run.finished).toBe('done');
    expect(seen).toEqual(['state', 'السلّة فيها', ' 3 منتوجات', 'done']);
    expect(calls[0].url).toBe(`${API_BASE_URL}/api/assistant/chat`);
    expect(calls[0].init.headers.Accept).toBe('text/event-stream');
    expect(calls[0].init.headers['x-session-id']).toBe('sess-1');
    expect(JSON.parse(calls[0].init.body).messages).toEqual([{ role: 'user', text: 'شوفلي' }]);
  });

  it('بلا `done` ما فماش «نجاح»: التيّار المنقطع يتقال', async () => {
    const fetchImpl: StreamFetch = async () => streamResponse(['data: {"type":"delta","text":"بداية"}\n\n']);
    const run = streamAssistantChat(
      { conversationId: 'conv:1', sessionId: 'sess-1', messages: [{ role: 'user', text: 'x' }] },
      () => undefined,
      { fetchImpl },
    );
    expect(await run.finished).toBe('error');
  });

  it('503 = المساعد موش جاهز، بكوده بلا لفّ', async () => {
    const events: string[] = [];
    const fetchImpl: StreamFetch = async () => ({ status: 503, ok: false, body: null });
    const run = streamAssistantChat(
      { conversationId: 'conv:1', sessionId: 'sess-1', messages: [{ role: 'user', text: 'x' }] },
      (event) => { events.push(event.type === 'error' ? event.code : event.type); },
      { fetchImpl },
    );
    expect(await run.finished).toBe('error');
    expect(events).toEqual(['ASSISTANT_UNAVAILABLE']);
  });

  it('رسالة خطأ من الخادم توقف التيّار بكودها', async () => {
    const events: string[] = [];
    const fetchImpl: StreamFetch = async () => streamResponse([
      'data: {"type":"error","code":"ASSISTANT_ERROR","message":"La réponse n’a pas pu être générée."}\n\n',
      'data: {"type":"delta","text":"ما يجيش"}\n\n',
    ]);
    const run = streamAssistantChat(
      { conversationId: 'conv:1', sessionId: 'sess-1', messages: [{ role: 'user', text: 'x' }] },
      (event) => { events.push(event.type === 'error' ? event.code : event.type); },
      { fetchImpl },
    );
    expect(await run.finished).toBe('error');
    expect(events).toEqual(['ASSISTANT_ERROR']);
  });
});

describe('حدود الوحدة', () => {
  it('assistant.ts ما يستوردش React Native ولا شاشات', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('../src/api/assistant.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"]react-native['"]/);
    expect(source).not.toMatch(/from ['"]@\//);
  });
});
