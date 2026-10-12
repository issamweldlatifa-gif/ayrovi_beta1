/**
 * Bright Data Web Unlocker — المزوّد الوحيد للكشط المدفوع (يحلّ محلّ Jina).
 *
 * يُفعَّل فقط عند ضبط `BRIGHTDATA_API_KEY` و`BRIGHTDATA_ZONE` على الخادم.
 * بدونهما لا يُرسَل أي طلب، والدالة تُرجع `null` بصمت (لا تقديرات ولا تكلفة).
 *
 * العقد (وثائق Bright Data) :
 *   POST https://api.brightdata.com/request
 *   Authorization: Bearer <BRIGHTDATA_API_KEY>
 *   { zone, url, format: 'raw', render?: 'true' }
 *
 * `render` يُفعَّل للمتاجر المرسومة بـJavaScript (Shein، Temu) فقط، لأن الرندر
 * أغلى من الطلب العادي. الرابط المستهدف يُتحقَّق منه (عام وآمن) قبل الإرسال.
 */
import { resolveSafeHttpUrl, readLimitedText } from '../services/safeUrl';

const ENDPOINT = 'https://api.brightdata.com/request';

/** المتاجر التي لا يظهر سعرها إلا بعد تنفيذ JavaScript. */
const JS_RENDERED_STORES = new Set(['shein', 'temu']);

export function brightDataConfig(): { apiKey: string; zone: string } | null {
  const apiKey = (process.env.BRIGHTDATA_API_KEY || '').trim();
  const zone = (process.env.BRIGHTDATA_ZONE || '').trim();
  return apiKey && zone ? { apiKey, zone } : null;
}

export function brightDataReady(): boolean {
  return brightDataConfig() !== null;
}

/**
 * يجلب HTML الصفحة عبر Bright Data. `null` = غير مفعّل أو صفحة فارغة.
 * يرمي خطأ بكود واضح عند فشل الاتصال أو رفض الخدمة (يُسجَّل كـ failureCode).
 */
export async function fetchBrightDataHtml(
  url: string,
  storeType: string,
  signal: AbortSignal,
): Promise<string | null> {
  const config = brightDataConfig();
  if (!config) return null;

  // لا نرسل إلى Bright Data إلا رابطاً عاماً وآمناً (نفس قاعدة الكشط المباشر).
  const safe = await resolveSafeHttpUrl(url);

  const body: Record<string, string> = { zone: config.zone, url: safe.url.toString(), format: 'raw' };
  if (JS_RENDERED_STORES.has(storeType)) body.render = 'true';

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`BRIGHTDATA_HTTP_${response.status}`);
  }
  const html = await readLimitedText(response, 2_000_000);
  if (!html.trim() || !/<(?:html|body|script|meta)\b/i.test(html)) return null;
  return html;
}
