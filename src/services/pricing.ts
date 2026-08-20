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
  /** Legacy aliases kept on snapshots / public config. */
  customsFeePercent: number;
  shippingFeeTND: number;
  serviceFeePercent: number;
  minimumServiceFeeTND: number;
  updatedAt: string;
}

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
    keywords: ['drone', 'weapon', 'arme', 'vape', 'cigarette electronique', 'supplement', 'complément alimentaire', 'steroid'],
    customsRate: 0,
    tvaRate: 0.19,
    defaultWeightKg: 0.5,
    status: 'RESTRICTED',
  },
  {
    id: 'tech_computers',
    label: 'Informatique',
    keywords: ['laptop', 'macbook', 'notebook', 'ultrabook', 'pc parts', 'cpu', 'gpu', 'ordinateur portable'],
    customsRate: 0,
    tvaRate: 0.19,
    defaultWeightKg: 2.2,
    status: 'ALLOWED',
  },
  {
    id: 'electronics_gadgets',
    label: 'Électronique',
    keywords: ['headphones', 'casque', 'smartwatch', 'earbuds', 'airpods', 'charger', 'chargeur', 'phone', 'iphone', 'samsung', 'tablet'],
    customsRate: 0.15,
    tvaRate: 0.19,
    defaultWeightKg: 0.35,
    status: 'ALLOWED',
  },
  {
    id: 'fashion_shoes',
    label: 'Chaussures',
    keywords: ['sneakers', 'sneaker', 'boots', 'boot', 'shoes', 'shoe', 'chaussures', 'chaussure', 'baskets', 'basket'],
    customsRate: 0.3,
    tvaRate: 0.19,
    defaultWeightKg: 1.2,
    status: 'ALLOWED',
  },
  {
    id: 'beauty_fragrance',
    label: 'Beauté / parfum',
    keywords: ['perfume', 'parfum', 'cosmetics', 'cosmetic', 'makeup', 'maquillage'],
    customsRate: 0.2,
    tvaRate: 0.19,
    defaultWeightKg: 0.4,
    status: 'WARNING',
  },
  {
    id: 'fashion_clothing',
    label: 'Habillement',
    keywords: ['t-shirt', 'tshirt', 'hoodie', 'jeans', 'jacket', 'dress', 'robe', 'ensemble', 'matching set', 'chemise', 'pantalon'],
    customsRate: 0.3,
    tvaRate: 0.19,
    defaultWeightKg: 0.5,
    status: 'ALLOWED',
  },
];

export function millimes(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000 + Number.EPSILON) / 1000;
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
  return millimes(base * (1 + buffer));
}

function normalizeMatchText(value: string): string {
  return value.toLocaleLowerCase('fr').normalize('NFKD').replace(/[\u0300-\u036f]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function classifyCustomsCategory(
  text: string,
  categories: CustomsCategory[] = DEFAULT_CUSTOMS_CATEGORIES,
): { category: CustomsCategory; uncertain: boolean } {
  const haystack = ` ${normalizeMatchText(text)} `;
  const pool = categories.length ? categories : DEFAULT_CUSTOMS_CATEGORIES;
  const restricted = pool.find((item) => item.status === 'RESTRICTED' && item.keywords.some((keyword) => haystack.includes(` ${normalizeMatchText(keyword)} `)));
  if (restricted) return { category: restricted, uncertain: false };
  let best: { category: CustomsCategory; length: number } | null = null;
  for (const category of pool) {
    if (category.status === 'RESTRICTED') continue;
    for (const keyword of category.keywords) {
      const token = normalizeMatchText(keyword);
      if (token.length < 3 || !haystack.includes(` ${token} `)) continue;
      if (!best || token.length > best.length) best = { category, length: token.length };
    }
  }
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
