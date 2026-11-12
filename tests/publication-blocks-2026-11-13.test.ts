/**
 * BLOCS PUBLICATION (refonte du 13/11/2026) — module partagé, service et routes.
 *
 *  • validation : trois modèles, couleur #RRGGBB (palette complète), média
 *    obligatoire selon le modèle, bornes de produits (duo = exactement un) ;
 *  • couleurs : encre lisible calculée, panneau du conteneur dérivé du bandeau ;
 *  • CRM : création, édition partielle, ordre, suppression — droits et CSRF ;
 *  • lecture publique : blocs actifs seulement, produits non vendables écartés,
 *    éditeur toujours « zayrovi team ».
 */
import request from 'supertest';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  PUBLICATION_BLOCK_SWATCHES,
  containerPanelColor,
  contrastRatio,
  normalizeHexColor,
  normalizePublicationBlockInput,
  readableInk,
} from '../shared/publicationBlocks';
import { officialProductId } from '../src/catalogue/installOfficialCatalogue';

const okLink = (value: unknown) => ({ ok: true as const, url: String(value) });
const P = (key: string) => officialProductId(key);

describe('module partagé', () => {
  test('couleurs : formats acceptés, refus explicite sinon', () => {
    expect(normalizeHexColor('#abc')).toBe('#AABBCC');
    expect(normalizeHexColor('4262ad')).toBe('#4262AD');
    expect(normalizeHexColor('rouge')).toBeNull();
    expect(PUBLICATION_BLOCK_SWATCHES.every((c) => normalizeHexColor(c) === c)).toBe(true);
  });

  test('encre lisible et panneau dérivé', () => {
    expect(readableInk('#111111', '#000000', '#FFFFFF')).toBe('#FFFFFF');
    expect(readableInk('#F2AD11', '#000000', '#FFFFFF')).toBe('#000000');
    for (const swatch of PUBLICATION_BLOCK_SWATCHES) {
      const ink = readableInk(swatch, '#111111', '#FFFFFF');
      expect(contrastRatio(swatch, ink), swatch).toBeGreaterThanOrEqual(4.5);
    }
    // bandeau clair → panneau plus clair ; bandeau soutenu → panneau plus sombre
    expect(containerPanelColor('#F2AD11')).not.toBe('#F2AD11');
    expect(normalizeHexColor(containerPanelColor('#D7263D'))).not.toBeNull();
  });

  test('validation par modèle', () => {
    const base = { title: 'Titre', bg_color: '#4262AD', product_ids: [P('jbl-go-4')] };
    expect(normalizePublicationBlockInput({ ...base, kind: 'inconnu' }, undefined, okLink).ok).toBe(false);
    expect(normalizePublicationBlockInput({ ...base, kind: 'container', bg_color: 'bleu' }, undefined, okLink).ok).toBe(false);
    expect(normalizePublicationBlockInput({ ...base, kind: 'media' }, undefined, okLink).ok).toBe(false); // média manquant
    const pair = normalizePublicationBlockInput(
      { ...base, kind: 'sponsored_pair', media_url: '/media/x.jpg', product_ids: [P('jbl-go-4'), P('bose-quietcomfort')] },
      undefined,
      okLink,
    );
    expect(pair.ok && pair.value.product_ids).toEqual([P('jbl-go-4')]); // duo : un seul produit
    expect(pair.ok && pair.value.sponsored).toBe(true);
    const video = normalizePublicationBlockInput(
      { ...base, kind: 'media', media_type: 'video', media_url: '/media/v.mp4', poster_url: '/media/p.jpg' },
      undefined,
      okLink,
    );
    expect(video.ok && video.value.media_type).toBe('video');
    // mise à jour partielle : un champ absent garde la valeur enregistrée
    const partial = normalizePublicationBlockInput({ title: 'Nouveau' }, video.ok ? video.value : undefined, okLink);
    expect(partial.ok && partial.value).toMatchObject({ title: 'Nouveau', kind: 'media', media_type: 'video' });
  });
});

describe('routes CRM et lecture publique', () => {
  let app: any;
  let admin: ReturnType<typeof request.agent>;
  let csrf = '';

  beforeAll(async () => {
    ({ app } = await import('../src/server'));
    admin = request.agent(app);
    const auth = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    csrf = auth.body.data.csrfToken;
  });

  test('sans session : 401 ; sans CSRF : refus', async () => {
    expect((await request(app).get('/api/admin/publication-blocks')).status).toBe(401);
    expect((await request(app).post('/api/admin/publication-blocks').send({})).status).toBe(401);
    expect((await admin.post('/api/admin/publication-blocks').send({ kind: 'container' })).status).toBe(403);
  });

  test('créer, éditer, ordonner, supprimer — la lecture publique suit', async () => {
    const body = { kind: 'container', title: 'Bloc de test', subtitle: 'Sous-titre', bg_color: '#2E7D5B' };
    const unknown = await admin.post('/api/admin/publication-blocks').set('x-csrf-token', csrf)
      .send({ ...body, product_ids: [P('jbl-go-4'), 'produit_inexistant'] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toContain('produit_inexistant');
    const created = await admin.post('/api/admin/publication-blocks').set('x-csrf-token', csrf)
      .send({ ...body, product_ids: [P('jbl-go-4'), P('bose-quietcomfort')] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.data.id;
    expect(created.body.data.product_ids).toEqual([P('jbl-go-4'), P('bose-quietcomfort')]);

    const invalid = await admin.put(`/api/admin/publication-blocks/${id}`).set('x-csrf-token', csrf).send({ bg_color: 'vert' });
    expect(invalid.status).toBe(400);

    const list = (await admin.get('/api/admin/publication-blocks')).body.data;
    const ids = [id, ...list.map((b: any) => b.id).filter((x: string) => x !== id)];
    const ordered = await admin.put('/api/admin/publication-blocks/order').set('x-csrf-token', csrf).send({ ids });
    expect(ordered.status).toBe(200);
    expect(ordered.body.data[0].id).toBe(id);

    let pub = (await request(app).get('/api/public/social/publication-blocks')).body;
    expect(pub.success).toBe(true);
    expect(pub.data[0]).toMatchObject({ id, title: 'Bloc de test', bgColor: '#2E7D5B', publisher: { name: 'zayrovi team' } });

    // désactivé : disparaît de l'application, reste dans le CRM
    expect((await admin.put(`/api/admin/publication-blocks/${id}`).set('x-csrf-token', csrf).send({ active: false })).status).toBe(200);
    pub = (await request(app).get('/api/public/social/publication-blocks')).body;
    expect(pub.data.some((b: any) => b.id === id)).toBe(false);

    expect((await admin.delete(`/api/admin/publication-blocks/${id}`).set('x-csrf-token', csrf)).status).toBe(200);
    expect((await admin.delete(`/api/admin/publication-blocks/${id}`).set('x-csrf-token', csrf)).status).toBe(404);
  });

  test('ordre refusé s’il ne cite pas exactement les blocs existants', async () => {
    const response = await admin.put('/api/admin/publication-blocks/order').set('x-csrf-token', csrf).send({ ids: ['inconnu'] });
    expect(response.status).toBe(400);
  });

  test('la lecture publique n’est jamais mise en cache', async () => {
    const response = await request(app).get('/api/public/social/publication-blocks');
    expect(response.headers['cache-control']).toContain('no-store');
  });
});
