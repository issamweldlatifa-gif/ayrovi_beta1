import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import { expect, it } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import { app, db } from '../src/server';
import { demoTnd, ZALANDO_DEMO, ZALANDO_DEMO_MIGRATION, zalandoDemoProductId } from '../src/catalogue/installZalandoDemoCatalogue';
import { installOfficialCatalogue, officialProductId, purgeCatalogueProducts } from '../src/catalogue/installOfficialCatalogue';
import { listProducts } from '../src/catalogue/products';
import { addCatalogueLine } from '../src/catalogue/cartAdd';
import { BLACK_FRIDAY_DEMO } from '../src/catalogue/blackFriday';
import { inspectCatalogueSale } from '../src/catalogue/localSale';
import { recordMovement } from '../src/inventory/stock';

const now = '2026-11-19T12:00:00.000Z';
const id = (n: string) => zalandoDemoProductId(`zalando-p${n}`);

it('launches exactly 24 public catalogue products and 480 pieces of demo inventory', async () => {
  const active = db.all<{ id: string; final_price: number; currency: string; original_price: number }>(
    "SELECT id, final_price, currency, original_price FROM products WHERE status='ACTIVE' AND visibility='CATALOG' ORDER BY product_code",
  );
  expect(active).toEqual(ZALANDO_DEMO.products.map(item => {
    const regular = demoTnd(item.priceEurCents);
    const percent = BLACK_FRIDAY_DEMO.find(([key]) => key === item.key)?.[1] ?? 0;
    return { id: zalandoDemoProductId(item.key), final_price: Math.floor(Math.round(regular * 1000) * (100 - percent) / 100) / 1000, currency: 'TND', original_price: 0 };
  }));
  const stocks = db.all<{ id: string; qty: number }>('SELECT product_id id, SUM(quantity) qty FROM inventory_stock_items GROUP BY product_id ORDER BY product_id');
  expect(stocks).toEqual(active.map(item => ({ id: item.id, qty: 20 })));
  expect(listProducts(db, { pageSize: 30 }).pagination.total).toBe(24);
  const detail = await request(app).get(`/api/public/products/${id('001')}`).expect(200);
  expect(detail.body.data).toMatchObject({ finalPrice: 134.051, currency: 'TND', sheet: { stock: { quantity: 20 }, purchasable: true } });
  await request(app).get(detail.body.data.image).expect(200).expect('Content-Type', /image\/jpeg/);
  await request(app).get(`/api/public/products/${officialProductId('jbl-go-4')}`).expect(404);
});

it('sells only stocked test choices, keeps unknown sizes unset and keeps larger volume prices separate', () => {
  expect(inspectCatalogueSale(db, id('001'), 'XS', '', 10).available).toBe(10);
  expect(() => inspectCatalogueSale(db, id('001'), 'XS', '', 11)).toThrow('Quantité indisponible');
  for (const n of ['002', '011']) expect(inspectCatalogueSale(db, id(n)).variant).toBeNull();
  expect(inspectCatalogueSale(db, id('015'), '30 ml').product.final_price).toBe(demoTnd(2485));
  expect(() => inspectCatalogueSale(db, id('015'), '90 ml')).toThrow('Cette taille');
  const options = db.all<{ quantity: number }>('SELECT quantity FROM inventory_stock_items WHERE product_id=?', id('019'));
  expect(options).toHaveLength(34);
  expect(options.filter(option => option.quantity === 1)).toHaveLength(20);
});

it('adds a demo product to the cart at its authoritative TND price', () => {
  const sessionId = 'zalando-demo-cart-fixture';
  addCatalogueLine(db, { sessionId, accountId: null, productId: id('001'), now, quantity: 2, requestedSize: 'XS', requestedColor: '', customerNote: '' });
  expect(db.getItems(sessionId, null)).toMatchObject([{ quantity: 2, priceTND: 134.051, sourceCurrency: 'TND' }]);
  expect(() => addCatalogueLine(db, { sessionId, accountId: null, productId: id('001'), now, quantity: 9, requestedSize: 'XS', requestedColor: '', customerNote: '' })).toThrow('Quantité indisponible');
});

it('backs up the previous catalogue; removes old SKUs safely and preserves stock history, temporary products and later edits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zalando-demo-upgrade-'));
  const file = path.join(root, 'catalogue.sqlite');
  let fixture = new QatafoDatabase(file);
  try {
    purgeCatalogueProducts(fixture);
    installOfficialCatalogue(fixture, now);
    fixture.run('DELETE FROM applied_data_migrations WHERE key=?', ZALANDO_DEMO_MIGRATION);
    const historical = officialProductId('jbl-go-4');
    const deletable = officialProductId('nike-dri-fit-legend');
    const stock = fixture.get<{ id: string }>('SELECT id FROM inventory_stock_items WHERE product_id=? LIMIT 1', historical)!;
    const movement = recordMovement(fixture, { itemId: stock.id, location: 'MAIN', direction: 'IN', quantity: 1, reason: 'CORRECTION', note: 'historical fixture', referenceType: null, referenceId: null, idempotencyKey: null, actor: { id: null, name: 'Test' } });
    expect(movement.ok).toBe(true);
    fixture.run("UPDATE products SET visibility='CONTENT' WHERE id=?", officialProductId('levis-501-original'));
    const persisted = fixture.all('SELECT * FROM inventory_stock_movements WHERE product_id=?', historical);
    fixture.close(); fixture = new QatafoDatabase(file);
    expect(fixture.get('SELECT status FROM products WHERE id=?', historical)).toEqual({ status: 'ARCHIVED' });
    expect(fixture.all('SELECT * FROM inventory_stock_movements WHERE product_id=?', historical)).toEqual(persisted);
    expect(fixture.get('SELECT id FROM products WHERE id=?', deletable)).toBeUndefined();
    expect(fixture.get('SELECT visibility,status FROM products WHERE id=?', officialProductId('levis-501-original'))).toEqual({ visibility: 'CONTENT', status: 'ACTIVE' });
    expect(fixture.all('PRAGMA foreign_key_check')).toEqual([]);
    const backups = fs.readdirSync(path.join(root, 'backups')).filter(name => name.startsWith('pre-zalando-demo-catalogue-'));
    expect(backups).toHaveLength(1);
    const copy = new Database(path.join(root, 'backups', backups[0]), { readonly: true });
    try {
      expect(copy.prepare('SELECT id FROM products WHERE id=?').get(deletable)).toEqual({ id: deletable });
      expect(copy.prepare('SELECT id FROM products WHERE id=?').get(id('001'))).toBeUndefined();
      expect(copy.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    } finally { copy.close(); }
    fixture.run('UPDATE products SET final_price=? WHERE id=?', 135, id('001'));
    fixture.run('UPDATE inventory_stock_items SET quantity=9 WHERE id=(SELECT id FROM inventory_stock_items WHERE product_id=? LIMIT 1)', id('001'));
    fixture.close(); fixture = new QatafoDatabase(file);
    expect(fixture.get('SELECT final_price FROM products WHERE id=?', id('001'))).toEqual({ final_price: 135 });
    expect(fixture.get('SELECT SUM(quantity) qty FROM inventory_stock_items WHERE product_id=?', id('001'))).toEqual({ qty: 19 });
  } finally { fixture.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
