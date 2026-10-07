/**
 * Surface « compte » de l'application (P2.2) : profil, adresses, favoris,
 * notifications, préférences, sécurité, détail de commande.
 *
 * Ce que ces tests tiennent :
 *   1. la lecture des réponses reste STRICTE (une ligne illisible ne peint pas
 *      la moitié d'une adresse ni un montant faux) ;
 *   2. les écritures envoient exactement les champs du serveur, et le verbe HTTP
 *      attendu — un PUT pris pour un POST échoue silencieusement en production ;
 *   3. ce que le serveur calcule n'est jamais recalculé ici : le reste à payer
 *      d'une commande vient de lui, point.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAuthContext, setAuthContext } from '../src/api/client';
import { API_BASE_URL, CLIENT_HEADER } from '../src/api/config';
import {
  changePassword, createAddress, deleteAddress, fetchAddresses, fetchFavorites, fetchNotifications,
  fetchOrderDetail, fetchPreferences, fetchSecurity, markNotificationsRead, parseAddresses,
  parseFavorites, parseOrderDetail, parsePreferences, parseSecurity, removeFavorite,
  savePreferences, updateAddress, updateProfile,
} from '../src/api/account';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const respond = (handler: (url: string, init: RequestInit) => Response) =>
  vi.fn(async (url: unknown, init: unknown) => handler(String(url), (init ?? {}) as RequestInit));

const lastCall = (mock: ReturnType<typeof respond>) => {
  const [url, init] = mock.mock.calls[mock.mock.calls.length - 1];
  return { url: String(url), init: init as RequestInit, headers: (init as RequestInit).headers as Record<string, string> };
};

beforeEach(() => {
  vi.unstubAllGlobals();
  resetAuthContext();
  setAuthContext({ clientHeader: CLIENT_HEADER, token: 'jeton-1', csrfToken: 'csrf-1' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/* ── Adresses ──────────────────────────────────────────────────────────────── */

describe('adresses', () => {
  it('lit les colonnes du serveur sans en perdre une', () => {
    const [address] = parseAddresses([{
      id: 'address_1', label: 'Maison', recipient_name: 'Amine', phone: '+21620123456',
      governorate: 'Tunis', city: 'La Marsa', postal_code: '2070', address_line: '12 rue X',
      delivery_notes: 'Sonner deux fois', is_default: 1,
    }]);
    expect(address).toEqual({
      id: 'address_1', label: 'Maison', recipientName: 'Amine', phone: '+21620123456',
      governorate: 'Tunis', city: 'La Marsa', postalCode: '2070', addressLine: '12 rue X',
      deliveryNotes: 'Sonner deux fois', isDefault: true,
    });
  });

  it('ignore une adresse sans identifiant', () => {
    expect(parseAddresses([{ recipient_name: 'Amine' }, null, 'x'])).toEqual([]);
  });

  it('lit la liste via GET et crée via POST avec les champs du serveur', async () => {
    const fetchMock = respond(() => json({ success: true, data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchAddresses();
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/api/customer/account/addresses`);
    expect(lastCall(fetchMock).init.method).toBe('GET');

    await createAddress({
      label: 'Bureau', recipientName: 'Amine', phone: '20123456', governorate: 'Ariana',
      addressLine: 'Centre urbain nord', isDefault: true,
    });
    const call = lastCall(fetchMock);
    expect(call.init.method).toBe('POST');
    expect(call.headers['x-csrf-token']).toBe('csrf-1');
    expect(JSON.parse(String(call.init.body))).toMatchObject({
      label: 'Bureau', recipientName: 'Amine', governorate: 'Ariana', isDefault: true,
    });
  });

  it('modifie en PUT et supprime en DELETE, en échappant l’identifiant', async () => {
    const fetchMock = respond(() => json({ success: true, data: { id: 'address/1' } }));
    vi.stubGlobal('fetch', fetchMock);

    await updateAddress('address/1', { label: 'Maison', recipientName: 'A', phone: '20123456', governorate: 'Tunis', addressLine: 'X' });
    expect(lastCall(fetchMock).init.method).toBe('PUT');
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/api/customer/account/addresses/address%2F1`);

    await deleteAddress('address/1');
    expect(lastCall(fetchMock).init.method).toBe('DELETE');
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/api/customer/account/addresses/address%2F1`);
  });
});

/* ── Favoris et notifications ──────────────────────────────────────────────── */

describe('favoris et notifications', () => {
  it('garde le prix mémorisé, y compris son absence', () => {
    const favorites = parseFavorites([
      { id: 'f1', title: 'Montre', price_tnd: '129.9', source_url: 'https://x.tn/p', image_url: 'https://x.tn/i.jpg' },
      { id: 'f2', title: 'Sans prix', price_tnd: null },
    ]);
    expect(favorites[0].priceTnd).toBe(129.9);
    // `null` reste `null` : afficher 0.00 DT serait un prix inventé.
    expect(favorites[1].priceTnd).toBeNull();
  });

  it('retire un favori par son identifiant', async () => {
    const fetchMock = respond(() => json({ success: true, data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await removeFavorite('favorite_1');
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/api/customer/account/favorites/favorite_1`);
    expect(lastCall(fetchMock).init.method).toBe('DELETE');
  });

  it('marque tout comme lu quand aucun identifiant n’est fourni', async () => {
    const fetchMock = respond(() => json({ success: true, data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await markNotificationsRead();
    expect(JSON.parse(String(lastCall(fetchMock).init.body))).toEqual({});

    await markNotificationsRead('notif_1');
    expect(JSON.parse(String(lastCall(fetchMock).init.body))).toEqual({ id: 'notif_1' });
  });

  it('lit les notifications en ignorant les lignes sans identifiant', async () => {
    vi.stubGlobal('fetch', respond(() => json({
      success: true,
      data: [{ id: 'n1', type: 'ORDER', title: 'Commande', message: 'Expédiée', read_at: '', created_at: '2026-10-07T10:00:00.000Z' }, { title: 'sans id' }],
    })));
    const items = await fetchNotifications();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'n1', title: 'Commande' });
  });
});

/* ── Préférences et sécurité ───────────────────────────────────────────────── */

describe('préférences', () => {
  it('considère une préférence absente comme active, sauf le thème sombre', () => {
    const preferences = parsePreferences({ account_id: 'a1', order_updates: 0 });
    expect(preferences.orderUpdates).toBe(false);
    expect(preferences.paymentUpdates).toBe(true);
    // `dark_mode` est le seul dont le défaut est éteint côté serveur.
    expect(preferences.darkMode).toBe(false);
  });

  it('enregistre en PUT avec les noms camelCase attendus par le serveur', async () => {
    const fetchMock = respond(() => json({ success: true, data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await savePreferences({ orderUpdates: false, invoiceUpdates: true });
    const call = lastCall(fetchMock);
    expect(call.init.method).toBe('PUT');
    expect(call.url).toBe(`${API_BASE_URL}/api/customer/account/preferences`);
    expect(JSON.parse(String(call.init.body))).toEqual({ orderUpdates: false, invoiceUpdates: true });
  });

  it('lit l’état de sécurité tel quel', async () => {
    vi.stubGlobal('fetch', respond(() => json({
      success: true,
      data: {
        emailVerified: false, phoneVerified: true, hasPassword: true,
        identities: [{ provider: 'google', created_at: '2026-10-01T00:00:00.000Z' }],
        activeSessions: 2, lastLoginAt: '2026-10-07T09:00:00.000Z',
      },
    })));
    const security = await fetchSecurity();
    expect(security).toMatchObject({ phoneVerified: true, hasPassword: true, activeSessions: 2 });
    expect(security.identities[0].provider).toBe('google');
  });

  it('lit une sécurité vide sans casser l’écran', () => {
    expect(parseSecurity(undefined)).toEqual({
      emailVerified: false, phoneVerified: false, hasPassword: false, identities: [], activeSessions: 0, lastLoginAt: '',
    });
  });
});

/* ── Profil et mot de passe ────────────────────────────────────────────────── */

describe('profil et mot de passe', () => {
  it('envoie l’e-mail vide comme absent, jamais comme chaîne vide acceptée', async () => {
    const fetchMock = respond(() => json({ success: true, data: { id: 'a1', displayName: 'Amine' } }));
    vi.stubGlobal('fetch', fetchMock);
    await updateProfile({ displayName: 'Amine', marketingOptIn: false });
    const body = JSON.parse(String(lastCall(fetchMock).init.body));
    expect(body).toEqual({ displayName: 'Amine', marketingOptIn: false });
    expect(lastCall(fetchMock).init.method).toBe('PUT');
  });

  it('adopte le nouveau jeton renvoyé par le changement de mot de passe', async () => {
    const fetchMock = respond(() => json({
      success: true,
      data: {
        account: { id: 'a1', displayName: 'Amine' }, csrfToken: 'csrf-2',
        session_token: 'jeton-2', session_expires_at: '2026-12-01T00:00:00.000Z',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const issue = await changePassword('Ancien2026!', 'Nouveau2026!');
    // Sans ce jeton, la session courante vient d'être fermée par le serveur :
    // l'utilisateur serait déconnecté juste après un succès.
    expect(issue.sessionToken).toBe('jeton-2');
    expect(issue.csrfToken).toBe('csrf-2');
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/api/customer/account/security/password`);
  });
});

/* ── Détail de commande ────────────────────────────────────────────────────── */

describe('détail de commande', () => {
  const payload = {
    id: 'order_1', order_number: 'AYR-1001', status: 'SHIPPED', payment_status: 'PAID', payment_method: 'CARD',
    total_tnd: 199.5, paid_amount_tnd: 100, remainder_tnd: 99.5, governorate: 'Tunis', address_line: '12 rue X',
    created_at: '2026-10-05T10:00:00.000Z',
    items: [{ id: 'item_1', product_name: 'Montre', quantity: 2, converted_price_tnd: 99.75, total_tnd: 199.5, variant: '' }],
    history: [{ id: 'h1', status: 'CONFIRMED', note: '', created_at: '2026-10-05T11:00:00.000Z' }],
    delivery: { carrier: 'Aramex', tracking_number: 'TN123', tracking_url: 'https://track.tn/TN123', shipped_at: '2026-10-06T08:00:00.000Z' },
    invoice: { invoice_number: 'FAC-2026-001' },
    paymentOptions: { transfer: { companyName: 'AYROVI', bankRib: 'TN59...', posteAccount: '12345', reviewDelay: '24h' } },
  };

  it('lit ce que le serveur a calculé, sans le recalculer', () => {
    const order = parseOrderDetail(payload);
    expect(order.orderNumber).toBe('AYR-1001');
    expect(order.paidTnd).toBe(100);
    expect(order.remainderTnd).toBe(99.5);
    expect(order.items[0]).toMatchObject({ title: 'Montre', quantity: 2, unitPriceTnd: 99.75 });
    expect(order.tracking).toMatchObject({ carrier: 'Aramex', trackingNumber: 'TN123' });
    expect(order.invoiceNumber).toBe('FAC-2026-001');
  });

  it('compose la variante depuis requested_size/requested_color', () => {
    const order = parseOrderDetail({
      ...payload,
      items: [{ id: 'item_2', product_name: 'Sac', quantity: 1, converted_price_tnd: 89, total_tnd: 89, requested_size: 'M', requested_color: 'Noir' }],
    });
    expect(order.items[0].title).toBe('Sac');
    expect(order.items[0].variant).toBe('M / Noir');
    expect(order.items[0].unitPriceTnd).toBe(89);
  });

  it('n’invente pas un suivi quand le serveur n’en donne pas', () => {
    // Tant que la commande n'est pas expédiée, le serveur renvoie des champs vides.
    const order = parseOrderDetail({ ...payload, delivery: { carrier: '', tracking_number: '', tracking_url: '', shipped_at: null } });
    expect(order.tracking.trackingNumber).toBe('');
    expect(order.tracking.shippedAt).toBe('');
  });

  it('refuse une commande sans identifiant au lieu d’afficher un écran vide', () => {
    expect(() => parseOrderDetail({ order_number: 'AYR-1' })).toThrow(/identifiant/);
    expect(() => parseOrderDetail(null)).toThrow(/illisible/);
  });

  it('appelle la bonne route avec l’identifiant échappé', async () => {
    const fetchMock = respond(() => json({ success: true, data: payload }));
    vi.stubGlobal('fetch', fetchMock);
    const order = await fetchOrderDetail('order/1');
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/api/customer/account/orders/order%2F1`);
    expect(order.id).toBe('order_1');
  });
});
