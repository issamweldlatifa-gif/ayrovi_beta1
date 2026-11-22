import { describe, expect, it } from 'vitest';
import { notificationDestination } from '../src/features/account/notificationLink';

describe('notificationDestination', () => {
  it('ouvre la commande exacte écrite par le back office', () => {
    expect(notificationDestination('/compte/commandes/order_123')).toEqual({ pathname: '/orders/[id]', params: { id: 'order_123' } });
    expect(notificationDestination('/compte/suivi')).toEqual({ pathname: '/orders' });
    expect(notificationDestination('/compte/profil')).toEqual({ pathname: '/account/profile' });
    expect(notificationDestination('/compte')).toEqual({ pathname: '/(tabs)/account' });
  });

  it('ne fabrique jamais de destination pour un chemin inconnu ou externe', () => {
    expect(notificationDestination('/account?tab=notifications')).toBeNull();
    expect(notificationDestination('https://example.com/compte/commandes/x')).toBeNull();
    expect(notificationDestination('')).toBeNull();
    expect(notificationDestination('/compte/commandes/')).toEqual({ pathname: '/orders' });
  });
});
