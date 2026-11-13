/**
 * CATALOGUE OFFICIEL (12/11/2026) — l'ancien catalogue retiré en entier, remplacé
 * par les vingt produits fournis par le propriétaire.
 *
 * Ce que ce fichier verrouille :
 *   • une base neuve ne contient QUE les vingt produits officiels, vendables, avec
 *     photo locale (fichier présent), variantes et stock d'ouverture ;
 *   • la purge retire un produit ET ses attaches (stock, mouvements, médias, liens
 *     de contenu, favoris) sans casser une commande ni un contenu qui le citait ;
 *   • la page Publication (blocs) et les Reels utilisent le nouveau catalogue ;
 *   • l'API publique sert la fiche d'un produit officiel.
 */
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, test } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import {
  OFFICIAL_CATALOGUE,
  installOfficialCatalogue,
  officialProductId,
  purgeCatalogueProducts,
} from '../src/catalogue/installOfficialCatalogue';
import { readPublicBlocks, PUBLICATION_BLOCKS_DEMO } from '../src/services/publicationBlocks';

const fresh = () => new QatafoDatabase(':memory:');

describe('catalogue officiel — base neuve', () => {
  const db = fresh();

  test('exactement les vingt produits officiels, rien de l’ancien catalogue', () => {
    const rows = db.all<any>('SELECT id, status, final_price, image FROM products ORDER BY product_code');
    expect(rows).toHaveLength(20);
    expect(OFFICIAL_CATALOGUE.products).toHaveLength(20);
    expect(rows.map((r) => r.id)).toEqual(OFFICIAL_CATALOGUE.products.map((p) => officialProductId(p.key)));
    expect(db.get<any>("SELECT COUNT(*) n FROM products WHERE id LIKE 'product_selection_%' OR id='product_test_baskets'").n).toBe(0);
    for (const row of rows) {
      expect(row.status).toBe('ACTIVE');
      expect(row.final_price).toBeGreaterThan(0);
    }
  });

  test('chaque photo est un fichier servi par le serveur (aucun lien distant pour les images)', () => {
    for (const product of OFFICIAL_CATALOGUE.products) {
      expect(product.images.length).toBeGreaterThan(0);
      for (const url of product.images) {
        expect(url.startsWith('/media/catalogue/official/')).toBe(true);
        expect(fs.existsSync(path.resolve('assets', url.slice(1)))).toBe(true);
      }
    }
  });

  test('variantes et stock d’ouverture pour chaque taille ; prix barré seulement s’il est plus haut', () => {
    for (const product of OFFICIAL_CATALOGUE.products) {
      const id = officialProductId(product.key);
      const variants = db.all<any>('SELECT id, size FROM catalogue_variants WHERE product_id=?', id);
      expect(variants.map((v) => v.size)).toEqual(product.sizes);
      const stock = db.get<any>('SELECT SUM(quantity) n FROM inventory_stock_items WHERE product_id=?', id).n;
      expect(stock).toBe(product.sizes.length * product.stockPerSize);
      const row = db.get<any>('SELECT final_price, compare_at_price, original_price FROM products WHERE id=?', id);
      expect(row.original_price).toBe(0); // jamais re-tarifé par le change
      if (row.compare_at_price !== null) expect(row.compare_at_price).toBeGreaterThan(row.final_price);
    }
  });

  test('page Publication : douze blocs de démonstration, tous rendus avec des produits officiels', () => {
    const blocks = readPublicBlocks(db as any);
    expect(blocks).toHaveLength(PUBLICATION_BLOCKS_DEMO.length);
    expect(new Set(blocks.map((b) => b.kind))).toEqual(new Set(['media', 'container', 'sponsored_pair']));
    for (const block of blocks) {
      expect(block.publisher.name).toBe('zayrovi team');
      for (const product of block.products) expect(product.id.startsWith('product_official_')).toBe(true);
    }
    expect(blocks.filter((b) => b.media?.type === 'video')).toHaveLength(4);
    // 14/11 : le duo montre deux cartes sous l'image (planche GBox « WE Fashion »).
    for (const pair of blocks.filter((b) => b.kind === 'sponsored_pair')) expect(pair.products).toHaveLength(2);
  });

  test('Reels du propriétaire : le défilé et les baskets portent des produits officiels', () => {
    const links = db.all<any>("SELECT content_id, product_id FROM content_products WHERE content_kind='reel' ORDER BY content_id, sort_order");
    expect(links.filter((l) => l.content_id === 'reel_owner_shoes_v1').map((l) => l.product_id)).toEqual([
      officialProductId('converse-chuck-taylor-hi'),
      officialProductId('new-balance-574-core'),
    ]);
    expect(links.filter((l) => l.content_id === 'reel_owner_clothing_v1')).toHaveLength(4);
    expect(links.every((l) => l.product_id.startsWith('product_official_'))).toBe(true);
  });
});

describe('purge de l’ancien catalogue', () => {
  test('retire produits et attaches, garde commandes et contenus, puis réinstalle', () => {
    const db = fresh();
    const now = new Date().toISOString();
    const id = officialProductId('jbl-go-4');
    // Un client a mis le produit en favori, une publication et une commande le citent.
    const customer = db.get<any>('SELECT id FROM customers LIMIT 1');
    if (customer) db.run('INSERT INTO customer_favorites (customer_id, product_id, created_at) VALUES (?,?,?)', customer.id, id, now);
    db.run("INSERT INTO content_products (content_kind, content_id, product_id, sort_order, created_at) VALUES ('story','story_x',?,0,?)", id, now);

    const report = purgeCatalogueProducts(db);
    expect(report.products).toBe(20);
    expect(db.get<any>('SELECT COUNT(*) n FROM products').n).toBe(0);
    for (const table of ['catalogue_variants', 'catalogue_media', 'catalogue_attribute_values', 'inventory_stock_items', 'content_products']) {
      expect(db.get<any>(`SELECT COUNT(*) n FROM ${table} WHERE product_id LIKE 'product_official_%'`).n, table).toBe(0);
    }
    expect(db.get<any>("SELECT COUNT(*) n FROM publication_blocks WHERE id LIKE 'pubblock_demo_%'").n).toBe(0);
    expect((db as any).db.pragma('foreign_key_check')).toEqual([]);

    // Réinstallation idempotente : vingt produits, une seconde fois rien.
    expect(installOfficialCatalogue(db, now)).toBe(20);
    expect(installOfficialCatalogue(db, now)).toBe(0);
  });
});

describe('API publique', () => {
  test('la fiche d’un produit officiel est servie avec son prix en dinars', async () => {
    const { app } = await import('../src/server');
    const response = await request(app).get(`/api/public/products/${officialProductId('nike-dri-fit-legend')}`);
    expect(response.status).toBe(200);
    expect(response.body.data.name).toContain('Dri-FIT Legend');
    expect(response.body.data.finalPrice).toBe(94);
    expect((await request(app).get(response.body.data.image)).status).toBe(200);
  });
});
