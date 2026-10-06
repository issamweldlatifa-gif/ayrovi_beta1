/**
 * AYWEBs / AYROVIX — INTÉGRITÉ DU PRIX (« Phase 0 », 06/10/2026).
 *
 * POURQUOI CE MODULE EXISTE
 * -------------------------
 * L'audit technique du 06/10/2026 a reproduit deux lectures de prix FAUSSES,
 * en production comme en local :
 *
 *   1. `#ppd .a-price` (mobile) : `textContent` vaut « $6.99$6.99 » (le prix
 *      hors-écran + le prix visible concaténés). L'ancien `parsePrice` retirait
 *      tout sauf `[0-9,.-]` → `6.996.99` → **6996.99** avec `priceVerified=true`.
 *      Un frère du même défaut donnait `35.1435.14` → **351435.14**.
 *   2. Amazon.de via lecteur rendu : le seul montant « lisible » de la page
 *      était `€18.74`, prix d'une **publicité** (accessoire d'un AUTRE ASIN,
 *      `B0CFQN45PF`), présenté comme `currency_verified=true`.
 *
 * RÈGLE : un texte de prix doit être UN montant unique, non dupliqué, d'une
 * seule devise. Sinon on ne propose RIEN (UNKNOWN) — jamais un chiffre inventé.
 * Le module ne lève jamais : il retourne un verdict explicable.
 */

export type PriceRejectionReason =
  /** Chaîne vide. */
  | 'EMPTY'
  /** Texte sans aucun chiffre (« Prix indisponible »). */
  | 'NO_DIGITS'
  /** Le texte est la répétition exacte d'un motif : « $6.99$6.99 », « 35.1435.14 ». */
  | 'DUPLICATED_TEXT'
  /** Le même symbole monétaire apparaît deux fois : « $6.99 $6.99 ». */
  | 'REPEATED_SYMBOL'
  /** Deux devises incompatibles dans le même texte : « €18.74 » + « USD ». */
  | 'CURRENCY_CONFLICT'
  /** Séparateurs incohérents : « 6.996.99 », « 35.1435.14 », « 1,299,00 ». */
  | 'MALFORMED_NUMBER'
  /** Plusieurs montants différents dans le même texte : « 6.99 - 7.99 ». */
  | 'MULTIPLE_AMOUNTS'
  /** Hors bornes exploitables (0 ou ≥ 1 000 000). */
  | 'OUT_OF_RANGE';

export interface PriceTextCheck {
  ok: boolean;
  /** 0 quand `ok === false`. */
  value: number;
  /** Montant normalisé (point décimal) quand `ok === true`. */
  normalized: string;
  /** Devises identifiées dans le texte (codes canoniques, sans doublon). */
  currencyHints: string[];
  reason: PriceRejectionReason | null;
}

const MAX_PRICE = 1_000_000;

/**
 * Marqueurs monétaires. `codes` liste les devises que le marqueur peut
 * désigner : deux marqueurs sont compatibles si leurs ensembles s'intersectent
 * (`$` + `CAD` = compatible ; `$` + `EUR` = conflit).
 */
const CURRENCY_MARKERS: Array<{ literal: string; pattern: RegExp; codes: string[] }> = [
  { literal: '$', pattern: /\$/g, codes: ['USD', 'CAD', 'AUD', 'SGD', 'NZD', 'HKD', 'MXN', 'BRL', 'ARS', 'CLP', 'COP'] },
  { literal: '€', pattern: /€/g, codes: ['EUR'] },
  { literal: '£', pattern: /£/g, codes: ['GBP'] },
  { literal: '¥', pattern: /[¥￥]/g, codes: ['JPY', 'CNY'] },
  { literal: '₹', pattern: /₹/g, codes: ['INR'] },
  { literal: '₺', pattern: /₺/g, codes: ['TRY'] },
  { literal: '₽', pattern: /₽/g, codes: ['RUB'] },
  { literal: '₩', pattern: /₩/g, codes: ['KRW'] },
  { literal: '₪', pattern: /₪/g, codes: ['ILS'] },
  { literal: 'د.ت', pattern: /د\.ت/g, codes: ['TND'] },
];

/** Codes ISO acceptés dans un texte de prix (jamais devinés, seulement lus). */
const ISO_CODES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'RMB', 'TND', 'DT', 'CAD', 'AUD', 'SGD', 'NZD', 'HKD',
  'MXN', 'BRL', 'ARS', 'CLP', 'COP', 'INR', 'TRY', 'RUB', 'KRW', 'ILS', 'CHF', 'SEK', 'NOK',
  'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'ZAR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR',
  'JOD', 'EGP', 'MAD', 'DZD', 'LYD', 'TWD', 'THB', 'MYR', 'IDR', 'PHP', 'VND', 'NGN', 'KES',
]);

const ISO_PATTERN = new RegExp(`\\b(${[...ISO_CODES].join('|')})\\b`, 'g');

/** Même symbole deux fois : signature d'une concaténation hors-écran + visible. */
function repeatedSymbol(text: string): boolean {
  for (const marker of CURRENCY_MARKERS) {
    const hits = text.match(new RegExp(marker.pattern.source, 'g'));
    if (hits && hits.length >= 2) return true;
  }
  return false;
}

/** Répétition exacte d'un motif d'au moins 4 caractères : « $6.99$6.99 ». */
function duplicatedText(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 8 || compact.length % 2 !== 0) return false;
  const half = compact.length / 2;
  if (half < 4) return false;
  return compact.slice(0, half) === compact.slice(half);
}

/**
 * Séparateurs décimaux/ milliers. Refuse ce qu'aucune locale n'écrit :
 *   « 6.996.99 » (mille + décimale avec le MÊME caractère),
 *   « 35.1435.14 » (séparateur suivi de 4 chiffres).
 */
function malformedSeparators(token: string): boolean {
  const separators = [...token.matchAll(/[.,](\d+)/g)].map((match) => ({
    char: match[0][0],
    digits: match[1].length,
  }));
  if (separators.length < 2) return false;
  if (separators.some((separator) => separator.digits >= 4)) return true;
  const chars = new Set(separators.map((separator) => separator.char));
  if (chars.size === 1) {
    const hasThousands = separators.some((separator) => separator.digits === 3);
    const hasDecimal = separators.some((separator) => separator.digits === 1 || separator.digits === 2);
    if (hasThousands && hasDecimal) return true;
  }
  return false;
}

/** Devises lisibles dans le texte, avec leurs ensembles compatibles. */
function currencySets(raw: string): Array<{ literal: string; codes: string[] }> {
  const found: Array<{ literal: string; codes: string[] }> = [];
  for (const marker of CURRENCY_MARKERS) {
    if (new RegExp(marker.pattern.source).test(raw)) found.push({ literal: marker.literal, codes: marker.codes });
  }
  for (const match of raw.matchAll(ISO_PATTERN)) {
    const code = match[1] === 'RMB' ? 'CNY' : match[1] === 'DT' ? 'TND' : match[1];
    found.push({ literal: match[1], codes: [code] });
  }
  return found;
}

function currenciesConflict(sets: Array<{ literal: string; codes: string[] }>): boolean {
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      if (sets[i].literal === sets[j].literal) continue;
      if (!sets[i].codes.some((code) => sets[j].codes.includes(code))) return true;
    }
  }
  return false;
}

function normalizeToken(token: string): number {
  const comma = token.lastIndexOf(',');
  const dot = token.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimalMark = comma > dot ? ',' : '.';
    const thousandsMark = decimalMark === ',' ? /\./g : /,/g;
    const normalized = token.replace(thousandsMark, '').replace(decimalMark, '.');
    return Number.parseFloat(normalized);
  }
  const mark = comma >= 0 ? ',' : dot >= 0 ? '.' : '';
  if (!mark) return Number.parseFloat(token);
  const parts = token.split(mark);
  const decimalDigits = parts[parts.length - 1].length;
  const normalized = decimalDigits === 3 && parts.length <= 2
    ? parts.join('')
    : `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}`;
  return Number.parseFloat(normalized);
}

/**
 * Verdict complet sur un texte de prix. C'est LA porte d'entrée unique :
 * tout prix lu dans une page marchande doit passer ici avant d'être publié.
 */
export function checkPriceText(raw: unknown): PriceTextCheck {
  const reject = (reason: PriceRejectionReason, currencyHints: string[] = []): PriceTextCheck => ({
    ok: false, value: 0, normalized: '', currencyHints, reason,
  });

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0 || raw >= MAX_PRICE) return reject('OUT_OF_RANGE');
    return { ok: true, value: raw, normalized: String(raw), currencyHints: [], reason: null };
  }

  const text = String(raw ?? '').replace(/[\u00a0\u202f]/g, ' ').trim();
  if (!text) return reject('EMPTY');
  if (!/\d/.test(text)) return reject('NO_DIGITS');

  const sets = currencySets(text);
  const hints = [...new Set(sets.flatMap((set) => set.codes))];

  if (duplicatedText(text)) return reject('DUPLICATED_TEXT', hints);
  if (repeatedSymbol(text)) return reject('REPEATED_SYMBOL', hints);
  if (currenciesConflict(sets)) return reject('CURRENCY_CONFLICT', hints);

  // Espaces de milliers (« 1 299,00 ») absorbés AVANT le découpage en montants.
  const spaced = text.replace(/(\d) (\d{3})(?![\d])/g, '$1$2');
  const amounts = spaced.match(/\d+(?:[.,]\d+)*/g) || [];
  if (!amounts.length) return reject('NO_DIGITS', hints);
  if (amounts.length > 1) return reject('MULTIPLE_AMOUNTS', hints);

  const token = amounts[0];
  if (malformedSeparators(token)) return reject('MALFORMED_NUMBER', hints);

  const value = normalizeToken(token);
  if (!Number.isFinite(value) || value <= 0 || value >= MAX_PRICE) return reject('OUT_OF_RANGE', hints);

  return { ok: true, value: Math.round(value * 100) / 100, normalized: token, currencyHints: hints, reason: null };
}

/** Prix exploitable, ou 0 — même contrat que l'ancien `parsePrice`, en sûr. */
export function priceFromText(raw: unknown): number {
  return checkPriceText(raw).value;
}

/** Raison du rejet, pour la télémétrie et le support (jamais pour l'utilisateur). */
export function priceRejectionOf(raw: unknown): PriceRejectionReason | null {
  return checkPriceText(raw).reason;
}
