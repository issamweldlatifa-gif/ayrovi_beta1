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
const lensSource = readFileSync('client/src/components/LensHero.tsx', 'utf8');
const brandsSource = readFileSync('client/src/components/BrandsShowcase.tsx', 'utf8');
const heroSource = readFileSync('client/src/components/EvergreenHero.tsx', 'utf8');
const indexCss = readFileSync('client/src/index.css', 'utf8');

const headingIndex = brandsSource.indexOf('brands-heading');
const railIndex = brandsSource.indexOf('brands-rail');

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
    expect(data.title).toBe('Analysez. Comparez. Achetez mieux.');
    expect(data.proofLine).toBe('Fiable. Rapide. Intelligent.');
    expect(data.accentColor).toBe('#FF7A00');
    expect(data.elementOrder).toBe('eyebrow,title,description,cta,proof');
    expect(data.phone).toMatchObject({
      statusLabel: 'AYROVI LENS',
      resultLabel: 'Produit identifié',
      productName: 'Sneakers blanches — 89,00 €',
      priceChip: '≈ 298,900 TND',
      ctaLabel: 'Ajouter au panier',
    });
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
    expect(before.body.data.map((row: any) => row.id)).toEqual(['transition', 'discovery', 'brands', 'lens', 'lens-features']);

    const saved = await admin.put('/api/admin/home-blocks').set('x-csrf-token', csrf).send({
      blocks: [
        { id: 'lens', visible: true }, { id: 'brands', visible: true },
        { id: 'discovery', visible: true }, { id: 'transition', visible: false },
        { id: 'lens-features', visible: true },
      ],
    });
    expect(saved.status).toBe(200);

    const published = await request(app).get('/api/public/home-blocks');
    expect(published.body.data.map((row: any) => row.id)).toEqual(['lens', 'brands', 'discovery', 'transition', 'lens-features']);
    expect(published.body.data.find((row: any) => row.id === 'transition').visible).toBe(false);
    expect(published.body.data.find((row: any) => row.id === 'lens').visible).toBe(true);
    expect(published.body.data.find((row: any) => row.id === 'lens-features').visible).toBe(true);

    const rejected = await admin.put('/api/admin/home-blocks').set('x-csrf-token', csrf).send({ blocks: [] });
    expect(rejected.status).toBe(400);
  });

  test('no LENS or Hero copy is hardcoded in the frontend', () => {
    expect(lensSource).not.toContain('Analysez. Comparez. Achetez mieux.');
    expect(lensSource).not.toContain('Fiable. Rapide. Intelligent.');
    expect(lensSource).not.toContain('Sneakers');
    expect(lensSource).not.toContain('298,900');
    expect(lensSource).toContain("fetch('/api/public/lens-hero')");

    expect(heroSource).not.toContain('Vous le voyez.');
    expect(heroSource).not.toContain('vous le livre.');
    expect(heroSource).not.toContain('Mode, beauté, technologie');
    expect(heroSource).toContain("fetch('/api/public/hero-content')");
  });
});

describe('AYROVI mobile width-first layout rule', () => {
  test('the brands heading is a static block placed above and outside the slider', () => {
    expect(headingIndex).toBeGreaterThan(-1);
    expect(railIndex).toBeGreaterThan(-1);
    expect(headingIndex).toBeLessThan(railIndex);
    // العنوان والوصف داخل brands-heading وليس داخل brands-rail
    const headingBlock = brandsSource.slice(headingIndex, railIndex);
    expect(headingBlock).toContain('Les marques que vous aimez.');
    expect(headingBlock).toContain('Découvrez les marques et boutiques disponibles avec AYROVI.');
    const railBlock = brandsSource.slice(railIndex);
    expect(railBlock).not.toContain('Les marques que vous aimez.');
    expect(brandsSource).toContain('className="brands-rail"');
  });

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

  test('the heading block uses a 24px reading gutter with the specified type scale', () => {
    expect(indexCss).toContain('--ay-gutter: 24px;');
    expect(indexCss).toMatch(/\.brands-heading \{ padding-inline: var\(--ay-gutter\); text-align: left; \}/);
    expect(indexCss).toMatch(/\.brands-heading__title \{[\s\S]*?max-width: 90%;[\s\S]*?font-size: 34px;[\s\S]*?line-height: 1\.08;/);
    expect(indexCss).toMatch(/\.brands-heading__subtitle \{[\s\S]*?margin: var\(--ay-heading-to-text\) 0 0;[\s\S]*?font-size: 17\.5px;[\s\S]*?line-height: 1\.45;/);
    expect(indexCss).toContain('--ay-heading-to-text: 16px;');
    expect(indexCss).toContain('--ay-heading-to-slider: 32px;');
    expect(indexCss).toMatch(/\.brands-rail \{[^}]*margin-top: var\(--ay-heading-to-slider\)/);
  });

  test('LENS uses the full mobile viewport and an 88–92% wide mockup', () => {
    expect(indexCss).toMatch(/\.lens-hero \{ width: 100vw; max-width: 100vw; margin-left: calc\(50% - 50vw\); margin-right: calc\(50% - 50vw\); \}/);
    expect(indexCss).toMatch(/\.lens-hero__inner \{ padding-inline: var\(--ay-gutter\); padding-block: 44px 48px; gap: var\(--ay-cta-to-visual\); \}/);
    // mockup = عرض الشاشة (viewport) ناقص 20px من كل جانب (≈ 88–92%)
    expect(indexCss).toMatch(/\.lens-phone \{ width: calc\(100vw - 40px\); max-width: none; flex: 0 0 auto; margin-inline: auto; \}/);
    expect(indexCss).not.toContain('.lens-phone { width: min(280px, 78vw); }');
    // إيقاع رأسي محسوب بدل الفراغات الضخمة
    expect(indexCss).toContain('--ay-section-y: 48px;');
    expect(indexCss).toContain('--ay-text-to-cta: 28px;');
    expect(indexCss).toContain('--ay-cta-to-visual: 36px;');
    expect(lensSource).toContain('className="lens-hero mt-12 lg:mt-24"');
    expect(lensSource).not.toContain('mt-20 lg:mt-24');
  });

  test('the homepage ends at LENS — no footer or content rendered below it', () => {
    // الفوتر مستثنى من أقسام الصفحة الرئيسية المعروضة
    expect(appSource).toContain("!['brands', 'about', 'footer'].includes(section.id)");
    // قسم الـhero يُغلق بدون padding سفلي حتى تنتهي الصفحة عند LENS
    expect(indexCss).toContain(".managed-public-section[data-public-section='hero'] { padding-block-end: 0 !important; }");
  });
});

describe('Section 02 — LENS features rebuilt from the reference composition', () => {
  const featuresSource = readFileSync('client/src/components/LensFeaturesSection.tsx', 'utf8');

  test('Section 02 renders immediately after LENS and keeps the heading outside the features', () => {
    expect(appSource).toContain("if (block === 'lens-features') return <LensFeaturesSection key=\"lens-features\" />;");
    expect(appSource).toContain("['transition', 'discovery', 'brands', 'lens', 'lens-features']");
    // العنوان خارج شبكة الـ Features
    expect(featuresSource).toContain('lens-features__head');
    expect(featuresSource).toContain('lens-features__grid');
    // نفس الأيقونات من نظام AYROVI فقط (لا مكتبة جديدة)
    expect(featuresSource).toContain("from './QatafoIcons'");
    expect(featuresSource).not.toContain("react-icons");
    expect(featuresSource).toContain('LENS, simplement plus intelligent.');
  });

  test('the features build is horizontal — 4 columns at every viewport, no horizontal scroll', () => {
    // الشبكة 4 أعمدة دائمًا (الهاتف نسخة مصغّرة من Desktop)
    expect(indexCss).toMatch(/\.lens-features__grid \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: repeat\(4, 1fr\);[\s\S]*?\}/);
    // فواصل عمودية رفيعة بين الأعمدة
    expect(indexCss).toMatch(/\.lens-feature \+ \.lens-feature \{ border-left: 1px solid rgba\(17, 18, 23, 0\.08\); \}/);
    expect(indexCss).not.toMatch(/\.lens-feature \+ \.lens-feature \{ border-top: 1px solid/);
    // الهاتف: توسيط المحتوى (أيقونة+عنوان) لضمان تباعد متساوٍ فعلي بين الأيقونات
    expect(indexCss).toMatch(/\.lens-feature \{ min-width: 0; padding: 2px 6px; text-align: center; \}/);
    expect(indexCss).toMatch(/\.lens-feature__icon \{[\s\S]*?margin-inline: auto;[\s\S]*?\}/);
    // Desktop يعود لمحاذاة اليسار كما المرجع
    expect(indexCss).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*?\.lens-feature \{ padding: 8px 28px; text-align: left; \}[\s\S]*?\}/);
    // الهاتف: الوصف مخفي (أيقونة + عنوان فقط) ويظهر على Desktop
    expect(indexCss).toMatch(/\.lens-feature__desc \{ display: none; \}/);
    expect(indexCss).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*?\.lens-feature__desc \{ display: block;[\s\S]*?\}/);
    // أيقونة داخل مربع برتقالي ناعم (accent فقط، لا shadows قوية)
    expect(indexCss).toMatch(/\.lens-feature__icon \{[\s\S]*?background: color-mix\(in srgb, var\(--ayrovi-cta, #ff7a00\) 11%, #ffffff\)/);
  });
});
