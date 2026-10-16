/**
 * SIGNAUX DE FICHE MARCHANDE (17/10/2026) — lus, jamais devinés.
 *
 * Ces informations sont PUBLIÉES PAR LA PAGE (elles sont visibles sur la fiche
 * Zalando, relevées telles quelles sur les captures du client du 16/10/2026) :
 * le conseil de taille, la mention du mannequin, les informations de
 * fabrication, l'estimation de livraison et le compte à rebours de l'offre.
 *
 * RÈGLE : un signal n'existe QUE si le texte exact de la page le porte. Aucune
 * reconstruction à partir du titre, aucune valeur par défaut, aucune équivalence
 * inventée (c'est pour cela qu'aucune table FR ↔ US n'est produite ici).
 *
 * Les formulations sont celles des fiches FR observées ; une enseigne qui les
 * écrit autrement ne produit simplement aucun signal — champ absent, jamais faux.
 */

export interface MerchantPageSignals {
  /**
   * Conseil de taille publié, phrase complète :
   * « Nous vous recommandons de choisir une taille au-dessus de celle habituelle. »
   */
  sizeAdvice?: string;
  /** Mention du mannequin : « Notre mannequin (190 cm) porte une taille XL ». */
  modelInfo?: string;
  /** Informations de fabrication réellement présentes (pays, atelier…). */
  manufacturingInfo?: string;
  /** Estimation de livraison du marchand : « 23 octobre-29 octobre ». */
  deliveryEstimate?: string;
  /** Compte à rebours de l'offre publié par le marchand : « 1j4h22m ». */
  promoCountdown?: string;
}

const clean = (raw: string): string => raw.replace(/\s+/g, ' ').trim();

/** Garde-fou : un signal trop long n'est pas un signal, c'est un bloc de page. */
const bounded = (value: string, max = 180, min = 8): string | undefined => {
  const text = clean(value);
  if (text.length < min || text.length > max) return undefined;
  return text;
};

/** Mots qui marquent la FIN d'une information de fabrication dans une page. */
const STOP_WORDS = new Set([
  'livraison', 'retours', 'voir', 'se', 'matiere', 'matière', 'dimensions',
  'taille', 'couleur', 'composition', 'entretien', 'caracteristiques',
]);

/** Coupe une capture de pays/atelier au premier mot qui n'en fait plus partie. */
function countryWords(raw: string): string {
  const words = clean(raw).split(' ').filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    if (STOP_WORDS.has(word.toLocaleLowerCase())) break;
    kept.push(word);
    if (kept.length >= 3) break;
  }
  return kept.join(' ');
}

export function readPageSignals(rawText: string): MerchantPageSignals {
  const text = clean(rawText || '');
  if (!text) return {};
  const signals: MerchantPageSignals = {};

  /* MANNEQUIN — « Notre mannequin (190 cm) porte une taille XL ». */
  const model = /Notre mannequin\s*\(([^)]{2,24})\)\s*porte une taille\s*([^\s.,;]{1,12})/iu.exec(text);
  if (model) {
    signals.modelInfo = bounded(`Notre mannequin (${clean(model[1])}) porte une taille ${clean(model[2])}`, 90);
  }

  /* CONSEIL DE TAILLE — la phrase entière, telle que publiée. */
  const advice = /((?:Nous vous recommandons|Nous recommandons|On vous recommande)\s+[^.]{10,160}\.)/iu.exec(text);
  if (advice && /taille/i.test(advice[1])) signals.sizeAdvice = bounded(advice[1], 180);

  /* FABRICATION — uniquement si un contenu suit réellement l'étiquette. */
  const manufacturing = /(?:Fabriqu[ée]+e?\s+en|Made in|Country of origin|Pays de fabrication)\s*:?\s*([A-Za-zÀ-ÿ'’-]+(?:\s+[A-Za-zÀ-ÿ'’-]+){0,2})/iu.exec(text);
  if (manufacturing) signals.manufacturingInfo = bounded(countryWords(manufacturing[1]), 60, 2);

  /* LIVRAISON — « Livraison rapide 23 octobre-29 octobre ». */
  const delivery = /(?:Livraison\s+rapide|Livraison\s+estim[ée]+e|Livraison)[^\d\n]{0,40}?(\d{1,2}\s*[a-zéûà]+\s*(?:-|au|à)\s*\d{1,2}\s*[a-zéûà]+)/iu.exec(text);
  if (delivery) signals.deliveryEstimate = bounded(delivery[1], 50, 4);

  /* COMPTE À REBOURS DE L'OFFRE — « Se termine dans 1j4h22m ». */
  const countdown = /Se termine dans\s+([0-9]+[a-zéû]{1,3}(?:\s*[0-9]+[a-zéû]{1,3}){0,2})/iu.exec(text);
  if (countdown) signals.promoCountdown = bounded(countdown[1], 24, 2);

  return signals;
}
