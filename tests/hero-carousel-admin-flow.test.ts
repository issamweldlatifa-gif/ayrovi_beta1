/**
 * Carrousel Hero — verrou E2E du flux d’administration.
 *
 * Le scénario est celui que l’opérateur exécute dans l’Admin : upload d’un
 * visuel 4:5, création d’une carte (destination typée), activation, lecture
 * publique, télémétrie. Il vérifie l’intégration de bout en bout — y compris
 * le recalcul fire-and-forget de la palette (sharp) déclenché à la sauvegarde.
 *
 * La base est en mémoire (vitest) ; les artefacts disque sont supprimés en afterAll.
 */
import { afterAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { app, db } from '../src/server';

describe('carrousel Hero — flux Admin de bout en bout', () => {
  const admin = request.agent(app);
  const uploadedFiles: string[] = [];
  const createdSlides: string[] = [];

  afterAll(() => {
    for (const id of createdSlides) {
      db.run('DELETE FROM hero_events WHERE card_id=?', id);
      db.run('DELETE FROM hero_slides WHERE id=?', id);
    }
    db.run(`UPDATE hero_carousel_settings SET enabled=1,max_cards=6,autoplay=0,autoplay_interval_ms=5000,transition_ms=300,pagination_visible=1 WHERE id='global'`);
    for (const file of uploadedFiles) fs.rmSync(file, { force: true });
  });

  test('upload → carte → palette → activation → publication → télémétrie', async () => {
    // 1) session admin
    const login = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    const auth = { 'x-csrf-token': login.body.data.csrfToken as string };

    // 2) réglages : lecture + sauvegarde
    const settings = await admin.get('/api/admin/hero-carousel-settings');
    expect(settings.status).toBe(200);
    expect(settings.body.data).toMatchObject({ enabled: true, maxCards: 6, autoplay: false, paginationVisible: true });
    const put = await admin.put('/api/admin/hero-carousel-settings').set(auth)
      .send({ enabled: true, maxCards: 6, autoplay: false, autoplayIntervalMs: 5000, transitionMs: 300, paginationVisible: true });
    expect(put.status).toBe(200);
    expect(put.body.data.enabled).toBe(true);

    // 3) upload d’un visuel 4:5 (généré : 800×1000, rouge vif)
    const jpeg = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#C0182B' } }).jpeg().toBuffer();
    const upload = await admin.post('/api/admin/uploads').set(auth)
      .send({ dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` });
    expect(upload.status).toBe(201);
    expect(upload.body.data.url).toMatch(/^\/uploads\/.+/);
    uploadedFiles.push(path.resolve(process.cwd(), 'data', 'uploads', upload.body.data.filename as string));

    // 4) création de la carte (inactive, destination typée sur un arrivage seedé)
    const created = await admin.post('/api/admin/hero-slides').set(auth).send({
      image: upload.body.data.url, video: '',
      title: 'Carte E2E FR', title_ar: 'بطاقة E2E',
      subtitle: '', subtitle_ar: '', cta: 'Découvrir', cta_ar: 'اكتشف',
      target_url: '', destination_type: 'COLLECTION', destination_value: 'arrival_08',
      bg_mode: 'auto', bg_color: '', display_order: 950, active: false,
      published_from: '', published_to: '',
    });
    expect(created.status).toBe(201);
    const cardId = created.body.data.id as string;
    createdSlides.push(cardId);

    // 5) la palette est recalculée en fire-and-forget à la sauvegarde : attendre
    let palette = '';
    for (let attempt = 0; attempt < 50 && !palette; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const row = await admin.get(`/api/admin/hero-slides/${cardId}`);
      palette = String(row.body.data?.palette || '');
    }
    expect(palette, 'palette extraite après sauvegarde').toBeTruthy();
    const parsed = JSON.parse(palette) as { dominant: string; background: string; luminance: number };
    expect(parsed.dominant).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(parsed.background).toMatch(/^#[0-9a-fA-F]{6}$/);

    // 6) activation → la carte est publiée (fond = palette, href = destination)
    const activated = await admin.put(`/api/admin/hero-slides/${cardId}`).set(auth).send({ active: true });
    expect(activated.status).toBe(200);
    const published = await request(app).get('/api/public/hero-slides');
    expect(published.status).toBe(200);
    const card = published.body.data.find((entry: { id: string }) => entry.id === cardId);
    expect(card).toBeTruthy();
    expect(card.href).toBe('/catalog?arrivalId=arrival_08');
    expect(card.title).toBe('Carte E2E FR');
    expect(card.titleAr).toBe('بطاقة E2E');
    expect(card.background).toBe(parsed.background);

    // 7) télémétrie : impression + clic (toujours 200)
    for (const event of ['impression', 'click']) {
      const res = await request(app).post('/api/public/hero-events').send({ event, cardId });
      expect(res.status).toBe(200);
    }
  }, 30000);
});
