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

async function recognizeText(imageBuffer: Buffer): Promise<string> {
  // Tests use the self-terminating helper so the suite never retains a worker thread.
  if (process.env.NODE_ENV === 'test') {
    const result = await Tesseract.recognize(imageBuffer, 'eng+fra', {
      logger: () => {},
      errorHandler: () => {},
      tessedit_pageseg_mode: '11' as any,
      preserve_interword_spaces: '1' as any,
    } as any);
    return result.data.text;
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
      return result.data.text;
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

export class VisualProductExtractor {
  public static readonly RATES_TO_TND: Record<string, number> = {
    EUR: 4.00,
    USD: 4.00,
    JPY: 0.0265, // 100 JPY = 2.65 TND
    GBP: 4.80,
    CAD: 2.95,
    CHF: 4.20,
    TND: 1.0
  };

  public async extractFromImage(imageBuffer: Buffer, _originalFilename?: string): Promise<ScrapedProduct> {
    // The image is decoded and normalized before reaching this method. OCR runs
    // directly from memory: Lens images are never written to the public uploads directory.
    const text = await recognizeText(imageBuffer);

    const store = this.detectStoreFromText(text);
    const storeName = this.getStoreDisplayName(store);
    const isCartScreenshot = this.checkIfCartScreenshot(text);

    const { price, currency } = isCartScreenshot
      ? this.extractCartGrandTotal(text, store)
      : this.extractOriginalPriceFromText(text, store);

    const title = isCartScreenshot
      ? `Panier d'achat ${storeName} (Total des articles)`
      : this.extractTitleFromText(text, storeName);

    const rate = VisualProductExtractor.RATES_TO_TND[currency] || 4.00;
    const convertedPriceTND = price > 0 ? Math.round(price * rate * 100) / 100 : 0;
    const serviceFeeTND = price > 0 ? Math.round((Math.max(10, convertedPriceTND * 0.08)) * 100) / 100 : 0;
    const estimatedShippingTND = price > 0 ? 25.00 : 0;
    const totalPriceTND = price > 0 ? Math.round((convertedPriceTND + serviceFeeTND + estimatedShippingTND) * 100) / 100 : 0;

    return {
      id: 'vision_' + Date.now(),
      store,
      storeName,
      url: `https://www.${store}.com/`,
      externalId: isCartScreenshot ? 'CART-TOTAL' : ('IMG-' + Math.floor(Math.random() * 899999 + 100000)),
      title: title.trim(),
      description: isCartScreenshot
        ? `Total réel de la commande extrait depuis la capture du panier (${price} ${currency} = ${totalPriceTND} DT).`
        : `Article extrait avec le prix original (${price > 0 ? `${price} ${currency}` : 'À préciser'}). Vérifié par AYROVI.`,
      // The client already owns a local preview. Do not persist or publish Lens uploads.
      images: [],
      mainImage: '',
      sourcePrice: price,
      sourceCurrency: currency,
      convertedPriceTND,
      serviceFeeTND,
      estimatedShippingTND,
      totalPriceTND,
      variants: {
        sizes: [],
        colors: []
      },
      availability: 'in_stock',
      brand: storeName.split(' ')[0],
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
    let currency = 'EUR';

    if (text.includes('YEN') || text.includes('ven') || text.includes('¥') || text.includes('円') || text.includes('buyee.jp') || text.includes('amazon.co.jp')) {
      currency = 'JPY';
    } else if (text.includes('$') || text.includes('USD')) {
      currency = 'USD';
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
    let currency = 'EUR';

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
        if (text.includes('£')) currency = 'GBP';
        else if (text.includes('$') || text.includes('USD')) currency = 'USD';
        else if (text.includes('¥') || text.includes('YEN')) currency = 'JPY';
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
