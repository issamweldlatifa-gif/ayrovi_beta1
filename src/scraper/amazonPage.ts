/**
 * AMAZON — قراءة فiche المنتج (04/10/2026).
 *
 * لماذا يوجد هذا الملف؟
 * صفحة أمازون لا تنشر JSON-LD ولا وسوم meta للسعر. السعر مُفتَّت في ثلاث spans:
 *   <span class="a-price-symbol">$</span>
 *   <span class="a-price-whole">109<span class="a-price-decimal">.</span></span>
 *   <span class="a-price-fraction">00</span>
 * و`.a-offscreen` **داخل** كتلة السعر فارغ (مسافة بيضاء فقط). أي قراءة
 * `textContent` للحاوية تُرجع « » أو « $ » وحده — وهو بالضبط سبب ظهور
 * « produit à 0 » ثم « Le devis AYROVI est indisponible » في التطبيق.
 *
 * قياس بتاريخ 04/10/2026 على https://www.amazon.com/dp/B0GYM3V9H5
 * (سطح مكتب 844 ك.ب · جوال 568 ك.ب) — المصادر الحقيقية الموجودة في الصفحة:
 *   #apex-pricetopay-accessibility-label          → « $109.00 »
 *   "displayPrice":"$109.00","priceAmount":109.00 → JSON مدمج
 *   spans: a-price-whole=«109» + a-price-fraction=«00»
 *   twister: sortedDimValuesForAllDims / dimensionValuesDisplayData / variationDisplayLabels
 *
 * كل ما هنا **مقروء من الصفحة**، ولا شيء مُخمَّن: لا سعر من العنوان، ولا توفر
 * بدون دليل (`dimensionValueState`).
 */
import type { ProductVariantDetail } from '../types';
import { checkPriceText } from './priceIntegrity';

export interface AmazonPriceReading {
  /** النص الخام للسعر الحالي كما نشرته الصفحة (« $109.00 »). */
  current: string;
  /** السعر المشطوب/قبل التخفيض، إن نشرته الصفحة. */
  original: string;
  /** كود العملة من مصادر الصفحة (حقل مخفي أو رمز). */
  currency: string;
  /** مصدر القراءة — يُسجَّل في الأدلة (`verificationMethod`). */
  source: 'accessibility' | 'buybox' | 'embedded_json' | 'price_block' | 'spans' | 'none';
}

export interface AmazonVariantReading {
  details: ProductVariantDetail[];
  groups: Array<{ attribute: string; label: string; values: string[] }>;
  selectedAsin: string | null;
}

const PLACEHOLDER_TOKEN = /\{[a-z_]+\}/i;

function collapse(raw: string | null | undefined): string {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

function plausiblePriceText(text: string): boolean {
  if (!text || PLACEHOLDER_TOKEN.test(text)) return false;
  if (!/\d/.test(text)) return false;
  // Instalments / abonnements / livraison ne sont pas le prix de l'article.
  if (/(?:\/|per\s|par\s)\s*(?:month|mois|week|semaine)|\bmonthly\b|\binstallment|\bpar mois\b/i.test(text)) return false;
  // Phase 0 (06/10/2026) — verdict d'intégrité : « $6.99$6.99 » (hors-écran +
  // visible concaténés) ne doit JAMAIS devenir 6996.99.
  if (!checkPriceText(text).ok) return false;
  return true;
}

/** يعيد بناء نص السعر من spans `a-price-*` (`.a-offscreen` الداخلي فارغ). */
function spanPrice(element: Element | null): string {
  if (!element) return '';
  const offscreen = collapse(element.querySelector('.a-offscreen')?.textContent);
  if (offscreen && /\d/.test(offscreen)) return offscreen;
  const whole = collapse(element.querySelector('.a-price-whole')?.textContent).replace(/[.,\s]+$/, '');
  if (!whole || !/\d/.test(whole)) return '';
  const fraction = collapse(element.querySelector('.a-price-fraction')?.textContent).replace(/\D/g, '').slice(0, 2);
  const symbol = collapse(element.querySelector('.a-price-symbol')?.textContent);
  return `${symbol}${whole}${fraction ? `.${fraction}` : ''}`;
}

/**
 * استخراج كائن JSON متوازن بعد مفتاح داخل HTML الصفحة.
 * أمازون تُدرج هذه الكتل مرتين: مرة JSON خام ومرة داخل نص مُهرَّب (`\"`)؛
 * لذلك نجرب الصيغتين. الماسح يحترم النصوص والهروب كي لا ينكسر على `{` داخل قيمة.
 */
export function jsonAfterKey(html: string, key: string): any | null {
  const needles = [`"${key}"`, `"${key}" :`, `${key}":`];
  for (const haystack of [html, html.replace(/\\"/g, '"')]) {
    for (const needle of needles) {
      // La clé apparaît PLUSIEURS fois (un objet vide de gabarit, puis l'objet
      // réellement rempli) : ne pas s'arrêter à la première — un `{}` vide
      // masquerait les données de la fiche.
      let cursor = 0;
      while (cursor < haystack.length) {
        const at = haystack.indexOf(needle, cursor);
        if (at < 0) break;
        cursor = at + needle.length;
        const open = haystack.indexOf('{', at + needle.length - 1);
        if (open < 0) continue;
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let index = open; index < haystack.length && index < open + 3_000_000; index += 1) {
        const char = haystack[index];
        if (inString) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') { inString = true; continue; }
        if (char === '{') depth += 1;
        else if (char === '}') {
          depth -= 1;
          if (depth === 0) {
            try {
              const parsed = JSON.parse(haystack.slice(open, index + 1));
              // Objet vide = gabarit ; on continue la recherche.
              if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) return parsed;
            } catch {
              // Bloc illisible : on essaie l'occurrence suivante plutôt que
              // de renoncer (les pages marchandes tronquent volontiers un JSON).
            }
            break;
          }
        }
      }
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * التوفّر المنشور
 * ------------------------------------------------------------------ */

/**
 * التوفّر — من نصّ نشره الموقع نفسه في `#availability` (« In Stock »،
 * « Only 3 left in stock »، « Currently unavailable »). لا استنتاج من غياب
 * النص: غيابه يعني `null`، ويبقى الحقل UNKNOWN كما ينصّ العقد (§14).
 */
export function readAmazonAvailability(document: Document): 'in_stock' | 'limited' | 'out_of_stock' | null {
  const text = [
    document.querySelector('#availability .primary-availability-message')?.textContent,
    document.querySelector('#availability_feature_div .primary-availability-message')?.textContent,
    document.querySelector('#availability')?.textContent,
    document.querySelector('#availability_feature_div .a-color-success')?.textContent,
    document.querySelector('#availability_feature_div .a-color-price')?.textContent,
    document.querySelector('#outOfStock')?.textContent,
  ]
    .map((value) => collapse(value))
    .filter(Boolean)
    .join(' | ').toLowerCase();
  if (!text) return null;
  if (/currently unavailable|temporarily out of stock|غير متوفر|indisponible/.test(text)) return 'out_of_stock';
  if (/only \d+ left|low stock|plus que \d+/.test(text)) return 'limited';
  if (/\bin stock\b|متوفر|en stock|disponible/.test(text)) return 'in_stock';
  return null;
}

/* ------------------------------------------------------------------ *
 * السعر
 * ------------------------------------------------------------------ */

const CURRENT_PRICE_SELECTORS: Array<{ selector: string; source: AmazonPriceReading['source'] }> = [
  { selector: '#apex-pricetopay-accessibility-label', source: 'accessibility' },
  { selector: '#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price)', source: 'buybox' },
  { selector: '#corePrice_feature_div .a-price:not(.a-text-price)', source: 'buybox' },
  { selector: '.priceToPay', source: 'buybox' },
  { selector: '#apex_desktop .a-price[data-a-color="base"]', source: 'buybox' },
  { selector: '#priceblock_ourprice', source: 'price_block' },
  { selector: '#priceblock_dealprice', source: 'price_block' },
  { selector: '#priceblock_saleprice', source: 'price_block' },
  { selector: '#priceblock_price', source: 'price_block' },
  { selector: '#tp_price_block_total_price_ww .a-offscreen', source: 'price_block' },
  { selector: '#newBuyBoxPrice', source: 'price_block' },
  { selector: '#price_inside_buybox', source: 'price_block' },
  { selector: '#sns-base-price', source: 'price_block' },
  { selector: '#buybox .a-price:not(.a-text-price)', source: 'buybox' },
  { selector: '#desktop_buybox .a-price:not(.a-text-price)', source: 'buybox' },
  { selector: '#mobile_buybox .a-price:not(.a-text-price)', source: 'buybox' },
  { selector: '#ppd .a-price:not(.a-text-price)', source: 'buybox' },
];

const ORIGINAL_PRICE_SELECTORS = [
  '#corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen',
  '#corePrice_feature_div .a-text-price .a-offscreen',
  '#apex_desktop .a-text-price .a-offscreen',
  '#listPrice',
  '#priceblock_listprice',
  '#priceblock_ourprice_list_price',
  '.basisPrice .a-offscreen',
];

/** قراءة كاملة للسعر: المصادر مرتّبة من الأعلى ثقة إلى الأضعف، ولا تخمين. */
export function readAmazonPrice(document: Document, pageHtml: string): AmazonPriceReading {
  const empty: AmazonPriceReading = { current: '', original: '', currency: '', source: 'none' };

  for (const { selector, source } of CURRENT_PRICE_SELECTORS) {
    const element = document.querySelector(selector);
    if (!element) continue;
    // Phase 0 (06/10/2026) : la lecture ne se contente plus du premier candidat.
    // `textContent` d'une grappe de prix vaut souvent « $6.99$6.99 » (prix
    // hors-écran + prix visible) ; on essaie alors la RECONSTRUCTION par spans
    // (`a-price-whole`/`a-price-fraction`), qui rend « $6.99 ». Avant ce
    // correctif, la grappe était simplement sautée et la lecture continuait,
    // laissant un prix absent — ou pire, un montant concaténé accepté plus tard.
    const candidates = [collapse(element.textContent), spanPrice(element)].filter((candidate) => candidate);
    const text = candidates.find((candidate) => plausiblePriceText(candidate));
    if (!text) continue;
    return {
      current: text,
      original: '',
      currency: '',
      source,
    };
  }

  // بيانات JSON مدمجة: "displayPrice":"$109.00" ثم "priceAmount":109.00
  const displayPrice = pageHtml.match(/"displayPrice"\s*:\s*"([^"]{1,40})"/)?.[1];
  if (plausiblePriceText(collapse(displayPrice))) {
    return { current: collapse(displayPrice), original: '', currency: '', source: 'embedded_json' };
  }
  const amount = pageHtml.match(/"priceAmount"\s*:\s*([0-9][0-9.,]*)/)?.[1];
  if (amount) {
    // Phase 0 : plusieurs `priceAmount` divergents = page qui parle de plusieurs
    // articles (publicités, accessoires, volets). Aucun ne peut être publié.
    const allAmounts = [...pageHtml.matchAll(/"priceAmount"\s*:\s*([0-9][0-9.,]*)/g)]
      .map((match) => checkPriceText(match[1]))
      .filter((check) => check.ok)
      .map((check) => check.value);
    const distinct = [...new Set(allAmounts)];
    if (distinct.length > 1) {
      const ratio = Math.max(...distinct) / Math.min(...distinct);
      if (!Number.isFinite(ratio) || ratio >= 20) return empty;
    }
    const symbol = pageHtml.match(/"currencySymbol"\s*:\s*"([^"]{1,4})"/)?.[1] || '';
    const text = `${symbol}${amount}`;
    if (plausiblePriceText(text)) {
      return { current: text, original: '', currency: '', source: 'embedded_json' };
    }
  }

  return empty;
}

/** السعر المشطوب + العملة: قراءتان مستقلتان عن السعر الحالي. */
export function readAmazonExtras(document: Document, pageHtml: string, currentPriceText: string): { original: string; currency: string; currencyVerified: boolean } {
  let original = '';
  for (const selector of ORIGINAL_PRICE_SELECTORS) {
    const text = collapse(document.querySelector(selector)?.textContent);
    if (plausiblePriceText(text) && text !== currentPriceText) { original = text; break; }
  }
  if (!original) {
    const listed = pageHtml.match(/"listPrice"\s*:\s*"([^"]{1,40})"/)?.[1];
    if (plausiblePriceText(collapse(listed)) && collapse(listed) !== currentPriceText) original = collapse(listed);
  }

  const currencyInput = Array.from(document.querySelectorAll('input[type="hidden"]'))
    .map((input) => input.getAttribute('name') || '')
    .find((name) => /\[currencyCode\]$/i.test(name));
  const currencyFromInput = currencyInput
    ? document.querySelector(`input[name="${currencyInput.replace(/"/g, '\\"')}"]`)?.getAttribute('value') || ''
    : '';
  const currencyFromJson = pageHtml.match(/"currencyCode"\s*:\s*"([A-Z]{3})"/)?.[1]
    || pageHtml.match(/"currencyCode]\]"\s+value="([A-Z]{3})"/)?.[1]
    || '';
  const symbol = currentPriceText.replace(/[0-9.,\s]/g, '').trim();

  const explicitCurrency = collapse(currencyFromInput).toUpperCase()
    || collapse(currencyFromJson).toUpperCase();
  return {
    original,
    currency: explicitCurrency || symbol,
    // Amazon's USD currencyCode field is unambiguous; a bare "$" is not.
    currencyVerified: /^[A-Z]{3}$/.test(explicitCurrency),
  };
}

/* ------------------------------------------------------------------ *
 * المتغيّرات (twister) — أسماء وأبعاد وقيم وحالة كل قيمة
 * ------------------------------------------------------------------ */

const DIMENSION_ATTRIBUTE: Record<string, string> = {
  size_name: 'size',
  color_name: 'color',
  style_name: 'style',
  pattern_name: 'pattern',
  flavor_name: 'flavor',
  ring_size: 'size',
  capacity: 'capacity',
};

/** « UNAVAILABLE » حالة نشرتها الصفحة نفسها — ليست استنتاجًا. */
function dimensionState(value: any): boolean | null {
  const state = String(value?.dimensionValueState || '').toUpperCase();
  if (state === 'UNAVAILABLE') return false;
  if (state === 'AVAILABLE' || state === 'SELECTED') return true;
  return null;
}

export function readAmazonVariants(document: Document, pageHtml: string): AmazonVariantReading {
  const details: ProductVariantDetail[] = [];
  const groups: Array<{ attribute: string; label: string; values: string[] }> = [];
  const selectedAsin = collapse(
    document.querySelector('#ASIN')?.getAttribute('value')
      || document.querySelector('input[name="ASIN"]')?.getAttribute('value')
      || '',
  ) || collapse(pageHtml.match(/"currentAsin"\s*:\s*"([A-Z0-9]{10})"/)?.[1] || '');

  const labels = jsonAfterKey(pageHtml, 'variationDisplayLabels') || {};
  const allDims = jsonAfterKey(pageHtml, 'sortedDimValuesForAllDims') || {};
  const combinations = jsonAfterKey(pageHtml, 'dimensionValuesDisplayData') || {};

  const dimensionOrder: string[] = [];
  for (const name of Object.keys(allDims)) {
    if (Array.isArray(allDims[name]) && allDims[name].length) dimensionOrder.push(name);
  }

  for (const dimension of dimensionOrder) {
    const attribute = DIMENSION_ATTRIBUTE[dimension] || 'model';
    const label = String(labels[dimension] || attribute);
    const values: string[] = [];
    for (const entry of allDims[dimension] as any[]) {
      const value = collapse(entry?.dimensionValueDisplayText || entry?.dimensionValue || '');
      const available = dimensionState(entry);
      const asin = collapse(entry?.defaultAsin);
      if (!value) continue;
      values.push(value);
      details.push({
        id: asin || null,
        label: value,
        size: attribute === 'size' ? value : null,
        color: attribute === 'color' ? value : null,
        attributes: attribute === 'size' || attribute === 'color' ? null : { [attribute]: value },
        available: available !== false,
        stock: available,
        price: null,
      });
    }
    if (values.length) groups.push({ attribute, label, values });
  }

  // جدول التركيبات: كل ASIN = مجموعة قيم أبعاد + توفّرها المجمّع.
  const combinationEntries = Object.entries(combinations as Record<string, unknown>)
    .filter(([, value]) => Array.isArray(value) && (value as unknown[]).length === dimensionOrder.length);
  if (combinationEntries.length && dimensionOrder.length > 1) {
    const stateByValue = new Map<string, boolean | null>();
    for (const dimension of dimensionOrder) {
      for (const entry of (allDims[dimension] as any[]) || []) {
        const value = collapse(entry?.dimensionValueDisplayText || entry?.dimensionValue || '');
        if (value && !stateByValue.has(value)) stateByValue.set(value, dimensionState(entry));
      }
    }
    for (const [asin, values] of combinationEntries) {
      const attributes: Record<string, string> = {};
      const axes = values as string[];
      dimensionOrder.forEach((dimension, index) => {
        const attribute = DIMENSION_ATTRIBUTE[dimension] || 'model';
        if (axes[index]) attributes[attribute] = collapse(axes[index]);
      });
      const states = axes.map((value) => stateByValue.get(collapse(value)) ?? null);
      const available = states.every((state) => state !== false);
      details.push({
        id: asin || null,
        label: axes.map((value) => collapse(value)).filter(Boolean).join(' · '),
        size: attributes.size || null,
        color: attributes.color || null,
        attributes,
        available,
        stock: states.some((state) => state === true) && available ? true : available ? null : false,
        price: null,
      });
    }
  }

  return { details, groups, selectedAsin: selectedAsin || null };
}
