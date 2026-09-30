/**
 * OCEREX reference-price selection.
 *
 * The commercial basis is a reference/original price actually visible in the
 * screenshot. Discounted, coupon, shipping, tax and payable totals are never
 * the basis. A missing reference is left null — it is never invented, reversed
 * from a percentage, summed, or replaced by the largest number on the screen.
 */
import type {
  OcerexCode,
  OcerexConfidenceLevel,
  OcerexCurrencyStatus,
  OcerexDecision,
  OcerexOcrToken,
  OcerexPriceContext,
  OcerexPriceFinding,
  OcerexScreenType,
  OcerexSemanticType,
} from './types';

const AMOUNT = String.raw`(?:\d{1,3}(?:[.,]\d{3})+|\d{1,6})(?:[.,]\d{1,2})?`;
const CURRENCY = String.raw`(?:US\$|CA\$|C\$|A\$|\$|€|£|¥|元|\bEUR\b|\bUSD\b|\bGBP\b|\bJPY\b|\bYEN\b|\bCNY\b|\bRMB\b|\bCAD\b|\bTND\b|\bDT\b)`;
const pricePrefix = () => new RegExp(String.raw`(${CURRENCY})\s?(${AMOUNT})`, 'gi');
const priceSuffix = () => new RegExp(String.raw`(${AMOUNT})\s?(${CURRENCY})`, 'gi');
const labeledAmount = () => new RegExp(String.raw`(?:\bwas\b|avant|ancien|original|list\s+price|prix\s+initial|prix\s+de\s+r[eé]f[eé]rence|sub\s*-?\s*total|sous\s*-?\s*total|\btotal\b|المجموع)\s*[:：]?\s*(${AMOUNT})`, 'gi');
const currencyToken = () => new RegExp(CURRENCY, 'i');

const SHIPPING_RE = /ship(?:ping)?|livraison|delivery|frais\s+de\s+port|free\s+shipping|شحن/i;
const TAX_RE = /\b(?:tax|vat|tva|gst|duty)\b|ضريبة/i;
const COUPON_RE = /coupon|voucher|code\s+promo|promo\s+code|كوبون/i;
const TOTAL_RE = /grand\s+total|order\s+total|cart\s+total|basket\s+total|montant\s+total|total\s+panier|sub\s*-?\s*total|sous\s*-?\s*total|items?\s+total|articles?\s+total|(?:^|\s)total(?:\s|$)|المجموع|الإجمالي/i;
const SUBTOTAL_RE = /sub\s*-?\s*total|sous\s*-?\s*total/i;
const ORIGINAL_RE = /\bwas\b|avant|ancien|old\s+price|prix\s+initial|list\s+price|price\s+was|au\s+lieu\s+de|barr[eé]|original|msrp|\brrp\b|prix\s+de\s+r[eé]f[eé]rence|regular\s+price/i;
const SALE_RE = /\bnow\b|\bsale\b|promo|solde|remise|current\s+price|après\s+r[eé]duction|you\s+pay|to\s+pay|amount\s+due|payable|à\s+payer/i;
const ADD_TO_CART_RE = /add\s+to\s+(?:cart|bag|basket)|ajouter\s+au\s+panier|أضف\s+إلى\s+السلة/gi;
const CART_WORD_RE = /\b(?:cart|basket|panier|checkout)\b|السلة|إتمام\s+الشراء/i;
const ITEM_COUNT_RE = /\b\d+\s+(?:items?|articles?|produits?)\b/i;
const PRICE_WORD_RE = /\b(?:price|prix)\b|السعر/i;

interface Line {
  text: string;
  tokens: OcerexOcrToken[];
  y: number;
  height: number;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseOcerexAmount(raw: string): number {
  const text = raw.trim();
  let normalized = text;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text)) normalized = text.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text)) normalized = text.replace(/,/g, '');
  else normalized = text.replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 && value < 1_000_000 ? roundMoney(value) : NaN;
}

function currencyOf(symbol: string, window: string): { currency: string | null; explicit: boolean; ambiguous: boolean } {
  const token = symbol.toUpperCase();
  if (/CA\$|C\$|\bCAD\b/.test(token)) return { currency: 'CAD', explicit: true, ambiguous: false };
  if (/A\$/.test(token)) return { currency: 'AUD', explicit: true, ambiguous: false };
  if (/US\$|\bUSD\b/.test(token)) return { currency: 'USD', explicit: true, ambiguous: false };
  if (token === '$') return { currency: 'USD', explicit: true, ambiguous: false };
  if (token === '€' || token === 'EUR') return { currency: 'EUR', explicit: true, ambiguous: false };
  if (token === '£' || token === 'GBP') return { currency: 'GBP', explicit: true, ambiguous: false };
  if (token === 'DT' || token === 'TND') return { currency: 'TND', explicit: true, ambiguous: false };
  if (token === '元' || token === 'CNY' || token === 'RMB') return { currency: 'CNY', explicit: true, ambiguous: false };
  if (token === 'JPY' || token === 'YEN') return { currency: 'JPY', explicit: true, ambiguous: false };
  if (token === '¥') {
    if (/CNY|RMB|元/.test(window)) return { currency: 'CNY', explicit: true, ambiguous: false };
    if (/JPY|YEN|円/.test(window)) return { currency: 'JPY', explicit: true, ambiguous: false };
    return { currency: null, explicit: false, ambiguous: true };
  }
  return { currency: null, explicit: false, ambiguous: false };
}

function groupLines(tokens: OcerexOcrToken[]): Line[] {
  const sorted = [...tokens].filter((token) => token.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Line[] = [];
  for (const token of sorted) {
    const center = token.y + token.height / 2;
    const current = lines[lines.length - 1];
    const currentCenter = current ? current.y + current.height / 2 : 0;
    const tolerance = Math.max(10, ((current?.height || token.height) + token.height) * 0.35);
    if (!current || Math.abs(center - currentCenter) > tolerance) {
      lines.push({ text: token.text.trim(), tokens: [token], y: token.y, height: token.height || 12 });
    } else {
      current.tokens.push(token);
      current.tokens.sort((a, b) => a.x - b.x);
      current.text = current.tokens.map((item) => item.text.trim()).filter(Boolean).join(' ');
      current.y = Math.min(current.y, token.y);
      current.height = Math.max(current.height, token.y + token.height - current.y);
    }
  }
  return lines;
}

function textualStrike(window: string, amount: string): boolean {
  const escaped = amount.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(String.raw`(?:\/|~|̶)+\s*${escaped}|${escaped}\s*(?:\/|~)`).test(window) || window.includes('\u0336');
}

function lineContext(lines: Line[], index: number): string {
  return [lines[index - 1], lines[index], lines[index + 1]]
    .filter((line) => line && (!lines[index] || Math.abs(line.y - lines[index].y) < 72))
    .map((line) => line!.text)
    .join(' ');
}

function nearbyTotal(lines: Line[], index: number): boolean {
  const line = lines[index];
  if (TOTAL_RE.test(line.text)) return true;
  const previous = lines[index - 1];
  if (!previous) return false;
  const gap = line.y - (previous.y + previous.height);
  return gap >= -8 && gap < 28 && TOTAL_RE.test(previous.text);
}

function classify(input: {
  line: string;
  context: string;
  struck: boolean;
  labeledOriginal: boolean;
  totalish: boolean;
}): OcerexSemanticType {
  const line = input.line;
  if (SHIPPING_RE.test(line)) return 'SHIPPING';
  if (TAX_RE.test(line)) return 'TAX';
  if (COUPON_RE.test(line) && !input.struck && !input.labeledOriginal) return 'COUPON';
  if (input.struck || input.labeledOriginal) {
    return input.totalish ? 'CART_REFERENCE_TOTAL' : 'REFERENCE_PRICE';
  }
  if (input.totalish) return 'CURRENT_TOTAL';
  if (SALE_RE.test(line) || SALE_RE.test(input.context)) return 'DISCOUNTED_PRICE';
  return 'UNKNOWN';
}

function pushFinding(findings: OcerexPriceFinding[], finding: OcerexPriceFinding) {
  const duplicate = findings.some((item) =>
    item.value === finding.value
    && item.currency === finding.currency
    && Math.abs(item.x - finding.x) < 8
    && Math.abs(item.y - finding.y) < 8
    && item.semanticType === finding.semanticType);
  if (!duplicate) findings.push(finding);
}

function findingsFromLines(lines: Line[]): OcerexPriceFinding[] {
  const findings: OcerexPriceFinding[] = [];
  lines.forEach((line, index) => {
    const context = lineContext(lines, index);
    const seenSpans: Array<[number, number]> = [];
    const consume = (start: number, end: number) => {
      if (seenSpans.some(([from, to]) => start < to && end > from)) return false;
      seenSpans.push([start, end]);
      return true;
    };
    const consider = (rawAmount: string, rawCurrency: string | null, indexInLine: number, length: number) => {
      if (!consume(indexInLine, indexInLine + length)) return;
      const before = line.text[indexInLine - 1];
      if (before === '-' || before === '−' || before === '%') return;
      const after = line.text.slice(indexInLine + length, indexInLine + length + 2);
      if (/^\s*%/.test(after)) return;
      const value = parseOcerexAmount(rawAmount);
      if (Number.isNaN(value)) return;
      const window = line.text.slice(Math.max(0, indexInLine - 4), indexInLine + length + 4);
      const detected = rawCurrency ? currencyOf(rawCurrency, `${line.text} ${context}`) : { currency: null, explicit: false, ambiguous: false };
      const token = line.tokens.find((item) => item.text.includes(rawAmount.replace(/\s/g, '')) || item.text.includes(rawAmount)) || line.tokens[0];
      const struck = Boolean(token?.struck) || textualStrike(window, rawAmount);
      const labeledOriginal = ORIGINAL_RE.test(line.text) || ORIGINAL_RE.test(context) || textualStrike(window, rawAmount);
      const semanticType = classify({ line: line.text, context, struck, labeledOriginal, totalish: nearbyTotal(lines, index) });
      pushFinding(findings, {
        text: rawAmount,
        value,
        currency: detected.ambiguous ? null : detected.currency,
        explicitCurrency: detected.ambiguous ? false : detected.explicit,
        x: token?.x ?? 0,
        y: token?.y ?? line.y,
        width: token?.width ?? 0,
        height: token?.height ?? line.height,
        confidence: token?.confidence ?? 0.5,
        struck,
        labeledOriginal,
        semanticType,
        snippet: line.text.slice(0, 80),
      });
    };

    for (const [re, prefix] of [[pricePrefix(), true], [priceSuffix(), false]] as Array<[RegExp, boolean]>) {
      let match: RegExpExecArray | null;
      while ((match = re.exec(line.text)) !== null) {
        consider(prefix ? match[2] : match[1], prefix ? match[1] : match[2], match.index, match[0].length);
      }
    }
    const labeledRe = labeledAmount();
    let labeled: RegExpExecArray | null;
    while ((labeled = labeledRe.exec(line.text)) !== null) {
      const currencyOnLine = line.text.match(currencyToken());
      consider(labeled[1], currencyOnLine?.[0] || null, labeled.index, labeled[0].length);
    }
  });
  return findings;
}

function screenType(lines: Line[], findings: OcerexPriceFinding[]): OcerexScreenType {
  const text = lines.map((line) => line.text).join('\n').replace(ADD_TO_CART_RE, ' ');
  let score = 0;
  if (CART_WORD_RE.test(text)) score += 2;
  if (ITEM_COUNT_RE.test(text)) score += 2;
  if (lines.some((line) => TOTAL_RE.test(line.text) && line.text.length <= 80)) score += 2;
  if (findings.some((item) => item.semanticType === 'CART_REFERENCE_TOTAL' || item.semanticType === 'CURRENT_TOTAL')) score += 2;
  const priced = findings
    .filter((item) => item.semanticType === 'REFERENCE_PRICE' || item.semanticType === 'DISCOUNTED_PRICE' || item.semanticType === 'UNKNOWN')
    .map((item) => item.y)
    .sort((a, b) => a - b);
  let productClusters = priced.length ? 1 : 0;
  for (let index = 1; index < priced.length; index += 1) {
    if (priced[index] - priced[index - 1] > 100) productClusters += 1;
  }
  if (productClusters >= 2 && score >= 2) score += 1;
  if (score >= 2) return 'CART';
  if (findings.length && score === 0 && productClusters <= 1) return 'PRODUCT';
  if (findings.length === 1 && score < 2) return 'PRODUCT';
  return 'UNKNOWN';
}

function looksLikePriceLine(text: string): boolean {
  return pricePrefix().test(text) || priceSuffix().test(text);
}

function safeTitle(lines: Line[], anchorY: number): string | null {
  const candidates = lines
    .filter((line) => line.y <= anchorY + 8 && line.text.length >= 3 && line.text.length <= 80)
    .filter((line) => !looksLikePriceLine(line.text))
    .filter((line) => !TOTAL_RE.test(line.text) && !SHIPPING_RE.test(line.text) && !SALE_RE.test(line.text) && !ORIGINAL_RE.test(line.text))
    .filter((line) => !/@|\b\d{8,}\b/.test(line.text));
  const best = candidates.sort((a, b) => b.y - a.y || b.text.length - a.text.length)[0];
  return best ? best.text.replace(/\s+/g, ' ').trim().slice(0, 80) : null;
}

function level(score: number): OcerexConfidenceLevel {
  if (score >= 0.8) return 'HIGH';
  if (score >= 0.55) return 'MEDIUM';
  return 'LOW';
}

function currencyStatusFor(currency: string | null, ambiguous: boolean, supported: (code: string) => boolean): OcerexCurrencyStatus {
  if (ambiguous) return 'AMBIGUOUS';
  if (!currency) return 'MISSING';
  return supported(currency) ? 'DETECTED' : 'UNSUPPORTED';
}

export function resolveOcerexPrices(
  tokens: OcerexOcrToken[],
  options: { currencySupported?: (code: string) => boolean } = {},
): OcerexDecision {
  const supported = options.currencySupported ?? (() => true);
  const lines = groupLines(tokens);
  const findings = findingsFromLines(lines);
  const type = findings.length ? screenType(lines, findings) : 'UNKNOWN';
  const empty = (code: OcerexCode, confidence = 0): OcerexDecision => ({
    type: findings.length ? type : 'UNKNOWN',
    referencePrice: null,
    currency: null,
    currencyStatus: 'MISSING',
    confidence,
    confidenceLevel: level(confidence),
    priceContext: null,
    source: 'OCR',
    productTitle: null,
    code,
    findings,
  });

  if (!findings.length && !lines.some((line) => PRICE_WORD_RE.test(line.text) || /\d/.test(line.text))) return empty('NO_PRICE_FOUND');
  if (!findings.length) return empty('NO_PRICE_FOUND', 0.2);
  if (type === 'UNKNOWN') return empty('UNSUPPORTED_SCREEN', 0.3);

  const pool = type === 'CART'
    ? findings.filter((item) => item.semanticType === 'CART_REFERENCE_TOTAL')
    : findings.filter((item) => item.semanticType === 'REFERENCE_PRICE');
  if (!pool.length) return { ...empty('NO_REFERENCE_PRICE', 0.4), type };

  const currencies = new Set(pool.map((item) => item.currency).filter(Boolean));
  if (currencies.size > 1) return { ...empty('NO_REFERENCE_PRICE', 0.35), type, currencyStatus: 'AMBIGUOUS' };

  const chosen = [...pool].sort((a, b) => {
    if (type === 'CART') {
      const aSub = SUBTOTAL_RE.test(a.snippet) ? 1 : 0;
      const bSub = SUBTOTAL_RE.test(b.snippet) ? 1 : 0;
      if (aSub !== bSub) return aSub - bSub;
    }
    return b.value - a.value || b.confidence - a.confidence;
  })[0];

  const ambiguousYen = tokens.some((token) => token.text.includes('¥')) && !chosen.currency && pool.every((item) => !item.currency);
  const currencyStatus = currencyStatusFor(chosen.currency, ambiguousYen && !chosen.currency, supported);
  const evidence = chosen.struck || chosen.labeledOriginal;
  let score = evidence ? 0.5 : 0.2;
  if (chosen.struck && chosen.labeledOriginal) score += 0.12;
  score += 0.1;
  if (currencyStatus === 'DETECTED') score += 0.15;
  else score = Math.min(score, 0.74);
  if (chosen.confidence >= 0.8) score += 0.12;
  else if (chosen.confidence >= 0.6) score += 0.06;
  else score -= 0.18;
  if (chosen.confidence < 0.45) score = Math.min(score, 0.4);
  if (!evidence) score = Math.min(score, 0.4);
  score = Math.max(0, Math.min(0.97, Math.round(score * 100) / 100));
  const confidenceLevel = level(score);
  const priceContext: OcerexPriceContext = type === 'CART' ? 'CART_REFERENCE_TOTAL' : 'REFERENCE';
  if (confidenceLevel === 'LOW') {
    return {
      ...empty('LOW_CONFIDENCE', score),
      type,
      currency: chosen.currency,
      currencyStatus,
      productTitle: safeTitle(lines, chosen.y),
    };
  }
  return {
    type,
    referencePrice: chosen.value,
    currency: chosen.currency,
    currencyStatus,
    confidence: score,
    confidenceLevel,
    priceContext,
    source: 'OCR',
    productTitle: safeTitle(lines, chosen.y),
    code: 'OK',
    findings,
  };
}
