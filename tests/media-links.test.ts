/**
 * Liens médias de l'Admin (Stories, Reels, Publications).
 *  • règle partagée (shared/mediaLinks.ts) : fichier direct, lecteur Cloudinary converti, pages refusées ;
 *  • parcours serveur : un lien acceptable est enregistré tel quel ou converti ; un lien refusé donne 400
 *    MEDIA_URL_INVALID et n'est jamais publié ; les anciennes lignes ne sont pas re-validées à l'édition.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { normalizeMediaLink } from '../shared/mediaLinks';

const CLOUDINARY_EMBED = 'https://player.cloudinary.com/embed/?cloud_name=hmdx5ahn&public_id=nike_calling_all_runners_1080p';

describe('règle des liens médias (partagée admin / serveur)', () => {
  test('lecteur Cloudinary → fichier mp4 direct, lisible par l’application', () => {
    expect(normalizeMediaLink(CLOUDINARY_EMBED, 'video')).toEqual({
      ok: true, converted: true,
      url: 'https://res.cloudinary.com/hmdx5ahn/video/upload/nike_calling_all_runners_1080p.mp4',
    });
  });

  test('dossier Cloudinary conservé, extension existante respectée', () => {
    const r = normalizeMediaLink('https://player.cloudinary.com/embed/?cloud_name=demo&public_id=stories/ete%202026.webm', 'video');
    expect(r).toEqual({ ok: true, converted: true, url: 'https://res.cloudinary.com/demo/video/upload/stories/ete%202026.webm' });
  });

  test('fichier vidéo https direct, de n’importe quel hôte : accepté tel quel', () => {
    const url = 'https://cdn.exemple.tn/videos/collection-ete.mp4';
    expect(normalizeMediaLink(url, 'video')).toEqual({ ok: true, converted: false, url });
  });

  test('chemin local de l’application : accepté sans conversion', () => {
    expect(normalizeMediaLink('/media/hero-femme.jpg', 'image')).toEqual({ ok: true, converted: false, url: '/media/hero-femme.jpg' });
    expect(normalizeMediaLink('/uploads/1-a.webp', 'image')).toEqual({ ok: true, converted: false, url: '/uploads/1-a.webp' });
  });

  test('image : toute adresse https, même sans extension (CDN)', () => {
    const url = 'https://images.exemple.com/photo/123456';
    expect(normalizeMediaLink(url, 'image')).toEqual({ ok: true, converted: false, url });
  });

  test('page YouTube / Vimeo / réseau social refusée comme vidéo, avec explication', () => {
    for (const page of ['https://www.youtube.com/watch?v=abc123', 'https://youtu.be/abc123', 'https://vimeo.com/123456789', 'https://www.instagram.com/reel/xyz/']) {
      const r = normalizeMediaLink(page, 'video');
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.error).toMatch(/page|fichier vidéo/);
    }
  });

  test('lien vidéo sans extension de fichier refusé (ex. lien d’image ou de page)', () => {
    expect(normalizeMediaLink('https://exemple.com/video/123', 'video').ok).toBe(false);
    expect(normalizeMediaLink('https://res.cloudinary.com/demo/video/upload/clip', 'video').ok).toBe(false);
  });

  test('lecteur Cloudinary utilisé comme image : refusé', () => {
    expect(normalizeMediaLink(CLOUDINARY_EMBED, 'image').ok).toBe(false);
  });

  test('http, javascript:, données et lien incomplet : refusés', () => {
    expect(normalizeMediaLink('http://exemple.com/a.mp4', 'video').ok).toBe(false);
    expect(normalizeMediaLink('javascript:alert(1)', 'image').ok).toBe(false);
    expect(normalizeMediaLink('data:image/png;base64,AAAA', 'image').ok).toBe(false);
    expect(normalizeMediaLink('pas une url', 'image').ok).toBe(false);
    expect(normalizeMediaLink('https://player.cloudinary.com/embed/?cloud_name=demo', 'video').ok).toBe(false);
    expect(normalizeMediaLink('//exemple.com/a.mp4', 'video').ok).toBe(false);
  });

  test('vide : accepté (le champ obligatoire est vérifié ailleurs)', () => {
    expect(normalizeMediaLink('   ', 'video')).toEqual({ ok: true, converted: false, url: '' });
  });
});

describe('parcours serveur — enregistrement des liens médias', () => {
  const admin = request.agent(app);
  let csrf = '';
  const CHANNEL = 'story_pub_media_links_test';
  const PAST = '2026-01-01T00:00:00.000Z';

  beforeAll(async () => {
    const login = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    csrf = login.body.data.csrfToken;
    const now = new Date().toISOString();
    db.run(`INSERT OR REPLACE INTO story_publishers (id,slug,name,subtitle,avatar,official,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`, CHANNEL, 'media-links-test', 'AYROVI', '', '', 1, now, now);
  });

  afterAll(() => {
    db.run('DELETE FROM reels WHERE channel_id=?', CHANNEL);
    db.run('DELETE FROM publications WHERE channel_id=?', CHANNEL);
  });

  test('Reel : lecteur Cloudinary enregistré en fichier direct', async () => {
    const res = await admin.post('/api/admin/reels').set('x-csrf-token', csrf).send({
      title: 'Reel Cloudinary', channel_id: CHANNEL, video_url: CLOUDINARY_EMBED, status: 'publie', publish_at: PAST,
    });
    expect(res.status).toBe(201);
    const row = db.get<any>('SELECT video_url FROM reels WHERE id=?', res.body.data.id);
    expect(row.video_url).toBe('https://res.cloudinary.com/hmdx5ahn/video/upload/nike_calling_all_runners_1080p.mp4');
  });

  test('Reel : page YouTube refusée avec MEDIA_URL_INVALID, rien n’est créé', async () => {
    const before = db.get<any>('SELECT COUNT(*) n FROM reels WHERE channel_id=?', CHANNEL).n;
    const res = await admin.post('/api/admin/reels').set('x-csrf-token', csrf).send({
      title: 'Reel YouTube', channel_id: CHANNEL, video_url: 'https://www.youtube.com/watch?v=abc123', status: 'publie', publish_at: PAST,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MEDIA_URL_INVALID');
    expect(db.get<any>('SELECT COUNT(*) n FROM reels WHERE channel_id=?', CHANNEL).n).toBe(before);
  });

  test('Reel : affiche externe refusée si elle n’est pas https', async () => {
    const res = await admin.post('/api/admin/reels').set('x-csrf-token', csrf).send({
      title: 'Reel affiche', channel_id: CHANNEL, video_url: 'https://cdn.exemple.tn/a.mp4', poster_url: 'http://exemple.com/a.jpg', status: 'publie', publish_at: PAST,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MEDIA_URL_INVALID');
  });

  test('Reel : modification sans nouveau lien vidéo ne re-valide pas l’ancien', async () => {
    const created = await admin.post('/api/admin/reels').set('x-csrf-token', csrf).send({
      title: 'Reel ancien', channel_id: CHANNEL, video_url: 'https://cdn.exemple.tn/old.mp4', status: 'publie', publish_at: PAST,
    });
    expect(created.status).toBe(201);
    const updated = await admin.put(`/api/admin/reels/${created.body.data.id}`).set('x-csrf-token', csrf).send({ title: 'Reel ancien (corrigé)' });
    expect(updated.status).toBe(200);
  });

  test('Publication : image externe https acceptée ; page refusée', async () => {
    const ok = await admin.post('/api/admin/publications').set('x-csrf-token', csrf).send({
      title: 'Publication photo', channel_id: CHANNEL, image_url: 'https://images.exemple.com/photo/42', status: 'publie', publish_at: PAST,
    });
    expect(ok.status).toBe(201);
    const bad = await admin.post('/api/admin/publications').set('x-csrf-token', csrf).send({
      title: 'Publication page', channel_id: CHANNEL, image_url: 'https://www.instagram.com/p/xyz/', status: 'publie', publish_at: PAST,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('MEDIA_URL_INVALID');
  });

  test('Story : vidéo externe refusée si c’est une page ; vidéo fichier acceptée', async () => {
    const bad = await admin.post('/api/admin/stories').set('x-csrf-token', csrf).send({
      category: 'STYLE', media_type: 'VIDEO', media_url: 'https://vimeo.com/123456789', title: 'Story page', publish_at: PAST, status: 'PUBLISHED',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/page|fichier vidéo/);
    const ok = await admin.post('/api/admin/stories').set('x-csrf-token', csrf).send({
      category: 'STYLE', media_type: 'VIDEO', media_url: CLOUDINARY_EMBED, title: 'Story Cloudinary', publish_at: PAST, status: 'PUBLISHED',
    });
    expect(ok.status).toBe(201);
    const row = db.get<any>('SELECT media_url FROM stories WHERE id=?', ok.body.data.id);
    expect(row.media_url).toBe('https://res.cloudinary.com/hmdx5ahn/video/upload/nike_calling_all_runners_1080p.mp4');
  });
});
