/** A source-currency formatter; never converts, estimates or changes amounts. */
export function formatSourceMoney(value: number | null | undefined, currency: string | null | undefined, locale: string): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !currency || !/^[A-Z]{3}$/.test(currency)) return null;
  try { return new Intl.NumberFormat(locale === 'ar' ? 'ar-TN' : 'fr-TN', { style: 'currency', currency }).format(value); }
  catch { return `${value} ${currency}`; }
}
