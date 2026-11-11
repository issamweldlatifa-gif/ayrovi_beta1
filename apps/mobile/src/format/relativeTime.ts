/**
 * Dates relatives de la feuille de commentaires — référence vidéo du 10/11 :
 * « il y a 1 semaine », « il y a 2 mois », « il y a 3 jours ». Les libellés
 * proviennent d'Intl.RelativeTimeFormat (aucune chaîne traduite à maintenir) ;
 * `numeric: 'always'` donne bien « il y a 1 semaine » (et non « la semaine
 * dernière »), fidèle à la référence. Sous la minute : « à l'instant ».
 */
export function relativeTimeLabel(iso: string, locale: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const diff = then - now;
  const steps: Array<{ limit: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { limit: 1000 * 60 * 60 * 24 * 365, unit: 'year' },
    { limit: 1000 * 60 * 60 * 24 * 30, unit: 'month' },
    { limit: 1000 * 60 * 60 * 24 * 7, unit: 'week' },
    { limit: 1000 * 60 * 60 * 24, unit: 'day' },
    { limit: 1000 * 60 * 60, unit: 'hour' },
    { limit: 1000 * 60, unit: 'minute' },
  ];
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'long' });
  for (const { limit, unit } of steps) {
    if (Math.abs(diff) >= limit) return formatter.format(Math.round(diff / limit), unit);
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'long' }).format(0, 'second');
}
