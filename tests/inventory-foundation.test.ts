/**
 * AYROVI Stock (P2.2) — tests d'acceptation.
 *
 * Ils couvrent, dans l'ordre du plan, ce que la phase a promis :
 *  • la quantité n'existe que dans le module — `products` ne gagne aucune colonne de stock ;
 *  • le schéma est additif et idempotent (base fraîche, base existante, re-boot) ;
 *  • une quantité ne devient jamais négative, et un refus ne laisse rien à moitié écrit ;
 *  • le journal est append-only : aucun verbe d'édition ni de suppression ne l'atteint ;
 *  • un ajustement sans motif écrit est refusé, un double-clic réseau ne double pas le stock ;
 *  • un inventaire ne touche le stock qu'à la validation, et la validation ne se rejoue pas ;
 *  • les droits sont des données (`inventory:read|create|update|adjust|approve`), refus tracé ;
 *  • le framework connaît l'écran : les 3 descripteurs, le registre à `active`, et l'écran de
 *  stock servi par `ResourceWorkspace`.
 *
 * Ce test épingle aussi ce qui ne devait PAS arriver : `crm_warehouse_dispatches` n'est ni lu
 * ni écrit par le module, et `arrival-ingestion` reste intact.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { QatafoDatabase } from '../src/db/database';
import { app, db } from '../src/server';
import { bootstrapInventory, ensureInventorySchema, INVENTORY_SCHEMA_SQL } from '../src/inventory/bootstrap';
import { canInventory } from '../src/inventory/permissions';
import { ERP_MODULES } from '../src/erp-core/modules';
import { statusVocabulary } from '../src/domain/statuses';
import { INVENTORY_ERRORS } from '../src/inventory/types';

const suffix = Date.now();
const short = String(suffix).slice(-6);
let admin: { agent: any; csrf: string };
let reader: { agent: any; csrf: string };

async function makeSession(role: 'CONTENT_MANAGER') {
  const email = `inv-${role.toLowerCase()}-${suffix}@test.ayrovi.tn`;
  const password = 'StockSecure2026!';
  const created = await admin.agent.post('/api/admin/users').set('x-csrf-token', admin.csrf)
    .send({ name: `Stock ${role}`, email, password, role });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const agent = request.agent(app);
  const login = await agent.post('/api/admin/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  return { agent, csrf: login.body.data.csrfToken };
}

function columnsOf(handle: QatafoDatabase, table: string): string[] {
  return handle.all<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name);
}

function auditCount(handle: QatafoDatabase, where: string, ...params: Array<string | number>): number {
  return Number(handle.get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_logs WHERE ${where}`, ...params)?.n ?? 0);
}

describe('AYROVI Stock (P2.2)', () => {
  const location = `TUN-${short}`;
  let productId = '';
  let productCode = '';
  let itemId = '';
  let movementId = '';

  beforeAll(async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    admin = { agent, csrf: login.body.data.csrfToken };
    reader = await makeSession('CONTENT_MANAGER');
    // Amorçage à la demande idempotent : dans un process vivant, il ne change rien.
    const first = bootstrapInventory(db);
    expect(first.tablesReady).toBe(4);
    expect(first.sequencesReady).toBe(1);
    // Un produit du catalogue existant sert de cible au stock : le module n'en crée pas.
    const product = await admin.agent.post('/api/admin/catalogue/products').set('x-csrf-token', admin.csrf)
      .send({ name: `Casque test ${short}`, description: 'Support de test P2.2', status: 'DRAFT', source_platform: 'OTHER', currency: 'TND', original_price: 49.9 });
    expect(product.status, JSON.stringify(product.body)).toBe(201);
    productId = String(product.body.data.id);
    productCode = String(product.body.data.product_code ?? 'PRD-SANS-CODE');
  });

  describe('schéma additif et idempotent', () => {
    test('quatre tables de stock, créées sans retoucher une table existante', () => {
      for (const table of ['inventory_stock_items', 'inventory_stock_movements', 'inventory_stocktakes', 'inventory_stocktake_lines']) {
        expect(db.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table).length, table).toBe(1);
      }
      expect(INVENTORY_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS');
      expect(INVENTORY_SCHEMA_SQL).not.toMatch(/DROP TABLE|ALTER TABLE .* DROP|TRUNCATE/);
    });

    test('la quantité ne s’installe pas dans la fiche produit', () => {
      // C'est l'engagement central de P2.2 : `products` reste une fiche, pas un état.
      const productColumns = columnsOf(db, 'products');
      for (const forbidden of ['quantity', 'stock', 'stock_quantity', 'available_quantity', 'on_hand']) {
        expect(productColumns, `products.${forbidden} ne doit jamais exister`).not.toContain(forbidden);
      }
      expect(columnsOf(db, 'inventory_stock_items')).toContain('quantity');
    });

    test('re-créer le schéma et re-booter ne change ni forme ni lignes', () => {
      const before = {
        items: Number(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM inventory_stock_items')?.n ?? 0),
        columns: columnsOf(db, 'inventory_stock_items').join(','),
      };
      expect(() => { ensureInventorySchema(db); ensureInventorySchema(db); bootstrapInventory(db); }).not.toThrow();
      expect(columnsOf(db, 'inventory_stock_items').join(',')).toBe(before.columns);
      expect(Number(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM inventory_stock_items')?.n ?? 0)).toBe(before.items);
    });

    test('la base refuse une quantité négative même par un autre écriveur', () => {
      expect(() => {
        const now = new Date().toISOString();
        db.run(`INSERT INTO inventory_stock_items (id,product_id,location,quantity,created_at,updated_at)
          VALUES ('stki_negatif_test', ?, ?, -5, ?, ?)`, productId, location, now, now);
      }).toThrow();
    });
  });

  describe('lignes de stock et mouvements', () => {
    test('ouvrir une ligne écrit la quantité COMME un mouvement d’ouverture', async () => {
      const response = await admin.agent.post('/api/admin/inventory/stock').set('x-csrf-token', admin.csrf)
        .send({ product_id: productId, location, quantity: 7, reorder_point: 2 });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      itemId = String(response.body.data.id);
      expect(Number(response.body.data.quantity)).toBe(7);
      const movement = db.get<any>(
        `SELECT * FROM inventory_stock_movements WHERE item_id=? AND reason='OPENING_BALANCE'`, itemId);
      expect(movement).toBeTruthy();
      expect(Number(movement.balance_before)).toBe(0);
      expect(Number(movement.balance_after)).toBe(7);
    });

    test('la liste du stock parle le dialecte du framework (search, sort, pagination)', async () => {
      const response = await admin.agent.get(`/api/admin/inventory/stock?search=${encodeURIComponent(location)}&sort=quantity&direction=desc&page=1&pageSize=20`);
      expect(response.status).toBe(200);
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(1);
      expect(response.body.data[0].location).toBe(location);
      expect(response.body.data[0].product_name).toBeTruthy();
      expect(response.body.data[0].stock_state).toBe('OK');
      // un tri inconnu est ignoré, pas injecté : la réponse reste 200 sur l'ordre par défaut
      const bogus = await admin.agent.get('/api/admin/inventory/stock?sort=quantity%3B%20DROP%20TABLE%20products&direction=asc');
      expect(bogus.status).toBe(200);
      expect(db.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name='products'`).length).toBe(1);
    });

    test('deux lignes identiques au même emplacement sont refusées', async () => {
      const response = await admin.agent.post('/api/admin/inventory/stock').set('x-csrf-token', admin.csrf)
        .send({ product_id: productId, location, quantity: 1 });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe(INVENTORY_ERRORS.DUPLICATE);
    });

    test('la quantité ne s’édite pas à la main, le point de commande oui', async () => {
      const direct = await admin.agent.put(`/api/admin/inventory/stock/${itemId}`).set('x-csrf-token', admin.csrf)
        .send({ quantity: 999 });
      expect(direct.status).toBe(409);
      expect(String(direct.body.error)).toContain('mouvement');
      const reorder = await admin.agent.put(`/api/admin/inventory/stock/${itemId}`).set('x-csrf-token', admin.csrf)
        .send({ reorder_point: 8 });
      expect(reorder.status, JSON.stringify(reorder.body)).toBe(200);
      expect(Number(reorder.body.data.reorder_point)).toBe(8);
      expect(Number(reorder.body.data.quantity)).toBe(7);
      expect(reorder.body.data.stock_state).toBe('LOW');
    });

    test('une sortie qui passerait sous zéro est refusée sans toucher au solde', async () => {
      const before = Number(db.get<{ quantity: number }>('SELECT quantity FROM inventory_stock_items WHERE id=?', itemId)?.quantity);
      const response = await admin.agent.post('/api/admin/inventory/movements').set('x-csrf-token', admin.csrf)
        .send({ item_id: itemId, direction: 'OUT', quantity: before + 3, reason: 'SALE', note: '' });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(INVENTORY_ERRORS.NEGATIVE_STOCK);
      const after = Number(db.get<{ quantity: number }>('SELECT quantity FROM inventory_stock_items WHERE id=?', itemId)?.quantity);
      expect(after).toBe(before);
      // aucun mouvement orphelin n'a été écrit par la tentative refusée
      expect(Number(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM inventory_stock_movements WHERE item_id=?`, itemId)?.n)).toBe(1);
    });

    test('une sortie normale écrit le mouvement, le solde et l’audit', async () => {
      const response = await admin.agent.post('/api/admin/inventory/movements').set('x-csrf-token', admin.csrf)
        .send({ item_id: itemId, direction: 'OUT', quantity: 2, reason: 'SALE', note: 'Commande de test' });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      movementId = String(response.body.data.id);
      expect(Number(response.body.data.balance_before)).toBe(7);
      expect(Number(response.body.data.balance_after)).toBe(5);
      expect(Number(response.body.data.signed_quantity)).toBe(-2);
      expect(Number(db.get<{ quantity: number }>('SELECT quantity FROM inventory_stock_items WHERE id=?', itemId)?.quantity)).toBe(5);
      expect(auditCount(db, `module='INVENTORY' AND action='CREATE' AND resource_type='stock_movement' AND resource_id=?`, movementId)).toBe(1);
    });

    test('un ajustement exige une raison écrite', async () => {
      const silent = await admin.agent.post('/api/admin/inventory/movements').set('x-csrf-token', admin.csrf)
        .send({ item_id: itemId, direction: 'ADJUST', quantity: -1, reason: 'CORRECTION' });
      expect(silent.status).toBe(400);
      expect(String(silent.body.error)).toContain('note');
      const signed = await admin.agent.post('/api/admin/inventory/movements').set('x-csrf-token', admin.csrf)
        .send({ item_id: itemId, direction: 'ADJUST', quantity: -1, reason: 'CORRECTION', note: 'Écart constaté au comptage' });
      expect(signed.status, JSON.stringify(signed.body)).toBe(200);
      expect(Number(signed.body.data.balance_after)).toBe(4);
      expect(Math.abs(Number(signed.body.data.quantity))).toBe(1);
    });

    test('une quantité nulle ou énorme n’est pas un mouvement', async () => {
      const zero = await admin.agent.post('/api/admin/inventory/movements').set('x-csrf-token', admin.csrf)
        .send({ item_id: itemId, direction: 'IN', quantity: 0, reason: 'RECEPTION' });
      expect(zero.status).toBe(400);
      const huge = await admin.agent.post('/api/admin/inventory/movements').set('x-csrf-token', admin.csrf)
        .send({ item_id: itemId, direction: 'IN', quantity: 5_000_000, reason: 'RECEPTION' });
      expect(huge.status).toBe(400);
    });

    test('le même idempotency_key ne crée jamais deux mouvements', async () => {
      const key = `idem-${short}`;
      const body = { item_id: itemId, direction: 'IN' as const, quantity: 3, reason: 'RECEPTION', idempotency_key: key };
      const first = await admin.agent.post('/api/admin/inventory/movements').set('x-csrf-token', admin.csrf).send(body);
      expect(first.status).toBe(200);
      const quantityAfterFirst = Number(db.get<{ quantity: number }>('SELECT quantity FROM inventory_stock_items WHERE id=?', itemId)?.quantity);
      const second = await admin.agent.post('/api/admin/inventory/movements').set('x-csrf-token', admin.csrf).send(body);
      expect(second.status).toBe(200);
      expect(second.body.data.duplicated).toBe(true);
      expect(String(second.body.data.id)).toBe(String(first.body.data.id));
      expect(Number(db.get<{ quantity: number }>('SELECT quantity FROM inventory_stock_items WHERE id=?', itemId)?.quantity)).toBe(quantityAfterFirst);
    });

    test('le journal des mouvements est immuable par contrat d’API', async () => {
      for (const method of ['put', 'patch', 'delete'] as const) {
        const response = await (admin.agent as any)[method](`/api/admin/inventory/movements/${movementId}`).set('x-csrf-token', admin.csrf).send({});
        expect(response.status, method).toBe(409);
        expect(response.body.code, method).toBe(INVENTORY_ERRORS.IMMUTABLE);
      }
    });

    test('aucun mouvement ne référence une ligne inexistante', async () => {
      const response = await admin.agent.post('/api/admin/inventory/movements').set('x-csrf-token', admin.csrf)
        .send({ item_id: 'stki_inexistant', direction: 'IN', quantity: 1, reason: 'RECEPTION' });
      expect(response.status).toBe(404);
      expect(response.body.code).toBe(INVENTORY_ERRORS.ITEM_NOT_FOUND);
    });
  });

  describe('inventaires physiques', () => {
    let stocktakeId = '';
    let lineId = '';
    let settledQuantity = 0; // la quantité réellement appliquée par la validation, mesurée pas devinée

    test('ouvrir une session photographie les lignes actives du lieu', async () => {
      const response = await admin.agent.post('/api/admin/inventory/stocktakes').set('x-csrf-token', admin.csrf)
        .send({ location, note: `Comptage de test ${short}` });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      stocktakeId = String(response.body.data.id);
      expect(response.body.data.status).toBe('COUNTING');
      expect(String(response.body.data.code)).toMatch(/^STK-\d{4}-\d{5}$/);
      expect(Number(response.body.data.lines_count)).toBeGreaterThanOrEqual(1);
      lineId = String(response.body.data.lines[0].id);
      const liveQuantity = Number(db.get<{ quantity: number }>('SELECT quantity FROM inventory_stock_items WHERE id=?', itemId)?.quantity);
      expect(Number(response.body.data.lines[0].expected_quantity)).toBe(liveQuantity);
      expect(response.body.data.lines[0].counted_quantity).toBeNull();
    });

    test('compter calcule l’écart côté serveur, jamais depuis le client', async () => {
      const expected = Number(db.get<{ expected_quantity: number }>(
        'SELECT expected_quantity FROM inventory_stocktake_lines WHERE id=?', lineId)?.expected_quantity);
      const counted = expected + 2; // on compte deux de plus que le théorique
      const response = await admin.agent.put(`/api/admin/inventory/stocktakes/${stocktakeId}/lines/${lineId}`)
        .set('x-csrf-token', admin.csrf).send({ counted_quantity: counted });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(Number(response.body.data.variance)).toBe(2);
      // une variance envoyée par le client est ignorée : elle reste calculée ici
      const tampered = await admin.agent.put(`/api/admin/inventory/stocktakes/${stocktakeId}/lines/${lineId}`)
        .set('x-csrf-token', admin.csrf).send({ counted_quantity: counted, variance: 99 });
      expect(Number(tampered.body.data.variance)).toBe(2);
    });

    test('une quantité comptée négative est refusée', async () => {
      const response = await admin.agent.put(`/api/admin/inventory/stocktakes/${stocktakeId}/lines/${lineId}`)
        .set('x-csrf-token', admin.csrf).send({ counted_quantity: -1 });
      expect(response.status).toBe(400);
    });

    test('soumettre puis valider applique les écarts par des mouvements, pas par des éditions', async () => {
      const submit = await admin.agent.post(`/api/admin/inventory/stocktakes/${stocktakeId}/submit`)
        .set('x-csrf-token', admin.csrf).send({});
      expect(submit.status, JSON.stringify(submit.body)).toBe(200);
      expect(submit.body.data.status).toBe('SUBMITTED');
      const quantityBefore = Number(db.get<{ quantity: number }>('SELECT quantity FROM inventory_stock_items WHERE id=?', itemId)?.quantity);
      const expectedAfter = quantityBefore + 2;
      const approve = await admin.agent.post(`/api/admin/inventory/stocktakes/${stocktakeId}/approve`)
        .set('x-csrf-token', admin.csrf).send({});
      expect(approve.status, JSON.stringify(approve.body)).toBe(200);
      expect(approve.body.data.status).toBe('APPROVED');
      expect(Number(approve.body.data.applied?.length ?? 0)).toBe(1);
      const quantityAfter = Number(db.get<{ quantity: number }>('SELECT quantity FROM inventory_stock_items WHERE id=?', itemId)?.quantity);
      expect(quantityAfter).toBe(expectedAfter);
      settledQuantity = quantityAfter;
      const applied = db.get<any>(
        `SELECT * FROM inventory_stock_movements WHERE stocktake_id=? AND reason='STOCKTAKE_VARIANCE'`, stocktakeId);
      expect(applied).toBeTruthy();
      expect(Number(applied.signed_quantity)).toBe(2);
      expect(Number(applied.balance_after)).toBe(expectedAfter);
    });

    test('une validation ne se rejoue pas', async () => {
      const again = await admin.agent.post(`/api/admin/inventory/stocktakes/${stocktakeId}/approve`)
        .set('x-csrf-token', admin.csrf).send({});
      expect(again.status).toBe(409);
      expect(again.body.code).toBe(INVENTORY_ERRORS.ALREADY_APPROVED);
      // et le stock n'a pas bougé au second essai
      const quantity = Number(db.get<{ quantity: number }>('SELECT quantity FROM inventory_stock_items WHERE id=?', itemId)?.quantity);
      expect(quantity).toBe(settledQuantity);
    });

    test('une session déjà tranchée ne se recompte pas', async () => {
      const count = await admin.agent.put(`/api/admin/inventory/stocktakes/${stocktakeId}/lines/${lineId}`)
        .set('x-csrf-token', admin.csrf).send({ counted_quantity: 1 });
      expect(count.status).toBe(409);
      expect(count.body.code).toBe(INVENTORY_ERRORS.ALREADY_APPROVED);
    });

    test('un refus s’écrit et ne touche aucune quantité', async () => {
      const created = await admin.agent.post('/api/admin/inventory/stocktakes').set('x-csrf-token', admin.csrf)
        .send({ location });
      expect(created.status).toBe(200);
      const id = String(created.body.data.id);
      for (const line of created.body.data.lines) {
        const count = await admin.agent.put(`/api/admin/inventory/stocktakes/${id}/lines/${line.id}`)
          .set('x-csrf-token', admin.csrf).send({ counted_quantity: 0 });
        expect(count.status, JSON.stringify(count.body)).toBe(200);
      }
      expect((await admin.agent.post(`/api/admin/inventory/stocktakes/${id}/submit`).set('x-csrf-token', admin.csrf).send({})).status).toBe(200);
      const silent = await admin.agent.post(`/api/admin/inventory/stocktakes/${id}/reject`).set('x-csrf-token', admin.csrf).send({});
      expect(silent.status).toBe(400);
      const rejected = await admin.agent.post(`/api/admin/inventory/stocktakes/${id}/reject`).set('x-csrf-token', admin.csrf)
        .send({ reason: 'Comptage interrompu, magasin fermé' });
      expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
      expect(rejected.body.data.status).toBe('REJECTED');
      // aucune quantité n'a bougé : le refus n'applique pas les écarts
      expect(Number(db.get<{ quantity: number }>('SELECT quantity FROM inventory_stock_items WHERE id=?', itemId)?.quantity)).toBe(settledQuantity);
      expect(auditCount(db, `module='INVENTORY' AND resource_type='stocktake' AND resource_id=?`, id)).toBeGreaterThanOrEqual(2);
    });

    test('un inventaire d’un lieu vide n’est pas créé', async () => {
      const response = await admin.agent.post('/api/admin/inventory/stocktakes').set('x-csrf-token', admin.csrf)
        .send({ location: 'LIEU-SANS-STOCK' });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe(INVENTORY_ERRORS.EMPTY_LINES);
    });
  });

  describe('droits, traçabilité et framework', () => {
    test('les capacités viennent de la matrice, pas de l’écran', async () => {
      const meta = await admin.agent.get('/api/admin/inventory/meta');
      expect(meta.status).toBe(200);
      expect(meta.body.data.capabilities.stock_item.read).toBe(true);
      expect(meta.body.data.capabilities.stock_movement.write).toBe(true);
      expect(meta.body.data.capabilities.stocktake.approve).toBe(true);
      expect(meta.body.data.locations.some((entry: any) => entry.location === location)).toBe(true);
      const readerMeta = await reader.agent.get('/api/admin/inventory/meta');
      expect(readerMeta.status).toBe(403);
      expect(readerMeta.body.code).toBe('ERP_PERMISSION_DENIED');
    });

    test('lire et écrire le stock sont des droits distincts', () => {
      expect(canInventory(db, 'ADMIN', 'read', 'stock_item').allowed).toBe(true);
      expect(canInventory(db, 'ADMIN', 'approve', 'stocktake').allowed).toBe(true);
      expect(canInventory(db, 'CONTENT_MANAGER', 'read', 'stock_item').allowed).toBe(false);
      expect(canInventory(db, 'ORDER_MANAGER', 'write', 'stock_movement').allowed).toBe(false);
      expect(canInventory(db, 'SUPER_ADMIN', 'approve', 'stocktake').allowed).toBe(true);
    });

    test('un refus d’autorité est tracé dans le journal unique', async () => {
      const before = auditCount(db, `action='ACCESS_DENIED' AND module='PERMISSIONS'`);
      const response = await reader.agent.get('/api/admin/inventory/stock');
      expect(response.status).toBe(403);
      expect(auditCount(db, `action='ACCESS_DENIED' AND module='PERMISSIONS'`)).toBeGreaterThan(before);
    });

    test('révoquer un droit du stock est une donnée, pas du code', () => {
      db.run(`UPDATE erp_role_permissions SET granted=0, origin='MANUAL' WHERE role='ADMIN' AND module_key='inventory' AND action='write'`);
      expect(canInventory(db, 'ADMIN', 'write', 'stock_movement').allowed).toBe(false);
      db.run(`UPDATE erp_role_permissions SET granted=1, origin='SEED' WHERE role='ADMIN' AND module_key='inventory' AND action='write'`);
      expect(canInventory(db, 'ADMIN', 'write', 'stock_movement').allowed).toBe(true);
    });

    test('15 grants ADMIN + le miroir SUPER_ADMIN, rien d’autre', () => {
      const adminRows = db.all<{ action: string; resource_type: string }>(
        `SELECT action, resource_type FROM erp_role_permissions WHERE role='ADMIN' AND module_key='inventory'`);
      expect(adminRows.length).toBe(15);
      const superRows = Number(db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM erp_role_permissions WHERE role='SUPER_ADMIN' AND module_key='inventory'`,
      )?.n ?? 0);
      expect(superRows).toBe(9);
      // aucun autre rôle ne reçoit le stock à l'ouverture du module
      expect(Number(db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM erp_role_permissions WHERE module_key='inventory' AND role NOT IN ('ADMIN','SUPER_ADMIN')`,
      )?.n)).toBe(0);
    });

    test('le registre ERP déclare le module comme actif et routé', () => {
      const entry = ERP_MODULES.find((module) => module.key === 'inventory');
      expect(entry?.status).toBe('active');
      expect(entry?.apiPrefix).toBe('/inventory');
      expect(entry?.adminSection).toBe('inventory');
      expect(statusVocabulary('inventory.stocktake')).toContain('SUBMITTED');
      expect(statusVocabulary('inventory.movement')).toEqual(['IN', 'OUT', 'ADJUST']);
    });

    test('le framework rend l’écran de stock et ne signale aucun problème', async () => {
      const context = await admin.agent.get('/api/admin/back-office/self-test');
      expect(context.status).toBe(200);
      expect(context.body.data.problems, JSON.stringify(context.body.data.problems)).toEqual([]);
      expect(context.body.data.sections.length).toBeGreaterThanOrEqual(42);
      const resources = await admin.agent.get('/api/admin/back-office/resources');
      const inventory = (resources.body.data.resources ?? []).filter((descriptor: any) => descriptor.module === 'inventory');
      expect(inventory.map((descriptor: any) => descriptor.key).sort())
        .toEqual(['inventory.movement', 'inventory.stock', 'inventory.stocktake']);
      const stock = inventory.find((descriptor: any) => descriptor.key === 'inventory.stock');
      // l'écran est une fine commande du moteur, pas une sixième liste écrite à la main
      expect(stock.surface).toBe('custom');
      expect(stock.component).toBe('InventoryStockPage');
      expect(stock.api.prefix).toBe('/inventory/stock');
      expect(stock.columns.some((column: any) => column.key === 'quantity' && column.sortable)).toBe(true);
      expect(stock.fields.some((field: any) => field.key === 'quantity' && field.readonly)).toBe(true);
    });

    test('le module ne touche pas aux expéditions CRM ni à l’ingestion d’arrivage', async () => {
      const source = ['routes.ts', 'stock.ts', 'stocktakes.ts', 'bootstrap.ts', 'permissions.ts', 'validation.ts', 'audit.ts']
        .map((file) => fs.readFileSync(path.join(process.cwd(), 'src', 'inventory', file), 'utf8')).join('\n');
      expect(source).not.toMatch(/\b(FROM|JOIN|UPDATE|INSERT INTO|DELETE FROM)\s+(crm_|erp_arrival|arrival_)\w+/);
      const untouched = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM crm_warehouse_dispatches');
      expect(Number(untouched?.n ?? 0)).toBeGreaterThanOrEqual(0);
    });
  });
});
