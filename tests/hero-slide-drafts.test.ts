/**
 * Module Hero (Admin) — brouillons, aperçu, publication, programmation, réordonnancement,
 * suppression, abandon, permissions, audit. Base réelle en mémoire (vitest), API complète.
 *
 * Règle centrale vérifiée ici : ce que le visiteur voit (`/api/public/hero-slides`)
 * ne change QU'À la publication. Les brouillons n'y apparaissent jamais.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { app, db } from '../src/server';

const suffix = Date.now().toString(36);
const tomorrow = new Date(Date.now() + 24 * 3600e3).toISOString();
const yesterday = new Date(Date.now() - 24 * 3600e3).toISOString();
const twoDaysAgo = new Date(Date.now() - 48 * 3600e3).toISOString();

describe('Hero — brouillons, aperçu et publication (Admin)', () => {
  const admin = request.agent(app);
  const reader = request.agent(app);
  let csrf = '';
  let imageUrl = '';
  const uploadedFiles: string[] = [];

  beforeAll(async () => {
    const login = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    csrf = login.body.data.csrfToken as string;

    // Compte sans droit d'écriture sur le contenu (commandes uniquement).
    const email = `hero-orders-${suffix}@test.ayrovi.tn`;
    const password = 'HeroOrders2026!x';
    const created = await admin.post('/api/admin/users').set('x-csrf-token', csrf)
      .send({ name: 'Hero orders', email, password, role: 'ORDER_MANAGER' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const orderLogin = await reader.post('/api/admin/auth/login').send({ email, password });
    expect(orderLogin.status).toBe(200);

    // Visuel réel 4:5 téléversé par l'API d'upload existante.
    const jpeg = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#1B4D8A' } }).jpeg().toBuffer();
    const upload = await admin.post('/api/admin/uploads').set('x-csrf-token', csrf)
      .send({ dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` });
    expect(upload.status).toBe(201);
    imageUrl = upload.body.data.url as string;
    uploadedFiles.push(path.resolve(process.cwd(), 'data', 'uploads', upload.body.data.filename as string));
  });

  afterAll(() => {
    db.run("DELETE FROM hero_slide_drafts WHERE id LIKE 'hero_slide_%'");
    db.run("DELETE FROM hero_slides WHERE id LIKE 'hero_slide_%'");
    for (const file of uploadedFiles) fs.rmSync(file, { force: true });
  });

  const body = (overrides: Record<string, unknown> = {}) => ({
    image: imageUrl,
    title: `Carte ${suffix}`,
    title_ar: 'بطاقة',
    subtitle: 'Sous-titre',
    subtitle_ar: 'عنوان فرعي',
    cta: 'Voir',
    cta_ar: 'اعرض',
    destination_type: 'CAMPAIGN',
    destination_value: '',
    bg_mode: 'auto',
    bg_color: '',
    display_order: 0,
    active: true,
    published_from: '',
    published_to: '',
    ...overrides,
  });

  const publicCards = async () => (await request(app).get('/api/public/hero-slides')).body.data as any[];
  const publicIds = async () => (await publicCards()).map((card) => card.id);
  const manage = async () => (await admin.get('/api/admin/hero-slides/manage')).body;
  const createDraft = async (overrides: Record<string, unknown> = {}) => {
    const res = await admin.post('/api/admin/hero-slides/drafts').set('x-csrf-token', csrf).send(body(overrides));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data as { id: string; status: string };
  };
  const publish = () => admin.post('/api/admin/hero-slides/publish').set('x-csrf-token', csrf);

  test('un brouillon n’apparaît jamais côté visiteur, mais l’aperçu le montre', async () => {
    const draft = await createDraft({ title: `Brouillon ${suffix}` });
    expect(draft.status).toBe('NEW_DRAFT');
    expect(await publicIds()).not.toContain(draft.id);

    const preview = await admin.get('/api/admin/hero-slides/preview');
    expect(preview.status).toBe(200);
    const card = preview.body.data.find((c: any) => c.id === draft.id);
    expect(card).toBeTruthy();
    expect(card.href).toBe('/promotions');
    expect(preview.body.pendingCount).toBeGreaterThan(0);
  });

  test('la carte publique garde son contrat (champs camelCase, href résolu)', async () => {
    const draft = await createDraft({ title: `Contrat ${suffix}`, destination_type: 'NEWS' });
    await publish();
    const card = (await publicCards()).find((c) => c.id === draft.id);
    expect(card).toMatchObject({ id: draft.id, title: `Contrat ${suffix}`, titleAr: 'بطاقة', href: '/news', destinationType: 'NEWS' });
    expect(Object.keys(card).sort()).toEqual(expect.arrayContaining(['image', 'cta', 'ctaAr', 'subtitle', 'displayOrder', 'background', 'dominant']));
  });

  test('validation : erreurs par champ, et rien n’est enregistré', async () => {
    const before = (await manage()).pendingCount;
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ title: '', image: '' }, 'title'],
      [{ destination_type: 'EXTERNAL', destination_value: 'ftp://exemple.tn' }, 'destination_value'],
      [{ destination_type: 'COLLECTION', destination_value: 'arrivage_qui_n_existe_pas' }, 'destination_value'],
      [{ bg_mode: 'manual', bg_color: 'rouge' }, 'bg_color'],
      [{ published_from: tomorrow, published_to: yesterday }, 'published_to'],
      [{ image: '/etc/passwd' }, 'image'],
    ];
    for (const [overrides, field] of cases) {
      const res = await admin.post('/api/admin/hero-slides/drafts').set('x-csrf-token', csrf).send(body(overrides));
      expect(res.status, `${field} → ${JSON.stringify(res.body)}`).toBe(422);
      expect(res.body.errors[field], field).toBeTruthy();
    }
    expect((await manage()).pendingCount).toBe(before);
  });

  test('publication : la carte devient visible et les brouillons sont vidés', async () => {
    const draft = await createDraft({ title: `Publiée ${suffix}` });
    const res = await publish();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.created).toBeGreaterThanOrEqual(1);
    expect(await publicIds()).toContain(draft.id);
    expect((await manage()).pendingCount).toBe(0);
  });

  test('modification : le visiteur voit l’ancien texte jusqu’à la publication', async () => {
    const draft = await createDraft({ title: `Avant ${suffix}` });
    await publish();

    const edit = await admin.put(`/api/admin/hero-slides/drafts/${draft.id}`).set('x-csrf-token', csrf)
      .send({ title: `Après ${suffix}` });
    expect(edit.status).toBe(200);
    expect(edit.body.data.status).toBe('MODIFIED');
    expect((await publicCards()).find((c) => c.id === draft.id)?.title).toBe(`Avant ${suffix}`);

    await publish();
    expect((await publicCards()).find((c) => c.id === draft.id)?.title).toBe(`Après ${suffix}`);
  });

  test('désactiver puis réactiver une carte, à la publication seulement', async () => {
    const draft = await createDraft({ title: `Toggle ${suffix}` });
    await publish();
    await admin.put(`/api/admin/hero-slides/drafts/${draft.id}`).set('x-csrf-token', csrf).send({ active: false });
    expect(await publicIds()).toContain(draft.id);
    await publish();
    expect(await publicIds()).not.toContain(draft.id);
    const off = (await manage()).data.find((s: any) => s.id === draft.id);
    expect(off.status).toBe('DISABLED');

    await admin.put(`/api/admin/hero-slides/drafts/${draft.id}`).set('x-csrf-token', csrf).send({ active: true });
    await publish();
    expect(await publicIds()).toContain(draft.id);
  });

  test('réordonner change l’ordre d’affichage publié', async () => {
    // Plafond élargi le temps du test : les cartes ajoutées en fin de liste restent visibles.
    await setMaxCards(12);
    // Positions explicites, en fin de liste : l'ordre de départ est déterministe.
    const first = await createDraft({ title: `Ordre A ${suffix}`, display_order: 900 });
    const second = await createDraft({ title: `Ordre B ${suffix}`, display_order: 901 });
    await publish();
    const before = await publicIds();
    expect(before.indexOf(first.id)).toBeGreaterThanOrEqual(0);
    expect(before.indexOf(first.id)).toBeLessThan(before.indexOf(second.id));
    const order = [second.id, first.id];
    const res = await admin.post('/api/admin/hero-slides/reorder').set('x-csrf-token', csrf).send({ ids: order });
    expect(res.status).toBe(200);
    // Avant publication : le visiteur garde l'ancien ordre.
    const ids = await publicIds();
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id));
    await publish();
    const after = await publicIds();
    expect(after.indexOf(second.id)).toBeLessThan(after.indexOf(first.id));
  });

  const setMaxCards = (maxCards: number) => admin.put('/api/admin/hero-carousel-settings').set('x-csrf-token', csrf)
    .send({ enabled: true, maxCards, autoplay: false, autoplayIntervalMs: 5000, transitionMs: 300, paginationVisible: true });

  test('réordonnancement refusé : carte inconnue ou doublon', async () => {
    const bad = await admin.post('/api/admin/hero-slides/reorder').set('x-csrf-token', csrf).send({ ids: ['hero_slide_inconnue'] });
    expect(bad.status).toBe(400);
    const live = (await publicCards())[0];
    const dup = await admin.post('/api/admin/hero-slides/reorder').set('x-csrf-token', csrf).send({ ids: [live.id, live.id] });
    expect(dup.status).toBe(400);
  });

  test('suppression : marquée d’abord, retirée seulement à la publication', async () => {
    const draft = await createDraft({ title: `Suppr ${suffix}` });
    await publish();
    const del = await admin.delete(`/api/admin/hero-slides/${draft.id}`).set('x-csrf-token', csrf);
    expect(del.status).toBe(200);
    expect(del.body.data.status).toBe('DELETING');
    expect(await publicIds()).toContain(draft.id);
    await publish();
    expect(await publicIds()).not.toContain(draft.id);
    expect((await manage()).data.map((s: any) => s.id)).not.toContain(draft.id);
    // Suppression définitive (décision produit) : la ligne n'existe plus en base, ni brouillon.
    expect(db.get<any>('SELECT id FROM hero_slides WHERE id=?', draft.id)).toBeUndefined();
    expect(db.get<any>('SELECT id FROM hero_slide_drafts WHERE id=?', draft.id)).toBeUndefined();
  });

  test('une carte jamais publiée se supprime tout de suite', async () => {
    const draft = await createDraft({ title: `Jamais ${suffix}` });
    await admin.delete(`/api/admin/hero-slides/${draft.id}`).set('x-csrf-token', csrf);
    expect((await manage()).data.map((s: any) => s.id)).not.toContain(draft.id);
  });

  test('abandon d’un brouillon : la carte revient à son état publié', async () => {
    const draft = await createDraft({ title: `Abandon ${suffix}` });
    await publish();
    await admin.put(`/api/admin/hero-slides/drafts/${draft.id}`).set('x-csrf-token', csrf).send({ title: `Modifié ${suffix}` });
    const discard = await admin.post(`/api/admin/hero-slides/drafts/${draft.id}/discard`).set('x-csrf-token', csrf);
    expect(discard.status).toBe(200);
    expect(discard.body.data.status).toBe('PUBLISHED');
    expect(discard.body.data.title).toBe(`Abandon ${suffix}`);
    const again = await admin.post(`/api/admin/hero-slides/drafts/${draft.id}/discard`).set('x-csrf-token', csrf);
    expect(again.status).toBe(404);
  });

  test('programmation : fenêtre future = planifiée, fenêtre passée = expirée', async () => {
    const future = await createDraft({ title: `Plan ${suffix}`, published_from: tomorrow });
    const past = await createDraft({ title: `Exp ${suffix}`, published_from: twoDaysAgo, published_to: yesterday });
    await publish();
    expect(await publicIds()).not.toContain(future.id);
    expect(await publicIds()).not.toContain(past.id);
    const statuses = Object.fromEntries((await manage()).data.map((s: any) => [s.id, s.status]));
    expect(statuses[future.id]).toBe('SCHEDULED');
    expect(statuses[past.id]).toBe('EXPIRED');
  });

  test('image manquante : signalée, et jamais publiée', async () => {
    const draft = await createDraft({ title: `Sans image ${suffix}`, image: '/uploads/inexistante_hero_test.jpg' });
    const listed = (await manage()).data.find((s: any) => s.id === draft.id);
    expect(listed.imageAvailable).toBe(false);
    const res = await publish();
    expect(res.status).toBe(422);
    expect(res.body.problems[draft.id].image).toMatch(/introuvable/);
    expect(await publicIds()).not.toContain(draft.id);
    await admin.post(`/api/admin/hero-slides/drafts/${draft.id}/discard`).set('x-csrf-token', csrf);
  });

  test('publication atomique : une carte invalide bloque tout', async () => {
    const good = await createDraft({ title: `Bonne ${suffix}` });
    const live = (await publicCards())[0];
    await admin.put(`/api/admin/hero-slides/drafts/${live.id}`).set('x-csrf-token', csrf).send({ title: `Changée ${suffix}` });
    // Brouillon rendu invalide directement en base (ex. titre vidé par un outil externe).
    db.run("UPDATE hero_slide_drafts SET title='' WHERE id=?", live.id);

    const res = await publish();
    expect(res.status).toBe(422);
    expect(res.body.problems[live.id].title).toBeTruthy();
    expect(await publicIds()).not.toContain(good.id);
    expect((await publicCards()).find((c) => c.id === live.id)?.title).not.toBe(`Changée ${suffix}`);
    expect((await manage()).pendingCount).toBe(2);

    await admin.post(`/api/admin/hero-slides/drafts/${live.id}/discard`).set('x-csrf-token', csrf);
    await admin.post(`/api/admin/hero-slides/drafts/${good.id}/discard`).set('x-csrf-token', csrf);
  });

  test('permissions : sans droit d’écriture contenu, rien ne passe', async () => {
    const create = await reader.post('/api/admin/hero-slides/drafts').set('x-csrf-token', csrf).send(body());
    expect(create.status).toBe(403);
    const pub = await reader.post('/api/admin/hero-slides/publish').set('x-csrf-token', csrf);
    expect(pub.status).toBe(403);
  });

  test('audit : chaque action est tracée (création, modification, publication)', async () => {
    const rows = db.all<{ action: string }>("SELECT action FROM audit_logs WHERE module='HERO'");
    const actions = new Set(rows.map((row) => row.action));
    for (const action of ['HERO_DRAFT_CREATE', 'HERO_DRAFT_UPDATE', 'HERO_PUBLISH', 'HERO_REORDER', 'HERO_DRAFT_DISCARD']) {
      expect(actions.has(action), action).toBe(true);
    }
  });

  test('le réglage « nombre de cartes » borne l’aperçu comme le visiteur', async () => {
    const settings = await admin.put('/api/admin/hero-carousel-settings').set('x-csrf-token', csrf)
      .send({ enabled: true, maxCards: 1, autoplay: false, autoplayIntervalMs: 5000, transitionMs: 300, paginationVisible: true });
    expect(settings.status).toBe(200);
    const preview = await admin.get('/api/admin/hero-slides/preview');
    expect(preview.body.data.length).toBe(1);
    expect((await publicCards()).length).toBe(1);
    await admin.put('/api/admin/hero-carousel-settings').set('x-csrf-token', csrf)
      .send({ enabled: true, maxCards: 6, autoplay: false, autoplayIntervalMs: 5000, transitionMs: 300, paginationVisible: true });
  });
});
