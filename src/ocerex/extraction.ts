import sharp from 'sharp';
import { ocrRecognizeDetailed } from '../services/vision';

export type OcerexScreenType = 'PRODUCT' | 'CART' | 'UNKNOWN';
export type OcerexPriceContext = 'REFERENCE' | 'CART_REFERENCE_TOTAL' | null;
export interface OcerexExtraction {
  type: OcerexScreenType;
  referencePrice: number | null;
  currency: string | null;
  confidence: number;
  source: 'OCR';
  priceContext: OcerexPriceContext;
  productName: string | null;
  textBoxes: Array<{ text: string; confidence: number; x: number; y: number; width: number; height: number }>;
  errorCode?: 'NO_PRICE_FOUND' | 'LOW_CONFIDENCE' | 'NO_REFERENCE_PRICE' | 'UNSUPPORTED_SCREEN';
}

const CART_MARKERS = /\b(cart|basket|checkout|subtotal|sub\s*total|total|items?\s*\(?\d|panier|commande|récapitulatif|recapitulatif|المجموع|السلة|الدفع)\b/i;
const REFERENCE_MARKERS = /\b(original|regular|list|was|before|old\s*price|prix\s*(?:initial|original|avant)|ancien\s*prix|reference\s*price|السعر\s*(?:الأصلي|قبل)|السعر المرجعي)\b/i;
const CART_REFERENCE_MARKERS = /\b(original|before|regular|reference|prix\s*(?:initial|original|avant)|total\s*(?:before|original)|ancien\s*total|السعر الأصلي|المجموع الأصلي)\b/i;
const PRICE_RE = /(?:USD|EUR|GBP|CNY|JPY|TND|CAD|CHF|\$|€|£|¥|￥|د\.ت|DT)\s*([0-9]{1,7}(?:[.,][0-9]{1,3})?)|([0-9]{1,7}(?:[.,][0-9]{1,3})?)\s*(USD|EUR|GBP|CNY|JPY|TND|CAD|CHF|\$|€|£|¥|￥|د\.ت|DT)/gi;
const currencies: Record<string, string> = { '$': 'USD', USD: 'USD', '€': 'EUR', EUR: 'EUR', '£': 'GBP', GBP: 'GBP', '¥': 'JPY', '￥': 'JPY', JPY: 'JPY', CNY: 'CNY', TND: 'TND', DT: 'TND', 'د.ت': 'TND', CAD: 'CAD', CHF: 'CHF' };

function parsePrice(line: string): Array<{ value: number; currency: string | null; index: number; raw: string }> {
  const prices: Array<{ value: number; currency: string | null; index: number; raw: string }> = [];
  PRICE_RE.lastIndex = 0;
  for (const match of line.matchAll(PRICE_RE)) {
    const token = match[0];
    const amount = match[1] || match[2];
    if (!amount) continue;
    const numeric = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    const symbol = token.match(/USD|EUR|GBP|CNY|JPY|TND|CAD|CHF|\$|€|£|¥|￥|د\.ت|DT/i)?.[0] || '';
    const currency = /[¥￥]/.test(symbol)
      ? (/\b(?:CNY|RMB|yuan)\b/i.test(line) ? 'CNY' : /\b(?:JPY|YEN|yen)\b/i.test(line) ? 'JPY' : null)
      : (currencies[symbol.toUpperCase()] || currencies[symbol] || null);
    prices.push({ value: numeric, currency, index: match.index ?? 0, raw: token });
  }
  return prices;
}

function boxesForLine(line: string, words: OcerexExtraction['textBoxes']) {
  const target = line.toLowerCase();
  const related = words.filter((word) => target.includes(word.text.toLowerCase()));
  if (!related.length) return [];
  const left = Math.min(...related.map((word) => word.x));
  const top = Math.min(...related.map((word) => word.y));
  const right = Math.max(...related.map((word) => word.x + word.width));
  const bottom = Math.max(...related.map((word) => word.y + word.height));
  return [{ text: line.slice(0, 160), confidence: related.reduce((sum, word) => sum + word.confidence, 0) / related.length, x: left, y: top, width: right - left, height: bottom - top }];
}

/** Conservative price semantics: only explicit original/reference language qualifies. */
export function resolveOcerexText(text: string, words: OcerexExtraction['textBoxes'] = [], struckThroughLines: string[] = [], struckThroughAmounts: string[] = []): OcerexExtraction {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const isCart = CART_MARKERS.test(text) || /\b(item\s*\(?s?\)?|proceed to|place order|your bag)\b/i.test(text);
  const type: OcerexScreenType = isCart ? 'CART' : (lines.length >= 2 && parsePrice(text).length ? 'PRODUCT' : 'UNKNOWN');
  const struck = (line: string) => struckThroughLines.some((candidate) => candidate.trim().toLowerCase() === line.trim().toLowerCase());
  const isReferenceLine = (line: string) => type === 'CART'
    ? (CART_REFERENCE_MARKERS.test(line) && /\b(total|subtotal|basket|cart|panier|commande|المجموع)\b/i.test(line))
      || (struck(line) && /\b(total|subtotal|basket|cart|panier|commande|المجموع)\b/i.test(line))
    : REFERENCE_MARKERS.test(line) || struck(line);
  const candidates = lines.flatMap((line) => {
    if (!isReferenceLine(line)) return [];
    const linePrices = parsePrice(line);
    const saleMarker = line.search(/\b(now|sale|current|discounted|after|prix actuel|prix soldé)\b/i);
    let eligible = saleMarker >= 0 ? linePrices.filter((price) => price.index < saleMarker) : linePrices;
    if (struck(line) && linePrices.length > 1) {
      const struckValues = struckThroughAmounts.flatMap((raw) => {
        const amount = raw.match(/[0-9]{1,7}(?:[.,][0-9]{1,3})?/);
        if (!amount) return [];
        const value = Number(amount[0].replace(',', '.'));
        return Number.isFinite(value) ? [value] : [];
      });
      if (struckValues.length) eligible = eligible.filter((price) => struckValues.includes(price.value));
    }
    return eligible.map((price) => ({ ...price, line, confidence: boxesForLine(line, words)[0]?.confidence ?? 0 }));
  }).filter((candidate) => candidate.currency);
  // For a product, if several explicitly marked originals are visible, use the highest.
  // A cart requires a clearly labelled cart-level original total; product prices are never summed.
  const selected = candidates.sort((a, b) => b.value - a.value)[0];
  const boxRows = selected ? boxesForLine(selected.line, words) : [];
  const ocrConfidence = boxRows[0]?.confidence ?? (words.length ? words.reduce((sum, word) => sum + word.confidence, 0) / words.length : 0);
  const confidence = selected ? Math.min(0.99, ocrConfidence * 0.65 + 0.35) : Math.min(0.49, ocrConfidence * 0.5);
  const errorCode = type === 'UNKNOWN' ? 'UNSUPPORTED_SCREEN'
    : !parsePrice(text).length ? 'NO_PRICE_FOUND'
      : !selected ? 'NO_REFERENCE_PRICE'
        : confidence < 0.72 ? 'LOW_CONFIDENCE' : undefined;
  const titleLine = lines.find((line) => /[a-z]{3,}/i.test(line) && !parsePrice(line).length && !/cart|basket|checkout|subtotal|total|shipping|delivery/i.test(line));
  return {
    type,
    referencePrice: errorCode ? null : selected!.value,
    currency: errorCode ? null : selected!.currency,
    confidence,
    source: 'OCR',
    priceContext: errorCode ? null : (type === 'CART' ? 'CART_REFERENCE_TOTAL' : 'REFERENCE'),
    productName: type === 'CART' ? null : (titleLine?.slice(0, 120) || null),
    textBoxes: words.slice(0, 250),
    ...(errorCode ? { errorCode } : {}),
  };
}

async function detectStruckPriceLines(image: Buffer, text: string, words: OcerexExtraction['textBoxes']): Promise<{ lines: string[]; amounts: string[] }> {
  try {
    const { data, info } = await sharp(image, { failOn: 'warning', limitInputPixels: 25_000_000 }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const output = new Set<string>();
    const amounts = new Set<string>();
    for (const word of words) {
      if (!/(?:\d[.,]?\d|[$€£¥￥]|USD|EUR|GBP|CNY|JPY|TND|CAD|CHF)/i.test(word.text)) continue;
      const left = Math.max(0, Math.floor(word.x));
      const right = Math.min(info.width, Math.ceil(word.x + word.width));
      const top = Math.max(0, Math.floor(word.y + word.height * 0.35));
      const bottom = Math.min(info.height, Math.ceil(word.y + word.height * 0.65));
      const width = right - left;
      if (width < 12 || bottom <= top) continue;
      let crossed = false;
      for (let y = top; y < bottom && !crossed; y += 1) {
        let run = 0;
        let longest = 0;
        for (let x = left; x < right; x += 1) {
          if (data[y * info.width + x] < 105) { run += 1; longest = Math.max(longest, run); }
          else run = 0;
        }
        if (longest >= Math.max(12, width * 0.62)) crossed = true;
      }
      if (crossed) {
        const line = text.split(/\r?\n/).find((candidate) => candidate.toLowerCase().includes(word.text.toLowerCase()));
        if (line) { output.add(line.trim()); amounts.add(word.text); }
      }
    }
    return { lines: [...output], amounts: [...amounts] };
  } catch { return { lines: [], amounts: [] }; }
}

export async function extractOcerexPrice(image: Buffer): Promise<OcerexExtraction> {
  const recognized = await ocrRecognizeDetailed(image);
  const struck = await detectStruckPriceLines(image, recognized.text, recognized.words);
  return resolveOcerexText(recognized.text, recognized.words, struck.lines, struck.amounts);
}
