import { describe, expect, it } from 'vitest';

import type { ZayroviCart } from '@/api/cart';
import { earliestCartDeadline, formatCartCountdown, remainingMs, serverClockOffset } from '@/features/lens/lensCartStatus';

function cart(deadlines: string[]): ZayroviCart {
  return {
    sessionId: 'mob_test',
    serverNow: '2026-10-14T08:00:00.000Z',
    items: deadlines.map((priceTrustExpiresAt, index) => ({
      id: `line-${index}`,
      title: 'Produit',
      store: 'generic',
      sourceUrl: 'https://shop.example/p',
      imageUrl: '',
      sourcePrice: 10,
      sourceCurrency: 'EUR',
      lineTotalTND: 35,
      originalLineTotalTND: null,
      quantity: 1,
      variant: '',
      customerNote: '',
      availability: 'unknown',
      availabilityReason: '',
      priceVerificationStatus: 'VERIFIED',
      priceTrust: 'FRESH',
      priceTrustReason: 'TOKEN_VALID',
      priceTrustExpiresAt,
      promoLabel: '',
      discountTND: 0,
      updatedAt: '2026-10-14T08:00:00.000Z',
    })),
    units: deadlines.length,
    productSubtotalTND: 35 * deadlines.length,
    deliveryTND: 0,
    totalTND: 35 * deadlines.length,
    blockedIds: [],
  };
}

describe('minuteur authentique du panier Lens', () => {
  it('affiche toujours la prochaine échéance quand plusieurs lignes existent', () => {
    expect(earliestCartDeadline(cart([
      '2026-10-14T08:30:00.000Z',
      '2026-10-14T08:12:00.000Z',
      'date-invalide',
    ]))).toBe('2026-10-14T08:12:00.000Z');
  });

  it('formate sans dérive et ne devient jamais négatif', () => {
    const deadline = '2026-10-14T08:30:00.000Z';
    expect(formatCartCountdown(deadline, Date.parse('2026-10-14T08:00:00.000Z'))).toBe('30:00');
    expect(formatCartCountdown(deadline, Date.parse('2026-10-14T08:29:59.100Z'))).toBe('00:01');
    expect(remainingMs(deadline, Date.parse('2026-10-14T08:31:00.000Z'))).toBe(0);
  });

  it('corrige l’horloge locale avec l’instant serveur', () => {
    expect(serverClockOffset('2026-10-14T08:00:10.000Z', Date.parse('2026-10-14T08:00:00.000Z'))).toBe(10_000);
  });
});
