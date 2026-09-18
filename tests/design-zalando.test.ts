/**
 * AYROVI — P4/T1 « Zalando Strategy » : verrou du système de design.
 *
 * Ce fichier ne teste pas des pixels : il teste la RÈGLE que la refonte était chargée
 * d'installer, et rend le retour en arrière impossible par inadvertance.
 *
 *   1. les six jetons canoniques existent, avec les valeurs exactes de la charte ;
 *   2. un seul orange dans tout le client : `#ff6900`, porté par un seul jeton ;
 *      `--ayrovi-cta`, `--ayrovi-orange` et `--ayrovi-accent` ne sont que des alias ;
 *   3. aucun littéral orange hérité ne survit dans `client/src` (ni CSS, ni TSX, ni TS) ;
 *   4. les surfaces LENS et les cartes éditoriales ne sont plus des aplats oranges :
 *      le lavis pêche, la diagonale et la bannière dégradée sont neutralisés ;
 *   5. les primitives de la charte (carte de surface, badge, action icône, CTA) existent
 *      et sont bien importées par la feuille racine ;
 *   6. l'orange reste un déclencheur d'action : les rares `bg-cta` / `text-cta` qui
 *      subsistent sont des états actifs ou le CTA principal, listés nommément.
 *
 * Les nombres de ce fichier sont MESURÉS, pas déduits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const TOKENS = 'client/src/design/tokens.css';
const INDEX_CSS = 'client/src/index.css';
const PRIMITIVES = 'client/src/styles/zalando-ui.css';

/** Retire les blocs de commentaire : un littéral commenté n'est pas une valeur. */
function withoutComments(text: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const open = text.indexOf('/*', i);
    if (open === -1) return out + text.slice(i);
    out += text.slice(i, open);
    const close = text.indexOf('*/', open + 2);
    i = close === -1 ? text.length : close + 2;
  }
}

const declarations = (text: string) =>
  [...withoutComments(text).matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)];

function clientFiles(pattern: RegExp): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.resolve(ROOT, rel), { withFileTypes: true })) {
      const child = path.join(rel, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (pattern.test(entry.name)) out.push(child.split(path.sep).join('/'));
    }
  };
  walk('client/src');
  return out;
}

describe('jetons canoniques — la charte tient en six variables', () => {
  test('les six jetons existent avec leurs valeurs exactes', () => {
    const declared = new Map(declarations(read(TOKENS)).map(([, n, v]) => [n, v.trim().toLowerCase()]));
    const canonical: Record<string, string> = {
      '--ayrovi-bg-main': '#ffffff',
      '--ayrovi-bg-surface': '#f8f9fa',
      '--ayrovi-border-soft': '#eaeaea',
      '--ayrovi-text-primary': '#111111',
      '--ayrovi-text-secondary': '#666666',
      '--ayrovi-color-brand-orange': '#ff6900',
    };
    for (const [name, value] of Object.entries(canonical)) {
      expect(declared.get(name), `${name} doit être déclaré dans tokens.css`).toBe(value);
    }
  });

  test('l’orange n’a qu’un seul porteur : les autres noms ne sont que des alias', () => {
    const declared = new Map(declarations(read(TOKENS)).map(([, n, v]) => [n, v.trim().toLowerCase()]));
    const resolve = (name: string, depth = 0): string => {
      const raw = declared.get(name) ?? '';
      const alias = raw.match(/^var\((--[a-z0-9-]+)\)$/);
      return alias && depth < 6 ? resolve(alias[1], depth + 1) : raw;
    };
    expect(resolve('--ayrovi-color-brand-orange')).toBe('#ff6900');
    for (const alias of ['--ayrovi-cta', '--ayrovi-orange', '--ayrovi-accent']) {
      expect(resolve(alias), `${alias} doit résoudre l'orange canonique`).toBe('#ff6900');
    }
    // et un seul jeton porte réellement la valeur : deux porteurs = deux vérités
    const bearers = [...declared.entries()].filter(([, v]) => v === '#ff6900').map(([n]) => n);
    expect(bearers).toEqual(['--ayrovi-color-brand-orange']);
  });

  test('l’ancien accent « soft » n’est plus une teinte orange', () => {
    const declared = new Map(declarations(read(TOKENS)).map(([, n, v]) => [n, v.trim().toLowerCase()]));
    const resolve = (name: string, depth = 0): string => {
      const raw = declared.get(name) ?? '';
      const alias = raw.match(/^var\((--[a-z0-9-]+)\)$/);
      return alias && depth < 6 ? resolve(alias[1], depth + 1) : raw;
    };
    expect(resolve('--ayrovi-accent-soft')).toBe('#f8f9fa');
  });
});

describe('purge — plus aucun littéral orange hérité', () => {
  /** Oranges de l'ancienne charte : #fe7003 (jeton), #ff7a00 (LENS), et leurs déclinaisons. */
  const LEGACY = /#(fe7003|ff7a00|ff8f33|e05f00|f26a1b|ff9433|fdf6f0|fbeadd|fbe3d2|ffb070)\b/gi;

  /**
   * `tokens.css` héberge aussi la couche back-office (`--admin-*`), dont le pêche
   * `--admin-warm-accent` est verrouillé par `design-tokens.test.ts` : on ne balaie
   * que les déclarations de la couche vitrine (`--ayrovi-*`).
   */
  const storefrontTokens = (src: string) =>
    declarations(src)
      .filter(([, name]) => !name.startsWith('--admin-'))
      .map(([, name, value]) => `${name}:${value}`)
      .join(';');

  test('aucune feuille de style du client ne porte un littéral hérité', () => {
    const offenders: string[] = [];
    for (const rel of clientFiles(/\.css$/)) {
      const body = rel === TOKENS ? storefrontTokens(read(rel)) : withoutComments(read(rel));
      const hits = (body.match(LEGACY) ?? []);
      if (hits.length) offenders.push(`${rel} → ${hits.length} (${[...new Set(hits)].slice(0, 4).join(' ')})`);
    }
    expect(offenders.join(' | ')).toBe('');
  });

  test('aucun composant du client ne porte un littéral hérité', () => {
    const offenders: string[] = [];
    for (const rel of clientFiles(/\.(tsx|ts)$/)) {
      const hits = (withoutComments(read(rel)).match(LEGACY) ?? []);
      if (hits.length) offenders.push(`${rel} → ${hits.length} (${[...new Set(hits)].slice(0, 4).join(' ')})`);
    }
    expect(offenders.join(' | ')).toBe('');
  });

  /**
   * Les deux migrations de palette ont le DROIT de citer les anciennes valeurs : c'est
   * précisément elles qu'elles réécrivent. Partout ailleurs, un littéral hérité est une
   * régression. On neutralise donc ces deux corps de méthode avant de balayer.
   */
  const stripPaletteMigrations = (src: string) =>
    src
      .replace(/private applyNoirOrangePalette\(\)[\s\S]*?\n  \}\n/, '')
      .replace(/private applyZalandoOrange\(\)[\s\S]*?\n  \}\n/, '');

  test('le serveur ne publie plus l’ancienne valeur par défaut', () => {
    for (const rel of ['src/admin/routes.ts', 'src/public/routes.ts', 'src/services/invoice.ts']) {
      const hits = (withoutComments(read(rel)).match(LEGACY) ?? []);
      expect(hits, `${rel} porte encore un orange hérité`).toEqual([]);
    }
    const database = stripPaletteMigrations(read('src/db/database.ts'));
    expect(
      (withoutComments(database).match(LEGACY) ?? []),
      'src/db/database.ts : un orange hérité hors du code de migration',
    ).toEqual([]);
    // et la migration existe bien (sinon le test ci-dessus ne voudrait rien dire)
    expect(read('src/db/database.ts')).toMatch(/rebrand_zalando_orange_v1/);
  });

  test('les valeurs par défaut persistées sont le nouvel orange', () => {
    const database = read('src/db/database.ts');
    expect(database).toMatch(/accent: '#ff6900'/);
    expect(database).toMatch(/activeColor: '#ff6900'/);
    expect(database).toMatch(/accent_color TEXT NOT NULL DEFAULT '#FF6900'/);
  });
});

describe('surfaces — l’orange n’est plus un papier peint', () => {
  const css = () => withoutComments(read(INDEX_CSS));

  test('la section LENS v2 n’a plus de lavis pêche', () => {
    const rule = css().match(/\.lens2\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/background:\s*var\(--ayrovi-bg-main\)/);
    expect(rule).not.toMatch(/gradient/);
  });

  test('la diagonale orange décorative est neutralisée', () => {
    const rule = css().match(/\.lens2__diagonal\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/display:\s*none/);
    expect(rule).not.toMatch(/linear-gradient/);
  });

  test('la bannière est une carte de surface à filet de 3px, pas un bloc orange', () => {
    const rule = css().match(/\.lens2__banner\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/background:\s*var\(--ayrovi-bg-surface\)/);
    expect(rule).toMatch(/border-inline-start:\s*3px solid var\(--ayrovi-color-brand-orange\)/);
    expect(rule).not.toMatch(/linear-gradient/);
  });

  test('le CTA de la bannière est rétrogradé en secondaire (un seul orange plein par écran)', () => {
    const rule = css().match(/\.lens2__banner-cta\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/background:\s*var\(--ayrovi-bg-main\)/);
    expect(rule).not.toMatch(/var\(--ayrovi-color-brand-orange\)/);
  });

  test('le CTA principal « Ouvrir LENS » reste le seul orange plein de la section', () => {
    const rule = css().match(/\.lens2__cta\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/background:\s*var\(--ayrovi-color-brand-orange\)/);
  });

  test('les flèches des prix marchands sont des cercles transparents à filet fin', () => {
    const rule = css().match(/\.lens2__merchant-go\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/background:\s*transparent/);
    expect(rule).toMatch(/border:\s*1px solid var\(--ayrovi-border-soft\)/);
    expect(rule).not.toMatch(/var\(--ayrovi-color-brand-orange\)/);
  });

  test('le viseur LENS est neutre (Google Lens), pas orange', () => {
    const body = css();
    const scan = body.match(/\.lens-scan::before\s*\{[^}]*\}/)?.[0] ?? '';
    expect(scan).toMatch(/var\(--ayrovi-white\)/);
    expect(scan).not.toMatch(/var\(--ayrovi-cta\)/);
    const beam = body.match(/\.lens-frame__beam\s*\{[^}]*\}/)?.[0] ?? '';
    expect(beam).toMatch(/background:\s*var\(--ayrovi-white\)/);
  });

  /**
   * P4/T2 : la carte « Découvrez AYROVI » (bloc `transition`) a été SUPPRIMÉE du
   * projet avec `BrandsShowcase` et `LensHero` — la page d'accueil se limite au
   * Hero + Trust Bar. La règle qu'elle portait (surface grise + filet 3px) est
   * désormais portée par la primitive `.ay-surface-card`, verrouillée ci-dessous.
   */
  test('les anciens blocs oranges de la page d’accueil ont bien été retirés', () => {
    for (const gone of [
      'client/src/components/TransitionCard.tsx',
      'client/src/components/BrandsShowcase.tsx',
      'client/src/components/LensHero.tsx',
    ]) {
      expect(fs.existsSync(path.resolve(ROOT, gone)), `${gone} doit avoir été supprimé`).toBe(false);
    }
    // le mécanisme de blocs reste branché mais ne rend plus rien
    expect(read('client/src/App.tsx')).toMatch(/DEFAULT_HOME_BLOCKS:\s*string\[\]\s*=\s*\[\]/);
    // et la règle de surface qu'ils portaient vit dans les primitives, pas dans un composant
    expect(withoutComments(read(PRIMITIVES))).toMatch(/\.ay-surface-card\s*\{[^}]*--ayrovi-bg-surface/);
  });
});

describe('primitives de la charte', () => {
  test('la feuille des primitives est importée par la feuille racine', () => {
    expect(read(INDEX_CSS)).toMatch(/@import\s+"\.\/styles\/zalando-ui\.css";/);
    expect(fs.existsSync(path.resolve(ROOT, PRIMITIVES))).toBe(true);
  });

  test('les quatre primitives sont définies et sans valeur littérale', () => {
    const body = withoutComments(read(PRIMITIVES));
    for (const klass of ['.ay-surface-card', '.ay-badge', '.ay-icon-action', '.ay-btn-cta', '.ay-accent-rule']) {
      expect(new RegExp(`${klass.replace('.', '\\.')}\\s*[,{]`).test(body), `${klass} doit être défini`).toBe(true);
    }
    expect(body.match(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g) ?? []).toEqual([]);
  });

  test('la carte de surface porte le filet de 3px et jamais de fond orange', () => {
    const rule = withoutComments(read(PRIMITIVES)).match(/\.ay-surface-card\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/background:\s*var\(--ayrovi-bg-surface\)/);
    expect(rule).toMatch(/border-inline-start:\s*3px solid var\(--ayrovi-color-brand-orange\)/);
  });
});

describe("DS v1.0 — verrous d\'échelle (2026-09-18)", () => {
  /**
   * P0 de P4/T2 enfin verrouillé : l'échelle slate héritée est absorbée par la
   * canonique (#111111/#666666/#F8F9FA/#EAEAEA + surfaces #0A0A0A). La couche
   * admin a sa propre palette verrouillée par design-tokens.test.ts : hors périmètre.
   */
  test('aucun résidu de l’échelle slate dans la vitrine (CSS, TSX, TS)', () => {
    const SLATE = /#(1d2130|6b7280|f8f9fe|e2e8f0|5b6472|111318|050505|17181c|111217|171717|23242c)\b/gi;
    const offenders: string[] = [];
    for (const rel of clientFiles(/\.(tsx|ts|css)$/)) {
      if (rel.startsWith('client/src/admin/') || rel === TOKENS) continue;
      const hits = withoutComments(read(rel)).match(SLATE) ?? [];
      if (hits.length) offenders.push(`${rel} → ${[...new Set(hits)].join(' ')}`);
    }
    expect(offenders.join(' | ')).toBe('');
  });

  test('le CTA principal porte le texte ENCRE (6.54:1, AAA) — jamais de blanc', () => {
    const primitives = withoutComments(read(PRIMITIVES));
    const rule = primitives.match(/\.ay-btn-cta\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/color:\s*var\(--ayrovi-cta-ink\)/);
    const runtime = withoutComments(read('client/src/styles/interface-runtime.css'));
    expect(runtime.match(/\.ay-btn-cta\{[^}]*color:#fff/g) ?? []).toEqual([]);
  });

  test('aucune taille de police hors échelle dans la vitrine (ratchet à zéro)', () => {
    // L'échelle est dans tokens.css (text-micro…text-display). Un text-[Npx] dans un
    // composant public est une régression : le ratchet est à 0 et ne monte jamais.
    const offenders: string[] = [];
    for (const rel of clientFiles(/\.tsx$/)) {
      if (rel.startsWith('client/src/admin/')) continue;
      const hits = read(rel).match(/text-\[\d+(?:\.\d+)?px\]/g) ?? [];
      if (hits.length) offenders.push(`${rel} → ${hits.length}`);
    }
    expect(offenders.join(' | ')).toBe('');
  });

  test('le runtime n’override plus l’orange de marque (bug b96f027 corrigé)', () => {
    const app = withoutComments(read('client/src/App.tsx'));
    expect(app).not.toMatch(/color-brand-orange',\s*'#0A0A0A'/i);
    expect(app).not.toMatch(/--ayrovi-cta',\s*'#0A0A0A'/i);
    // et l'accent CMS alimente le jeton canonique (source unique)
    expect(app).toMatch(/color-brand-orange',\s*String\(visual\.colors\.accent/);
  });
});

describe('budget orange — l’orange reste un déclencheur d’action', () => {
  /**
   * Allowlist fermée. Chaque entrée est un ÉTAT ACTIF ou le CTA PRINCIPAL d'un écran —
   * jamais un aplat décoratif. Ajouter une ligne ici doit être justifié ; ajouter un
   * `bg-accent` sur un conteneur ne le sera jamais.
   */
  const ALLOWED = new Map<string, string>([
    ['client/src/design/Button.tsx', 'variante `cta` : le CTA principal'],
    ['client/src/components/HeroSlider.tsx', 'CTA du slide = CTA principal du hero'],
    ['client/src/components/BottomNavBar.tsx', 'point et libellé de navigation actifs'],
    ['client/src/components/assistant/AssistantVoiceOrb.tsx', 'pastille d’écoute, égaliseur et bouton « Terminer et envoyer »'],
    ['client/src/social/components/FullscreenActionRail.tsx', 'icône active du rail plein écran'],
    ['client/src/social/components/StoryFeed.tsx', 'cœur aimé (état actif)'],
    ['client/src/components/assistant/AssistantComposer.tsx', 'bouton d’envoi : CTA principal de l’écran conversation'],
    ['client/src/components/assistant/AssistantVoiceModeScreen.tsx', 'bouton d’écoute : CTA principal de l’écran vocal'],
  ]);

  test('aucun conteneur ne repeint sa surface en orange', () => {
    const offenders: string[] = [];
    for (const rel of clientFiles(/\.tsx$/)) {
      if (rel.startsWith('client/src/admin/')) continue; // couche back-office : charte distincte
      const hits = (read(rel).match(/bg-(accent|cta)(\/|[\s"]|$)/g) ?? []);
      if (hits.length === 0) continue;
      if (!ALLOWED.has(rel)) offenders.push(`${rel} → ${hits.length} (${hits.join(' ')})`);
    }
    expect(offenders.join(' | ')).toBe('');
    expect([...ALLOWED.keys()].every((f) => fs.existsSync(path.resolve(ROOT, f))), 'l’allowlist cite des fichiers réels').toBe(true);
  });

  test('le compte d’usages orange reste sous le plafond mesuré après refonte', () => {
    // MESURÉ après DS v1.0 (2026-09-18) : les variantes cta de la bibliothèque
    // (design/Button.tsx, 7 classes) + CTA assistant (envoi, écoute, orbe) + rail.
    // Le relever exige de justifier chaque nouvel usage.
    const CEILING = 23;
    let used = 0;
    for (const rel of clientFiles(/\.(tsx|css|ts)$/)) {
      if (rel.startsWith('client/src/admin/')) continue;
      const body = withoutComments(read(rel));
      used += (body.match(/bg-(accent|cta)\b|text-cta\b|border-cta\b/g) ?? []).length;
    }
    expect(used).toBeLessThanOrEqual(CEILING);
  });
});
