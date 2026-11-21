import request from 'supertest';
import { expect, it } from 'vitest';
import { DEFAULT_HIGHLIGHTS, normalizeHighlights, ZAYROVI_HIGHLIGHTS_KEY } from '../shared/zayroviHighlights';
import { app, db } from '../src/server';
import { createAdminSession, setAdminCookie } from '../src/admin/auth';
import { createCustomerSession } from '../src/customer/auth';
import { writeSocialInteraction } from '../src/magazine/socialInteractions';

const publicPath = '/api/public/zayrovi-highlights';
const adminPath = '/api/admin/zayrovi-highlights';

it('requires four distinct bounded Reel references when enabled', () => {
  const { slots } = DEFAULT_HIGHLIGHTS;
  expect(normalizeHighlights(DEFAULT_HIGHLIGHTS)).toEqual(DEFAULT_HIGHLIGHTS);
  expect(normalizeHighlights({ enabled: true, slots: slots.slice(0, 3) })).toBeNull();
  expect(normalizeHighlights({ enabled: false, slots: [...slots, slots[0]] })).toBeNull();
  expect(normalizeHighlights({ enabled: false, slots: [slots[0], slots[0]] })).toBeNull();
  expect(normalizeHighlights({ enabled: false, slots: [{ reelId: 'https://example.com/video', productId: '' }] })).toBeNull();
  expect(normalizeHighlights({ enabled: false, slots: [] })).toEqual({ enabled: false, slots: [] });
});

it('curates ordered official Reels with live product data, account-isolated reactions and audited CRM settings', async () => {
  const snapshot = db.get<{ setting_value: string; updated_at: string }>('SELECT setting_value,updated_at FROM settings WHERE setting_key=?', ZAYROVI_HIGHLIGHTS_KEY);
  const admin = db.get<{ id: string }>('SELECT id FROM admin_users WHERE email=?', process.env.ADMIN_EMAIL)!;
  const session = createAdminSession(db, admin, true);
  let cookie = '';
  setAdminCookie({ setHeader: (_: string, value: string) => { cookie = value.split(';')[0]!; } } as never, session.token);
  const authorized = (req: request.Test) => req.set('Cookie', cookie).set('x-csrf-token', session.csrfToken);
  const getPublic = () => request(app).get(publicPath).expect(200).expect('Cache-Control', 'private, no-store');
  const stable = (await getPublic()).body.data as { id: string; products: { id: string }[] }[];
  // The checked-in demo Reels/products exercise the real installed catalogue.
  expect(stable.map(row => row.id)).toEqual(DEFAULT_HIGHLIGHTS.slots.map(slot => slot.reelId));
  const chosen = stable[0]!;
  const lead = chosen.products[1]!;
  const slots = DEFAULT_HIGHLIGHTS.slots.map(slot => slot.reelId === chosen.id ? { ...slot, productId: lead.id } : slot).reverse();
  const draft = { enabled: true, slots };
  const save = (data: object) => authorized(request(app).put(adminPath)).send(data);
  const now = new Date().toISOString();
  const customer = { id: 'highlight_test_customer', displayName: 'Client Highlights' };
  const originalProduct = db.get<{ final_price: number; status: string }>('SELECT final_price,status FROM products WHERE id=?', lead.id)!;
  const originalReel = db.get<{ publish_at: string; status: string; poster_url: string }>('SELECT publish_at,status,poster_url FROM reels WHERE id=?', chosen.id)!;
  try {
    await request(app).get(adminPath).expect(401);
    await request(app).put(adminPath).set('Cookie', cookie).send(draft).expect(403);
    const search = await authorized(request(app).get(`${adminPath}/reels`)).query({ q: chosen.id }).expect(200);
    expect(search.body.data.find((row: { id: string }) => row.id === chosen.id).products.map((row: { id: string }) => row.id)).toContain(lead.id);
    await save({ ...draft, slots: slots.map(slot => slot.reelId === chosen.id ? { ...slot, productId: 'unlinked' } : slot) }).expect(400);
    await save(draft).expect(200);
    expect(db.get("SELECT entity_id FROM audit_logs WHERE module='ZAYROVI_HIGHLIGHTS' AND action='UPDATE' AND user_id=?", admin.id)).toEqual({ entity_id: 'global' });
    await authorized(request(app).put(`/api/admin/settings/${ZAYROVI_HIGHLIGHTS_KEY}`)).send({ value: '{}' }).expect(409);
    const after = (await getPublic()).body.data;
    expect(after.map((row: { id: string }) => row.id)).toEqual(slots.map(slot => slot.reelId));
    expect(after.at(-1).product.id).toBe(lead.id);
    expect(after.at(-1)).not.toHaveProperty('product_id');
    expect(after.at(-1)).not.toHaveProperty('my_reaction');

    db.run("INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES (?,?,'ACTIVE',?,?)", customer.id, customer.displayName, now, now);
    const member = createCustomerSession(db, customer.id, { ip: '127.0.0.1', headers: {} } as never);
    writeSocialInteraction(db, { targetId: chosen.id, type: 'reaction', reaction: 'like' }, customer, '', now);
    const signedIn = await getPublic().set('Authorization', `Bearer ${member.token}`);
    expect(signedIn.body.data.at(-1).my_reaction).toBe('like');
    expect((await getPublic()).body.data.at(-1)).not.toHaveProperty('my_reaction');

    db.run('UPDATE products SET final_price=? WHERE id=?', 123.45, lead.id);
    expect((await getPublic()).body.data.at(-1).product).toMatchObject({ id: lead.id, price: 123.45 });
    db.run("UPDATE products SET status='INACTIVE' WHERE id=?", lead.id);
    expect((await getPublic()).body.data.at(-1)).toMatchObject({ id: chosen.id, product: null });
    await save(draft).expect(400);
    db.run('UPDATE products SET status=? WHERE id=?', originalProduct.status, lead.id);
    db.run("UPDATE reels SET publish_at='2099-01-01T00:00:00.000Z' WHERE id=?", chosen.id);
    expect((await getPublic()).body.data.map((row: { id: string }) => row.id)).not.toContain(chosen.id);
    await save(draft).expect(400);
    db.run("UPDATE reels SET publish_at=?, status='brouillon' WHERE id=?", originalReel.publish_at, chosen.id);
    expect((await getPublic()).body.data.map((row: { id: string }) => row.id)).not.toContain(chosen.id);
    db.run("UPDATE reels SET status=?, poster_url='' WHERE id=?", originalReel.status, chosen.id);
    await save(draft).expect(400);
    db.run('DELETE FROM settings WHERE setting_key=?', ZAYROVI_HIGHLIGHTS_KEY);
    const fallback = (await getPublic()).body;
    expect(fallback.highlightsEnabled).toBe(true);
    expect(fallback.data).toHaveLength(4);
    expect(fallback.data.every((row: { id: string; product: unknown }) => row.id !== chosen.id && row.product)).toBe(true);
    await save({ ...draft, enabled: false }).expect(200);
    expect((await getPublic()).body).toMatchObject({ highlightsEnabled: false, data: [] });
  } finally {
    db.run('DELETE FROM story_interactions WHERE account_id=?', customer.id);
    db.run('DELETE FROM customer_accounts WHERE id=?', customer.id);
    db.run('UPDATE products SET final_price=?,status=? WHERE id=?', originalProduct.final_price, originalProduct.status, lead.id);
    db.run('UPDATE reels SET publish_at=?,status=?,poster_url=? WHERE id=?', originalReel.publish_at, originalReel.status, originalReel.poster_url, chosen.id);
    if (snapshot) db.run('UPDATE settings SET setting_value=?,updated_at=? WHERE setting_key=?', snapshot.setting_value, snapshot.updated_at, ZAYROVI_HIGHLIGHTS_KEY);
    else db.run('DELETE FROM settings WHERE setting_key=?', ZAYROVI_HIGHLIGHTS_KEY);
  }
});
