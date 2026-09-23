/*
 * PRODUCT ATTRIBUTES — couche « compréhension produit » (plan P1, 23/09/2026).
 * Module PUR (aucun I/O) partagé par la vitrine ; le serveur peut l'importer
 * pour l'enrichissement. Référence : modèle Zalando (capacity, sizes, per-100).
 *
 * Règles :
 *  • on n'invente JAMAIS une donnée absente — on extrait, ou on ne montre rien ;
 *  • la classification se base sur le titre + la description (fr/en) ;
 *  • le prix/100 ml n'est calculé que pour beauty & perfume avec capacité nette.
 */

export type ProductClass =
  | 'beauty'
  | 'perfume'
  | 'clothing'
  | 'shoes'
  | 'bag'
  | 'accessory'
  | 'electronics'
  | 'home'
  | 'other';

const CLASS_RULES: Array<{ cls: ProductClass; patterns: RegExp[] }> = [
  // — beauté & parfums : le plus tôt possible (mots les plus discriminants d'abord) —
  { cls: 'perfume', patterns: [/\bparfum\b/i, /\beau de (?:parfum|toilette)\b/i, /\bedt\b/i, /\bedp\b/i, /\bcologne\b/i, /\bعطر\b/] },
  { cls: 'beauty', patterns: [/\bsoin\b/i, /\bs[ée]rum\b/i, /\bcr[èe]me\b/i, /\bgel\b/i, /\bmasque\b/i, /\bnettoyant\b/i, /\bshampooing\b/i, /\brouge [àa] l[èe]vres\b/i, /\bmaquillage\b/i, /\bfond de teint\b/i, /\bmascara\b/i, /\beye (?:serum|gel|cream)\b/i, /\bskincare\b/i, /\bcollagen\b/i, /\bhyaluron\b/i, /\bتجميل\b/, /\bعناية\b/] },
  // — chaussures —
  { cls: 'shoes', patterns: [/\bchaussures?\b/i, /\bsneakers?\b/i, /\bbaskets?\b/i, /\btrainers?\b/i, /\bsandales?\b/i, /\bmocassins?\b/i, /\bbottines?\b/i, /\bcuissardes?\b/i, /\bespadrilles?\b/i, /\bmules?\b/i, /\bderbies?\b/i, /\brunning\b/i, /\bpointure\b/i, /\bحذاء\b/, /\bصباط\b/] },
  // — sacs —
  { cls: 'bag', patterns: [/\bsac [àa] dos\b/i, /\bsacs? (?:àa]? main|bandouli[èe]re|seau|voyage|cabas)\b/i, /\bbackpacks?\b/i, /\bsatchel\b/i, /\btote\b/i, /\bclutch\b/i, /\bvalise\b/i, /\bساك\b/, /\bمحفظة يد\b/] },
  // — vêtements —
  { cls: 'clothing', patterns: [/\bt-?shirts?\b/i, /\bpulls?\b/i, /\bsweats?\b/i, /\bhoodie\b/i, /\bveste\b/i, /\bmanteau\b/i, /\bpantalon\b/i, /\bjean\b/i, /\bchemise\b/i, /\brobe\b/i, /\bjuppe\b/i, /\bshort\b/i, /\bcombinaison\b/i, /\bleggings?\b/i, /\bpyjama\b/i, /\bmaillot\b/i, /\bchemisier\b/i, /\bgilet\b/i, /\bبلوزة\b/, /\bقميص\b/, /\bسروال\b/, /\bفستان\b/] },
  // — électronique —
  { cls: 'electronics', patterns: [/\b(?:casque|[ée]couteurs?)\b/i, /\bheadphones?\b/i, /\bmontre (?:connect[ée]e|intelligente)\b/i, /\bsmartwatch\b/i, /\benceinte\b/i, /\bchargeur\b/i, /\bc[âa]ble\b/i, /\bpower ?bank\b/i, /\bt[ée]l[ée]phone\b/i, /\blaptop\b/i, /\b[ée]cran\b/i, /\bconsole\b/i, /\bسماعة\b/, /\bهاتف\b/] },
  // — maison —
  { cls: 'home', patterns: [/\bcoussin\b/i, /\bplaid\b/i, /\btapis\b/i, /\bvase\b/i, /\bbougie\b/i, /\blampe\b/i, /\bpanier\b/i, /\borganisation\b/i, /\bcuisine\b/i, /\bd[ée]coration\b/i, /\bمفروشات\b/, /\bديكور\b/] },
  // — accessoires —
  { cls: 'accessory', patterns: [/\bcasquette\b/i, /\bbob\b/i, /\bchapeau\b/i, /\b[ée]charpe\b/i, /\bgants\b/i, /\bceinture\b/i, /\blunettes\b/i, /\bb[ée]ret\b/i, /\bportefeuille\b/i, /\bcasque protecteur\b/i, /\bكاسكيطة\b/, /\bقبعة\b/] },
];

const CLASS_LABELS: Record<ProductClass, { fr: string; ar: string }> = {
  beauty: { fr: 'Soin & beauté', ar: 'عناية وتجميل' },
  perfume: { fr: 'Parfums', ar: 'عطور' },
  clothing: { fr: 'Vêtements', ar: 'ملابس' },
  shoes: { fr: 'Chaussures', ar: 'أحذية' },
  bag: { fr: 'Sacs', ar: 'حقائب' },
  accessory: { fr: 'Accessoires', ar: 'إكسسوارات' },
  electronics: { fr: 'Électronique', ar: 'إلكترونيات' },
  home: { fr: 'Maison', ar: 'منزل' },
  other: { fr: 'Produit', ar: 'منتج' },
};

/** Classe déduite du titre (+ description). Jamais devinée : sans indice → 'other'. */
export function classifyProduct(title: string, description?: string | null): ProductClass {
  const text = `${title} ${description || ''}`;
  for (const { cls, patterns } of CLASS_RULES) {
    if (patterns.some((pattern) => pattern.test(text))) return cls;
  }
  return 'other';
}

export function productClassLabel(cls: ProductClass, isArabic: boolean): string {
  return isArabic ? CLASS_LABELS[cls].ar : CLASS_LABELS[cls].fr;
}

/* ────────────────────────────────────────────────────────────────────
 * Capacité — « 10 ml », « 35 ml », « 50 cl », « 100 g », « 1,5 L »…
 * ──────────────────────────────────────────────────────────────────── */
export interface ProductCapacity {
  /** Valeur brute en unité (ex. 10 pour « 10 ml »). */
  value: number;
  unit: 'ml' | 'cl' | 'l' | 'g' | 'kg';
  /** Libellé canonique affiché (ex. « 10 ml », « 35 ml », « 100 g »). */
  label: string;
}

const CAPACITY_RE = /(\d+(?:[.,]\d+)?)\s?(ml|cl|g|kg|l)\b/i;

/** Première capacité nette trouvée dans le texte (on ne somme jamais les correspondances). */
export function extractCapacity(text: string): ProductCapacity | null {
  const match = text.match(CAPACITY_RE);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2].toLowerCase() as ProductCapacity['unit'];
  if (!['ml', 'cl', 'g', 'kg', 'l'].includes(unit)) return null;
  return { value, unit, label: `${match[1].replace(/[.,]0+$/, '')} ${unit}` };
}

/** Prix ramené à 100 ml (ou 100 g) — modèle Zalando « 77 € / 100 ml ». */
export function pricePer100(currentPrice: number, capacity: ProductCapacity): number | null {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  const toMl = { ml: 1, cl: 10, l: 1000, g: 1, kg: 1000 } as const;
  const base = capacity.value * toMl[capacity.unit];
  if (base <= 0) return null;
  return Math.round((currentPrice / base) * 100 * 1000) / 1000;
}

/** La classe justifie-t-elle l'affichage capacité + prix/100 ? */
export function usesCapacity(cls: ProductClass): boolean {
  return cls === 'beauty' || cls === 'perfume';
}

/* ────────────────────────────────────────────────────────────────────
 * Tailles — on n'invente rien : variantes marchand, jetons du titre
 * (« Taille unique », « 42 », « XS-XXL ») et rien sinon.
 * ──────────────────────────────────────────────────────────────────── */
const CLOTHING_SIZES = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
const SHOE_RE = /^(\d{2}(?:\.[05])?)$/; // 35 → 53, y compris les demis

export interface SizePresentation {
  /** Valeurs proposées au client, ordonnées. */
  options: string[];
  /** 'chips' = vêtements/accessoires ; 'grid' = chaussures (5 colonnes) ; 'none'. */
  layout: 'chips' | 'grid' | 'none';
}

/** Tailles affichables : variantes connues d'abord, puis jetons honnêtes du titre. */
export function presentSizes(cls: ProductClass, title: string, merchantSizes: string[]): SizePresentation {
  const fromMerchant = [...new Set((merchantSizes || []).map((size) => size.trim()).filter(Boolean))];
  if (fromMerchant.length) {
    const allNumeric = fromMerchant.every((size) => SHOE_RE.test(size));
    const allClothing = fromMerchant.every((size) => CLOTHING_SIZES.includes(size.toUpperCase()));
    return {
      options: allNumeric
        ? fromMerchant.sort((a, b) => Number(a) - Number(b))
        : allClothing
          ? fromMerchant.sort((a, b) => CLOTHING_SIZES.indexOf(a.toUpperCase()) - CLOTHING_SIZES.indexOf(b.toUpperCase()))
          : fromMerchant,
      layout: allNumeric || cls === 'shoes' ? 'grid' : 'chips',
    };
  }
  // Jetons honnêtes : « taille unique », plage « 35-53 » n'invente PAS de valeurs intermédiaires.
  if (/\btaille unique\b/i.test(title) || /\bone size\b/i.test(title) || /\bمقاس واحد\b/.test(title)) {
    return { options: ['Taille unique'], layout: 'chips' };
  }
  const clothingToken = title.toUpperCase().match(new RegExp(`\\b(${CLOTHING_SIZES.join('|')})\\b`));
  if ((cls === 'clothing' || cls === 'accessory') && clothingToken) {
    return { options: [clothingToken[1]], layout: 'chips' };
  }
  return { options: [], layout: 'none' };
}
