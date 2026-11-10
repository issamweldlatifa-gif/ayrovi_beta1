/**
 * « Cover » d'accueil — le nouveau bloc d'entrée (remplace « à la une »).
 *
 *  • contrat partagé : validation CRM et sortie publique (rien si désactivé/vide) ;
 *  • routes : lecture publique, écriture admin authentifiée, médias ordonnés ;
 *  • le bloc ne lit PLUS les publications : ses médias viennent du CRM uniquement.
 */
import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import {
  DEFAULT_COVER_SETTINGS, MAX_COVER_SLIDES, normalizeCoverInput, normalizeCoverSlidesInput, resolveCoverPublic,
} from '../shared/homeCover';

describe('contrat partagé — normalizeCoverSlidesInput', () => {
  test('abandonne les entrées sans URL, tranche les champs et garde l’ordre', () => {
    expect(normalizeCoverSlidesInput([
      { type: 'image', url: '/uploads/a.webp', alt: 'Nouveautés' },
      { type: 'video', url: '', poster: '/uploads/p.jpg' },
      { type: 'video', url: '/uploads/v.mp4', poster: '/uploads/p.jpg', alt: 'Drop' },
      { type: 'autre', url: '/uploads/c.svg' },
    ])).toEqual([
      { id: 'cover-1-image', type: 'image', url: '/uploads/a.webp', poster: '', alt: 'Nouveautés' },
      { id: 'cover-2-video', type: 'video', url: '/uploads/v.mp4', poster: '/uploads/p.jpg', alt: 'Drop' },
      { id: 'cover-3-image', type: 'image', url: '/uploads/c.svg', poster: '', alt: '' },
    ]);
  });

  test('une entrée non-liste est refusée, une absence garde la liste vide', () => {
    expect(normalizeCoverSlidesInput('x')).toBeNull();
    expect(normalizeCoverSlidesInput(undefined)).toEqual([]);
  });

  test('plafond : au-delà de dix médias, le surplus est ignoré', () => {
    const flood = Array.from({ length: MAX_COVER_SLIDES + 5 }, (_, i) => ({ type: 'image', url: `/u/${i}.jpg` }));
    expect(normalizeCoverSlidesInput(flood)).toHaveLength(MAX_COVER_SLIDES);
  });
});

describe('contrat partagé — normalizeCoverInput & sortie publique', () => {
  test('une valeur absente garde l’ancienne ; médias absents = liste inchangée', () => {
    const next = normalizeCoverInput({}, { ...DEFAULT_COVER_SETTINGS, title: 'Nouveautés' });
    expect(next?.settings.title).toBe('Nouveautés');
    expect(next?.settings.destination).toBe('publications');
    expect(next?.slides).toBeNull(); // absents ⇒ on ne remplace rien
    expect(normalizeCoverInput({ destination: 'site-web' }, DEFAULT_COVER_SETTINGS)).toBeNull();
    expect(normalizeCoverInput({ slides: 'x' }, DEFAULT_COVER_SETTINGS)).toBeNull();
  });

  test('la cadence reste dans ses bornes, le « \\n » du titre est conservé', () => {
    const next = normalizeCoverInput({ autoplayIntervalMs: 12, title: 'Nouveautés\nvotre dose' }, DEFAULT_COVER_SETTINGS);
    expect(next?.settings.autoplayIntervalMs).toBe(2000);
    expect(next?.settings.title).toBe('Nouveautés\nvotre dose');
  });

  test('rien ne sort vers l’application si masqué ou sans média', () => {
    expect(resolveCoverPublic({ ...DEFAULT_COVER_SETTINGS, enabled: false }, normalizeCoverSlidesInput([{ type: 'image', url: '/a.jpg' }])!)).toBeNull();
    expect(resolveCoverPublic(DEFAULT_COVER_SETTINGS, [])).toBeNull();
    const shown = resolveCoverPublic(DEFAULT_COVER_SETTINGS, normalizeCoverSlidesInput([{ type: 'image', url: '/a.jpg' }])!);
    expect(shown?.slides).toHaveLength(1);
  });
});

describe('routes /api/public/home-cover et /api/admin/home-cover', () => {
  const admin = request.agent(app);
  let csrf = '';

  // Réinitialisation : les tests ne dépendent jamais d'un état laissé par ailleurs.
  const reset = async () => {
    const saved = await admin.put('/api/admin/home-cover').set('x-csrf-token', csrf).send({
      enabled: false, title: '', ctaLabel: '', destination: 'publications', autoplayIntervalMs: 5000, slides: [],
    });
    expect(saved.status).toBe(200);
  };

  test('super admin authentifié et cover réinitialisée', async () => {
    const login = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    csrf = login.body.data.csrfToken;
    await reset();
  });

  test('écriture admin refusée sans session', async () => {
    expect((await request(app).put('/api/admin/home-cover').send({ enabled: false })).status).toBe(401);
  });

  test('sans média : rien à l’écran, et la réponse publique reste lisible', async () => {
    const pub = await request(app).get('/api/public/home-cover');
    expect(pub.status).toBe(200);
    expect(pub.body.data).toBeNull();
    const view = await admin.get('/api/admin/home-cover');
    expect(view.status).toBe(200);
    expect(view.body.data.slides).toEqual([]);
    expect(view.body.data.enabled).toBe(false);
  });

  test('le CRM publie médias, titre, bouton, destination et cadence — l’application les lit', async () => {
    const saved = await admin.put('/api/admin/home-cover').set('x-csrf-token', csrf).send({
      enabled: true,
      title: 'NOUVEAUTÉS\nVOTRE DOSE HEBDOMADAIRE',
      ctaLabel: 'Je découvre',
      destination: 'promotions',
      autoplayIntervalMs: 4000,
      slides: [
        { type: 'video', url: '/uploads/drop.mp4', poster: '/uploads/drop.jpg', alt: 'Drop vidéo' },
        { type: 'image', url: '/uploads/look.jpg', alt: 'Look de la semaine' },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.slides).toHaveLength(2);
    expect(saved.body.data.slides[0]).toMatchObject({ type: 'video', url: '/uploads/drop.mp4' });

    const pub = await request(app).get('/api/public/home-cover');
    expect(pub.body.data).toMatchObject({
      enabled: true,
      title: 'NOUVEAUTÉS\nVOTRE DOSE HEBDOMADAIRE',
      ctaLabel: 'Je découvre',
      destination: 'promotions',
      autoplayIntervalMs: 4000,
    });
    expect(pub.body.data.slides.map((row: any) => row.url)).toEqual(['/uploads/drop.mp4', '/uploads/look.jpg']);
    // Liste blanche : pas de colonne interne dans la réponse publique.
    expect(pub.body.data.slides[0]).not.toHaveProperty('position');

    // Remplacement complet : une nouvelle liste écrase l’ancienne.
    const second = await admin.put('/api/admin/home-cover').set('x-csrf-token', csrf).send({
      slides: [{ type: 'image', url: '/uploads/only.jpg' }],
    });
    expect(second.status).toBe(200);
    expect((await request(app).get('/api/public/home-cover')).body.data.slides).toHaveLength(1);

    // Masqué ⇒ l’application n’affiche rien, les médias restent en base.
    const hidden = await admin.put('/api/admin/home-cover').set('x-csrf-token', csrf).send({ enabled: false });
    expect(hidden.status).toBe(200);
    expect((await request(app).get('/api/public/home-cover')).body.data).toBeNull();
    expect(hidden.body.data.slides).toHaveLength(1);
    await reset();
  });

  test('destination inconnue et médias non-liste sont refusés (400), sans écrire', async () => {
    const before = await admin.get('/api/admin/home-cover');
    const bad = await admin.put('/api/admin/home-cover').set('x-csrf-token', csrf).send({ destination: 'instagram' });
    expect(bad.status).toBe(400);
    const badSlides = await admin.put('/api/admin/home-cover').set('x-csrf-token', csrf).send({ slides: { url: '/x.jpg' } });
    expect(badSlides.status).toBe(400);
    const after = await admin.get('/api/admin/home-cover');
    expect(after.body.data).toEqual(before.body.data);
  });
});
