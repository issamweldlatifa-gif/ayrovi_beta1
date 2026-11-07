import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { createCustomerSession } from '../src/customer/auth';
import { normalizePublicationContent } from '../shared/publicationContent';
import {
  mediaRatio,
  mediaFit,
  tileRatio,
  showsPublicationTitle,
} from '../shared/publicationPresentation';
import { upgradePublicationMediaPresentation } from '../src/catalogue/upgradePublicationMediaPresentation';
const id = 'publication_upgrade_qa';
let token = '',
  csrf = '';
beforeAll(() => {
  const now = new Date().toISOString();
  const channel = db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
  db.run(
    "INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES ('upgrade_account','Upgrade QA','ACTIVE',?,?)",
    now,
    now
  );
  db.run(
    "INSERT INTO publications(id,title,channel_id,image_url,publish_at,status,created_at,updated_at) VALUES (?,'Upgrade QA',?,'/media/test.jpg',?,'publie',?,?)",
    id,
    channel,
    now,
    now,
    now
  );
  const s = createCustomerSession(db, 'upgrade_account', {
    ip: '127.0.0.1',
    headers: {},
  } as any);
  token = s.token;
  csrf = s.csrfToken;
});
afterAll(() => {
  db.run('DELETE FROM story_interactions WHERE target_id=?', id);
  db.run('DELETE FROM publications WHERE id=?', id);
  db.run("DELETE FROM customer_accounts WHERE id='upgrade_account'");
});
let requestIndex = 0;
const write = (body: object) =>
  request(app)
    .post('/api/public/social/interact')
    .set('x-session-id', `upgrade-qa-session-${++requestIndex}`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-csrf-token', csrf)
    .send({ targetId: id, ...body });
const image = {
  type: 'image',
  url: '/media/test.jpg',
  width: 400,
  height: 800,
  purpose: 'product',
  focalX: 40,
  focalY: 30,
  scale: 1.1,
};
const video = {
  type: 'video',
  url: '/uploads/qa.mp4',
  poster: '/media/test.jpg',
  width: 1280,
  height: 720,
};
describe('Publication integrated upgrade', () => {
  test.each([
    'carousel',
    'photo',
    'split',
    'campaign',
    'social_mosaic',
    'social_strip',
    'social_pair',
    'auto',
  ])('%s accepts a real ordered mixed album', (template) => {
    const content = normalizePublicationContent({
      template_id: template,
      post_type: template === 'carousel' ? 'carousel' : 'collection',
      media: [video, image],
    });
    expect(content?.media.map((m) => m.type)).toEqual(['video', 'image']);
    expect(content?.media[1]).toMatchObject({
      purpose: 'product',
      width: 400,
      focalX: 40,
      scale: 1.1,
    });
  });
  test('single media templates support one video without pretending it is an image', () => {
    for (const template of ['video', 'caption_photo', 'shoppable'])
      expect(
        normalizePublicationContent({
          template_id: template,
          post_type: 'video',
          media: [video],
        })
      ).not.toBeNull();
    expect(
      normalizePublicationContent({
        template_id: 'video',
        post_type: 'video',
        media: [video, image],
      })
    ).toBeNull();
    expect(
      normalizePublicationContent({
        template_id: 'shoppable',
        media: [video, image],
      })
    ).toBeNull();
  });
  test('invalid geometry, oversized albums, missing covers and unsafe originals cannot publish', () => {
    for (const patch of [
      { width: 0 },
      { scale: 5 },
      { focalX: 101 },
      { height: NaN },
      { purpose: 'guess' },
      { originalUrl: 'javascript:alert(1)' },
    ])
      expect(
        normalizePublicationContent({ media: [{ ...image, ...patch }] })
      ).toBeNull();
    expect(
      normalizePublicationContent({ media: Array(11).fill(image) })
    ).toBeNull();
    expect(
      normalizePublicationContent({ media: [{ ...video, poster: '' }] })
    ).toBeNull();
  });
  test('presentation is bounded and respects explicit overrides and caption-first hierarchy', () => {
    expect(mediaFit({ purpose: 'product' })).toBe('contain');
    expect(mediaFit({ purpose: 'product', fit: 'cover' })).toBe('cover');
    expect(mediaRatio({ width: 10, height: 100 })).toBe(0.65);
    expect(
      tileRatio([
        { width: 500, height: 900 },
        { width: 400, height: 800 },
      ])
    ).toBe(0.7);
    expect(showsPublicationTitle('caption_photo')).toBe(false);
    expect(showsPublicationTitle('campaign')).toBe(true);
  });
  test('explicit reactions are idempotent, mutually exclusive, persisted and private per viewer', async () => {
    for (let n = 0; n < 2; n++) {
      const r = await write({ type: 'reaction', reaction: 'like' });
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({
        liked: true,
        disliked: false,
        likesCount: 1,
      });
    }
    const down = await write({ type: 'reaction', reaction: 'dislike' });
    expect(down.body.data).toMatchObject({
      liked: false,
      disliked: true,
      likesCount: 0,
    });
    const own = await request(app)
      .get('/api/public/social/publication-feed')
      .set('Authorization', `Bearer ${token}`)
      .query({ post: id });
    expect(own.body.data.items[0]).toMatchObject({
      liked: 0,
      disliked: 1,
      likes: 0,
    });
    const guest = await request(app)
      .get('/api/public/social/publication-feed')
      .query({ post: id });
    expect(guest.body.data.items[0].disliked).toBe(0);
    expect(guest.body.data.items[0]).not.toHaveProperty('dislikes');
    expect(
      (await write({ type: 'reaction', reaction: null })).body.data.disliked
    ).toBe(false);
    expect(
      (await write({ type: 'reaction', reaction: 'invented' })).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/public/social/interact')
          .send({ targetId: id, type: 'reaction', reaction: 'dislike' })
      ).status
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/public/social/interact')
          .set('Authorization', `Bearer ${token}`)
          .send({ targetId: id, type: 'reaction', reaction: 'like' })
      ).status
    ).toBe(403);
  });
  test('replies must belong to an existing comment on the same post and survive reread', async () => {
    const parent = await write({ type: 'comment', text: 'Quel format ?' });
    expect(parent.status).toBe(201);
    const reply = await write({
      type: 'comment',
      text: 'Le format est sur la fiche.',
      parentId: parent.body.data.id,
    });
    expect(reply.status).toBe(201);
    expect(reply.body.data.parentId).toBe(parent.body.data.id);
    expect(
      (
        await write({
          type: 'comment',
          text: 'Invalid parent',
          parentId: 'missing',
        })
      ).status
    ).toBe(400);
    const rows = (
      await request(app)
        .get('/api/public/social/comments')
        .query({ targetId: id })
    ).body.data;
    expect(rows.find((r: any) => r.id === reply.body.data.id).parentId).toBe(
      parent.body.data.id
    );
  });
  test('metadata migration preserves authored settings and never changes stock or replenishes', () => {
    const before = db.all('SELECT * FROM inventory_stock_items');
    const count = db.get<any>('SELECT COUNT(*) n FROM products').n;
    upgradePublicationMediaPresentation(db);
    const snapshot = db.all('SELECT id,media_json FROM publications');
    upgradePublicationMediaPresentation(db);
    expect(db.all('SELECT id,media_json FROM publications')).toEqual(snapshot);
    expect(db.all('SELECT * FROM inventory_stock_items')).toEqual(before);
    expect(db.get<any>('SELECT COUNT(*) n FROM products').n).toBe(count);
  });
  test('comment retry IDs prevent duplicate sends without accepting edited payloads under the same ID', async () => {
    const input = {
      type: 'comment',
      text: 'Idempotent comment QA',
      clientRequestId: 'qa_comment_retry_123',
    };
    const first = await write(input);
    const retry = await write(input);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect((await write({ ...input, text: 'Changed text' })).status).toBe(409);
    expect(
      db.get<any>(
        'SELECT COUNT(*) n FROM story_interactions WHERE target_id=? AND text=?',
        id,
        input.text
      ).n
    ).toBe(1);
  });
  test('title display is explicit and validated independently from internal editorial title', () => {
    expect(
      normalizePublicationContent({ show_title: false, media: [image] })
        ?.showTitle
    ).toBe(false);
    expect(normalizePublicationContent({ show_title: 'yes' })).toBeNull();
    expect(normalizePublicationContent({}, { show_title: 0 })?.showTitle).toBe(
      false
    );
  });
});
