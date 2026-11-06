import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';

/**
 * Conteneur « Stories » de la page d'accueil (référence Zalando « Stories sur … »)
 *
 * Verrous :
 *   1. le titre, le sous-titre, le libellé Explore, le nombre de cartes et la
 *      visibilité viennent de la base — jamais du code ;
 *   2. 7 cartes au lancement, extensibles de 1 à 1000 ;
 *   3. la destination du lien est validée (pas de javascript: ni d'origine ouverte) ;
 *   4. le Trust Bar a bien disparu du site ;
 *   5. charte : fond noir, cartes portrait et CTA sans action.
 */

const admin = request.agent(app);
let csrf = '';

const component = readFileSync('client/src/components/StoriesShowcase.tsx', 'utf8');
const indexCss = readFileSync('client/src/index.css', 'utf8');
const appSource = readFileSync('client/src/App.tsx', 'utf8');

/** Retire les commentaires pour ne tester que le code effectif. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Stories showcase — settings come from the dashboard', () => {
  test('seven official source photos replace the legacy demo seed', () => {
    const src = code(readFileSync('src/db/database.ts', 'utf8'));
    expect(src).toContain("runOnceDataMigration('official_stories_editorial_v1'");
    expect(src).not.toContain('seedStoriesDemoContent');
    for (const slug of ['everyday','wellbeing','trench','coffee','winter','skincare','beauty']) {
      expect(existsSync(`assets/media/stories/${slug}.jpg`)).toBe(true);
    }
  });

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
    expect(data.cardCount).toBe(7);
    expect(typeof data.enabled).toBe('boolean');
  });

  test('the rail supports more than seven cards and rejects invalid limits', async () => {
    for (const invalid of [0, -1, 1001, 1.5, 'oops']) {
      const response = await admin.put('/api/admin/stories-showcase').set('x-csrf-token', csrf).send({ cardCount: invalid });
      expect(response.status).toBe(400);
    }
    for (const count of [1, 7, 12, 1000]) {
      const response = await admin.put('/api/admin/stories-showcase').set('x-csrf-token', csrf).send({ cardCount: count });
      expect(response.status).toBe(200);
      expect(response.body.data.cardCount).toBe(count);
    }
    await admin.put('/api/admin/stories-showcase').set('x-csrf-token', csrf).send({ cardCount: 7 });
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
    expect(code(component)).toContain("read('/api/public/stories-showcase')");
    for (const frozen of ['Social ZAYROVI', 'Le meilleur de la semaine', 'Explorer toutes les stories']) {
      expect(code(component), `« ${frozen} » ne doit pas être figé dans le composant`).not.toContain(frozen);
    }
  });

  test('the block sits BELOW the LENS block — and the Dashboard can flip it', () => {
    const src = code(appSource);
    // L'ordre n'est plus figé dans le code : il vient du réglage « Position » du bloc.
    expect(src).toMatch(/storiesBelowLens/);
    expect(src).toContain("fetch('/api/public/stories-showcase')");
    expect(src).toMatch(/setStoriesBelowLens\(Number\(json\.data\.sortOrder \?\? 1\) >= 1\)/);
    // Valeur par défaut : la section Stories se place SOUS le bloc LENS.
    expect(src).toMatch(/useState\(true\)/);
    // Dans cette branche, LENS est rendu avant Stories.
    const branch = /storiesBelowLens \? \(([\s\S]*?)\) : \(/.exec(src)?.[1] ?? '';
    expect(branch).toContain('<LensFeature');
    expect(branch).toContain('<StoriesShowcase');
    expect(branch.indexOf('<LensFeature')).toBeLessThan(branch.indexOf('<StoriesShowcase'));
    // شريط الثقة محذوف نهائياً
    expect(src).not.toContain('TrustBar');
    expect(() => readFileSync('client/src/components/TrustBar.tsx', 'utf8')).toThrow();
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

  test('the two voids match the model — ~1 cm less than before, at both ends', () => {
    // Relevé sur le modèle (viewport 720 px) : 57 px avant le titre, 52 px après
    // la carte. Exprimés en vw pour tenir à toutes les largeurs ; sur un écran
    // de 390 px cela donne 31 px et 28 px au lieu des 64 px d'avant.
    expect(indexCss).toMatch(/--stories-showcase-gap-top:\s*clamp\(30px,\s*7\.92vw,\s*57px\)/);
    expect(indexCss).toMatch(/--stories-showcase-gap-bottom:\s*clamp\(28px,\s*7\.22vw,\s*52px\)/);
    expect(indexCss).toMatch(/\.stories-showcase\s*\{[^}]*padding-top:\s*var\(--stories-showcase-gap-top\)/);
    expect(indexCss).toMatch(/\.stories-showcase\s*\{[^}]*padding-bottom:\s*var\(--stories-showcase-gap-bottom\)/);
    // les deux vides ne sont plus une valeur unique : ils suivent chacun le modèle
    expect(indexCss).not.toMatch(/--stories-showcase-gap:/);
  });

  test('ZAYROVI charter: the whole block is a monochrome dark panel, no violet (v4.2.0)', () => {
    const block = /\.stories-showcase \{[\s\S]*?@media \(prefers-reduced-motion/.exec(indexCss)?.[0] ?? '';

    // aucun littéral hexadécimal : tout passe par les jetons ou par du blanc/noir translucide
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);

    // Le modèle fourni est un bloc ENTIER posé sur un fond NOIR, titre et texte en blanc.
    expect(block).toMatch(/\.stories-showcase \{[\s\S]*?background:\s*var\(--ayrovi-text-primary\)/);
    expect(block).toMatch(/\.stories-showcase__title \{[\s\S]*?color:\s*var\(--ayrovi-bg-main\)/);
    expect(block).toMatch(/\.stories-showcase__cta \{[\s\S]*?color:\s*var\(--ayrovi-bg-main\)/);
    // Sur fond noir, le texte secondaire est du blanc translucide — jamais #666, illisible.
    expect(block).toMatch(/\.stories-showcase__subtitle \{[\s\S]*?rgba\(255,\s*255,\s*255/);
    expect(block).not.toMatch(/--ayrovi-text-secondary/);

    // Charte v4.2.0 (violet au minimum) : plus aucun violet dans le bloc. La flèche du lien
    // « Explorer toutes les stories » suit la couleur du lien (blanc sur le fond noir) — un
    // accent décoratif n'est pas une fonction.
    expect(block).not.toMatch(/--ayrovi-accent-on-dark|--ayrovi-cta\b/);
    expect(block).toMatch(/\.stories-showcase__cta > svg \{[^}]*color: currentColor/);
    expect(block).not.toMatch(/--ayrovi-color-brand-(?:orange|accent)/);
    // le voile sous le texte est noir (monochrome), jamais orangé
    expect(block).not.toMatch(/rgba\(\s*2[0-9]{2}\s*,\s*1[0-9]{2}/);
  });

  test('the card geometry follows the reference model, measured pixel by pixel', () => {
    const block = /\.stories-showcase \{[\s\S]*?@media \(prefers-reduced-motion/.exec(indexCss)?.[0] ?? '';
    // largeur 77,4 % de l'écran · marge 3,33 % · interstice 2,22 % · rapport 2/3
    expect(block).toMatch(/--stories-showcase-card:\s*min\(77\.4vw,\s*560px\)/);
    expect(block).toMatch(/--stories-showcase-gutter:\s*clamp\(13px,\s*3\.33vw,\s*32px\)/);
    expect(block).toMatch(/--stories-showcase-interstice:\s*clamp\(9px,\s*2\.22vw,\s*16px\)/);
    expect(block).toMatch(/aspect-ratio:\s*2 \/ 3/);
    // rail aimanté, barre de défilement masquée
    expect(block).toMatch(/scroll-snap-type:\s*x mandatory/);
    expect(block).toMatch(/::-webkit-scrollbar \{ display: none; \}/);
    // le bloc se suffit à lui-même : en-tête + texte posé en bas de l'image
    expect(block).toMatch(/\.stories-showcase__overlay \{[\s\S]*?bottom:\s*0;/);
    expect(block).toMatch(/\.stories-showcase__badge/);
    expect(block).toMatch(/\.stories-showcase__cardtitle/);
    expect(block).toMatch(/\.stories-showcase__carddesc/);
  });

  test('official cards never open the retired viewer; Explore has no fallback destination', () => {
    expect(code(component)).not.toContain('StoryViewer');
    expect(code(component)).not.toContain('setViewerIndex');
    expect(code(component)).toContain('disabled aria-disabled="true"');
    expect(code(component)).not.toContain('onClick=');
  });
});
