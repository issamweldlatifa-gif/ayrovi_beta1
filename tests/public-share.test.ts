import { expect, it } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';

it('returns a minimal public card only for content already visible to visitors', async () => {
  db.run('SAVEPOINT public_share_fixture');
  const old = '2025-01-01T00:00:00.000Z', future = '2099-01-01T00:00:00.000Z';
  const publisher = db.get<{id: string}>('SELECT id FROM story_publishers LIMIT 1')!.id;
  try {
    for (const [id, status, visibility] of [['product_visible','ACTIVE','CATALOG'],['product_temporary','ACTIVE','CONTENT'],['product_draft','DRAFT','CATALOG']]) {
      db.run("INSERT INTO products (id,name,status,visibility,final_price,source_url,created_at,updated_at) VALUES (?,'Public title',?,?,149,'https://example.com',?,?)",
        `share_${id}`, status, visibility, old, old);
    }
    for (const [id, status, start] of [['reel_visible','publie',old],['reel_draft','brouillon',old],['reel_future','publie',future]]) {
      db.run(`INSERT INTO reels (id,title,channel_id,publish_at,video_url,poster_url,status,created_at,updated_at)
        VALUES (?,'Reel',?,?,'/media/video.mp4','/media/cover.webp',?,?,?)`, `share_${id}`, publisher, start, status, old, old);
    }
    for (const [id, status, start, end] of [['story_visible','PUBLISHED',old,future],['story_draft','DRAFT',old,future],['story_future','PUBLISHED',future,null],['story_expired','PUBLISHED',old,old]]) {
      db.run(`INSERT INTO stories (id,title,title_ar,media_url,publish_at,expires_at,status,created_at,updated_at)
        VALUES (?,'Story','ستوري','/media/story.jpg',?,?,?,?,?)`, `share_${id}`, start, end, status, old, old);
    }
    const fetchCard = (name: string) => request(app).get(`/api/public/share/${name.split('_')[0]}/share_${name}`);
    expect((await fetchCard('product_visible').expect(200).expect('cache-control', 'no-store')).body.data)
      .toEqual({ title: 'Public title', description: '', image: '' });
    expect((await fetchCard('reel_visible').expect(200)).body.data).toEqual({ title: 'Reel', description: '', image: '/media/cover.webp' });
    expect((await fetchCard('story_visible').expect(200)).body.data).toMatchObject({ title: 'Story', title_ar: 'ستوري', image: '/media/story.jpg' });
    db.run("UPDATE products SET image='/uploads/invoices/a.jpg' WHERE id='share_product_visible'");
    expect((await fetchCard('product_visible').expect(200)).body.data.image).toBe('');
    for (const id of ['product_temporary', 'product_draft', 'reel_draft', 'reel_future', 'story_draft', 'story_future', 'story_expired', 'story_missing']) {
      await fetchCard(id).expect(404).expect('content-type', /json/);
    }
    await request(app).get('/api/public/share/stories/share_story_visible').expect(404);
    await request(app).get('/api/public/share/reel/%2F').expect(404);
  } finally {
    db.run('ROLLBACK TO public_share_fixture');
    db.run('RELEASE public_share_fixture');
  }
});
