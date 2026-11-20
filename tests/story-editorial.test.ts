import request from 'supertest';
import { expect, test } from 'vitest';
import { app, db } from '../src/server';
import { createAdminSession, setAdminCookie } from '../src/admin/auth';
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
  const editor = { ...editorial, slides: [editorial.slides[0], productSlide, editorial.slides[1]] };
  const payload = { title: 'Article QA', media_url: '/media/stories/cover.jpg', media_type: 'IMAGE', status: 'PUBLISHED',
    publish_at: new Date(Date.now() - 5_000).toISOString(), product_ids: products, editorial: editor };
  await request(app).post(storyPath).send(payload).expect(401);
  await authorized(request(app).post(storyPath)).send({ ...payload, product_ids: [ids[2]] }).expect(400);
  const created = await authorized(request(app).post(storyPath)).send(payload).expect(201);
  const id = created.body.data.id;
  const path = `/api/public/stories/${id}/editorial`;
  try {
    const published = await request(app).get(path).expect(200).expect('Cache-Control', 'no-store');
    expect(published.body.data.editorial).toEqual(editor);
    expect(published.body.data.products.map((item: { id: string }) => item.id)).toEqual(products);
    const detail = await authorized(request(app).get(`${storyPath}/${id}`)).expect(200);
    expect(detail.body.data.product_ids).toEqual(products);
    const gallery = await request(app).get('/api/public/stories').expect(200);
    expect(gallery.body.data.find((item: any) => item.id === id)).not.toHaveProperty('editorial_json');
    await authorized(request(app).put(`${storyPath}/${id}`)).send({ product_ids: [ids[2]] }).expect(400);
    await authorized(request(app).put(`${storyPath}/${id}`)).send({ title: 'Retouché' }).expect(200);
    expect((await request(app).get(path)).body.data.editorial).toEqual(editor);
    await authorized(request(app).put(`${storyPath}/${id}`)).send({ status: 'DRAFT' }).expect(200);
    await request(app).get(path).expect(404);
    await authorized(request(app).put(`${storyPath}/${id}`)).send({ status: 'PUBLISHED', publish_at: new Date(Date.now() + 100_000).toISOString() }).expect(200);
    await request(app).get(path).expect(404);
    const publish_at = new Date(Date.now() - 100_000).toISOString();
    await authorized(request(app).put(`${storyPath}/${id}`)).send({ publish_at, expires_at: new Date(Date.now() - 5_000).toISOString() }).expect(200);
    await request(app).get(path).expect(404);
    await authorized(request(app).put(`${storyPath}/${id}`)).send({ expires_at: null }).expect(200);
    expect((await request(app).get(path).expect(200)).body.data.editorial).toEqual(editor);
    await request(app).get('/api/public/stories/unknown/editorial').expect(404);
  } finally {
    db.run("DELETE FROM content_products WHERE content_kind='story' AND content_id=?", id);
    db.run('DELETE FROM stories WHERE id=?', id);
  }
});
