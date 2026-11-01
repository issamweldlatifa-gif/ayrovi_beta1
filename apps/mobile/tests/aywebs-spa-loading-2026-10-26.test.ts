/**
 * AYWEBs — « الدخول لأي منتج SHEIN يبقى في chargement » (26/10/2026).
 *
 * ── ما كان يصرا ────────────────────────────────────────────────────────────
 * فتح فiche SHEIN (أو TEMU) يطلق قراءة صامتة في الـWebView. الزرّ « Add to
 * Cart » كان:
 *   • معطّلاً ما دامت القراءة الصامتة جارية (`!prefetchReading`)،
 *   • ومكتوباً عليه « Chargement… » طول تلك المدّة.
 * وهذان الموقعان يُضاف إليهما أنّ:
 *   • كل قراءة كانت تنتظر « نهاية التحميل » حتى 8 ثوانٍ — والصفحة mono-page
 *     تحافظ على طلب مفتوح، فالمدة تتكرّر مع كل محاولة،
 *   • والانتظار بعد capture بلا سعر كان ثابتاً (450 ms) — أقلّ من زمن hydration
 *     متاع هذه المتاجر، فالمحاولات كلّها تسقط في نفس النافذة الفارغة.
 *
 * ── ما يُثبَّت هنا ─────────────────────────────────────────────────────────
 * القراءة الصامتة مُسرِّع، ماشي شرط: ميزانية صريحة، وانتظار تحميل مرّة واحدة لكل
 * صفحة، وتأخير تصاعدي. لا نلمس منطق القراءة نفسه.
 */
import { describe, expect, it } from 'vitest';

import {
  AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES,
  AYWEBS_PREFETCH_BUDGET_MS,
  AYWEBS_CAPTURE_PRICE_RETRY_DELAYS_MS,
  priceRetryDelayMs,
  shouldRetryAyWebsCaptureForPrice,
} from '@/features/aywebs/captureFlow';

describe('relance après capture sans prix — délai croissant, borné', () => {
  it('le premier délai reste court (le prix arrive parfois tout de suite)', () => {
    expect(priceRetryDelayMs(0)).toBe(AYWEBS_CAPTURE_PRICE_RETRY_DELAYS_MS[0]);
    expect(priceRetryDelayMs(0)).toBeLessThan(1000);
  });

  it('les relances suivantes attendent PLUS (hydratation d’une application mono-page)', () => {
    for (let i = 1; i < AYWEBS_CAPTURE_PRICE_RETRY_DELAYS_MS.length; i += 1) {
      expect(priceRetryDelayMs(i)).toBeGreaterThan(priceRetryDelayMs(i - 1));
    }
  });

  it('le délai ne dépasse jamais le dernier palier, même pour un index absurde', () => {
    const last = AYWEBS_CAPTURE_PRICE_RETRY_DELAYS_MS[AYWEBS_CAPTURE_PRICE_RETRY_DELAYS_MS.length - 1];
    expect(priceRetryDelayMs(99)).toBe(last);
    expect(priceRetryDelayMs(-3)).toBeGreaterThan(0);
    expect(Number.isFinite(priceRetryDelayMs(Number.NaN))).toBe(true);
  });

  it('le nombre de relances reste borné (aucune boucle infinie)', () => {
    expect(AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES).toBeLessThanOrEqual(3);
    expect(shouldRetryAyWebsCaptureForPrice([], AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES)).toBe(false);
    /* Le budget total des relances reste sous la seconde et demie + marge. */
    const total = AYWEBS_CAPTURE_PRICE_RETRY_DELAYS_MS
      .slice(0, AYWEBS_CAPTURE_EMPTY_PRICE_RETRIES)
      .reduce((sum, delay) => sum + delay, 0);
    expect(total).toBeLessThan(5000);
  });
});

describe('budget de la pré-lecture silencieuse', () => {
  it('existe et est borné : l’écran ne reste jamais en « Chargement… »', () => {
    expect(AYWEBS_PREFETCH_BUDGET_MS).toBeGreaterThan(0);
    expect(AYWEBS_PREFETCH_BUDGET_MS).toBeLessThanOrEqual(15_000);
  });
});
