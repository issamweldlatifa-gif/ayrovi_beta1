import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { QatafoDatabase } from '../src/db/database';
import { app, db } from '../src/server';

const demo = {
  id: 'product_demo_01', name: 'Ensemble tendance AYROVI',
  description: 'Produit de démonstration relié à l’arrivage actif.', source: 'https://www.shein.com/',
};

describe('source-backed public catalogue', () => {
  it('does not seed a pretend purchase with a merchant home page and an editorial hero image', () => {
    const fresh = new QatafoDatabase(':memory:');
    try { expect(fresh.all('SELECT id FROM products')).toEqual([]); } finally { fresh.close(); }
  });

  it('cleans an unchanged legacy demo exactly once without deleting an edited real listing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-source-truth-'));
    const file = path.join(dir, 'legacy.sqlite');
    try {
      const old = new QatafoDatabase(file);
      // Model a database created before the one-shot cleanup was introduced.
      old.run("DELETE FROM applied_data_migrations WHERE key='remove_unsourced_demo_product_v1'");
      const now = new Date().toISOString();
      old.run(`INSERT INTO products (id,name,description,source_url,source_platform,original_price,currency,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, demo.id, demo.name, demo.description, demo.source, 'SHEIN', 21.99, 'EUR', 'ACTIVE', now, now);
      old.close();
      const upgraded = new QatafoDatabase(file);
      expect(upgraded.get('SELECT id FROM products WHERE id=?', demo.id)).toBeUndefined();
      upgraded.run(`INSERT INTO products (id,name,description,source_url,source_platform,original_price,currency,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, demo.id, demo.name, 'Merchant-confirmed listing',
        'https://www.shein.com/products/real-listed-item', 'SHEIN', 21.99, 'EUR', 'ACTIVE', now, now);
      upgraded.close();
      const restarted = new QatafoDatabase(file);
      expect(restarted.get<{ id: string }>('SELECT id FROM products WHERE id=?', demo.id)?.id).toBe(demo.id);
      restarted.close();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('returns legacy API price fields from the same current canonical quote, not stale database totals', async () => {
    const id = `source-backed-${Date.now()}`;
    const now = new Date().toISOString();
    db.run(`INSERT INTO products (id,name,description,source_url,source_platform,original_price,currency,
      converted_price,shipping_fee,service_fee,final_price,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, 'Merchant table', 'Merchant source description',
      'https://merchant-shop.com/products/table', 'Merchant Shop', 80, 'EUR', 1, 1, 1, 1, 'ACTIVE', now, now);
    try {
      const response = await request(app).get('/api/public/products');
      expect(response.status).toBe(200);
      const product = response.body.data.find((row: any) => row.id === id);
      expect(product).toBeTruthy();
      expect(product.canonical.identity.sourceUrl).toBe('https://merchant-shop.com/products/table');
      expect(product.originalPrice).toBe(80);
      expect(product.finalPrice).toBe(product.canonical.pricing.ayroviPriceTnd);
      expect(product.convertedPrice).toBe(product.canonical.pricing.unitBreakdown.convertedPriceTND);
      expect(product.serviceFee).toBe(product.canonical.pricing.unitBreakdown.serviceFeeTND);
      expect(product.finalPrice).toBeGreaterThan(1);
    } finally { db.run('DELETE FROM products WHERE id=?', id); }
  });
});
