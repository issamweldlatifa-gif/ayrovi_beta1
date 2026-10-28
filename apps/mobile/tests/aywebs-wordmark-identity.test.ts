/**
 * AYWEBs — le mot-symbole est-il VRAIMENT notre violet ? (28/10/2026)
 *
 * ── La remarque du client ───────────────────────────────────────────────────
 * « في إضافة AYWEBs، اللوغو ماخذاش لون البنفسجي الرسمي نتاعنا وحجمو متوسط. »
 *
 * Une couleur ne se vérifie pas à l'œil sur une capture d'écran compressée :
 * elle se lit dans les PIXELS du fichier livré. Ce test décode le PNG
 * (IHDR + IDAT + dé-filtrage, avec `node:zlib` — aucune dépendance ajoutée) et
 * compare la couleur dominante des pixels opaques à `COLORS.light.accent`, le
 * violet officiel de l'identité (`#571EF6`).
 *
 * Il verrouille aussi la TAILLE : le ratio du fichier (551 × 147 ≈ 3.75) est
 * respecté par les deux endroits qui l'affichent, sinon le mot-symbole est
 * étiré et paraît « moyen ».
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

type Rgba = [number, number, number, number];

/** Décode un PNG 8 bits RGBA (type 6) ou RGB (type 2) sans dépendance. */
function decodePng(file: string): { width: number; height: number; pixels: Rgba[] } {
  const buffer = readFileSync(file);
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG');

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8], 'profondeur 8 bits attendue').toBe(8);
      colorType = data[9];
      expect([2, 6]).toContain(colorType);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  /* Dé-filtrage PNG (les cinq filtres de la spécification, section 9). */
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const previous = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const target = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? target[x - channels] : 0;
      const up = previous ? previous[x] : 0;
      const upLeft = previous && x >= channels ? previous[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      target[x] = value & 0xff;
    }
  }

  const pixels: Rgba[] = [];
  for (let index = 0; index < width * height; index += 1) {
    const base = index * channels;
    pixels.push([out[base], out[base + 1], out[base + 2], channels === 4 ? out[base + 3] : 255]);
  }
  return { width, height, pixels };
}

const hex = ([r, g, b]: Rgba): string =>
  `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Couleur officielle, lue dans les jetons générés (jamais recopiée ici). */
function officialViolet(): string {
  const source = readFileSync(path.join(ROOT, 'src/design/tokens.generated.ts'), 'utf8');
  const light = /light:\s*\{[\s\S]*?\n  \},/.exec(source)?.[0] ?? '';
  const accent = /accent:\s*"(#[0-9A-Fa-f]{6})"/.exec(light);
  if (!accent) throw new Error('accent introuvable dans tokens.generated.ts');
  return accent[1].toUpperCase();
}

describe('mot-symbole AYWEBs — couleur et taille', () => {
  const violet = decodePng(path.join(ROOT, 'assets/aywebs/aywebs-wordmark-violet.png'));

  it('le violet du fichier est EXACTEMENT le violet officiel de l’identité', () => {
    expect(officialViolet()).toBe('#571EF6');

    const counts = new Map<string, number>();
    for (const pixel of violet.pixels) {
      if (pixel[3] < 40) continue; // contour antialiasé : il ne porte pas la couleur
      const key = hex(pixel);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const [dominant] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    /* « ماخذاش لون البنفسجي الرسمي » : la couleur dominante, pas une teinte
       approchante. Le fichier d'origine (#6A3B89) est resté dans le dépôt
       comme référence historique ; celui-ci est celui de l'application. */
    expect(dominant[0]).toBe(officialViolet());
  });

  it('le ratio du fichier est respecté là où il est affiché', () => {
    const ratio = violet.width / violet.height;
    expect(ratio).toBeCloseTo(3.75, 1);

    const header = readFileSync(path.join(ROOT, 'src/features/shell/AppHeader.tsx'), 'utf8');
    const headerSize = /aywebsWordmark:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)\s*\}/.exec(header);
    expect(headerSize, 'taille du mot-symbole introuvable dans AppHeader').not.toBeNull();
    const [, headerWidth, headerHeight] = headerSize as RegExpExecArray;
    expect(Number(headerWidth) / Number(headerHeight)).toBeCloseTo(ratio, 1);

    /* « وحجمو متوسط » : à 36 pt de haut le mot-symbole se lisait à peine.
       Le nouveau gabarit ne descend plus sous 40. */
    expect(Number(headerHeight)).toBeGreaterThanOrEqual(40);

    const sheet = readFileSync(path.join(ROOT, 'src/features/aywebs/AddToCartSheet.tsx'), 'utf8');
    expect(sheet).toContain('aywebs-wordmark-violet.png');
    /* Le fichier violet est le même partout : deux appels, une seule source. */
    expect(header).toContain("theme.mode === 'dark'");
    expect(header).toContain('aywebs-wordmark-white.png');
    expect(sheet).toContain('aywebs-wordmark-white.png');

    /* Onglet AYWEBs (28/10/2026) : le mot-symbole remplace l'icône générique
       dans la barre du bas — même fichier, même ratio, même traitement. */
    const tabs = readFileSync(path.join(ROOT, 'app/(tabs)/_layout.tsx'), 'utf8');
    expect(tabs).toContain('aywebs-wordmark-violet.png');
    expect(tabs).toContain('aywebs-wordmark-white.png');
    expect(tabs.includes('pricetags'), 'la puce générique doit avoir disparu').toBe(false);
    const tabSize = /AYWEB_TAB_LOGO = \{\s*width:\s*(\d+),\s*height:\s*(\d+)\s*\}/.exec(tabs);
    expect(tabSize, 'taille du mot-symbole introuvable dans la barre du bas').not.toBeNull();
    const [, tabWidth, tabHeight] = tabSize as RegExpExecArray;
    expect(Number(tabWidth) / Number(tabHeight)).toBeCloseTo(ratio, 1);

    const sheetSize = /headerWordmark:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)\s*\}/.exec(sheet);
    expect(sheetSize, 'taille du mot-symbole introuvable dans la feuille d’ajout').not.toBeNull();
    const [, sheetWidth, sheetHeight] = sheetSize as RegExpExecArray;
    expect(Number(sheetWidth) / Number(sheetHeight)).toBeCloseTo(ratio, 1);
  });
});
