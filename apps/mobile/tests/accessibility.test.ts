/**
 * Verrou d'accessibilité — le §a11y traduit en tests, comme le verrou du
 * Design System traduit le §17/§21.
 *
 * Trois règles, vérifiables sans appareil :
 *
 *  1. **Un bouton icône seul a un nom.** Un `Pressable` qui ne contient ni
 *     texte ni `accessibilityLabel` est muet pour TalkBack/VoiceOver : on ne
 *     sait pas ce qu'il fait. (Un `Pressable` avec un enfant texte est
 *     auto-étiqueté : le texte EST le nom.)
 *
 *  2. **Une image a un nom ou est déclarée décorative.** `AppImage` exige
 *     `accessibilityLabel` ou `decorative` — jamais une image muette qui
 *     s'annonce « image » sans dire ce qu'elle montre.
 *
 *  3. **Aucun libellé d'accessibilité en dur.** `accessibilityLabel="…"`
 *     littéral = texte figé, non traduit, non relu. Tout libellé passe par
 *     `t(...)` ou une variable — comme tout le reste de l'interface.
 *
 * La détection lit le tag d'ouverture au crochet près : les `>` des fonctions
 * fléchées (`() =>`) sont ignorés en suivant la profondeur des accolades.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sources(rel));
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const FILES = [...sources('app'), ...sources('src')];

/** Le code, sans ses commentaires. */
function code(rel: string): string {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Fin du tag d'ouverture : le premier `>` hors de toute accolade. */
function openingTagEnd(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return i;
  }
  return -1;
}

interface Block { tag: string; body: string }

function pressableBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const re = /<Pressable\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const end = openingTagEnd(text, match.index);
    if (end < 0) continue;
    const tag = text.slice(match.index, end + 1);
    const close = text.indexOf('</Pressable>', end);
    const body = close > end ? text.slice(end + 1, close) : '';
    blocks.push({ tag, body });
    re.lastIndex = end + 1;
  }
  return blocks;
}

function appImageTags(text: string): string[] {
  const tags: string[] = [];
  const re = /<AppImage\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const end = openingTagEnd(text, match.index);
    if (end < 0) continue;
    tags.push(text.slice(match.index, end + 1));
    re.lastIndex = end + 1;
  }
  return tags;
}

describe('Accessibilité — verrou', () => {
  it('aucun Pressable icône-seul sans nom', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      const text = code(rel);
      for (const { tag, body } of pressableBlocks(text)) {
        const hasVisual = /<(Ionicons|AppImage|Image)\b/.test(body);
        const hasText = /<(AppText|Text)\b/.test(body);
        const hasLabel = /accessibilityLabel=/.test(tag);
        if (hasVisual && !hasText && !hasLabel) {
          const line = text.slice(0, text.indexOf(tag)).split('\n').length;
          offenders.push(`${rel}:${line} → bouton visuel sans nom`);
        }
      }
    }
    expect(
      offenders,
      'Un bouton qui ne montre qu’une icône/une image DOIT porter un ' +
        '`accessibilityLabel` — sinon le lecteur d’écran est muet.',
    ).toEqual([]);
  });

  it('toute AppImage a un nom ou est déclarée décorative', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      const text = code(rel);
      for (const tag of appImageTags(text)) {
        const named = /accessibilityLabel=/.test(tag) || /\bdecorative\b/.test(tag);
        if (!named) {
          const line = text.slice(0, text.indexOf(tag)).split('\n').length;
          offenders.push(`${rel}:${line} → AppImage sans nom ni decorative`);
        }
      }
    }
    expect(
      offenders,
      'Une image muette s’annonce « image » sans dire ce qu’elle montre. ' +
        '`accessibilityLabel` pour une image porteuse de sens, `decorative` sinon.',
    ).toEqual([]);
  });

  it('aucun libellé d’accessibilité écrit en dur', () => {
    const offenders: string[] = [];
    for (const rel of FILES) {
      const text = code(rel);
      for (const match of text.matchAll(/accessibilityLabel="(?!\{)([^"]*)"/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line} → « ${match[1]} » (littéral, non traduit)`);
      }
    }
    expect(
      offenders,
      'Un libellé d’accessibilité est un texte : il passe par `t(...)` comme ' +
        'le reste, jamais par une chaîne figée.',
    ).toEqual([]);
  });
});
