// VEILLE PRIX (24/09/2026) : «راقب السعر» — ajout/liste/suppression par compte,
// relecture due avec notification à la BAISSE réelle uniquement, mise à la mort
// après 8 échecs consécutifs. SQLite réelle en mémoire de fichier temporaire.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { QatafoDatabase } from '../src/db/database';
import { SmartLinkScraper } from '../src/scraper/scraper';
import { addPriceWatcher, checkDueWatchers, listPriceWatchers, removePriceWatcher } from '../src/ayrovix/services/priceWatch';
import { app } from '../src/server';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-watch-'));
process.env.DATABASE_PATH = path.join(tmp, 'test.db');
process.env.ADMIN_PASSWORD = 'AyroviBeta2026!';
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

function createAccount(db: QatafoDatabase, id: string, email: string): void {
  db.run(`INSERT OR IGNORE INTO customer_accounts (id,display_name,email,email_verified_at,status,created_at,updated_at)
    VALUES (?, ?, ?, '2026-01-01', 'ACTIVE', '2026-01-01', '2026-01-01')`, id, 'Client ' + id, email);
}

describe('veille prix — CRUD par compte', () => {
  it('ajoute, liste, met à jour (upsert) et supprime une veille', () => {
    const db = new QatafoDatabase();
    createAccount(db, 'acc_1', 'a@test.tn');
    createAccount(db, 'acc_2', 'b@test.tn');
    const first = addPriceWatcher(db, 'acc_1', { url: 'https://shop.example.org/p/1', title: 'Jogging gris', source: 'Example' });
    expect(first?.id).toBeTruthy();
    // upsert même URL : une seule ligne, titre rafraîchi
    addPriceWatcher(db, 'acc_1', { url: 'https://shop.example.org/p/1', title: 'Jogging gris chiné' });
    expect(listPriceWatchers(db, 'acc_1')).toHaveLength(1);
    expect(listPriceWatchers(db, 'acc_1')[0].title).toBe('Jogging gris chiné');
    // URL non marchande refusée
    expect(addPriceWatcher(db, 'acc_1', { url: 'not-a-url', title: 'x' })).toBeNull();
    // suppression d'un autre compte impossible
    expect(removePriceWatcher(db, 'acc_2', first!.id)).toBe(false);
    expect(removePriceWatcher(db, 'acc_1', first!.id)).toBe(true);
    expect(listPriceWatchers(db, 'acc_1')).toHaveLength(0);
    db.close?.();
  });
});

describe('veille prix — relecture et notifications', () => {
  it('notifie à la baisse RÉELLE du prix marchand et tolère les échecs (mort après 8)', async () => {
    const db = new QatafoDatabase();
    createAccount(db, 'acc_x', 'x2@test.tn');
    addPriceWatcher(db, 'acc_x', { url: 'https://shop.example.org/down', title: 'Sweat gris' });
    addPriceWatcher(db, 'acc_x', { url: 'https://shop.example.org/dead', title: 'Pièce introuvable' });

    const scraper = { scrapeProduct: vi.fn(async (url: string) => {
      if (url.includes('/down')) return { sourcePrice: 10, sourceCurrency: 'EUR', title: 'Sweat gris', images: [], variants: {}, availability: 'in_stock' };
      throw new Error('DNS_FAIL');
    }) } as unknown as SmartLinkScraper;

    // 1ʳᵉ relecture : prix initial mémorisé, PAS de notification (pas d'ancien prix)
    await checkDueWatchers(db, scraper);
    let rows = listPriceWatchers(db, 'acc_x') as any[];
    expect(rows.find((r) => r.url.includes('down')).lastPriceTnd).toBeGreaterThan(0);
    // On force un ancien prix plus haut + on remet les watchers à échéance
    db.run('UPDATE price_watchers SET last_price_tnd=? WHERE url LIKE ?', 100, '%down');
    db.run("UPDATE price_watchers SET last_checked_at='2026-01-01T00:00:00.000Z'");
    await checkDueWatchers(db, scraper);
    const notes = db.all<any>("SELECT title FROM customer_notifications WHERE account_id='acc_x'");
    expect(notes.some((n) => n.title.includes('baisse'))).toBe(true);

    // 8 échecs consécutifs → veille morte + notification dédiée
    for (let i = 0; i < 8; i++) {
      db.run("UPDATE price_watchers SET last_checked_at='2026-01-01T00:00:00.000Z' WHERE url LIKE '%dead'");
      await checkDueWatchers(db, scraper);
    }
    rows = listPriceWatchers(db, 'acc_x') as any[];
    expect(rows.find((r) => r.url.includes('dead')).status).toBe('DEAD');
    expect(db.all<any>("SELECT title FROM customer_notifications WHERE account_id='acc_x'").some((n) => n.title.includes('introuvable'))).toBe(true);
    db.close?.();
  });
});

describe('API veille prix — compte requis', () => {
  it('refuse un visiteur non connecté', async () => {
    const post = await request(app).post('/api/ayrovix/watch').send({ url: 'https://shop.example.org/p', title: 'Test' });
    expect(post.status).toBe(401);
  });
});
