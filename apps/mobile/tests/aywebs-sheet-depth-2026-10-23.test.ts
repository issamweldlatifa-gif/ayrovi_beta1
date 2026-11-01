/**
 * AYWEBs — ورقة الاختيار تقرا **العمق**، موش واجهة الصفحة (23/10/2026).
 *
 * تقرير الجهاز، بثلاث صور :
 *   1. Amazon، سماعات بثلاثة ألوان — الورقة تعرض الأسود/الوردي/الأبيض بلا ثمن
 *      وبلا توفّر، وكل تبديل لون يطلب **حقن جديد** للقارئ. والصفحة نفسها تنشر،
 *      على كارت كل لون : « $88.00 · In Stock »، « 5 options from $56.32 »…
 *   2. Zalando — ورقة بلا حتى خيار، ومكتوب « التاجر ما نشرش خيارات »، والحال
 *      أنّ الصفحة تنشر المقاس والثمن. المجموعات (`variantGroups`) كانت تُقرا
 *      وتُرسل… ثم تُهمَل في التطبيق.
 *   3. ثمن ملزوق : « 12,95 €TVA incluse150 ml (8,63 € / 100 ml) » كجملة وحدة.
 *
 * ما تمنعو هذه الاختبارات :
 *   • لون/مقاس/حجم منشور على الصفحة ⇒ يبان في الورقة بثمنو وحالتو، من **نفس**
 *     الكابتشر (حقن واحد) ;
 *   • « à partir de » يبقى « à partir de » : ما يتقدّمش كثمن مؤكّد ;
 *   • قيمة معلّنة غير متوفّرة ⇒ الإضافة مرفوضة، والقيمة الأخرى ما تتلوّثش ؛
 *   • الثمن المعروض على الشاشة = مبلغ + ملاحظة، موش جملة ملزوقة.
 */
import { describe, expect, it } from 'vitest';

import {
  defaultSelectionFromCapture, displayPriceForSelection, groupsFromCapture, localAddReadiness,
  localVariantsFromCapture, selectionHasPublishedPrice, selectionIsShown, splitMerchantPrice,
  valueStatesFromCapture,
} from '@/features/aywebs/localProduct';

/* ── 1. Amazon : trois couleurs, un seul clic, toutes les données ───────── */
const AMAZON = {
  title: 'Amazon.com: Sony WH-CH720N Wireless Noise Cancelling Over-Ear Headphones',
  availabilityText: 'In Stock',
  addToCartText: 'Add to Cart',
  priceCandidates: [{ text: '$88.00', source: 'dom' }],
  amazon: {
    pageAsin: 'B0BLACK001',
    selectedAsin: 'B0BLACK001',
    /* Twister rendu SANS table de variantes : les options portent tout. C'est le
       cas de la capture du client — et c'est ce que l'ancien lecteur jetait. */
    variants: [],
    options: [
      { dimension: 'Color', value: 'Black', asin: 'B0BLACK001', selected: true, availabilityEvidence: 'available', price: '$88.00', stock: 6 },
      { dimension: 'Color', value: 'Pink', asin: 'B0PINK0002', selected: false, availabilityEvidence: 'unknown', price: '$56.32', priceFrom: true },
      { dimension: 'Color', value: 'White', asin: 'B0WHITE003', selected: false, availabilityEvidence: 'unknown', price: '$88.00', priceFrom: true },
    ],
  },
};

/* ── 2. Boutique du catalogue : groupes nommés, un état par valeur ──────── */
const ZALANDO = {
  title: 'RITUALS FACE CLEANSING FOAM - HOMME - WOODY',
  availabilityText: 'En stock',
  addToCartText: 'Ajouter au panier',
  priceCandidates: [{ text: '12,95 €', source: 'json_ld' }],
  variantGroups: [
    {
      name: 'Taille',
      values: ['150 ml', '250 ml'],
      selected: ['150 ml'],
      options: [
        { value: '150 ml', available: true, price: '12,95 €', priceFrom: false },
        { value: '250 ml', available: false, price: '19,95 €', priceFrom: false },
      ],
    },
  ],
};

describe('Amazon — un seul clic, les trois couleurs dans la feuille', () => {
  const variants = localVariantsFromCapture(AMAZON);
  const groups = groupsFromCapture(AMAZON, variants);
  const states = valueStatesFromCapture(AMAZON);

  it('les dimensions viennent des OPTIONS du twister quand la table est vide', () => {
    expect(groups).toEqual([{ attribute: 'color', values: ['Black', 'Pink', 'White'] }]);
    expect(variants.map((variant) => variant.asin)).toEqual(['B0BLACK001', 'B0PINK0002', 'B0WHITE003']);
  });

  it('chaque couleur porte le prix et l’état publiés SUR SA CARTE', () => {
    expect(states.color.black).toMatchObject({ state: 'AVAILABLE', price: '$88.00', stock: 6 });
    expect(states.color.pink).toMatchObject({ state: 'UNKNOWN', price: '$56.32', priceFrom: true });
    expect(states.color.white).toMatchObject({ state: 'UNKNOWN', price: '$88.00', priceFrom: true });
  });

  it('le prix de la couleur choisie est là, sans relire la page', () => {
    expect(displayPriceForSelection(AMAZON, { color: 'Black' })).toEqual({ text: '$88.00', priceFrom: false });
    /* « from $56.32 » reste une entrée de gamme — jamais présentée comme un prix ferme. */
    expect(displayPriceForSelection(AMAZON, { color: 'Pink' })).toEqual({ text: '$56.32', priceFrom: true });
  });

  it('Black est prêt (stock publié) ; Pink reste honnêtement « non confirmé »', () => {
    const black = localAddReadiness({
      groups, variants, selection: { color: 'Black' }, pageInStockText: true,
      pageAvailability: 'AVAILABLE', pageShowsSelection: selectionIsShown(AMAZON, { color: 'Black' }),
      valueStates: states,
    });
    expect(black).toMatchObject({ ready: true, availability: 'LOW_STOCK' });

    const pink = localAddReadiness({
      groups, variants, selection: { color: 'Pink' }, pageInStockText: true,
      pageAvailability: 'AVAILABLE', pageShowsSelection: selectionIsShown(AMAZON, { color: 'Pink' }),
      valueStates: states,
    });
    /* Le bandeau « In Stock » décrit la combinaison AFFICHÉE (Black) : il ne
       s'étend pas à Pink. La feuille proposera « vérifier ce choix », une fois. */
    expect(pink.ready).toBe(false);
    expect(pink.code).toBe('STOCK_UNKNOWN');
  });
});

describe('Zalando — les groupes nommés remplissent la feuille', () => {
  const variants = localVariantsFromCapture(ZALANDO);
  const groups = groupsFromCapture(ZALANDO, variants);
  const states = valueStatesFromCapture(ZALANDO);

  it('la feuille n’est plus vide : le groupe et ses valeurs sont là', () => {
    expect(groups).toEqual([{ attribute: 'Taille', values: ['150 ml', '250 ml'] }]);
    /* Le nom AFFICHÉ du groupe (« Taille ») est conservé : c'est lui que la
       feuille écrit au-dessus des pastilles. */
    expect(variants.map((variant) => variant.attributes)).toEqual([
      { Taille: '150 ml' }, { Taille: '250 ml' },
    ]);
  });

  it('une valeur désactivée par la page est INDISPONIBLE — et bloque ce choix', () => {
    expect(states.taille['250 ml']).toMatchObject({ state: 'OUT_OF_STOCK' });
    const blocked = localAddReadiness({
      groups, variants, selection: { taille: '250 ml' }, pageInStockText: true,
      pageAvailability: 'AVAILABLE', pageShowsSelection: false, valueStates: states,
    });
    expect(blocked).toMatchObject({ ready: false, code: 'VARIANT_UNAVAILABLE', availability: 'OUT_OF_STOCK' });
  });

  it('la feuille s’ouvre SUR la combinaison affichée, avec SON prix', () => {
    /* Zalando présélectionne une taille : la feuille doit s'ouvrir dessus, sinon
       le prix de page ne s'applique à rien et le client croit la fiche vide. */
    const selection = defaultSelectionFromCapture(ZALANDO, groups);
    expect(selection).toEqual({ taille: '150 ml' });
    expect(displayPriceForSelection(ZALANDO, selection)).toEqual({ text: '12,95 €', priceFrom: false });
  });

  it('une autre valeur garde SON prix publié — jamais celui de la page', () => {
    expect(displayPriceForSelection(ZALANDO, { taille: '250 ml' }))
      .toEqual({ text: '19,95 €', priceFrom: false });
  });

  it('la valeur affichée est prouvée par la page : ajout permis', () => {
    const ready = localAddReadiness({
      groups, variants, selection: { taille: '150 ml' }, pageInStockText: true,
      pageAvailability: 'AVAILABLE', pageShowsSelection: selectionIsShown(ZALANDO, { taille: '150 ml' }),
      valueStates: states,
    });
    expect(ready).toMatchObject({ ready: true, availability: 'AVAILABLE' });
  });

  it('le choix publié « disponible » suffit même sans bandeau de page', () => {
    const ready = localAddReadiness({
      groups, variants, selection: { taille: '150 ml' }, pageInStockText: false,
      pageAvailability: 'UNKNOWN', pageShowsSelection: false, valueStates: states,
    });
    expect(ready).toMatchObject({ ready: true, availability: 'AVAILABLE' });
  });
});

/**
 * 🔴 الاختبار اللي كان ناقص (23/10) : « ورقة تفتح مرّة واحدة ».
 * كل لون عندو ثمنو المنشور تحتو ⇒ الخادم يقدر ي chiffrer التركيبة من نفس
 * الكابتشر. وإذا الثمن « à partir de » ⇒ ما ينفعش، ونرجعو لقراءة صفحة القيمة.
 */
describe('devis sans relire la page — le prix publié par valeur suffit', () => {
  const PRICED = {
    title: 'Sony WH-CH720N',
    availabilityText: 'In Stock',
    addToCartText: 'Add to Cart',
    priceCandidates: [{ text: '$88.00', source: 'dom' }],
    amazon: {
      pageAsin: 'B0BLACK001',
      selectedAsin: 'B0BLACK001',
      variants: [],
      options: [
        { dimension: 'Color', value: 'Black', asin: 'B0BLACK001', selected: true, availabilityEvidence: 'available', price: '$88.00', stock: 6 },
        { dimension: 'Color', value: 'White', asin: 'B0WHITE003', selected: false, availabilityEvidence: 'available', price: '$92.50', stock: 3 },
        { dimension: 'Color', value: 'Pink', asin: 'B0PINK0002', selected: false, availabilityEvidence: 'unknown', price: '$56.32', priceFrom: true },
        { dimension: 'Color', value: 'Sand', asin: 'B0SAND0001', selected: false, availabilityEvidence: 'unknown' },
      ],
    },
  };
  const groups = groupsFromCapture(PRICED);

  it('chaque couleur qui publie SON prix ferme peut être chiffrée sans relecture', () => {
    expect(selectionHasPublishedPrice(PRICED, { color: 'Black' })).toBe(true);
    expect(selectionHasPublishedPrice(PRICED, { color: 'White' })).toBe(true);
    expect(groups).toEqual([{ attribute: 'color', values: ['Black', 'White', 'Pink', 'Sand'] }]);
  });

  it('« à partir de » ou pas de prix ⇒ pas de devis : on relit la page de CE choix', () => {
    expect(selectionHasPublishedPrice(PRICED, { color: 'Pink' })).toBe(false);
    expect(selectionHasPublishedPrice(PRICED, { color: 'Sand' })).toBe(false);
    expect(selectionHasPublishedPrice(PRICED, {})).toBe(false);
  });

  it('la feuille change de couleur sans réinjecter le lecteur : l’état vient de la capture', () => {
    const states = valueStatesFromCapture(PRICED);
    const white = localAddReadiness({
      groups, variants: localVariantsFromCapture(PRICED), selection: { color: 'White' },
      pageInStockText: true, pageAvailability: 'AVAILABLE',
      pageShowsSelection: selectionIsShown(PRICED, { color: 'White' }), valueStates: states,
    });
    /* La page affiche Black ; White n'est ni « affichée » ni déduite du bandeau :
       elle est prouvée par SA carte (stock + état publiés). */
    expect(white).toMatchObject({ ready: true, availability: 'LOW_STOCK' });
    expect(displayPriceForSelection(PRICED, { color: 'White' })).toEqual({ text: '$92.50', priceFrom: false });
  });
});

describe('prix affiché — le montant d’un côté, la note de l’autre', () => {
  it('« 12,95 €TVA incluse150 ml (8,63 € / 100 ml) » ne s’affiche plus d’un bloc', () => {
    expect(splitMerchantPrice('12,95 €TVA incluse150 ml (8,63 € / 100 ml)')).toEqual({
      amount: '12,95 €',
      note: 'TVA incluse 150 ml (8,63 € / 100 ml)',
    });
  });

  it('un prix propre reste intact ; un texte sans devise n’est pas découpé', () => {
    expect(splitMerchantPrice('$88.00')).toEqual({ amount: '$88.00', note: '' });
    expect(splitMerchantPrice('1 299,00 €')).toEqual({ amount: '1 299,00 €', note: '' });
    expect(splitMerchantPrice('Prix non publié')).toEqual({ amount: 'Prix non publié', note: '' });
  });
});

describe('ce qui reste refusé', () => {
  it('aucune option + stock inconnu ⇒ pas d’ajout (la feuille dit pourquoi)', () => {
    const result = localAddReadiness({
      groups: [], variants: [], selection: {}, pageInStockText: false,
      pageAvailability: 'UNKNOWN', pageShowsSelection: false, valueStates: {},
    });
    expect(result).toMatchObject({ ready: false, code: 'STOCK_UNKNOWN', availability: 'UNKNOWN' });
  });

  it('une valeur non publiée ne devient jamais disponible par déduction', () => {
    const result = localAddReadiness({
      groups: [{ attribute: 'Taille', values: ['150 ml', '250 ml'] }],
      variants: [], selection: { taille: '250 ml' }, pageInStockText: true,
      pageAvailability: 'AVAILABLE', pageShowsSelection: false, valueStates: {},
    });
    /* « page AVAILABLE » ne prouve que la valeur AFFICHÉE (150 ml) ; 250 ml
       n'est pas celle que la page affiche ⇒ UNKNOWN, pas AVAILABLE. */
    expect(result.ready).toBe(false);
    expect(result.availability).toBe('UNKNOWN');
  });
});
