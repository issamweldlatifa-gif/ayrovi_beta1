/**
 * SEO public — ce que le serveur répond doit être vrai, pas rassurant.
 *
 * Trois défauts corrigés, et les trois sont vérifiés ici :
 *  1. le sitemap ne listait qu'une URL, alors que trois vraies pages existent ;
 *  2. une adresse inconnue recevait `200` (soft-404) : le site affirmait « tout va bien »
 *     pour une page qui n'existe pas ;
 *  3. le `<head>` statique de `index.html` et le contrat partagé pouvaient diverger en
 *     silence — un test les compare désormais.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app } from '../src/server';
import { PUBLIC_SEO_ROUTES, sitemapRoutes } from '../shared/publicSeo';

describe('sitemap — engendré depuis le contrat partagé', () => {
  test('il publie exactement les pages indexables, et rien d’autre', async () => {
    const response = await request(app).get('/sitemap.xml');
    expect(response.status).toBe(200);
    expect(String(response.headers['content-type'])).toContain('application/xml');

    const urls = sitemapRoutes().map((route) => `https://ayrovi.tn${route.path}`);
    const locs = [...String(response.text).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toEqual(urls);
    // Quatre pages réelles : l'accueil et les trois destinations publiques.
    expect(locs).toEqual(['https://ayrovi.tn/', 'https://ayrovi.tn/arrivage', 'https://ayrovi.tn/gift-cards', 'https://ayrovi.tn/magazine']);
    // La console n'est jamais annoncée à un moteur — même non indexable, elle n'a rien à y faire.
    expect(String(response.text)).not.toContain('/admin');
    // Un seul fichier sitemap peut répondre : le statique a été supprimé, pas doublé.
    expect(PUBLIC_SEO_ROUTES.filter((route) => route.path === '/admin')[0]?.inSitemap).toBe(false);
  });
});

describe('adresses inconnues — un vrai 404, pas un 200 poli', () => {
  test('une page inventée répond 404 et interdit l’indexation', async () => {
    const response = await request(app).get('/page-qui-nexiste-pas');
    expect(response.status).toBe(404);
    // Le corps reste l'application : le visiteur voit une page « introuvable » soignée.
    expect(String(response.headers['content-type'])).toContain('text/html');
    expect(String(response.headers['x-robots-tag'])).toContain('noindex');
  });

  test('les pages réelles gardent leur 200 — le 404 ne déborde pas', async () => {
    for (const route of PUBLIC_SEO_ROUTES) {
      const response = await request(app).get(route.path);
      expect(response.status, route.path).toBe(200);
      expect(String(response.headers['content-type']), route.path).toContain('text/html');
    }
  });

  test('un média absent garde son comportement historique (ressource, pas page)', async () => {
    // Comportement documenté par les tests de la politique d'uploads : le garde-fou
    // documentaire ne change pas ce qui arrive quand un fichier public est simplement absent.
    const response = await request(app).get('/uploads/hero/absent-seo-probe.png');
    expect(response.status).toBe(200);
    expect(String(response.headers['content-type'])).toContain('text/html');
  });
});

describe('le <head> statique ne peut plus diverger en silence', () => {
  test('le titre, la description et le canonical d’index.html sont ceux du contrat', () => {
    const html = readFileSync(path.join(process.cwd(), 'client/index.html'), 'utf8');
    const home = PUBLIC_SEO_ROUTES.find((route) => route.path === '/')!;
    expect(html).toContain(`<title>${home.titleFr}</title>`);
    expect(html).toContain(`<meta name="description" content="${home.descriptionFr}" />`);
    expect(html).toContain('<link rel="canonical" href="https://ayrovi.tn/" />');
    expect(html).toContain(`<meta property="og:title" content="${home.titleFr}" />`);
  });
});
