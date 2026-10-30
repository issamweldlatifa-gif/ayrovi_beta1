/**
 * ورقة الاختيار من **القراءة المحلية** (20/10/2026) — بلا أي نداء للخادم عند الفتح.
 *
 * (تعليق فقط : إعادة تشغيل بناء APK بعد فشل تنزيل NDK على الـrunner، ليس خطأ في الكود.)
 *
 * المصدر: capture.amazon (الخيارات والمقاسات مع ASIN ودليل التوفّر) وعنوان الصفحة.
 *  • الخادم يبقى الحكم الأخير: يتحقق من الاختيار عند التأكيد، ويعطي السعر والفاتورة.
 *  • التوفّر هنا لازم يكون مُثبتاً من القراءة: «غير معروف» ⇒ لا تأكيد (المبدأ: UNKNOWN لا يذهب للسلة).
 *  • لا سعر هنا: السعر يظهر بعد الفحص عند الخادم، ولا نحسبو شي محلياً.
 */
import type {
  AyWebsAddBlockCode, AyWebsAvailability, AyWebsResolvedProduct, AyWebsVariantGroup, AyWebsVariantOption,
} from '@/api/aywebs';
import { isRealChoiceValue } from '@/features/aywebs/variantLabels';

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const ASIN = /^[A-Z0-9]{10}$/;

export interface LocalVariant {
  asin: string;
  variantUrl?: string;
  attributes: Record<string, string>;
  availability: 'AVAILABLE' | 'OUT_OF_STOCK' | 'UNKNOWN';
  /** Prix affiché SUR LA CARTE de ce choix (texte tel quel) — jamais un devis. */
  cardPrice: string;
  /** `true` quand ce prix est une entrée de gamme (« à partir de », « from »). */
  priceFrom?: boolean;
  /** Stock annoncé sur la carte ; `null` quand la page n'en publie pas. */
  stock: number | null;
  /** Photo de l'option, uniquement si le lecteur a extrait une URL HTTP(S) explicite. */
  image?: string;
}

/**
 * Ce que la page publie pour UNE valeur d'un groupe (23/10/2026).
 *
 * Constat du client sur Amazon : la feuille ne montrait ni le prix ni l'état de
 * l'autre couleur, et il fallait réinjecter le lecteur à chaque changement. Or
 * la page publie, sur la carte de chaque valeur, un prix (« $88.00 »,
 * « 5 options from $56.32 ») et parfois l'état (« In Stock »). On les lit UNE
 * fois et la feuille les affiche pour toutes les valeurs.
 */
export interface LocalValueState {
  state: 'AVAILABLE' | 'OUT_OF_STOCK' | 'UNKNOWN';
  price: string;
  priceFrom: boolean;
  stock: number | null;
  image?: string;
}
export type LocalValueStates = Record<string, Record<string, LocalValueState>>;

const VALUE_AVAILABILITY: Record<string, LocalValueState['state']> = {
  available: 'AVAILABLE', unavailable: 'OUT_OF_STOCK',
};

/** Variantes publiées dans la capture Amazon, avec leur ASIN, leurs attributs et leur disponibilité prouvée. */
export function localVariantsFromCapture(capture: Json): LocalVariant[] {
  const out: LocalVariant[] = [];
  const seen = new Set<string>();
  const amazon = isRecord(capture.amazon) ? capture.amazon : null;
  /* Index des prix/états publiés par valeur : par ASIN, et par (dimension, valeur).
     Le second index existe parce que beaucoup de cartes de twister n'exposent PAS
     d'ASIN pour les valeurs non choisies — sans lui, le prix de la couleur
     affichée était perdu et la feuille disait « le prix dépend de l'option ». */
  const cardByAsin = new Map<string, { price: string; priceFrom: boolean; stock: number | null; image: string }>();
  const cardByValue = new Map<string, { price: string; priceFrom: boolean; stock: number | null; image: string }>();
  const stateByValue = new Map<string, LocalVariant['availability']>();
  if (amazon && Array.isArray(amazon.options)) {
    for (const option of amazon.options) {
      if (!isRecord(option)) continue;
      const value = text(option.value);
      const dimension = text(option.dimension).toLowerCase();
      const key = dimension && value ? `${dimension}=${value.toLowerCase()}` : '';
      const asin = text(option.asin).toUpperCase();
      const price = text(option.price);
      const rawImage = text(option.image);
      const image = /^https?:\/\//i.test(rawImage) ? rawImage.slice(0, 600) : '';
      const info = {
        price,
        priceFrom: option.priceFrom === true,
        stock: Number.isFinite(Number(option.stock)) && Number(option.stock) > 0 ? Math.floor(Number(option.stock)) : null,
        image,
      };
      if (key && (info.price || info.stock != null || info.image)) {
        const known = cardByValue.get(key);
        cardByValue.set(key, {
          price: known?.price || info.price,
          priceFrom: info.priceFrom,
          stock: known?.stock ?? info.stock,
          image: known?.image || info.image,
        });
      }
      const evidence = text(option.availabilityEvidence).toLowerCase();
      if (key && VALUE_AVAILABILITY[evidence]) stateByValue.set(key, VALUE_AVAILABILITY[evidence]);
      if (ASIN.test(asin)) {
        if (info.price || info.stock != null || info.image) {
          const known = cardByAsin.get(asin);
          cardByAsin.set(asin, {
            price: known?.price || info.price,
            priceFrom: info.priceFrom,
            stock: known?.stock ?? info.stock,
            image: known?.image || info.image,
          });
        }
        if (VALUE_AVAILABILITY[evidence]) stateByValue.set(`asin=${asin}`, VALUE_AVAILABILITY[evidence]);
      }
    }
  }
  const stateFor = (asin: string, attributes: Record<string, string>): LocalVariant['availability'] => {
    if (asin && stateByValue.has(`asin=${asin}`)) return stateByValue.get(`asin=${asin}`)!;
    for (const [name, value] of Object.entries(attributes)) {
      const state = stateByValue.get(`${name.toLowerCase()}=${String(value).toLowerCase()}`);
      if (state) return state;
    }
    return 'UNKNOWN';
  };
  const cardFor = (asin: string, attributes: Record<string, string>) => {
    if (asin && cardByAsin.has(asin)) return cardByAsin.get(asin)!;
    for (const [name, value] of Object.entries(attributes)) {
      const card = cardByValue.get(`${name.toLowerCase()}=${String(value).toLowerCase()}`);
      if (card) return card;
    }
    return null;
  };

  const pushVariant = (asin: string, attributes: Record<string, string>) => {
    const dedupe = asin || Object.entries(attributes).map(([k, v]) => `${k}=${v.toLowerCase()}`).sort().join('|');
    if (!dedupe || seen.has(dedupe)) return;
    seen.add(dedupe);
    const card = cardFor(asin, attributes);
    const colorEntry = Object.entries(attributes).find(([name]) => /(color|colour|couleur|farbe|colore)/i.test(name));
    const colorCard = colorEntry
      ? cardByValue.get(`${colorEntry[0].toLowerCase()}=${colorEntry[1].toLowerCase()}`)
      : null;
    out.push({
      asin,
      attributes,
      availability: stateFor(asin, attributes),
      cardPrice: card?.price ?? '',
      priceFrom: card?.priceFrom ?? false,
      stock: card?.stock ?? null,
      ...(colorCard?.image ? { image: colorCard.image } : {}),
    });
  };

  if (amazon && Array.isArray(amazon.variants) && amazon.variants.length) {
    for (const variant of amazon.variants) {
      if (!isRecord(variant)) continue;
      const asin = text(variant.asin).toUpperCase();
      if (!ASIN.test(asin)) continue;
      const attributes: Record<string, string> = {};
      if (Array.isArray(variant.dimensions)) {
        for (const dimension of variant.dimensions) {
          if (!isRecord(dimension)) continue;
          const name = text(dimension.name).toLowerCase();
          const value = text(dimension.value);
          if (name && value) attributes[name] = value;
        }
      }
      pushVariant(asin, attributes);
    }
  }
  /* Twister sans table de variantes : les OPTIONS portent déjà l'ASIN et le nom.
     Les ignorer vidait la feuille de ses couleurs alors que la page les affichait. */
  if (amazon && Array.isArray(amazon.options)) {
    const byAsin = new Map<string, Record<string, string>>();
    for (const option of amazon.options) {
      if (!isRecord(option)) continue;
      const asin = text(option.asin).toUpperCase();
      const dimension = text(option.dimension).toLowerCase();
      const value = text(option.value);
      if (!ASIN.test(asin) || !dimension || !value) continue;
      byAsin.set(asin, { ...(byAsin.get(asin) ?? {}), [dimension]: value });
    }
    for (const [asin, attributes] of byAsin) pushVariant(asin, attributes);
  }

  /* AliExpress v2 (28/10/2026) : matrice SKU multi-axes (`capture.aliexpress.skus`).
  /* Matrice universelle `variantMatrix` (SHEIN, Zalando, Amazon, AliExpress, JSON-LD) :
     enrichit les variantes Amazon existantes (prix/URL/stock) ou fournit directement
     les combinaisons multi-axes exactes pour toutes les autres boutiques. */
  if (Array.isArray(capture.variantMatrix) && capture.variantMatrix.length > 0) {
    if (out.length > 0) {
      for (const mEntry of capture.variantMatrix.slice(0, 120)) {
        if (!isRecord(mEntry) || !isRecord(mEntry.attributes)) continue;
        const mUrl = text(mEntry.variantUrl);
        const mPrice = mEntry.priceFrom === true ? '' : text(mEntry.price);
        const mTarget = out.find((existing) => matchesSelection(existing.attributes, mEntry.attributes as Record<string, string>));
        if (mTarget) {
          if (!mTarget.variantUrl && /^https?:\/\//i.test(mUrl)) mTarget.variantUrl = mUrl.slice(0, 600);
          if (!mTarget.cardPrice && mPrice) { mTarget.cardPrice = mPrice; mTarget.priceFrom = false; }
          if (mTarget.availability === 'UNKNOWN' && (mEntry.available === true || mEntry.available === false)) {
            mTarget.availability = mEntry.available ? 'AVAILABLE' : 'OUT_OF_STOCK';
          }
        }
      }
    } else {
      for (const mEntry of capture.variantMatrix.slice(0, 120)) {
        if (!isRecord(mEntry) || !isRecord(mEntry.attributes)) continue;
        const attributes: Record<string, string> = {};
        for (const [rawKey, rawVal] of Object.entries(mEntry.attributes)) {
          const cleanKey = text(rawKey);
          const cleanVal = text(rawVal);
          if (cleanKey && cleanVal && isRealChoiceValue(cleanKey, cleanVal)) {
            attributes[cleanKey] = cleanVal;
          }
        }
        const attrEntries = Object.entries(attributes);
        if (!attrEntries.length) continue;
        const comboKey = attrEntries.map(([k, v]) => `${k.toLowerCase()}=${v.toLowerCase()}`).sort().join('|');
        if (seen.has(comboKey)) continue;
        seen.add(comboKey);
        const rawVarId = text(mEntry.variantId);
        const rawUrl = text(mEntry.variantUrl);
        const cleanUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl.slice(0, 600) : '';
        const rawImg = text(mEntry.image);
        const cleanImg = /^https?:\/\//i.test(rawImg) ? rawImg.slice(0, 600) : '';
        const stockNum = Math.floor(Number(mEntry.stock));
        const avail: LocalVariant['availability'] = mEntry.available === false
          ? 'OUT_OF_STOCK'
          : mEntry.available === true ? 'AVAILABLE' : 'UNKNOWN';
        out.push({
          asin: rawVarId || `matrix:${comboKey.slice(0, 60)}`,
          ...(cleanUrl ? { variantUrl: cleanUrl } : {}),
          attributes,
          availability: avail,
          cardPrice: avail === 'OUT_OF_STOCK' ? '' : text(mEntry.price),
          priceFrom: mEntry.priceFrom === true,
          stock: avail === 'OUT_OF_STOCK' ? null : (Number.isFinite(stockNum) && stockNum > 0 && stockNum <= 999 ? stockNum : null),
          ...(cleanImg ? { image: cleanImg } : {}),
        });
      }
    }
  }

  /* AliExpress v2 (rétrocompatibilité directe quand `variantMatrix` n'est pas fourni) :
     Chaque combinaison (Couleur × Prise × Expédié depuis…) porte son propre
     `skuId`, son prix ferme et son stock exact. */
  const aliexpress = isRecord(capture.aliexpress) ? capture.aliexpress : null;
  if (!out.length && aliexpress && Array.isArray(aliexpress.skus) && aliexpress.skus.length > 0) {
    for (const sku of aliexpress.skus.slice(0, 60)) {
      if (!isRecord(sku) || !isRecord(sku.attributes)) continue;
      const attributes: Record<string, string> = {};
      for (const [rawKey, rawVal] of Object.entries(sku.attributes)) {
        const cleanKey = text(rawKey);
        const cleanVal = text(rawVal);
        if (cleanKey && cleanVal && isRealChoiceValue(cleanKey, cleanVal)) {
          attributes[cleanKey] = cleanVal;
        }
      }
      const attrEntries = Object.entries(attributes);
      if (!attrEntries.length) continue;
      const comboKey = attrEntries.map(([k, v]) => `${k.toLowerCase()}=${v.toLowerCase()}`).sort().join('|');
      if (seen.has(comboKey)) continue;
      seen.add(comboKey);
      const rawSkuId = text(sku.skuId).replace(/^ae:/i, '');
      const variantId = /^\d{5,24}$/.test(rawSkuId) ? `ae:${rawSkuId}` : `ae:${comboKey}`;
      const rawImg = text(sku.image);
      const cleanImg = /^https?:\/\//i.test(rawImg) ? rawImg.slice(0, 600) : '';
      const stockNum = Math.floor(Number(sku.stock));
      out.push({
        asin: variantId,
        attributes,
        availability: sku.available === false ? 'OUT_OF_STOCK' : sku.available === true ? 'AVAILABLE' : 'UNKNOWN',
        cardPrice: sku.available === false ? '' : text(sku.price),
        priceFrom: false,
        stock: sku.available === false ? null : (Number.isFinite(stockNum) && stockNum > 0 && stockNum <= 999 ? stockNum : null),
        ...(cleanImg ? { image: cleanImg } : {}),
      });
    }
  }

  /* Boutiques SANS lecteur dédié (23/10/2026) : les groupes nommés de la capture
     deviennent les options de la feuille. Chaque valeur est une « variante » à
     un seul attribut ; le serveur reçoit `variant: {couleur: "Rouge"}` — c'est
     exactement ce qu'il attend pour une fiche qui ne publie pas de combinaisons. */
  if (!out.length && Array.isArray(capture.variantGroups)) {
    for (const group of capture.variantGroups) {
      if (!isRecord(group)) continue;
      const published = text(group.name);
      const name = published.toLowerCase();
      const values = Array.isArray(group.values)
        ? group.values.map(text).filter((val) => Boolean(val) && isRealChoiceValue(published, val))
        : [];
      if (!name || !values.length) continue;
      const states = new Map<string, LocalValueState & { image?: string; goodsId?: string; skuId?: string }>();
      if (Array.isArray(group.options)) {
        for (const option of group.options) {
          if (!isRecord(option)) continue;
          const value = text(option.value).toLowerCase();
          if (!value) continue;
          const rawImg = text(option.image);
          const cleanImg = /^https?:\/\//i.test(rawImg) ? rawImg.slice(0, 600) : '';
          const rawGoodsId = text(option.goodsId);
          const cleanGoodsId = /^\d{5,16}$/.test(rawGoodsId) ? rawGoodsId : '';
          const rawSkuId = text(option.skuId).replace(/^ae:/i, '');
          const cleanSkuId = /^\d{5,24}$/.test(rawSkuId) ? rawSkuId : '';
          states.set(value, {
            state: option.available === false ? 'OUT_OF_STOCK' : option.available === true ? 'AVAILABLE' : 'UNKNOWN',
            price: text(option.price),
            priceFrom: option.priceFrom === true,
            stock: Number.isFinite(Number(option.stock)) && Number(option.stock) > 0 ? Math.floor(Number(option.stock)) : null,
            ...(cleanImg ? { image: cleanImg } : {}),
            ...(cleanGoodsId ? { goodsId: cleanGoodsId } : {}),
            ...(cleanSkuId ? { skuId: cleanSkuId } : {}),
          });
        }
      }
      for (const value of values) {
        const state = states.get(value.toLowerCase());
        const asin = state?.goodsId
          ? `shein:${state.goodsId}`
          : state?.skuId
            ? `ae:${state.skuId}`
            : `${name}:${value.toLowerCase()}`;
        const dedupeKey = `${name}:${value.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push({
          asin,
          attributes: { [published]: value },
          availability: state?.state ?? 'UNKNOWN',
          cardPrice: state?.price ?? '',
          priceFrom: state?.priceFrom ?? false,
          stock: state?.stock ?? null,
          ...(state?.image ? { image: state.image } : {}),
        });
      }
    }
  } else if (Array.isArray(capture.variantGroups)) {
    /* Quand `variantMatrix` couvre la couleur courante mais qu'une couleur sœur SHEIN
       (`goodsId`) n'avait pas ses SKUs embarqués, on ajoute son pointeur 1-attribut
       pour permettre la lecture delta ciblée au clic sans perdre son image ni son `goodsId`. */
    for (const group of capture.variantGroups) {
      if (!isRecord(group) || !Array.isArray(group.options)) continue;
      const published = text(group.name);
      if (!published) continue;
      for (const option of group.options) {
        if (!isRecord(option)) continue;
        const val = text(option.value);
        const rawGoodsId = text(option.goodsId);
        if (!val || !/^\d{5,16}$/.test(rawGoodsId)) continue;
        const alreadyCovered = out.some((entry) =>
          Object.entries(entry.attributes).some(([k, v]) => k.toLowerCase() === published.toLowerCase() && v.toLowerCase() === val.toLowerCase()),
        );
        if (alreadyCovered) continue;
        const rawImg = text(option.image);
        out.push({
          asin: `shein:${rawGoodsId}`,
          attributes: { [published]: val },
          availability: option.available === false ? 'OUT_OF_STOCK' : option.available === true ? 'AVAILABLE' : 'UNKNOWN',
          cardPrice: text(option.price),
          priceFrom: option.priceFrom === true,
          stock: null,
          ...(/^https?:\/\//i.test(rawImg) ? { image: rawImg.slice(0, 600) } : {}),
        });
      }
    }
  }
  return out;
}

/**
 * États/prix par valeur, indépendamment de toute combinaison publiée.
 * Utilisé par la feuille pour écrire sous chaque pastille ce que la page dit —
 * et par la disposition (`localAddReadiness`) pour prouver un choix complet
 * quand la page ne publie pas la table des combinaisons.
 */
export function valueStatesFromCapture(capture: Json): LocalValueStates {
  const out: LocalValueStates = {};
  if (!capture || typeof capture !== 'object') return out;
  const put = (name: string, value: string, state: LocalValueState) => {
    const group = name.trim().toLowerCase();
    const key = value.trim().toLowerCase();
    if (!group || !key) return;
    const bucket = out[group] ?? (out[group] = {});
    const known = bucket[key];
    if (!known) { bucket[key] = state; return; }
    /* Le négatif gagne : une valeur déclarée indisponible quelque part ne
       devient jamais disponible par une autre lecture. */
    if (known.state !== 'OUT_OF_STOCK' && state.state === 'OUT_OF_STOCK') known.state = 'OUT_OF_STOCK';
    else if (known.state === 'UNKNOWN' && state.state !== 'UNKNOWN') known.state = state.state;
    if (!known.price && state.price) { known.price = state.price; known.priceFrom = state.priceFrom; }
    if (known.stock == null && state.stock != null) known.stock = state.stock;
    if (!known.image && state.image) known.image = state.image;
  };
  const amazon = isRecord(capture.amazon) ? capture.amazon : null;
  if (amazon && Array.isArray(amazon.options)) {
    for (const option of amazon.options) {
      if (!isRecord(option)) continue;
      const evidence = text(option.availabilityEvidence).toLowerCase();
      const img = text(option.image);
      put(text(option.dimension), text(option.value), {
        state: VALUE_AVAILABILITY[evidence] ?? 'UNKNOWN',
        price: text(option.price),
        priceFrom: option.priceFrom === true,
        stock: Number.isFinite(Number(option.stock)) && Number(option.stock) > 0 ? Math.floor(Number(option.stock)) : null,
        ...(img.startsWith('http') ? { image: img } : {}),
      });
    }
  }
  if (Array.isArray(capture.variantGroups)) {
    for (const group of capture.variantGroups) {
      if (!isRecord(group) || !Array.isArray(group.options)) continue;
      const name = text(group.name);
      for (const option of group.options) {
        if (!isRecord(option)) continue;
        const img = text(option.image);
        put(name, text(option.value), {
          state: option.available === false ? 'OUT_OF_STOCK' : option.available === true ? 'AVAILABLE' : 'UNKNOWN',
          price: text(option.price),
          priceFrom: option.priceFrom === true,
          stock: Number.isFinite(Number(option.stock)) && Number(option.stock) > 0 ? Math.floor(Number(option.stock)) : null,
          ...(img.startsWith('http') ? { image: img } : {}),
        });
      }
    }
  }
  return out;
}

/**
 * Groupes de la feuille : la table des variantes si elle existe, sinon les
 * groupes NOMMÉS lus sur la page. Sans ce second chemin, une fiche Zalando
 * n'avait aucune option — la feuille disait « le marchand ne publie aucune
 * option » alors que sa page affichait une couleur et une taille.
 */
export function groupsFromCapture(capture: Json, variants = localVariantsFromCapture(capture)): AyWebsVariantGroup[] {
  const fromVariants = groupsFromVariants(variants);
  if (!capture || typeof capture !== 'object' || !Array.isArray(capture.variantGroups)) {
    return fromVariants;
  }
  const groups: AyWebsVariantGroup[] = fromVariants.map((g) => ({ attribute: g.attribute, values: [...g.values] }));
  for (const group of capture.variantGroups) {
    if (!isRecord(group)) continue;
    const attribute = text(group.name);
    /* Même crible qu'à la source (28/10/2026) : « Taille » et « Votre taille »
       sont des boutons d'interface, pas des tailles. */
    const values = (Array.isArray(group.values) ? group.values.map(text) : [])
      .filter((value) => Boolean(value) && isRealChoiceValue(attribute, value));
    if (!attribute || !values.length) continue;
    const existing = groups.find((known) => known.attribute.toLowerCase() === attribute.toLowerCase());
    if (existing) {
      for (const val of values) {
        if (!existing.values.some((v) => v.toLowerCase() === val.toLowerCase())) {
          existing.values.push(val);
        }
      }
    } else {
      groups.push({ attribute, values });
    }
  }
  return groups;
}

/**
 * الاختيار الافتراضي = **اللي تعرضو الصفحة**. الصفحة تفتح على تركيبة معيّنة
 * (Amazon: ASIN الصفحة هو التركيبة المعروضة) ; بلا هذا، الورقة تفتح فارغة
 * والمستعمل يظنّ «التاجر ما نشرش خيارات» ثمّ يلقى زر الإضافة مقفولاً.
 * ما نضيفوش قيمة ما شفناهاش: كل قيمة لازم تكون موجودة في مجموعات الصفحة.
 */
export function defaultSelectionFromCapture(
  capture: Json,
  groups: AyWebsVariantGroup[],
): Record<string, string> {
  if (!groups.length) return {};
  const amazon = isRecord(capture.amazon) ? capture.amazon : null;
  const selection: Record<string, string> = {};
  if (amazon) {
    const selectedAsin = text(amazon.selectedAsin).toUpperCase();
    const entries = Array.isArray(amazon.variants) ? amazon.variants.filter(isRecord) : [];
    const shown = entries.find((variant) => selectedAsin !== '' && text(variant.asin).toUpperCase() === selectedAsin)
      ?? entries.find((variant) => variant.selected === true);
    const dimensions = shown && Array.isArray(shown.dimensions) ? shown.dimensions.filter(isRecord) : [];
    for (const group of groups) {
      const key = group.attribute.trim().toLowerCase();
      const match = dimensions.find((dimension) => text(dimension.name).toLowerCase() === key);
      const value = match ? text(match.value) : '';
      const canonical = value
        ? group.values.find((candidate) => candidate.toLowerCase() === value.toLowerCase())
        : undefined;
      if (canonical) selection[key] = canonical;
    }
    /* Live DOM group selections override the often stale embedded ASIN table. */
    if (Array.isArray(capture.variantGroups)) {
      for (const group of groups) {
        const entry = capture.variantGroups.find((candidate) => isRecord(candidate)
          && text(candidate.name).toLowerCase() === group.attribute.trim().toLowerCase());
        if (!isRecord(entry) || !Array.isArray(entry.selected) || entry.selected.length !== 1) continue;
        const value = text(entry.selected[0]);
        const canonical = group.values.find((candidate) => candidate.toLowerCase() === value.toLowerCase());
        if (canonical) selection[group.attribute.trim().toLowerCase()] = canonical;
      }
    }
    return selection;
  }
  /* Boutique catalogue / SHEIN / AliExpress / mobile : la page publie elle-même la valeur
     affichée de chaque groupe (`variantGroups[].selected`). On ouvre donc la
     feuille SUR la combinaison affichée, comme le client la voit. Sans cela,
     prix et disponibilité de la page ne s'appliquaient à aucune sélection et
     la feuille semblait vide alors que la fiche était complète (23/10/2026). */
  if (Array.isArray(capture.variantGroups)) {
    for (const group of groups) {
      const key = group.attribute.trim().toLowerCase();
      if (selection[key]) continue;
      const entry = capture.variantGroups.find((candidate) => isRecord(candidate)
        && text(candidate.name).toLowerCase() === key);
      if (!entry || !isRecord(entry) || !Array.isArray(entry.selected)) continue;
      for (const rawShown of entry.selected) {
        const shown = text(rawShown);
        if (!shown) continue;
        const canonical = group.values.find((candidate) => candidate.toLowerCase() === shown.toLowerCase());
        if (canonical) {
          selection[key] = canonical;
          break;
        }
      }
    }
  }
  const shein = isRecord(capture.shein) ? capture.shein : null;
  if (shein) {
    const sheinColor = text(shein.selectedColor);
    const sheinSize = text(shein.selectedSize);
    for (const group of groups) {
      const key = group.attribute.trim().toLowerCase();
      if (selection[key]) continue;
      const wanted = /(color|colour|couleur|farbe|colore|cor|لون)/i.test(key)
        ? sheinColor
        : /(size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|age|âge|مقاس)/i.test(key)
          ? sheinSize
          : '';
      if (!wanted) continue;
      const canonical = group.values.find((candidate) => candidate.toLowerCase() === wanted.toLowerCase());
      if (canonical) selection[key] = canonical;
    }
  }
  return selection;
}

/** هل الاختيار يطابق تركيبة منشورة؟ مقارنة تامّة (نفس الأسماء، نفس القيم) — بلا تخمين. */
function matchesSelection(attributes: Record<string, string>, selection: Record<string, string>): boolean {
  const chosen = new Map(Object.entries(selection).map(([name, value]) => [name.trim().toLowerCase(), String(value)]));
  const published = new Map(Object.entries(attributes).map(([name, value]) => [name.trim().toLowerCase(), String(value)]));
  if (!chosen.size || chosen.size !== published.size) return false;
  for (const [name, value] of chosen) {
    const candidate = published.get(name);
    if (candidate == null || candidate.toLowerCase() !== value.toLowerCase()) return false;
  }
  return true;
}

/** سعر واحد فقط من القراءة (كل القراءات تتفق على نفس المبلغ) — وإلاّ لا سعر. */
function pagePriceText(capture: Json): string {
  const candidates = Array.isArray(capture.priceCandidates) ? capture.priceCandidates : [];
  const amounts = new Set<string>();
  let first = '';
  for (const candidate of candidates) {
    const value = isRecord(candidate) ? text(candidate.text) : text(candidate);
    const digits = value.replace(/\D/g, '');
    if (!digits) continue;
    if (!first) first = value;
    amounts.add(digits);
  }
  return amounts.size === 1 ? first : '';
}

/**
 * هل الصفحة تنشر **ثمن كل قيمة** في هذا الاختيار؟ (23/10/2026)
 *
 * سؤال واحد، وجواب واحد: هل نقدر نطلب من الخادم ثمن هذه التركيبة من **نفس**
 * الكابتشر، بلا ما نعاود نقرا الصفحة ولا نحقن القارئ؟
 *
 * « نعم » فقط إذا كل قيمة مختارة عندها ثمن **مؤكّد** منشور (موش « à partir
 * de »). ثمن « à partir de » يبقى تشكيلة، ما ينفعش كسعر لتركيبة معيّنة.
 * اختيار فارغ = لا، لأنّ السؤال ما عندوش معنى بلا قيم.
 */
export function selectionHasPublishedPrice(capture: Json, selection: Record<string, string>): boolean {
  if (!capture || typeof capture !== 'object') return false;
  const entries = Object.entries(selection || {});
  if (!entries.length) return false;
  const variants = localVariantsFromCapture(capture);
  const chosen = variants.find((variant) => matchesSelection(variant.attributes, selection));
  if (chosen) {
    return Boolean(chosen.cardPrice && !chosen.priceFrom && chosen.availability !== 'OUT_OF_STOCK');
  }
  const states = valueStatesFromCapture(capture);
  return entries.every(([name, value]) => {
    const state = states[name.trim().toLowerCase()]?.[String(value).trim().toLowerCase()];
    return Boolean(state && state.price && !state.priceFrom);
  });
}

/**
 * السعر **المعروض** للاختيار الحالي: سعر بطاقة الاختيار إن نشرتو، وإلاّ سعر
 * الصفحة إن كان الاختيار هو المعروض فيها. نصّ كما كتبتو الصفحة (« $89.99 »)،
 * موش رقم محسوب: المجموع بالدينار يجي من الخادم عند الإضافة.
 */
export function displayPriceForSelection(
  capture: Json,
  selection: Record<string, string>,
): { text: string; priceFrom: boolean } | null {
  if (!capture || typeof capture !== 'object') return null;
  const variants = localVariantsFromCapture(capture);
  const chosen = variants.find((variant) => matchesSelection(variant.attributes, selection));
  if (chosen) {
    if (chosen.cardPrice) return { text: chosen.cardPrice, priceFrom: chosen.priceFrom === true };
    const amazon = isRecord(capture.amazon) ? capture.amazon : null;
    const shownAsin = amazon ? text(amazon.selectedAsin).toUpperCase() : '';
    const aliexpress = isRecord(capture.aliexpress) ? capture.aliexpress : null;
    const shownAeSku = aliexpress && /^\d{5,24}$/.test(text(aliexpress.selectedSkuId))
      ? `ae:${text(aliexpress.selectedSkuId)}`
      : '';
    if ((shownAsin && shownAsin === chosen.asin) || (shownAeSku && shownAeSku === chosen.asin)) {
      const page = pagePriceText(capture);
      return page ? { text: page, priceFrom: false } : null;
    }
    return null;
  }
  /* Pas de table de combinaisons : le prix publié SUR chaque valeur choisie.
     S'il y en a plusieurs et qu'ils diffèrent, on n'en invente pas un — on ne
     renvoie rien, et la feuille explique que le prix dépend de l'option. */
  const states = valueStatesFromCapture(capture);
  const prices = Object.entries(selection)
    .map(([name, value]) => states[name.trim().toLowerCase()]?.[String(value).trim().toLowerCase()])
    .filter((state): state is LocalValueState => Boolean(state && state.price));
  if (prices.length === Object.keys(selection).length && prices.length > 0) {
    const distinct = new Set(prices.map((state) => state.price.replace(/\s+/g, ' ').toLowerCase()));
    if (distinct.size === 1) return { text: prices[0].price, priceFrom: prices[0].priceFrom };
  }
  /* Sans choix (ou sans options publiées) : le prix de page décrit l'article affiché. */
  if (Object.keys(selection).length === 0) {
    const page = pagePriceText(capture);
    return page ? { text: page, priceFrom: false } : null;
  }
  /* L'option choisie EST celle que la page affiche : son prix est le prix de la
     page (23/10/2026, Zalando). Ce n'est pas une déduction — c'est la même
     règle que le serveur applique : la preuve de page vaut pour la combinaison
     affichée, et pour elle seule. */
  if (selectionIsShown(capture, selection)) {
    const page = pagePriceText(capture);
    if (page) return { text: page, priceFrom: false };
  }
  return null;
}

/**
 * Sépare le MONTANT de son baratin, pour l'écran.
 *
 * Mesuré le 23/10/2026 (Zalando) : « 12,95 €TVA incluse150 ml (8,63 € / 100 ml) »
 * s'affichait d'un bloc. Le montant reste 12,95 € ; le reste (TVA, contenance,
 * prix au litre) est une NOTE, jamais recollée au nombre.
 */
export function splitMerchantPrice(text: string): { amount: string; note: string } {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return { amount: '', note: '' };
  const match = /([0-9][0-9\s.,\u00a0]*?)\s*([$€£¥]|\b(?:EUR|USD|GBP|TND|DT|MAD|AED|SAR)\b|d\.?t\b)/i.exec(raw);
  if (!match) return { amount: raw.slice(0, 40), note: '' };
  const amount = `${match[1].trim()} ${match[2]}`.replace(/\s+/g, ' ').trim();
  const note = raw.slice((match.index ?? 0) + match[0].length)
    .replace(/^[\s,;:·–—-]+/, '')
    .replace(/([a-zéèêàùç])(\d)/gi, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
  return { amount, note };
}

/**
 * الصفحة تقول «الثمن يختلف» (fourchette « $29.99 - $38.99 » ولا « à partir de »)؟
 * نستعملوه باش نفسّرو للمستعمل علاش ما فماش رقم قبل ما يختار، بدل ما نخلّيو
 * بلاصة الثمن فارغة.
 */
export function priceDependsOnOption(capture: Json): boolean {
  if (!capture || typeof capture !== 'object') return false;
  const diagnostics = Array.isArray(capture.diagnostics) ? capture.diagnostics : [];
  return diagnostics.some((code) => {
    const value = text(code).toLowerCase();
    return value === 'price:range' || value === 'price:from';
  });
}

/**
 * المخزون المعلن للاختيار: بطاقة الاختيار أوّلاً، وإلاّ نصّ الصفحة كي الاختيار
 * هو المعروض (« Only 6 left in stock »). `null` = ما نشرش ⇒ ما نمنعوش، الخادم
 * يبقى الحكم على التوفّر.
 */
export function stockForSelection(capture: Json, selection: Record<string, string>): number | null {
  if (!capture || typeof capture !== 'object') return null;
  const variants = localVariantsFromCapture(capture);
  const chosen = variants.find((variant) => matchesSelection(variant.attributes, selection));
  if (chosen?.stock != null) return chosen.stock;
  const amazon = isRecord(capture.amazon) ? capture.amazon : null;
  const shownAsin = amazon ? text(amazon.selectedAsin).toUpperCase() : '';
  /* Sans table de variantes, `selectionIsShown` reconnaît la combinaison que la
     page affiche (groupes nommés + `selected`) : le stock annoncé sur la fiche
     est le sien, pas celui d'un autre choix. */
  const isShown = chosen
    ? shownAsin !== '' && chosen.asin === shownAsin
    : (Object.keys(selection).length === 0 || selectionIsShown(capture, selection));
  return isShown ? stockFromAvailabilityText(capture.availabilityText) : null;
}

/**
 * حالة التوفّر كما نشرتها الصفحة، بكلمات قليلة مغلقة.
 *
 * علاش لازم: على فصلة بفيها لون ومقاس، الدليل لكل قيمة ينجم يكون «غير معروف»
 * (Amazon ما تنشرش حالة لكل pastille في كل تصميم). الصفحة، مع ذلك، تكتب
 * «In Stock» أو «Currently unavailable» — وهذا دليل على **التركيبة المعروضة**،
 * موش على كل التركيبات. بلا هذا، ورقة على منتوج معروض ومتوفّر تقول
 * «Stock non confirmé» وتمنع الإضافة (صورة Oura، 23/10).
 */
export type LocalPageAvailability = 'AVAILABLE' | 'OUT_OF_STOCK' | 'UNKNOWN';

const OUT_OF_STOCK_WORDS = /(out\s*of\s*stock|outofstock|unavailable|currently unavailable|sold\s*out|épuisé|epuise|indisponible|rupture|nicht verfügbar|ausverkauft|derzeit nicht|agotado|sin existencias|esaurito|non disponibile|غير متوفر|نفد)/i;
const IN_STOCK_WORDS = /(in\s*stock|instock|available|disponible|en stock|auf lager|lieferbar|add\s*to\s*(?:bag|cart|basket)|buy\s*now|ajouter\s*(?:au\s*)?(?:panier|sac)|in\s*(?:den\s*warenkorb|die\s*einkaufstasche)|a(?:ñ|n)adir\s*(?:a\s*la\s*(?:bolsa|cesta)|al\s*carrito)|aggiungi\s*(?:al\s*carrello|alla\s*borsa)|أضف\s*إلى\s*(?:السلة|العربة|الحقيبة)|إضافة\s*إلى\s*(?:السلة|العربة|الحقيبة)|متوفر|متوفّر)/i;

/**
 * التوفّر من نصوص الصفحة. **السلبي يغلب**: كي الصفحة تقول «غير متوفر» في
 * مكان، ما ناخذوش «متوفر» من مكان آخر. والزرّ المعطّل (`[disabled]`) ما يثبتش
 * توفّراً — يثبت العكس أو لا شي.
 */
export function pageAvailabilityFromCapture(capture: Json): LocalPageAvailability {
  if (!capture || typeof capture !== 'object') return 'UNKNOWN';
  const addToCart = text(capture.addToCartText);
  if (/\[disabled\]/i.test(addToCart)) return 'UNKNOWN';
  const evidence = [text(capture.availabilityText), addToCart].filter(Boolean).join(' | ');
  if (!evidence) return 'UNKNOWN';
  if (OUT_OF_STOCK_WORDS.test(evidence)) return 'OUT_OF_STOCK';
  if (IN_STOCK_WORDS.test(evidence)) return 'AVAILABLE';
  return 'UNKNOWN';
}

/** هل الاختيار الحالي هو التركيبة **المعروضة** في الصفحة؟ (دليل الصفحة يخصّها وحدها) */
export function selectionIsShown(capture: Json, selection: Record<string, string>): boolean {
  if (!capture || typeof capture !== 'object') return false;
  const chosen = Object.keys(selection);
  if (!chosen.length) return false;
  const amazon = isRecord(capture.amazon) ? capture.amazon : null;
  const shownAsin = amazon ? text(amazon.selectedAsin).toUpperCase() : '';
  const aliexpress = isRecord(capture.aliexpress) ? capture.aliexpress : null;
  const shownAeSku = aliexpress && /^\d{5,24}$/.test(text(aliexpress.selectedSkuId))
    ? `ae:${text(aliexpress.selectedSkuId)}`
    : '';
  const variants = localVariantsFromCapture(capture);
  if (variants.length) {
    const match = variants.find((variant) => matchesSelection(variant.attributes, selection));
    if (match && shownAsin) return match.asin === shownAsin;
    if (match && shownAeSku) return match.asin === shownAeSku;
  }
  /* Boutique sans table de variantes : la page dit elle-même quelle valeur est
     affichée (`variantGroups[].selected`). Si chaque valeur choisie est celle
     qu'elle affiche, la preuve de page porte bien sur cette combinaison. */
  if (!Array.isArray(capture.variantGroups)) return false;
  for (const [name, value] of Object.entries(selection)) {
    const group = capture.variantGroups.find((entry) => isRecord(entry)
      && text(entry.name).toLowerCase() === name.trim().toLowerCase());
    if (!group || !isRecord(group) || !Array.isArray(group.selected)) return false;
    if (!group.selected.some((selected) => text(selected).toLowerCase() === String(value).toLowerCase())) return false;
  }
  return true;
}

/** « Only 6 left in stock », « plus que 3 », « nur noch 2 auf Lager » ⇒ nombre borné. */
export function stockFromAvailabilityText(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const match = /(?:only\s+)?(\d{1,3})\s+(?:left in stock|remaining|available)/i.exec(raw)
    ?? /(?:il ne reste plus que|plus que)\s*(\d{1,3})/i.exec(raw)
    ?? /(?:nur noch|noch)\s*(\d{1,3})\s*(?:auf lager|verfügbar|verfuegbar)/i.exec(raw)
    ?? /(?:بقي|متبقي)\s*(\d{1,3})/.exec(raw);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isInteger(count) && count > 0 && count <= 999 ? count : null;
}

/** Groupes d'attributs (taille, couleur…) dans l'ordre de la page. */
export function groupsFromVariants(variants: LocalVariant[]): AyWebsVariantGroup[] {
  const groups = new Map<string, string[]>();
  for (const variant of variants) {
    for (const [name, value] of Object.entries(variant.attributes)) {
      const values = groups.get(name) ?? [];
      if (!values.includes(value)) values.push(value);
      groups.set(name, values);
    }
  }
  return [...groups.entries()].map(([attribute, values]) => ({ attribute, values }));
}

/** Options pour la feuille : l'ASIN / identifiant de matrice est le `sourceVariantId`. */
export function optionsFromVariants(variants: LocalVariant[]): AyWebsVariantOption[] {
  return variants.map((variant) => ({
    sourceVariantId: variant.asin,
    variantUrl: variant.variantUrl || null,
    attributes: variant.attributes,
    label: Object.values(variant.attributes).join(' / '),
    price: null,
    currency: '',
    quotedPrice: null,
    quotedCurrency: '',
    priceSource: 'UNKNOWN',
    availability: variant.availability,
    availabilityReason: '',
    stock: variant.stock,
    image: variant.image || '',
    totalTnd: null,
  }));
}

/** Titre, image et boutique depuis la capture — sans prix (le prix vient du serveur à l'ajout). */
export function productFromCapture(capture: Json, url: string, storeId: string, storeName: string): AyWebsResolvedProduct {
  const amazon = isRecord(capture.amazon) ? capture.amazon : null;
  const shein = isRecord(capture.shein) ? capture.shein : null;
  const aliexpress = isRecord(capture.aliexpress) ? capture.aliexpress : null;
  const pageAsin = amazon ? text(amazon.pageAsin).toUpperCase() : '';
  const sheinGoodsId = shein && /^\d{5,16}$/.test(text(shein.pageGoodsId)) ? `SHEIN-${text(shein.pageGoodsId)}` : '';
  const aeItemId = aliexpress && /^\d{6,20}$/.test(text(aliexpress.pageItemId)) ? `AE-${text(aliexpress.pageItemId)}` : '';
  const images = Array.isArray(capture.images)
    ? capture.images.map((item) => (isRecord(item) ? text(item.url) : text(item))).filter((item) => item.startsWith('http'))
    : [];
  let domain = '';
  try { domain = new URL(url).host; } catch { domain = ''; }
  const unknown: AyWebsAvailability = { state: 'UNKNOWN', reason: '', checkedAt: '', source: 'capture', quantityHint: null };
  return {
    productId: pageAsin || sheinGoodsId || aeItemId,
    storeId,
    storeName,
    sourceUrl: url,
    sourceDomain: domain,
    title: text(capture.title),
    brand: text(capture.brand),
    images,
    price: null,
    currency: '',
    priceVerified: false,
    currencyVerified: false,
    availability: unknown,
    purchaseMode: '',
    integrationType: '',
    ayroviPricing: null,
    variantGroups: [],
    variantDetails: [],
    variantQuotes: [],
    fromCache: false,
    cacheAgeMs: null,
  };
}

/**
 * Prêt à confirmer ? Règles locales (plus strictes que « rien de connu ») :
 *  • des attributs publiés ⇒ il faut un choix complet ;
 *  • le choix doit correspondre à une variante avec une disponibilité PROUVÉE ;
 *  • sans variante : disponibilité prouvée par le texte de la page, sinon refus.
 */
export function localAddReadiness(input: {
  groups: AyWebsVariantGroup[];
  variants: LocalVariant[];
  selection: Record<string, string>;
  pageInStockText: boolean;
  /** États publiés par valeur (23/10/2026) — prouvent un choix sans table de combinaisons. */
  valueStates?: LocalValueStates;
  /**
   * حالة التوفّر كما نشرتها الصفحة، و`pageShowsSelection` = الاختيار هو
   * التركيبة المعروضة. الصفحة تشهد على **تركيبتها** فقط: كي المستعمل يبدّل
   * اللون، دليل الصفحة ما يغطّيهش، و«غير معروف» تبقى «غير معروفة».
   */
  pageAvailability?: LocalPageAvailability;
  pageShowsSelection?: boolean;
}): { ready: boolean; code: AyWebsAddBlockCode; missingAttributes: string[]; availability: AyWebsAvailability['state'] } {
  const page: LocalPageAvailability = input.pageAvailability
    ?? (input.pageInStockText ? 'AVAILABLE' : 'UNKNOWN');
  const shown = input.pageShowsSelection === true;
  const missingAttributes = input.groups
    .filter((group) => !input.selection[group.attribute.toLowerCase()])
    .map((group) => group.attribute);
  if (input.groups.length && missingAttributes.length) {
    return { ready: false, code: 'VARIANT_REQUIRED', missingAttributes, availability: 'UNKNOWN' };
  }
  if (!input.groups.length) {
    return page === 'AVAILABLE'
      ? { ready: true, code: '', missingAttributes: [], availability: 'AVAILABLE' }
      : { ready: false, code: page === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : 'STOCK_UNKNOWN', missingAttributes: [], availability: page };
  }
  const chosenValues = Object.entries(input.selection)
    .map(([name, value]) => input.valueStates?.[name.trim().toLowerCase()]?.[String(value).trim().toLowerCase()])
    .filter((state): state is LocalValueState => Boolean(state));
  const chosen = Object.entries(input.selection).map(([k, v]) => `${k.trim().toLowerCase()}=${v.toLowerCase()}`).sort().join('|');
  const match = input.variants.find((variant) => Object.entries(variant.attributes)
    .map(([k, v]) => `${k.trim().toLowerCase()}=${v.toLowerCase()}`).sort().join('|') === chosen);
  if (match?.availability === 'OUT_OF_STOCK') {
    return { ready: false, code: 'VARIANT_UNAVAILABLE', missingAttributes: [], availability: 'OUT_OF_STOCK' };
  }
  if (match?.availability === 'AVAILABLE') {
    return { ready: true, code: '', missingAttributes: [], availability: match.stock != null ? 'LOW_STOCK' : 'AVAILABLE' };
  }
  /* Une valeur publiée INDISPONIBLE bloque lorsque la matrice n'a pas prouvé la combinaison exacte en stock. */
  if (chosenValues.some((state) => state.state === 'OUT_OF_STOCK')) {
    return { ready: false, code: 'VARIANT_UNAVAILABLE', missingAttributes: [], availability: 'OUT_OF_STOCK' };
  }
  if (!match) {
    /* Toutes les valeurs choisies sont publiées DISPONIBLES ⇒ le marchand a dit,
       valeur par valeur, que ce choix est achetable. Aucune combinaison n'est
       inventée : on ne fait que lire ce que la page affiche sur les pastilles. */
    const allPublished = chosenValues.length === Object.keys(input.selection).length
      && chosenValues.length > 0
      && chosenValues.every((state) => state.state === 'AVAILABLE');
    /* Le choix EST celui que la page affiche (taille présélectionnée, Zalando) :
       son bandeau « en stock » porte sur LUI. Sans cette règle, une fiche dont la
       page ne publie pas de prix par valeur répondait « stock non confirmé »
       alors qu'elle affichait la taille choisie et « Ajouter au panier ». */
    if (shown && page === 'OUT_OF_STOCK') {
      return { ready: false, code: 'OUT_OF_STOCK', missingAttributes: [], availability: 'OUT_OF_STOCK' };
    }
    if (shown && page === 'AVAILABLE') {
      const stock = chosenValues
        .map((state) => state.stock)
        .filter((value): value is number => typeof value === 'number' && value > 0);
      return {
        ready: true, code: '', missingAttributes: [],
        availability: stock.length ? 'LOW_STOCK' : 'AVAILABLE',
      };
    }
    if (allPublished) {
      const stock = chosenValues.reduce<number | null>((min, state) => (
        state.stock != null && (min == null || state.stock < min) ? state.stock : min
      ), null);
      return { ready: true, code: '', missingAttributes: [], availability: stock != null ? 'LOW_STOCK' : 'AVAILABLE' };
    }
    return { ready: false, code: 'VARIANT_UNKNOWN', missingAttributes: [], availability: 'UNKNOWN' };
  }
  /* Le choix EST la combinaison affichée : le bandeau de disponibilité de la
     page porte sur elle. C'est une preuve publiée par le marchand, pas une
     déduction — et elle ne s'étend JAMAIS à une autre combinaison. */
  if (shown && page === 'AVAILABLE') {
    return { ready: true, code: '', missingAttributes: [], availability: match.stock != null ? 'LOW_STOCK' : 'AVAILABLE' };
  }
  if (shown && page === 'OUT_OF_STOCK') {
    return { ready: false, code: 'OUT_OF_STOCK', missingAttributes: [], availability: 'OUT_OF_STOCK' };
  }
  return { ready: false, code: 'STOCK_UNKNOWN', missingAttributes: [], availability: 'UNKNOWN' };
}
