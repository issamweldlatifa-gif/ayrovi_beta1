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

  test('the block sits BELOW the LENS block, and the Trust Bar is gone for good', () => {
    // extraction robuste : la branche contient des « ); » imbriqués
    const src = code(appSource);
    const start = src.indexOf("section.id === 'hero'");
    const end = src.indexOf("section.id === 'cms'", start);
    const heroBranch = src.slice(start, end > start ? end : undefined);
    expect(heroBranch).toContain('<EvergreenHero />');
    expect(heroBranch).toContain('<LensFeature');
    expect(heroBranch).toContain('<StoriesShowcase');
    // Hero → bloc LENS → section Stories, dans cet ordre (demande explicite)
    expect(heroBranch.indexOf('<EvergreenHero />')).toBeLessThan(heroBranch.indexOf('<LensFeature'));
    expect(heroBranch.indexOf('<LensFeature')).toBeLessThan(heroBranch.indexOf('<StoriesShowcase'));
    // شريط الثقة محذوف نهائياً
    expect(code(appSource)).not.toContain('TrustBar');
    expect(() => readFileSync('client/src/components/TrustBar.tsx', 'utf8')).toThrow();
  });});

describe('Stories showcase — le modèle fourni et la charte', () => {
  test('the reference model: one very wide card per screen, the next one peeking', () => {
    // Largeur de carte relevée sur la capture de référence : ~78 % de l'écran,
    // la suivante dépasse du bord droit pour inviter au défilement.
    expect(indexCss).toMatch(/--stories-showcase-card:\s*min\(78vw,\s*560px\)/);
    const cell = /\.stories-showcase__cell\s*\{[^}]*\}/.exec(indexCss)?.[0] ?? '';
    expect(cell).toMatch(/flex:\s*0 0 var\(--stories-showcase-card\)/);
    expect(cell).toMatch(/scroll-snap-align:\s*start/);
    // toutes les cartes ont donc strictement la même largeur et la même hauteur
    const card = /\.stories-showcase__card\s*\{[^}]*\}/.exec(indexCss)?.[0] ?? '';
    expect(card).toMatch(/aspect-ratio:\s*3 \/ 4/);
    expect(card).toMatch(/width:\s*100%/);
  });

  test('the rail scrolls horizontally with snap and no visible scrollbar', () => {
    const rail = /\.stories-showcase__rail\s*\{[^}]*\}/.exec(indexCss)?.[0] ?? '';
    expect(rail).toMatch(/display:\s*flex/);
    expect(rail).toMatch(/overflow-x:\s*auto/);
    expect(rail).toMatch(/scroll-snap-type:\s*x mandatory/);
    expect(indexCss).toMatch(/\.stories-showcase__rail::-webkit-scrollbar \{ display: none; \}/);
  });

  test('the card text sits at the BOTTOM of the image, over a dark scrim', () => {
    const overlay = /\.stories-showcase__overlay\s*\{[^}]*\}/.exec(indexCss)?.[0] ?? '';
    expect(overlay).toMatch(/position:\s*absolute/);
    expect(overlay).toMatch(/bottom:\s*0/);
    expect(overlay).toMatch(/linear-gradient\(to top/);
    // pastille claire + texte sombre, jamais de pavé orangé
    const badge = /\.stories-showcase__badge\s*\{[^}]*\}/.exec(indexCss)?.[0] ?? '';
    expect(badge).toMatch(/background:\s*var\(--ayrovi-bg-main\)/);
    expect(badge).toMatch(/color:\s*var\(--ayrovi-text-primary\)/);
  });

  test('the header carries the title, the subtitle then the « explore » link', () => {
    expect(indexCss).toMatch(/\.stories-showcase__head\s*\{[^}]*padding-inline:/);
    expect(indexCss).toMatch(/\.stories-showcase__cta\s*\{[^}]*margin-top:\s*14px/);
    expect(indexCss).toMatch(/\.stories-showcase__cta\s*\{[^}]*border-bottom:/);
    // chaque carte porte son propre titre et sa description
    expect(code(component)).toContain('stories-showcase__cardtitle');
    expect(code(component)).toContain('stories-showcase__carddesc');
  });

  test('the block breathes — a comfortable gap separates it from its neighbours', () => {
    expect(indexCss).toMatch(/\.stories-showcase\s*\{[^}]*--stories-showcase-gap:\s*clamp\(64px/);
    expect(indexCss).toMatch(/\.stories-showcase\s*\{[^}]*padding-block:\s*var\(--stories-showcase-gap\)/);
  });

  test('Zalando charter: monochrome section, orange limited to the action arrow', () => {
    const block = /\.stories-showcase \{[\s\S]*?@media \(prefers-reduced-motion/.exec(indexCss)?.[0] ?? '';
    // aucun littéral hexadécimal dans la section
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).toMatch(/var\(--ayrovi-bg-main\)/);
    expect(block).toMatch(/var\(--ayrovi-text-primary\)/);
    expect(block).toMatch(/var\(--ayrovi-text-secondary\)/);
    expect(block).toMatch(/var\(--ayrovi-bg-surface\)/);
    // une seule occurrence d'orange : la flèche du lien « Explorer toutes les stories »
    expect(block.match(/--ayrovi-color-brand-orange/g) ?? []).toHaveLength(1);
    expect(block).toMatch(/\.stories-showcase__cta > svg \{[^}]*--ayrovi-color-brand-orange/);
    // le voile sous le texte est noir (monochrome), jamais orangé
    expect(block).not.toMatch(/rgba\(\s*2[0-9]{2}\s*,\s*1[0-9]{2}/);
  });

  test('opening a card opens the story viewer, not a new page', () => {
    expect(code(component)).toContain('StoryViewer');
    expect(code(component)).toMatch(/setViewerIndex\(/);
    // une carte = une story : le viewer reçoit un groupe par carte
    expect(code(component)).toMatch(/stories:\s*\[story\]/);
  });
});
