/**
 * Dates relatives de la feuille de commentaires — référence vidéo du 10/11 :
 * « il y a 1 semaine », « il y a 2 mois », « il y a 3 jours ».
 *
 * ── Pourquoi PAS `Intl.RelativeTimeFormat` (correctif 11/11/2026) ──────────
 * Hermes, le moteur JavaScript de l'application Android, n'implémente PAS
 * `Intl.RelativeTimeFormat` (ni `PluralRules`, `ListFormat`, `Segmenter`…) :
 * `Intl.RelativeTimeFormat` y vaut `undefined`, et `new undefined(...)` lève
 * « undefined cannot be used as a constructor ». Chaque ligne de commentaire
 * appelait cette fonction : dès qu'un premier commentaire apparaissait dans la
 * feuille du Reel (typiquement celui qu'on venait d'écrire), tout l'écran
 * tombait sur « حدث خطأ في العرض ». Node, lui, a l'API complète — les tests ne
 * voyaient rien.
 *
 * Les libellés sont donc écrits ici, pour les deux langues de l'application,
 * avec les vraies règles de nombre de l'arabe (singulier, duel, pluriel 3–10,
 * singulier accusatif à partir de 11). Résultat identique sur tous les moteurs.
 */
type Unit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute';

const STEPS: Array<{ limit: number; unit: Unit }> = [
  { limit: 1000 * 60 * 60 * 24 * 365, unit: 'year' },
  { limit: 1000 * 60 * 60 * 24 * 30, unit: 'month' },
  { limit: 1000 * 60 * 60 * 24 * 7, unit: 'week' },
  { limit: 1000 * 60 * 60 * 24, unit: 'day' },
  { limit: 1000 * 60 * 60, unit: 'hour' },
  { limit: 1000 * 60, unit: 'minute' },
];

/** Français : [singulier, pluriel]. « mois » est invariable. */
const FR: Record<Unit, [string, string]> = {
  year: ['an', 'ans'],
  month: ['mois', 'mois'],
  week: ['semaine', 'semaines'],
  day: ['jour', 'jours'],
  hour: ['heure', 'heures'],
  minute: ['minute', 'minutes'],
};

/** Arabe : [1, 2 (duel), 3–10 (pluriel), 11+ (singulier accusatif)]. */
const AR: Record<Unit, [string, string, string, string]> = {
  year: ['سنة', 'سنتين', 'سنوات', 'سنة'],
  month: ['شهر', 'شهرين', 'أشهر', 'شهرًا'],
  week: ['أسبوع', 'أسبوعين', 'أسابيع', 'أسبوعًا'],
  day: ['يوم', 'يومين', 'أيام', 'يومًا'],
  hour: ['ساعة', 'ساعتين', 'ساعات', 'ساعة'],
  minute: ['دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'],
};

function arabicLabel(count: number, unit: Unit): string {
  const [one, two, few, many] = AR[unit];
  if (count === 1) return `منذ ${one}`;
  if (count === 2) return `منذ ${two}`;
  if (count >= 3 && count <= 10) return `منذ ${count} ${few}`;
  return `منذ ${count} ${many}`;
}

function frenchLabel(count: number, unit: Unit): string {
  const [one, many] = FR[unit];
  return `il y a ${count} ${count > 1 ? many : one}`;
}

export function relativeTimeLabel(iso: string, locale: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const ar = String(locale || '').toLowerCase().startsWith('ar');
  // Une date « dans le futur » n'est qu'un décalage d'horloge entre le
  // téléphone et le serveur : un commentaire ne peut pas venir de demain.
  const elapsed = Math.max(0, now - then);
  for (const { limit, unit } of STEPS) {
    if (elapsed >= limit) {
      const count = Math.max(1, Math.round(elapsed / limit));
      return ar ? arabicLabel(count, unit) : frenchLabel(count, unit);
    }
  }
  return ar ? 'الآن' : 'à l’instant';
}
