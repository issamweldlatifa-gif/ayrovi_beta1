import { createHash } from 'node:crypto';
import Tesseract from 'tesseract.js';
import { ScrapedProduct, StoreType } from '../types';

let ocrWorkerPromise: ReturnType<typeof Tesseract.createWorker> | null = null;
let ocrQueue: Promise<void> = Promise.resolve();
let pendingOcrJobs = 0;
const MAX_QUEUED_OCR_JOBS = 3;

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = Tesseract.createWorker('eng+fra', 1, {
      logger: () => {},
      // Never let a worker error become an uncaught process-level exception.
      errorHandler: (error) => console.warn('[AYROVIX OCR worker]', error?.message || error),
    }).then(async (worker) => {
      await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT, preserve_interword_spaces: '1' });
      return worker;
    });
  }
  return ocrWorkerPromise;
}

export interface OcrWordBox {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function mapOcrWords(data: { text?: string; words?: Array<any> } | undefined): { text: string; words: OcrWordBox[] } {
  const words = Array.isArray(data?.words) ? data.words : [];
  return {
    text: String(data?.text || ''),
    words: words.flatMap((word) => {
      const text = String(word?.text || '').trim();
      if (!text) return [];
      const bbox = word?.bbox || {};
      const x0 = Number(bbox.x0 ?? 0);
      const y0 = Number(bbox.y0 ?? 0);
      const x1 = Number(bbox.x1 ?? x0);
      const y1 = Number(bbox.y1 ?? y0);
      const confidence = Number(word?.confidence ?? 0);
      return [{
        text,
        confidence: Math.max(0, Math.min(1, confidence > 1 ? confidence / 100 : confidence)),
        x: Number.isFinite(x0) ? x0 : 0,
        y: Number.isFinite(y0) ? y0 : 0,
        width: Math.max(0, (Number.isFinite(x1) ? x1 : x0) - (Number.isFinite(x0) ? x0 : 0)),
        height: Math.max(0, (Number.isFinite(y1) ? y1 : y0) - (Number.isFinite(y0) ? y0 : 0)),
      }];
    }),
  };
}

async function recognizeDocument(imageBuffer: Buffer) {
  // Tests use the self-terminating helper so the suite never retains a worker thread.
  if (process.env.NODE_ENV === 'test') {
    return Tesseract.recognize(imageBuffer, 'eng+fra', {
      logger: () => {},
      errorHandler: () => {},
      tessedit_pageseg_mode: '11' as any,
      preserve_interword_spaces: '1' as any,
    } as any);
  }
  if (pendingOcrJobs >= MAX_QUEUED_OCR_JOBS) throw new Error('OCR_BUSY');
  pendingOcrJobs += 1;
  const job = ocrQueue.then(async () => {
    const worker = await getOcrWorker();
    const configuredTimeout = Number(process.env.AYROVIX_OCR_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(configuredTimeout)
      ? Math.min(15_000, Math.max(2_000, configuredTimeout))
      : 7_000;
    let timeout: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        worker.recognize(imageBuffer),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('OCR_TIMEOUT')), timeoutMs);
        }),
      ]);
      return result;
    } catch (error) {
      await worker.terminate().catch(() => undefined);
      ocrWorkerPromise = null;
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  });
  ocrQueue = job.then(() => undefined, () => undefined);
  try {
    return await job;
  } finally {
    pendingOcrJobs -= 1;
  }
}

/** OCR public pour la Lens pipeline (deuxième opinion + petit texte). */
export async function ocrRecognize(imageBuffer: Buffer): Promise<string> {
  const result = await recognizeDocument(imageBuffer);
  return result.data.text;
}

/** Même moteur, avec boîtes. OCEREX s'en sert pour lier un montant à sa position. */
export async function ocrRecognizeDetailed(imageBuffer: Buffer): Promise<{ text: string; words: OcrWordBox[] }> {
  const result = await recognizeDocument(imageBuffer);
  return mapOcrWords(result.data);
}

export class VisualProductExtractor {
  /*
   * ── PLUS AUCUN MONTANT CALCULÉ ICI (Phase 0, suite — 07/10/2026) ───────────
   *
   * Même table en dur que le scraper (`EUR 4.00 … || 4.00`) et mêmes constantes
   * métier (`serviceFee = max(10, 8 %)`, `shipping = 25.00`) appliquées à un
   * prix lu par OCR. Trois conséquences, toutes fausses : un taux inventé pour
   * toute devise absente, un total qui contredisait le calculateur AYROVI
   * versionné, et une description qui publiait ce total (« … = 122.5 DT »)
   * comme un fait vérifié.
   *
   * Désormais : l'OCR publie ce qu'il a LU (prix + code ISO s'il est visible) ;
   * la conversion et les frais sont calculés par le moteur tarifaire à la couche
   * API. Les quatre champs monétaires restent à 0 : « pas calculé ».
   */

  public async extractFromImage(imageBuffer: Buffer, _originalFilename?: string): Promise<ScrapedProduct> {
    // The image is decoded and normalized before reaching this method. OCR runs
    // directly from memory: Lens images are never written to the public uploads directory.
    const text = await ocrRecognize(imageBuffer);

    const store = this.detectStoreFromText(text);
    const storeName = this.getStoreDisplayName(store);
    const isCartScreenshot = this.checkIfCartScreenshot(text);

    const { price, currency } = isCartScreenshot
      ? this.extractCartGrandTotal(text, store)
      : this.extractOriginalPriceFromText(text, store);

    const title = isCartScreenshot
      ? `Panier d'achat ${storeName} (Total des articles)`
      : this.extractTitleFromText(text, storeName);

    /* Ce que l'OCR a réellement lu, tel quel. */
    const priceText = price > 0 ? `${price} ${currency}`.trim() : '';

    return {
      id: 'vision_' + Date.now(),
      store,
      storeName,
      /* L'URL n'est PAS connue : une capture d'écran ne contient pas d'adresse.
         `https://www.<store>.com/` était une adresse INVENTÉE, présentée comme
         la source du produit. Vide = « non communiquée ». */
      url: '',
      /* Identité : le total de panier est un cas nommé ; sinon l'empreinte
         déterministe du texte OCR (même capture ⇒ même identité). */
      externalId: isCartScreenshot
        ? 'CART-TOTAL'
        : `UNRESOLVED-${createHash('sha1').update(text).digest('hex').slice(0, 12)}`,
      title: title.trim(),
      titleSource: title.trim() ? 'merchant' : 'none',
      // Faits lus seulement — plus de total recalculé ici, plus de « Vérifié par
      // AYROVI » (rien n'avait été vérifié : une capture n'est pas le marchand).
      description: isCartScreenshot
        ? 'Total de la commande lu sur la capture du panier.'
        : (priceText
          ? `Prix lu sur la capture : ${priceText}.`
          : 'Aucun prix lisible sur la capture.'),
      // The client already owns a local preview. Do not persist or publish Lens uploads.
      images: [],
      mainImage: '',
      sourcePrice: price,
      sourceCurrency: currency,
      // 0 = non calculé : le moteur tarifaire décide, sur les règles versionnées.
      convertedPriceTND: 0,
      serviceFeeTND: 0,
      estimatedShippingTND: 0,
      totalPriceTND: 0,
      variants: {
        sizes: [],
        colors: []
      },
      /* Le stock était `in_stock` EN DUR : une capture ne prouve aucun stock.
         `unknown` dit la vérité, et le panier refusera tant que la fiche
         marchande n'aura pas confirmé. */
      availability: 'unknown',
      /* La marque n'est pas le premier mot du nom de la boutique (c'était
         « Amazon », « SHEIN »… exactement la fabrication retirée en Phase 0). */
      brand: '',
      priceVerified: false,
      currencyVerified: false,
      verificationProvider: 'ocr',
      verificationMethod: 'ocr',
      verificationFailureCode: 'OCR_NOT_A_MERCHANT_PAGE',
      scrapedAt: new Date().toISOString()
    };
  }

  private checkIfCartScreenshot(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.includes('total item amount') ||
      lower.includes('proceed to order') ||
      lower.includes('sub total') ||
      lower.includes('desired quantity') ||
      lower.includes('total de la commande') ||
      lower.includes('recapitulatif') ||
      lower.includes('grand total')
    );
  }

  private detectStoreFromText(text: string): StoreType {
    const lower = text.toLowerCase();
    if (lower.includes('shein') || lower.includes('slaydiva') || lower.includes('dazy') || lower.includes('muchica')) return 'shein';
    if (lower.includes('amazon') || lower.includes('buyee') || lower.includes('asin')) return 'amazon';
    if (lower.includes('temu')) return 'temu';
    if (lower.includes('aliexpress')) return 'aliexpress';
    return 'generic';
  }

  private getStoreDisplayName(store: StoreType): string {
    if (store === 'shein') return 'SHEIN';
    if (store === 'amazon') return 'Amazon';
    if (store === 'temu') return 'TEMU';
    if (store === 'aliexpress') return 'AliExpress';
    return 'Boutique Internationale';
  }

  private extractCartGrandTotal(text: string, _store: StoreType): { price: number; currency: string } {
    /* Devise VIDE par défaut : « EUR » était un choix par défaut jamais prouvé
       par la capture. Un montant « 129,99 » sans symbole ni code était donc
       converti au taux EUR et publié comme un prix AYROVI. Sans preuve de
       devise, le prix reste lu mais aucun devis n'est possible — et le moteur
       tarifaire, lui, répond `null` (jamais un taux inventé). */
    let currency = '';

    if (text.includes('YEN') || text.includes('ven') || text.includes('¥') || text.includes('円') || text.includes('buyee.jp') || text.includes('amazon.co.jp')) {
      currency = 'JPY';
    } else if (text.includes('$') || text.includes('USD')) {
      currency = 'USD';
    } else if (/\bEUR\b/.test(text) || text.includes('€')) {
      currency = 'EUR';
    } else if (/\bGBP\b/.test(text) || text.includes('£')) {
      currency = 'GBP';
    }

    const totalMatch = text.match(/Total item amount[\s\S]*?\([0-9]+item\(s\)\)[\s\S]*?([0-9,.]+)\s*(?:YEN|ven|¥|€|\$|EUR|USD)?/i) ||
                       text.match(/([0-9,]{3,})\s*(?:YEN|ven)/i) ||
                       text.match(/Total[\s\S]*?([0-9,.]+)\s*(?:YEN|¥|€|\$|EUR)/i);

    if (totalMatch && totalMatch[1]) {
      const clean = totalMatch[1].replace(/,/g, '');
      const num = parseFloat(clean);
      if (!isNaN(num) && num > 0) {
        return { price: num, currency };
      }
    }

    return { price: 0, currency };
  }

  private extractOriginalPriceFromText(text: string, _store: StoreType): { price: number; currency: string } {
    // Vid o par défaut : voir `extractCartGrandTotal`.
    let currency = '';

    // 1) Prix en dinars tunisiens — autorité directe, aucune conversion
    const tndMatch = text.match(/([0-9]+[.,][0-9]{2,3})\s*(?:DT|TND|د\.?\s?ت)/i) || text.match(/(?:DT|TND|د\.?\s?ت)\s*([0-9]+[.,][0-9]{2,3})/i);
    if (tndMatch?.[1]) {
      const num = parseFloat(tndMatch[1].replace(',', '.'));
      if (!Number.isNaN(num) && num > 0) return { price: num, currency: 'TND' };
    }

    // 2) Prix proche d'un mot-clé (Prix/Price/Total/Montant/السعر) — bien plus fiable que le maximum global
    const keywordMatch = text.match(/(?:prix|price|total(?:\s+price)?|montant|السعر|المجموع)[^\d¥€$£]{0,18}([0-9]+[.,][0-9]{2})/i);
    if (keywordMatch?.[1]) {
      const num = parseFloat(keywordMatch[1].replace(',', '.'));
      if (!Number.isNaN(num) && num > 0.5) {
        if (text.includes('£') || /\bGBP\b/.test(text)) currency = 'GBP';
        else if (text.includes('$') || /\bUSD\b/.test(text)) currency = 'USD';
        else if (text.includes('¥') || text.includes('YEN')) currency = 'JPY';
        else if (text.includes('€') || /\bEUR\b/.test(text)) currency = 'EUR';
        return { price: num, currency };
      }
    }

    if (text.includes('¥') || text.includes('円') || text.includes('YEN') || text.includes('amazon.co.jp')) {
      currency = 'JPY';
      const yenMatches: number[] = [];
      const lines = text.split('\n');
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (!lower.includes('delivery') && !lower.includes('livraison') && !lower.includes('shipping')) {
          const m = line.match(/(?:¥|YEN)\s*([0-9,]+)/i) || line.match(/([0-9,]+)\s*(?:¥|YEN)/i);
          if (m && m[1]) {
            const num = parseFloat(m[1].replace(/,/g, ''));
            if (!isNaN(num) && num > 0) yenMatches.push(num);
          }
        }
      }
      if (yenMatches.length > 0) {
        return { price: Math.max(...yenMatches), currency: 'JPY' };
      }
    }

    if (text.includes('$') || text.includes('USD')) {
      currency = 'USD';
    } else if (text.includes('£') || text.includes('GBP')) {
      currency = 'GBP';
    }

    const crossedOutMatch = text.match(/\[-[0-9]+%\]\s*([0-9]+[,.][0-9]{2})/i) ||
                            text.match(/[-][0-9]+%\s*([0-9]+[,.][0-9]{2})/i) ||
                            text.match(/([0-9]+[,.][0-9]{2})\s*€?\s*\[-[0-9]+%\]/i);

    if (crossedOutMatch && crossedOutMatch[1]) {
      const num = parseFloat(crossedOutMatch[1].replace(',', '.'));
      if (!isNaN(num) && num > 0) {
        return { price: num, currency };
      }
    }

    const allMatches = text.match(/([0-9]+[,.][0-9]{2})/g);
    const detectedPrices: number[] = [];
    if (allMatches) {
      for (const str of allMatches) {
        const num = parseFloat(str.replace(',', '.'));
        if (!isNaN(num) && num > 2.50 && num !== 1.85 && num !== 1.81) {
          detectedPrices.push(num);
        }
      }
    }

    if (detectedPrices.length > 0) {
      return { price: Math.max(...detectedPrices), currency };
    }

    return { price: 0, currency };
  }

  private extractTitleFromText(text: string, storeName: string): string {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (
        lower.includes('robe') ||
        lower.includes('slaydiva') ||
        lower.includes('muchica') ||
        lower.includes('t-shirt') ||
        lower.includes('pants') ||
        lower.includes('jacket') ||
        lower.includes('airpods') ||
        lower.includes('casque') ||
        lower.includes('montre') ||
        lower.includes('color') ||
        lower.includes('set') ||
        lower.includes('ensemble')
      ) {
        if (!line.includes('The page') && !line.includes('http') && !line.includes('says:')) {
          return line.replace(/^[^\w\s\u0600-\u06FF\-]+/g, '').trim();
        }
      }
    }

    for (const line of lines) {
      if (!line.includes('http') && !line.includes('The page') && !line.includes('OK') && line.length > 10) {
        return line;
      }
    }

    return `طلب شراء من ${storeName}`;
  }
}
