/**
 * AYROVI — P3/T1 verrou des tokens de design (couche back-office).
 *
 * Ce fichier ne teste pas les couleurs une par une : il teste la STRUCTURE que la phase T1 était
 * chargée d'installer, et rend la dette impossible à aggraver par inadvertance.
 *
 *  1. les trois feuilles « système » du back-office ne contiennent plus AUCUNE couleur littérale —
 *     toute valeur vit dans `client/src/design/tokens.css` ;
 *  2. `tokens.css` est le seul lieu où un `--admin-*` est défini avec une valeur brute, et chaque
 *     littéral de couleur qu'il déclare est égal, caractère par caractère, au nom du ton qui le
 *     porte (empêche qu'un `--admin-tone-x` glisse vers une valeur « proche ») ;
 *  3. les neuf variables héritées (`--admin-purple`, …) survivent sous leurs noms actuels, parce que
 *     `arrival-ingestion.css` (feuille gelée depuis P2.0) et `AdminApp.tsx` les référencent — le
 *     renommage sémantique est un pas T2, pas T1 ;
 *  4. ratchet : le nombre de références à un ton verbatim `--admin-tone-*` ne peut pas remonter
 *     au-dessus du nombre mesuré au jour de T1 (275), idem pour les littéraux de la feuille gelée
 *     (135) — la consolidation T2 ne peut que les faire baisser ;
 *  5. aucun `var(--x)` utilisé par une feuille système, ni par un style en ligne de la couche
 *     admin (`client/src/admin/**`), ne reste non résolu — à une seule exception allowlistée :
 *     `--bo-icon`, règle CSS morte de `back-office.css` (voir rapport P3/T1 §7, F-2) ;
 *  6. la couche admin ne connaît qu'un seul orange : la valeur de `--ayrovi-cta`.
 *
 * Les nombres de ce fichier sont MESURÉS (scripts/design-token-sweep.cjs --check), pas déduits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/** Les feuilles d'application du back-office : règles seules, zéro valeur. */
const SYSTEM_SHEETS = [
  'client/src/admin/admin.css',
  'client/src/admin/back-office/back-office.css',
  'client/src/admin/interface-studio.css',
];
const TOKENS = 'client/src/design/tokens.css';
/** Feuille gelée depuis P2.0 : elle garde ses littéraux jusqu'à sa conversion (T2). */
const FROZEN_SHEET = 'client/src/admin/arrival-ingestion.css';

/** Plafonds mesurés au 2026-09-06 (P3/T1) : ils ne peuvent que descendre. */
const TONE_REFERENCE_CEILING = 275;
const FROZEN_LITERAL_CEILING = 135;

/** Un `var(--x)` dont personne ne définit `--x` est une indirection morte : allowlist fermée. */
const UNRESOLVED_ALLOWLIST: Record<string, string> = {
  // Règle CSS héritée de P2.0, jamais atteinte depuis T2 : `NavIcon` rend un glyphe du sprite, plus
  // un <i> dont le masque dépendait d'une variable que personne ne déclarait. La règle reste en
  // place (rien n'est supprimé) mais ne peut plus servir de piège — voir rapport P3/T1 §7 (F-2).
  '--bo-icon': 'client/src/admin/back-office/back-office.css:20 — masque inerte, non atteinte depuis P3/T2',
};

const HEX = String.raw`#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_])`;
const COLOR_FN = String.raw`(?:rgba?|hsla?)\([^()]*\)`;
const LITERAL = new RegExp(`${HEX}|${COLOR_FN}`, 'g');

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

/** Tous les fichiers sources du client, chemins relatifs au dépôt. */
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

const literalsIn = (rel: string) => withoutComments(read(rel)).match(LITERAL) ?? [];
const declarations = (text: string) => [...withoutComments(text).matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)];

describe('couche back-office — plus aucune valeur de couleur en dur', () => {
  test('les trois feuilles système sont à zéro littéral', () => {
    const offenders = SYSTEM_SHEETS.map((file) => [file, literalsIn(file)] as const)
      .filter(([, hits]) => hits.length > 0);
    expect(offenders.map(([file, hits]) => `${file} → ${hits.length} (${hits.slice(0, 4).join(' ')})`).join(' | ')).toBe('');
  });

  test('tokens.css est le seul lieu des valeurs de la couche admin', () => {
    const tokens = declarations(read(TOKENS));
    const adminValues = new Map<string, string>();
    for (const [, name, value] of tokens) if (/^--(admin|bo|mag)-/.test(name)) adminValues.set(name, value.trim());
    expect(adminValues.size).toBeGreaterThan(200);
    // une définition de la couche admin ne peut être qu'un littéral (dans tokens.css) ou un alias ;
    // l'inverse — un littéral dans une feuille système — est déjà interdit par le test précédent.
    for (const [name, value] of adminValues) {
      expect(value, `${name} doit porter une valeur simple`).not.toMatch(/;\s*--/);
    }
  });

  test('les valeurs canoniques de la couche admin sont exactes (P3/T2)', () => {
    const tokens = read(TOKENS);
    const canonical: Record<string, string> = {
      '--admin-ink': '#17151f',
      '--admin-line': '#e7e5eb',
      '--admin-ink-strong': '#111318',
      '--admin-ink-black': '#050505',
      '--admin-warm-accent': '#ffb070',
      '--admin-ink-muted': '#71717f',
      '--admin-surface-page': '#f6f6f9',
      '--admin-surface-card': '#fff',
      '--admin-rail': '#17151f',
    };
    for (const [name, value] of Object.entries(canonical)) {
      const declared = declarations(tokens).find(([, n]) => n === name);
      expect(declared, `${name} doit être défini dans tokens.css`).toBeTruthy();
      expect(declared![2].trim().toLowerCase()).toBe(value.toLowerCase());
      for (const file of [...SYSTEM_SHEETS, FROZEN_SHEET]) {
        expect(declarations(read(file)).some(([, n]) => n === name), `${name} redéfini localement dans ${file}`).toBe(false);
      }
    }
    // la feuille gelée continue de consommer la couche de tokens (elle n'a plus de valeurs en dur)
    expect(withoutComments(read(FROZEN_SHEET))).toMatch(/var\(--admin-(ink|line|surface-|tone-)/);
  });

  test('les huit noms hérités survivent comme alias, et plus personne ne les consomme', () => {
    const aliases: Record<string, string> = {
      '--admin-purple': '--admin-ink-strong',
      '--admin-purple-dark': '--admin-ink-black',
      '--admin-yellow': '--admin-warm-accent',
      '--admin-muted': '--admin-ink-muted',
      '--admin-bg': '--admin-surface-page',
      '--admin-card': '--admin-surface-card',
      '--admin-sidebar': '--admin-rail',
    };
    const tokens = read(TOKENS);
    for (const [legacy, canonical] of Object.entries(aliases)) {
      const declared = declarations(tokens).find(([, n]) => n === legacy);
      expect(declared, `${legacy} doit rester défini : la cascade reste ouverte`).toBeTruthy();
      expect(declared![2].trim(), `${legacy} doit n'être qu'un alias de ${canonical}`).toBe(`var(${canonical})`);
    }
    const strays = clientFiles(/\.(css|tsx|ts)$/)
      .filter((rel) => rel !== TOKENS)
      .filter((rel) => Object.keys(aliases).some((legacy) => withoutComments(read(rel)).includes(`var(${legacy})`)));
    expect(strays, 'un nom déprécié encore utilisé — passer au nom canonique').toEqual([]);
  });
});

describe('tons verbatims — dette mesurée, plafonnée', () => {
  test('chaque ton porte exactement la valeur inscrite dans son nom', () => {
    const digits = (s: string) => s.replace(/[^0-9a-f]/g, '');
    const offenders: string[] = [];
    for (const [, name, rawValue] of declarations(read(TOKENS))) {
      if (!name.startsWith('--admin-tone-')) continue;
      const value = rawValue.trim().toLowerCase();
      const slug = name.slice('--admin-tone-'.length);
      if (/^[0-9a-f]{3,8}$/.test(slug)) {
        const hex = value.replace(/^#/, '');
        const expanded = hex.length === 3 || hex.length === 4 ? hex.split('').map((c) => c + c).join('') : hex;
        if (expanded !== slug && hex !== slug) offenders.push(`${name} = ${value}`);
      } else if (/^(rgb|hsl)a?-/.test(slug)) {
        if (!new RegExp(`^${slug.split('-')[0]}a?\\(`).test(value) || digits(slug) !== digits(value)) {
          offenders.push(`${name} = ${value}`);
        }
      } else {
        offenders.push(`${name} = ${value} (nom de ton non reconnu)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('un ton n\u2019est jamais redéfini deux fois avec des valeurs différentes', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const file of [TOKENS, ...SYSTEM_SHEETS, FROZEN_SHEET]) {
      for (const [, name, value] of declarations(read(file))) {
        if (!name.startsWith('--admin-tone-')) continue;
        if (seen.has(name) && seen.get(name) !== value.trim()) duplicates.push(name);
        seen.set(name, value.trim());
      }
    }
    expect(duplicates).toEqual([]);
  });

  test('le nombre de références aux tons ne remonte pas au-dessus du mesure de T1', () => {
    const used = SYSTEM_SHEETS.reduce(
      (sum, file) => sum + (withoutComments(read(file)).match(/--admin-tone-[a-z0-9-]+/g) ?? []).length,
      0,
    );
    expect(used).toBeLessThanOrEqual(TONE_REFERENCE_CEILING);
    // et le plafond enregistré correspond à la réalité d'aujourd'hui (sinon le test ment)
    expect(used).toBeGreaterThan(200);
  });

  test('la feuille gelée ne reçoit aucun littéral supplémentaire', () => {
    const hits = literalsIn(FROZEN_SHEET);
    expect(hits.length).toBeLessThanOrEqual(FROZEN_LITERAL_CEILING);
    expect(hits.length).toBeGreaterThan(0); // la dette est visible, pas masquée
  });
});

describe('aucune indirection morte ajoutée par la migration', () => {
  test('tout var() de la couche admin (CSS et styles en ligne) résout vers une valeur connue', () => {
    const defined = new Set<string>();
    for (const dir of ['client/src']) {
      const walk = (rel: string) => {
        for (const entry of fs.readdirSync(path.resolve(ROOT, rel), { withFileTypes: true })) {
          const child = path.join(rel, entry.name);
          if (entry.isDirectory()) walk(child);
          else if (entry.name.endsWith('.css')) {
            for (const [, name] of declarations(read(child))) defined.add(name);
          }
        }
      };
      walk(dir);
    }
    for (const text of [read('client/src/admin/AdminApp.tsx'), read('client/src/admin/back-office/BackOfficeShell.tsx')]) {
      for (const m of text.matchAll(/['"](--[a-zA-Z0-9-]+)['"]/g)) defined.add(m[1]);
    }
    const unresolved = new Map<string, string[]>();
    const scan = (rel: string, text: string) => {
      for (const m of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
        if (!defined.has(m[1]) && !(m[1] in UNRESOLVED_ALLOWLIST)) {
          unresolved.set(m[1], [...(unresolved.get(m[1]) ?? []), rel]);
        }
      }
    };
    // 1) les feuilles système : le lieu exact du sweep T1
    for (const file of SYSTEM_SHEETS) scan(file, withoutComments(read(file)));
    // 2) les styles en ligne de la couche admin (F-1 né là : `var(--admin-danger)` n'était défini
    //    nulle part et le texte de motif de refus héritait d'une couleur non voulue)
    const walkTsx = (rel: string) => {
      for (const entry of fs.readdirSync(path.resolve(ROOT, rel), { withFileTypes: true })) {
        const child = path.join(rel, entry.name);
        if (entry.isDirectory()) walkTsx(child);
        else if (/\.(tsx|ts)$/.test(entry.name)) scan(child, read(child));
      }
    };
    walkTsx('client/src/admin');
    expect([...unresolved.entries()].map(([name, files]) => `${name} ← ${files.join(', ')}`)).toEqual([]);
  });
});

describe('intégrité structurelle des feuilles', () => {
  test('les accolades restent équilibrées dans chaque feuille touchée', () => {
    // Un bloc mal fermé ne casse pas les tests, il casse le build Tailwind : verrou direct.
    for (const file of [TOKENS, ...SYSTEM_SHEETS]) {
      const body = withoutComments(read(file));
      const open = (body.match(/\{/g) ?? []).length;
      const close = (body.match(/\}/g) ?? []).length;
      expect(`${file} ${open}/${close}`, `${file}: ${open} ouvrantes contre ${close} fermantes`).toBe(`${file} ${close}/${close}`);
    }
  });
});

describe('accent — une seule source', () => {
  test('l\u2019accent du back-office est la valeur unique de --ayrovi-cta', () => {
    const tokens = read(TOKENS);
    const cta = declarations(tokens).find(([, n]) => n === '--ayrovi-cta');
    expect(cta).toBeTruthy();
    expect(cta![2].trim().toLowerCase()).toBe('#fe7003');
    for (const file of SYSTEM_SHEETS) {
      const body = withoutComments(read(file));
      const oranges = (body.match(/var\(--ayrovi-cta\)|var\(--admin-yellow\)/g) ?? []).length;
      expect(oranges, file).toBeGreaterThanOrEqual(0);
    }
    // la coquille et la fiche agent héritent : aucune nouvelle declaration locale d'accent
    expect(withoutComments(read('client/src/admin/admin.css'))).toMatch(
      /\.mag-agent\s*{[^}]*--mag-yellow:\s*var\(--ayrovi-cta\)/,
    );
    expect(withoutComments(read('client/src/admin/back-office/back-office.css'))).toMatch(
      /\.bo-shell\s*{[^}]*--bo-accent:\s*var\(--ayrovi-cta\)/,
    );
  });
});
