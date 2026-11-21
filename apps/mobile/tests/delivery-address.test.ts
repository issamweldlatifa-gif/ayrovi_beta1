import { expect, it } from 'vitest';
import type { Address } from '../src/api/account';
import { checkoutDeliverySelection, deliveryDraft, isDeliveryComplete, orderAddress } from '../src/features/personal/deliveryAddress';
import { storeListing } from '../src/features/settings/listing';

it('prefills the actual default, falls back to contact only, and serializes optional details once', () => {
  const draft = deliveryDraft({ recipientName: 'Test Client', phone: '+216 98 123 456', governorate: 'Ariana',
    city: ' Ariana ', postalCode: ' 2080 ', deliveryNotes: ' 2e étage ', addressLine: ' 10 Rue du test ' });
  const other = { ...draft, id: 'other', isDefault: false, label: 'Autre' } satisfies Address;
  const preferred = { ...other, id: 'preferred', isDefault: true };
  expect(checkoutDeliverySelection([other, preferred], { recipientName: 'Contact compte' })).toEqual({ addressId: 'preferred', draft });
  expect(checkoutDeliverySelection([other], { recipientName: 'Contact compte' }).draft.recipientName).toBe('Contact compte');
  expect(isDeliveryComplete(draft)).toBe(true);
  expect(isDeliveryComplete({ ...draft, phone: '0612345678' })).toBe(false);
  expect(orderAddress(draft)).toBe('10 Rue du test, 2080 Ariana, 2e étage');
  expect(orderAddress(deliveryDraft({ addressLine: 'Rue 1' }))).toBe('Rue 1');
});

it('only presents valid configured store listings for the current platform', () => {
  expect(storeListing(undefined, 'android')).toBeNull();
  expect(storeListing('https://example.com/store/apps/details?id=app.zayrovi.mobile', 'android')).toBeNull();
  expect(storeListing('https://play.google.com/store/apps/details?id=app.zayrovi.mobile&referrer=test', 'android')).toBe('https://play.google.com/store/apps/details?id=app.zayrovi.mobile');
  expect(storeListing('https://apps.apple.com/fr/app/zayrovi/id1234567', 'android')).toBeNull();
  expect(storeListing('https://apps.apple.com/fr/app/zayrovi/id1234567', 'ios')).toBe('https://apps.apple.com/fr/app/zayrovi/id1234567');
});
