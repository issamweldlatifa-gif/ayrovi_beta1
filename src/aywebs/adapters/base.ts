import type { ScrapeOptions, SmartLinkScraper } from '../../scraper/scraper';
import type { ScrapedProduct } from '../../types';
import type { AyWebsAdapterId, AyWebsStoreDefinition } from '../../../shared/aywebsStores';
import { ayWebsHostnameMatches, ayWebsSourceDomain, findAyWebsStore } from '../../../shared/aywebsStores';
import type { AyWebsIntegrationType, AyWebsPageType, AyWebsPurchaseMode } from '../../../shared/aywebsTypes';
import {
  AyWebsCaptureError,
  AYWEBS_URL_PAGE_HINTS,
  type AyWebsAvailabilityCheck,
  type AyWebsPageClassification,
  type AyWebsPurchasePreparation,
  type AyWebsSourceProduct,
  type AyWebsStoreAdapter,
} from './contract';
import {
  ayWebsAvailabilityFromMerchant,
  ayWebsSourceProductFromScraped,
  ayWebsSplitVariantSelection,
  ayWebsVariantFromSelection,
  ayWebsVariantKey,
} from '../productNormalizer';

/**
 * AYWEBs — base partagée de tous les adaptateurs.
 *
 * Ce que chaque adaptateur possède EN PROPRE : la reconnaissance d'URL
 * (`isProductPage`) et l'identité source. Tout le reste est commun :
 *  • la chaîne d'extraction reste `SmartLinkScraper` (structured data / état
 *    embarqué → DOM/meta → Jina → rendered provider allowlisté) : aucune
 *    seconde chaîne d'extraction n'est créée ;
 *  • la classification de page partage les indices d'URL (login, CAPTCHA,
 *    checkout) et n'invente jamais un type de page sans preuve ;
 *  • l'achat n'est PAS simulé : tant qu'aucune intégration d'achat marchand
 *    n'existe, `preparePurchase` répond `PENDING_INTEGRATION` (§48), ce qui
 *    force la revue humaine au lieu d'un faux succès.
 */
export abstract class BaseStoreAdapter implements AyWebsStoreAdapter {
  abstract readonly id: AyWebsAdapterId;

  constructor(protected readonly scraper: SmartLinkScraper) {}

  get store(): AyWebsStoreDefinition | null {
    return findAyWebsStore(this.id);
  }

  get integrationType(): AyWebsIntegrationType {
    return this.store?.integrationType || 'GENERIC';
  }

  get purchaseMode(): AyWebsPurchaseMode {
    if (!this.store) return 'NOT_IMPLEMENTED';
    if (this.store.capabilities.includes('purchase')) return 'SUPPORTED';
    if (this.store.integrationType === 'SUPPORTED' || this.store.integrationType === 'PARTIALLY_SUPPORTED') return 'MANUAL_REVIEW';
    if (this.store.integrationType === 'URL_REQUEST') return 'URL_REQUEST';
    return 'NOT_IMPLEMENTED';
  }

  /** Domaines du registre : un adaptateur ne décide jamais seul de son périmètre. */
  canHandle(url: string | URL): boolean {
    const domains = this.store?.domains || [];
    try {
      const parsed = typeof url === 'string' ? new URL(url) : url;
      return ayWebsHostnameMatches(parsed.hostname, domains);
    } catch {
      return false;
    }
  }

  /** Reconnaissance exacte de la fiche produit — propre à chaque marchand. */
  abstract isProductPage(url: URL): boolean;

  classifyPage(url: string | URL): AyWebsPageClassification {
    let parsed: URL;
    try {
      parsed = typeof url === 'string' ? new URL(url) : url;
    } catch {
      return { pageType: 'ERROR', storeId: null, isProductPage: false, reason: 'url_invalide', customerActionRequired: 'NONE' };
    }
    const storeId = (this.canHandle(parsed) ? this.id : null) as AyWebsAdapterId | null;
    // Indices sur le CHEMIN seul : les marchands placent connexion/panier/captcha
    // dans le chemin (/ap/signin, /gp/cart, /errors/validateCaptcha), tandis que
    // les paramètres de suivi des fiches produit charrient des jetons opaques
    // contenant « auth », « cart », « login » — les lire produisait un faux
    // LOGIN/CAPTCHA qui verrouillait une fiche produit saine (§10, §27).
    const haystack = parsed.pathname;

    for (const hint of AYWEBS_URL_PAGE_HINTS) {
      if (hint.pattern.test(haystack)) {
        return {
          pageType: hint.pageType,
          storeId,
          isProductPage: false,
          reason: `indice_url:${hint.pattern.source.slice(0, 40)}`,
          customerActionRequired: hint.action,
        };
      }
    }

    if (this.isProductPage(parsed)) {
      return { pageType: 'PRODUCT', storeId, isProductPage: true, reason: 'motif_fiche_produit_marchand', customerActionRequired: 'NONE' };
    }
    if (this.isSearchPage(parsed)) {
      return { pageType: 'SEARCH', storeId, isProductPage: false, reason: 'motif_recherche_marchand', customerActionRequired: 'NONE' };
    }
    if (/^\/?$/.test(parsed.pathname)) {
      return { pageType: 'HOME', storeId, isProductPage: false, reason: 'racine_du_domaine', customerActionRequired: 'NONE' };
    }
    return { pageType: 'UNKNOWN', storeId, isProductPage: false, reason: 'aucun_motif_reconnu', customerActionRequired: 'NONE' };
  }

  /** Les adaptateurs précisent leur motif de recherche ; sinon rien n'est affirmé. */
  protected isSearchPage(_url: URL): boolean {
    return false;
  }

  async resolveProduct(url: string, options: ScrapeOptions = {}): Promise<AyWebsSourceProduct> {
    const product = await this.capture(url, options);
    return ayWebsSourceProductFromScraped(product, this.store?.displayName || this.store?.name || this.id);
  }

  resolveVariants(product: AyWebsSourceProduct): AyWebsSourceProduct['variants'] {
    return product.variants || [];
  }

  /**
   * Disponibilité (§14). La variante exacte est vérifiée d'abord ; à défaut, la
   * disponibilité produit est reportée telle que le marchand la publie.
   * `UNKNOWN` n'est jamais promu `AVAILABLE`.
   */
  async checkAvailability(
    product: AyWebsSourceProduct,
    variantAttributes: Record<string, string> | null = null,
  ): Promise<AyWebsAvailabilityCheck> {
    const checkedAt = new Date().toISOString();
    const variant = ayWebsVariantFromSelection(product.variants || [], variantAttributes);

    if (variant) {
      return {
        state: variant.availability,
        reason: variantAttributes && variant.availability === 'UNKNOWN'
          ? 'merchant_option_stock_unspecified'
          : variant.availability === 'OUT_OF_STOCK' ? 'merchant_variant_out_of_stock' : 'merchant_variant_in_stock',
        checkedAt,
        source: `${this.id}:variant`,
        quantityHint: null,
        variantAvailable: variant.available,
      };
    }

    if (variantAttributes && Object.keys(variantAttributes).length) {
      // Une sélection explicite non reconnue n'hérite jamais du stock produit :
      // des listes d'options seules ne prouvent pas que cette variante existe.
      return {
        state: 'UNKNOWN',
        reason: `variante_absente_de_la_source:${ayWebsVariantKey(variantAttributes)}`,
        checkedAt,
        source: `${this.id}:variant`,
        quantityHint: null,
        variantAvailable: null,
      };
    }

    const productAvailability = ayWebsAvailabilityFromMerchant(product.scrapedProduct?.availability);
    return {
      state: product.availability || productAvailability.state,
      reason: product.availabilityReason || productAvailability.reason,
      checkedAt,
      source: `${this.id}:product`,
      quantityHint: null,
      variantAvailable: null,
    };
  }

  /**
   * Préparation d'achat (§22). Aucune intégration d'achat marchand automatisé
   * n'existe encore dans AYROVI : l'état le dit explicitement, la commande
   * part en revue humaine. Simuler un achat réussi est interdit (§48).
   */
  async preparePurchase(): Promise<AyWebsPurchasePreparation> {
    return this.pendingIntegration('preparePurchase');
  }

  async getPurchaseStatus(): Promise<AyWebsPurchasePreparation> {
    return this.pendingIntegration('getPurchaseStatus');
  }

  protected pendingIntegration(operation: string): AyWebsPurchasePreparation {
    return {
      status: 'PENDING_INTEGRATION',
      reason: `${operation}: aucune intégration d'achat marchand automatisée pour ${this.id}`,
      requiredAction: 'MANUAL_REVIEW',
      adapter: this.id,
    };
  }

  /* ---- Contrat V1 ---- */

  async capture(url: string, options: ScrapeOptions = {}): Promise<ScrapedProduct> {
    const product = await this.scraper.scrapeProduct(url, options);
    if (product.store !== this.id) {
      throw new AyWebsCaptureError('STORE_MISMATCH', `Le lien ne correspond pas à une fiche ${this.id} prise en charge.`);
    }
    return product;
  }
}

/**
 * Adaptateur générique : il ne revendique AUCUNE boutique précise. Il sert les
 * domaines du registre marqués GENERIC/URL_REQUEST et refuse honnêtement la
 * capture quand rien ne permet de lire le produit.
 */
export class GenericStoreAdapter extends BaseStoreAdapter {
  readonly id = 'generic' as const;

  canHandle(url: string | URL): boolean {
    try {
      const parsed = typeof url === 'string' ? new URL(url) : url;
      return ['http:', 'https:'].includes(parsed.protocol) && Boolean(ayWebsSourceDomain(parsed.toString()));
    } catch {
      return false;
    }
  }

  /**
   * Sans connaissance du marchand, on ne peut PAS affirmer qu'une URL est une
   * fiche produit. La classification reste UNKNOWN et la capture passe par la
   * chaîne générique : si elle ne trouve ni titre ni prix, l'échec est explicite.
   */
  isProductPage(): boolean {
    return false;
  }

  classifyPage(url: string | URL): AyWebsPageClassification {
    const base = super.classifyPage(url);
    return { ...base, storeId: null, pageType: base.pageType === 'UNKNOWN' ? 'UNKNOWN' as AyWebsPageType : base.pageType };
  }
}
