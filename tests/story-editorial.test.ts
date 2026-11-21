import request from 'supertest';
import { expect, test } from 'vitest';
import { app, db } from '../src/server';
import { createAdminSession, setAdminCookie } from '../src/admin/auth';
import { zalandoDemoProductId } from '../src/catalogue/installZalandoDemoCatalogue';
import { normalizeStoryEditorial } from '../shared/storyEditorial';
import { PUBLICATION_STUDIO_LAYOUTS, publicationStudioLayout, publicationStudioMedia, type StudioPublicationLayout } from '../shared/publicationStudio';
import { normalizePublicationContent } from '../shared/publicationContent';

const storyPath = '/api/admin/stories';
const blank = { text: '' };
const copy = { text: 'Une sélection', textAr: 'تشكيلة' };
const editorial = {
  version: 1,
  slides: [
    { layout: 'cover', media: { kind: 'image', url: '/media/stories/cover.jpg' }, title: copy, caption: blank, action: 'read' },
    { layout: 'inset', media: { kind: 'gif', url: '/uploads/story/clip.gif' }, title: copy, caption: blank, action: 'discover', seconds: 8 },
  ],
  article: { cover: '/media/stories/cover.jpg', title: copy, intro: blank, author: 'Zayrovi Team', selectionTitle: blank,
    blocks: [{ type: 'text', content: copy }, { type: 'image', url: '/media/stories/inside.jpg', alt: blank }] },
};

test('validates typed media, ordering, CTA destinations and bounded authoring', () => {
  expect(normalizeStoryEditorial(editorial)).toEqual(editorial);
  expect(() => normalizeStoryEditorial({ ...editorial, slides: Array(13).fill(editorial.slides[0]) })).toThrow();
  expect(() => normalizeStoryEditorial({ ...editorial, article: undefined })).toThrow();
  expect(() => normalizeStoryEditorial({ ...editorial, slides: [{ ...editorial.slides[0], seconds: -1 }] })).toThrow();
  for (const url of ['javascript:alert(1)', '//bad.example/img.jpg', '/media/../x.jpg', '/uploads/%2e%2e/a.jpg']) {
    expect(() => normalizeStoryEditorial({ ...editorial, slides: [{ ...editorial.slides[0], media: { kind: 'image', url } }] })).toThrow();
  }
});

test('editor round-trips all seven active Publication layouts without reviving block templates', () => {
  for (const layout of Object.keys(PUBLICATION_STUDIO_LAYOUTS) as StudioPublicationLayout[]) {
    const media = publicationStudioMedia(layout, '/media/photo.jpg', '/media/video.mp4');
    const normalized = normalizePublicationContent(media);
    expect(normalized).toBeTruthy();
    expect(publicationStudioLayout(normalized!.template!, normalized!.media[0])).toBe(layout);
  }
  expect(publicationStudioLayout('social_mosaic')).toBe('');
});

test('CRM writes a Story and its ordered products atomically; public detail is exact, scoped and respects visibility', async () => {
  const admin = db.get('SELECT id FROM admin_users WHERE email=?', process.env.ADMIN_EMAIL);
  const session = createAdminSession(db, admin, true);
  let cookie = '';
  setAdminCookie({ setHeader: (_name: string, value: string) => { cookie = value.split(';')[0]!; } } as any, session.token);
  const authorized = (req: request.Test) => req.set('Cookie', cookie).set('x-csrf-token', session.csrfToken);
  const ids = db.all<{ id: string }>("SELECT id FROM products WHERE status='ACTIVE' AND visibility='CATALOG' AND final_price>0 ORDER BY id LIMIT 3").map(row => row.id);
  expect(ids).toHaveLength(3);
  const products = [ids[1], ids[0]];
  const productSlide = { layout: 'product', media: { kind: 'video', url: '/media/stories/clip.mp4' }, title: copy, caption: blank, productId: ids[0] };
  const groupSlide = { ...productSlide, productId: undefined, productIds: products };
  const focus = { type: 'product', title: copy, content: copy, productId: ids[1], image: '' };
  const editor = { ...editorial, slides: [editorial.slides[0], productSlide, { ...editorial.slides[1], action: 'explore' }, groupSlide],
    article: { ...editorial.article, blocks: [...editorial.article.blocks, focus] } };
  const payload = { title: 'Article QA', media_url: '/media/stories/cover.jpg', media_type: 'IMAGE', status: 'PUBLISHED',
    publish_at: new Date(Date.now() - 5_000).toISOString(), product_ids: products, editorial: editor };
  await request(app).post(storyPath).send(payload).expect(401);
  await authorized(request(app).post(storyPath)).send({ ...payload, product_ids: [ids[2]] }).expect(400);
  await authorized(request(app).post(storyPath)).send({ ...payload, editorial: { ...editor, slides: [editor.slides[0], { ...groupSlide, productIds: [ids[0], ids[0]] }] } }).expect(400);
  await authorized(request(app).post(storyPath)).send({ ...payload, editorial: { ...editor, article: { ...editor.article, blocks: [{ ...focus, productId: ids[2] }] } } }).expect(400);
  const created = await authorized(request(app).post(storyPath)).send(payload).expect(201);
  const id = created.body.data.id;
  const path = `/api/public/stories/${id}/editorial`;
  try {
    const published = await request(app).get(path).expect(200).expect('Cache-Control', 'no-store');
    expect(published.body.data.editorial).toEqual(JSON.parse(JSON.stringify(editor)));
    expect(published.body.data.products.map((item: { id: string }) => item.id)).toEqual(products);
    const detail = await authorized(request(app).get(`${storyPath}/${id}`)).expect(200);
    expect(detail.body.data.product_ids).toEqual(products);
    const gallery = await request(app).get('/api/public/stories').expect(200);
    expect(gallery.body.data.find((item: any) => item.id === id)).not.toHaveProperty('editorial_json');
    await authorized(request(app).put(`${storyPath}/${id}`)).send({ product_ids: [ids[2]] }).expect(400);
    await authorized(request(app).put(`${storyPath}/${id}`)).send({ title: 'Retouché' }).expect(200);
    expect((await request(app).get(path)).body.data.editorial).toEqual(JSON.parse(JSON.stringify(editor)));
    await authorized(request(app).put(`${storyPath}/${id}`)).send({ status: 'DRAFT' }).expect(200);
    await request(app).get(path).expect(404);
    await authorized(request(app).put(`${storyPath}/${id}`)).send({ status: 'PUBLISHED', publish_at: new Date(Date.now() + 100_000).toISOString() }).expect(200);
    await request(app).get(path).expect(404);
    const publish_at = new Date(Date.now() - 100_000).toISOString();
    await authorized(request(app).put(`${storyPath}/${id}`)).send({ publish_at, expires_at: new Date(Date.now() - 5_000).toISOString() }).expect(200);
    await request(app).get(path).expect(404);
    await authorized(request(app).put(`${storyPath}/${id}`)).send({ expires_at: null }).expect(200);
    expect((await request(app).get(path).expect(200)).body.data.editorial).toEqual(JSON.parse(JSON.stringify(editor)));
    await request(app).get('/api/public/stories/unknown/editorial').expect(404);
  } finally {
    db.run("DELETE FROM content_products WHERE content_kind='story' AND content_id=?", id);
    db.run('DELETE FROM stories WHERE id=?', id);
  }
});

test('all seven official stories have their own bilingual dossier and live product cards', async () => {
  const gallery = (await request(app).get('/api/public/stories').expect(200)).body.data;
  const official = gallery.filter((item: { id: string }) => item.id.startsWith('official_story_'));
  expect(official).toHaveLength(7);
  const intros = new Set<string>();
  for (const { id } of official) {
    const { data } = (await request(app).get(`/api/public/stories/${id}/editorial`).expect(200)).body;
    intros.add(data.editorial.article.intro.text);
    expect(data.editorial.article.intro.textAr).toBeTruthy();
    const links = data.products.map((product: { id: string; price: number }) => {
      expect(product.price).toBeGreaterThan(0);
      return product.id;
    });
    expect(links).toHaveLength(2);
    expect(data.editorial.slides.map((slide: { layout: string }) => slide.layout)).toEqual(['cover', 'product', 'inset']);
    expect(data.editorial.slides[1].productIds).toEqual(links);
    expect(data.editorial.article.blocks.map((block: { type: string; productId: string }) => {
      expect(block.type).toBe('product');
      return block.productId;
    })).toEqual(links);
  }
  expect(intros.size).toBe(7);
});

test('relevant Reels expose ordered catalogue products; unrelated clips do not show a shop', async () => {
  const { data } = (await request(app).get('/api/public/social/reels').expect(200)).body;
  const workwear = data.find((row: { id: string }) => row.id === 'reel_drive_workwear_v2');
  expect(workwear.products.map((row: { id: string }) => row.id)).toEqual(['zalando-p004', 'zalando-p005', 'zalando-p019'].map(zalandoDemoProductId));
  expect(workwear.products[0].price).toBeGreaterThan(0);
  expect(data.find((row: { id: string }) => row.id === 'reel_drive_boho_decor_v2').products ?? []).toEqual([]);
  expect(data.filter((row: { id: string; products?: unknown[] }) => row.id.startsWith('reel_drive_') && row.products?.length)).toHaveLength(7);
});
