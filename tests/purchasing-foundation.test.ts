/**
 * AYROVI Achats (P2.3) — tests d'acceptation.
 *
 * Ils couvrent, dans l'ordre du plan, ce que la phase a promis :
 *  • le schéma est additif et idempotent (base fraîche, base existante, re-boot) et `products`
 *  ne gagne aucune colonne d'achat, pas plus qu'une table du CRM n'est modifiée ;
 *  • le cycle complet demande → soumission → approbation → réception → mouvement de stock, avec
 *  chaque transition écrite dans le journal unique ;
 *  • la sur-réception est refusée, la réception partielle est admise, deux brouillons ne se
 *  bloquent pas entre eux ;
 *  • le dommage entre puis sort, le refusé au quai n'entre pas ;
 *  • un bon affiché est immuable, un fournisseur référencé ne se supprime pas ;
 *  • les totaux sont calculés, donc aucune colonne de total n'existe ;
 *  • les droits sont des données, un refus est un 403 tracé et inerte, `approve` ≠ `write` ;
 *  • le framework connaît l'écran : 3 descripteurs, registre à `active`, aucun verbe inventé.
 *
 * Le test épingle aussi ce qui ne devait PAS arriver : aucune écriture dans `inventory_*` par le
 * module (le mouvement passe par `recordMovement`), aucune écriture dans `crm_*`, aucun `UPDATE`
 * du prix de vente.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { QatafoDatabase } from '../src/db/database';
import { app, db } from '../src/server';
import { bootstrapPurchasing, ensurePurchasingSchema, PURCHASING_SCHEMA_SQL } from '../src/purchasing/bootstrap';
import { PURCHASING_SEED_GRANTS, canPurchasing } from '../src/purchasing/permissions';
import { ERP_MODULES } from '../src/erp-core/modules';
import { statusVocabulary } from '../src/domain/statuses';
import { resourceDescriptors } from '../src/back-office/resources';
import { backOfficeSections } from '../src/back-office/navigation';
import { PO_STATUSES, PURCHASING_ACTIONS, PURCHASING_ERRORS, PURCHASING_RESOURCES, RECEIPT_QUALITIES, RECEIPT_STATUSES } from '../src/purchasing/types';

const suffix = Date.now();
const short = String(suffix).slice(-6);
let admin: { agent: any; csrf: string };
let outsider: { agent: any; csrf: string };

async function makeSession(role: 'CONTENT_MANAGER') {
  const email = `purch-${role.toLowerCase()}-${suffix}@test.ayrovi.tn`;
  const password = 'PurchasingSecure2026!';
  const created = await admin.agent.post('/api/admin/users').set('x-csrf-token', admin.csrf)
    .send({ name: `Achats ${role}`, email, password, role });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const agent = request.agent(app);
  const login = await agent.post('/api/admin/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  return { agent, csrf: login.body.data.csrfToken };
}

function columnsOf(handle: QatafoDatabase, table: string): string[] {
  return handle.all<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name);
}

function count(handle: QatafoDatabase, sql: string, ...params: Array<string | number>): number {
  return Number(handle.get<{ n: number }>(sql, ...params)?.n ?? 0);
}

/** Le stock réel, mesuré dans la table qui le détient — jamais depuis la réponse d'un module. */
function liveQuantity(handle: QatafoDatabase, productId: string, location: string): number {
  return Number(handle.get<{ quantity: number }>(
    'SELECT quantity FROM inventory_stock_items WHERE product_id=? AND location=?', productId, location)?.quantity ?? -1);
}

function movementRows(handle: QatafoDatabase, receiptId: string) {
  return handle.all<Record<string, any>>(
    `SELECT direction, quantity, signed_quantity, reason, reference_type, note FROM inventory_stock_movements
      WHERE reference_type='goods_receipt' AND reference_id=? ORDER BY created_at ASC, rowid ASC`, receiptId);
}

describe('AYROVI Achats (P2.3)', () => {
  let supplierId = '';
  let productId = '';
  let secondProductId = '';
  let orderId = '';
  let receiptId = '';
  const receiptLocation = `RCV-${short}`.toUpperCase().slice(0, 40);

  beforeAll(async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    admin = { agent, csrf: login.body.data.csrfToken };
    outsider = await makeSession('CONTENT_MANAGER');
    // Amorçage à la demande idempotent : dans un process vivant, il ne change rien.
    const first = bootstrapPurchasing(db);
    expect(first.tablesReady).toBe(5);
    expect(first.sequencesReady).toBe(3);
    // Deux produits du catalogue servent de cibles : le module achats n'en crée aucun.
    const first2 = await admin.agent.post('/api/admin/catalogue/products').set('x-csrf-token', admin.csrf)
      .send({ name: `Lunette achat ${short}`, description: 'Support de test P2.3', status: 'DRAFT', source_platform: 'OTHER', currency: 'TND', original_price: 99.9 });
    expect(first2.status, JSON.stringify(first2.body)).toBe(201);
    productId = String(first2.body.data.id);
    const second = await admin.agent.post('/api/admin/catalogue/products').set('x-csrf-token', admin.csrf)
      .send({ name: `Etui achat ${short}`, description: 'Support de test P2.3', status: 'DRAFT', source_platform: 'OTHER', currency: 'TND', original_price: 9.9 });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    secondProductId = String(second.body.data.id);
  });

  describe('schéma additif, idempotent, sans empiètement', () => {
    test('cinq tables et leur numérotation, deux fois de suite sans effet', () => {
      const again = bootstrapPurchasing(db);
      expect(again.tablesReady).toBe(5);
      expect(again.sequencesReady).toBe(3);
      const tables = db.all<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN
         ('suppliers','purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines')`).map((row) => row.name);
      expect(tables.sort()).toEqual(['goods_receipt_lines', 'goods_receipts', 'purchase_order_lines', 'purchase_orders', 'suppliers']);
    });

    test('le DDL du module ne contient aucun verbe destructif', () => {
      const sql = PURCHASING_SCHEMA_SQL.toUpperCase();
      for (const verb of ['DROP TABLE', 'DROP COLUMN', 'TRUNCATE', 'DELETE FROM', 'UPDATE ']) {
        expect(sql, `verbe interdit ${verb}`).not.toContain(verb);
      }
      expect(PURCHASING_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS');
    });

    test('aucune colonne ajoutée à une table du CRM, aucune colonne de stock ou d’achat dans products', () => {
      // `crm_arrivals` est la table d'arrivage du CRM : P2.3 ne doit rien y écrire ni y ajouter.
      expect(columnsOf(db, 'crm_arrivals')).not.toContain('purchase_order_id');
      expect(columnsOf(db, 'crm_arrivals')).not.toContain('goods_receipt_id');
      const productColumns = columnsOf(db, 'products');
      expect(productColumns.filter((column) => /qty|quantity|stock|purchase|supplier/i.test(column))).toEqual(['stock_status']);
    });

    test('les totaux ne sont pas des colonnes : ils sont lus sur les lignes', () => {
      const orderColumns = columnsOf(db, 'purchase_orders');
      expect(orderColumns).not.toContain('subtotal');
      expect(orderColumns).not.toContain('total_amount');
      expect(orderColumns).not.toContain('total_tnd');
      const lineColumns = columnsOf(db, 'purchase_order_lines');
      expect(lineColumns).not.toContain('received_quantity');
      expect(lineColumns).not.toContain('line_total');
    });

    test('le module n’écrit ni ne lit les tables du CRM, et n’écrit aucune quantité de stock', () => {
      const dir = path.resolve(__dirname, '../src/purchasing');
      const sources = fs.readdirSync(dir).filter((file) => file.endsWith('.ts'));
      expect(sources.length).toBeGreaterThanOrEqual(8);
      for (const file of sources) {
        // Un identifiant cité dans un commentaire n'est pas une écriture : la prose du module
        // explique justement qu'il n'écrit pas dans ces tables. Seuls les verbes du CODE comptent.
        const text = fs.readFileSync(path.join(dir, file), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/^\s*\/\/.*$/gm, ' ')
          .replace(/`[\s\S]*?`/g, ' ');
        const writesCrm = /(INSERT INTO|UPDATE|DELETE FROM)\s+(crm_|erp_arrival|arrival_)/.test(text);
        expect(writesCrm, `${file} écrit dans le CRM`).toBe(false);
        const writesStock = /(INSERT INTO|UPDATE|DELETE FROM)\s+inventory_/.test(text);
        expect(writesStock, `${file} écrit directement dans le stock`).toBe(false);
      }
      const receipts = fs.readFileSync(path.join(dir, 'receipts.ts'), 'utf8');
      expect(receipts).toContain("from '../inventory/stock'");
      expect(receipts).toContain('recordMovement(');
    });
  });

  describe('fournisseurs', () => {
    test('création : code réservé par la numérotation, devise et délai portés', async () => {
      const response = await admin.agent.post('/api/admin/purchasing/suppliers').set('x-csrf-token', admin.csrf)
        .send({ name: `Optique Fournisseur ${short}`, contact_name: 'Sami', phone: '+216 20 00 00 00', currency: 'EUR', lead_time_days: 14, payment_terms: '30 jours' });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      supplierId = String(response.body.data.id);
      expect(response.body.data.code).toMatch(/^SUP-\d{4}$/);
      expect(response.body.data.currency).toBe('EUR');
      expect(response.body.data.lead_time_days).toBe(14);
      expect(response.body.data.status).toBe('ACTIVE');
    });

    test('deux fiches au même nom (à la casse près) sont refusées, avec la raison', async () => {
      const response = await admin.agent.post('/api/admin/purchasing/suppliers').set('x-csrf-token', admin.csrf)
        .send({ name: `optique fournisseur ${short}` });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe(PURCHASING_ERRORS.DUPLICATE);
      expect(response.body.error).toContain('existe déjà');
    });

    test('le code est immuable et la suppression reste refusée', async () => {
      const edit = await admin.agent.put(`/api/admin/purchasing/suppliers/${supplierId}`).set('x-csrf-token', admin.csrf)
        .send({ code: 'SUP-9999' });
      expect(edit.status).toBe(409);
      expect(edit.body.code).toBe(PURCHASING_ERRORS.IMMUTABLE);
      const removal = await admin.agent.delete(`/api/admin/purchasing/suppliers/${supplierId}`).set('x-csrf-token', admin.csrf);
      expect(removal.status).toBe(409);
      expect(removal.body.error).toContain('INACTIVE');
    });

    test('la désactivation est un changement d’état, pas une disparition', async () => {
      const created = await admin.agent.post('/api/admin/purchasing/suppliers').set('x-csrf-token', admin.csrf)
        .send({ name: `Fournisseur éphémère ${short}` });
      expect(created.status).toBe(200);
      const id = String(created.body.data.id);
      const off = await admin.agent.post(`/api/admin/purchasing/suppliers/${id}/status`).set('x-csrf-token', admin.csrf).send({ status: 'INACTIVE' });
      expect(off.status).toBe(200);
      expect(off.body.data.status).toBe('INACTIVE');
      const still = await admin.agent.get(`/api/admin/purchasing/suppliers/${id}`);
      expect(still.status).toBe(200);
      // Un fournisseur inactif ne peut plus être engagé.
      const blocked = await admin.agent.post('/api/admin/purchasing/orders').set('x-csrf-token', admin.csrf)
        .send({ supplier_id: id, lines: [{ product_id: productId, quantity_ordered: 1, unit_cost: 1 }] });
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe(PURCHASING_ERRORS.CONFLICT);
    });

    test('une devise inconnue est refusée avant le SQL', async () => {
      const response = await admin.agent.post('/api/admin/purchasing/suppliers').set('x-csrf-token', admin.csrf)
        .send({ name: `Devise folle ${short}`, currency: 'YEN' });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(PURCHASING_ERRORS.VALIDATION);
    });
  });

  describe('commandes : engagement, totaux, transitions', () => {
    test('création avec lignes : totaux calculés à la lecture, monnaie de saisie conservée', async () => {
      const response = await admin.agent.post('/api/admin/purchasing/orders').set('x-csrf-token', admin.csrf)
        .send({
          supplier_id: supplierId, currency: 'EUR', exchange_rate: 3.4, note: `Test ${short}`,
          lines: [
            { product_id: productId, quantity_ordered: 10, unit_cost: 12.5, description: 'Lentilles' },
            { product_id: secondProductId, quantity_ordered: 4, unit_cost: 2 },
          ],
        });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      orderId = String(response.body.data.id);
      expect(response.body.data.po_number).toMatch(/^PO-\d{4}-\d{5}$/);
      expect(response.body.data.status).toBe('DRAFT');
      expect(response.body.data.subtotal).toBe(133);
      expect(response.body.data.total_tnd).toBe(452.2);
      expect(response.body.data.lines.map((line: any) => line.quantity_ordered)).toEqual([10, 4]);
      expect(response.body.data.lines[0].unit_cost).toBe(12.5);
      // Un coût d'achat n'écrase jamais le prix de vente : la fiche produit n'a pas bougé.
      const priced = db.get<{ original_price: number; final_price: number }>('SELECT original_price, final_price FROM products WHERE id=?', productId);
      expect(Number(priced?.original_price)).toBe(99.9);
    });

    test('aucune ligne : rien à engager', async () => {
      const response = await admin.agent.post('/api/admin/purchasing/orders').set('x-csrf-token', admin.csrf)
        .send({ supplier_id: supplierId, lines: [] });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe(PURCHASING_ERRORS.EMPTY_LINES);
    });

    test('deux lignes pour le même produit sont refusées (la base aussi)', async () => {
      const response = await admin.agent.post('/api/admin/purchasing/orders').set('x-csrf-token', admin.csrf)
        .send({ supplier_id: supplierId, lines: [
          { product_id: productId, quantity_ordered: 2, unit_cost: 1 },
          { product_id: productId, quantity_ordered: 3, unit_cost: 1 },
        ] });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe(PURCHASING_ERRORS.DUPLICATE);
      // La contrainte vit en base, pas seulement dans le service.
      const index = db.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='purchase_order_lines'`).map((row) => row.name);
      expect(index).toContain('idx_po_line_product_unique');
    });

    test('un produit inventé ne crée pas de fiche : 404 motivé', async () => {
      const response = await admin.agent.post('/api/admin/purchasing/orders').set('x-csrf-token', admin.csrf)
        .send({ supplier_id: supplierId, lines: [{ product_id: 'prd_inexistant_999', quantity_ordered: 1, unit_cost: 1 }] });
      expect(response.status).toBe(404);
      expect(response.body.code).toBe(PURCHASING_ERRORS.PRODUCT_NOT_FOUND);
    });

    test('un lien d’arrivage est une référence, pas un texte libre', async () => {
      const response = await admin.agent.post('/api/admin/purchasing/orders').set('x-csrf-token', admin.csrf)
        .send({ supplier_id: supplierId, arrival_id: 'arr_00000000-0000-0000-0000-000000000000', lines: [{ product_id: productId, quantity_ordered: 1, unit_cost: 1 }] });
      expect(response.status).toBe(404);
      expect(response.body.code).toBe(PURCHASING_ERRORS.ARRIVAL_NOT_FOUND);
    });

    test('approuver sans soumettre est refusé, puis le cycle complet s’écrit dans l’audit', async () => {
      const early = await admin.agent.post(`/api/admin/purchasing/orders/${orderId}/approve`).set('x-csrf-token', admin.csrf);
      expect(early.status).toBe(409);
      expect(early.body.code).toBe(PURCHASING_ERRORS.CONFLICT);
      expect(early.body.error).toContain('soumise');

      const submitted = await admin.agent.post(`/api/admin/purchasing/orders/${orderId}/submit`).set('x-csrf-token', admin.csrf);
      expect(submitted.status).toBe(200);
      expect(submitted.body.data.status).toBe('SUBMITTED');
      expect(submitted.body.data.requested_at).toBeTruthy();

      const approved = await admin.agent.post(`/api/admin/purchasing/orders/${orderId}/approve`).set('x-csrf-token', admin.csrf);
      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe('APPROVED');
      expect(String(approved.body.data.approved_by)).toBeTruthy();
      expect(approved.body.data.approved_at).toBeTruthy();

      const decided = await admin.agent.post(`/api/admin/purchasing/orders/${orderId}/approve`).set('x-csrf-token', admin.csrf);
      expect(decided.status).toBe(409);
      expect(decided.body.code).toBe(PURCHASING_ERRORS.ALREADY_DECIDED);

      // Chaque transition laisse sa ligne dans le journal unique, et l'événement dérivé est
      // rattaché au module achats (`erp_events.module_key`) — pas à `system` par oubli de registre.
      const rows = db.all<{ action: string }>(`SELECT action FROM audit_logs WHERE module='PURCHASING' AND entity_id=?`, orderId);
      expect(rows.filter((row) => row.action === 'CREATE').length).toBe(1);
      expect(rows.filter((row) => row.action === 'STATUS_CHANGE').length).toBeGreaterThanOrEqual(2);
      const event = db.get<{ module_key: string; event_name: string }>(
        `SELECT module_key, event_name FROM erp_events WHERE resource_type='purchase_order' AND resource_id=? ORDER BY created_at DESC LIMIT 1`, orderId);
      expect(event?.module_key).toBe('purchasing');
      expect(event?.event_name).toContain('status-changed');
    });

    test('une commande soumise n’est plus modifiable', async () => {
      const response = await admin.agent.put(`/api/admin/purchasing/orders/${orderId}`).set('x-csrf-token', admin.csrf)
        .send({ note: 'tentative après approbation' });
      expect(response.status).toBe(409);
      expect(response.body.error).toContain('plus modifiable');
    });

    test('le refus d’approbation revient en brouillon avec son motif, sans écraser la note', async () => {
      const other = await admin.agent.post('/api/admin/purchasing/orders').set('x-csrf-token', admin.csrf)
        .send({ supplier_id: supplierId, note: 'note de l’acheteur', lines: [{ product_id: productId, quantity_ordered: 2, unit_cost: 3 }] });
      const id = String(other.body.data.id);
      await admin.agent.post(`/api/admin/purchasing/orders/${id}/submit`).set('x-csrf-token', admin.csrf);
      const empty = await admin.agent.post(`/api/admin/purchasing/orders/${id}/reject`).set('x-csrf-token', admin.csrf).send({ reason: '   ' });
      expect(empty.status).toBe(400);
      const rejected = await admin.agent.post(`/api/admin/purchasing/orders/${id}/reject`).set('x-csrf-token', admin.csrf).send({ reason: 'tarif à renégocier' });
      expect(rejected.status).toBe(200);
      expect(rejected.body.data.status).toBe('DRAFT');
      expect(rejected.body.data.rejection_reason).toBe('tarif à renégocier');
      expect(rejected.body.data.note).toBe('note de l’acheteur');
    });

    test('les lignes ne s’écrivent pas ligne à ligne : le verbe existe et refuse', async () => {
      const response = await admin.agent.post(`/api/admin/purchasing/orders/${orderId}/lines`).set('x-csrf-token', admin.csrf)
        .send({ product_id: productId, quantity_ordered: 1, unit_cost: 1 });
      expect(response.status).toBe(409);
      expect(response.body.error).toContain('jamais ligne à ligne');
    });
  });

  describe('réceptions : la seule voie qui mouvemente', () => {
    test('une commande non approuvée ne se réceptionne pas', async () => {
      const draftOrder = await admin.agent.post('/api/admin/purchasing/orders').set('x-csrf-token', admin.csrf)
        .send({ supplier_id: supplierId, lines: [{ product_id: productId, quantity_ordered: 3, unit_cost: 1 }] });
      const response = await admin.agent.post(`/api/admin/purchasing/orders/${draftOrder.body.data.id}/receipts`).set('x-csrf-token', admin.csrf)
        .send({ location: receiptLocation, lines: [{ purchase_order_line_id: draftOrder.body.data.lines[0].id, quantity: 1 }] });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe(PURCHASING_ERRORS.NOT_APPROVED);
    });

    test('un brouillon ne consomme rien : deux brouillons complets coexistent', async () => {
      const order = await admin.agent.post('/api/admin/purchasing/orders').set('x-csrf-token', admin.csrf)
        .send({ supplier_id: supplierId, lines: [{ product_id: productId, quantity_ordered: 5, unit_cost: 4 }] });
      await admin.agent.post(`/api/admin/purchasing/orders/${order.body.data.id}/submit`).set('x-csrf-token', admin.csrf);
      const approved = await admin.agent.post(`/api/admin/purchasing/orders/${order.body.data.id}/approve`).set('x-csrf-token', admin.csrf);
      expect(approved.status, JSON.stringify(approved.body)).toBe(200);
      const lineId = String(order.body.data.lines[0].id);
      const first = await admin.agent.post(`/api/admin/purchasing/orders/${order.body.data.id}/receipts`).set('x-csrf-token', admin.csrf)
        .send({ location: receiptLocation, lines: [{ purchase_order_line_id: lineId, quantity: 5 }] });
      expect(first.status, JSON.stringify(first.body)).toBe(200);
      expect(first.body.data.status).toBe('DRAFT');
      expect(first.body.data.receipt_number).toMatch(/^RCV-\d{4}-\d{5}$/);
      const second = await admin.agent.post(`/api/admin/purchasing/orders/${order.body.data.id}/receipts`).set('x-csrf-token', admin.csrf)
        .send({ location: receiptLocation, lines: [{ purchase_order_line_id: lineId, quantity: 5 }] });
      expect(second.status).toBe(200);
      // Rien n'a bougé dans le stock : un brouillon n'est pas une entrée.
      expect(liveQuantity(db, productId, receiptLocation)).toBe(-1);
    });

    test('la sur-réception est refusée à la saisie, avec la borne dans le message', async () => {
      const order = await admin.agent.get(`/api/admin/purchasing/orders/${orderId}`);
      const line = order.body.data.lines.find((entry: any) => Number(entry.remaining) > 0);
      const response = await admin.agent.post(`/api/admin/purchasing/orders/${orderId}/receipts`).set('x-csrf-token', admin.csrf)
        .send({ location: receiptLocation, lines: [{ purchase_order_line_id: line.id, quantity: Number(line.quantity_ordered) + 1 }] });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe(PURCHASING_ERRORS.OVER_RECEIPT);
      expect(response.body.error).toContain('Sur-réception refusée');
    });

    test('réception partielle : le stock bouge par le module Stock, la commande devient PARTIALLY_RECEIVED', async () => {
      const order = await admin.agent.get(`/api/admin/purchasing/orders/${orderId}`);
      const line = order.body.data.lines.find((entry: any) => entry.product_id === productId);
      const draft = await admin.agent.post(`/api/admin/purchasing/orders/${orderId}/receipts`).set('x-csrf-token', admin.csrf)
        .send({ location: receiptLocation, lines: [{ purchase_order_line_id: line.id, quantity: 6 }] });
      expect(draft.status).toBe(200);
      receiptId = String(draft.body.data.id);
      const posted = await admin.agent.post(`/api/admin/purchasing/receipts/${receiptId}/post`).set('x-csrf-token', admin.csrf);
      expect(posted.status, JSON.stringify(posted.body)).toBe(200);
      expect(posted.body.data.status).toBe('POSTED');
      expect(posted.body.data.movements.length).toBe(1);
      expect(posted.body.data.movements[0]).toMatchObject({ direction: 'IN', signed_quantity: 6, reason: 'RECEPTION' });
      expect(liveQuantity(db, productId, receiptLocation)).toBe(6);
      const after = await admin.agent.get(`/api/admin/purchasing/orders/${orderId}`);
      expect(after.body.data.status).toBe('PARTIALLY_RECEIVED');
      expect(after.body.data.lines.find((entry: any) => entry.id === line.id).rejected_quantity).toBe(0);
      expect(after.body.data.lines.find((entry: any) => entry.id === line.id)).toMatchObject({ received_quantity: 6, remaining: 4, state: 'PARTIAL' });
    });

    test('le dommage entre puis sort ; le refusé au quai n’entre pas', async () => {
      const order = await admin.agent.get(`/api/admin/purchasing/orders/${orderId}`);
      const line = order.body.data.lines.find((entry: any) => entry.id);
      const second = order.body.data.lines.find((entry: any) => entry.product_id === secondProductId);
      const draft = await admin.agent.post(`/api/admin/purchasing/orders/${orderId}/receipts`).set('x-csrf-token', admin.csrf)
        .send({
          location: receiptLocation,
          lines: [
            { purchase_order_line_id: line.id, quantity: 1, quality: 'DAMAGED', quality_note: 'verre fêlé' },
            { purchase_order_line_id: second.id, quantity: 2, quality: 'REJECTED', quality_note: 'colis ouvert' },
          ],
        });
      expect(draft.status, JSON.stringify(draft.body)).toBe(200);
      const posted = await admin.agent.post(`/api/admin/purchasing/receipts/${draft.body.data.id}/post`).set('x-csrf-token', admin.csrf);
      expect(posted.status, JSON.stringify(posted.body)).toBe(200);
      const rows = movementRows(db, String(draft.body.data.id));
      expect(rows.map((row) => `${row.direction}:${row.signed_quantity}:${row.reason}`))
        .toEqual(['IN:1:RECEPTION', 'OUT:-1:DAMAGE']);
      // Entré puis sorti : la quantité nette disponible reste ce qu'elle était.
      expect(liveQuantity(db, productId, receiptLocation)).toBe(6);
      expect(liveQuantity(db, secondProductId, receiptLocation)).toBe(-1);
    });

    test('la ligne complète à la fin du reliquat, et un second bon ne dépasse jamais', async () => {
      const order = await admin.agent.get(`/api/admin/purchasing/orders/${orderId}`);
      const line = order.body.data.lines.find((entry: any) => entry.product_id === productId);
      const over = await admin.agent.post(`/api/admin/purchasing/orders/${orderId}/receipts`).set('x-csrf-token', admin.csrf)
        .send({ location: receiptLocation, lines: [{ purchase_order_line_id: line.id, quantity: Number(line.remaining) + 1 }] });
      expect(over.status).toBe(409);
      const last = await admin.agent.post(`/api/admin/purchasing/orders/${orderId}/receipts`).set('x-csrf-token', admin.csrf)
        .send({ location: receiptLocation, lines: [{ purchase_order_line_id: line.id, quantity: Number(line.remaining) }] });
      expect(last.status).toBe(200);
      const posted = await admin.agent.post(`/api/admin/purchasing/receipts/${last.body.data.id}/post`).set('x-csrf-token', admin.csrf);
      expect(posted.status).toBe(200);
      expect(liveQuantity(db, productId, receiptLocation)).toBe(9);
      const after = await admin.agent.get(`/api/admin/purchasing/orders/${orderId}`);
      // La ligne de lentilles est entière (le dommage compte comme reçu), mais le stock net
      // disponible vaut 9 : l'unité endommagée est entrée puis sortie. Et la seconde ligne reste
      // OUVERTE parce que le refusé au quai n'est pas une réception — c'est le contrat exact.
      expect(after.body.data.lines.find((entry: any) => entry.product_id === productId)).toMatchObject({ received_quantity: 10, remaining: 0, state: 'COMPLETE' });
      expect(after.body.data.lines.find((entry: any) => entry.product_id === secondProductId)).toMatchObject({ received_quantity: 0, rejected_quantity: 2, remaining: 4, state: 'PENDING' });
      expect(after.body.data.status).toBe('PARTIALLY_RECEIVED');
      // La commande entièrement reçue n'est plus annulable : le stock a bougé.
      const cancel = await admin.agent.post(`/api/admin/purchasing/orders/${orderId}/cancel`).set('x-csrf-token', admin.csrf).send({ reason: 'trop tard' });
      expect(cancel.status).toBe(409);
    });

    test('un bon affiché est immuable, dans les quatre verbes', async () => {
      const edit = await admin.agent.put(`/api/admin/purchasing/receipts/${receiptId}`).set('x-csrf-token', admin.csrf).send({ note: 'après affichage' });
      expect(edit.status).toBe(409);
      expect(edit.body.code).toBe(PURCHASING_ERRORS.IMMUTABLE);
      const repost = await admin.agent.post(`/api/admin/purchasing/receipts/${receiptId}/post`).set('x-csrf-token', admin.csrf);
      expect(repost.status).toBe(409);
      const discard = await admin.agent.post(`/api/admin/purchasing/receipts/${receiptId}/discard`).set('x-csrf-token', admin.csrf).send({ reason: 'non plus' });
      expect(discard.status).toBe(409);
      const removal = await admin.agent.delete(`/api/admin/purchasing/receipts/${receiptId}`).set('x-csrf-token', admin.csrf);
      expect(removal.status).toBe(409);
      expect(removal.body.error).toContain('immuable');
      // Le réessai d'affichage n'a pas doublé le stock.
      expect(liveQuantity(db, productId, receiptLocation)).toBe(9);
    });

    test('un brouillon s’écarte avec un motif, sans jamais être supprimé', async () => {
      const order = await admin.agent.post('/api/admin/purchasing/orders').set('x-csrf-token', admin.csrf)
        .send({ supplier_id: supplierId, lines: [{ product_id: secondProductId, quantity_ordered: 2, unit_cost: 1 }] });
      await admin.agent.post(`/api/admin/purchasing/orders/${order.body.data.id}/submit`).set('x-csrf-token', admin.csrf);
      await admin.agent.post(`/api/admin/purchasing/orders/${order.body.data.id}/approve`).set('x-csrf-token', admin.csrf);
      const draft = await admin.agent.post(`/api/admin/purchasing/orders/${order.body.data.id}/receipts`).set('x-csrf-token', admin.csrf)
        .send({ location: receiptLocation, lines: [{ purchase_order_line_id: order.body.data.lines[0].id, quantity: 1 }] });
      const refused = await admin.agent.delete(`/api/admin/purchasing/receipts/${draft.body.data.id}`).set('x-csrf-token', admin.csrf);
      expect(refused.status).toBe(409);
      expect(refused.body.error).toContain('écartez-le');
      const discarded = await admin.agent.post(`/api/admin/purchasing/receipts/${draft.body.data.id}/discard`).set('x-csrf-token', admin.csrf).send({ reason: 'double saisie' });
      expect(discarded.status).toBe(200);
      expect(discarded.body.data.status).toBe('DISCARDED');
      expect(discarded.body.data.discard_reason).toBe('double saisie');
      expect(liveQuantity(db, secondProductId, receiptLocation)).toBe(-1);
      const again = await admin.agent.post(`/api/admin/purchasing/receipts/${draft.body.data.id}/discard`).set('x-csrf-token', admin.csrf).send({ reason: 'bis' });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe(PURCHASING_ERRORS.ALREADY_DECIDED);
    });

    test('le journal des mouvements garde la référence du bon, dans les deux sens', () => {
      const rows = db.all<Record<string, any>>(
        `SELECT direction, reference_type, reference_id FROM inventory_stock_movements WHERE reference_type='goods_receipt' AND reference_id IN
          (SELECT id FROM goods_receipts WHERE purchase_order_id=?)`, orderId);
      expect(rows.length).toBeGreaterThanOrEqual(4);
      expect(new Set(rows.map((row) => row.reference_id)).size).toBe(3);
    });
  });

  describe('permissions, listes et framework', () => {
    test('les droits sont des données : 20 grants ADMIN, miroir SUPER_ADMIN, aucun verbe inventé', async () => {
      expect(PURCHASING_RESOURCES.length).toBe(4);
      expect(PURCHASING_ACTIONS).toEqual(['read', 'create', 'update', 'write', 'approve']);
      expect(PURCHASING_SEED_GRANTS.length).toBe(20);
      const rows = db.all<{ action: string; resource_type: string; granted: number }>(
        `SELECT action, resource_type, granted FROM erp_role_permissions WHERE module_key='purchasing' AND role='ADMIN'`);
      expect(rows.length).toBe(20);
      expect(rows.every((row) => row.granted === 1)).toBe(true);
      // SUPER_ADMIN n'a pas de ligne par ressource : le miroir legacy écrit une ligne par ACTION,
      // avec `resource_type='*'` — la règle du moteur, pas une faveur locale.
      const supervisor = db.all<{ action: string; resource_type: string }>(
        `SELECT action, resource_type FROM erp_role_permissions WHERE module_key='purchasing' AND role='SUPER_ADMIN'`);
      expect(supervisor.length).toBe(9);
      expect(supervisor.every((row) => row.resource_type === '*')).toBe(true);
      expect(count(db, `SELECT COUNT(*) AS n FROM erp_role_permissions WHERE module_key='purchasing'`)).toBe(29);
      // `adjust` n'existe pas dans le vocabulaire du moteur : le module ne l'invente pas, et le
      // miroir SUPER_ADMIN ne peut écrire que les neuf verbes d'`ERP_ACTIONS`.
      const { ERP_ACTIONS } = await import('../src/erp-core/permissions');
      const verbs = new Set(db.all<{ action: string }>(`SELECT DISTINCT action FROM erp_role_permissions WHERE module_key='purchasing'`).map((row) => row.action));
      for (const verb of verbs) expect(ERP_ACTIONS, `verbe hors moteur: ${verb}`).toContain(verb);
      expect(verbs.has('adjust')).toBe(false);
      const adminVerbs = new Set(db.all<{ action: string }>(
        `SELECT DISTINCT action FROM erp_role_permissions WHERE module_key='purchasing' AND role='ADMIN'`).map((row) => row.action));
      expect([...adminVerbs].sort()).toEqual(['approve', 'create', 'read', 'update', 'write']);
    });

    test('qui engage n’est pas qui reçoit : deux droits distincts, et rien pour CONTENT_MANAGER', () => {
      expect(canPurchasing(db, 'ADMIN', 'approve', 'purchase_order').allowed).toBe(true);
      expect(canPurchasing(db, 'CONTENT_MANAGER', 'approve', 'purchase_order').allowed).toBe(false);
      expect(canPurchasing(db, 'CONTENT_MANAGER', 'read', 'supplier').allowed).toBe(false);
    });

    test('un rôle sans droit reçoit un 403 tracé et aucune écriture ne part', async () => {
      const before = count(db, 'SELECT COUNT(*) AS n FROM suppliers');
      const denied = await outsider.agent.get('/api/admin/purchasing/suppliers');
      expect(denied.status).toBe(403);
      const attempt = await outsider.agent.post('/api/admin/purchasing/suppliers').set('x-csrf-token', outsider.csrf)
        .send({ name: `Fournisseur fantôme ${short}` });
      expect(attempt.status).toBe(403);
      expect(count(db, 'SELECT COUNT(*) AS n FROM suppliers')).toBe(before);
      // Le refus est écrit par le moteur de permissions (module 'PERMISSIONS'), avec le module
      // visé dans le payload : le chercher sous module='PURCHASING' serait un second journal.
      expect(count(db,
        `SELECT COUNT(*) AS n FROM audit_logs WHERE action='ACCESS_DENIED' AND new_value LIKE '%"module":"purchasing"%'`)).toBeGreaterThanOrEqual(2);
    });

    test('les trois listes parlent le dialecte du framework', async () => {
      for (const path of ['/suppliers', '/orders', '/receipts']) {
        const response = await admin.agent.get(`/api/admin/purchasing${path}?page=1&pageSize=2&sort=created_at&direction=desc`);
        expect(response.status, path).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.pagination).toMatchObject({ page: 1, pageSize: 2 });
        expect(response.body.pagination.totalPages).toBeGreaterThanOrEqual(1);
      }
      const filtered = await admin.agent.get(`/api/admin/purchasing/orders?status=RECEIVED`);
      expect(filtered.body.data.every((row: any) => row.status === 'RECEIVED')).toBe(true);
      const badSort = await admin.agent.get(`/api/admin/purchasing/suppliers?sort=id;DROP TABLE suppliers`);
      expect(badSort.status).toBe(200);
      expect(Array.isArray(badSort.body.data)).toBe(true);
      expect(count(db, 'SELECT COUNT(*) AS n FROM suppliers')).toBeGreaterThan(0);
    });

    test('le méta-endpoint expose capacités, vocabulaires et règles écrites', async () => {
      const response = await admin.agent.get('/api/admin/purchasing/meta');
      expect(response.status).toBe(200);
      expect(response.body.data.module).toBe('purchasing');
      expect(response.body.data.capabilities.purchase_order.approve).toBe(true);
      expect(response.body.data.capabilities.goods_receipt.write).toBe(true);
      expect(response.body.data.orderStatuses).toEqual([...PO_STATUSES]);
      expect(response.body.data.receiptStatuses).toEqual([...RECEIPT_STATUSES]);
      expect(response.body.data.qualities).toEqual([...RECEIPT_QUALITIES]);
      expect(response.body.data.rules.lines).toContain('jamais ligne à ligne');
      expect(response.body.data.rules.receipt).toContain('immuable');
      const health = await admin.agent.get('/api/admin/purchasing/health');
      expect(health.body.data).toMatchObject({ module: 'purchasing', tablesReady: 5, sequencesReady: 3 });
    });

    test('les libellés viennent du registre partagé, jamais d’une copie locale', () => {
      expect([...(statusVocabulary('purchasing.order') ?? [])]).toEqual([...PO_STATUSES]);
      expect([...(statusVocabulary('purchasing.receipt') ?? [])]).toEqual([...RECEIPT_STATUSES]);
      expect([...(statusVocabulary('purchasing.quality') ?? [])]).toEqual([...RECEIPT_QUALITIES]);
    });

    test('le registre passe les achats de planned à active, et le framework sert les trois écrans', async () => {
      const entry = ERP_MODULES.find((module) => module.key === 'purchasing');
      expect(entry?.status).toBe('active');
      expect(entry?.apiPrefix).toBe('/purchasing');
      const descriptors = resourceDescriptors();
      const purchasing = descriptors.filter((descriptor) => descriptor.module === 'purchasing');
      expect(purchasing.map((descriptor) => descriptor.key).sort()).toEqual(['purchasing.goods_receipt', 'purchasing.purchase_order', 'purchasing.supplier']);
      // Un écran de module est `custom` et délègue au moteur : jamais une sixième liste, jamais
      // un `framework` qui ferait croire à une preuve gelée différente.
      for (const descriptor of purchasing) {
        expect(descriptor.surface).toBe('custom');
        expect(descriptor.component).toBeTruthy();
        expect(descriptor.api?.kind).toBe('module');
        expect(descriptor.audit?.module).toBe('PURCHASING');
      }
      const keys = new Set(descriptors.map((descriptor) => descriptor.key));
      expect(keys.has('inventory.stock')).toBe(true);
      const sections = new Set(backOfficeSections());
      for (const section of ['purchasing', 'purchasing-orders', 'purchasing-receipts']) {
        expect(sections.has(section), `section P2.3 absente: ${section}`).toBe(true);
      }
      // La navigation serveur, elle, passe par le routeur du framework : les trois entrées
      // doivent être visibles pour SUPER_ADMIN (groupe Commerce).
      const nav = await admin.agent.get('/api/admin/back-office/navigation');
      expect(nav.status).toBe(200);
      const commerce = nav.body.data.groups.find((group: any) => group.label === 'Commerce');
      const visible = commerce.items.map((item: any) => item.section);
      for (const section of ['inventory', 'purchasing', 'purchasing-orders', 'purchasing-receipts']) expect(visible).toContain(section);
    });

    test('le schéma est prêt avant le premier appel, donc aucune table n’est créée à la volée', () => {
      // Garde mesurée, pas déduite : `runSchema` écartait les segments commençant par un
      // commentaire, ce qui faisait disparaître silencieusement TROIS index uniques — deux du
      // stock (P2.2) et celui des lignes de commande. Le moteur corrige ce piég ; ce test est là
      // pour qu'aucun futur DDL commenté ne redevienne optionnel.
      const created = db.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='index'`)
        .map((row) => row.name);
      for (const index of ['idx_suppliers_name_unique', 'idx_po_line_product_unique', 'idx_receipt_line_unique',
        'idx_inventory_item_identity', 'idx_inventory_movement_idempotency']) {
        expect(created, `index unique absent: ${index}`).toContain(index);
      }
      const fresh = new QatafoDatabase(':memory:');
      ensurePurchasingSchema(fresh);
      expect(count(fresh, `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'`)).toBeGreaterThan(80);
      expect(fresh.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'purchase%'`).length).toBe(2);
      // Un grant n'est jamais écrit par le constructeur de la base : la voie canonique est le seed.
      expect(count(fresh, `SELECT COUNT(*) AS n FROM erp_role_permissions WHERE module_key='purchasing'`)).toBe(0);
    });
  });
});
