/**
 * Section « à la une » de l'accueil mobile — règles serveur.
 *
 *  • une publication sort vers l'application seulement si elle est PUBLIÉE et sa date atteinte ;
 *  • « la plus récente » prend la plus récente publiée ; « choisie » prend celle de l'admin ;
 *  • une publication choisie qui n'est plus publiée ⇒ rien (jamais une autre à sa place) ;
 *  • la validation refuse une source inconnue, ou « choisie » sans publication ;
 *  • l'API publique ne renvoie que la liste blanche (pas de statut, pas de notes) ;
 *  • l'admin écrit, et la route publique suit immédiatement.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import {
  DEFAULT_FEATURED_SETTINGS, normalizeFeaturedInput, resolveFeaturedPublication, type FeaturedCandidate,
} from '../src/services/homeFeatured';

const NOW = Date.parse('2026-10-10T12:00:00Z');

const row = (id: string, status: string, publishAt: string, extra: Partial<FeaturedCandidate> = {}): FeaturedCandidate => ({
  id, title: `Titre ${id}`, subtitle: `Sous ${id}`, image_url: `/m/${id}.jpg`, publish_at: publishAt, status, ...extra,
});

describe('resolveFeaturedPublication — règle pure', () => {
  test('« la plus récente » prend la plus récente publiée, quel que soit l’ordre', () => {
    const rows = [
      row('old', 'publie', '2026-09-01T10:00:00Z'),
      row('new', 'publie', '2026-10-08T09:00:00Z'),
    ];
    expect(resolveFeaturedPublication({ ...DEFAULT_FEATURED_SETTINGS }, rows, NOW)?.id).toBe('new');
    expect(resolveFeaturedPublication({ ...DEFAULT_FEATURED_SETTINGS }, [...rows].reverse(), NOW)?.id).toBe('new');
  });

  test('un brouillon, une archive, ou une date future ne sortent jamais', () => {
    const rows = [
      row('brouillon', 'brouillon', '2026-10-09T09:00:00Z'),
      row('archive', 'archive', '2026-10-09T09:00:00Z'),
      row('programmee', 'publie', '2026-12-01T09:00:00Z'),
      row('ok', 'publie', '2026-09-01T09:00:00Z'),
    ];
    expect(resolveFeaturedPublication({ ...DEFAULT_FEATURED_SETTINGS }, rows, NOW)?.id).toBe('ok');
  });

  test('une date illisible ne sort pas comme « la plus récente »', () => {
    const rows = [row('casse', 'publie', 'n’importe quoi'), row('ok', 'publie', '2026-09-01T09:00:00Z')];
    expect(resolveFeaturedPublication({ ...DEFAULT_FEATURED_SETTINGS }, rows, NOW)?.id).toBe('ok');
  });

  test('« choisie » renvoie exactement celle de l’admin', () => {
    const rows = [row('a', 'publie', '2026-10-08T09:00:00Z'), row('b', 'publie', '2026-09-01T09:00:00Z')];
    const settings = { ...DEFAULT_FEATURED_SETTINGS, source: 'pinned' as const, publicationId: 'b' };
    expect(resolveFeaturedPublication(settings, rows, NOW)?.id).toBe('b');
  });

  test('« choisie » dont la publication n’est plus publiée ⇒ rien, pas une autre à sa place', () => {
    const rows = [row('a', 'publie', '2026-10-08T09:00:00Z'), row('b', 'archive', '2026-09-01T09:00:00Z')];
    const settings = { ...DEFAULT_FEATURED_SETTINGS, source: 'pinned' as const, publicationId: 'b' };
    expect(resolveFeaturedPublication(settings, rows, NOW)).toBeNull();
  });

  test('section masquée ⇒ rien, même avec des publications', () => {
    const rows = [row('a', 'publie', '2026-10-08T09:00:00Z')];
    expect(resolveFeaturedPublication({ ...DEFAULT_FEATURED_SETTINGS, enabled: false }, rows, NOW)).toBeNull();
  });

  test('la sortie publique est une liste blanche : pas de statut ni de date interne', () => {
    const out = resolveFeaturedPublication({ ...DEFAULT_FEATURED_SETTINGS }, [row('a', 'publie', '2026-10-08T09:00:00Z')], NOW);
    expect(Object.keys(out ?? {}).sort()).toEqual(['id', 'imageUrl', 'subtitle', 'title']);
  });
});

describe('normalizeFeaturedInput — validation admin', () => {
  test('une source inconnue est refusée', () => {
    expect(normalizeFeaturedInput({ source: 'random' }, DEFAULT_FEATURED_SETTINGS)).toBeNull();
  });

  test('« choisie » sans publication est refusée', () => {
    expect(normalizeFeaturedInput({ source: 'pinned', publicationId: '  ' }, DEFAULT_FEATURED_SETTINGS)).toBeNull();
  });

  test('« la plus récente » efface l’identifiant choisi, et le libellé est borné à 40 caractères', () => {
    const next = normalizeFeaturedInput({ source: 'latest', publicationId: 'x', ctaLabel: 'y'.repeat(80) }, DEFAULT_FEATURED_SETTINGS);
    expect(next).toEqual({ enabled: true, source: 'latest', publicationId: '', ctaLabel: 'y'.repeat(40) });
  });

  test('un champ absent garde la valeur existante', () => {
    const existing = { enabled: false, source: 'pinned' as const, publicationId: 'p1', ctaLabel: 'Lire' };
    expect(normalizeFeaturedInput({}, existing)).toEqual(existing);
  });
});

describe('route admin + publique /home-featured', () => {
  const admin = request.agent(app);
  let csrf = '';

  beforeAll(async () => {
    const login = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    csrf = login.body.data.csrfToken;
    // Deux publications : une publiée, une brouillon.
    db.run("INSERT OR REPLACE INTO story_publishers (id,slug,name,created_at,updated_at) VALUES ('hf_channel','hf-channel','Canal HF',?,?)",
      new Date().toISOString(), new Date().toISOString());
    db.run("INSERT OR REPLACE INTO publications (id,title,subtitle,channel_id,image_url,remark,publish_at,status,created_at,updated_at) VALUES ('hf_live','Numéro en ligne','Sous-titre','hf_channel','/m/live.jpg','note interne','2026-10-08T09:00:00Z','publie',?,?)",
      new Date().toISOString(), new Date().toISOString());
    db.run("INSERT OR REPLACE INTO publications (id,title,subtitle,channel_id,image_url,remark,publish_at,status,created_at,updated_at) VALUES ('hf_draft','Brouillon secret','','hf_channel','/m/draft.jpg','','2026-10-09T09:00:00Z','brouillon',?,?)",
      new Date().toISOString(), new Date().toISOString());
  });

  afterAll(() => {
    db.run("DELETE FROM publications WHERE id IN ('hf_live','hf_draft')");
    db.run("DELETE FROM story_publishers WHERE id='hf_channel'");
    db.run("UPDATE home_featured_settings SET enabled=1,source='latest',publication_id='',cta_label='' WHERE id='global'");
  });

  test('par défaut, la plus récente publiée sort ; le brouillon n’apparaît jamais', async () => {
    // Attendu = la plus récente publiée EN BASE (la base de démo contient d'autres publications).
    const expected = db.get<any>(
      "SELECT id FROM publications WHERE status='publie' AND publish_at<=? ORDER BY publish_at DESC LIMIT 1",
      new Date().toISOString(),
    );
    const res = await request(app).get('/api/public/home-featured');
    expect(res.status).toBe(200);
    expect(res.body.data.publication?.id).toBe(expected?.id);
    expect(res.body.data.publication?.id).not.toBe('hf_draft');
    expect(JSON.stringify(res.body)).not.toMatch(/Brouillon secret|note interne/);
  });

  test('l’admin choisit une publication, le libellé change, puis la section est masquée', async () => {
    const put = await admin.put('/api/admin/home-featured').set('x-csrf-token', csrf)
      .send({ enabled: true, source: 'pinned', publicationId: 'hf_live', ctaLabel: 'Lire le numéro' });
    expect(put.status).toBe(200);
    expect(put.body.data.preview?.id).toBe('hf_live');

    const pub = await request(app).get('/api/public/home-featured');
    expect(pub.body.data.publication?.id).toBe('hf_live');
    expect(pub.body.data.ctaLabel).toBe('Lire le numéro');

    const off = await admin.put('/api/admin/home-featured').set('x-csrf-token', csrf).send({ enabled: false });
    expect(off.status).toBe(200);
    const hidden = await request(app).get('/api/public/home-featured');
    expect(hidden.body.data.publication).toBeNull();
  });

  test('une source « choisie » sans publication, ou une publication inconnue, est refusée', async () => {
    const missing = await admin.put('/api/admin/home-featured').set('x-csrf-token', csrf).send({ source: 'pinned', publicationId: '' });
    expect(missing.status).toBe(400);
    const unknown = await admin.put('/api/admin/home-featured').set('x-csrf-token', csrf).send({ source: 'pinned', publicationId: 'nope' });
    expect(unknown.status).toBe(400);
  });

  test('un brouillon choisi par l’admin n’atteint pas l’application', async () => {
    const put = await admin.put('/api/admin/home-featured').set('x-csrf-token', csrf)
      .send({ enabled: true, source: 'pinned', publicationId: 'hf_draft' });
    expect(put.status).toBe(200);
    const pub = await request(app).get('/api/public/home-featured');
    expect(pub.body.data.publication).toBeNull();
  });

  test('sans session admin, impossible d’écrire', async () => {
    const res = await request(app).put('/api/admin/home-featured').send({ enabled: false });
    expect([401, 403]).toContain(res.status);
  });
});
