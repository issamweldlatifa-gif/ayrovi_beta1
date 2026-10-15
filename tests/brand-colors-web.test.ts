/**
 * AYROVI — palette officielle (2026-10-15) appliquée au SITE, au back-office, aux courriels
 * et à la coquille Android Capacitor.
 *
 *   noir #0A0A0A (≈ 35 %) · blanc #FFFFFF (≈ 50 %) · gris clair #F2F2F2 (≈ 5 %) · violet
 *   électrique #571EF6 + violet clair #C5B2F4 : repère global ≈ 3 % (2 % + 1 %) depuis la
 *   v4.2.0 (il était de 10 %). L'orange des chartes précédentes disparaît partout.
 *
 * Ce fichier verrouille quatre choses que les autres tests ne voient pas ensemble :
 *   1. le site et l'application parlent la MÊME palette (identity.json ≡ brand.json) ;
 *   2. les réglages CMS déjà persistés en orange sont relus en violet, sans écrire en base ;
 *   3. aucun littéral d'un orange retiré ne survit dans les sources produit (code, pages,
 *      SVG, XML Android) — les seules exceptions sont nommées ici, avec leur raison ;
 *   4. aucun pixel orange ne survit dans les logos, icônes et écrans de démarrage.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { BRAND } from '../shared/brand.generated';
import { brandAccentColor, enforceBrandIdentity, enforceLegacyTheme, isLegacyBrandOrange } from '../shared/identityPolicy';
import { normalizeInterfaceConfig } from '../client/src/config/interfaceConfig';
import { authMailTemplate } from '../src/customer/accountMail';
import { invoiceEmailHtml } from '../src/services/invoice';
import { customerTheme } from '../client/src/design/editorial/customerTheme';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const identity = JSON.parse(read('client/src/design/editorial/identity.json'));
const brand = JSON.parse(read('apps/mobile/src/design/brand.json'));

const OFFICIAL = { black: '#0A0A0A', white: '#FFFFFF', violet: '#571EF6', lightGray: '#F2F2F2' };

/** Oranges retirés : #FF6900 (« Zalando »), #FF7900 / #A74700 / #FFAE69 (AYROVI A v3), #F18902
 *  (AyWebs), #F97316 / #9A3412 / #FFF7ED (coquille Android), #FFB070 / #FFB173 / #E85F00 / #FFF3EA
 *  (pêches et survols), #FE7003 / #FF7A00 / #FB923C / #D3451F (chartes plus anciennes). */
const RETIRED = /#(?:ff6900|ff7900|fe7003|ff7a00|f18902|f97316|ffae69|a74700|ffb070|ffb173|e85f00|fff3ea|fb923c|d3451f)(?![0-9a-f])|rgba?\(\s*(?:254\s*,\s*112\s*,\s*3|255\s*,\s*121\s*,\s*0|255\s*,\s*105\s*,\s*0|241\s+137\s+2)\b/gi;

const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function walk(rel: string, pattern: RegExp, out: string[] = []): string[] {
  const abs = path.resolve(ROOT, rel);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = path.posix.join(rel, entry.name);
    if (entry.isDirectory()) walk(child, pattern, out);
    else if (pattern.test(entry.name)) out.push(child);
  }
  return out;
}

const hex = (value: string) => value.toUpperCase();

describe('1. une seule palette pour le site et l’application', () => {
  test('identity.json (site) et brand.json (application) portent les mêmes rôles, mêmes valeurs', () => {
    for (const tone of ['colors', 'darkColors'] as const) {
      for (const [role, value] of Object.entries(identity[tone] as Record<string, string>)) {
        expect(brand[tone][role], `${tone}.${role} absent de brand.json`).toBeDefined();
        expect(hex(value), `${tone}.${role}`).toBe(hex(brand[tone][role]));
      }
    }
    expect(identity.version).toBe(brand.version);
    // v4.2.0 : repère GLOBAL de l'application (pas un quota par écran) — 2 % violet + 1 % violet clair.
    expect(identity.accentShare).toEqual({ scope: 'app', total: 0.03, violet: brand.share.violet, violetLight: brand.share.violetLight });
    expect(identity.accentShare.violet + identity.accentShare.violetLight).toBeCloseTo(identity.accentShare.total, 10);
    // Le plafond par écran est un garde-fou contre les grandes surfaces violettes, pas l'objectif.
    expect(identity.accentAreaLimit).toBeGreaterThan(identity.accentShare.total);
  });

  test('les quatre couleurs officielles tiennent leurs rôles', () => {
    const c = identity.colors;
    expect(hex(c.canvas)).toBe(OFFICIAL.white);
    expect(hex(c.ink)).toBe(OFFICIAL.black);
    expect(hex(c.surface)).toBe(OFFICIAL.lightGray);
    for (const role of ['action', 'accent', 'accentText', 'focus']) expect(hex(c[role]), role).toBe(OFFICIAL.violet);
    expect(hex(c.onAction)).toBe(OFFICIAL.white);
    expect(hex(identity.darkColors.canvas)).toBe(OFFICIAL.black);
    expect(hex(identity.darkColors.action)).toBe(OFFICIAL.violet);
    expect(hex(identity.darkColors.accentText)).toBe('#926DF9');
    // le vocabulaire « orange » a quitté l'identité
    expect(JSON.stringify(identity)).not.toMatch(/orange/i);
  });

  test('les fichiers générés suivent la source (pas de copie à la main)', () => {
    for (const rel of ['client/src/design/editorial/tokens.generated.css', 'client/public/identity.css']) {
      const css = read(rel);
      expect(css).toContain('--ay-e-action: #571EF6;');
      expect(css).toContain('--ay-e-ink: #0A0A0A;');
      expect(css).not.toMatch(RETIRED);
    }
    expect(BRAND.colors.accent).toBe(OFFICIAL.violet);
    expect(BRAND.version).toBe(identity.version);
  });
});

describe('2. réglages persistés en orange : relus en violet, jamais réécrits', () => {
  const persisted = {
    colors: { accent: '#ff6900', heroBackground: '#0a0a0a' },
    icons: { library: 'ayrovi', color: '#000000', activeColor: '#ff6900', size: 28, style: 'outline' },
    sections: [
      { id: 'hero', title: 'Contenu réel', backgroundColor: '#0a0a0a' },
      { id: 'announcement', visible: false, backgroundColor: '#ff6900', textColor: '#ffffff' },
    ],
    price: { amount: 189.9 },
  };

  test('accent, icône active et bandeau orange deviennent violet / noir', () => {
    const snapshot = structuredClone(persisted);
    const result = enforceBrandIdentity(persisted) as typeof persisted;
    expect(result.colors.accent).toBe('#571ef6');
    expect(result.icons.activeColor).toBe('#571ef6');
    expect(result.sections[1].backgroundColor).toBe('#0a0a0a'); // jamais une grande surface violette
    expect(result.sections[0]).toEqual(persisted.sections[0]); // contenu intact
    expect(result.price).toEqual(persisted.price);
    expect(persisted).toEqual(snapshot); // adaptateur de lecture : aucune mutation
    expect(enforceBrandIdentity(result)).toEqual(result); // idempotent
  });

  test('les quatre oranges retirés sont reconnus, quelle que soit la casse ; le reste est conservé', () => {
    for (const orange of ['#ff6900', '#FF7900', ' #fe7003 ', '#FF7A00']) expect(isLegacyBrandOrange(orange)).toBe(true);
    for (const other of ['#571ef6', '#123456', '', null, undefined, '#ff6901']) expect(isLegacyBrandOrange(other)).toBe(false);
    const custom = enforceBrandIdentity({ colors: { accent: '#2e7d32' }, icons: { activeColor: '#123456' } }) as any;
    expect(custom.colors.accent).toBe('#2e7d32');
    expect(custom.icons.activeColor).toBe('#123456');
    expect(enforceBrandIdentity({ colors: {} })).not.toHaveProperty('icons');
  });

  test('accent de la section LENS et ancien thème du site', () => {
    expect(brandAccentColor('#FF6900')).toBe(OFFICIAL.violet);
    expect(brandAccentColor('')).toBe(OFFICIAL.violet);
    expect(brandAccentColor(null)).toBe(OFFICIAL.violet);
    expect(brandAccentColor('#2e7d32')).toBe('#2e7d32');
    expect(enforceLegacyTheme({ preset: 'noir', accent: '#ff6900' })).toMatchObject({ accent: '#571ef6' });
    expect(enforceLegacyTheme({ preset: 'custom', accent: '#db2777' })).toMatchObject({ accent: '#db2777' });
  });

  test('le client normalise de la même façon (même adaptateur partagé)', () => {
    const normalized = normalizeInterfaceConfig(persisted);
    expect(normalized.colors.accent).toBe('#571ef6');
    expect(normalized.icons.activeColor).toBe('#571ef6');
    expect(normalized.sections.find((section) => section.id === 'announcement')?.backgroundColor).toBe('#0a0a0a');
  });

  test('les routes LENS passent par l’adaptateur au lieu d’un orange par défaut', () => {
    for (const rel of ['src/admin/routes.ts', 'src/public/routes.ts']) {
      const source = read(rel);
      expect(source).toMatch(/accentColor: brandAccentColor\(row\.accent_color\)/);
      expect(source).not.toMatch(RETIRED);
    }
  });
});

describe('3. aucun orange retiré dans les sources produit', () => {
  /** Exceptions nommées : ce ne sont pas des couleurs de la marque AYROVI. */
  const EXCEPTIONS = new Map<string, string>([
    ['client/public/media/payments/orange.svg', 'logo de l’opérateur Orange Money (marque tierce, couleur imposée)'],
    ['shared/identityPolicy.ts', 'adaptateur de lecture : il nomme les oranges retirés pour les convertir'],
  ]);
  /** Tons d'ÉTAT du back-office (alerte, erreur) : une signification, pas la marque. */
  const STATE_TONES = /--admin-tone-rgba-254-112-3-(?:12|2):rgba\(254,112,3,\.(?:12|2)\);/g;

  const sources = [
    ...walk('client/src', /\.(css|tsx?)$/),
    ...walk('client/public', /\.(html|svg|css|webmanifest)$/),
    'client/index.html',
    ...walk('shared', /\.ts$/),
    'src/customer/accountMail.ts',
    'src/services/invoice.ts',
    'src/services/brandDocuments.ts',
    'src/admin/routes.ts',
    'src/public/routes.ts',
    ...walk('android/app/src/main/res', /\.xml$/),
    'docs/editorial/AYROVI-editorial-system.html',
  ];

  test('le balayage couvre bien le site, les pages statiques, le serveur et Android', () => {
    expect(sources.length).toBeGreaterThan(300);
    expect(sources).toContain('client/src/design/tokens.css');
    expect(sources).toContain('android/app/src/main/res/values/colors.xml');
    expect([...EXCEPTIONS.keys()].every((rel) => fs.existsSync(path.resolve(ROOT, rel)))).toBe(true);
  });

  test('zéro littéral orange retiré hors exceptions nommées', () => {
    const offenders: string[] = [];
    for (const rel of sources) {
      if (EXCEPTIONS.has(rel)) continue;
      let text = read(rel);
      if (/\.(css|tsx?)$/.test(rel)) text = withoutComments(text);
      if (rel === 'client/src/design/tokens.css') text = text.replace(STATE_TONES, '');
      const hits = text.match(RETIRED) ?? [];
      if (hits.length) offenders.push(`${rel} → ${[...new Set(hits)].join(' ')}`);
    }
    expect(offenders).toEqual([]);
  });

  test('les deux tons chauds conservés ne servent qu’aux états « erreur » et « alerte »', () => {
    const admin = withoutComments(read('client/src/admin/admin.css'));
    const uses = admin.split('\n').filter((line) => line.includes('--admin-tone-rgba-254-112-3-'));
    expect(uses).toHaveLength(2);
    expect(uses.every((line) => /\.bo-nav-state\.is-error|\.bo-tag--warn/.test(line))).toBe(true);
  });

  test('les logos vectoriels portent le point violet ; les anciens noms « -orange » ont disparu', () => {
    for (const rel of ['logo-ayrovi-mark.svg', 'logo-ayrovi-lockup-black-violet.svg', 'logo-ayrovi-lockup-white-violet.svg']) {
      expect(read(`client/public/media/${rel}`)).toContain('fill="#571EF6"');
    }
    for (const gone of ['black', 'white']) {
      for (const ext of ['svg', 'png']) {
        expect(fs.existsSync(path.resolve(ROOT, `client/public/media/logo-ayrovi-lockup-${gone}-orange.${ext}`))).toBe(false);
      }
    }
    const codeRefs = [...walk('client/src', /\.(tsx?|css)$/), 'client/index.html', ...walk('client/public', /\.html$/)]
      .filter((rel) => read(rel).includes('lockup-black-orange') || read(rel).includes('lockup-white-orange'));
    expect(codeRefs).toEqual([]);
  });

  test('les logos retouchés changent d’URL (les fichiers publics sont en cache « immutable » un an)', () => {
    const html = read('client/index.html');
    expect(html).toContain('/media/logo-ayrovi-mark.svg?v=4.1');
    expect(html).toContain('/media/logo-ayrovi.png?v=4.1');
    expect(html).toContain('/media/logo-ayrovi-apple-touch.png?v=4.1');
    const manifest = JSON.parse(read('client/public/manifest.webmanifest'));
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual(['/media/logo-ayrovi-192.png?v=4.1', '/media/logo-ayrovi-512.png?v=4.1']);
    // la barre du navigateur est noire (pas une grande surface violette), plus l'ancien violet #673DE6
    expect(manifest.theme_color.toUpperCase()).toBe(OFFICIAL.black);
    expect(html).toContain('<meta name="theme-color" content="#0A0A0A" />');
    // l'écran d'amorçage : ligne et point du logo en violet
    expect(html).toMatch(/\.ay-boot-line::after \{[^}]*background: #571EF6/);
    expect(html).toContain('fill="#571EF6"');
  });

  test('courriels et facture : bandeau et filets noirs, seul le CTA est violet', () => {
    const mail = authMailTemplate(false, 'Titre', '<p>Corps</p>', { label: 'Ouvrir', url: 'https://ayrovi.tn/compte' });
    // v4.2.0 : le filet décoratif sous le bandeau n'a pas de fonction d'action — il devient noir.
    expect(mail).toContain(`background:${BRAND.colors.ink};color:#FFFFFF;border-bottom:3px solid ${BRAND.colors.ink}`);
    expect(mail).toContain(`background:${BRAND.colors.action};color:${BRAND.colors.onAction}`);
    expect(mail).not.toMatch(RETIRED);
    const invoice = invoiceEmailHtml({ customerName: 'Client', orderNumber: 'TEST', invoiceNumber: 'TEST', trackingCode: '000123', totalLabel: '189.900 TND', depositLabel: '50.000 TND', balanceLabel: '139.900 TND', company: 'AYROVI' });
    expect(invoice).not.toMatch(RETIRED);
    expect(read('src/services/invoice.ts')).toMatch(/border-bottom: 3px solid \$\{BRAND\.colors\.ink\}/);
    expect(read('src/services/invoice.ts')).not.toMatch(/BRAND\.colors\.accent/);
  });

  test('coquille Android : boutons d’action violets, portés par une seule ressource', () => {
    const colors = read('android/app/src/main/res/values/colors.xml');
    expect(colors).toContain('<color name="aywebs_accent">#FF571EF6</color>');
    const layouts = walk('android/app/src/main/res/layout', /^.*aywebs.*\.xml$/);
    expect(layouts.length).toBeGreaterThanOrEqual(6);
    const buttons = layouts.filter((rel) => read(rel).includes('android:background="@color/aywebs_accent"'));
    expect(buttons).toHaveLength(6);
  });
});

describe('4. aucun pixel orange dans les logos, icônes et écrans de démarrage', () => {
  const isOrange = (r: number, g: number, b: number) => {
    const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, l = (max + min) / 2, d = max - min;
    if (d === 0) return false;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r / 255 ? ((g - b) / 255) / d : max === g / 255 ? ((b - r) / 255) / d + 2 : ((r - g) / 255) / d + 4;
    h = ((h * 60) + 360) % 360;
    return h >= 10 && h <= 50 && s >= 0.35 && l >= 0.06;
  };
  const files = [
    ...walk('client/public/media', /^logo-ayrovi.*\.png$/),
    ...walk('android/app/src/main/res', /^(splash|ic_launcher.*)\.png$/),
    'assets/icon.png',
    'assets/splash.png',
  ];

  test('le balayage couvre logos web, icônes Android et écrans de démarrage', () => {
    expect(files.filter((rel) => rel.startsWith('client/public/media/')).length).toBe(7);
    expect(files.filter((rel) => rel.includes('/mipmap-')).length).toBeGreaterThanOrEqual(18);
    expect(files.filter((rel) => rel.endsWith('/splash.png')).length).toBeGreaterThanOrEqual(13);
  });

  test.each(files)('%s', async (rel) => {
    const image = sharp(path.resolve(ROOT, rel));
    const meta = await image.metadata();
    const big = (meta.width ?? 0) * (meta.height ?? 0) > 1_500_000;
    const { data, info } = await (big ? image.resize({ width: 1024, kernel: 'nearest' }) : image)
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let orange = 0;
    let violet = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i + 3] <= 40) continue;
      if (isOrange(data[i], data[i + 1], data[i + 2])) orange += 1;
      if (data[i + 2] > 170 && data[i + 2] - data[i + 1] > 90 && data[i] > data[i + 1]) violet += 1;
    }
    expect(orange, `${rel} : pixels orange`).toBe(0);
    // les variantes « nuit » sont monochromes (A blanc sur noir) et le fond d'icône adaptative est uni ;
    // toutes les autres images portent le point violet du logo
    if (!rel.includes('-night') && !rel.endsWith('ic_launcher_background.png')) expect(violet, `${rel} : point violet`).toBeGreaterThan(0);
  }, 20_000);
});

describe('5. violet au minimum (v4.2.0) : seule l’action principale est violette', () => {
  const theme = customerTheme('fr') as Record<string, string>;

  test('les encres profondes du thème client sont noires, plus jamais l’action violette', () => {
    // Elles pointaient sur `action` : badges sombres, voile des modales, fond vidéo et panneaux
    // du thème sombre étaient repeints en violet depuis que l'action est violette.
    for (const name of ['--ayrovi-ink-deep', '--ayrovi-neutral-950', '--ayrovi-primary-dark']) {
      expect(hex(theme[name]), name).toBe(OFFICIAL.black);
    }
  });

  test('bouton primaire générique = encre ; le violet plein est réservé au CTA principal', () => {
    expect(hex(theme['--ayrovi-button-bg'])).toBe(OFFICIAL.black);
    expect(hex(theme['--ayrovi-button-color'])).toBe(OFFICIAL.white);
    expect(hex(theme['--ayrovi-cta'])).toBe(OFFICIAL.violet);
    expect(hex(theme['--ayrovi-accent-soft'])).toBe('#C5B2F4');
    expect(hex(theme['--ayrovi-on-accent-soft'])).toBe(OFFICIAL.black);
    const runtime = withoutComments(read('client/src/styles/interface-runtime.css'));
    expect(runtime).toMatch(/\.ay-runtime-button--primary,\.ay-btn-primary\{[^}]*background:var\(--ayrovi-button-bg,var\(--ayrovi-primary\)\)/);
    expect(withoutComments(read('client/src/styles/journey.css'))).toMatch(/\.ay-btn-primary\{border:1px solid var\(--ayrovi-text-primary\);background:var\(--ayrovi-text-primary\)/);
  });

  test('boutique : ajout au panier / caisse / paiement en violet, rien de violet sur la photo produit', () => {
    const shop = withoutComments(read('client/src/shop/shop.css'));
    expect(shop).toMatch(/\.s-cta \{[^}]*background: var\(--s-action\)/);
    expect(shop).toMatch(/\.s-rail__btn\[data-solid="true"\] \{ background: var\(--s-ink\)/);
  });

  test('boutique : la remise à zéro des boutons ne peut plus effacer le fond de l’action principale', () => {
    // `.s-root button` (spécificité 0,1,1 : fond nul, couleur héritée) l'emportait sur
    // `.s-cta` (0,1,0) : dans le navigateur, « Ajouter au panier » avait un fond calculé
    // transparent et un libellé noir. La surcharge doit exister, venir APRÈS la remise à
    // zéro, épargner le bouton fantôme et laisser gagner l'état « ajouté » (vert).
    const shop = withoutComments(read('client/src/shop/shop.css'));
    const reset = shop.search(/\.s-root button \{[^}]*background: none;/);
    const override = shop.indexOf('.s-root button.s-cta:not(.s-cta--ghost) { padding-inline: 16px; background: var(--s-action); color: var(--s-on-action); }');
    const done = shop.search(/\.s-root button\.s-cta\[data-done="true"\] \{ background: var\(--s-success\); \}/);
    expect(reset).toBeGreaterThan(-1);
    expect(override).toBeGreaterThan(reset);
    expect(done).toBeGreaterThan(override);
  });

  test('actions secondaires repassées en noir ; option choisie = violet clair + contour violet', () => {
    for (const rel of ['client/src/components/NotFoundPage.tsx', 'client/src/ayrovix/components/LiveCamera.tsx', 'client/src/ayrovix/components/InteractiveLensResults.tsx']) {
      expect(read(rel), rel).not.toMatch(/bg-cta\b/);
    }
    const ocerex = read('client/src/features/ocerex/screens/OcerexHome.tsx');
    expect(ocerex.match(/bg-accent-soft text-on-accent-soft ring-1 ring-inset ring-cta/g)).toHaveLength(2);
    expect(ocerex).not.toMatch(/bg-cta\b/);
    const voice = withoutComments(read('client/src/styles/editorial-voice.css'));
    expect(voice).toMatch(/\.voice-choices \[aria-pressed=true\], \.voice-rates \[aria-pressed=true\] \{ background:var\(--ay-e-accent-soft\); color:var\(--ay-e-on-accent-soft\); border-color:var\(--ay-e-accent\);/);
    expect(voice).not.toMatch(/var\(--ay-e-action\)/);
  });

  test('suivi d’étapes : seule l’étape en cours est violette, les étapes franchies sont noires', () => {
    const journey = withoutComments(read('client/src/styles/journey.css'));
    expect(journey).toMatch(/li\.is-current>span\{border-color:var\(--ayrovi-cta\)/);
    expect(journey).toMatch(/li\.is-complete>span\{border-color:var\(--ayrovi-text-primary\);background:var\(--ayrovi-text-primary\)/);
  });
});
