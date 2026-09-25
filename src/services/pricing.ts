import { roundTnd } from '../../shared/commerceProduct';
export type CustomsCategoryStatus = 'ALLOWED' | 'WARNING' | 'RESTRICTED';

export interface CustomsCategory {
  id: string;
  label: string;
  keywords: string[];
  customsRate: number;
  tvaRate: number;
  defaultWeightKg: number;
  status: CustomsCategoryStatus;
}

export interface PricingRules {
  id: string;
  version: number;
  rateEUR: number;
  rateUSD: number;
  rateGBP: number;
  rateJPY: number;
  exchangeBufferPercent: number;
  freightPerKgTND: number;
  localDeliveryTND: number;
  commissionPercent: number;
  minimumCommissionTND: number;
  rpdPercent: number;
  rpdMinimumTND: number;
  defaultTvaRate: number;
  expressFeeTND: number;
  categories: CustomsCategory[];
  /**
   * Provenance des taux de change (audit 23/09/2026) :
   * 'seed' = valeurs d'installation, 'live' = API de change (src/services/fxRates.ts),
   * 'manual' = saisie admin — la synchronisation automatique se suspend.
   */
  fxSource?: string;
  fxUpdatedAt?: string;
  updatedAt: string;
}

/**
 * Plafond sanitaire du total commande (audit 23/09/2026) : au-delà, la commande
 * exige un accompagnement humain (négociation, acompte, assurance) plutôt qu'un
 * tunnel en ligne. 100 000 TND ≈ un panier premium excessif pour la beta.
 */
export const MAX_ORDER_TOTAL_TND = 100_000;

/**
 * Garde-fou « cargo lourd » (matrice management 23/09/2026) : au-delà de 5 kg
 * (poids SerpApi ou poids par défaut de la catégorie), le devis porte
 * requires_weight_validation=true — le fret international reste soumis à la
 * validation finale de l'équipe ops (protection contre la perte sur les colis
 * lourds). Le frontend affiche l'avertissement localisé correspondant.
 */
export const HEAVY_CARGO_KG_THRESHOLD = 5;

export interface PriceBreakdown {
  originalPrice: number;
  currency: string;
  exchangeRate: number;
  convertedPriceTND: number;
  freightTND: number;
  cifTND: number;
  dutyTND: number;
  tvaTND: number;
  rpdTND: number;
  customsFeeTND: number;
  shippingFeeTND: number;
  serviceFeeTND: number;
  expressFeeTND: number;
  discountTND: number;
  localDeliveryTND: number;
  weightKg: number;
  /** Cargo lourd (> 5 kg) : fret soumis à validation finale de l'équipe ops. */
  requiresWeightValidation: boolean;
  categoryId: string;
  categoryLabel: string;
  categoryStatus: CustomsCategoryStatus;
  restricted: boolean;
  estimateUncertain: boolean;
  totalTND: number;
  pricingVersion: number;
}

export const DEFAULT_CUSTOMS_CATEGORIES: CustomsCategory[] = [
  {
    id: 'restricted',
    label: 'Articles réglementés',
    keywords: [
      'drone', 'weapon', 'arme', 'vape', 'cigarette electronique', 'e liquide',
      'supplement', 'complément alimentaire', 'steroid', 'steroide', 'produit dopant',
    ],
    customsRate: 0,
    tvaRate: 0.19,
    defaultWeightKg: 0.5,
    status: 'RESTRICTED',
  },
  {
    id: 'tech_computers',
    label: 'Informatique',
    keywords: [
      'laptop', 'macbook', 'notebook', 'ultrabook', 'pc parts', 'cpu', 'gpu',
      'ordinateur', 'ordinateur portable', 'pc portable', 'chromebook', 'netbook',
      'imac', 'mac mini', 'station de travail', 'tour pc', 'boitier pc',
      'carte mere', 'carte graphique', 'processeur', 'disque dur', 'ssd',
      'barrette memoire', 'memoire vive', 'ram', 'ecran pc', 'moniteur', 'unité centrale',
    ],
    customsRate: 0,
    tvaRate: 0.19,
    defaultWeightKg: 2.2,
    status: 'ALLOWED',
  },
  {
    id: 'electronics_gadgets',
    label: 'Électronique',
    keywords: [
      'headphones', 'casque', 'smartwatch', 'earbuds', 'airpods', 'charger', 'chargeur',
      'phone', 'iphone', 'samsung', 'tablet', 'téléphone', 'smartphone', 'tablette', 'ipad',
      'ecouteurs', 'ecouteur', 'enceinte', 'haut parleur', 'batterie externe', 'powerbank',
      'cable', 'clavier', 'souris', 'ecran', 'television', 'appareil photo', 'camera', 'caméra',
      'console', 'playstation', 'xbox', 'nintendo', 'manette', 'montre connectée',
      'coque', 'etui', 'verre trempe',
    ],
    customsRate: 0.15,
    tvaRate: 0.19,
    defaultWeightKg: 0.35,
    status: 'ALLOWED',
  },
  {
    id: 'fashion_shoes',
    label: 'Chaussures',
    keywords: [
      'sneakers', 'sneaker', 'boots', 'boot', 'shoes', 'shoe', 'chaussures', 'chaussure',
      'baskets', 'basket', 'sandale', 'sandales', 'bottine', 'bottines', 'mocassin', 'mocassins',
      'escarpin', 'escarpins', 'claquette', 'claquettes', 'talon', 'loafer', 'loafers', 'derby',
      'chausson', 'ballerine', 'ballerines', 'flip flops',
    ],
    customsRate: 0.3,
    tvaRate: 0.19,
    defaultWeightKg: 1.2,
    status: 'ALLOWED',
  },
  {
    id: 'beauty_fragrance',
    label: 'Beauté / parfum',
    keywords: [
      'perfume', 'parfum', 'cosmetics', 'cosmetic', 'makeup', 'maquillage',
      'eau de parfum', 'eau de toilette', 'cologne', 'mascara', 'rouge à lèvres',
      'fond de teint', 'vernis', 'serum', 'crème', 'soin', 'shampoing', 'déodorant',
      'gel douche',
    ],
    customsRate: 0.2,
    tvaRate: 0.19,
    defaultWeightKg: 0.4,
    status: 'WARNING',
  },
  {
    id: 'fashion_clothing',
    label: 'Habillement',
    keywords: [
      't-shirt', 'tshirt', 'hoodie', 'jeans', 'jacket', 'dress', 'robe', 'ensemble',
      'matching set', 'chemise', 'pantalon', 'pull', 'sweat', 'sweatshirt', 'veste',
      'blouson', 'manteau', 'doudoune', 'parka', 'trench', 'jean', 'short', 'shorts',
      'jogging', 'survêtement', 'combinaison', 'jupe', 'top', 'débardeur', 'caraco',
      'pyjama', 'chaussettes', 'sous-vêtement', 'lingerie', 'bikini', 'maillot de bain',
      'blouse', 'gilet', 'cardigan', 'costume', 'ceinture', 'casquette', 'bonnet',
      'écharpe', 'foulard', 'gants', 'sac à main', 'lunettes', 'lunettes de soleil',
      'shirt', 'pants', 'trousers', 'coat', 'sweater', 'pullover', 'skirt', 'jumpsuit',
      'romper', 'bodysuit', 'swimsuit', 'underwear', 'belt', 'handbag', 'sunglasses',
      'scarf', 'gloves',
    ],
    customsRate: 0.3,
    tvaRate: 0.19,
    defaultWeightKg: 0.5,
    status: 'ALLOWED',
  },
  {
    // Matrice management 23/09/2026 — décoration / art de la table / textile maison
    // récupérés via Lens (droit 25 %, poids par défaut 1,5 kg).
    id: 'home_decor_living',
    label: 'Décoration & maison',
    keywords: [
      'tapis', 'rideau', 'coussin', 'housse de couette', 'drap de lit', 'couverture',
      'plaid', 'miroir', 'cadre photo', 'tableau décoratif', 'vase', 'bougie parfumée',
      'lampe de table', 'lustre', 'suspension lumineuse', 'veilleuse', 'ruban led',
      'étagère', 'organisateur de rangement', 'boîte de rangement', 'horloge murale',
      'figurine décorative', 'plantes artificielles', 'assiettes', 'verres', 'couverts',
      'tasse', 'mug', 'poêle', 'casserole', 'ustensiles de cuisine',
      'bouteille isotherme', 'gourde',
    ],
    customsRate: 0.25,
    tvaRate: 0.19,
    defaultWeightKg: 1.5,
    status: 'ALLOWED',
  },
  {
    // Matrice management 23/09/2026 — catégorie de repli OCREX (capture de panier
    // Shein/Temu) : reçoit le prix brut extrait par la Vision API, sans les
    // remises flash expirées. Produit identifié => sa catégorie réelle gagne
    // (correspondance la plus longue) ; le repli ne joue que sur un panier mixte.
    id: 'mixed_chinese_market',
    label: 'Panier mixte (Shein / Temu)',
    keywords: ['shein', 'temu', 'panier shein', 'panier temu', 'articles chinois', 'mixed_cart'],
    customsRate: 0.3,
    tvaRate: 0.19,
    defaultWeightKg: 0.25,
    status: 'ALLOWED',
  },
];

export function millimes(value: number): number {
  return roundTnd(value);
}

export function getExchangeRate(rules: PricingRules, currency: string): number | null {
  const normalized = currency.trim().toUpperCase();
  const rates: Record<string, number> = {
    TND: 1,
    EUR: rules.rateEUR,
    USD: rules.rateUSD,
    GBP: rules.rateGBP,
    JPY: rules.rateJPY,
  };
  return Number.isFinite(rates[normalized]) && rates[normalized] > 0 ? rates[normalized] : null;
}

export function getEffectiveExchangeRate(rules: PricingRules, currency: string): number | null {
  const base = getExchangeRate(rules, currency);
  if (base == null) return null;
  if (currency.trim().toUpperCase() === 'TND') return 1;
  const buffer = Math.max(0, Number(rules.exchangeBufferPercent) || 0) / 100;
  // 6 décimales, pas 3 : un taux est un MULTIPLICATEUR, pas un montant en millimes.
  // Arrondir au millime écrasait le JPY (0.0265×1.03 → 0.027 au lieu de 0.027295,
  // soit −1 % sur chaque conversion yen — audit 23/09/2026).
  return Math.round(base * (1 + buffer) * 1e6) / 1e6;
}

function normalizeMatchText(value: string): string {
  // NFKD + SUPPRESSION des diacritiques (et non remplacement par un espace) :
  // « téléphone » et « telephone » doivent produire le même token, sinon la
  // matrice douanière — pilotée sur des titres français (LENS_COUNTRY=fr) —
  // rate la moitié des intitulés réels (audit 23/09/2026).
  return value.toLocaleLowerCase('fr').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * « Broad matching » à la française (matrice management 23/09/2026) :
 * singulier/pluriel indifférent — « rideaux » doit matcher « rideau »,
 * « suppléments » doit matcher « supplement ». On singularise les tokens
 * (finale -s / -x) SANS tomber dans le substring naïf : « arme » ne doit
 * jamais matcher « pharmacie » (faux positif RESTRICTED = vente perdue),
 * contrairement à un includes() brut.
 */
function singularizeFrToken(value: string): string {
  return value.replace(/[sx]$/, '');
}

function broadMatchHaystack(value: string): string {
  return ` ${normalizeMatchText(value).split(' ').map(singularizeFrToken).filter(Boolean).join(' ')} `;
}

/** Catégorie de repli OCREX (matrice 23/09/2026) : panier mixte Shein/Temu. */
const OCREX_FALLBACK_CATEGORY_ID = 'mixed_chinese_market';

export function classifyCustomsCategory(
  text: string,
  categories: CustomsCategory[] = DEFAULT_CUSTOMS_CATEGORIES,
): { category: CustomsCategory; uncertain: boolean } {
  const haystack = broadMatchHaystack(text);
  const pool = categories.length ? categories : DEFAULT_CUSTOMS_CATEGORIES;
  // Les mots-clés subissent la MÊME singularisation que le haystack, mot à mot.
  const phraseTokens = (keyword: string) => normalizeMatchText(keyword).split(' ').map(singularizeFrToken).filter(Boolean).join(' ');
  const restricted = pool.find((item) => item.status === 'RESTRICTED' && item.keywords.some((keyword) => haystack.includes(` ${phraseTokens(keyword)} `)));
  if (restricted) return { category: restricted, uncertain: false };
  // Le repli OCREX ne joue QUE si aucun produit n'est identifié : « robe boutique
  // shein » reste Habillement ; « panier shein » (rien d'identifié) → panier mixte.
  const ocrexFallback = pool.find((item) => item.id === OCREX_FALLBACK_CATEGORY_ID && item.status !== 'RESTRICTED');
  const matchCategory = (category: CustomsCategory): { category: CustomsCategory; length: number } | null => {
    let bestInCategory: { category: CustomsCategory; length: number } | null = null;
    for (const keyword of category.keywords) {
      const token = phraseTokens(keyword);
      if (token.length < 3 || !haystack.includes(` ${token} `)) continue;
      if (!bestInCategory || token.length > bestInCategory.length) bestInCategory = { category, length: token.length };
    }
    return bestInCategory;
  };
  let best: { category: CustomsCategory; length: number } | null = null;
  for (const category of pool) {
    if (category.status === 'RESTRICTED' || category.id === OCREX_FALLBACK_CATEGORY_ID) continue;
    const match = matchCategory(category);
    if (match && (!best || match.length > best.length)) best = match;
  }
  if (!best && ocrexFallback) best = matchCategory(ocrexFallback);
  const fallback = pool.find((item) => item.id === 'fashion_clothing') || pool.find((item) => item.status === 'ALLOWED') || pool[0];
  if (!best) return { category: fallback, uncertain: true };
  return { category: best.category, uncertain: false };
}

export function calculatePrice(
  rules: PricingRules,
  originalPrice: number,
  currency: string,
  options: {
    express?: boolean;
    discountTND?: number;
    quantity?: number;
    categoryId?: string;
    weightKg?: number;
    includeLocalDelivery?: boolean;
    title?: string;
  } = {},
): PriceBreakdown | null {
  const rate = getEffectiveExchangeRate(rules, currency);
  const quantity = options.quantity ?? 1;
  if (!rate || !Number.isFinite(originalPrice) || originalPrice <= 0 || !Number.isInteger(quantity) || quantity < 1) {
    return null;
  }

  const categories = rules.categories?.length ? rules.categories : DEFAULT_CUSTOMS_CATEGORIES;
  const fromId = options.categoryId ? categories.find((item) => item.id === options.categoryId) : undefined;
  const classified = fromId
    ? { category: fromId, uncertain: false }
    : classifyCustomsCategory(options.title || '', categories);
  const category = classified.category;
  const unitWeight = Number.isFinite(Number(options.weightKg)) && Number(options.weightKg) > 0
    ? Number(options.weightKg)
    : category.defaultWeightKg;
  const weightKg = millimes(unitWeight * quantity);
  const includeLocal = options.includeLocalDelivery !== false;
  const localDeliveryTND = includeLocal ? millimes(rules.localDeliveryTND) : 0;

  const empty = (total: number): PriceBreakdown => ({
    originalPrice: millimes(originalPrice * quantity),
    currency: currency.trim().toUpperCase(),
    exchangeRate: rate,
    convertedPriceTND: 0,
    freightTND: 0,
    cifTND: 0,
    dutyTND: 0,
    tvaTND: 0,
    rpdTND: 0,
    customsFeeTND: 0,
    shippingFeeTND: localDeliveryTND,
    serviceFeeTND: 0,
    expressFeeTND: 0,
    discountTND: 0,
    localDeliveryTND,
    weightKg,
    requiresWeightValidation: weightKg > HEAVY_CARGO_KG_THRESHOLD,
    categoryId: category.id,
    categoryLabel: category.label,
    categoryStatus: category.status,
    restricted: category.status === 'RESTRICTED',
    estimateUncertain: classified.uncertain,
    totalTND: total,
    pricingVersion: rules.version,
  });

  if (category.status === 'RESTRICTED') return empty(0);

  const convertedPriceTND = millimes(originalPrice * rate * quantity);
  const freightTND = millimes(weightKg * rules.freightPerKgTND);
  const cifTND = millimes(convertedPriceTND + freightTND);
  const dutyTND = millimes(cifTND * category.customsRate);
  const tvaRate = Number.isFinite(category.tvaRate) ? category.tvaRate : rules.defaultTvaRate;
  const tvaTND = millimes((cifTND + dutyTND) * tvaRate);
  const rpdRaw = millimes((dutyTND + tvaTND) * (rules.rpdPercent / 100));
  const rpdTND = millimes(Math.max(rules.rpdMinimumTND, rpdRaw));
  const commissionRaw = millimes(convertedPriceTND * (rules.commissionPercent / 100));
  const serviceFeeTND = millimes(Math.max(rules.minimumCommissionTND, commissionRaw));
  const expressFeeTND = options.express ? millimes(rules.expressFeeTND) : 0;
  const discountTND = millimes(Math.max(0, options.discountTND ?? 0));
  const customsFeeTND = millimes(dutyTND + tvaTND + rpdTND);
  const shippingFeeTND = millimes(freightTND + localDeliveryTND);
  const totalTND = millimes(Math.max(
    0,
    cifTND + customsFeeTND + serviceFeeTND + localDeliveryTND + expressFeeTND - discountTND,
  ));

  return {
    originalPrice: millimes(originalPrice * quantity),
    currency: currency.trim().toUpperCase(),
    exchangeRate: rate,
    convertedPriceTND,
    freightTND,
    cifTND,
    dutyTND,
    tvaTND,
    rpdTND,
    customsFeeTND,
    shippingFeeTND,
    serviceFeeTND,
    expressFeeTND,
    discountTND,
    localDeliveryTND,
    weightKg,
    requiresWeightValidation: weightKg > HEAVY_CARGO_KG_THRESHOLD,
    categoryId: category.id,
    categoryLabel: category.label,
    categoryStatus: category.status,
    restricted: false,
    estimateUncertain: classified.uncertain,
    totalTND,
    pricingVersion: rules.version,
  };
}

export function orderLocalDelivery(rules: PricingRules): number {
  return millimes(rules.localDeliveryTND);
}
