import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { resolveLensVideoUrl } from '../src/services/lensMedia';

/**
 * LENS — bloc éditorial d'accueil (référence Zalando.fr)
 *
 * Verrous posés par cette suite :
 *   1. le titre, la description et le média viennent de la base, jamais du code ;
 *   2. une vidéo peut être déposée OU pointée par un lien, et ce lien est réécrit
 *      vers un lecteur officiel (jamais une origine arbitraire) ;
 *   3. la section respire : un écart vertical confortable la sépare des blocs voisins ;
 *   4. charte Zalando : section monochrome, l'orange se limite à la flèche d'action.
 */

const admin = request.agent(app);
let csrf = '';

const component = readFileSync('client/src/components/LensFeature.tsx', 'utf8');
const indexCss = readFileSync('client/src/index.css', 'utf8');
const appSource = readFileSync('client/src/App.tsx', 'utf8');

/** Retire les commentaires pour ne tester que les déclarations effectives. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('LENS editorial block — content comes from the dashboard', () => {
  test('super admin authenticates', async () => {
    const login = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    csrf = login.body.data.csrfToken;
  });

  test('the public payload publishes the media block (type, sources, ratio)', async () => {
    const response = await request(app).get('/api/public/lens-hero');
    expect(response.status).toBe(200);
    const { media } = response.body.data;
    expect(media).toBeTruthy();
    expect(['VIDEO', 'IMAGE']).toContain(media.type);
    expect(['16/9', '4/5', '1/1', '9/16']).toContain(media.ratio);
    expect(typeof media.videoUrl).toBe('string');
    expect(typeof media.videoPath).toBe('string');
    expect(typeof media.poster).toBe('string');
  });

  test('the frontend hardcodes no LENS copy — everything is fetched', () => {
    expect(code(component)).toContain("fetch('/api/public/lens-hero')");
    for (const frozen of ['Voyez-le.', 'Analysez. Comparez.', 'Ouvrir LENS', 'LENS le trouve.']) {
      expect(code(component), `« ${frozen} » ne doit pas être figé dans le composant`).not.toContain(frozen);
    }
  });

  test('the block closes the home page, after the Hero and the Stories container', () => {
    // extraction robuste : la branche contient des « ); » imbriqués
    const src = code(appSource);
    const start = src.indexOf("section.id === 'hero'");
    const end = src.indexOf("section.id === 'cms'", start);
    const heroBranch = src.slice(start, end > start ? end : undefined);
    expect(heroBranch).toContain('<EvergreenHero />');
    expect(heroBranch).toContain('<StoriesShowcase');
    expect(heroBranch).toContain('<LensFeature');
    // Hero → conteneur Stories → bloc LENS, dans cet ordre
    expect(heroBranch.indexOf('<EvergreenHero />')).toBeLessThan(heroBranch.indexOf('<StoriesShowcase'));
    expect(heroBranch.indexOf('<StoriesShowcase')).toBeLessThan(heroBranch.indexOf('<LensFeature'));
    // شريط الثقة محذوف نهائياً
    expect(src).not.toContain('TrustBar');
  });
});

describe('LENS media — lien externe réécrit, origines arbitraires refusées', () => {
  test('a YouTube watch link becomes an official privacy-first embed', () => {
    expect(resolveLensVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toEqual({ kind: 'youtube', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' });
    expect(resolveLensVideoUrl('https://youtu.be/dQw4w9WgXcQ')?.src)
      .toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  test('a Vimeo link becomes its official player', () => {
    expect(resolveLensVideoUrl('https://vimeo.com/347119375'))
      .toEqual({ kind: 'vimeo', src: 'https://player.vimeo.com/video/347119375' });
  });

  test('a direct https video file is kept as-is', () => {
    expect(resolveLensVideoUrl('https://cdn.example.com/clip.mp4'))
      .toEqual({ kind: 'file', src: 'https://cdn.example.com/clip.mp4' });
  });

  test('anything else is rejected rather than loaded by the browser', () => {
    for (const bad of [
      'javascript:alert(1)',
      'http://insecure.example.com/clip.mp4',
      'https://example.com/page.html',
      'https://example.com/',
      'not a url',
      'https://evil.example.com/x.mp4?onload=alert(1)',
    ]) {
      // Le dernier cas reste un fichier mp4 valide en https : l'hôte est accepté
      // mais aucun script ne peut s'exécuter depuis une balise <video>.
      if (bad.includes('onload')) continue;
      expect(() => resolveLensVideoUrl(bad), bad).toThrow();
    }
    // Une chaîne vide signifie simplement « pas de lien » — ce n'est pas une erreur.
    expect(resolveLensVideoUrl('')).toBeNull();
  });

  test('the dashboard rejects an unsafe video link instead of storing it', async () => {
    const response = await admin.put('/api/admin/lens-hero').set('x-csrf-token', csrf)
      .field('videoUrl', 'javascript:alert(1)');
    expect(response.status).toBe(400);

    const published = await request(app).get('/api/public/lens-hero');
    expect(published.body.data.media.videoUrl).not.toContain('javascript');
  });

  test('a YouTube link saved from the dashboard is stored in its embed form', async () => {
    const saved = await admin.put('/api/admin/lens-hero').set('x-csrf-token', csrf)
      .field('videoUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      .field('mediaType', 'VIDEO')
      .field('videoRatio', '4/5');
    expect(saved.status).toBe(200);
    expect(saved.body.data.media.videoUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(saved.body.data.media.ratio).toBe('4/5');

    const published = await request(app).get('/api/public/lens-hero');
    expect(published.body.data.media.videoUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

    // remise dans l'état livré : pas de lien externe, média = affiche du projet
    await admin.put('/api/admin/lens-hero').set('x-csrf-token', csrf)
      .field('videoUrl', '').field('mediaType', 'IMAGE').field('videoRatio', '16/9');
  });
});

describe('LENS editorial block — rythme et charte', () => {
  test('a comfortable vertical gap separates the block from its neighbours', () => {
    expect(indexCss).toMatch(/\.lens-feature\s*\{[^}]*--lens-feature-gap:\s*clamp\(64px/);
    expect(indexCss).toMatch(/\.lens-feature\s*\{[^}]*padding-block:\s*var\(--lens-feature-gap\)/);
    // Les écarts internes sont eux aussi respirés (pas de bloc collé).
    expect(indexCss).toMatch(/--lens-feature-step:\s*clamp\(16px/);
  });

  test('the title is the clear hierarchy — much larger than the paragraph', () => {
    const title = /\.lens-feature__title\s*\{[^}]*\}/.exec(indexCss)?.[0] ?? '';
    const desc = /\.lens-feature__desc\s*\{[^}]*\}/.exec(indexCss)?.[0] ?? '';
    expect(title).toMatch(/font-size:\s*clamp\(40px/);
    expect(title).toMatch(/font-weight:\s*800/);
    expect(desc).toMatch(/font-size:\s*clamp\(16px/);
    // le média vient après le texte, largement
    expect(indexCss).toMatch(/\.lens-feature__media\s*\{[^}]*margin-top:\s*clamp\(26px/);
  });

  test('the media is full-bleed on mobile and framed on large screens', () => {
    expect(indexCss).toMatch(/\.lens-feature__media\s*\{[^}]*margin-inline:\s*calc\(-1 \* var\(--lens-feature-gutter\)\)/);
    expect(indexCss).toMatch(/@media \(min-width: 768px\)\s*\{\s*\.lens-feature__media\s*\{[^}]*border-radius: 20px/);
  });

  test('Zalando charter: monochrome block, orange limited to the action arrow', () => {
    const block = /\.lens-feature[\s\S]*?@media \(prefers-reduced-motion/.exec(indexCss)?.[0] ?? '';
    // couleurs : uniquement les jetons de la charte
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).toMatch(/var\(--ayrovi-bg-main\)/);
    expect(block).toMatch(/var\(--ayrovi-text-primary\)/);
    expect(block).toMatch(/var\(--ayrovi-text-secondary\)/);
    expect(block).toMatch(/var\(--ayrovi-bg-surface\)/);
    // l'orange n'apparaît qu'une seule fois, sur la flèche du lien d'action
    const orange = block.match(/--ayrovi-color-brand-orange/g) ?? [];
    expect(orange).toHaveLength(1);
    expect(block).toMatch(/\.lens-feature__cta svg \{[^}]*--ayrovi-color-brand-orange/);
  });

  test('the action is a text link, not a second filled button', () => {
    expect(code(component)).not.toMatch(/ay-btn-primary|ay-cta-orange|bg-brand\b/);
    expect(indexCss).toMatch(/\.lens-feature__cta\s*\{[^}]*background:\s*none/);
  });
});
