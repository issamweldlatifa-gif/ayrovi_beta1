/**
 * OCR price understanding — deuxième opinion de la Lens pipeline.
 * Analyse le texte OCR brut, classe chaque montant selon son CONTEXTE
 * (produit / ancien prix / promo / livraison / total) et produit un rapport
 * avec confiance. Aucune invention : uniquement ce qui est lisible.
 */

export type PriceRole = 'sale' | 'original' | 'shipping' | 'total' | 'other';

export interface PriceFinding {
  role: PriceRole;
  value: number;
  currency: string | null;
  confidence: number;
  snippet: string;
}

export interface OcrPriceReport {
  findings: PriceFinding[];
  salePrice: number | null;
  originalPrice: number | null;
  shippingPrice: number | null;
  totalPrice: number | null;
  discountPercent: number | null;
  currency: string | null;
  confidence: number;
  text: string;
}

const CURRENCY_SYMBOLS: Array<[RegExp, string]> = [
  [/€|EUR|EURO?S?/i, 'EUR'],
  [/US\$|USD|\$/i, 'USD'],
  [/£|GBP/i, 'GBP'],
  [/¥|YEN|JPY|円/i, 'JPY'],
  [/DT\b|TND|د\.ت|DINARS?/i, 'TND'],
  [/CA\$|CAD/i, 'CAD'],
];

const SHIPPING_RE = /ship(ping)?|livraison|delivery|frais\s+de\s+port|port\s+offert|free\s+shipping/i;
const TOTAL_RE = /grand\s+total|total\s+item\s+amount|total\s*\(?\s*(TTC|incl)|^total|montant\s+total|order\s+total|somme\s+totale/i;
const SUBTOTAL_RE = /sub\s*-?total|sous\s*-?total|total\s+partiel/i;
const ORIGINAL_RE = /\bwas\b|avant|ancien|old\s+price|prix\s+initial|list\s+price|price\s+was|au\s+lieu\s+de|barré/i;
const SALE_RE = /\bnow\b|sale|promo|solde|remise|actuel|current\s+price|only|après\s+réduction|-\s?\d{1,2}\s?%/i;
const DISCOUNT_RE = /-?\s?(\d{1,2}(?:[.,]\d)?)\s?%|(\d{1,2})\s?%\s*(off|de\s+réduction|reduc)/i;

function parseNumber(raw: string): number {
  const cleaned = raw.replace(/,/g, '.').replace(/\.(?=\d{3})/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 && value < 1_000_000 ? Math.round(value * 100) / 100 : NaN;
}

function detectCurrency(window: string): { currency: string | null; explicit: boolean } {
  for (const [re, code] of CURRENCY_SYMBOLS) {
    if (re.test(window)) return { currency: code, explicit: true };
  }
  return { currency: null, explicit: false };
}

interface RawPrice { value: number; currency: string | null; explicit: boolean; line: string; index: number; }

/** Extrait tous les montants plausibles du texte OCR avec leur ligne de contexte. */
export function extractPriceCandidates(text: string): RawPrice[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const out: RawPrice[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const patterns = [
      /(?<![0-9])([0-9]{1,5}(?:[.,][0-9]{1,2})?)\s*(€|US\$|\$|£|¥|\bEUR\b|\bUSD\b|\bGBP\b|\bJPY\b|\bYEN\b|\bDT\b|\bTND\b|\bCAD\b)/gi,
      /(€|US\$|\$|£|¥)\s?(?<![0-9])([0-9]{1,5}(?:[.,][0-9]{1,2})?)(?![0-9])/gi,
    ];
    for (const re of patterns) {
      let match: RegExpExecArray | null;
      while ((match = re.exec(line)) !== null) {
        const isPrefix = /^[€$£¥]/.test(match[0]);
        const value = parseNumber(isPrefix ? match[2] : match[1]);
        if (Number.isNaN(value)) continue;
        const before = line[match.index - 1];
        if (before === '-' || before === '−') continue; // montant négatif/remise, pas un prix
        const { currency, explicit } = detectCurrency(match[0]);
        const key = `${value}|${currency}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ value, currency, explicit, line, index: line.indexOf(match[0]) });
      }
    }
  }
  return out;
}

/** Classe un montant selon le contexte de sa ligne + le document entier. */
export function classifyFinding(candidate: RawPrice, text: string): PriceFinding {
  const line = candidate.line;
  let role: PriceRole = 'other';
  if (SHIPPING_RE.test(line)) role = 'shipping';
  else if (!SUBTOTAL_RE.test(line) && TOTAL_RE.test(line)) role = 'total';
  else if (ORIGINAL_RE.test(line)) role = 'original';
  else if (SALE_RE.test(line) || /product|article|prix|price/i.test(line) || candidate.explicit) {
    // Un montant avec devise explicite sans contexte contraire est le prix courant.
    role = 'sale';
  }
  const base = candidate.explicit ? 0.85 : 0.6;
  const confidence = Math.min(0.97, role === 'other' ? base - 0.12 : base);
  return { role, value: candidate.value, currency: candidate.currency, confidence, snippet: line.slice(0, 120) };
}

/** Rapport complet : rôles, devise majoritaire, remise, et prix retenus. */
export function analyzeOcrText(text: string): OcrPriceReport {
  const clean = String(text || '');
  const candidates = extractPriceCandidates(clean);
  const findings = candidates.map((candidate) => classifyFinding(candidate, clean));

  const discountMatch = clean.split(/\r?\n/).map((line) => line.trim())
    .find((line) => /(\d{1,2}(?:[.,]\d)?)\s?%/.test(line) && /(^|[\s(])[-−]\s?\d{1,2}(?:[.,]\d)?\s?%|\b(off|réduction|remise|promo|sale|solde|rabais)\b/i.test(line));
  const discountPercent = discountMatch
    ? Math.min(95, Number((discountMatch.match(/(\d{1,2}(?:[.,]\d)?)\s?%/) || [])[1]?.replace(',', '.') || NaN))
    : null;

  // Devise majoritaire explicite.
  const currencyVotes = new Map<string, number>();
  for (const finding of findings) {
    if (!finding.currency) continue;
    currencyVotes.set(finding.currency, (currencyVotes.get(finding.currency) || 0) + finding.confidence);
  }
  const currency = [...currencyVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const pick = (role: PriceRole): PriceFinding | null => {
    const list = findings
      .filter((finding) => finding.role === role && (!currency || finding.currency === null || finding.currency === currency))
      .sort((a, b) => b.confidence - a.confidence || b.value - a.value);
    return list[0] || null;
  };

  const sale = pick('sale');
  const original = pick('original');
  const shipping = pick('shipping');
  const total = pick('total');

  // Cohérence promo : si un ancien prix et une remise existent sans prix promo,
  // on ne devine PAS le prix promo (règle : jamais de calcul inventé).
  const best = (list: Array<PriceFinding | null>) => list.filter(Boolean).sort((a, b) => (b as PriceFinding).confidence - (a as PriceFinding).confidence)[0] || null;
  const top = best([sale, original, shipping, total, ...findings.filter((f) => f.role === 'other')]);
  const confidence = top ? Math.round(top.confidence * 100) / 100 : 0;

  return {
    findings,
    salePrice: sale?.value ?? null,
    originalPrice: original?.value ?? null,
    shippingPrice: shipping?.value ?? null,
    totalPrice: total?.value ?? null,
    discountPercent,
    currency,
    confidence,
    text: clean.slice(0, 4000),
  };
}
