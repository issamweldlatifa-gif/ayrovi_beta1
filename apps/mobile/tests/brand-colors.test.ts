/**
 * Identité couleur officielle de l'application — v5.0.0 « Za. » (maquette v2 approuvée le 18/11/2026).
 *
 *   NOIR #0A0A0A (≈ 35 %) · BLANC #FFFFFF (≈ 50 %) · GRIS CLAIR #F2F2F2 (≈ 5 %)
 *   JAUNE #F2AE00 : logo + boutons d'ACHAT uniquement, ≤ 4 % d'un écran. PLUS AUCUN BLEU.
 *
 * Ce fichier verrouille trois choses vérifiables :
 *   1. les valeurs officielles et leur rôle sémantique (fond blanc, texte noir,
 *      action/focus/actif ENCRE, achat jaune à libellé noir, chargement gris clair) ;
 *   2. la LISIBILITÉ réelle — ratios WCAG mesurés, pas supposés ;
 *   3. la disparition de l'orange (et du bleu) : jetons, code, app.json ET images.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';

// `tokens.mobile` importe `react-native` (syntaxe Flow, non transformable par
// Vitest). On remplace le module par le strict nécessaire : jamais chargé.
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { BRAND, BRAND_SHARE, COLORS, NEUTRALS } from '../src/design/tokens.generated';
import {
  COMMERCE, GOOGLE_BRAND, LENS_COLORS, STATUS, derivedColors, frost, veil,
} from '../src/design/tokens.mobile';

const ROOT = path.resolve(__dirname, '..');

/* ── Outils de mesure ─────────────────────────────────────────────────────── */

function channels(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.slice(0, 6);
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

/**
 * « Orangé » = teinte entre 10° et 48°, franchement saturée et lumineuse.
 * #FF7900 (28°), #A74700 (25°), #9C5700 (33°), #F5B800 (45°) tombent dedans ;
 * le jaune d'avertissement retenu (#FFD60A, 50°) et les rouges n'y tombent pas.
 */
function isOrangeRgb(r: number, g: number, b: number): boolean {
  const { h, s, v } = hsv(r, g, b);
  return s >= 0.5 && v >= 0.35 && h >= 10 && h <= 48;
}
/** The ONE warm exception: the yellow of the official « Za. » logo (owner, 18/11/2026), BRAND.yellow — reserved to
 * the logo's circle and dot. Exact hex only in code; in shipped pixels its hue (± anti-aliasing) only. */
const LOGO_YELLOW = '#F2AE00';
const LOGO_YELLOW_HUE = hsv(...channels(LOGO_YELLOW)).h;
const isLogoYellowRgb = (r: number, g: number, b: number) => Math.abs(hsv(r, g, b).h - LOGO_YELLOW_HUE) <= 3;
/** Achat (18/11) : le jaune du logo et sa teinte « appuyé » — la même famille, jamais un orange de marque. */
const BUY_YELLOWS = new Set([LOGO_YELLOW, '#D99A00']);
const isOrange = (hex: string) => !BUY_YELLOWS.has(hex.toUpperCase()) && isOrangeRgb(...channels(hex));
const hue = (hex: string) => hsv(...channels(hex)).h;
const upper = (hex: string) => hex.toUpperCase();

const HEX = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g;
const hexesIn = (value: unknown): string[] => JSON.stringify(value).match(HEX) ?? [];

/** Le code, sans ses commentaires : une couleur citée dans une explication n'est pas utilisée. */
function code(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sources(rel));
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/**
 * Décodeur PNG minimal (8 bits, RGB/RGBA, non entrelacé) : assez pour compter
 * les pixels des icônes sans dépendre d'une bibliothèque d'image.
 */
function decodePng(file: string): { width: number; height: number; pixels: Uint8Array } {
  const buffer = fs.readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || data[12] !== 0) {
        throw new Error(`${file} : PNG non pris en charge (profondeur ${bitDepth}, type ${colorType})`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = prev[x];
      const upLeft = x >= bpp ? prev[x - bpp] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      row[x] = (value + predicted) & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      out.set([row[x * bpp], row[x * bpp + 1], row[x * bpp + 2], bpp === 4 ? row[x * bpp + 3] : 255], (y * width + x) * 4);
    }
    prev.set(row);
  }
  return { width, height, pixels: out };
}

/* ── 1. Valeurs officielles et rôles ──────────────────────────────────────── */

describe('identité couleur officielle', () => {
  it('les couleurs officielles sont exactement celles de la charte v5.0.0 (plus de bleu)', () => {
    expect(BRAND).toEqual({ black: '#0A0A0A', white: '#FFFFFF', lightGray: '#F2F2F2', yellow: LOGO_YELLOW, yellowPressed: '#D99A00' });
  });

  it('le jaune est un repère de ≤ 4 % (achat + logo), le reste est neutre', () => {
    expect(BRAND_SHARE).toEqual({ white: 0.5, black: 0.35, lightGray: 0.05, yellow: 0.04 });
  });

  it('aucune valeur bleue ni violette dans les deux modes', () => {
    const retired = ['#0A63F5', '#0A53CB', '#0B57CF', '#DCE8FE', '#78A9FA', '#571EF6', '#C5B2F4'];
    for (const mode of ['light', 'dark'] as const) {
      for (const value of Object.values(COLORS[mode])) expect(retired).not.toContain(upper(value));
    }
  });

  it('le fond d’une option choisie est gris clair (sombre : #2A2A2A), texte lisible dessus', () => {
    expect(COLORS.light.accentSoft).toBe(BRAND.lightGray);
    expect(COLORS.light.onAccentSoft).toBe(BRAND.black);
    expect(COLORS.dark.accentSoft).toBe('#2A2A2A');
    expect(COLORS.dark.onAccentSoft).toBe(BRAND.white);
    for (const mode of ['light', 'dark'] as const) {
      expect(contrast(COLORS[mode].onAccentSoft, COLORS[mode].accentSoft)).toBeGreaterThanOrEqual(7);
    }
  });

  it('fond blanc, texte noir, action et focus ENCRE (mode clair)', () => {
    const light = COLORS.light;
    expect(light.canvas).toBe(BRAND.white);
    // 17/10/2026 — décision client n° 1 : plus aucun fond gris.
    expect(light.surface).toBe(BRAND.white);
    expect(light.infoSoft).toBe(BRAND.white);
    expect(light.line).not.toBe(BRAND.white);
    expect(light.ink).toBe(BRAND.black);
    for (const key of ['action', 'accent', 'accentText', 'focus', 'secondaryAction'] as const) expect(light[key]).toBe(BRAND.black);
    expect(light.onAction).toBe(BRAND.white);
    expect(light.onAccent).toBe(BRAND.white);
    expect(light.line).toBe(NEUTRALS.border);
    expect(light.muted).toBe(NEUTRALS.textSecondary);
    expect(light.lineControl).toBe(NEUTRALS.controlBorder);
    expect(NEUTRALS).toMatchObject({ border: '#E5E5E5', textSecondary: '#666666' });
  });

  it('le mode sombre inverse l’encre : action, accent et focus BLANCS, libellé noir', () => {
    const dark = COLORS.dark;
    expect(dark.canvas).toBe(BRAND.black);
    expect(dark.ink).toBe(BRAND.white);
    for (const key of ['action', 'accent', 'accentText', 'focus', 'secondaryAction'] as const) expect(dark[key]).toBe(BRAND.white);
    expect(dark.onAction).toBe(BRAND.black);
    expect(dark.onAccent).toBe(BRAND.black);
  });

  it('l’ACHAT est jaune à libellé noir, identique dans les deux modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      expect(COLORS[mode].buy).toBe(LOGO_YELLOW);
      expect(COLORS[mode].buyPressed).toBe(BRAND.yellowPressed);
      expect(COLORS[mode].onBuy).toBe(BRAND.black);
    }
    expect(COMMERCE).toMatchObject({ action: LOGO_YELLOW, actionPressed: BRAND.yellowPressed, onAction: BRAND.black });
    expect(veil(0.5)).toBe('#0A0A0A80');
    expect(frost(0.9)).toBe('#FFFFFFe6');
  });

  it('les deux modes portent exactement les mêmes jetons', () => {
    expect(Object.keys(COLORS.dark).sort()).toEqual(Object.keys(COLORS.light).sort());
  });
});

/* ── 2. Lisibilité mesurée ────────────────────────────────────────────────── */

describe('contraste (WCAG)', () => {
  const modes = ['light', 'dark'] as const;

  it('chaque texte reste lisible sur les fonds qu’il rencontre (≥ 4,5:1)', () => {
    const failures: string[] = [];
    for (const mode of modes) {
      const c = COLORS[mode];
      for (const fg of ['ink', 'secondary', 'muted', 'accentText'] as const) {
        for (const bg of ['canvas', 'surface'] as const) {
          const ratio = contrast(c[fg], c[bg]);
          if (ratio < 4.5) failures.push(`${mode}: ${fg} ${c[fg]} sur ${bg} ${c[bg]} = ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('le libellé des boutons (encre, et jaune d’achat) reste lisible, au repos comme à l’appui', () => {
    for (const mode of modes) {
      const c = COLORS[mode];
      expect(contrast(c.onAction, c.action)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.onAction, c.actionHover)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
      // Texte NOIR sur jaune (≈ 10:1) ; le blanc y ferait ≈ 2:1 — interdit.
      expect(contrast(c.onBuy, c.buy)).toBeGreaterThanOrEqual(7);
      expect(contrast(c.onBuy, c.buyPressed)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(BRAND.white, LOGO_YELLOW)).toBeLessThan(3);
  });

  it('le focus et le contour des champs restent visibles (≥ 3:1)', () => {
    for (const mode of modes) expect(contrast(COLORS[mode].focus, COLORS[mode].canvas)).toBeGreaterThanOrEqual(3);
    expect(contrast(COLORS.light.lineControl, COLORS.light.canvas)).toBeGreaterThanOrEqual(3);
    expect(derivedColors(COLORS.light).focusRing).toBe(COLORS.light.focus);
    expect(derivedColors(COLORS.dark).focusRing).toBe(COLORS.dark.focus);
  });

  it('le chargement utilise le gris clair officiel', () => {
    expect(derivedColors(COLORS.light).skeleton).toBe(BRAND.lightGray);
    expect(LENS_COLORS.skeleton).toBe(BRAND.lightGray);
  });

  it('l’accent posé sur un média est blanc (≥ 4,5:1 sur noir)', () => {
    const onMedia = derivedColors(COLORS.light).accentOnMedia;
    expect(onMedia).toBe(COLORS.dark.accentText);
    expect(contrast(onMedia, BRAND.black)).toBeGreaterThanOrEqual(4.5);
  });
});

/* ── 3. Statuts : même sens, couleurs lisibles ────────────────────────────── */

describe('couleurs de statut', () => {
  it('chaque statut reste lisible dans les deux modes (≥ 4,5:1)', () => {
    const failures: string[] = [];
    for (const [name, tones] of Object.entries(STATUS)) {
      for (const mode of ['light', 'dark'] as const) {
        const fg = tones[mode].fg;
        for (const bg of [COLORS[mode].canvas, COLORS[mode].surface]) {
          const ratio = contrast(fg, bg);
          if (ratio < 4.5) failures.push(`${name}/${mode}: ${fg} sur ${bg} = ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('succès vert, erreur rouge, avertissement JAUNE (plus d’orange), information violette', () => {
    for (const mode of ['light', 'dark'] as const) {
      const h = (name: keyof typeof STATUS) => hue(STATUS[name][mode].fg);
      expect(h('success')).toBeGreaterThan(80);
      expect(h('success')).toBeLessThan(160);
      expect(h('danger') > 340 || h('danger') < 10).toBe(true);
      expect(h('warning')).toBeGreaterThan(48);
      expect(h('warning')).toBeLessThan(65);
      expect(upper(STATUS.info[mode].fg)).toBe(upper(COLORS[mode].accentText));
    }
  });

  it('le rouge de prix soldé est le rouge d’erreur clair — une seule teinte rouge', () => {
    expect(LENS_COLORS.sale).toBe(STATUS.danger.light.fg);
    expect(contrast(LENS_COLORS.sale, BRAND.white)).toBeGreaterThanOrEqual(4.5);
  });

  it('Lens : encre pour l’élément actif (blanc sur la caméra), noir pour les étoiles, gris pour le chargement', () => {
    expect(LENS_COLORS.active).toBe(BRAND.black);
    expect(LENS_COLORS.activeOnMedia).toBe(BRAND.white);
    expect(LENS_COLORS.activeSoft).toBe(BRAND.lightGray);
    expect(LENS_COLORS.star).toBe(BRAND.black);
    expect(LENS_COLORS.black).toBe(BRAND.black);
    expect(LENS_COLORS.white).toBe(BRAND.white);
    expect(LENS_COLORS.resultMuted).toBe(NEUTRALS.textSecondary);
    // Cadre de vignette : blanc, comme toute surface (décision n° 1).
    expect(LENS_COLORS.resultMedia).toBe(BRAND.white);
  });
});

/* ── 4. Plus d'orange, nulle part ─────────────────────────────────────────── */

describe('plus d’orange dans l’application', () => {
  it('aucune couleur orangée dans les jetons (palette, statuts, Lens, attente, dérivées)', () => {
    const palette = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/design/brand.json'), 'utf8'));
    const all = [
      ...hexesIn(palette), ...hexesIn(COLORS), ...hexesIn(STATUS), ...hexesIn(LENS_COLORS), ...hexesIn(COMMERCE),
      ...hexesIn(derivedColors(COLORS.light)), ...hexesIn(derivedColors(COLORS.dark)),
    ];
    expect(all.length).toBeGreaterThan(40);
    // L'exception orange du rail Reels (#FF9000, 10/11) est RETIRÉE par la
    // refonte des interactions du 14/11 : l'accent de la feuille est le Bleu Z.
    expect(all.filter((hex) => isOrange(hex))).toEqual([]);
    expect(all.map(upper)).not.toContain('#FF9000');
  });

  it('aucune couleur orangée écrite dans le code (exception : le logo Google imposé par Google)', () => {
    const allowed = new Set(Object.values(GOOGLE_BRAND).map(upper));
    /**
     * DONNÉES, pas palette : `optionColour.ts` traduit le nom de couleur d'un
     * article publié par le marchand (« Brown », « Orange », « Gold ») en
     * pastille, quand aucune photo n'existe. Un jean marron reste marron ; ces
     * teintes ne peignent jamais un bouton, un fond, un statut ou un texte —
     * l'orange de MARQUE reste banni, et ce fichier n'est importé que par les
     * pastilles de variante.
     */
    const dataColourModules = new Set(['src/features/aywebs/optionColour.ts']);
    const offenders: string[] = [];
    for (const rel of [...sources('app'), ...sources('src')]) {
      if (dataColourModules.has(rel)) continue;
      const text = code(rel);
      for (const match of text.matchAll(HEX)) {
        const value = upper(match[0]);
        if (rel === 'src/design/tokens.mobile.ts' && allowed.has(value)) continue;
        if (isOrange(value)) offenders.push(`${rel} → ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('les anciennes palettes (orange, dégradé bleu, liens bleus) ont disparu', () => {
    const offenders: string[] = [];
    for (const rel of [...sources('app'), ...sources('src')]) {
      const text = code(rel);
      for (const token of ['ACTION_GRADIENT', 'ACTION_ON_COLOR', 'LINK_BLUE', '#FF7900', '#ff7900']) {
        if (text.includes(token)) offenders.push(`${rel} → ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('app.json : couleur principale encre, ouverture noire (« Za. » v9, version sombre), aucune couleur orangée', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
    expect(config.primaryColor).toBe(BRAND.black);
    expect(config.backgroundColor).toBe(BRAND.white); // la toile de l'app
    // Logo v9 (18/11) : icône et ouverture NOIRES — la version officielle sur fond noir, dans les deux thèmes.
    expect(config.android.adaptiveIcon.backgroundColor).toBe(BRAND.black);
    const splash = config.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')[1];
    expect(splash.backgroundColor).toBe(BRAND.black);
    expect(splash.dark.backgroundColor).toBe(BRAND.black);
    expect(hexesIn(config).filter(isOrange)).toEqual([]);
  });

  it('icône, icône adaptative, favicon et écrans de démarrage : zéro pixel orange, zéro violet, zéro bleu — seul le jaune du logo', () => {
    const report: string[] = [];
    for (const name of ['icon.png', 'adaptive-icon.png', 'favicon.png', 'splash-icon.png', 'splash-icon-dark.png']) {
      const { pixels } = decodePng(path.join(ROOT, 'assets/images', name));
      let orange = 0;
      let violet = 0;
      let white = 0; let blue = 0; let ink = 0; let yellow = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 16) continue;
        const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
        if (isLogoYellowRgb(r, g, b)) yellow += 1;
        else if (isOrangeRgb(r, g, b)) orange += 1;
        const { h, s } = hsv(r, g, b);
        if (s > 0.5 && h > 245 && h < 265) violet += 1;
        if (r < 15 && g >= 140 && g <= 158 && b >= 235) blue += 1;
        if (r > 240 && g > 240 && b > 240) white += 1;
        if (r < 40 && g < 40 && b < 40) ink += 1;
      }
      // « Za. » v9: the logo's yellow is present, no other warm hue, no primary-action violet, no retired blue symbol.
      // `ink` = the black tile or the black z (favicon: transparent mark, so no ink is required there).
      if (orange > 0 || violet > 0 || blue > 0 || yellow === 0 || (ink === 0 && name !== 'favicon.png' && name !== 'adaptive-icon.png' && !name.startsWith('splash')))
        report.push(`${name}: orange=${orange} violet=${violet} encre=${ink} bleu=${blue} jaune=${yellow}`);
    }
    expect(report).toEqual([]);
  });
});

/* ── 5. Maquette v2 (18/11/2026) : jaune = achat, tout le reste à l'encre ─── */

describe('jaune réservé à l’achat, tout le reste à l’encre', () => {
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const walkSources = (dir: string, out: string[] = []): string[] => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walkSources(rel, out);
      else if (/\.tsx$/.test(entry.name)) out.push(rel);
    }
    return out;
  };

  it('le bouton par défaut est encre : `main` et `commerce` sont des décisions explicites', () => {
    const ui = read('src/design/ui.tsx');
    expect(ui).toMatch(/tone = 'solid'/);
    expect(ui).toMatch(/tone\?: 'main' \| 'commerce' \| 'solid' \| 'quiet'/);
  });

  it('les boutons d’ACHAT passent par la barre d’achat jaune (bouton court) ou le ton commerce', () => {
    const buy: Record<string, number> = {};
    for (const rel of [...walkSources('app'), ...walkSources('src')]) {
      const text = read(rel);
      const n = (text.match(/<PurchaseBar\b/g) ?? []).length + (text.match(/tone="commerce"/g) ?? []).length;
      if (n) buy[rel] = n;
    }
    expect(buy).toEqual({
      'app/checkout.tsx': 1,                            // Commander
      'app/aywebs/browser.tsx': 1,                      // choisir les options / ajouter
      'src/features/aywebs/AddToCartSheet.tsx': 1,      // ajouter au panier (feuille)
      'src/features/lens/LensProductView.tsx': 1,       // ajouter au panier (Lens)
      'src/features/lens/ocerex/OcerexFlow.tsx': 1,     // confirmer la commande OCEREX
      'src/features/product/ProductFiche.tsx': 1,       // ajouter au panier (fiche)
      'src/features/shopping/OfficialCartView.tsx': 1,  // Commander (panier)
      'src/features/social-commerce/LookSelectionSheet.tsx': 1, // confirmer l’ajout des articles du look
      'src/design/ui.tsx': 1,                           // PurchaseBar elle-même (ton commerce)
    });
  });

  it('la connexion et les autres CTA restent à l’encre (tone="main" = encre)', () => {
    const counts: Record<string, number> = {};
    for (const rel of [...walkSources('app'), ...walkSources('src')]) {
      const n = (read(rel).match(/tone="main"/g) ?? []).length;
      if (n) counts[rel] = n;
    }
    expect(counts).toEqual({ 'app/forgot.tsx': 1, 'app/sign-in.tsx': 4 });
  });

  it('le jaune reste COURT : la barre d’achat pose un bouton de largeur fixe à côté du prix', () => {
    const ui = read('src/design/ui.tsx');
    expect(ui).toContain('buyButton: { minWidth: COMMERCE.compactWidth, paddingHorizontal: 20 }');
    expect(COMMERCE.compactWidth).toBe(176);
    // 176 × 48 dp sur un écran de 390 × 844 dp : ≈ 2,6 % — sous le plafond de 4 %.
    expect((176 * 48) / (390 * 844)).toBeLessThan(0.04);
  });

  it('AYWEBs : choix au gris clair + contour encre, aucun jaune hors achat', () => {
    const choices = read('src/features/aywebs/ChoiceField.tsx');
    const chips = read('src/features/aywebs/VariantOptionChips.tsx');
    for (const src of [choices, chips]) {
      expect(src).not.toContain('tone="commerce"');
      expect(src).not.toContain('COMMERCE.');
      expect(src).not.toContain('warning.soft');
    }
    expect(choices).toContain('theme.colors.action');
    expect(chips).toMatch(/backgroundColor: active \? theme\.colors\.accentSoft/);
  });

  it('choix sélectionnés : gris clair + contour encre + texte noir', () => {
    for (const rel of ['app/checkout.tsx', 'app/orders/[id].tsx']) {
      const src = read(rel);
      expect(src, rel).toMatch(/backgroundColor: active \? theme\.colors\.accentSoft : theme\.colors\.canvas/);
      expect(src, rel).toMatch(/color=\{active \? theme\.colors\.onAccentSoft : theme\.colors\.ink\}/);
      expect(src, rel).not.toMatch(/backgroundColor: active \? theme\.colors\.action/);
    }
  });

  it('aucun accent décoratif : remises, codes promo, cartes story, pied de page, notices légales', () => {
    const promo = read('src/features/sections/PromotionCard.tsx');
    expect(promo).not.toMatch(/colors\.accent\b|colors\.accentText/);
    const story = read('src/features/sections/StoryCard.tsx');
    expect(story).not.toMatch(/colors\.accent\b/);
    expect(read('src/features/shell/Footer.tsx')).not.toMatch(/accentText/);
    expect(read('src/features/legal/LegalScreen.tsx')).not.toMatch(/accentText/);
    expect(read('src/features/home/HeroCarousel.tsx')).not.toMatch(/colors\.action\b/);
  });

  it('le compteur du panier est ROUGE à chiffre blanc, partout', () => {
    expect(read('src/design/CartGlyph.tsx')).toContain('backgroundColor: badgeColor ?? CART_BADGE.background');
    expect(read('src/design/tokens.mobile.ts')).toContain("background: '#D92D20'");
    expect(read('src/features/shell/AppHeader.tsx')).not.toContain('badgeColor=');
  });
});
