/** Display formatting only: never changes persisted counts or invents engagement. */
export function publicationCount(value: number, locale: string): string {
  const count = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-TN' : 'fr-FR', {
      notation: count >= 1000 ? 'compact' : 'standard',
      maximumFractionDigits: count >= 1000 ? 1 : 0,
    })
      .format(count)
      .replace(/k/g, 'K');
  } catch {
    return String(count);
  }
}
