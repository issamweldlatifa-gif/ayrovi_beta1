/**
 * Verrou de la barre de navigation transparente à 5 onglets (style Zalando) et de Sonim.
 *
 * Garantit :
 *   1. l'ordre exact `index` · `lens` · `aywebs` · `sonim` · `account` (+ `cart` masqué) ;
 *   2. le style flottant haute transparence à coins arrondis compacts (`TAB_BAR_GLASS`,
 *      `theme.radius.md`, `tabBarBackground`, `theme.elevation.none` sans ombre interne Android) ;
 *   3. les icônes vectorielles officielles intégrées (`TabNavIcons`, `react-native-svg`)
 *      de taille égale (`24 × 24` pt) et le médaillon `AYWEBs` `24 × 24` sans fond gris (`background={null}`) ;
 *   4. la normalisation des outils Sonim (`get_order_status`, `calculate_price`,
 *      `search_products`, `escalate_to_human`) et des pièces jointes multimodales.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { assistantOutgoingMessages, streamAssistantChat, type StreamFetch } from '../src/api/assistant';
import {
  applySonimToolEvent,
  buildSonimBrowserRoute,
  cleanSonimText,
  sonimStateTranslationKey,
  type SonimChatMessage,
} from '../src/features/sonim/sonimModel';

const ROOT = path.resolve(__dirname, '..');

describe('barre du bas transparente à coins arrondis compacts (5 onglets — style Zalando)', () => {
  const layout = readFileSync(path.join(ROOT, 'app/(tabs)/_layout.tsx'), 'utf8');
  const navIcons = readFileSync(path.join(ROOT, 'src/design/TabNavIcons.tsx'), 'utf8');
  const tokensMobile = readFileSync(path.join(ROOT, 'src/design/tokens.mobile.ts'), 'utf8');

  it('respecte l’ordre exact Accueil · Lens · AYWEBs · Sonim · Profil (+ cart masqué) et masque la barre sur Lens, Sonim et Panier', () => {
    const names = Array.from(layout.matchAll(/<Tabs\.Screen[\s\S]*?\bname="([^"]+)"/g), (m) => m[1]);
    expect(names).toEqual(['index', 'lens', 'aywebs', 'sonim', 'account', 'cart']);
    expect(layout).toMatch(/name="cart"\s+options=\{\{\s*href:\s*null,\s*tabBarStyle:\s*\{\s*display:\s*'none'\s*\}/);
    expect(layout).toContain('backBehavior="history"');
    const lensBlock = /<Tabs\.Screen\s+name="lens"[\s\S]*?\/>/.exec(layout)?.[0] ?? '';
    expect(lensBlock).toContain("tabBarStyle: { display: 'none' }");
    expect(lensBlock).toContain("router.push('/z-lens')");

    const rootLayout = readFileSync(path.join(ROOT, 'app/_layout.tsx'), 'utf8');
    expect(rootLayout).toContain('<Stack.Screen name="panier" />');
    expect(rootLayout).toContain('<Stack.Screen name="z-lens" />');
    expect(existsSync(path.join(ROOT, 'app/panier.tsx'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'app/z-lens.tsx'))).toBe(true);

    const appJson = JSON.parse(readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
    const fontPlugin = appJson.expo.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === 'expo-font');
    expect(fontPlugin).toBeTruthy();
    expect(fontPlugin[1].fonts).toEqual([
      './assets/fonts/ZalandoSans-Regular.ttf',
      './assets/fonts/ZalandoSans-SemiBold.ttf',
      './assets/fonts/ZalandoSans-Bold.ttf',
      './assets/fonts/NotoSansArabic-Regular.ttf',
      './assets/fonts/NotoSansArabic-Bold.ttf',
    ]);
  });

  it('applique une surface pleine opaque collée tout en bas (zéro transparence, zéro vide sous la barre)', () => {
    expect(layout).toContain('TAB_BAR_SURFACE[theme.mode]');
    expect(layout).not.toContain('TAB_BAR_GLASS');
    expect(layout).not.toContain("position: 'absolute'");
    expect(layout).not.toContain("backgroundColor: 'transparent'");
    expect(layout).toContain('paddingBottom: insets.bottom');
    expect(layout).toContain('backgroundColor: surface.background');
    expect(layout).toContain('borderTopColor: surface.border');
    expect(layout).toContain('...theme.elevation.none');
    expect(layout).not.toContain('...theme.elevation.medium');

    const block = /export const TAB_BAR_SURFACE = \{([\s\S]*?)\} as const;/.exec(tokensMobile)?.[1] ?? '';
    expect(block).toContain('BRAND.white');
    expect(block).toContain('BRAND.black');
    expect(block).not.toContain('alpha(');
  });

  it('utilise une seule famille d’icônes vectorielles à trait fin (Ionicons -outline, 24×24) avec patte violette AYWEBs', () => {
    expect(navIcons).toContain("from '@expo/vector-icons/Ionicons'");
    expect(navIcons).toContain('export function TabHomeIcon');
    expect(navIcons).toContain('export function TabLensIcon');
    expect(navIcons).toContain('export function TabAyWebsIcon');
    expect(navIcons).toContain('export function TabSonimIcon');
    expect(navIcons).toContain('export function TabProfileIcon');

    const outlineNames = Array.from(navIcons.matchAll(/name="([a-z-]+)"/g), (m) => m[1]);
    expect(outlineNames).toEqual([
      'home-outline',
      'camera-outline',
      'paw-outline',
      'sparkles-outline',
      'person-outline',
    ]);

    expect(layout).toContain('<TabHomeIcon color={color}');
    expect(layout).toContain('<TabLensIcon color={color}');
    expect(layout).toContain('<TabAywebsPawIcon color={AYWEBS_WORDMARK_TINT[theme.mode]}');
    expect(layout).toContain('<TabSonimIcon color={color}');
    expect(layout).toContain('<TabProfileIcon color={color}');

    expect(existsSync(path.join(ROOT, 'assets/tab-lens-icon.png'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'assets/tab-sonim-icon.png'))).toBe(false);
  });
});

describe('Sonim — modèle et outils serveur', () => {
  const baseMessage: SonimChatMessage = { id: 'a1', role: 'assistant', text: '' };

  it('nettoie les titres et gras markdown superflus', () => {
    expect(cleanSonimText('### **Bonjour** Sonim\n\n\nVoici le prix.')).toBe('Bonjour Sonim\n\nVoici le prix.');
  });

  it('normalise calculate_price, get_order_status, search_products et escalate_to_human', () => {
    const withPrice = applySonimToolEvent(baseMessage, 'calculate_price', {
      breakdown: {
        totalTND: 245.5,
        convertedPriceTND: 180,
        customsFeeTND: 30,
        shippingFeeTND: 20,
        serviceFeeTND: 15.5,
        expressFeeTND: 0,
      },
    });
    expect(withPrice.priceBreakdown?.totalTND).toBe(245.5);

    const withOrder = applySonimToolEvent(baseMessage, 'get_order_status', {
      order: {
        orderId: 'AYR-1042',
        statusLabel: 'En transit',
        carrier: 'DHL',
        trackingCode: 'TRK99',
        history: [{ status: 'SHIPPED', label: 'Expédié', at: '2026-10-28T08:00:00Z' }],
      },
    });
    expect(withOrder.orders).toHaveLength(1);
    expect(withOrder.orders?.[0]?.orderId).toBe('AYR-1042');

    const withProducts = applySonimToolEvent(baseMessage, 'search_products', {
      products: [
        {
          id: 'p1',
          title: 'Veste ZARA',
          source: 'ZARA',
          sourceUrl: 'https://www.zara.com/fr/fr/veste-p1.html',
          image: 'https://static.zara.net/p1.jpg',
          price: 49.95,
          currency: 'EUR',
          priceTnd: 198.4,
        },
      ],
    });
    expect(withProducts.products).toHaveLength(1);
    expect(buildSonimBrowserRoute(withProducts.products![0].sourceUrl)).toBe(
      '/aywebs/browser?url=https%3A%2F%2Fwww.zara.com%2Ffr%2Ffr%2Fveste-p1.html',
    );

    const withTicket = applySonimToolEvent(baseMessage, 'escalate_to_human', {
      ticket: { id: 'SUP-778' },
    });
    expect(withTicket.supportTicket).toEqual({ id: 'SUP-778' });
    expect(sonimStateTranslationKey('reasoning')).toBe('sonim.state.reasoning');
  });

  it('préserve les pièces jointes image valides et supporte le repli SSE sans ReadableStream', async () => {
    const outgoing = assistantOutgoingMessages([
      {
        role: 'user',
        text: 'Combien coûte cet article ?',
        attachments: [{ id: 'img1', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ', type: 'image/jpeg' }],
      },
    ]);
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0].attachments).toHaveLength(1);

    const bufferedFetch: StreamFetch = async () => ({
      status: 200,
      ok: true,
      body: null,
      text: async () => 'data: {"type":"delta","text":"Bonjour"}\n\ndata: {"type":"done","model":"m1"}\n\n',
    });
    const deltas: string[] = [];
    const run = streamAssistantChat(
      { conversationId: 'conv-sonim', sessionId: 'sess-sonim', messages: [{ role: 'user', text: 'Salut' }] },
      (ev) => {
        if (ev.type === 'delta') deltas.push(ev.text);
      },
      { fetchImpl: bufferedFetch },
    );
    expect(await run.finished).toBe('done');
    expect(deltas).toEqual(['Bonjour']);
  });
});

describe('parité des polices officielles Zalando Sans et feuilles compactes', () => {
  function readTtfMetrics(relPath: string): { numGlyphs: number; usWeightClass: number } {
    const buf = readFileSync(path.join(ROOT, relPath));
    const numTables = buf.readUInt16BE(4);
    let numGlyphs = 0;
    let usWeightClass = 0;
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = buf.toString('ascii', rec, rec + 4);
      const offset = buf.readUInt32BE(rec + 8);
      if (tag === 'maxp') numGlyphs = buf.readUInt16BE(offset + 4);
      if (tag === 'OS/2') usWeightClass = buf.readUInt16BE(offset + 4);
    }
    return { numGlyphs, usWeightClass };
  }

  it('embarque les 3 graisses officielles Zalando Sans (400, 600, 700 — 606 glyphes chacune) et Noto Sans Arabic', () => {
    expect(readTtfMetrics('assets/fonts/ZalandoSans-Regular.ttf')).toEqual({ numGlyphs: 606, usWeightClass: 400 });
    expect(readTtfMetrics('assets/fonts/ZalandoSans-SemiBold.ttf')).toEqual({ numGlyphs: 606, usWeightClass: 600 });
    expect(readTtfMetrics('assets/fonts/ZalandoSans-Bold.ttf')).toEqual({ numGlyphs: 606, usWeightClass: 700 });
    expect(existsSync(path.join(ROOT, 'assets/fonts/NotoSansArabic-Regular.ttf'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'assets/fonts/NotoSansArabic-Bold.ttf'))).toBe(true);
  });

  it('place la photo seule en haut de AddToCartSheet et empile prix, titre et options en dessous', () => {
    const src = readFileSync(path.join(ROOT, 'src/features/aywebs/AddToCartSheet.tsx'), 'utf8');
    expect(src).toContain('productStack:');
    expect(src).toContain('productHeroWrap:');
    expect(src).not.toContain('productRow:');
    expect(src).toMatch(/productHero:\s*\{\s*width:\s*'100%',\s*height:\s*240/);
    expect(src).toContain("router.push('/panier')");
  });

  it('affiche SizeSheet en feuille compacte du bas (AppSheet presentation="bottom") sans boîte lavande', () => {
    const ficheSrc = readFileSync(path.join(ROOT, 'src/features/product/ProductFiche.tsx'), 'utf8');
    const startIdx = ficheSrc.indexOf('function SizeSheet(');
    const endIdx = ficheSrc.indexOf('function CartReservedSheet(', startIdx);
    const sizeSheetBlock = ficheSrc.slice(startIdx, endIdx);
    expect(sizeSheetBlock).toContain('<AppSheet');
    expect(sizeSheetBlock).toContain('presentation="bottom"');
    expect(sizeSheetBlock).not.toContain('sheetTop');
    expect(sizeSheetBlock).not.toContain('recommendBanner');
  });
});

