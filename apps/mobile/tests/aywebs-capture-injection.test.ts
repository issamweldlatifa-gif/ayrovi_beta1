/**
 * AYWEBs — الحقن في الـWebView: **السكريبت الحقيقي** متاع الخادم، موش نموذج مصغّر.
 *
 * خلل 23/10/2026 (تصاور العميل 04:13 و04:14): الشاشة تكتب «script injecté,
 * attente du retour» وبعدها ما يجي شي، 20 ثانية وتوقّف. السبب: السكريبت الرسمي
 * ينتهي بـ `})();` والتغليف كان `(…)`، فالنتيجة `SyntaxError` — وغلطة التركيب
 * **ما تلقّطهاش** `try/catch`، فالـWebView ما ينفّذ حتى شي وما يبعثش حتى رسالة.
 *
 * هذا الاختبار يشغّل الحقن فعلاً (نفس الباني، نفس السكريبت الرسمي) ويقول:
 * لازم توصل رسالة وحدة للجسر، وتكون JSON صحيح.
 */
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../../../src/aywebs/captureScript';
import {
  buildAyWebsCaptureInjection, captureScriptExpression, parseAyWebsCaptureMessage,
} from '@/api/aywebs';

/** DOM minimal : le script réel ne lit que des textes, des métas et des attributs. */
function sandbox(url: string, withBridge = true) {
  const posted: string[] = [];
  const document = {
    title: 'Amazon.com',
    documentElement: { getAttribute: () => 'en' },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const window: Record<string, unknown> = withBridge
    ? { ReactNativeWebView: { postMessage: (text: string) => posted.push(String(text)) } }
    : {};
  const parsedUrl = new URL(url);
  const location = { href: url, hostname: parsedUrl.hostname, pathname: parsedUrl.pathname };
  return { context: vm.createContext({ document, location, window, console }), posted };
}

function runInjection(script: string, url = 'https://www.amazon.com/dp/B0GYM3V9H5'): { posted: string[]; messages: unknown[] } {
  const { context, posted } = sandbox(url);
  vm.runInContext(buildAyWebsCaptureInjection(script), context);
  return { posted, messages: posted.map((text) => parseAyWebsCaptureMessage(text)) };
}

describe('حقن الكابتشر — السكريبت الحقيقي متاع الخادم', () => {
  it('السكريبت الرسمي ينتهي بفاصلة منقوطة: التعبير يتنحّى منّو آخر `;`', () => {
    expect(AYWEBS_CAPTURE_SCRIPT.trimEnd().endsWith('})();')).toBe(true);
    expect(captureScriptExpression(AYWEBS_CAPTURE_SCRIPT).trimEnd().endsWith('})()')).toBe(true);
  });

  it('الحقن يتنفّذ فعلاً ويبعث رسالة وحدة صالحة للجسر (الخلل الأصلي)', () => {
    const { posted, messages } = runInjection(AYWEBS_CAPTURE_SCRIPT);
    expect(posted).toHaveLength(1);
    expect(messages[0]).toMatchObject({ ok: true });
    const capture = (messages[0] as { ok: true; capture: Record<string, unknown> }).capture;
    expect(capture.v).toBe(1);
    expect(capture.url).toBe('https://www.amazon.com/dp/B0GYM3V9H5');
    expect(Array.isArray(capture.priceCandidates)).toBe(true);
  });

  it('سكريبت ينتهي بـ `;` زيادة ما يكسرش الحقن', () => {
    const { messages } = runInjection('(function () { return JSON.stringify({ v: 1, url: "x" }); })();', 'https://www.amazon.com/');
    expect(messages[0]).toMatchObject({ ok: true, capture: { v: 1, url: 'x' } });
  });

  it('سكريبت رجع غير نصّ ⇒ SCRIPT_NO_RESULT صريحة، موش «undefined»', () => {
    const { posted } = runInjection('(function () { return undefined; })();', 'https://www.amazon.com/');
    expect(JSON.parse(posted[0])).toEqual({ __aywebs_error: 'SCRIPT_NO_RESULT' });
    expect(parseAyWebsCaptureMessage(posted[0])).toEqual({ ok: false, reason: 'SCRIPT_ERROR' });
  });

  it('استثناء داخل السكريبت ⇒ __aywebs_error، والجسر يبقى حيّ', () => {
    const { posted } = runInjection('(function () { throw new Error("marchand cassé"); })();', 'https://www.amazon.com/');
    expect(JSON.parse(posted[0])).toMatchObject({ __aywebs_error: expect.stringContaining('marchand cassé') });
  });

  it('غياب جسر ReactNativeWebView ما يولّيش استثناءً صامتاً', () => {
    const { context } = sandbox('https://www.amazon.com/', false);
    expect(() => vm.runInContext(buildAyWebsCaptureInjection('(function () { return "{}"; })();'), context)).not.toThrow();
  });

  it('السكريبت الفارغ يُرفض بالكلام، موش بحقن صامت', () => {
    expect(() => buildAyWebsCaptureInjection('  ')).toThrow(/vide/);
    expect(() => buildAyWebsCaptureInjection(';;;')).toThrow(/vide/);
  });
});
