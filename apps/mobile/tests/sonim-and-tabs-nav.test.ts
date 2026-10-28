/**
 * Verrou de la barre de navigation transparente à 5 onglets et de Sonim.
 *
 * Garantit :
 *   1. l'ordre exact `index` · `lens` · `aywebs` · `sonim` · `account` (+ `cart` masqué) ;
 *   2. le style flottant transparent à angles arrondis (`TAB_BAR_GLASS`, `theme.radius.xl`) ;
 *   3. l'intégrité des pictogrammes RGBA `tab-lens-icon.png` et `tab-sonim-icon.png` ;
 *   4. la normalisation des outils Sonim (`get_order_status`, `calculate_price`,
 *      `search_products`, `escalate_to_human`) et des pièces jointes multimodales.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

function readPngHeader(filePath: string) {
  const buf = readFileSync(filePath);
  const sig = buf.subarray(0, 8).toString('hex');
  expect(sig).toBe('89504e470d0a1a0a');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25];
  const sha256 = createHash('sha256').update(buf).digest('hex');
  return { width, height, colorType, size: buf.length, sha256 };
}

describe('barre du bas transparente à angles arrondis (5 onglets)', () => {
  const layout = readFileSync(path.join(ROOT, 'app/(tabs)/_layout.tsx'), 'utf8');

  it('respecte l’ordre exact Accueil · Lens · AYWEBs · Sonim · Profil (+ cart masqué)', () => {
    const names = Array.from(layout.matchAll(/<Tabs\.Screen[\s\S]*?\bname="([^"]+)"/g), (m) => m[1]);
    expect(names).toEqual(['index', 'lens', 'aywebs', 'sonim', 'account', 'cart']);
    expect(layout).toMatch(/name="cart"\s+options=\{\{\s*href:\s*null/);
  });

  it('applique la capsule flottante transparente à angles arrondis', () => {
    expect(layout).toContain('TAB_BAR_GLASS[theme.mode]');
    expect(layout).toContain("position: 'absolute'");
    expect(layout).toContain('borderRadius: theme.radius.xl');
    expect(layout).toContain('backgroundColor: glass.background');
  });

  it('embarque deux icônes RGBA 256×256 distinctes pour Lens et Sonim', () => {
    const lensIcon = readPngHeader(path.join(ROOT, 'assets/tab-lens-icon.png'));
    const sonimIcon = readPngHeader(path.join(ROOT, 'assets/tab-sonim-icon.png'));
    expect(lensIcon.width).toBe(256);
    expect(lensIcon.height).toBe(256);
    expect(lensIcon.colorType).toBe(6); // RGBA
    expect(sonimIcon.width).toBe(256);
    expect(sonimIcon.height).toBe(256);
    expect(sonimIcon.colorType).toBe(6); // RGBA
    expect(lensIcon.sha256).not.toBe(sonimIcon.sha256);
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
