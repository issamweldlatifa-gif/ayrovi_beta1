/*
 * MODES DE LIVRAISON (27/09/2026) — dernière condition avant de basculer la caisse.
 *
 * Trois modes, trois exigences. À domicile il faut une adresse ; au bureau ou
 * en point relais il faut le POINT, et exiger un numéro de rue n'aurait aucun
 * sens — c'est ce genre de champ inutile qui fait abandonner une commande.
 * Et surtout : le mode doit être ENREGISTRÉ. Sans lui, l'entrepôt ne sait pas
 * où envoyer le colis.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const db = readFileSync('src/db/database.ts', 'utf8');
const routes = readFileSync('src/api/routes.ts', 'utf8');

describe('schéma', () => {
  it('la commande porte le mode et le point, avec des valeurs contraintes', () => {
    expect(db).toContain("delivery_mode TEXT NOT NULL DEFAULT 'home' CHECK(delivery_mode IN ('home','desk','pickup'))");
    expect(db).toContain("pickup_point_id TEXT NOT NULL DEFAULT ''");
  });

  it('les bases déjà en service migrent sans perdre une ligne', () => {
    expect(db).toContain(`this.ensureColumn('orders', 'delivery_mode'`);
    expect(db).toContain(`this.ensureColumn('orders', 'pickup_point_id'`);
  });

  it('le mode est réellement écrit avec la commande', () => {
    // L'insertion de la commande (celle qui pose order_number), pas les copies d'archive.
    const insert = db.split('id,order_number,customer_id,account_id,source,arrival_id,status')[1]
      .split('for (const { item, price } of breakdowns)')[0];
    expect(insert).toContain('delivery_mode,pickup_point_id');
    expect(insert).toContain("input.deliveryMode || 'home'");
    expect(insert).toContain("input.pickupPointId || ''");
  });
});

describe('validation par mode', () => {
  const block = routes.split("router.post('/checkout'")[1].split('router.post(', 2)[0];

  it('un mode inconnu est refusé explicitement', () => {
    expect(block).toContain("code: 'DELIVERY_MODE_INVALID'");
    expect(block).toContain("['home', 'desk', 'pickup'].includes(");
  });

  it('bureau et point relais exigent le POINT, pas un numéro de rue', () => {
    expect(block).toContain("deliveryMode !== 'home' && !pickupPointId");
    expect(block).toContain("code: 'DELIVERY_POINT_REQUIRED'");
  });

  it('le point est borné : une entrée démesurée ne passe pas en base', () => {
    expect(block).toContain('.slice(0, 120)');
  });

  it('le mode est transmis à la création, pas seulement validé', () => {
    expect(routes).toContain('deliveryMode,\n        pickupPointId,');
  });
});
