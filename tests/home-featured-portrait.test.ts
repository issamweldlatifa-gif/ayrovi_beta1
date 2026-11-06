import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { app } from '../src/server';
import { QatafoDatabase } from '../src/db/database';

const PHOTO = '/media/editorial/featured-beauty.jpg';

test('the supplied featured photograph is served in full 2:3 portrait proportions', async () => {
  const response = await request(app).get(PHOTO);
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('image/jpeg');
  const image = await sharp(response.body).metadata();
  expect(image.width! / image.height!).toBeCloseTo(2 / 3);
});

test('portrait migration replaces the selected publication photo once, preserving settings, other publications and later CRM edits', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'featured-portrait-'));
  const file = path.join(dir, 'store.sqlite');
  let store: QatafoDatabase | undefined;
  try {
    store = new QatafoDatabase(file);
    store.run("DELETE FROM applied_data_migrations WHERE key='home_featured_editorial_portrait_v1'");
    const now = new Date(Date.now() - 1000).toISOString();
    for (const id of ['portrait-selected', 'portrait-other']) {
      store.run(`INSERT INTO publications (id,title,subtitle,channel_id,image_url,publish_at,status,created_at,updated_at)
        VALUES (?,'Original title','Original subtitle',(SELECT id FROM story_publishers LIMIT 1),'/media/old.jpg',?,'publie',?,?)`, id, now, now, now);
    }
    store.run("UPDATE home_featured_settings SET enabled=0,source='pinned',publication_id='portrait-selected',cta_label='Lire' WHERE id='global'");
    store.close(); store = new QatafoDatabase(file);
    expect(store.get<any>("SELECT image_url,title,subtitle FROM publications WHERE id='portrait-selected'"))
      .toEqual({ image_url: PHOTO, title: 'Original title', subtitle: 'Original subtitle' });
    expect(store.get<any>("SELECT image_url FROM publications WHERE id='portrait-other'")?.image_url).toBe('/media/old.jpg');
    expect(store.get<any>("SELECT enabled,source,publication_id,cta_label FROM home_featured_settings WHERE id='global'"))
      .toEqual({ enabled: 0, source: 'pinned', publication_id: 'portrait-selected', cta_label: 'Lire' });
    store.run("UPDATE publications SET image_url='/media/later-crm-edit.jpg' WHERE id='portrait-selected'");
    store.close(); store = new QatafoDatabase(file);
    expect(store.get<any>("SELECT image_url FROM publications WHERE id='portrait-selected'")?.image_url).toBe('/media/later-crm-edit.jpg');
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
