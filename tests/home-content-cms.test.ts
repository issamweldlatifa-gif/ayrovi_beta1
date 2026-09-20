import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';

/**
 * Dashboard = Control · Database/CMS = Source of Truth · Frontend = Presentation
 * + قاعدة AYROVI: Mobile width-first (العنوان في تدفق الصفحة، الـ slider بعرض الشاشة).
 */

const admin = request.agent(app);
let csrf = '';

const appSource = readFileSync('client/src/App.tsx', 'utf8');
/**
 * P4/T2 : `LensHero.tsx`, `BrandsShowcase.tsx` puis `TrustBar.tsx` ont été SUPPRIMÉS
 * du projet — la page d'accueil se limite au Hero, au conteneur Stories et au bloc
 * LENS. Les verrous qui lisaient leur source sont retirés ; ce qui reste à verrouiller,
 * c'est que le contenu publié vient bien de la base (API) et que le Hero ne contient
 * toujours aucun texte figé.
 */
const heroSource = readFileSync('client/src/components/EvergreenHero.tsx', 'utf8');
const indexCss = readFileSync('client/src/index.css', 'utf8');


describe('Dashboard is the single source of truth for Hero, LENS and home sections', () => {
  test('super admin authenticates', async () => {
    const login = await admin.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    csrf = login.body.data.csrfToken;
  });

  test('public LENS payload exposes every managed field, including the mockup content', async () => {
    const response = await request(app).get('/api/public/lens-hero');
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.eyebrow).toBe('LENS');
    expect(data.title).toBe('Voyez-le.\nLENS le trouve.\nOn s’occupe du reste.');
    expect(data.accentColor).toBe('#FF6900');
    // النموذج الجديد: المحتوى الموسّع كله من الـ DB (sections)
    expect(data.sections.miniFeatures).toHaveLength(4);
    expect(data.sections.steps.items).toHaveLength(4);
    expect(data.sections.banner.title).toBe('Plus qu’un outil, votre meilleur allié shopping.');
    expect(data.sections.phone.merchants).toHaveLength(3);
    expect(data.sections.phone.productName).toBe('Sneakers blanches');
  });

  test('editing LENS in the dashboard changes the public site without touching code', async () => {
    const updated = await admin.put('/api/admin/lens-hero').set('x-csrf-token', csrf)
      .field('title', 'Scannez. Comparez. Commandez.')
      .field('proofLine', 'Vérifié par AYROVI.')
      .field('ctaLabel', 'Ouvrir le scanner')
      .field('ctaUrl', '/lens')
      .field('accentColor', '#123456')
      .field('elementOrder', 'title,eyebrow,cta,description,proof')
      .field('phoneProductName', 'Sneakers test — 12,00 €')
      .field('phoneImage', '/media/hero-homme.jpg');
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe('Scannez. Comparez. Commandez.');

    const published = await request(app).get('/api/public/lens-hero');
    expect(published.body.data.title).toBe('Scannez. Comparez. Commandez.');
    expect(published.body.data.proofLine).toBe('Vérifié par AYROVI.');
    expect(published.body.data.ctaUrl).toBe('/lens');
    expect(published.body.data.accentColor).toBe('#123456');
    expect(published.body.data.elementOrder).toBe('title,eyebrow,cta,description,proof');
    expect(published.body.data.phone.productName).toBe('Sneakers test — 12,00 €');
    expect(published.body.data.phone.image).toBe('/media/hero-homme.jpg');
  });

  test('unsafe CTA destinations are rejected and unknown element keys never drop an element', async () => {
    const unsafe = await admin.put('/api/admin/lens-hero').set('x-csrf-token', csrf).field('ctaUrl', 'javascript:alert(1)');
    expect(unsafe.status).toBe(400);

    const messy = await admin.put('/api/admin/lens-hero').set('x-csrf-token', csrf).field('elementOrder', 'title,script,cta,title');
    expect(messy.status).toBe(200);
    expect(messy.body.data.elementOrder).toBe('title,cta,eyebrow,description,proof');

    const stillSafe = await request(app).get('/api/public/lens-hero');
    expect(stillSafe.body.data.ctaUrl).toBe('/lens');
  });

  test('hero copy comes from the CMS, is editable and refuses an empty title', async () => {
    const before = await request(app).get('/api/public/hero-content');
    expect(before.status).toBe(200);
    expect(before.body.data.title).toBe('Vous le voyez.\nAYROVI vous le livre.');
    expect(before.body.data.highlight).toBe('AYROVI');
    expect(before.body.data.ctaLabel).toBe('');

    const updated = await admin.put('/api/admin/hero-content').set('x-csrf-token', csrf).send({
      eyebrow: 'Livraison Tunisie', title: 'Trouvez.\nAYROVI livre.', description: 'Nouveau sous-titre.',
      ctaLabel: 'Commencer', ctaUrl: 'https://ayrovi.tn/arrivages', elementOrder: 'title,eyebrow,description,cta',
    });
    expect(updated.status).toBe(200);

    const published = await request(app).get('/api/public/hero-content');
    expect(published.body.data).toMatchObject({
      eyebrow: 'Livraison Tunisie', title: 'Trouvez.\nAYROVI livre.', description: 'Nouveau sous-titre.',
      ctaLabel: 'Commencer', ctaUrl: 'https://ayrovi.tn/arrivages', elementOrder: 'title,eyebrow,description,cta',
    });

    const empty = await admin.put('/api/admin/hero-content').set('x-csrf-token', csrf).send({ title: '   ' });
    expect(empty.status).toBe(400);

    const unsafe = await admin.put('/api/admin/hero-content').set('x-csrf-token', csrf).send({ ctaUrl: 'javascript:alert(1)' });
    expect(unsafe.status).toBe(400);
  });

  test('home sections are reordered and hidden from the dashboard', async () => {
    const before = await request(app).get('/api/public/home-blocks');
    expect(before.status).toBe(200);
    expect(before.body.data.map((row: any) => row.id)).toEqual(['transition', 'discovery', 'brands', 'lens']);

    const saved = await admin.put('/api/admin/home-blocks').set('x-csrf-token', csrf).send({
      blocks: [
        { id: 'lens', visible: true }, { id: 'brands', visible: true },
        { id: 'discovery', visible: true }, { id: 'transition', visible: false },
      ],
    });
    expect(saved.status).toBe(200);

    const published = await request(app).get('/api/public/home-blocks');
    expect(published.body.data.map((row: any) => row.id)).toEqual(['lens', 'brands', 'discovery', 'transition']);
    expect(published.body.data.find((row: any) => row.id === 'transition').visible).toBe(false);
    expect(published.body.data.find((row: any) => row.id === 'lens').visible).toBe(true);

    const rejected = await admin.put('/api/admin/home-blocks').set('x-csrf-token', csrf).send({ blocks: [] });
    expect(rejected.status).toBe(400);
  });

  test('no Hero copy is hardcoded in the frontend', () => {
    expect(heroSource).not.toContain('Vous le voyez.');
    expect(heroSource).not.toContain('vous le livre.');
    expect(heroSource).not.toContain('Mode, beauté, technologie');
    expect(heroSource).toMatch(/fetch\('\/api\/public\/hero-content'[,)]/);
    expect(heroSource).toContain('controller.abort()');
  });
});

describe('AYROVI mobile width-first layout rule', () => {
  test('the slider reaches the screen edges and stays swipeable on mobile', () => {
    // gap ثابت 16px بين البطاقات
    expect(indexCss).toContain('--ay-rail-gap: 16px;');
    expect(indexCss).toMatch(/\.brands-marquee__track\s*\{[^}]*gap: var\(--ay-rail-gap\)/);
    // الهاتف: سحب أفقي أصلي + snap
    expect(indexCss).toMatch(/@media \(max-width: 1023px\) \{[\s\S]*?\.brands-marquee \{[\s\S]*?overflow-x: auto;[\s\S]*?scroll-snap-type: x proximity;[\s\S]*?\}/);
    expect(indexCss).toContain('.brand-tile { scroll-snap-align: start; }');
    // الوحدة البصرية بعرض الشاشة على الهاتف، ومحصورة على Desktop
    expect(indexCss).toMatch(/\.brands-rail \{[\s\S]*?width: 100vw;[\s\S]*?margin-left: calc\(50% - 50vw\);/);
    expect(indexCss).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*?\.brands-rail \{ width: min\(100%, 1200px\); margin-inline: auto;/);
    // الـ marquee يبقى على Desktop فقط (لا حركة على الهاتف)
    expect(indexCss).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*?\.brands-marquee__track \{ animation: brandsMarquee 48s linear infinite;/);
  });

  test('the homepage ends at its own sections — no footer or content below them', () => {
    // الفوتر مستثنى من أقسام الصفحة الرئيسية المعروضة
    expect(appSource).toContain("!['brands', 'about', 'footer'].includes(section.id)");
    // قسم الـhero يُغلق بدون padding سفلي حتى تنتهي الصفحة عند LENS
    expect(indexCss).toContain(".managed-public-section[data-public-section='hero'] { padding-block-end: 0 !important; }");
  });
});
