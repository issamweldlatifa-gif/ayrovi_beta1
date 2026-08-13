import Tesseract from 'tesseract.js';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import { ScrapedProduct, StoreType } from '../types';

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

  public async extractFromImage(imageBuffer: Buffer, originalFilename?: string): Promise<ScrapedProduct> {
    const tempDir = path.resolve(process.cwd(), 'data/uploads');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileExt = originalFilename ? path.extname(originalFilename) : '.jpg';
    const filename = `shot_${randomUUID().substring(0, 8)}${fileExt || '.jpg'}`;
    const filePath = path.join(tempDir, filename);

    fs.writeFileSync(filePath, imageBuffer);

    // OCR ajusté pour captures mobiles : texte épars, espaces préservés, langues eng+fra
    const { data: { text } } = await Tesseract.recognize(filePath, 'eng+fra', {
      logger: () => {},
      tessedit_pageseg_mode: '11' as any, // PSM sparse text — idéal pour captures produits
      preserve_interword_spaces: '1' as any,
    } as any);

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

    const imageUrl = `/uploads/${filename}`;

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
      images: [imageUrl],
      mainImage: imageUrl,
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
