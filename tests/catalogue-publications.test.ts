import { expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { QatafoDatabase } from '../src/db/database';
import { ZALANDO_DEMO, zalandoDemoProductId } from '../src/catalogue/installZalandoDemoCatalogue';
import { CATALOGUE_PUBLICATIONS_MIGRATION, CATALOGUE_PUBLICATIONS_PREFIX, installCataloguePublications, installSquareVideoPublication, SQUARE_VIDEO_PUBLICATION_ID } from '../src/magazine/cataloguePublications';

const feed = () => request(app).get('/api/public/social/publication-feed');

test('native Publication lists six populated templates and links the 24 live catalogue IDs exactly once', async () => {
  const res = await feed().query({ presentation: 'reference', limit: 30 }).expect(200);
  const items = res.body.data.items as Array<any>;
  const collection = items.filter(post => post.id.startsWith(CATALOGUE_PUBLICATIONS_PREFIX));
  expect(collection.map(post => post.template_id)).toEqual(['video', 'photo', 'video', 'split', 'campaign_orange', 'campaign_red']);
  expect(items.map(post => post.id)).not.toContain('pub_post_01');
  expect(items.map(post => post.id)).not.toContain('publication_editorial_lifestyle');
  expect(items.some(post => post.id.startsWith('publication_showcase_'))).toBe(false);
  const ids = collection.flatMap(post => {
    expect(post).toMatchObject({ channel_id: 'pub_zayrovi', channel_name: 'Zayrovi Team', content_mode: 'shoppable' });
    expect(post.products).toHaveLength(4);
    for (const product of post.products) {
      expect(product.image).toMatch(/^\/media\/catalogue\/zalando-demo-v1\//);
      expect(product.price).toBeGreaterThan(0);
    }
    if (post.post_type === 'image') expect(post.image_url).toBe(post.products[0].image);
    return post.products.map((p: any) => p.id);
  });
  expect(ids.sort()).toEqual(ZALANDO_DEMO.products.map(item => zalandoDemoProductId(item.key)).sort());
  for (const [slug, reelId, fit] of [
    ['capsule', 'reel_drive_capsule_wardrobe_v2', 'contain'], ['classiques', 'reel_drive_classic_outfits_v2', 'cover'],
  ]) {
    const post = collection.find(post => post.id === `${CATALOGUE_PUBLICATIONS_PREFIX}${slug}`);
    const reel = db.get<{ video_url: string; poster_url: string }>('SELECT video_url,poster_url FROM reels WHERE id=?', reelId)!;
    expect(JSON.parse(post.media_json)).toEqual([expect.objectContaining({ type: 'video', url: reel.video_url, poster: reel.poster_url, fit })]);
    await request(app).get(reel.video_url).set('Range', 'bytes=0-31').expect(206).expect('Content-Type', /video\/mp4/);
    await request(app).head(reel.poster_url).expect(200).expect('Content-Type', /image\/jpeg/);
  }
});

test('publishes the additional square video with two existing products and does not overwrite it', async () => {
  const res = await feed().query({ post: SQUARE_VIDEO_PUBLICATION_ID }).expect(200);
  const post = res.body.data.items[0];
  expect(post).toMatchObject({ id: SQUARE_VIDEO_PUBLICATION_ID, channel_name: 'Zayrovi Team', description: expect.any(String) });
  expect(post.products.map((item: any) => item.id)).toEqual(['zalando-p001', 'zalando-p004'].map(zalandoDemoProductId));
  const reel = db.get<{ video_url: string; poster_url: string }>("SELECT video_url,poster_url FROM reels WHERE id='reel_drive_workwear_v2'")!;
  expect(JSON.parse(post.media_json)).toEqual([expect.objectContaining({ type: 'video', frame: 'square', url: reel.video_url, poster: reel.poster_url })]);
  await request(app).get(reel.video_url).set('Range', 'bytes=0-31').expect(206);
  const isolated = new QatafoDatabase(':memory:');
  try {
    isolated.run("UPDATE publications SET title='Edited by CRM' WHERE id=?", SQUARE_VIDEO_PUBLICATION_ID);
    expect(installSquareVideoPublication(isolated)).toBe(false);
    expect(isolated.get('SELECT title FROM publications WHERE id=?', SQUARE_VIDEO_PUBLICATION_ID)).toEqual({ title: 'Edited by CRM' });
  } finally { isolated.close(); }
});

test('legacy content is retained and hiding starter art is limited to the native reference list', async () => {
  await feed().query({ post: 'pub_post_01', presentation: 'reference' }).expect(200).expect(res => {
    expect(res.body.data.items[0]).toMatchObject({ id: 'pub_post_01' });
  });
  await feed().query({ limit: 30 }).expect(200).expect(res => {
    expect(res.body.data.items.map((post: any) => post.id)).toContain('publication_editorial_lifestyle');
  });
});

test('re-running the installer preserves CRM edits and missing sources never mark or install an incomplete set', () => {
  const isolated = new QatafoDatabase(':memory:');
  const first = `${CATALOGUE_PUBLICATIONS_PREFIX}capsule`;
  try {
    isolated.run("UPDATE publications SET title='Edited by CRM' WHERE id=?", first);
    expect(installCataloguePublications(isolated)).toBe(false);
    expect(isolated.get('SELECT title FROM publications WHERE id=?', first)).toEqual({ title: 'Edited by CRM' });
    isolated.run('DELETE FROM applied_data_migrations WHERE key=?', CATALOGUE_PUBLICATIONS_MIGRATION);
    isolated.run("UPDATE reels SET status='brouillon' WHERE id='reel_drive_classic_outfits_v2'");
    isolated.run('DELETE FROM publications WHERE id=?', `${CATALOGUE_PUBLICATIONS_PREFIX}beaute`);
    expect(installCataloguePublications(isolated)).toBe(false);
    expect(isolated.get('SELECT 1 FROM applied_data_migrations WHERE key=?', CATALOGUE_PUBLICATIONS_MIGRATION)).toBeUndefined();
    expect(isolated.get('SELECT 1 FROM publications WHERE id=?', `${CATALOGUE_PUBLICATIONS_PREFIX}beaute`)).toBeUndefined();
  } finally { isolated.close(); }
});

test('related video lookup matches secondary links, returns real durations and keeps the normal feed unchanged', async () => {
  const product = zalandoDemoProductId('zalando-p004'); // secondary on both videos
  const query = { linkedProducts: product, type: 'video', presentation: 'reference' };
  const related = await feed().query(query).expect(200);
  expect(related.headers['cache-control']).toContain('private');
  const results = related.body.data.items;
  expect(results.map((row: any) => row.id)).toEqual([SQUARE_VIDEO_PUBLICATION_ID, `${CATALOGUE_PUBLICATIONS_PREFIX}capsule`]);
  expect(results.map((row: any) => JSON.parse(row.media_json)[0].durationSeconds)).toEqual([15, 8]);
  expect((await feed().query({ ...query, linkedProducts: 'not-a-product' }).expect(200)).body.data.items).toEqual([]);
  const normal = await feed().query({ post: SQUARE_VIDEO_PUBLICATION_ID }).expect(200);
  expect(JSON.parse(normal.body.data.items[0].media_json)[0]).not.toHaveProperty('durationSeconds');
  for (const linkedProducts of ['', 'has spaces', 'p,', Array.from({ length: 21 }, (_, i) => `p${i}`).join(',')]) {
    await feed().query({ ...query, linkedProducts }).expect(400);
  }
});
