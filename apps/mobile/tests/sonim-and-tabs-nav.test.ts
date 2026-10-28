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

  it('respecte l’ordre exact Accueil · Lens · AYWEBs · Sonim · Profil (+ cart masqué)', () => {
    const names = Array.from(layout.matchAll(/<Tabs\.Screen[\s\S]*?\bname="([^"]+)"/g), (m) => m[1]);
    expect(names).toEqual(['index', 'lens', 'aywebs', 'sonim', 'account', 'cart']);
    expect(layout).toMatch(/name="cart"\s+options=\{\{\s*href:\s*null/);
  });

  it('applique des coins arrondis réduits (radius.md = 12pt) et une haute transparence type Zalando sans élévation Android', () => {
    expect(layout).toContain('TAB_BAR_GLASS[theme.mode]');
    expect(layout).toContain("position: 'absolute'");
    expect(layout).toContain('borderRadius: theme.radius.md');
    expect(layout).not.toContain('borderRadius: theme.radius.xl');
    expect(layout).toContain('tabBarBackground:');
    expect(layout).toContain('backgroundColor: glass.background');
    expect(layout).toContain("backgroundColor: 'transparent'");
    expect(layout).toContain('...theme.elevation.none');
    expect(layout).not.toContain('...theme.elevation.medium');

    // Transparence accrue (alpha <= 0.65 en clair et en sombre, style Zalando)
    const block = /export const TAB_BAR_GLASS = \{([\s\S]*?)\} as const;/.exec(tokensMobile)?.[1] ?? '';
    const bgAlphas = Array.from(block.matchAll(/background:\s*alpha\(BRAND\.\w+,\s*([\d.]+)\)/g), (m) =>
      Number(m[1]),
    );
    expect(bgAlphas).toHaveLength(2);
    for (const a of bgAlphas) {
      expect(a).toBeLessThanOrEqual(0.65);
    }
  });

  it('utilise uniquement des icônes vectorielles intégrées de taille égale (24×24) et supprime toute plaque grise', () => {
    expect(navIcons).toContain("from 'react-native-svg'");
    expect(navIcons).toContain('export function TabHomeIcon');
    expect(navIcons).toContain('export function TabLensIcon');
    expect(navIcons).toContain('export function TabSonimIcon');
    expect(navIcons).toContain('export function TabProfileIcon');

    // Toutes les icônes vectorielles <Svg> partagent exactement viewBox="0 0 24 24"
    const viewBoxes = Array.from(navIcons.matchAll(/<Svg[\s\S]*?viewBox="([^"]+)"/g), (m) => m[1]);
    expect(viewBoxes).toEqual(['0 0 24 24', '0 0 24 24', '0 0 24 24', '0 0 24 24']);

    expect(layout).toContain('<TabHomeIcon size={theme.iconSize.md}');
    expect(layout).toContain('<TabLensIcon size={theme.iconSize.md}');
    expect(layout).toContain('<TabSonimIcon size={theme.iconSize.md}');
    expect(layout).toContain('<TabProfileIcon size={theme.iconSize.md}');
    expect(layout).toContain('const AYWEB_TAB_LOGO = { width: 24, height: 24 }');
    expect(layout).toContain('background={null}');

    // Les anciens PNG matriciels d'onglets ne doivent plus exister.
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
