import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';

/**
 * Conteneur « Stories » de la page d'accueil (référence Zalando « Stories sur … »)
 *
 * Verrous :
 *   1. le titre, le sous-titre, le lien central, le nombre de cartes et la
 *      visibilité viennent de la base — jamais du code ;
 *   2. le nombre de cartes est borné à 4 ou 5 (pas de valeur arbitraire) ;
 *   3. la destination du lien est validée (pas de javascript: ni d'origine ouverte) ;
 *   4. le Trust Bar a bien disparu du site ;
 *   5. charte : cartes de dimensions identiques, lien centré, orange limité à la flèche.
 */

const admin = request.agent(app);
let csrf = '';

const component = readFileSync('client/src/components/StoriesShowcase.tsx', 'utf8');
const indexCss = readFileSync('client/src/index.css', 'utf8');
const appSource = readFileSync('client/src/App.tsx', 'utf8');

/** Retire les commentaires pour ne tester que le code effectif. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Stories showcase — settings come from the dashboard', () => {
  test('super admin authenticates', async () => {
    const login = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    csrf = login.body.data.csrfToken;
  });

  test('the public payload publishes every managed field', async () => {
    const response = await request(app).get('/api/public/stories-showcase');
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(typeof data.title).toBe('string');
    expect(typeof data.subtitle).toBe('string');
    expect(typeof data.ctaLabel).toBe('string');
    expect(typeof data.ctaUrl).toBe('string');
    expect([4, 5]).toContain(data.cardCount);
    expect(typeof data.enabled).toBe('boolean');
  });

  test('the card count is bounded to 4 or 5 — no arbitrary value passes', async () => {
    const tooMany = await admin.put('/api/admin/stories-showcase').set('x-csrf-token', csrf)
      .send({ cardCount: 99, title: 'Social AYROVI' });
    expect(tooMany.status).toBe(200);
    expect(tooMany.body.data.cardCount).toBe(5);

    const tooFew = await admin.put('/api/admin/stories-showcase').set('x-csrf-token', csrf)
      .send({ cardCount: 1, title: 'Social AYROVI' });
    expect(tooFew.status).toBe(200);
    expect(tooFew.body.data.cardCount).toBe(4);

    const five = await admin.put('/api/admin/stories-showcase').set('x-csrf-token', csrf)
      .send({ cardCount: 5, title: 'Social AYROVI' });
    expect(five.body.data.cardCount).toBe(5);

    // remise dans l'état livré
    await admin.put('/api/admin/stories-showcase').set('x-csrf-token', csrf)
      .send({ cardCount: 4, title: 'Social AYROVI', subtitle: 'Le meilleur de la semaine', ctaLabel: 'Explorer toutes les stories', ctaUrl: '', enabled: true });
  });

  test('an unsafe link destination is rejected instead of being published', async () => {
    const unsafe = await admin.put('/api/admin/stories-showcase').set('x-csrf-token', csrf)
      .send({ ctaUrl: 'javascript:alert(1)' });
    expect(unsafe.status).toBe(400);

    const published = await request(app).get('/api/public/stories-showcase');
    expect(published.body.data.ctaUrl).not.toContain('javascript');
  });

  test('an internal path is accepted as a destination', async () => {
    const internal = await admin.put('/api/admin/stories-showcase').set('x-csrf-token', csrf)
      .send({ ctaUrl: '/promotions' });
    expect(internal.status).toBe(200);
    expect(internal.body.data.ctaUrl).toBe('/promotions');

    await admin.put('/api/admin/stories-showcase').set('x-csrf-token', csrf).send({ ctaUrl: '' });
  });

  test('the frontend hardcodes no copy — title, subtitle and link are fetched', () => {
    expect(code(component)).toContain("fetch('/api/public/stories-showcase')");
    for (const frozen of ['Social AYROVI', 'Le meilleur de la semaine', 'Explorer toutes les stories']) {
      expect(code(component), `« ${frozen} » ne doit pas être figé dans le composant`).not.toContain(frozen);
    }
  });

  test('the block is rendered on the home page, and the Trust Bar is gone for good', () => {
    // extraction robuste : la branche contient des « ); » imbriqués
    const src = code(appSource);
    const start = src.indexOf("section.id === 'hero'");
    const end = src.indexOf("section.id === 'cms'", start);
    const heroBranch = src.slice(start, end > start ? end : undefined);
    expect(heroBranch).toContain('<EvergreenHero />');
    expect(heroBranch).toContain('<StoriesShowcase');
    expect(heroBranch).toContain('<LensFeature');
    expect(heroBranch.indexOf('<StoriesShowcase')).toBeLessThan(heroBranch.indexOf('<LensFeature'));
    // شريط الثقة محذوف نهائياً من الصفحة ومن المشروع
    expect(code(appSource)).not.toContain('TrustBar');
    expect(() => readFileSync('client/src/components/TrustBar.tsx', 'utf8')).toThrow();
  });
});

describe('Stories showcase — modèle de la référence et charte', () => {
  test('all cards share strictly identical dimensions (equal-column grid)', () => {
    const grid = /\.stories-showcase__grid\s*\{[^}]*\}/.exec(indexCss)?.[0] ?? '';
    expect(grid).toMatch(/display:\s*grid/);
    expect(grid).toMatch(/grid-template-columns:\s*repeat\(var\(--stories-showcase-count, 4\),\s*minmax\(0, 1fr\)\)/);
    // la vignette a un ratio fixe : toutes les cartes ont donc la même hauteur
    const thumb = /\.stories-showcase__thumb\s*\{[^}]*\}/.exec(indexCss)?.[0] ?? '';
    expect(thumb).toMatch(/aspect-ratio:\s*9 \/ 16/);
    expect(thumb).toMatch(/width:\s*100%/);
  });

  test('the action link is centred in the middle of the container, below the cards', () => {
    expect(indexCss).toMatch(/\.stories-showcase__action\s*\{[^}]*display:\s*flex/);
    expect(indexCss).toMatch(/\.stories-showcase__action\s*\{[^}]*justify-content:\s*center/);
    expect(indexCss).toMatch(/\.stories-showcase__action\s*\{[^}]*margin-top:/);
  });

  test('the block breathes — a comfortable gap separates it from its neighbours', () => {
    expect(indexCss).toMatch(/\.stories-showcase\s*\{[^}]*--stories-showcase-gap:\s*clamp\(64px/);
    expect(indexCss).toMatch(/\.stories-showcase\s*\{[^}]*padding-block:\s*var\(--stories-showcase-gap\)/);
  });

  test('Zalando charter: monochrome container, orange limited to the action arrow', () => {
    const block = /\.stories-showcase \{[\s\S]*?@media \(prefers-reduced-motion/.exec(indexCss)?.[0] ?? '';
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).toMatch(/var\(--ayrovi-bg-main\)/);
    expect(block).toMatch(/var\(--ayrovi-text-primary\)/);
    expect(block).toMatch(/var\(--ayrovi-text-secondary\)/);
    expect(block).toMatch(/var\(--ayrovi-bg-surface\)/);
    // une seule occurrence d'orange : la flèche du lien central
    expect(block.match(/--ayrovi-color-brand-orange/g) ?? []).toHaveLength(1);
    expect(block).toMatch(/\.stories-showcase__cta > svg \{[^}]*--ayrovi-color-brand-orange/);
  });

  test('unseen stories are marked with ink, not with a second orange', () => {
    expect(indexCss).toMatch(/\.stories-showcase__card\.is-unseen \.stories-showcase__thumb\s*\{[^}]*border-color:\s*var\(--ayrovi-text-primary\)/);
  });

  test('opening a card opens the story viewer, not a new page', () => {
    expect(code(component)).toContain('StoryViewer');
    expect(code(component)).toMatch(/setViewerIndex\(/);
  });
});
