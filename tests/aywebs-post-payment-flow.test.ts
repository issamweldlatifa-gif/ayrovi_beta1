/**
 * Flux réel : virement + justificatif + validation admin.
 * L'échéance d'achat (purchase_due_at) = justificatif + 24 h, et la commande
 * passe en PURCHASE_PENDING sans bloquer le client.
 */
import { describe, expect, it } from 'vitest';

import { QatafoDatabase } from '../src/db/database';
import { ensureAyWebsSchema } from '../src/aywebs/schema';
import { readAyWebsOrderById } from '../src/aywebs/orders';
import {
  approveAyWebsTransferPayment, confirmAyWebsPurchase, recordAyWebsTransferProof, startAyWebsPurchase,
} from '../src/aywebs/orders';

function seedOrder(db: QatafoDatabase, method: 'BANK_TRANSFER' | 'POSTE'): { orderId: string; paymentId: string } {
  const now = new Date().toISOString();
  const orderId = `ord-${method}`;
  const paymentId = `pay-${method}`;
  const cartId = `cart-${method}`;
  db.run(
    `INSERT INTO ayweb_carts (id, session_id, status, created_at, updated_at) VALUES (?, 'sess', 'CHECKOUT', ?, ?)`,
    cartId, now, now,
  );
  db.run(
    `INSERT INTO ayweb_orders (id, order_number, cart_id, status, master_stage, payment_status, product_subtotal_tnd, payable_tnd, created_at, updated_at)
     VALUES (?, ?, ?, 'PAYMENT_PENDING', 'PAYMENT_PENDING', 'PENDING', 220, 220, ?, ?)`,
    orderId, `AYW-${method}`, cartId, now, now,
  );
  db.run(
    `INSERT INTO ayweb_payments (id, order_id, method, status, amount_tnd, currency, created_at, updated_at)
     VALUES (?, ?, ?, 'PENDING', 220, 'TND', ?, ?)`,
    paymentId, orderId, method, now, now,
  );
  return { orderId, paymentId };
}

describe('AYWEBs post-payment flow — virement', () => {
  it('échéance = justificatif + 24 h, commande en achat sans blocage', () => {
    const db = new QatafoDatabase(':memory:');
    ensureAyWebsSchema(db);
    const { orderId } = seedOrder(db, 'BANK_TRANSFER');

    const before = Date.now();
    recordAyWebsTransferProof(db, {
      orderId, accountId: null, transferReference: 'VIR-1',
      proofPath: '/tmp/proof.pdf', originalName: 'proof.pdf',
    });
    const proof = db.get<any>('SELECT proof_submitted_at, purchase_due_at FROM ayweb_orders WHERE id=?', orderId);
    expect(Date.parse(proof.proof_submitted_at)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(proof.purchase_due_at) - Date.parse(proof.proof_submitted_at)).toBe(24 * 60 * 60 * 1000);

    // La file « Achats AYWEBs » lit l'échéance interne par l'API admin : elle doit suivre la base.
    const readBack = readAyWebsOrderById(db, orderId);
    expect(readBack?.purchaseDueAt).toBe(proof.purchase_due_at);

    // Validation tardive : l'échéance reste celle du justificatif, pas de la validation.
    const approved = approveAyWebsTransferPayment(db, { orderId, adminId: 'admin-1' });
    expect(approved.status).toBe('PURCHASE_PENDING');
    const after = db.get<any>('SELECT purchase_due_at, proof_submitted_at FROM ayweb_orders WHERE id=?', orderId);
    expect(after.purchase_due_at).toBe(proof.purchase_due_at);
    expect(after.proof_submitted_at).toBe(proof.proof_submitted_at);
  });

  it('POSTE suit la même règle', () => {
    const db = new QatafoDatabase(':memory:');
    ensureAyWebsSchema(db);
    const { orderId } = seedOrder(db, 'POSTE');
    recordAyWebsTransferProof(db, {
      orderId, accountId: null, transferReference: 'MP-1',
      proofPath: '/tmp/proof.pdf', originalName: 'proof.pdf',
    });
    const row = db.get<any>('SELECT proof_submitted_at, purchase_due_at FROM ayweb_orders WHERE id=?', orderId);
    expect(Date.parse(row.purchase_due_at) - Date.parse(row.proof_submitted_at)).toBe(24 * 60 * 60 * 1000);
  });

  it('achat confirmé : prix marchand monté ⇒ accepté, الفرق علينا', () => {
    const db = new QatafoDatabase(':memory:');
    ensureAyWebsSchema(db);
    const { orderId } = seedOrder(db, 'BANK_TRANSFER');
    recordAyWebsTransferProof(db, { orderId, accountId: null, transferReference: 'VIR-2', proofPath: '/tmp/p.pdf', originalName: 'p.pdf' });
    approveAyWebsTransferPayment(db, { orderId, adminId: 'admin-1' });
    startAyWebsPurchase(db, { orderId, actorType: 'admin', actorId: 'admin-1' });

    const done = confirmAyWebsPurchase(db, { orderId, actorId: 'admin-1', merchantPriceTnd: 245.5 });
    expect(done.status).toBe('PURCHASED');
    const audit = db.get<any>(`SELECT detail FROM ayweb_audit_logs WHERE action='purchase.price_settled' AND resource_id=?`, orderId);
    expect(JSON.parse(audit.detail)).toEqual({ action: 'ACCEPT', absorbedTnd: 25.5, keptTnd: 0 });
  });

  it('achat confirmé : prix marchand نزل ⇒ accepté, الفرق يبقى عندنا', () => {
    const db = new QatafoDatabase(':memory:');
    ensureAyWebsSchema(db);
    const { orderId } = seedOrder(db, 'POSTE');
    recordAyWebsTransferProof(db, { orderId, accountId: null, transferReference: 'MP-2', proofPath: '/tmp/p.pdf', originalName: 'p.pdf' });
    approveAyWebsTransferPayment(db, { orderId, adminId: 'admin-1' });
    startAyWebsPurchase(db, { orderId, actorType: 'admin', actorId: 'admin-1' });

    confirmAyWebsPurchase(db, { orderId, actorId: 'admin-1', merchantPriceTnd: 190 });
    const audit = db.get<any>(`SELECT detail FROM ayweb_audit_logs WHERE action='purchase.price_settled' AND resource_id=?`, orderId);
    expect(JSON.parse(audit.detail)).toEqual({ action: 'ACCEPT', absorbedTnd: 0, keptTnd: 30 });
  });

  it('achat confirmé sans prix marchand ⇒ aucun règlement enregistré', () => {
    const db = new QatafoDatabase(':memory:');
    ensureAyWebsSchema(db);
    const { orderId } = seedOrder(db, 'BANK_TRANSFER');
    recordAyWebsTransferProof(db, { orderId, accountId: null, transferReference: 'VIR-3', proofPath: '/tmp/p.pdf', originalName: 'p.pdf' });
    approveAyWebsTransferPayment(db, { orderId, adminId: 'admin-1' });
    startAyWebsPurchase(db, { orderId, actorType: 'admin', actorId: 'admin-1' });
    confirmAyWebsPurchase(db, { orderId, actorId: 'admin-1' });
    const audit = db.get<any>(`SELECT id FROM ayweb_audit_logs WHERE action='purchase.price_settled' AND resource_id=?`, orderId);
    expect(audit).toBeUndefined();
  });
});
