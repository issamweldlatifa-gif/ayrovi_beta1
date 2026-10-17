/**
 * الفوتر (الذيْل) — محتواه من الخادم، وأمانه محلي (08/10/2026).
 *
 * قاعدتان من الموقع نقلناهما **كما هما**، لأنهما أمان موش تصميم:
 *
 *   1. **قناة غير صالحة ⇒ تبقى خاملة.** عنوان بلا `https://`، أو يحمل
 *      `user:pass@`، أو `javascript:` ⇒ **لا يُعرض**. عرض حساب مزيّف أسوأ من
 *      عرض والو. (`safeChannelUrl` — نفس شرط الويب بالحرف.)
 *   2. **وسائل الخلاص المعروضة = ما تقبله الخزينة.** القائمة تأتي من
 *      `commerce-config` بنفس دالّة الحلّ اللي يستعملها الـcheckout، فالفوتر
 *      ما يوعدش بوسيلة ترفضها الخزينة في آخر خطوة.
 *
 * والقاعدة الثالثة خاصّة بالتطبيق: **الفوتر ما يطيّحش الشاشة.** قراءتو لا
 * ترمي أبداً — نقص المحتوى ⇒ فوتر أصغر، موش استثناء يقصف الصفحة كلها.
 */
import { apiGetData } from './client';
import type { RequestOptions } from './client';

export type FooterChannelId = 'facebook' | 'instagram' | 'tiktok' | 'whatsapp';

export interface FooterChannel {
  id: FooterChannelId;
  label: string;
  href: string;
}

export interface FooterInfo {
  /** نصّ «من نحن» المحرَّر من الإدارة. فارغ ⇒ القسم ما يبانش. */
  about: string;
  /** القنوات الصالحة فقط (قد تكون فارغة). */
  channels: FooterChannel[];
  /** وسائل الخلاص كما تقبلها الخزينة. */
  paymentMethods: string[];
}

const CHANNELS: Array<{ id: FooterChannelId; label: string }> = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

const EMPTY: FooterInfo = { about: '', channels: [], paymentMethods: [] };

/**
 * هل هذا العنوان صالح للنشر؟
 *
 * ثلاثة شروط، كلّها أمان: بروتوكول `http(s)` فقط (يمنع `javascript:` و
 * `data:` والبروتوكولات المخصّصة)، و`new URL` يرفض ما لا يُحتمل، و**لا بيانات
 * اعتماد داخل الرابط** (`https://user:pass@…` وسيلة معروفة للتضليل).
 */
export function safeChannelUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function listOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * قراءة الفوتر.
 *
 * التحفّظ هنا **أشدّ** من بقية الواجهة: الفوتر عنصر زينة، وما يصحّوش أنّ
 * إعداد ناقص في الإدارة يمنع العميل من تصفّح المتجر. لذلك أي فشل ⇒ `EMPTY`
 * مسجّل في الكنسول، موش استثناء.
 */
export async function fetchFooterInfo(options: RequestOptions = {}): Promise<FooterInfo> {
  let payload: unknown;
  try {
    payload = await apiGetData<unknown>('/api/public/commerce-config', options);
  } catch (error) {
    // `typeof` موش `if (__DEV__)`: على متغيّر موش مصرّح (خارج Metro، مثلاً
    // تحت Vitest) `typeof` ما يرميش — والفوتر عنصر زينة، وما يصحّوش أنّ
    // أداة اختبار تطيّحو بسبب سطر تنبيه.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[footer] commerce-config inaccessible', error);
    }
    return EMPTY;
  }

  const body = record(payload);
  const channels = record(body.channels);

  return {
    about: text(body.footerAbout).trim(),
    channels: CHANNELS.flatMap(({ id, label }) => {
      const href = safeChannelUrl(channels[id]);
      return href ? [{ id, label, href }] : [];
    }),
    // نفس القاعدة: قائمة الخزينة، موش قائمة نخترعها وما تقبلش في الآخر.
    paymentMethods: listOf(body.paymentMethods).map((value) => value.toUpperCase()).filter(Boolean),
  };
}
