/**
 * AYWEBs — CAPTURE DE LA SÉLECTION DU CLIENT (principe du 19/11/2026).
 *
 *   « الحريف يختار ← AYWEBs يلتقط ← ZAYROVI تسعّر ← الحريف يؤكد »
 *   Le client choisit sur la page du marchand → AYWEBs capte CE choix →
 *   ZAYROVI calcule le prix final → le client confirme.
 *
 * Ce module juge UNIQUEMENT la combinaison affichée par la page au moment du
 * tap — jamais la matrice des tailles, couleurs, stocks et options non choisies.
 *
 * Règles fermées :
 *   1. DEUX LECTURES : l'enveloppe du lecteur relit la page ; si le prix, le
 *      choix ou l'identifiant diffèrent entre les deux lectures, la capture est
 *      refusée (`SELECTION_NOT_PROVEN`) — la page bougeait encore.
 *   2. SÉLECTION INCOMPLÈTE : un groupe à ≥ 2 valeurs sans valeur choisie ⇒
 *      `SELECTION_INCOMPLETE` (« اختار المقاس في الصفحة »). AYWEBs ne choisit
 *      JAMAIS une valeur par défaut à la place du client.
 *   3. DISPONIBILITÉ À TROIS ÉTATS :
 *        • rupture explicite, ou bouton d'achat désactivé, ou valeur choisie
 *          marquée indisponible ⇒ refus `SELECTION_UNAVAILABLE` ;
 *        • « en stock » explicite ⇒ AVAILABLE (ou LOW_STOCK) ;
 *        • sinon ⇒ UNKNOWN (« غير مؤكّد ») — jamais « disponible ».
 *   4. IDENTIFIANT DE L'OPTION : ASIN (Amazon), sku_id (AliExpress, TEMU),
 *      goods_id/sku (SHEIN) quand la page le publie. Le prix est LIÉ à cet
 *      identifiant (empreinte de la capture et jeton de devis).
 */
import type { AyWebsCapturedPage, AyWebsCapturedVariantGroup } from '../../shared/aywebsCapture';
import type { AyWebsAvailabilityState } from '../../shared/aywebsTypes';

export type AyWebsSelectionRejection = 'SELECTION_INCOMPLETE' | 'SELECTION_UNAVAILABLE' | 'SELECTION_NOT_PROVEN';

export type AyWebsSelectionIdSource = 'asin' | 'sku_id' | 'goods_id' | 'reader';

export interface AyWebsSelectionVerdict {
  ok: boolean;
  rejection: AyWebsSelectionRejection | null;
  /** Groupes à choix multiples restés sans valeur (noms tels que publiés). */
  missingGroups: string[];
  /** Le choix du client : nom du groupe → valeur affichée comme choisie. */
  attributes: Record<string, string>;
  /** Image de la valeur choisie (pastille couleur), si la page la publie. */
  image: string | null;
  variantId: string | null;
  variantIdSource: AyWebsSelectionIdSource | null;
  availability: AyWebsAvailabilityState;
  availabilityReason: string;
  /** Quantité affichée par le sélecteur du marchand (pré-remplissage), sinon null. */
  pageQuantity: number | null;
  notes: string[];
}

export interface AyWebsSelectionInput {
  storeId: string | null;
  variantGroups: AyWebsCapturedVariantGroup[];
  selectedVariantTexts: string[];
  /** Verdict de disponibilité de la capture (vocabulaire fermé de webviewCapture). */
  availability: AyWebsAvailabilityState;
  availabilityReason: string;
}

const ID_SHAPES: Record<AyWebsSelectionIdSource, RegExp> = {
  asin: /^[A-Z0-9]{10}$/,
  sku_id: /^\d{5,24}$/,
  goods_id: /^\d{5,24}$/,
  reader: /^[A-Za-z0-9:_-]{3,48}$/,
};

function clean(value: unknown, max = 60): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function idOf(raw: unknown, source: AyWebsSelectionIdSource): string | null {
  const value = clean(raw, 48).replace(/^(?:ae:|SHEIN-|TEMU-|AE-)/i, '');
  return value && ID_SHAPES[source].test(value) ? value : null;
}

/** Identifiant marchand de l'option affichée, par ordre de fiabilité. */
export function ayWebsSelectedVariantId(
  payload: AyWebsCapturedPage,
  storeId: string | null,
): { id: string | null; source: AyWebsSelectionIdSource | null } {
  const pick = (raw: unknown, source: AyWebsSelectionIdSource) => {
    const id = idOf(raw, source);
    return id ? { id, source } : null;
  };
  const found = (storeId === 'amazon' && (pick(payload.amazon?.selectedAsin, 'asin') || pick(payload.amazon?.pageAsin, 'asin')))
    || (storeId === 'aliexpress' && pick(payload.aliexpress?.selectedSkuId, 'sku_id'))
    || (storeId === 'temu' && pick((payload.temu as { selectedSkuId?: unknown } | undefined)?.selectedSkuId, 'sku_id'))
    || (storeId === 'shein' && (pick(payload.shein?.skuId, 'sku_id') || pick(payload.shein?.pageGoodsId, 'goods_id')))
    || pick(payload.selection?.variantId, 'reader');
  return found || { id: null, source: null };
}

/** Quantité affichée par la page (1..99), sinon null. Jamais devinée. */
export function ayWebsPageQuantity(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 99 ? value : null;
}

/**
 * Juge la sélection affichée. Pur et synchrone : appelé par
 * `validateAyWebsCapturedPage` quand la boutique est en mode `selection`.
 */
export function evaluateAyWebsSelection(payload: AyWebsCapturedPage, input: AyWebsSelectionInput): AyWebsSelectionVerdict {
  const notes: string[] = [];
  const { id: variantId, source: variantIdSource } = ayWebsSelectedVariantId(payload, input.storeId);
  const pageQuantity = ayWebsPageQuantity(payload.pageQuantity);
  const base = {
    missingGroups: [] as string[],
    attributes: {} as Record<string, string>,
    image: null as string | null,
    variantId,
    variantIdSource,
    pageQuantity,
  };
  const refuse = (rejection: AyWebsSelectionRejection, reason: string, extra: Partial<AyWebsSelectionVerdict> = {}): AyWebsSelectionVerdict => ({
    ok: false,
    rejection,
    ...base,
    availability: rejection === 'SELECTION_UNAVAILABLE' ? 'OUT_OF_STOCK' : 'UNKNOWN',
    availabilityReason: reason,
    notes: [...notes, `selection_refused:${reason}`],
    ...extra,
  });

  /* 1. Deux lectures concordantes. */
  if (payload.selection && payload.selection.stable === false) {
    return refuse('SELECTION_NOT_PROVEN', 'selection_reads_differ');
  }
  if (payload.selection?.stable === true) notes.push('selection_double_read_ok');

  /* 2. Chaque groupe à choix doit avoir SA valeur choisie, prise dans ses valeurs. */
  const selectedTexts = input.selectedVariantTexts.map((text) => text.toLowerCase());
  const attributes: Record<string, string> = {};
  const missingGroups: string[] = [];
  let image: string | null = null;
  for (const group of input.variantGroups) {
    const values = (group.values || []).map((value) => clean(value)).filter(Boolean);
    if (!values.length) continue;
    let chosen = clean(group.selected?.[0]);
    if (chosen && !values.some((value) => value.toLowerCase() === chosen.toLowerCase())) chosen = '';
    /* Le lecteur n'a pas marqué la valeur mais l'a lue comme « choisie » ailleurs. */
    if (!chosen) chosen = values.find((value) => selectedTexts.includes(value.toLowerCase())) || '';
    if (!chosen && values.length === 1) chosen = values[0];
    if (!chosen) {
      missingGroups.push(group.name);
      continue;
    }
    attributes[group.name] = values.find((value) => value.toLowerCase() === chosen.toLowerCase()) || chosen;
    const option = (group.options || []).find((entry) => clean(entry.value).toLowerCase() === chosen.toLowerCase());
    if (option?.available === false) {
      return refuse('SELECTION_UNAVAILABLE', 'selected_value_unavailable', { attributes, missingGroups });
    }
    if (!image && option?.image && /^https?:\/\//i.test(option.image)) image = option.image;
  }
  base.attributes = attributes;
  base.image = image;
  if (missingGroups.length) {
    base.missingGroups = missingGroups;
    return refuse('SELECTION_INCOMPLETE', 'selection_incomplete');
  }

  /* 3. Amazon : l'ASIN choisi doit être celui de la fiche ouverte. */
  if (input.storeId === 'amazon') {
    const pageAsin = idOf(payload.amazon?.pageAsin, 'asin');
    const selectedAsin = idOf(payload.amazon?.selectedAsin, 'asin');
    if (pageAsin && selectedAsin && pageAsin !== selectedAsin) {
      return refuse('SELECTION_NOT_PROVEN', 'amazon_selected_not_page');
    }
    const selectedOption = (payload.amazon?.options || []).find((option) => option?.selected === true
      && (!selectedAsin || !option.asin || option.asin === selectedAsin));
    if (selectedOption?.availabilityEvidence === 'unavailable') {
      return refuse('SELECTION_UNAVAILABLE', 'amazon_selected_unavailable');
    }
  }

  /* 4. Disponibilité à trois états. */
  if (input.availability === 'OUT_OF_STOCK') return refuse('SELECTION_UNAVAILABLE', 'selection_out_of_stock');
  if (input.availabilityReason === 'capture_add_control_disabled') {
    return refuse('SELECTION_UNAVAILABLE', 'selection_buy_control_disabled');
  }
  let availability: AyWebsAvailabilityState = 'UNKNOWN';
  let availabilityReason = 'selection_availability_unconfirmed';
  if (input.availability === 'AVAILABLE' || input.availability === 'LOW_STOCK') {
    availability = input.availability;
    availabilityReason = `selection_${input.availabilityReason}`;
  }
  if (variantId) notes.push(`selection_variant:${variantIdSource}:${variantId}`);
  if (pageQuantity) notes.push(`selection_quantity:${pageQuantity}`);
  notes.push(`selection_availability:${availability}`);
  return {
    ok: true,
    rejection: null,
    ...base,
    availability,
    availabilityReason,
    notes,
  };
}
