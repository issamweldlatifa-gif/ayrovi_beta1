// @vitest-environment jsdom
/**
 * Écrans clients AYWEBs — contrat d'honnêteté.
 *
 * Le MASTER ORDER interdit à l'UI d'inventer quoi que ce soit : disponibilité
 * UNKNOWN jamais convertie en disponible (§14), prix changé = décision explicite
 * du client (§18/§29), devis et frais lus du serveur sans formule locale (§19),
 * aucun succès de paiement simulé (§48), contrat d'erreur affiché avec sa sortie
 * (§44), aucun prix ni statut envoyé par le client (§45), double identité source /
 * AYROVI (§53) et demande avec URL pour une boutique hors registre (§23).
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import * as api from '../client/src/features/aywebs/api';
import { AyWebsProductSheet } from '../client/src/features/aywebs/components/AyWebsProductSheet';
import { AyWebsCartScreen } from '../client/src/features/aywebs/components/AyWebsCartScreen';
import { AyWebsCheckoutScreen } from '../client/src/features/aywebs/components/AyWebsCheckoutScreen';
import { AyWebsOrdersScreen } from '../client/src/features/aywebs/components/AyWebsOrdersScreen';
import { AyWebsRequestForm } from '../client/src/features/aywebs/components/AyWebsRequestForm';
import { AyWebsHome } from '../client/src/features/aywebs/components/AyWebsHome';
import { AyWebsStoreBrowser } from '../client/src/features/aywebs/components/AyWebsStoreBrowser';
import { AyWebsScreen } from '../client/src/features/aywebs/AyWebsScreen';

vi.mock('../client/src/features/aywebs/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client/src/features/aywebs/api')>();
  return {
    ...actual,
    resolveAyWebsProduct: vi.fn(),
    addAyWebsCartItem: vi.fn(),
    getAyWebsHome: vi.fn(),
    analyzeAyWebsPage: vi.fn(),
    getAyWebsStores: vi.fn(),
    captureAyWebsProduct: vi.fn(),
    setAyWebsCsrfToken: vi.fn(),
    getAyWebsCart: vi.fn(),
    verifyAyWebsCart: vi.fn(),
    acceptAyWebsCartPrice: vi.fn(),
    bridgeAyWebsCartToAyrovi: vi.fn(),
    previewAyWebsCheckout: vi.fn(),
    getAyWebsPaymentMethods: vi.fn(),
    createAyWebsOrder: vi.fn(),
    submitAyWebsOrder: vi.fn(),
    createAyWebsPaymentIntent: vi.fn(),
    confirmAyWebsPayment: vi.fn(),
    listAyWebsOrders: vi.fn(),
    getAyWebsOrder: vi.fn(),
    listAyWebsPurchaseRequests: vi.fn(),
    createAyWebsPurchaseRequest: vi.fn(),
    createAyWebsStoreRequest: vi.fn(),
    getAyWebsVariants: vi.fn(),
  };
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
/** Toute alerte React (imbrication DOM invalide, clé manquante…) est un défaut d'écran. */
let consoleErrors: string[] = [];

const buttons = () => [...host.querySelectorAll('button')] as HTMLButtonElement[];
/** Nom accessible : texte, aria-label ou title (les boutons d'icône n'ont pas de texte). */
const nameOf = (button: HTMLButtonElement) => (button.textContent || '').trim()
  || button.getAttribute('aria-label') || button.getAttribute('title') || '';
const buttonByLabel = (label: string) => buttons().find((button) => nameOf(button).includes(label));
const inputs = () => [...host.querySelectorAll('input, textarea, select')] as HTMLInputElement[];
/** Le CTA d'ajout au panier AyWebs (§15), sans ambiguïté avec les autres boutons. */
const ctaAddButton = () => buttons().find(
  (button) => button.className.includes('ay-btn-cta') && /panier AyWebs|Épuisé|Choisissez une version/.test(button.textContent || ''),
);

beforeEach(() => {
  consoleErrors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map((value) => String(value)).join(' '));
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  // Hermeticité : aucune requête réseau réelle depuis les écrans.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network disabled in tests'); }));
  // La passerelle s'ouvre dans un onglet externe : jsdom n'implémente pas window.open.
  vi.spyOn(window, 'open').mockImplementation(() => null);
  vi.mocked(api.listAyWebsPurchaseRequests).mockResolvedValue([]);
  vi.mocked(api.getAyWebsPaymentMethods).mockResolvedValue({ methods: ['COD', 'BANK_TRANSFER'], card_gateway_available: false, note: '' });
});

afterEach(async () => {
  expect(consoleErrors.filter((line) => /cannot contain a nested|validateDOMNesting|Each child in a list/.test(line))).toEqual([]);
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const render = (node: React.ReactElement) => act(async () => root.render(<LocaleProvider>{node}</LocaleProvider>));
const text = () => host.textContent || '';

/* ------------------------------------------------------------------ *
 * Fixtures — formes exactes des payloads §43
 * ------------------------------------------------------------------ */

const availability = (state: 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN', reason = '') => ({
  state, reason, checked_at: '2026-10-02T09:00:00.000Z', source: 'adapter', quantity_hint: null,
});

const productPayload = (overrides: Partial<api.AyWebsProductPayload> = {}): api.AyWebsProductPayload => ({
  product_id: 'aywsp_1',
  store_id: 'nike',
  store_name: 'Nike',
  source_url: 'https://www.nike.com/fr/dp/1',
  source_domain: 'www.nike.com',
  source_product_id: 'NIKE-AIR-MAX-95',
  title: 'Nike Air Max 95',
  description: 'Running rétro.',
  brand: 'Nike',
  images: [],
  price: 39.99,
  currency: 'USD',
  variants: [],
  variant_groups: [],
  selected_variant: null,
  availability: availability('UNKNOWN'),
  merchant: {},
  purchase_mode: 'MANUAL_REVIEW',
  integration_type: 'PARTIALLY_SUPPORTED',
  captured_at: '2026-10-02T09:00:00.000Z',
  evidence_hash: 'e3b0c44298fc1c14',
  ayrovi_pricing: { total_tnd: 299.42, pricing_version: 3, breakdown: { service: 16.48 } },
  ...overrides,
});

const resolveResult = (product: api.AyWebsProductPayload) => ({
  captureId: 'aywcap_1',
  status: 'READY',
  product,
  missing: [] as string[],
  scrapedProduct: null,
});

const cartItem = (overrides: Partial<api.AyWebsCartItemPayload> = {}): api.AyWebsCartItemPayload => ({
  id: 'aywci_1',
  item_number: 'AYWITEM-000123',
  store_id: 'nike',
  store_name: 'Nike',
  source_url: 'https://www.nike.com/fr/dp/1',
  title: 'Nike Air Max 95',
  images: [],
  unit_price: 39.99,
  currency: 'USD',
  variant_snapshot: { variantId: 'v1', attributes: { Couleur: 'Blanc', Taille: '41' }, quantity: 1 },
  variant_label: 'Blanc / 41',
  quantity: 1,
  availability: 'UNKNOWN',
  price_snapshot: null,
  pricing_tnd: 164.76,
  line_total_tnd: 164.76,
  evidence_hash: 'e3b0c44298fc1c14',
  status: 'ACTIVE',
  status_reason: '',
  customer_note: '',
  purchase_mode: 'MANUAL_REVIEW',
  checkout_ready: true,
  ...overrides,
});

const cartPayload = (items: api.AyWebsCartItemPayload[], overrides: Partial<api.AyWebsCartPayload> = {}): api.AyWebsCartPayload => ({
  cart: { id: 'aywc_1', status: 'OPEN', currency: 'TND', items_count: items.length },
  items,
  groups: [{ store_id: 'nike', store_name: 'Nike', integration_type: 'PARTIALLY_SUPPORTED', subtotal_tnd: 164.76, blocked_items: 0, items }],
  totals: { units: items.length, product_subtotal_tnd: 164.76, currency: 'TND', blocked_items: 0, checkout_ready: true },
  blockers: [],
  offline_notice: null,
  ...overrides,
});

const checkoutPayload = (overrides: Partial<api.AyWebsCheckoutPayload> = {}): api.AyWebsCheckoutPayload => ({
  currency: 'TND',
  lines: [{
    item_id: 'aywci_1', item_number: 'AYWITEM-000123', store_name: 'Nike', title: 'Nike Air Max 95',
    variant_label: 'Blanc / 41', quantity: 1, source_unit_price: 39.99, source_currency: 'USD',
    product_amount_tnd: 164.76, service_fee_tnd: 16.48, import_fee_tnd: 103.68, shipping_estimate_tnd: 6.5,
    line_total_tnd: 299.42, availability: 'UNKNOWN', checkout_ready: true, restricted: false, uncertain: false,
  }],
  fees: [
    { kind: 'service', code: 'SERVICE_FEE', label: 'Service AYROVI (10%)', label_ar: 'خدمة AYROVI', amount_tnd: 16.48 },
    { kind: 'import', code: 'IMPORT_FEE', label: 'Frais d’import estimés', label_ar: 'رسوم التوريد المقدرة', amount_tnd: 103.68, uncertain: true },
  ],
  totals: {
    product_subtotal_tnd: 164.76, service_fee_tnd: 16.48, import_fee_tnd: 103.68,
    shipping_estimate_tnd: 6.5, other_fee_tnd: 8, payable_tnd: 299.42, units: 1,
  },
  pricing_version: 3,
  blockers: [],
  warnings: [],
  computed_at: '2026-10-02T09:00:00.000Z',
  ...overrides,
});

const orderPayload = (overrides: Partial<api.AyWebsOrderPayload> = {}): api.AyWebsOrderPayload => ({
  id: 'ayword_1',
  order_number: 'AYW-000456',
  status: 'PURCHASE_PENDING',
  master_stage: 'PROCUREMENT',
  exception_state: 'PENDING_INTEGRATION',
  exception_reason: 'aucune_intégration_achat_marchand_automatisée:revue_humaine_requise',
  currency: 'TND',
  totals: {
    product_subtotal_tnd: 164.76, service_fee_tnd: 16.48, import_fee_tnd: 103.68,
    shipping_estimate_tnd: 6.5, other_fee_tnd: 8, payable_tnd: 299.42,
  },
  fees: [{ kind: 'service', code: 'SERVICE_FEE', label: 'Service AYROVI (10%)', amount_tnd: 16.48 }],
  pricing_version: 3,
  payment_status: 'PAID',
  payment_method: 'BANK_TRANSFER',
  payment_reference: 'AYWPAY-000789',
  paid_at: '2026-10-02T09:30:00.000Z',
  submitted_at: '2026-10-02T09:20:00.000Z',
  notes: '',
  items: [{
    id: 'aywoi_1', store_id: 'nike', store_name: 'Nike', source_url: 'https://www.nike.com/fr/dp/1',
    source_product_id: 'NIKE-AIR-MAX-95', title: 'Nike Air Max 95', images: [], unit_price: 39.99,
    currency: 'USD', quantity: 1, variant_label: 'Blanc / 41', line_total_tnd: 299.42,
    purchase_status: 'PENDING_INTEGRATION',
    purchase_reason: 'aucune_intégration_achat_marchand_automatisée:revue_humaine_requise',
    warehouse_state: 'NOT_RECEIVED',
  }],
  timeline: [
    { key: 'ORDER_SUBMITTED', state: 'done' },
    { key: 'PAYMENT_CONFIRMED', state: 'done' },
    { key: 'PURCHASE_COMPLETED', state: 'current' },
    { key: 'SUPPLIER_SHIPPED', state: 'pending' },
  ],
  created_at: '2026-10-02T09:10:00.000Z',
  updated_at: '2026-10-02T09:30:00.000Z',
  ...overrides,
});

const screenProps = {
  onBack: () => {},
  onOpenCart: () => {},
  onOpenRequestForm: () => {},
};

/* ------------------------------------------------------------------ *
 * Fiche produit (§12, §13, §14, §15, §28, §44, §45)
 * ------------------------------------------------------------------ */

describe('AYWEBs — fiche produit', () => {
  it('UNKNOWN reste UNKNOWN : « stock non publié », jamais « disponible » (§14)', async () => {
    vi.mocked(api.resolveAyWebsProduct).mockResolvedValue(resolveResult(productPayload()));
    await render(<AyWebsProductSheet url="https://www.nike.com/fr/dp/1" storeId="nike" {...screenProps} />);

    expect(text()).toContain('Stock non publié');
    expect(text()).not.toContain('Disponible chez le marchand');
    expect(text()).toContain('AYROVI le vérifie avant l’achat');
    // La preuve de lecture est montrée, pas cachée (§28).
    expect(text()).toContain('e3b0c44298fc1c14');
  });

  it('OUT_OF_STOCK désactive l’ajout et refuse toute substitution (§14, §30)', async () => {
    vi.mocked(api.resolveAyWebsProduct).mockResolvedValue(resolveResult(
      productPayload({ availability: availability('OUT_OF_STOCK', 'épuisé chez le marchand') }),
    ));
    await render(<AyWebsProductSheet url="https://www.nike.com/fr/dp/1" storeId="nike" {...screenProps} />);

    const add = ctaAddButton();
    expect(add).toBeDefined();
    expect(add!.disabled).toBe(true);
    expect(add!.textContent).toContain('Épuisé chez le marchand');
    expect(text()).toContain('aucune substitution automatique');
    expect(vi.mocked(api.addAyWebsCartItem)).not.toHaveBeenCalled();
  });

  it('une variante publiée non choisie bloque l’ajout (§13, §30)', async () => {
    vi.mocked(api.resolveAyWebsProduct).mockResolvedValue(resolveResult(productPayload({
      availability: availability('AVAILABLE'),
      variant_groups: [
        { attribute: 'Couleur', values: ['Blanc', 'Noir'] },
        { attribute: 'Taille', values: ['41', '42'] },
      ],
      variants: [
        { attribute: 'Couleur', value: 'Blanc', image: null },
        { attribute: 'Couleur', value: 'Noir', image: null },
        { attribute: 'Taille', value: '41', image: null },
        { attribute: 'Taille', value: '42', image: null },
      ],
    })));
    await render(<AyWebsProductSheet url="https://www.nike.com/fr/dp/1" storeId="nike" {...screenProps} />);

    expect(text()).toContain('Choisissez une version');
    expect(ctaAddButton()!.disabled).toBe(true);
    expect(ctaAddButton()!.textContent).toContain('Choisissez une version');

    // Choisir chaque attribut libère l'ajout : la sélection est arbitraire, pas couleur+taille figée.
    for (const label of ['Blanc', '41']) {
      const option = buttons().find((button) => (button.textContent || '').trim() === label);
      expect(option).toBeDefined();
      await act(async () => option!.click());
    }
    expect(ctaAddButton()!.disabled).toBe(false);
  });

  it('l’ajout n’envoie ni prix ni statut, puis propose Continuer / Voir le panier (§15, §45)', async () => {
    vi.mocked(api.resolveAyWebsProduct).mockResolvedValue(resolveResult(productPayload({ availability: availability('AVAILABLE') })));
    vi.mocked(api.addAyWebsCartItem).mockResolvedValue({ item: cartItem(), cart: cartPayload([cartItem()]) });
    await render(<AyWebsProductSheet url="https://www.nike.com/fr/dp/1" storeId="nike" {...screenProps} />);

    await act(async () => ctaAddButton()!.click());

    const body = vi.mocked(api.addAyWebsCartItem).mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['product_id', 'quantity', 'store_id', 'variant_attributes']);
    expect(JSON.stringify(body)).not.toMatch(/price|tnd|status|availability/i);

    expect(text()).toContain('Ajouté au panier AyWebs');
    expect(text()).toContain('AYWITEM-000123');
    expect(buttonByLabel('Continuer mes achats')).toBeDefined();
    expect(buttonByLabel('Voir mon panier AyWebs')).toBeDefined();
  });

  it('un refus serveur affiche le contrat d’erreur et une sortie réelle (§44)', async () => {
    vi.mocked(api.resolveAyWebsProduct).mockRejectedValue(new api.AyWebsRequestError(
      'STORE_CAPTURE_UNSUPPORTED',
      'STORE_CAPTURE_UNSUPPORTED',
      422,
      {
        errorCode: 'STORE_CAPTURE_UNSUPPORTED',
        userMessage: 'Cette boutique n’est pas encore intégrée pour la capture.',
        technicalMessage: 'adapter=generic capture=false',
        recoverable: true,
        retryAllowed: false,
        requiredAction: 'REQUEST_PURCHASE_WITH_URL',
      },
      ['REQUEST_PURCHASE_WITH_URL', 'BROWSE_STORE'],
    ));
    await render(<AyWebsProductSheet url="https://shop.example.tn/p/9" {...screenProps} />);

    expect(text()).toContain('Cette boutique n’est pas encore intégrée pour la capture.');
    expect(buttonByLabel('Demander un achat avec URL')).toBeDefined();
  });
});

/* ------------------------------------------------------------------ *
 * Panier multi-boutiques (§16, §17, §18, §29)
 * ------------------------------------------------------------------ */

describe('AYWEBs — panier', () => {
  it('un prix changé bloque la ligne et exige une décision explicite (§18, §29)', async () => {
    const changed = cartItem({
      status: 'PRICE_CHANGED',
      status_reason: 'prix source passé de 39.99 à 49.99 USD',
      checkout_ready: false,
    });
    vi.mocked(api.getAyWebsCart).mockResolvedValue(cartPayload([changed], {
      totals: { units: 1, product_subtotal_tnd: 164.76, currency: 'TND', blocked_items: 1, checkout_ready: false },
      blockers: [{ itemId: 'aywci_1', code: 'PRICE_CHANGED', message: 'Prix changé — décision requise', action: 'ACCEPT_OR_REMOVE' }],
    }));
    await render(<AyWebsCartScreen onBack={() => {}} onCheckout={() => {}} onOpenAyroviCart={() => {}} onOpenProduct={() => {}} onOpenOrders={() => {}} />);

    expect(text()).toContain('Prix changé');
    expect(buttonByLabel('Accepter le nouveau prix')).toBeDefined();
    expect(buttonByLabel('Retirer la ligne')).toBeDefined();
    // Aucun achat au nouveau prix sans accord : le paiement reste fermé.
    const pay = buttonByLabel('Corrigez les lignes signalées');
    expect(pay).toBeDefined();
    expect(pay!.disabled).toBe(true);
    expect(buttonByLabel('Passer au paiement AyWebs')).toBeUndefined();
  });

  it('accepter le nouveau prix passe par le serveur, jamais par un calcul local (§29)', async () => {
    const changed = cartItem({ status: 'PRICE_CHANGED', checkout_ready: false });
    vi.mocked(api.getAyWebsCart).mockResolvedValue(cartPayload([changed]));
    vi.mocked(api.acceptAyWebsCartPrice).mockResolvedValue({ item: cartItem(), cart: cartPayload([cartItem()]) });
    await render(<AyWebsCartScreen onBack={() => {}} onCheckout={() => {}} onOpenAyroviCart={() => {}} onOpenProduct={() => {}} onOpenOrders={() => {}} />);

    await act(async () => buttonByLabel('Accepter le nouveau prix')!.click());
    expect(vi.mocked(api.acceptAyWebsCartPrice)).toHaveBeenCalledWith('aywci_1');
  });

  it('le pont vers le panier AYROVI existe et reste distinct (§2, §16)', async () => {
    vi.mocked(api.getAyWebsCart).mockResolvedValue(cartPayload([cartItem()]));
    vi.mocked(api.bridgeAyWebsCartToAyrovi).mockResolvedValue({
      moved: [{ aywebsItemId: 'aywci_1', aywebsItemNumber: 'AYWITEM-000123', cartItemId: 'ci_1', store: 'Nike', title: 'Nike Air Max 95', quantity: 1, priceTnd: 164.76, duplicate: false }],
      skipped: [], totalItemsCount: 1, totalTnd: 164.76, deliveryTnd: 7, message: 'ok',
    });
    await render(<AyWebsCartScreen onBack={() => {}} onCheckout={() => {}} onOpenAyroviCart={() => {}} onOpenProduct={() => {}} onOpenOrders={() => {}} />);

    const bridge = buttons().find((button) => (button.textContent || '').includes('Transférer vers le panier AYROVI'));
    expect(bridge).toBeDefined();
    await act(async () => bridge!.click());
    expect(vi.mocked(api.bridgeAyWebsCartToAyrovi)).toHaveBeenCalled();
    expect(buttonByLabel('Passer au paiement AyWebs')!.disabled).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Devis et paiement (§19, §20, §48)
 * ------------------------------------------------------------------ */

const checkoutProps = { onBack: () => {}, onOpenCart: () => {}, onOpenOrders: () => {}, onRequireSignIn: () => {}, authenticated: true };

describe('AYWEBs — devis et paiement', () => {
  it('le devis est lu du serveur : montants et version tarifaire tels quels (§19)', async () => {
    vi.mocked(api.previewAyWebsCheckout).mockResolvedValue(checkoutPayload());
    await render(<AyWebsCheckoutScreen {...checkoutProps} />);

    expect(text()).toContain('164.76');
    expect(text()).toContain('103.68');
    expect(text()).toContain('299.42');
    expect(text()).toContain('Version tarifaire');
    expect(text()).toContain('3');
    // Un frais incertain est annoncé comme incertain, pas arrondi en certitude.
    expect(text()).toMatch(/incertain|estimé/i);
  });

  it('la carte est désactivée tant que la passerelle n’est pas configurée (§48)', async () => {
    vi.mocked(api.previewAyWebsCheckout).mockResolvedValue(checkoutPayload());
    vi.mocked(api.getAyWebsPaymentMethods).mockResolvedValue({ methods: ['CARD', 'BANK_TRANSFER', 'COD'], card_gateway_available: false, note: '' });
    await render(<AyWebsCheckoutScreen {...checkoutProps} />);

    const card = inputs().find((input) => input.value === 'CARD') as HTMLInputElement | undefined;
    expect(card).toBeDefined();
    expect(card!.disabled).toBe(true);
    const transfer = inputs().find((input) => input.value === 'BANK_TRANSFER') as HTMLInputElement | undefined;
    expect(transfer!.disabled).toBe(false);
  });

  it('un bloqueur empêche la création de commande (§19)', async () => {
    vi.mocked(api.previewAyWebsCheckout).mockResolvedValue(checkoutPayload({
      blockers: [{ itemId: 'aywci_1', code: 'CUSTOMER_ACTION_REQUIRED', message: 'Action requise chez le marchand', action: 'OPEN_STORE' }],
    }));
    await render(<AyWebsCheckoutScreen {...checkoutProps} />);

    expect(text()).toContain('Action requise chez le marchand');
    // Le CTA dit le blocage au lieu de promettre une commande, et il est inerte.
    const blocked = buttonByLabel('Paiement bloqué');
    expect(blocked).toBeDefined();
    expect(blocked!.disabled).toBe(true);
    expect(buttonByLabel('Créer la commande AyWebs')).toBeUndefined();
    expect(vi.mocked(api.createAyWebsOrder)).not.toHaveBeenCalled();
  });

  it('un échec de confirmation n’est jamais présenté comme un paiement réussi (§48)', async () => {
    vi.mocked(api.previewAyWebsCheckout).mockResolvedValue(checkoutPayload());
    vi.mocked(api.createAyWebsOrder).mockResolvedValue({
      order: orderPayload({ status: 'DRAFT', payment_status: 'PENDING', exception_state: null, exception_reason: '' }),
      preview: checkoutPayload(),
      purchaseIntegration: 'PENDING_INTEGRATION',
    });
    vi.mocked(api.submitAyWebsOrder).mockResolvedValue(orderPayload({ status: 'PAYMENT_PENDING', payment_status: 'PENDING' }));
    vi.mocked(api.createAyWebsPaymentIntent).mockResolvedValue({
      paymentId: 'aywpay_1', paymentNumber: 'AYWPAY-000789', orderId: 'ayword_1', orderNumber: 'AYW-000456',
      method: 'CARD', status: 'PENDING', amountTnd: 299.42, payUrl: 'https://gateway.example/pay/1',
      provider: 'stripe', providerReference: 'pi_1', transferInstructions: { available: false, label: '', details: '' },
      nextAction: 'REDIRECT_TO_GATEWAY', createdAt: '2026-10-02T09:00:00.000Z',
    } as any);
    vi.mocked(api.confirmAyWebsPayment).mockRejectedValue(new api.AyWebsRequestError(
      'PAYMENT_FAILED', 'PAYMENT_FAILED', 402,
      {
        errorCode: 'PAYMENT_FAILED',
        userMessage: 'La banque n’a pas encore confirmé ce paiement.',
        technicalMessage: 'gateway=pending',
        recoverable: true, retryAllowed: true, requiredAction: 'CHOOSE_PAYMENT',
      },
      [],
    ));
    await render(<AyWebsCheckoutScreen {...checkoutProps} />);

    // §21 — l'adresse de livraison est requise avant la création de commande.
    await act(async () => buttonByLabel('Créer la commande AyWebs')!.click());
    expect(vi.mocked(api.createAyWebsOrder)).not.toHaveBeenCalled();
    expect(text()).toContain('Complétez l’adresse de livraison');

    for (const placeholder of ['Nom et prénom', '+216 …', 'Tunis', 'Rue, numéro, complément…']) {
      const field = inputs().find((input) => input.placeholder === placeholder)!;
      expect(field, placeholder).toBeDefined();
      await act(async () => {
        setNativeValue(field, placeholder === '+216 …' ? '+216 20 000 000' : `Test ${placeholder}`);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await act(async () => buttonByLabel('Créer la commande AyWebs')!.click());
    expect(vi.mocked(api.createAyWebsOrder)).toHaveBeenCalledWith(expect.objectContaining({
      shipping_address: expect.objectContaining({ city: 'Test Tunis', phone: '+216 20 000 000' }),
    }));
    expect(text()).toContain('AYW-000456');
    // L'intégration d'achat est annoncée comme en attente, jamais comme exécutée.
    expect(text()).toMatch(/intégration|revue AYROVI/i);

    await act(async () => buttonByLabel('Démarrer le paiement')!.click());
    await act(async () => buttonByLabel('Vérifier mon paiement')!.click());

    expect(text()).toContain('La banque n’a pas encore confirmé ce paiement.');
    expect(text()).not.toContain('Paiement confirmé');
  });
});

/* ------------------------------------------------------------------ *
 * Achats (§21, §22, §36, §48, §53)
 * ------------------------------------------------------------------ */

describe('AYWEBs — suivi des achats', () => {
  it('double identité et achat non exécuté annoncé avec sa raison (§53, §48)', async () => {
    vi.mocked(api.listAyWebsOrders).mockResolvedValue([orderPayload()]);
    vi.mocked(api.getAyWebsOrder).mockResolvedValue(orderPayload());
    await render(<AyWebsOrdersScreen onBack={() => {}} onOpenProduct={() => {}} onRequireSignIn={() => {}} authenticated />);

    expect(text()).toContain('AYW-000456');
    await act(async () => buttonByLabel('AYW-000456')!.click());

    // Identité source jamais écrasée par l'identité AYROVI (§53).
    expect(text()).toContain('NIKE-AIR-MAX-95');
    expect(text()).toContain('Intégration d’achat en attente');
    expect(text()).toMatch(/revue humaine/i);
    // La timeline est celle du serveur, étapes faites et à venir comprises (§36).
    expect(text()).toContain('Paiement confirmé');
    expect(text()).toContain('Expédié par le fournisseur');
    expect(vi.mocked(api.getAyWebsOrder)).toHaveBeenCalledWith('ayword_1');
  });

  it('sans connexion, l’écran demande le compte AYROVI au lieu d’inventer des achats (§49)', async () => {
    await render(<AyWebsOrdersScreen onBack={() => {}} onOpenProduct={() => {}} onRequireSignIn={() => {}} authenticated={false} />);
    expect(vi.mocked(api.listAyWebsOrders)).not.toHaveBeenCalled();
    expect(buttonByLabel('Se connecter') || buttonByLabel('Connexion') || buttonByLabel('compte')).toBeDefined();
  });
});

/* ------------------------------------------------------------------ *
 * Demande avec URL (§23, §38)
 * ------------------------------------------------------------------ */

describe('AYWEBs — demande avec URL', () => {
  it('le formulaire envoie l’URL, la quantité et des attributs libres (§23)', async () => {
    vi.mocked(api.createAyWebsPurchaseRequest).mockResolvedValue({
      id: 'aywpr_1', request_number: 'AYWREQ-000001', store_id: '', store_name: 'shop.example.tn',
      product_url: 'https://shop.example.tn/p/9', source_domain: 'shop.example.tn', quantity: 2,
      product_name: 'Crème hydratante', variant_attributes: { color: 'Neutre', size: '250ml' },
      requirements: 'sans alcool', customer_notes: '', status: 'SUBMITTED', reason: null,
      decision_note: '', decided_at: null, order_id: null, next_action: 'WAIT_FOR_REVIEW',
      created_at: '2026-10-02T09:00:00.000Z',
    } as api.AyWebsPurchaseRequestPayload);
    await render(<AyWebsRequestForm mode="purchase" prefill={{ url: 'https://shop.example.tn/p/9' }} onBack={() => {}} onSwitchMode={() => {}} />);

    const url = inputs()[0];
    expect(url.value).toBe('https://shop.example.tn/p/9');
    const quantity = inputs().find((input) => input.type === 'number')!;
    await act(async () => {
      setNativeValue(quantity, '2');
      quantity.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const name = inputs().find((input) => (input.placeholder || '').includes('Nike Air Max 95'))!;
    await act(async () => {
      setNativeValue(name, 'Crème hydratante');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const color = inputs().find((input) => input.placeholder === 'Facultatif')!;
    await act(async () => {
      setNativeValue(color, 'Neutre');
      color.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const body = vi.mocked(api.createAyWebsPurchaseRequest).mock.calls[0][0] as Record<string, unknown>;
    expect(body.product_url).toBe('https://shop.example.tn/p/9');
    expect(body.quantity).toBe(2);
    expect(body.product_name).toBe('Crème hydratante');
    expect(body.variant_attributes).toMatchObject({ color: 'Neutre' });
    expect(text()).toContain('AYWREQ-000001');
  });

  it('un refus affiche la raison du catalogue, pas un silence (§23)', async () => {
    vi.mocked(api.listAyWebsPurchaseRequests).mockResolvedValue([{
      id: 'aywpr_2', request_number: 'AYWREQ-000002', store_id: '', store_name: 'shop.example.tn',
      product_url: 'https://shop.example.tn/p/10', source_domain: 'shop.example.tn', quantity: 1,
      product_name: '', variant_attributes: null, requirements: '', customer_notes: '',
      status: 'REJECTED', reason: 'PROHIBITED_ITEM', decision_note: 'Article interdit à l’importation en Tunisie.',
      decided_at: '2026-10-02T10:00:00.000Z', order_id: null, next_action: 'NONE',
      created_at: '2026-10-02T09:00:00.000Z',
    } as api.AyWebsPurchaseRequestPayload]);
    await render(<AyWebsRequestForm mode="purchase" onBack={() => {}} onSwitchMode={() => {}} />);

    expect(text()).toContain('Refusée');
    expect(text()).toContain('Article interdit à l’importation');
  });
});

/* ------------------------------------------------------------------ *
 * Accueil (§6) et poste de navigation (§9, §10, §11, §27)
 * ------------------------------------------------------------------ */

const featuresFixture: api.AyWebsFeatures = {
  enabled: true, capture_enabled: true, ocr_fallback_enabled: true, ai_extraction_enabled: false,
};

const storeFixture = (overrides: Partial<api.AyWebsStore> = {}): api.AyWebsStore => ({
  id: 'nike',
  name: 'Nike',
  display_name: 'Nike France',
  country: 'FR',
  currency: 'EUR',
  logo: '',
  integration_type: 'PARTIALLY_SUPPORTED',
  capabilities: ['browse', 'search', 'product', 'variants', 'availability'],
  categories: ['fashion'],
  popular: true,
  domains: ['www.nike.com', 'nike.com'],
  enabled: true,
  capture_supported: true,
  adapter: 'nike',
  status: 'active',
  browser_mode: 'external',
  home_url: 'https://www.nike.com/fr/',
  search_url_template: 'https://www.nike.com/fr/q={query}',
  phase: 1,
  ...overrides,
});

const homeFixture = (overrides: Partial<api.AyWebsHomePayload> = {}): api.AyWebsHomePayload => ({
  stores: [storeFixture()],
  popular_stores: [storeFixture()],
  categories: [{ id: 'fashion', labelFr: 'Mode', labelAr: 'الموضة', stores: ['nike'] }],
  recent_stores: [{ storeId: 'nike', storeName: 'Nike', url: 'https://www.nike.com/fr/', visitedAt: '2026-10-02T08:00:00.000Z' }],
  recent_products: [{
    product_id: 'aywsp_1', store_id: 'nike', store_name: 'Nike', title: 'Nike Air Max 95', image: null,
    price: 39.99, currency: 'USD', availability: 'UNKNOWN', pricing_tnd: 299.42,
    source_url: 'https://www.nike.com/fr/dp/1', resolved_at: '2026-10-02T08:10:00.000Z',
  }],
  cart: { id: 'aywc_1', items_count: 1, units: 1, subtotal_tnd: 164.76, blocked_items: 0, checkout_ready: true },
  request_store_supported: true,
  request_purchase_supported: true,
  session: null,
  ...overrides,
});

const analysisFixture = (overrides: Record<string, unknown> = {}) => ({
  url: 'https://www.nike.com/fr/dp/1',
  store_id: 'nike',
  store_name: 'Nike',
  integration_type: 'PARTIALLY_SUPPORTED',
  registered: true,
  browse_allowed: true,
  capture_allowed: true,
  page_type: 'PRODUCT',
  is_product_page: true,
  product_detected: true,
  customer_action_required: 'NONE',
  browser_mode: 'external',
  fallback: '',
  reason: '',
  ...overrides,
});

describe('AYWEBs — accueil (§6)', () => {
  const homeProps = {
    features: featuresFixture,
    onOpenStore: vi.fn(),
    onOpenProduct: vi.fn(),
    onOpenCart: vi.fn(),
    onOpenOrders: vi.fn(),
    onOpenRequestForm: vi.fn(),
    onOpenBrowser: vi.fn(),
  };

  it('affiche le registre, les catégories et l’activité lus du serveur', async () => {
    vi.mocked(api.getAyWebsHome).mockResolvedValue({ data: homeFixture(), features: featuresFixture });
    await render(<AyWebsHome {...homeProps} />);

    expect(vi.mocked(api.getAyWebsHome)).toHaveBeenCalled();
    expect(text()).toContain('Nike');
    expect(text()).toContain('Mode');
    expect(text()).toContain('Nike Air Max 95');
    expect(text()).toContain('Visitées récemment');
    // Disponibilité inconnue annoncée comme telle, y compris dans l'accueil (§14).
    expect(text()).toContain('Stock non publié');
    expect(buttonByLabel('Panier AyWebs')).toBeDefined();
    expect(buttonByLabel('Mes achats AyWebs')).toBeDefined();
    expect(buttonByLabel('Demander un achat avec URL')).toBeDefined();
  });

  it('la recherche ouvre une boutique ; plus de détournement « lien collé » (§6)', async () => {
    vi.mocked(api.getAyWebsHome).mockResolvedValue({ data: homeFixture(), features: featuresFixture });
    await render(<AyWebsHome {...homeProps} />);

    const search = inputs().find((input) => (input.placeholder || '').includes('Rechercher une boutique'))!;
    expect(search).toBeDefined();

    // Un lien collé dans la recherche n'ouvre plus une fiche produit fantôme :
    // l'entrée marchande passe par la carte boutique ou la barre du navigateur (§9).
    await act(async () => {
      setNativeValue(search, 'https://www.nike.com/fr/dp/1');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(homeProps.onOpenProduct).not.toHaveBeenCalled();
    expect(homeProps.onOpenStore).not.toHaveBeenCalled();

    await act(async () => {
      setNativeValue(search, 'nike');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(homeProps.onOpenStore).toHaveBeenCalled();

    await act(async () => {
      setNativeValue(search, 'nike');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(homeProps.onOpenStore).toHaveBeenCalledWith(expect.objectContaining({ id: 'nike' }));
  });

  it('une erreur de registre affiche le contrat et la sortie demande avec URL (§44)', async () => {
    vi.mocked(api.getAyWebsHome).mockRejectedValue(new api.AyWebsRequestError(
      'SERVICE_DISABLED', 'SERVICE_DISABLED', 503,
      {
        errorCode: 'SERVICE_DISABLED', userMessage: 'AyWebs est suspendu pour maintenance.',
        technicalMessage: 'flag=false', recoverable: false, retryAllowed: true, requiredAction: 'CONTACT_SUPPORT',
      },
      [],
    ));
    await render(<AyWebsHome {...homeProps} />);

    expect(text()).toContain('AyWebs est suspendu pour maintenance.');
    expect(text()).toContain('Contactez le support');
    expect(buttonByLabel('Demander un achat avec URL')).toBeDefined();
  });
});

describe('AYWEBs — poste de navigation (§9, §10, §11, §27)', () => {
  const browserProps = {
    store: storeFixture(),
    initialUrl: 'https://www.nike.com/fr/dp/1',
    features: featuresFixture,
    cartCount: 1,
    onBack: vi.fn(),
    onOpenProduct: vi.fn(),
    onOpenCart: vi.fn(),
    onOpenRequestForm: vi.fn(),
    onStoreDetected: vi.fn(),
  };

  it('le serveur détecte le produit ; la page marchande n’est jamais encadrée', async () => {
    vi.mocked(api.analyzeAyWebsPage).mockResolvedValue(analysisFixture() as any);
    await render(<AyWebsStoreBrowser {...browserProps} />);

    expect(vi.mocked(api.analyzeAyWebsPage)).toHaveBeenCalledWith('https://www.nike.com/fr/dp/1');
    expect(text()).toContain('Produit détecté');
    // CSP connect-src 'self' + allowNavigation vide : aucune iframe, aucun proxy caché.
    expect(host.querySelector('iframe')).toBeNull();

    await act(async () => buttonByLabel('Ouvrir la fiche AyWebs')!.click());
    expect(browserProps.onOpenProduct).toHaveBeenCalledWith('https://www.nike.com/fr/dp/1', 'nike');

    // « Voir chez le marchand » ouvre un onglet externe, pas un rendu interne.
    await act(async () => buttonByLabel('Voir chez le marchand')!.click());
    expect(window.open).toHaveBeenCalledWith('https://www.nike.com/fr/dp/1', '_blank', 'noopener,noreferrer');
  });

  it('connexion ou CAPTCHA exigé : action client requise, jamais contournée (§27)', async () => {
    vi.mocked(api.analyzeAyWebsPage).mockResolvedValue(analysisFixture({
      page_type: 'LOGIN', is_product_page: false, product_detected: false,
      customer_action_required: 'LOGIN_REQUIRED', capture_allowed: false,
    }) as any);
    await render(<AyWebsStoreBrowser {...browserProps} />);

    expect(text()).toContain('AYROVI ne la contourne jamais');
    expect(text()).toContain('Connexion requise');
    expect(text()).not.toContain('Produit détecté');
    expect(buttonByLabel('Ouvrir la fiche AyWebs')).toBeUndefined();
  });

  it('boutique hors registre : la demande avec URL reste la seule voie (§23)', async () => {
    vi.mocked(api.analyzeAyWebsPage).mockResolvedValue(analysisFixture({
      url: 'https://shop.example.tn/p/9', store_id: '', store_name: 'shop.example.tn',
      registered: false, product_detected: false, is_product_page: false, page_type: 'UNKNOWN',
      integration_type: 'URL_REQUEST', capture_allowed: false,
    }) as any);
    await render(<AyWebsStoreBrowser {...browserProps} />);

    expect(text()).toContain('pas encore dans le registre AyWebs');
    const request = buttonByLabel('Demander un achat avec URL');
    expect(request).toBeDefined();
    await act(async () => request!.click());
    expect(browserProps.onOpenRequestForm).toHaveBeenCalledWith({ url: 'https://shop.example.tn/p/9', storeName: 'shop.example.tn' });
  });

  it('le poste garde ses commandes de navigation et l’historique de session (§9, §26)', async () => {
    // Le serveur renvoie l'URL analysée : l'historique reflète les visites réelles.
    vi.mocked(api.analyzeAyWebsPage).mockImplementation((async (url: string) => analysisFixture({ url })) as any);
    await render(<AyWebsStoreBrowser {...browserProps} />);
    expect(text()).toContain('Pages analysées');
    expect(text()).toContain('https://www.nike.com/fr/dp/1');
    expect(buttonByLabel('Précédent')!.disabled).toBe(true);

    const address = inputs().find((input) => (input.placeholder || '').includes('Lien produit'))!;
    await act(async () => {
      setNativeValue(address, 'https://www.nike.com/fr/dp/2');
      address.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(vi.mocked(api.analyzeAyWebsPage)).toHaveBeenCalledTimes(2);
    expect(text()).toContain('https://www.nike.com/fr/dp/2');
    expect(buttonByLabel('Précédent')!.disabled).toBe(false);
    expect(buttonByLabel('Suivant')!.disabled).toBe(true);

    // Revenir en arrière restaure la page visitée sans rejouer une analyse inventée.
    await act(async () => buttonByLabel('Précédent')!.click());
    expect(address.value).toBe('https://www.nike.com/fr/dp/1');
    expect(vi.mocked(api.analyzeAyWebsPage)).toHaveBeenCalledTimes(2);
    expect(buttonByLabel('Suivant')!.disabled).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Hôte de navigation AYWEBs (§5, §16, §24, §25)
 * ------------------------------------------------------------------ */

describe('AYWEBs — hôte de navigation (§5, §25)', () => {
  const hostProps = {
    onClose: vi.fn(),
    onOpenCart: vi.fn(),
    cartCount: 2,
    authenticated: true,
    customerCsrfToken: 'csrf-ayrovi-1',
    onRequireSignIn: vi.fn(),
  };

  const openAt = (target: string) => {
    window.history.replaceState({}, '', target);
  };

  beforeEach(() => {
    vi.mocked(api.getAyWebsStores).mockResolvedValue({ stores: [storeFixture()], features: featuresFixture, offline: false });
    vi.mocked(api.getAyWebsCart).mockResolvedValue(cartPayload([cartItem()]));
    vi.mocked(api.getAyWebsHome).mockResolvedValue({ data: homeFixture(), features: featuresFixture });
    vi.mocked(api.listAyWebsOrders).mockResolvedValue([orderPayload()]);
    vi.mocked(api.getAyWebsOrder).mockResolvedValue(orderPayload());
    openAt('/aywebs');
  });

  afterEach(() => openAt('/'));

  it('ouvre l’accueil AYWEBs avec deux paniers distincts et le CSRF AYROVI (§2, §16, §45)', async () => {
    await render(<AyWebsScreen {...hostProps} />);

    expect(text()).toContain('Boutiques populaires');        // accueil §6, lu du serveur
    expect(text()).toContain('Produits détectés récemment');
    expect(vi.mocked(api.setAyWebsCsrfToken)).toHaveBeenCalledWith('csrf-ayrovi-1');
    // Badge AyWebs = 1 unité (serveur), badge AYROVI = 2 articles (app) : pas de fusion.
    expect(host.querySelector('[aria-label="Ouvrir le panier AyWebs"]')?.textContent).toContain('1');
    expect(host.querySelector('[aria-label="Ouvrir le panier AYROVI"]')?.textContent).toContain('2');
    // Plus de vue « capture par lien » parasite : l'ajout passe par Add to Cart (§13, §15).
    expect(host.querySelector('[aria-label="Capture par lien"]')).toBeNull();
  });

  it('ayrovi://aywebs/cart ouvre le panier AyWebs (§25)', async () => {
    openAt('/aywebs/cart');
    await render(<AyWebsScreen {...hostProps} />);
    expect(text()).toContain('Panier AyWebs');
    expect(vi.mocked(api.getAyWebsCart)).toHaveBeenCalled();
  });

  it('ayrovi://aywebs/order/AYW-000456 ouvre la commande visée (§25, §53)', async () => {
    openAt('/aywebs/order/AYW-000456');
    await render(<AyWebsScreen {...hostProps} />);

    expect(text()).toContain('AYW-000456');
    expect(vi.mocked(api.getAyWebsOrder)).toHaveBeenCalledWith('ayword_1');
    expect(text()).toContain('NIKE-AIR-MAX-95');
  });

  it('un partage vers une boutique hors registre ouvre la demande avec URL (§23, §24)', async () => {
    openAt('/aywebs?text=Regarde%20https%3A%2F%2Fshop.example.tn%2Fp%2F9');
    await render(<AyWebsScreen {...hostProps} />);

    expect(text()).toContain('Demander un achat avec URL');
    // Le lien exact est prérempli, tel que partagé : rien n'est réécrit côté client.
    expect(inputs()[0].value).toBe('https://shop.example.tn/p/9');
  });

  it('un partage vers une boutique du registre ouvre le poste de navigation (§9, §24)', async () => {
    // Boutique réellement inscrite au registre partagé (SHEIN) : la détection n'est
    // jamais simulée par le test, elle passe par detectAyWebsStore.
    const registered = storeFixture({
      id: 'shein', name: 'SHEIN', display_name: 'SHEIN', domains: ['shein.com', 'shein.co.uk'],
      home_url: 'https://shein.com/', search_url_template: 'https://shein.com/search?keyword={query}',
      adapter: 'shein',
    });
    vi.mocked(api.getAyWebsStores).mockResolvedValue({ stores: [registered], features: featuresFixture, offline: false });
    vi.mocked(api.analyzeAyWebsPage).mockImplementation((async (url: string) => analysisFixture({ url, store_id: 'shein', store_name: 'SHEIN' })) as any);
    // Texte de partage réel : une phrase, puis le lien exact.
    openAt('/aywebs?text=Regarde%20%C3%A7a%20https%3A%2F%2Fshein.com%2Fp%2F1');
    await render(<AyWebsScreen {...hostProps} />);

    // Le poste de navigation s'ouvre sur la page partagée, analysée par le serveur.
    expect(text()).toContain('Boutique : SHEIN');
    expect(vi.mocked(api.analyzeAyWebsPage)).toHaveBeenCalledWith('https://shein.com/p/1');
    expect(text()).toContain('Produit détecté');
    expect(buttonByLabel('Ouvrir la fiche AyWebs')).toBeDefined();
  });
});

/** React 19 : les champs contrôlés exigent une valeur posée via le setter natif. */
function setNativeValue(element: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value');
  descriptor?.set?.call(element, value);
}
