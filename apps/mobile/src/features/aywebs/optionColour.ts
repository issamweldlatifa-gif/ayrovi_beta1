/**
 * Couleur d'une pastille de variante — ce sont des DONNÉES du marchand, pas
 * des couleurs de l'interface.
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────────────
 * Une pastille de couleur montre normalement la PHOTO du produit dans cette
 * couleur (c'est ce que fait le web et ce que fait Zalando). Quand le marchand
 * ne publie pas d'image — ou quand l'image refuse de se charger (Amazon bloque
 * le hotlink) — l'application affichait un cadre gris avec une icône « image
 * cassée » : dix-sept fois la même icône, et l'utilisateur ne sait plus quelle
 * couleur il choisit (constaté le 27/10/2026).
 *
 * Le repli est donc la COULEUR NOMMÉE : « Black » → noir, « Royal Blue » → bleu
 * roi. Ce n'est pas de la décoration et ce n'est pas une couleur de marque :
 * c'est la traduction d'un nom publié par le marchand en une pastille lisible.
 * Ces valeurs ne peignent JAMAIS un bouton, un fond d'écran ou un texte — le
 * design system reste la seule source pour l'interface.
 *
 * `colourForOption` renvoie `null` quand le nom n'est pas une couleur connue
 * (« Default », « One Size »…) : l'appelant affiche alors une pastille neutre,
 * jamais une couleur inventée.
 */

/**
 * Noms publiés par les marchands (anglais, plus quelques français) → teinte.
 * Les clés sont normalisées : minuscules, sans accent, espaces simples.
 */
export const OPTION_COLOURS: Readonly<Record<string, string>> = {
  // Neutres
  black: '#0A0A0A',
  noir: '#0A0A0A',
  اسود: '#0A0A0A',
  white: '#FFFFFF',
  blanc: '#FFFFFF',
  ابيض: '#FFFFFF',
  ecru: '#F4EFE4',
  ivory: '#F5F0E1',
  offwhite: '#F5F5F0',
  blancasse: '#F5F5F0',
  blanccasse: '#F5F5F0',
  beige: '#D9C7A7',
  بيج: '#D9C7A7',
  cream: '#F2E7D0',
  sand: '#DCC9A8',
  brown: '#6B4A2F',
  marron: '#6B4A2F',
  بني: '#6B4A2F',
  chocolate: '#4A2E1C',
  tan: '#C89B6A',
  camel: '#C19A6B',
  grey: '#9E9E9E',
  gray: '#9E9E9E',
  gris: '#9E9E9E',
  رمادي: '#9E9E9E',
  lightgrey: '#C9C9C9',
  lightgray: '#C9C9C9',
  grisclair: '#C9C9C9',
  darkgrey: '#5A5A5A',
  darkgray: '#5A5A5A',
  grisfonce: '#5A5A5A',
  charcoal: '#3A3A3A',
  anthracite: '#3A3A3A',
  silver: '#C0C0C0',
  فضي: '#C0C0C0',
  // Bleus & Denim (SHEIN / Zalando / AliExpress)
  blue: '#1E4FD8',
  bleu: '#1E4FD8',
  ازرق: '#1E4FD8',
  royalblue: '#2A4FD7',
  navy: '#1B2440',
  navyblue: '#1B2440',
  bleumarine: '#1B2440',
  marine: '#1B2440',
  كحلي: '#1B2440',
  skyblue: '#8FC4E8',
  lightblue: '#A8CFEA',
  bleuclair: '#A8CFEA',
  ازرقفاتح: '#A8CFEA',
  jeanclair: '#8FB8DE',
  lightwash: '#8FB8DE',
  lightdenim: '#8FB8DE',
  bleujean: '#4B749F',
  jeanbleu: '#4B749F',
  jean: '#4B749F',
  denim: '#4B749F',
  mediumwash: '#4B749F',
  jeanfonce: '#263B59',
  darkwash: '#263B59',
  darkdenim: '#263B59',
  bluegrey: '#7D8CA3',
  bluegray: '#7D8CA3',
  teal: '#1F6F78',
  turquoise: '#3FC1C9',
  // Verts
  green: '#2E7D4F',
  vert: '#2E7D4F',
  اخضر: '#2E7D4F',
  vertfonce: '#1E5636',
  budgreen: '#7FBF6A',
  olive: '#6B7A3A',
  khaki: '#B5A642',
  kaki: '#8C8446',
  vertkaki: '#7A7942',
  darkkhaki: '#8C8446',
  drakkhaki: '#8C8446',
  lime: '#B6E24A',
  mint: '#BFE3D2',
  // Rouges / roses
  red: '#C62828',
  rouge: '#C62828',
  احمر: '#C62828',
  burgundy: '#6B1F2A',
  bordeaux: '#6B1F2A',
  wine: '#5A1E2A',
  pink: '#E8A0B4',
  rose: '#E8A0B4',
  roseclair: '#F4C6D3',
  وردي: '#E8A0B4',
  // Jaunes / oranges
  yellow: '#F2C230',
  jaune: '#F2C230',
  اصفر: '#F2C230',
  mustard: '#C9A227',
  orange: '#E07A2F',
  برتقالي: '#E07A2F',
  gold: '#C9A227',
  ذهبي: '#C9A227',
  // Violets
  purple: '#6A3FA0',
  violet: '#6A3FA0',
  بنفسجي: '#6A3FA0',
  lilac: '#C9B6E4',
  lilas: '#C9B6E4',
  // Marron / motifs
  camo: '#6E7350',
  camogreen: '#6E7350',
  camogrey: '#8A8C7A',
  camogray: '#8A8C7A',
  leopard: '#B0813F',
};

/** Nom de couleur normalisé : minuscules, sans accent, sans séparateur. */
export function normalizeColourName(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u064B-\u065F]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/[^a-z\u0621-\u064A]/g, '');
}

/**
 * Teinte d'une valeur de variante, ou `null` si ce n'est pas une couleur.
 *
 * On essaie le nom entier (« royal blue » → `royalblue`), puis chaque mot seul
 * en commençant par le dernier (« bud green » → `green`), parce que les
 * marchands préfixent souvent la teinte (« Dark », « Light », « Pale »).
 */
export function colourForOption(value: string): string | null {
  const whole = normalizeColourName(value);
  if (!whole) return null;
  const direct = OPTION_COLOURS[whole];
  if (direct) return direct;
  const words = String(value ?? '')
    .split(/[\s/+-]+/)
    .map(normalizeColourName)
    .filter(Boolean);
  for (const word of [...words].reverse()) {
    const found = OPTION_COLOURS[word];
    if (found) return found;
  }
  return null;
}

/** Une pastille très claire a besoin d'un liseré pour rester visible sur blanc. */
export function needsOutline(value: string): boolean {
  const colour = colourForOption(value);
  if (!colour) return true;
  const hex = colour.replace('#', '');
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  // Luminance relative (formule WCAG) : au-dessus de 0,8 la pastille « blanchit ».
  const [r, g, b] = [red, green, blue].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.72;
}
