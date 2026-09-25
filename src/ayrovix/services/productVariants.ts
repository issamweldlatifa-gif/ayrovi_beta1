/*
 * COMPRÉHENSION DES VARIANTES PRODUIT (phase 2 du prototype approuvé, 25/09/2026).
 *
 *   SerpApi JSON → Parse → Normalize → Understand Product → Extract Variants
 *                → Check Availability → Prepare Product Card → Order Gate
 *
 * TROIS RÈGLES INTANGIBLES, validées sur 7 fiches réelles avant intégration :
 *   1. La NATURE d'une valeur se déduit de la valeur (« 50 ml » → volume), jamais
 *      du nom que le marchand donne au groupe. Un parfum ne peut donc pas porter
 *      une pointure, ni un téléphone une taille de vêtement.
 *   2. Une variante non confirmée reste « unknown ». Jamais promue en « available ».
 *   3. Rien n'est inventé : chaque variante garde le chemin JSON dont elle vient.
 *
 * Ce module est PUR (aucune I/O) : il est testé dans tests/product-variants.test.ts.
 * La résolution réseau de la disponibilité vit dans variantAvailability.ts.
 */

/* ── TYPES ─────────────────────────────────────────── */
/** Disponibilité à TROIS états — « inconnu » n'est jamais promu en « disponible ». */
export type Availability = 'available' | 'unavailable' | 'unknown';

/**
 * Nature d'une valeur, DÉDUITE de la valeur elle-même (« 50 ml » → volume),
 * jamais du nom de l'attribut : un marchand qui appelle « Size » un volume ne
 * doit pas nous faire afficher une pointure.
 */
export type ValueKind =
  | 'volume'          // 50 ml, 3.4 fl oz
  | 'storage'         // 128 GB, 1 TB
  | 'ram'             // 8 GB RAM
  | 'clothing_size'   // XS…XXL, 30x32
  | 'shoe_size'       // 39, 40, US 9.5
  | 'numeric_size'    // nombre nu : pointure OU taille — AMBIGU tant que la catégorie n'est pas connue
  | 'color'
  | 'weight'
  | 'pack'            // lot de 3, 2-pack
  | 'unknown';

/** Catégorie produit déduite du contenu de la fiche (avec preuves). */
export type ProductCategory =
  | 'footwear'
  | 'apparel_bottom'
  | 'apparel_top'
  | 'fragrance'
  | 'phone'
  | 'computer'
  | 'watch'
  | 'bag'
  | 'unknown';

export interface Evidence {
  /** Chemin JSON de la donnée d'origine — la preuve de non-invention. */
  path: string;
  /** Extrait brut. */
  raw: string;
  /** Signal exploité. */
  signal?: string;
  weight?: number;
}

/** Une valeur d'option telle que lue à la source, puis normalisée. */
export interface RawOptionValue {
  label: string;
  path: string;
  selected?: boolean;
  /** Booléen explicite de la source, s'il existe. */
  availableFlag?: boolean;
  /** Textes de la source pouvant porter un état de stock. */
  stockTexts: string[];
  price?: { amount: number; currency: string; path: string };
  thumbnail?: string;
  productId?: string;
  /** Lien SerpApi propre à la variante — permet d'aller chercher SON stock. */
  serpapiLink?: string;
}

/** Un groupe d'options tel que lu à la source (nom = celui du marchand). */
export interface RawOptionGroup {
  sourceLabel: string;
  path: string;
  values: RawOptionValue[];
}

/** Signaux textuels servant à comprendre le produit. */
export interface ProductSignals {
  title: string;
  description: string;
  brand?: string;
  extensions: string[];
  specs: Array<{ name: string; value: string; path: string }>;
  breadcrumbs: string[];
  sellerStockTexts: string[];
  price?: { amount: number; currency: string; path: string };
}

export interface ParsedProduct {
  signals: ProductSignals;
  groups: RawOptionGroup[];
  /** Champs lus / ignorés — utile pour la revue. */
  readPaths: string[];
}

export interface ClassifiedProduct {
  category: ProductCategory;
  confidence: number;
  evidence: Evidence[];
}

export interface Variant {
  value: string;
  /** Identifiants de la variante chez la source : la clé de la résolution du stock. */
  productId?: string;
  serpapiLink?: string;
  availability: Availability;
  /** Pourquoi cet état — et jamais « supposé disponible ». */
  availabilityReason: string;
  selected: boolean;
  price?: { amount: number; currency: string };
  sourcePath: string;
}

export interface Attribute {
  /** Libellé affiché, déduit de la nature des valeurs (Volume, Stockage, Pointure…). */
  label: string;
  /** Libellé d'origine du marchand — conservé pour la traçabilité. */
  sourceLabel: string;
  kind: ValueKind;
  role: 'primary' | 'secondary';
  required: boolean;
  variants: Variant[];
  sourcePath: string;
}

export interface RejectedGroup {
  sourceLabel: string;
  kind: ValueKind;
  reason: string;
  sourcePath: string;
}

export interface ProductCard {
  title: string;
  brand?: string;
  category: ProductCategory;
  categoryConfidence: number;
  price?: { amount: number; currency: string };
  /** SEULS les attributs pertinents pour ce produit. */
  attributes: Attribute[];
  /** Groupes écartés, avec la raison — la preuve que le filtre a travaillé. */
  rejected: RejectedGroup[];
  /** Disponibilité globale, jamais déduite « par optimisme ». */
  availability: Availability;
  evidence: Evidence[];
}

export type OrderBlockCode =
  | 'OK'
  | 'ATTRIBUTE_NOT_SELECTED'
  | 'VARIANT_NOT_FOUND'
  | 'VARIANT_UNAVAILABLE'
  | 'VARIANT_AVAILABILITY_UNKNOWN'
  | 'PRICE_MISSING'
  | 'PRICE_INVALID';

export interface OrderDecision {
  allowed: boolean;
  code: OrderBlockCode;
  message: string;
  resolved?: { attribute: string; value: string; price: { amount: number; currency: string } };
}

/* ── VALUEKINDS ─────────────────────────────────────────── */
const COLOR_WORDS = [
  'black', 'white', 'grey', 'gray', 'silver', 'gold', 'blue', 'navy', 'red', 'green', 'pink',
  'purple', 'violet', 'orange', 'brown', 'beige', 'camel', 'yellow', 'ivory', 'cream', 'teal',
  'noir', 'blanc', 'gris', 'argent', 'or', 'bleu', 'marine', 'rouge', 'vert', 'rose', 'violet',
  'marron', 'jaune', 'crème', 'أسود', 'أبيض', 'أزرق', 'أحمر', 'أخضر', 'رمادي', 'ذهبي', 'وردي',
];

export interface KindMatch {
  kind: ValueKind;
  /** Ce qui a déclenché la reconnaissance — affiché dans la revue. */
  signal: string;
}

export function kindOfValue(value: string): KindMatch {
  const text = value.trim();
  const lower = text.toLowerCase();

  if (/\b\d+(?:[.,]\d+)?\s*(?:gb|go|tb|to|mb)\b.*\bram\b|\bram\b.*\b\d+\s*(?:gb|go)\b/i.test(lower)) {
    return { kind: 'ram', signal: 'unité de mémoire vive' };
  }
  if (/\b\d+(?:[.,]\d+)?\s*(?:gb|go|tb|to|mb)\b/i.test(lower)) {
    return { kind: 'storage', signal: 'unité de stockage (GB/TB)' };
  }
  if (/\b\d+(?:[.,]\d+)?\s*(?:ml|cl|l|litre|liter|fl\.?\s?oz|oz)\b/i.test(lower)) {
    return { kind: 'volume', signal: 'unité de volume (ml/l/oz)' };
  }
  if (/\b\d+(?:[.,]\d+)?\s*(?:g|kg|lb|lbs)\b/i.test(lower)) {
    return { kind: 'weight', signal: 'unité de masse' };
  }
  if (/\b(?:lot|pack|pcs|pi[eè]ces?)\b|\b\d+\s*-?\s*pack\b/i.test(lower)) {
    return { kind: 'pack', signal: 'conditionnement' };
  }
  if (/^(?:xx?s|s|m|l|xx?x?l|[2-5]xl)$/i.test(lower)) {
    return { kind: 'clothing_size', signal: 'taille alphabétique' };
  }
  if (/^\d{2}\s?[x×/]\s?\d{2}$/.test(lower)) {
    return { kind: 'clothing_size', signal: 'tour de taille × longueur' };
  }
  if (/\b(?:eu|us|uk|fr)\s?\d{1,2}(?:[.,]5)?\b/i.test(lower) && /\b(?:eu|us|uk)\b/i.test(lower)) {
    return { kind: 'shoe_size', signal: 'pointure avec système (EU/US/UK)' };
  }
  if (COLOR_WORDS.some((word) => lower === word || lower.startsWith(`${word} `) || lower.endsWith(` ${word}`))) {
    return { kind: 'color', signal: 'nom de couleur' };
  }
  if (/^\d{1,2}(?:[.,]5)?$/.test(lower)) {
    return { kind: 'numeric_size', signal: 'nombre nu — ambigu sans catégorie' };
  }
  return { kind: 'unknown', signal: 'aucune nature reconnue' };
}

/** Nature dominante d'un groupe + part de valeurs concordantes. */
export function kindOfGroup(values: string[]): { kind: ValueKind; confidence: number; signal: string } {
  const matches = values.map(kindOfValue);
  const tally = new Map<ValueKind, { count: number; signal: string }>();
  for (const match of matches) {
    const entry = tally.get(match.kind) ?? { count: 0, signal: match.signal };
    entry.count += 1;
    tally.set(match.kind, entry);
  }
  let best: { kind: ValueKind; count: number; signal: string } = { kind: 'unknown', count: 0, signal: '' };
  for (const [kind, entry] of tally) {
    // « unknown » ne gagne jamais contre une nature identifiée à égalité.
    if (entry.count > best.count || (entry.count === best.count && best.kind === 'unknown' && kind !== 'unknown')) {
      best = { kind, count: entry.count, signal: entry.signal };
    }
  }
  return { kind: best.kind, confidence: values.length ? best.count / values.length : 0, signal: best.signal };
}

/** Le nom lisible d'un attribut découle de la NATURE, pas du marchand. */
export function labelForKind(kind: ValueKind, fallback: string): string {
  switch (kind) {
    case 'volume': return 'Volume';
    case 'storage': return 'Stockage';
    case 'ram': return 'Mémoire';
    case 'clothing_size': return 'Taille';
    case 'shoe_size': return 'Pointure';
    case 'color': return 'Couleur';
    case 'weight': return 'Poids';
    case 'pack': return 'Conditionnement';
    case 'numeric_size': return fallback || 'Taille';
    default: return fallback;
  }
}

/* ── TAXONOMY ─────────────────────────────────────────── */
interface CategoryRule {
  category: ProductCategory;
  /** Termes FR / EN / AR — le marché AYROVI est trilingue. */
  terms: string[];
}

const RULES: CategoryRule[] = [
  { category: 'footwear', terms: ['sneaker', 'shoe', 'shoes', 'running shoe', 'trainer', 'basket', 'chaussure', 'chaussures', 'basket', 'boot', 'bottine', 'sandal', 'sandale', 'mocassin', 'air max', 'حذاء', 'أحذية', 'صباط'] },
  { category: 'apparel_bottom', terms: ['pants', 'trousers', 'jean', 'jeans', 'chino', 'pantalon', 'short', 'bermuda', 'legging', 'jogger', 'سروال', 'بنطلون'] },
  { category: 'apparel_top', terms: ['shirt', 't-shirt', 'tee', 'hoodie', 'sweater', 'sweatshirt', 'jacket', 'bomber', 'coat', 'chemise', 'veste', 'pull', 'manteau', 'قميص', 'سترة', 'جاكيت'] },
  { category: 'fragrance', terms: ['perfume', 'fragrance', 'eau de toilette', 'eau de parfum', 'cologne', 'edt', 'edp', 'parfum', 'عطر', 'عطور'] },
  { category: 'phone', terms: ['smartphone', 'iphone', 'galaxy', 'pixel', 'mobile phone', 'téléphone', 'telephone portable', 'هاتف', 'جوال'] },
  { category: 'computer', terms: ['laptop', 'notebook', 'macbook', 'ultrabook', 'ordinateur portable', 'pc portable', 'حاسوب', 'لابتوب'] },
  { category: 'watch', terms: ['watch', 'montre', 'smartwatch', 'ساعة'] },
  { category: 'bag', terms: ['handbag', 'backpack', 'sac à main', 'sac', 'cartable', 'tote', 'حقيبة'] },
];

/** Poids par provenance : un titre est un signal plus fort qu'une description. */
const FIELD_WEIGHT = { breadcrumb: 4, title: 3, extension: 2, spec: 2, description: 1 } as const;

function scanField(text: string, path: string, weight: number, scores: Map<ProductCategory, number>, evidence: Evidence[]): void {
  const lower = ` ${text.toLowerCase()} `;
  for (const rule of RULES) {
    for (const term of rule.terms) {
      // frontière de mot pour éviter « short » dans « shortcut »
      const pattern = new RegExp(`(^|[^\\p{L}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu');
      if (!pattern.test(lower)) continue;
      scores.set(rule.category, (scores.get(rule.category) ?? 0) + weight);
      evidence.push({ path, raw: text.slice(0, 120), signal: `« ${term} » → ${rule.category}`, weight });
      break; // un terme suffit par règle et par champ
    }
  }
}

export function classifyProduct(signals: ProductSignals): ClassifiedProduct {
  const scores = new Map<ProductCategory, number>();
  const evidence: Evidence[] = [];
  for (const crumb of signals.breadcrumbs) scanField(crumb, 'breadcrumbs', FIELD_WEIGHT.breadcrumb, scores, evidence);
  scanField(signals.title, 'product_results.title', FIELD_WEIGHT.title, scores, evidence);
  for (const [index, extension] of signals.extensions.entries()) scanField(extension, `product_results.extensions[${index}]`, FIELD_WEIGHT.extension, scores, evidence);
  for (const spec of signals.specs) scanField(`${spec.name} ${spec.value}`, spec.path, FIELD_WEIGHT.spec, scores, evidence);
  scanField(signals.description, 'product_results.description', FIELD_WEIGHT.description, scores, evidence);

  let best: ProductCategory = 'unknown';
  let bestScore = 0;
  let total = 0;
  for (const [category, score] of scores) {
    total += score;
    if (score > bestScore) { best = category; bestScore = score; }
  }
  // Confiance = part du meilleur score, pénalisée si un seul signal faible.
  const confidence = total ? Math.min(1, (bestScore / total) * Math.min(1, bestScore / 3)) : 0;
  if (bestScore < 2 || confidence < 0.35) {
    return { category: 'unknown', confidence, evidence: evidence.filter((item) => item.weight) };
  }
  return { category: best, confidence, evidence: evidence.filter((item) => item.signal?.includes(best)) };
}

/* ── Matrice de compatibilité ────────────────────────────────────────────── */

interface Compatibility {
  /** Nature attendue de l'attribut PRINCIPAL de cette catégorie. */
  primary: ValueKind | null;
  /** Natures acceptées en secondaire. */
  secondary: ValueKind[];
  /** Interprétation d'un nombre nu pour cette catégorie (sinon : refus). */
  numericMeans: ValueKind | null;
  /** Bornes de plausibilité du nombre nu. */
  numericRange?: [number, number];
}

const MATRIX: Record<ProductCategory, Compatibility> = {
  footwear: { primary: 'shoe_size', secondary: ['color', 'pack'], numericMeans: 'shoe_size', numericRange: [15, 52] },
  apparel_bottom: { primary: 'clothing_size', secondary: ['color'], numericMeans: 'clothing_size', numericRange: [24, 62] },
  apparel_top: { primary: 'clothing_size', secondary: ['color'], numericMeans: 'clothing_size', numericRange: [30, 62] },
  fragrance: { primary: 'volume', secondary: ['pack'], numericMeans: null },
  phone: { primary: 'storage', secondary: ['color', 'ram'], numericMeans: null },
  computer: { primary: 'storage', secondary: ['color', 'ram'], numericMeans: null },
  watch: { primary: null, secondary: ['color'], numericMeans: null },
  bag: { primary: null, secondary: ['color'], numericMeans: null },
  // Catégorie inconnue : on n'accepte QUE les natures qui se décrivent elles-mêmes
  // (une unité est sans ambiguïté). Un nombre nu reste refusé : rien ne permet
  // d'affirmer que c'est une pointure plutôt qu'une taille.
  unknown: { primary: null, secondary: ['volume', 'storage', 'ram', 'color', 'weight', 'pack'], numericMeans: null },
};

export interface CompatibilityVerdict {
  accepted: boolean;
  /** Nature finale retenue (un nombre nu peut devenir pointure SI la catégorie le dit). */
  resolvedKind: ValueKind;
  role: 'primary' | 'secondary';
  reason: string;
}

export function checkCompatibility(category: ProductCategory, kind: ValueKind, values: string[]): CompatibilityVerdict {
  const rules = MATRIX[category];

  if (kind === 'numeric_size') {
    if (!rules.numericMeans) {
      return {
        accepted: false, resolvedKind: kind, role: 'secondary',
        reason: `nombres nus (${values.slice(0, 3).join(', ')}) sans unité : aucune signification établie pour « ${category} » — refusé plutôt que deviné`,
      };
    }
    const numbers = values.map((value) => Number(value.replace(',', '.'))).filter((n) => Number.isFinite(n));
    const [min, max] = rules.numericRange ?? [0, Infinity];
    const inRange = numbers.every((n) => n >= min && n <= max);
    if (!inRange) {
      return {
        accepted: false, resolvedKind: kind, role: 'secondary',
        reason: `valeurs hors de la plage plausible [${min}–${max}] pour « ${category} »`,
      };
    }
    return {
      accepted: true, resolvedKind: rules.numericMeans,
      role: rules.numericMeans === rules.primary ? 'primary' : 'secondary',
      reason: `nombre nu interprété comme ${rules.numericMeans} d'après la catégorie « ${category} » (plage ${min}–${max})`,
    };
  }

  if (kind === rules.primary) {
    return { accepted: true, resolvedKind: kind, role: 'primary', reason: `nature attendue pour « ${category} »` };
  }
  if (rules.secondary.includes(kind)) {
    return { accepted: true, resolvedKind: kind, role: 'secondary', reason: `nature secondaire admise pour « ${category} »` };
  }
  if (kind === 'unknown') {
    return { accepted: false, resolvedKind: kind, role: 'secondary', reason: 'nature des valeurs non reconnue — rien ne justifie de l\'afficher' };
  }
  return {
    accepted: false, resolvedKind: kind, role: 'secondary',
    reason: `attribut « ${kind} » incompatible avec « ${category} » (attendu : ${[rules.primary, ...rules.secondary].filter(Boolean).join(', ') || 'aucun'})`,
  };
}

/* ── AVAILABILITY ─────────────────────────────────────────── */
const UNAVAILABLE_PATTERNS = [
  /\bout\s*of\s*stock\b/i, /\bsold\s*out\b/i, /\bunavailable\b/i, /\bno\s+longer\s+available\b/i,
  /\brupture\b/i, /\b[ée]puis[ée]\b/i, /\bindisponible\b/i, /\bnon\s+disponible\b/i,
  /غير\s*متوفر/, /نفد\s*(?:المخزون|الكمية)/, /غير\s*متاح/,
];

const AVAILABLE_PATTERNS = [
  /\bin\s*stock\b/i, /\bavailable\b/i, /\bdisponible\b/i, /\ben\s*stock\b/i,
  /متوفر/, /متاح/,
];

export interface AvailabilityVerdict {
  state: Availability;
  reason: string;
}

export function availabilityOf(value: RawOptionValue): AvailabilityVerdict {
  if (value.availableFlag === true) return { state: 'available', reason: 'champ « available: true » de la source' };
  if (value.availableFlag === false) return { state: 'unavailable', reason: 'champ « available: false » de la source' };

  for (const text of value.stockTexts) {
    if (UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(text))) {
      return { state: 'unavailable', reason: `texte de stock explicite : « ${text} »` };
    }
  }
  for (const text of value.stockTexts) {
    if (AVAILABLE_PATTERNS.some((pattern) => pattern.test(text))) {
      return { state: 'available', reason: `texte de stock explicite : « ${text} »` };
    }
  }
  return {
    state: 'unknown',
    reason: 'la source ne dit rien du stock de cette variante — non supposée disponible',
  };
}

/**
 * Disponibilité GLOBALE de la fiche : elle résume les variantes quand il y en a
 * (et ne s'appuie sur les vendeurs que lorsqu'il n'y a AUCUNE variante).
 */
export function overallAvailability(variantStates: Availability[], sellerTexts: string[]): AvailabilityVerdict {
  if (variantStates.length) {
    if (variantStates.some((state) => state === 'available')) {
      return { state: 'available', reason: 'au moins une variante explicitement disponible' };
    }
    if (variantStates.every((state) => state === 'unavailable')) {
      return { state: 'unavailable', reason: 'toutes les variantes sont explicitement indisponibles' };
    }
    return { state: 'unknown', reason: 'aucune variante n\'a de disponibilité confirmée' };
  }
  for (const text of sellerTexts) {
    if (UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(text))) return { state: 'unavailable', reason: `vendeur : « ${text} »` };
  }
  for (const text of sellerTexts) {
    if (AVAILABLE_PATTERNS.some((pattern) => pattern.test(text))) return { state: 'available', reason: `vendeur : « ${text} »` };
  }
  return { state: 'unknown', reason: 'aucun signal de stock dans la source' };
}

/* ── PARSE ─────────────────────────────────────────── */
const CURRENCY_SYMBOLS: Record<string, string> = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', 'DT': 'TND', 'TND': 'TND' };

export function extractPrice(raw: unknown, path: string): { amount: number; currency: string; path: string } | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return undefined; // un nombre nu n'a pas de devise : inexploitable seul
  if (typeof raw !== 'string') return undefined;
  const currencyKey = Object.keys(CURRENCY_SYMBOLS).find((symbol) => raw.includes(symbol));
  const match = raw.replace(/\s/g, '').match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!currencyKey || !match) return undefined;
  const amount = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return { amount, currency: CURRENCY_SYMBOLS[currencyKey], path };
}

/** Normalisation minimale et NON destructive : espaces, casse des unités, unicode. */
export function normalizeLabel(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function collectStockTexts(item: Record<string, any>): string[] {
  const texts: string[] = [];
  for (const key of ['availability', 'stock', 'status', 'badge', 'tag', 'delivery', 'condition']) {
    if (typeof item[key] === 'string') texts.push(item[key]);
  }
  for (const key of ['buying_options', 'extensions', 'details_and_offers']) {
    for (const entry of asArray(item[key])) {
      if (typeof entry === 'string') texts.push(entry);
      else if (entry && typeof entry === 'object' && typeof (entry as any).text === 'string') texts.push((entry as any).text);
    }
  }
  return texts;
}

function readValue(item: unknown, path: string): RawOptionValue | null {
  if (typeof item === 'string') {
    const label = normalizeLabel(item);
    return label ? { label, path, stockTexts: [] } : null;
  }
  const record = asRecord(item);
  const label = normalizeLabel(String(record.name ?? record.title ?? record.value ?? record.label ?? ''));
  if (!label) return null;
  return {
    label,
    path,
    selected: record.selected === true,
    availableFlag: typeof record.available === 'boolean' ? record.available
      : typeof record.in_stock === 'boolean' ? record.in_stock : undefined,
    stockTexts: collectStockTexts(record),
    price: extractPrice(record.price, `${path}.price`),
    thumbnail: typeof record.thumbnail === 'string' ? record.thumbnail : undefined,
    productId: record.product_id ? String(record.product_id) : undefined,
    serpapiLink: typeof record.serpapi_link === 'string' ? record.serpapi_link : undefined,
  };
}

export function parseSerpApi(payload: unknown): ParsedProduct {
  const root = asRecord(payload);
  const product = asRecord(root.product_results ?? root.product_result ?? root.product);
  const readPaths: string[] = [];
  const groups: RawOptionGroup[] = [];

  // (a) product_results.variations — { "Nom dynamique": [ options ] }
  const variations = asRecord(product.variations);
  for (const [name, list] of Object.entries(variations)) {
    const base = `product_results.variations["${name}"]`;
    const values = asArray(list).map((item, index) => readValue(item, `${base}[${index}]`)).filter(Boolean) as RawOptionValue[];
    if (values.length) { groups.push({ sourceLabel: normalizeLabel(name), path: base, values }); readPaths.push(base); }
  }

  // (b) product_results.variants — [ { title, items: [ … ] } ] (Immersive Product API)
  for (const [index, entry] of asArray(product.variants).entries()) {
    const record = asRecord(entry);
    const base = `product_results.variants[${index}]`;
    const values = asArray(record.items).map((item, i) => readValue(item, `${base}.items[${i}]`)).filter(Boolean) as RawOptionValue[];
    const label = normalizeLabel(String(record.title ?? ''));
    if (label && values.length) { groups.push({ sourceLabel: label, path: base, values }); readPaths.push(base); }
  }

  // (c) product_results.sizes — { "40": { … } } : PAS de champ de disponibilité.
  //     Le prototype ne comble pas ce vide : ces variantes seront « unknown ».
  const sizes = asRecord(product.sizes);
  const sizeValues: RawOptionValue[] = [];
  for (const [label, detail] of Object.entries(sizes)) {
    const path = `product_results.sizes["${label}"]`;
    const record = asRecord(detail);
    const clean = normalizeLabel(label);
    if (!clean) continue;
    sizeValues.push({
      label: clean,
      path,
      selected: record.selected === true,
      availableFlag: typeof record.available === 'boolean' ? record.available : undefined,
      stockTexts: collectStockTexts(record),
      productId: record.product_id ? String(record.product_id) : undefined,
      serpapiLink: typeof record.serpapi_link === 'string' ? record.serpapi_link : undefined,
    });
  }
  if (sizeValues.length) {
    groups.push({ sourceLabel: 'Size', path: 'product_results.sizes', values: sizeValues });
    readPaths.push('product_results.sizes');
  }

  // (d) Signaux de compréhension du produit.
  const specs: ProductSignals['specs'] = [];
  for (const [index, feature] of asArray(product.features).entries()) {
    const record = asRecord(feature);
    if (record.name) specs.push({ name: String(record.name), value: String(record.text ?? record.value ?? ''), path: `product_results.features[${index}]` });
  }
  for (const [key, value] of Object.entries(asRecord(product.specs ?? root.specs_results))) {
    if (typeof value === 'string' || typeof value === 'number') specs.push({ name: key, value: String(value), path: `specs_results.${key}` });
    else for (const [subKey, subValue] of Object.entries(asRecord(value))) {
      specs.push({ name: subKey, value: String(subValue), path: `specs_results.${key}.${subKey}` });
    }
  }

  const sellerStockTexts: string[] = [];
  for (const seller of asArray(asRecord(root.sellers_results).online_sellers)) {
    sellerStockTexts.push(...collectStockTexts(asRecord(seller)));
  }

  const signals: ProductSignals = {
    title: normalizeLabel(String(product.title ?? '')),
    description: normalizeLabel(String(product.description ?? '')),
    brand: product.brand ? String(product.brand) : (asRecord(asRecord(root.specs_results).universal_product_identifiers).brand ?? undefined),
    extensions: asArray(product.extensions).filter((entry): entry is string => typeof entry === 'string').map(normalizeLabel),
    specs,
    breadcrumbs: asArray(product.categories ?? root.breadcrumbs).filter((entry): entry is string => typeof entry === 'string').map(normalizeLabel),
    sellerStockTexts,
    price: extractPrice(asArray(product.prices)[0], 'product_results.prices[0]')
      ?? extractPrice(asRecord(product.typical_prices).shown_price, 'product_results.typical_prices.shown_price')
      ?? extractPrice(asRecord(asArray(asRecord(root.sellers_results).online_sellers)[0]).base_price, 'sellers_results.online_sellers[0].base_price'),
  };

  return { signals, groups, readPaths };
}

/* ── PIPELINE ─────────────────────────────────────────── */
export interface PipelineResult {
  card: ProductCard;
  /** Journal lisible de chaque étape — sert la revue et le débogage. */
  trace: string[];
}

export function buildProductCard(payload: unknown): PipelineResult {
  const trace: string[] = [];
  const parsed = parseSerpApi(payload);
  trace.push(`Parse : ${parsed.groups.length} groupe(s) d'options lus depuis ${parsed.readPaths.length || 0} chemin(s) source`);

  const classified = classifyProduct(parsed.signals);
  trace.push(`Understand : catégorie « ${classified.category} » (confiance ${(classified.confidence * 100).toFixed(0)} %) — ${classified.evidence.length} preuve(s)`);

  const attributes: Attribute[] = [];
  const rejected: RejectedGroup[] = [];

  for (const group of parsed.groups) {
    const detected = kindOfGroup(group.values.map((value) => value.label));
    const verdict = checkCompatibility(classified.category, detected.kind, group.values.map((value) => value.label));
    if (!verdict.accepted) {
      rejected.push({ sourceLabel: group.sourceLabel, kind: detected.kind, reason: verdict.reason, sourcePath: group.path });
      trace.push(`Filtre : « ${group.sourceLabel} » REFUSÉ — ${verdict.reason}`);
      continue;
    }
    const variants: Variant[] = group.values.map((value) => {
      const availability = availabilityOf(value);
      return {
        value: value.label,
        productId: value.productId,
        serpapiLink: value.serpapiLink,
        availability: availability.state,
        availabilityReason: availability.reason,
        selected: value.selected === true,
        price: value.price ? { amount: value.price.amount, currency: value.price.currency } : undefined,
        sourcePath: value.path,
      };
    });
    attributes.push({
      label: labelForKind(verdict.resolvedKind, group.sourceLabel),
      sourceLabel: group.sourceLabel,
      kind: verdict.resolvedKind,
      role: verdict.role,
      required: verdict.role === 'primary',
      variants,
      sourcePath: group.path,
    });
    trace.push(`Attribut : « ${group.sourceLabel} » → ${labelForKind(verdict.resolvedKind, group.sourceLabel)} (${verdict.resolvedKind}, ${verdict.role}) — ${verdict.reason}`);
  }

  // Un seul attribut principal : si plusieurs prétendent au rôle, le plus fourni gagne.
  const primaries = attributes.filter((attribute) => attribute.role === 'primary');
  if (primaries.length > 1) {
    primaries.sort((a, b) => b.variants.length - a.variants.length);
    for (const extra of primaries.slice(1)) { extra.role = 'secondary'; extra.required = false; }
  }

  const allStates = attributes.flatMap((attribute) => attribute.variants.map((variant) => variant.availability));
  const availability = overallAvailability(allStates, parsed.signals.sellerStockTexts);
  trace.push(`Disponibilité globale : ${availability.state} — ${availability.reason}`);

  const card: ProductCard = {
    title: parsed.signals.title,
    brand: parsed.signals.brand,
    category: classified.category,
    categoryConfidence: classified.confidence,
    price: parsed.signals.price ? { amount: parsed.signals.price.amount, currency: parsed.signals.price.currency } : undefined,
    attributes,
    rejected,
    availability: availability.state,
    evidence: classified.evidence,
  };
  return { card, trace };
}

/* ── ÉTAPE 8 — Selected Variant → Availability → Price → Allow Order ─────── */

export interface VariantSelection { [attributeLabel: string]: string }

export function decideOrder(card: ProductCard, selection: VariantSelection): OrderDecision {
  const required = card.attributes.filter((attribute) => attribute.required);

  for (const attribute of required) {
    const chosen = selection[attribute.label];
    if (!chosen) {
      return { allowed: false, code: 'ATTRIBUTE_NOT_SELECTED', message: `« ${attribute.label} » doit être choisi avant la commande.` };
    }
    const variant = attribute.variants.find((item) => item.value === chosen);
    if (!variant) {
      return { allowed: false, code: 'VARIANT_NOT_FOUND', message: `« ${chosen} » n'existe pas dans les données du marchand — aucune variante inventée.` };
    }
    if (variant.availability === 'unavailable') {
      return { allowed: false, code: 'VARIANT_UNAVAILABLE', message: `« ${attribute.label} ${chosen} » est indisponible : commande refusée.` };
    }
    if (variant.availability === 'unknown') {
      return { allowed: false, code: 'VARIANT_AVAILABILITY_UNKNOWN', message: `Stock de « ${attribute.label} ${chosen} » non confirmé par la source : commande refusée (jamais supposé disponible).` };
    }
  }

  // Les attributs secondaires choisis sont soumis aux mêmes contrôles de stock.
  for (const attribute of card.attributes.filter((item) => !item.required)) {
    const chosen = selection[attribute.label];
    if (!chosen) continue;
    const variant = attribute.variants.find((item) => item.value === chosen);
    if (!variant) return { allowed: false, code: 'VARIANT_NOT_FOUND', message: `« ${chosen} » absent des données du marchand.` };
    if (variant.availability === 'unavailable') return { allowed: false, code: 'VARIANT_UNAVAILABLE', message: `« ${attribute.label} ${chosen} » est indisponible.` };
    if (variant.availability === 'unknown') return { allowed: false, code: 'VARIANT_AVAILABILITY_UNKNOWN', message: `Stock de « ${attribute.label} ${chosen} » non confirmé.` };
  }

  // Sans attribut requis, la fiche elle-même doit être explicitement disponible.
  if (!required.length) {
    if (card.availability === 'unavailable') return { allowed: false, code: 'VARIANT_UNAVAILABLE', message: 'Produit indisponible.' };
    if (card.availability === 'unknown') return { allowed: false, code: 'VARIANT_AVAILABILITY_UNKNOWN', message: 'Disponibilité du produit non confirmée par la source : commande refusée.' };
  }

  // Prix : celui de la variante s'il existe, sinon celui du produit. Jamais inventé.
  const primary = required[0];
  const chosenVariant = primary ? primary.variants.find((item) => item.value === selection[primary.label]) : undefined;
  const price = chosenVariant?.price ?? card.price;
  if (!price) return { allowed: false, code: 'PRICE_MISSING', message: 'Aucun prix exploitable (montant + devise) dans la source : commande refusée.' };
  if (!(price.amount > 0) || !price.currency) return { allowed: false, code: 'PRICE_INVALID', message: 'Prix incohérent : commande refusée.' };

  return {
    allowed: true,
    code: 'OK',
    message: 'Variante disponible et prix validé.',
    resolved: {
      attribute: primary?.label ?? '—',
      value: primary ? selection[primary.label] : '—',
      price,
    },
  };
}
