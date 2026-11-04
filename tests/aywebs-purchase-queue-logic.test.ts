import { describe, expect, it } from 'vitest';
import { customerCopyText, safeStoreLink, type AyWebsQueueOrder } from '../client/src/admin/aywebsPurchaseQueueLogic';

const order = (over: Partial<AyWebsQueueOrder> = {}): AyWebsQueueOrder => ({
  id: 'ord_1',
  orderNumber: 'AYW-20261019-0001',
  status: 'PURCHASE_PENDING',
  paymentMethod: 'CARD',
  purchaseDueAt: '2026-10-19T10:00:00.000Z',
  shippingAddress: { name: 'Ahmed Ben Ali', phone: '+216 20 000 000', city: 'Sousse', line: 'Rue 1, Khezama' },
  items: [],
  totals: { payableTnd: 120 },
  ...over,
});

describe('file « Achats AYWEBs » — logique pure', () => {
  it('n’ouvre que les liens http(s) du marchand', () => {
    expect(safeStoreLink('https://www.amazon.com/dp/B000000000')).toBe('https://www.amazon.com/dp/B000000000');
    expect(safeStoreLink('http://example.test/p')).toBe('http://example.test/p');
    expect(safeStoreLink('javascript:alert(1)')).toBeNull();
    expect(safeStoreLink('data:text/html,<b>x</b>')).toBeNull();
    expect(safeStoreLink('pas une url')).toBeNull();
    expect(safeStoreLink('')).toBeNull();
  });

  it('copie le nom, le téléphone, la ville, l’adresse et la référence', () => {
    expect(customerCopyText(order())).toBe(
      'Ahmed Ben Ali\n+216 20 000 000\nSousse\nRue 1, Khezama\nRéf. AYW-20261019-0001',
    );
  });

  it('ignore les champs vides dans la copie', () => {
    expect(customerCopyText(order({ shippingAddress: { name: 'Sami' } }))).toBe('Sami\nRéf. AYW-20261019-0001');
  });

  it('ne copie jamais l’échéance interne ni le montant', () => {
    const text = customerCopyText(order());
    expect(text).not.toContain('2026-10-19T10');
    expect(text).not.toContain('120');
  });
});
