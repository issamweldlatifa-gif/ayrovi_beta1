/**
 * FAITS D'UNE PAGE MARCHANDE — ce que la page du lien dit, et rien d'autre.
 *
 * Entrée : la page produit déjà lue et analysée (JSON-LD, JSON embarqué, DOM).
 * Sortie : des faits typés — prix, devise, photos, disponibilité, couleurs et
 * OPTIONS (pointure, taille, contenance, stockage, type) avec leur stock publié.
 *
 * Trois règles, héritées du reste du projet :
 *  • on RECOPIE ce que le marchand publie : aucune taille déduite d'un titre,
 *    aucun stock supposé à partir d'un silence (`unknown` reste `unknown`) ;
 *  • une page sans prix lisible ne fait pas une fiche : pas de faits, pas de carte ;
 *  • une option que le marchand déclare explicitement indisponible reste VISIBLE
 *    (barrée côté client) — la cacher ferait croire qu'elle n'a jamais existé.
 */
import { allowsMerchantVariantChoice } from '../../../shared/variantPolicy';
import type { ParsedProductPage } from '../../scraper/productPageParser';
import type { LensLink } from './linkSource';

export type FactAvailability = 'available' | 'unavailable' | 'unknown';
export type PageAvailability = 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';

/** Nature de l'option principale — c'est elle qui choisit les mots et la grille côté client. */
export type OptionKind = 'shoes' | 'clothing' | 'capacity' | 'storage' | 'type' | 'size';

export interface FactVariant {
  /** Valeur publiée telle quelle : « 42 », « M », « 50 ml », « 256 GB », « Eau de parfum ». */
  value: string;
  color: string | null;
  availability: FactAvailability;
  /** Identifiant de variante chez le marchand, quand il le publie. */
  id: string | null;
  /** Prix propre à la variante, UNIQUEMENT s'il diffère et que le marchand le publie. */
  price: number | null;
}

export interface ProductFacts {
  url: string;
  merchant: string;
  title: string;
  brand: string | null;
  description: string | null;
  price: number;
  currency: string;
  /** D'où le prix a été lu sur la page (json_ld, meta, dom…) — traçabilité. */
  priceSource: ParsedProductPage['priceSource'];
  images: string[];
  colorImages: Record<string, string[]>;
  availability: PageAvailability;
  colors: string[];
  /** Valeurs de l'option principale, dans l'ordre publié. */
  sizes: string[];
  optionLabel: string | null;
  optionKind: OptionKind | null;
  variants: FactVariant[];
  /** Horodatage (ms) de la lecture de la page. */
  at: number;
}

const MAX_IMAGES = 12;
const MAX_VALUES = 40;

const CLOTHING = /^(?:XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|[2-5]XL|ONE SIZE|TU|TAILLE UNIQUE)$/i;
const SHOE = /^(?:EU|US|UK|FR)?\s?\d{2}(?:[.,][05])?(?:\s?(?:EU|US|UK|FR))?$/i;
const STORAGE = /^\d+(?:[.,]\d+)?\s?(?:gb|go|tb|to|mb|mo)\b/i;
const CAPACITY = /^\d+(?:[.,]\d+)?\s?(?:ml|cl|l|g|kg|oz|fl\.?\s?oz)\b/i;

function clean(value: unknown, max = 60): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function uniqueList(values: Array<string | null | undefined>, limit: number, max = 60): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = clean(raw, max);
    const key = value.toLocaleLowerCase('fr');
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

/** La nature de l'option se lit sur ses VALEURS publiées, puis sur le nom que le marchand lui donne. */
export function classifyOption(values: string[], label: string | null): OptionKind | null {
  if (!values.length) return null;
  if (values.every((value) => STORAGE.test(value))) return 'storage';
  if (values.every((value) => CAPACITY.test(value))) return 'capacity';
  if (values.every((value) => CLOTHING.test(value))) return 'clothing';
  if (values.every((value) => SHOE.test(value))) return 'shoes';
  if (label && /stockage|storage|m[ée]moire|memory/i.test(label)) return 'storage';
  if (label && /volume|contenance|capacit|capacity|format|poids|weight/i.test(label)) return 'capacity';
  if (label && /type|style|mod[èe]le|model|version|variante?|finition|finish|parfum|scent|saveur|flavou?r|teinte|shade/i.test(label)) return 'type';
  return 'size';
}

const DEFAULT_LABEL: Record<OptionKind, string> = {
  shoes: 'Pointure', clothing: 'Taille', capacity: 'Contenance', storage: 'Stockage', type: 'Type', size: 'Option',
};

export function factsFromPage(link: LensLink, page: ParsedProductPage | null, now: number): ProductFacts | null {
  if (!page) return null;
  const title = clean(page.title, 200);
  const price = Number(page.price);
  const currency = clean(page.currency, 3).toUpperCase();
  // Pas de prix lisible, pas de fiche : un prix « à confirmer » n'est pas un fait.
  if (!title || !Number.isFinite(price) || price <= 0 || !/^[A-Z]{3}$/.test(currency)) return null;

  const details = (Array.isArray(page.variants?.details) ? page.variants!.details! : [])
    .filter((detail) => allowsMerchantVariantChoice(detail));

  const variants: FactVariant[] = [];
  const seen = new Set<string>();
  const push = (variant: FactVariant): void => {
    const key = `${variant.value.toLocaleLowerCase('fr')}|${(variant.color || '').toLocaleLowerCase('fr')}`;
    if (!variant.value || seen.has(key) || variants.length >= 120) return;
    seen.add(key);
    variants.push(variant);
  };
  for (const detail of details) {
    const size = clean(detail.size, 40);
    const color = clean(detail.color, 40) || null;
    const value = size || color || '';
    if (!value) continue;
    const variantPrice = Number(detail.price);
    push({
      value,
      // Une variante « couleur seule » porte sa couleur comme valeur ET comme couleur :
      // c'est ce qui permet au gardien de commande de la retrouver par couleur.
      color: size ? color : value,
      // `stock` = le drapeau PUBLIÉ ; null (silence) reste « unknown ».
      availability: detail.stock === true ? 'available' : detail.stock === false ? 'unavailable' : 'unknown',
      id: clean(detail.id, 120) || null,
      price: Number.isFinite(variantPrice) && variantPrice > 0 && Math.abs(variantPrice - price) > 0.0001 ? variantPrice : null,
    });
  }
  // Valeur publiée sans détail de variante : elle entre au contrat, stock « unknown ».
  const sizes = uniqueList([...details.map((detail) => detail.size), ...(page.variants?.sizes || [])], MAX_VALUES, 40);
  for (const size of sizes) push({ value: size, color: null, availability: 'unknown', id: null, price: null });

  const colors = uniqueList([...details.map((detail) => detail.color), ...(page.variants?.colors || [])], 20, 40);
  const optionKind = classifyOption(sizes, page.variants?.optionLabel ? clean(page.variants.optionLabel, 40) : null);
  const optionLabel = sizes.length
    ? (clean(page.variants?.optionLabel, 40) || (optionKind ? DEFAULT_LABEL[optionKind] : null))
    : null;

  const colorImages: Record<string, string[]> = {};
  for (const [name, urls] of Object.entries(page.colorImages || {})) {
    const list = uniqueList(urls, MAX_IMAGES, 2048).filter((url) => /^https?:\/\//i.test(url));
    if (list.length) colorImages[name.toLocaleLowerCase()] = list;
  }

  return {
    url: link.url,
    merchant: link.merchant,
    title,
    brand: clean(page.brand, 80) || null,
    description: clean(page.description, 600) || null,
    price,
    currency,
    priceSource: page.priceSource,
    images: uniqueList(page.images, MAX_IMAGES, 2048).filter((url) => /^https?:\/\//i.test(url)),
    colorImages,
    availability: page.availability || 'unknown',
    colors,
    sizes,
    optionLabel,
    optionKind,
    variants,
    at: now,
  };
}

/** Notre vocabulaire d'affichage → celui du contrat de commande. `limited` reste positif. */
export function toContractAvailability(availability: PageAvailability): FactAvailability {
  if (availability === 'in_stock' || availability === 'limited') return 'available';
  if (availability === 'out_of_stock') return 'unavailable';
  return 'unknown';
}
