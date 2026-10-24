/**
 * GRANDE FICHE — une seule réponse porte tout ce que l'écran affiche (24/10/2026).
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 * La maquette `docs/design/bigcard/index.html` montre une grande fiche qui a
 * besoin, au même moment, de : la galerie d'images, les choix possibles
 * (taille, couleur…), ce qui reste disponible pour chaque choix, et l'état du
 * stock. Aujourd'hui l'écran produit ne reçoit que `image` + `additionalImages` +
 * un `stockStatus` global : il ne peut donc ni afficher une galerie complète, ni
 * griser une taille épuisée, ni dire « il en reste 3 ».
 *
 * ── La règle de ce fichier ──────────────────────────────────────────────────
 * Tout est calculé **ici**, une fois, à partir de trois sources déjà en base
 * (`products`, `catalogue_variants`, `inventory_stock_items`). Le client ne
 * recalcule rien : il lit `available`, `stock` et `purchasable` tels quels. Un
 * prix ou un stock ne se déduit jamais dans l'écran.
 *
 * ── Ce qu'on refuse d'inventer ──────────────────────────────────────────────
 *  • pas de ligne de stock pour une variante ⇒ `stock: null` (« on ne sait pas »),
 *    **jamais 0** : 0 voudrait dire « épuisé », et c'est une affirmation ;
 *  • pas de variante déclarée ⇒ `variants: []` et `dimensions: []` : la fiche
 *    n'affiche aucun sélecteur, au lieu d'un sélecteur vide ;
 *  • pas de prix publié, produit inactif ou épuisé ⇒ `purchasable: false` ;
 *  • une image vide ou dupliquée ne rentre pas dans la galerie.
 *
 * Fonctions PURES : aucun accès base. La route `/api/public/products/:id` lit les
 * trois tables et appelle `buildProductSheet` ; les tests font de même sans base.
 */

/** État de stock publié par la fiche (miroir de `products.stock_status`). */
export type SheetStockStatus = 'IN_STOCK' | 'LOW' | 'OUT_OF_STOCK' | 'UNKNOWN';

/** Au-delà, ce n'est plus une galerie : c'est un dossier photo. */
export const MAX_SHEET_IMAGES = 12;

/** Sous ce reste, on prévient avant l'épuisement (la fiche affiche « plus que n »). */
export const LOW_STOCK_THRESHOLD = 3;

export interface SheetProductInput {
  id: string;
  image?: string | null;
  additionalImages?: unknown;
  status?: string | null;
  final_price?: number | string | null;
  stock_status?: string | null;
}

export interface SheetVariantInput {
  id: string;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  status?: string | null;
  sort_order?: number | null;
}

/** Ligne de `inventory_stock_items` (déjà filtrée sur `ACTIVE` par l'appelant). */
export interface SheetStockInput {
  variant_id?: string | null;
  quantity?: number | string | null;
  reorder_point?: number | string | null;
}

export interface SheetVariant {
  id: string;
  sku: string;
  size: string;
  color: string;
  /** Le client peut-il commander CETTE variante ? (actif + stock connu non nul) */
  available: boolean;
  /** Quantité connue, ou `null` quand aucune ligne de stock n'existe. */
  stock: number | null;
  /** Pourquoi la variante est grisée — `null` quand elle est disponible. */
  reason: 'INACTIVE' | 'OUT_OF_STOCK' | null;
}

export interface SheetDimensionValue {
  value: string;
  /** Au moins une variante portant cette valeur est commandable. */
  available: boolean;
  /** Somme connue, ou `null` si une seule variante de cette valeur est inconnue. */
  stock: number | null;
}

export interface SheetDimension {
  key: 'size' | 'color';
  label: string;
  values: SheetDimensionValue[];
}

export interface SheetStock {
  /** `false` : aucune ligne de stock — l'écran n'affirme alors aucune quantité. */
  tracked: boolean;
  quantity: number | null;
  status: SheetStockStatus;
}

export interface ProductSheet {
  images: string[];
  dimensions: SheetDimension[];
  variants: SheetVariant[];
  stock: SheetStock;
  /** Tout ce qu'il faut pour qu'un bouton d'achat soit légitime. */
  purchasable: boolean;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function quantityOf(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/** `products.additional_images` est un TEXT JSON ; on accepte aussi un tableau déjà parsé. */
export function readImageList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean);
  } catch {
    // Une colonne abîmée ne casse pas la fiche : on garde l'image principale.
  }
  // Ancien format : une URL par ligne. On ne garde que ce qui RESSEMBLE à un lien :
  // une valeur abîmée ne doit pas devenir une image de la galerie.
  return raw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('/') || /^https?:\/\//i.test(entry));
}

/**
 * Galerie : l'image principale d'abord, puis les secondaires dans l'ordre décidé
 * par le catalogue. Les doublons et les vides sortent ; `MAX_SHEET_IMAGES` borne.
 */
export function buildGallery(product: SheetProductInput): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [text(product.image), ...readImageList(product.additionalImages)]) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
    if (out.length >= MAX_SHEET_IMAGES) break;
  }
  return out;
}

/** Statut publié → état lisible par l'écran. Inconnu reste inconnu. */
export function publishedStockStatus(value: unknown): SheetStockStatus {
  const raw = text(value).toUpperCase();
  if (raw === 'OUT_OF_STOCK' || raw === 'SOLDOUT' || raw === 'SOLD_OUT') return 'OUT_OF_STOCK';
  if (raw === 'LIMITED' || raw === 'LOW') return 'LOW';
  if (raw === 'AVAILABLE' || raw === 'IN_STOCK') return 'IN_STOCK';
  return 'UNKNOWN';
}

interface VariantStock {
  quantity: number;
  known: boolean;
  low: boolean;
}

/** Somme des lignes de stock, par variante (et pour le produit entier). */
function sumStock(rows: SheetStockInput[]): { byVariant: Map<string, VariantStock>; total: VariantStock } {
  const byVariant = new Map<string, VariantStock>();
  const total: VariantStock = { quantity: 0, known: false, low: false };
  for (const row of rows) {
    const quantity = quantityOf(row.quantity);
    const reorder = quantityOf(row.reorder_point);
    const low = quantity > 0 && reorder > 0 && quantity <= reorder;
    total.known = true;
    total.quantity += quantity;
    total.low = total.low || low;
    const key = text(row.variant_id);
    if (!key) continue; // ligne du produit sans variante : elle compte dans le total
    const current = byVariant.get(key) ?? { quantity: 0, known: true, low: false };
    current.quantity += quantity;
    current.low = current.low || low;
    byVariant.set(key, current);
  }
  return { byVariant, total };
}

/**
 * La fiche complète. `variants` est la liste décidée par le catalogue ; une
 * variante inactive reste dans la réponse (grisée), pour que l'écran puisse dire
 * « cette taille n'est plus vendue » au lieu de la faire disparaître sans mot.
 */
export function buildProductSheet(
  product: SheetProductInput,
  variants: SheetVariantInput[] = [],
  stockRows: SheetStockInput[] = [],
): ProductSheet {
  const published = publishedStockStatus(product.stock_status);
  const { byVariant, total } = sumStock(stockRows);

  const ordered = [...variants].sort((a, b) => Number(a.sort_order ?? 100) - Number(b.sort_order ?? 100));
  const sheetVariants: SheetVariant[] = ordered.map((variant) => {
    const active = text(variant.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
    const line = byVariant.get(variant.id);
    const stock = line ? line.quantity : null;
    const available = active && published !== 'OUT_OF_STOCK' && (stock === null || stock > 0);
    const reason: SheetVariant['reason'] = !active ? 'INACTIVE' : stock === 0 ? 'OUT_OF_STOCK' : null;
    return {
      id: variant.id,
      sku: text(variant.sku),
      size: text(variant.size),
      color: text(variant.color),
      available,
      stock,
      reason,
    };
  });

  const dimensions: SheetDimension[] = [];
  for (const key of ['size', 'color'] as const) {
    const values: SheetDimensionValue[] = [];
    for (const variant of sheetVariants) {
      const value = key === 'size' ? variant.size : variant.color;
      if (!value) continue;
      const existing = values.find((entry) => entry.value === value);
      if (existing) {
        existing.available = existing.available || variant.available;
        existing.stock = existing.stock === null || variant.stock === null ? null : existing.stock + variant.stock;
        continue;
      }
      values.push({ value, available: variant.available, stock: variant.stock });
    }
    if (values.length > 0) dimensions.push({ key, label: key === 'size' ? 'Taille' : 'Couleur', values });
  }

  const stock: SheetStock = {
    tracked: total.known,
    quantity: total.known ? total.quantity : null,
    status: published === 'OUT_OF_STOCK'
      ? 'OUT_OF_STOCK'
      : total.known
        ? total.quantity === 0
          ? 'OUT_OF_STOCK'
          : total.low || total.quantity <= LOW_STOCK_THRESHOLD
            ? 'LOW'
            : 'IN_STOCK'
        : published,
  };

  const price = Number(product.final_price);
  const purchasable = text(product.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
    && Number.isFinite(price) && price > 0
    && stock.status !== 'OUT_OF_STOCK';

  return { images: buildGallery(product), dimensions, variants: sheetVariants, stock, purchasable };
}

/**
 * Choix du client encore valide ? Une taille épuisée ou une combinaison
 * inexistante ne doit pas partir au panier sous un nom que le stock contredit.
 */
export function selectionAvailable(
  sheet: Pick<ProductSheet, 'variants' | 'dimensions'>,
  selection: { size?: string; color?: string },
): SheetVariant | null {
  if (sheet.variants.length === 0) return null; // produit sans variante : rien à choisir
  const size = text(selection.size);
  const color = text(selection.color);
  const match = sheet.variants.find((variant) => (!size || variant.size === size) && (!color || variant.color === color));
  return match && match.available ? match : null;
}
