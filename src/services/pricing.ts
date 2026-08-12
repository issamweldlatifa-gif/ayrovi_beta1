export interface PricingRules {
  id: string;
  version: number;
  rateEUR: number;
  rateUSD: number;
  rateGBP: number;
  rateJPY: number;
  customsFeePercent: number;
  shippingFeeTND: number;
  serviceFeePercent: number;
  minimumServiceFeeTND: number;
  expressFeeTND: number;
  updatedAt: string;
}

export interface PriceBreakdown {
  originalPrice: number;
  currency: string;
  exchangeRate: number;
  convertedPriceTND: number;
  customsFeeTND: number;
  shippingFeeTND: number;
  serviceFeeTND: number;
  expressFeeTND: number;
  discountTND: number;
  totalTND: number;
  pricingVersion: number;
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

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

export function calculatePrice(
  rules: PricingRules,
  originalPrice: number,
  currency: string,
  options: { express?: boolean; discountTND?: number; quantity?: number } = {},
): PriceBreakdown | null {
  const rate = getExchangeRate(rules, currency);
  const quantity = options.quantity ?? 1;
  if (!rate || !Number.isFinite(originalPrice) || originalPrice <= 0 || !Number.isInteger(quantity) || quantity < 1) {
    return null;
  }

  const convertedPriceTND = roundMoney(originalPrice * rate * quantity);
  const customsFeeTND = roundMoney(convertedPriceTND * (rules.customsFeePercent / 100));
  const serviceFeeTND = roundMoney(Math.max(
    rules.minimumServiceFeeTND,
    convertedPriceTND * (rules.serviceFeePercent / 100),
  ));
  const shippingFeeTND = roundMoney(rules.shippingFeeTND);
  const expressFeeTND = options.express ? roundMoney(rules.expressFeeTND) : 0;
  const discountTND = roundMoney(Math.max(0, options.discountTND ?? 0));
  const totalTND = roundMoney(Math.max(
    0,
    convertedPriceTND + customsFeeTND + shippingFeeTND + serviceFeeTND + expressFeeTND - discountTND,
  ));

  return {
    originalPrice: roundMoney(originalPrice * quantity),
    currency: currency.trim().toUpperCase(),
    exchangeRate: rate,
    convertedPriceTND,
    customsFeeTND,
    shippingFeeTND,
    serviceFeeTND,
    expressFeeTND,
    discountTND,
    totalTND,
    pricingVersion: rules.version,
  };
}
