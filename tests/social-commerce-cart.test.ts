import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import { createApiRouter } from '../src/api/routes';
import { SmartLinkScraper } from '../src/scraper/scraper';
import { VisualProductExtractor } from '../src/services/vision';
import { updateEditionState } from '../src/social-commerce/editions';

let db: QatafoDatabase;
let app: express.Express;
const session = 'look-test-session';
const edition = { number: 22, title: 'Look réel', subtitle: '', cover: '/media/cover.webp', startsAt: '2020-01-01', endsAt: '2099-01-01', entries: [
  { id: 'look-1', kind: 'look', title: 'Deux pièces', description: '', image: '/media/look.webp', pins: [{ productId: 'look-a', x: 20, y: 20 }, { productId: 'look-b', x: 55, y: 55 }] },
] };
const selections = [{ productId: 'look-a', size: '', color: '', price: 50 }, { productId: 'look-b', size: 'M', color: 'Noir', price: 45 }];
const input = (lines = selections, requestId = randomUUID()) => ({ lookId: 'look-1', editionNumber: 22, requestId, selections: lines });
const post = (body: unknown, id = session) => request(app).post('/api/cart/catalog/look').set('x-session-id', id).send(body as object);

beforeEach(() => {
  db = new QatafoDatabase(':memory:');
  const now = new Date().toISOString();
  db.run(`INSERT INTO products (id,name,status,stock_status,final_price,created_at,updated_at) VALUES
    ('look-a','A','ACTIVE','AVAILABLE',50,?,?),('look-b','B','ACTIVE','AVAILABLE',45,?,?)`, now, now, now, now);
  db.run(`INSERT INTO catalogue_variants (id,product_id,sku,size,color,status,created_at,updated_at) VALUES
    ('look-bm','look-b','S1','M','Noir','ACTIVE',?,?),('look-bl','look-b','S2','L','Noir','ACTIVE',?,?)`, now, now, now, now);
  db.run(`INSERT INTO inventory_stock_items (id,product_id,variant_id,quantity,created_at,updated_at) VALUES ('look-inv','look-b','look-bm',1,?,?)`, now, now);
  expect(updateEditionState(db, 'save', 0, edition, now).status).toBe(200);
  expect(updateEditionState(db, 'publish', 1, null, now).status).toBe(200);
  app = express(); app.use(express.json());
  app.use('/api', createApiRouter(db, new SmartLinkScraper(), new VisualProductExtractor()));
});
afterEach(() => db.close());

it('uses the ordinary catalogue lines and confirms the same request at most once', async () => {
  const body = input();
  const first = await post(body);
  expect(first.status).toBe(201);
  expect(first.body).toMatchObject({ addedCount: 2, totalItemsCount: 2, replay: false });
  expect(db.getItems(session).map(row => [row.externalId, row.priceTND, row.quantity, row.requestedSize]).sort()).toEqual([
    ['catalog-look-a', 50, 1, ''], ['catalog-look-b', 45, 1, 'M'],
  ]);
  const retry = await post({ ...body, selections: [...body.selections].reverse() });
  expect(retry.status).toBe(200);
  expect(retry.body).toMatchObject({ addedCount: 2, totalItemsCount: 2, replay: true });
  expect((await post({ ...body, selections: [{ ...selections[0], price: 51 }, selections[1]] })).body.code).toBe('LOOK_REQUEST_REUSED');
  const another = await post(body, 'other-look-owner');
  expect(another.status).toBe(201);
});

it('rolls every line back, including an already merged item, when a later item runs out', async () => {
  const single = await request(app).post('/api/cart/catalog').set('x-session-id', session).send({ productId: 'look-a' });
  expect(single.status).toBe(201);
  db.run('UPDATE inventory_stock_items SET quantity=0 WHERE id=?', 'look-inv');
  const body = input();
  const result = await post(body);
  expect(result.status).toBe(409);
  expect(result.body.code).toBe('INSUFFICIENT_STOCK');
  expect(db.getItems(session)).toMatchObject([{ externalId: 'catalog-look-a', quantity: 1 }]);
  db.run('UPDATE inventory_stock_items SET quantity=1 WHERE id=?', 'look-inv');
  expect((await post(body)).status).toBe(201);
  expect(db.getItems(session).find(line => line.externalId === 'catalog-look-a')?.quantity).toBe(2);
});

it('refuses missing or forged items, wrong variants and stale catalogue prices without side effects', async () => {
  expect((await post(input(selections.slice(0, 1)))).body.code).toBe('LOOK_CHANGED');
  expect((await post(input([selections[0], { ...selections[1], productId: 'forged' }]))).body.code).toBe('LOOK_CHANGED');
  expect((await post(input([selections[0], { ...selections[1], size: '' }]))).body.code).toBe('SELECTION_REQUIRED');
  db.run("UPDATE products SET final_price=55 WHERE id='look-b'");
  expect((await post(input())).body.code).toBe('LOOK_PRICE_CHANGED');
  expect(db.getItems(session)).toEqual([]);
  const now = new Date().toISOString();
  expect(updateEditionState(db, 'rollback', 2, null, now).status).toBe(200);
  expect((await post(input())).body.code).toBe('LOOK_CHANGED');
});
