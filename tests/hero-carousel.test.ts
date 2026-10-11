/**
 * Carrousel Hero — contrat API + validation + palette adaptative.
 *
 * Couvre: contrat fermé des destinations, fenêtre de publication, limite
 * `max_cards`, fond manuel vs palette extraite, télémétrie impression/clic,
 * réglages admin, et les refus (destination invalide, non-autorisé).
 * La base est en mémoire (vitest) — aucun effet de bord externe.
 */
import { afterAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { app, db } from '../src/server';
import {
  HERO_DESTINATION_TYPES, heroDestinationHref, isValidExternalUrl,
} from '../shared/heroDestinations';
import {
  backgroundFromEdge, extractHeroPalette, hexToRgb, isCurrentPalette, isHexColor, PALETTE_VERSION,
  parseHeroPalette, refreshHeroSlidePalette, relativeLuminance, rgbToHex, softBackgroundFromDominant,
} from '../src/services/heroPalette';

/* ── Contrat de destinations (pur) ────────────────────────────────────────── */

describe('heroDestinationHref — contrat fermé', () => {
  test('les types sans valeur résolvent vers leur route', () => {
    expect(heroDestinationHref('CAMPAIGN', '')).toBe('/promotions');
    expect(heroDestinationHref('LENS', '')).toBe('/lens');
    expect(heroDestinationHref('AYWEBS', '')).toBe('/aywebs');
    expect(heroDestinationHref('NEWS', '')).toBe('/news');
  });

  test('COLLECTION/PRODUCT exigent une valeur et la résolvent', () => {
    expect(heroDestinationHref('COLLECTION', '')).toBeNull();
    expect(heroDestinationHref('COLLECTION', 'arr_08')).toBe('/catalog?arrivalId=arr_08');
    expect(heroDestinationHref('PRODUCT', '')).toBeNull();
    expect(heroDestinationHref('PRODUCT', 'prod_1')).toBe('/product/prod_1');
  });

  test('type inconnu ou valeur invalide ⇒ null (jamais de lien mort)', () => {
    expect(heroDestinationHref('INVENTED', 'x')).toBeNull();
    expect(heroDestinationHref('', '')).toBeNull();
    expect(heroDestinationHref('EXTERNAL', 'javascript:alert(1)')).toBeNull();
    expect(heroDestinationHref('EXTERNAL', 'https://ayrovi.tn/promo')).toBe('https://ayrovi.tn/promo');
  });

  test('la liste des types est stable et fermée', () => {
    expect(HERO_DESTINATION_TYPES).toContain('CAMPAIGN');
    expect(HERO_DESTINATION_TYPES).toContain('LENS');
    expect(HERO_DESTINATION_TYPES).not.toContain('SEARCH'); // pas de route recherche ⇒ pas de type
    expect(isValidExternalUrl('https://example.com')).toBe(true);
    expect(isValidExternalUrl('ftp://example.com')).toBe(false);
  });
});

/* ── Math couleur (pur) ───────────────────────────────────────────────────── */

describe('heroPalette — math couleur', () => {
  test('hex ⇄ rgb aller-retour', () => {
    expect(hexToRgb('#FF6900')).toEqual({ r: 255, g: 105, b: 0 });
    expect(rgbToHex(255, 105, 0)).toBe('#ff6900');
    expect(hexToRgb('pas-une-couleur')).toBeNull();
  });

  test('le fond doux est un pastel clair, dérivé de la dominante', () => {
    const soft = softBackgroundFromDominant('#FF0000');
    expect(isHexColor(soft)).toBe(true);
    const rgb = hexToRgb(soft);
    expect(rgb).not.toBeNull();
    // clarté ~0.93 ⇒ luminance élevée, teinte conservée (rouge dominant)
    const luminance = (0.2126 * rgb!.r + 0.7152 * rgb!.g + 0.0722 * rgb!.b) / 255;
    expect(luminance).toBeGreaterThan(0.8);
    expect(rgb!.r).toBeGreaterThan(rgb!.g);
  });

  test('une dominante invalide ⇒ repli neutre', () => {
    expect(softBackgroundFromDominant('nope')).toBe('#F4F1EC');
  });

  test('parseHeroPalette tolère n’importe quoi', () => {
    expect(parseHeroPalette('{"dominant":"#ff0000","background":"#f9e2e2","luminance":0.5}'))
      .toEqual({ dominant: '#ff0000', background: '#f9e2e2', luminance: 0.5 });
    expect(parseHeroPalette('garbage')).toBeNull();
    expect(parseHeroPalette('{"background":"#fff"}')).toBeNull(); // sans dominante
    // background absent ⇒ dérivé de la dominante
    expect(parseHeroPalette('{"dominant":"#ff0000"}')?.background).toBe(softBackgroundFromDominant('#ff0000'));
  });

  test('fond = couleur de la BORDURE supérieure, pas de la moyenne (v2)', async () => {
    // Haut rouge (2 premières lignes sur 10), reste bleu : la moyenne serait bleue.
    const blue = await sharp({ create: { width: 40, height: 50, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .png().toBuffer();
    const topRed = await sharp({ create: { width: 40, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .png().toBuffer();
    const image = await sharp(blue).composite([{ input: topRed, top: 0, left: 0 }]).png().toBuffer();
    const palette = await extractHeroPalette(image);
    expect(palette!.version).toBe(PALETTE_VERSION);
    const bg = hexToRgb(palette!.background)!;
    expect(bg.r).toBeGreaterThan(bg.b); // la teinte suit la bordure rouge
    expect(palette!.dominant).not.toBe(palette!.background);
  });

  test('fond sombre éclairci pour rester lisible avec l’encre noire', () => {
    const dark = hexToRgb(backgroundFromEdge('#0A1F5C'))!;
    expect(relativeLuminance(dark)).toBeGreaterThanOrEqual(0.18);
  });

  test('palette v1 (sans version) ⇒ à recalculer ; v2 ⇒ à jour', () => {
    expect(isCurrentPalette('{"dominant":"#ff0000","background":"#f9e2e2","luminance":0.5}')).toBe(false);
    expect(isCurrentPalette(JSON.stringify({ dominant: '#ff0000', background: '#ff0000', luminance: 0.2, version: PALETTE_VERSION }))).toBe(true);
    expect(isCurrentPalette('')).toBe(false);
  });

  test('extraction réelle (sharp) sur une image unie', async () => {
    const png = await sharp({ create: { width: 40, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .png().toBuffer();
    const palette = await extractHeroPalette(png);
    expect(palette?.dominant).toBe('#ff0000');
    expect(isHexColor(palette!.background)).toBe(true);
    // luminance du rouge pur = 0.2126 (Rec. 709) — sombre, pas clair
    expect(palette!.luminance).toBe(0.21);
  });
});

/* ── API publique + admin ─────────────────────────────────────────────────── */

describe('API carrousel Hero', () => {
  const admin = request.agent(app);
  let csrf = '';
  const createdSlides: string[] = [];
  let testArrivalId = '';
  const paletteFile = path.resolve(process.cwd(), 'data/uploads/hero-test-palette.png');

  afterAll(async () => {
    for (const id of createdSlides) db.run('DELETE FROM hero_slides WHERE id=?', id);
    if (testArrivalId) db.run('DELETE FROM arrivals WHERE id=?', testArrivalId);
    db.run('DELETE FROM hero_events WHERE card_id LIKE ?', 'hero_test_%');
    db.run(`UPDATE hero_carousel_settings SET enabled=1,max_cards=6,autoplay=0,autoplay_interval_ms=5000,transition_ms=300,pagination_visible=1 WHERE id='global'`);
    fs.rmSync(paletteFile, { force: true });
  });

  test('réglages publics: défauts coherents', async () => {
    const res = await request(app).get('/api/public/hero-carousel-settings');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      enabled: true, maxCards: 6, autoplay: false,
      autoplayIntervalMs: 5000, transitionMs: 300, paginationVisible: true,
    });
  });

  test('télémétrie: impression enregistrée, événement invalide ignoré (toujours 200)', async () => {
    const before = db.get<any>('SELECT COUNT(*) count FROM hero_events')?.count || 0;
    const ok = await request(app).post('/api/public/hero-events')
      .send({ event: 'impression', cardId: 'hero_test_1', destinationType: 'CAMPAIGN', locale: 'fr' });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/public/hero-events').send({ event: 'hack', cardId: 'hero_test_1' });
    expect(bad.status).toBe(200);
    const after = db.get<any>('SELECT COUNT(*) count FROM hero_events')?.count || 0;
    expect(after).toBe(before + 1);
    const row = db.get<any>("SELECT * FROM hero_events WHERE card_id='hero_test_1'");
    expect(row.event).toBe('impression');
    expect(row.session).toHaveLength(32); // empreinte HMAC, pas de donnée perso
  });

  test('création admin sans session ⇒ refusée', async () => {
    const res = await request(app).post('/api/admin/hero-slides')
      .send({ image: '/media/hero-default.jpg', title: 'X', destinationType: 'CAMPAIGN' });
    expect(res.status).toBe(401);
  });

  test('login admin + csrf', async () => {
    const login = await admin.post('/api/admin/auth/login')
      .send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    csrf = login.body.data.csrfToken;
    expect(csrf).toBeTruthy();
  });

  test('destination invalide ⇒ 400 (type inconnu, cible absente, URL externe invalide)', async () => {
    const badType = await admin.post('/api/admin/hero-slides').set('x-csrf-token', csrf)
      .send({ image: '/media/hero-default.jpg', title: 'X', destination_type: 'INVENTED' });
    expect(badType.status).toBe(400);

    const badCollection = await admin.post('/api/admin/hero-slides').set('x-csrf-token', csrf)
      .send({ image: '/media/hero-default.jpg', title: 'X', destination_type: 'COLLECTION', destination_value: 'nope' });
    expect(badCollection.status).toBe(400);

    const badExternal = await admin.post('/api/admin/hero-slides').set('x-csrf-token', csrf)
      .send({ image: '/media/hero-default.jpg', title: 'X', destination_type: 'EXTERNAL', destination_value: 'javascript:alert(1)' });
    expect(badExternal.status).toBe(400);

    const badColor = await admin.post('/api/admin/hero-slides').set('x-csrf-token', csrf)
      .send({ image: '/media/hero-default.jpg', title: 'X', destination_type: 'CAMPAIGN', bg_mode: 'manual', bg_color: 'rouge' });
    expect(badColor.status).toBe(400);
  });

  test('création valide (CAMPAIGN) puis publication publique avec href', async () => {
    const created = await admin.post('/api/admin/hero-slides').set('x-csrf-token', csrf)
      .send({
        image: '/media/hero-default.jpg', title: 'Test FR', title_ar: 'Test AR',
        subtitle: 'sous-titre', cta: 'Voir', cta_ar: 'شوف',
        destination_type: 'CAMPAIGN', display_order: 900, active: true,
      });
    expect(created.status).toBe(201);
    createdSlides.push(created.body.data.id);

    const pub = await request(app).get('/api/public/hero-slides');
    expect(pub.status).toBe(200);
    const card = pub.body.data.find((row: any) => row.id === created.body.data.id);
    expect(card).toBeTruthy();
    expect(card.href).toBe('/promotions');
    expect(card.title).toBe('Test FR');
    expect(card.titleAr).toBe('Test AR');
    expect(card.destinationType).toBe('CAMPAIGN');
  });

  test('COLLECTION valide (arrivage existant) ⇒ href catalog', async () => {
    const arrival = await admin.post('/api/admin/arrivals').set('x-csrf-token', csrf)
      .send({ name: 'Arrivage test hero', type: 'STANDARD', expected_arrival_at: new Date(Date.now() + 86_400_000).toISOString(), status: 'ACTIVE' });
    expect(arrival.status).toBe(201);
    testArrivalId = arrival.body.data.id;

    const created = await admin.post('/api/admin/hero-slides').set('x-csrf-token', csrf)
      .send({ image: '/media/hero-default.jpg', title: 'Coll', destination_type: 'COLLECTION', destination_value: testArrivalId, display_order: 901, active: true });
    expect(created.status).toBe(201);
    createdSlides.push(created.body.data.id);

    const pub = await request(app).get('/api/public/hero-slides');
    const card = pub.body.data.find((row: any) => row.id === created.body.data.id);
    expect(card?.href).toBe(`/catalog?arrivalId=${testArrivalId}`);
  });

  test('fenêtre de publication: future ⇒ cachée, passée ⇒ cachée', async () => {
    const future = await admin.post('/api/admin/hero-slides').set('x-csrf-token', csrf)
      .send({ image: '/media/hero-default.jpg', title: 'Future', destination_type: 'CAMPAIGN', display_order: 902, active: true,
        published_from: new Date(Date.now() + 86_400_000).toISOString() });
    expect(future.status).toBe(201);
    createdSlides.push(future.body.data.id);

    const past = await admin.post('/api/admin/hero-slides').set('x-csrf-token', csrf)
      .send({ image: '/media/hero-default.jpg', title: 'Past', destination_type: 'CAMPAIGN', display_order: 903, active: true,
        published_to: new Date(Date.now() - 86_400_000).toISOString() });
    expect(past.status).toBe(201);
    createdSlides.push(past.body.data.id);

    const pub = await request(app).get('/api/public/hero-slides');
    const ids = pub.body.data.map((row: any) => row.id);
    expect(ids).not.toContain(future.body.data.id);
    expect(ids).not.toContain(past.body.data.id);
  });

  test('désactivée ⇒ retirée du public', async () => {
    const created = await admin.post('/api/admin/hero-slides').set('x-csrf-token', csrf)
      .send({ image: '/media/hero-default.jpg', title: 'Off', destination_type: 'CAMPAIGN', display_order: 904, active: true });
    expect(created.status).toBe(201);
    createdSlides.push(created.body.data.id);
    const off = await admin.put(`/api/admin/hero-slides/${created.body.data.id}`).set('x-csrf-token', csrf).send({ active: false });
    expect(off.status).toBe(200);
    const pub = await request(app).get('/api/public/hero-slides');
    expect(pub.body.data.map((row: any) => row.id)).not.toContain(created.body.data.id);
  });

  test('fond manuel prioritaire sur la palette; max_cards limite la liste', async () => {
    const first = await admin.post('/api/admin/hero-slides').set('x-csrf-token', csrf)
      .send({ image: '/media/hero-default.jpg', title: 'A', destination_type: 'CAMPAIGN', display_order: 905, active: true });
    createdSlides.push(first.body.data.id);
    const second = await admin.post('/api/admin/hero-slides').set('x-csrf-token', csrf)
      .send({ image: '/media/hero-default.jpg', title: 'B', destination_type: 'CAMPAIGN', display_order: 906, active: true,
        bg_mode: 'manual', bg_color: '#AABBCC' });
    createdSlides.push(second.body.data.id);

    let pub = await request(app).get('/api/public/hero-slides');
    const manual = pub.body.data.find((row: any) => row.id === second.body.data.id);
    expect(manual.background).toBe('#AABBCC');

    const settings = await admin.put('/api/admin/hero-carousel-settings').set('x-csrf-token', csrf)
      .send({ maxCards: 1, autoplay: true, autoplayIntervalMs: 4000, transitionMs: 250, paginationVisible: false, enabled: true });
    expect(settings.status).toBe(200);
    pub = await request(app).get('/api/public/hero-slides');
    expect(pub.body.data.length).toBeLessThanOrEqual(1);
    const pubSettings = await request(app).get('/api/public/hero-carousel-settings');
    expect(pubSettings.body.data).toMatchObject({ maxCards: 1, autoplay: true, autoplayIntervalMs: 4000, transitionMs: 250, paginationVisible: false });
  });

  test('palette extraite au upload ⇒ fond adaptatif servi (recalcul manuel déterministe)', async () => {
    // le test précédent a réduit max_cards à 1 — on remet une limite haute
    db.run("UPDATE hero_carousel_settings SET max_cards=12 WHERE id='global'");
    fs.mkdirSync(path.dirname(paletteFile), { recursive: true });
    const png = await sharp({ create: { width: 40, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
    fs.writeFileSync(paletteFile, png);

    const created = await admin.post('/api/admin/hero-slides').set('x-csrf-token', csrf)
      .send({ image: '/uploads/hero-test-palette.png', title: 'Palette', destination_type: 'CAMPAIGN', display_order: 907, active: true });
    expect(created.status).toBe(201);
    createdSlides.push(created.body.data.id);

    await refreshHeroSlidePalette(db, { id: created.body.data.id, image: '/uploads/hero-test-palette.png' });
    const row = db.get<any>('SELECT palette FROM hero_slides WHERE id=?', created.body.data.id);
    const palette = JSON.parse(row.palette);
    expect(palette.dominant).toBe('#ff0000');

    const pub = await request(app).get('/api/public/hero-slides');
    const card = pub.body.data.find((item: any) => item.id === created.body.data.id);
    expect(card.background).toBe(palette.background);
    expect(card.dominant).toBe('#ff0000');
  });
});
