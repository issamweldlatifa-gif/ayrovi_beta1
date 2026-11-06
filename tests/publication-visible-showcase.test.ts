import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import {
  installPublicationShowcase,
  PUBLICATION_SHOWCASE_PREFIX,
} from '../src/services/publicationShowcase';
import { TEST_PRODUCT_ID } from '../src/catalogue/seedTestProduct';

describe('Code-installed publication examples visible without CRM creation', () => {
  test('installs all five additional layouts and both corrected compositions as real published posts', async () => {
    const response = await request(app).get(
      '/api/public/social/publication-feed?limit=30'
    );
    expect(response.status).toBe(200);
    const rows = response.body.data.items.filter((item: any) =>
      item.id.startsWith(PUBLICATION_SHOWCASE_PREFIX)
    );
    expect(rows).toHaveLength(7);
    expect(rows.map((row: any) => row.template_id).sort()).toEqual(
      [
        'social_mosaic',
        'shoppable',
        'caption_photo',
        'social_strip',
        'social_pair',
        'campaign',
        'carousel',
      ].sort()
    );
    for (const row of rows) {
      expect(row.channel_official).toBe(1);
      expect(row.likes).toBe(0);
      expect(JSON.parse(row.media_json).length).toBeGreaterThan(0);
      expect((await request(app).get(row.image_url)).status).toBe(200);
    }
    const shop = rows.find((row: any) => row.template_id === 'shoppable');
    expect(shop.products[0].id).toBe(TEST_PRODUCT_ID);
    const product = db.get<any>(
      'SELECT * FROM products WHERE id=?',
      TEST_PRODUCT_ID
    );
    expect(shop.image_url).toBe(product.image);
    expect(shop.products[0].price).toBe(product.final_price);
    expect(
      rows.find((row: any) => row.template_id === 'carousel').products
    ).toEqual([]);
    const featured = (await request(app).get('/api/public/home-featured')).body
      .data.publication;
    expect(featured?.id.startsWith(PUBLICATION_SHOWCASE_PREFIX)).not.toBe(true);
  });
  test('does not overwrite CRM edits, including archived status, when installer is called twice', () => {
    const id = PUBLICATION_SHOWCASE_PREFIX + 'social_pair';
    const previous = db.get<any>('SELECT * FROM publications WHERE id=?', id);
    try {
      db.run(
        "UPDATE publications SET title='CRM owner edit',status='archive' WHERE id=?",
        id
      );
      expect(installPublicationShowcase(db)).toEqual([]);
      expect(
        db.get<any>('SELECT title,status FROM publications WHERE id=?', id)
      ).toEqual({ title: 'CRM owner edit', status: 'archive' });
    } finally {
      db.run(
        'UPDATE publications SET title=?,status=? WHERE id=?',
        previous.title,
        previous.status,
        id
      );
    }
  });
});

test('a later application start preserves edits and does not resurrect deleted examples', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { QatafoDatabase } = await import('../src/db/database');
  const directory = mkdtempSync(join(tmpdir(), 'publication-showcase-'));
  let connection: InstanceType<typeof QatafoDatabase> | undefined;
  try {
    const file = join(directory, 'db.sqlite');
    connection = new QatafoDatabase(file);
    connection.run(
      "UPDATE publications SET title='Saved by owner', status='brouillon' WHERE id=?",
      PUBLICATION_SHOWCASE_PREFIX + 'social_pair'
    );
    connection.run(
      'DELETE FROM publications WHERE id=?',
      PUBLICATION_SHOWCASE_PREFIX + 'caption_photo'
    );
    connection.close();
    connection = undefined;
    connection = new QatafoDatabase(file);
    expect(
      connection.get<any>(
        'SELECT title,status FROM publications WHERE id=?',
        PUBLICATION_SHOWCASE_PREFIX + 'social_pair'
      )
    ).toEqual({ title: 'Saved by owner', status: 'brouillon' });
    expect(
      connection.get(
        'SELECT id FROM publications WHERE id=?',
        PUBLICATION_SHOWCASE_PREFIX + 'caption_photo'
      )
    ).toBeUndefined();
  } finally {
    connection?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
