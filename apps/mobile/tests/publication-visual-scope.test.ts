import { publicationCount } from '../src/features/publications/publicationFormat';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const dir = 'src/features/publications/';
function walk(p: string): string[] {
  return fs
    .readdirSync(path.join(root, p), { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(`${p}/${e.name}`) : [`${p}/${e.name}`]
    );
}
describe('Publication-only visual model, not a second commerce or social core', () => {
  it('does not leak visual imports into product, cart, checkout or global UI', () => {
    const users = walk('src').filter(
      (f) =>
        /\.tsx?$/.test(f) && /publicationDesign|publicationTokens/.test(read(f))
    );
    expect(
      users.filter(
        (f) => !f.startsWith(dir) && f !== 'src/features/social/Comments.tsx'
      )
    ).toEqual([]);
  });
  it('keeps shared Comments opt-in and defaults to the original brand renderer', () => {
    const s = read('src/features/social/Comments.tsx');
    expect(s).toContain('publication = false');
    expect(s).toContain('publication ? PublicationText : BrandText');
    expect(s).toContain('publication ? PublicationIcon : BrandIcon');
  });
  it('bundles renamed licensed font instances without replacing global brand fonts', () => {
    for (const name of ['Regular', 'SemiBold']) {
      const file = path.join(root, `assets/fonts/Publication-${name}.ttf`);
      expect(fs.readFileSync(file).readUInt32BE(0)).toBe(0x00010000);
      expect(read('src/config/app.ts')).toContain(`'Publication-${name}'`);
    }
    expect(read('assets/fonts/Publication-OFL.txt')).toContain(
      'SIL OPEN FONT LICENSE'
    );
    expect(read('src/config/app.ts')).toContain('AyroviExtracted-Regular');
  });
  it('uses local neutrals, separate badge/link blues and a single original content icon renderer', () => {
    const s = read(dir + 'publicationTokens.ts');
    for (const hex of [
      '#FFFFFF',
      '#101010',
      '#454545',
      '#666666',
      '#E8E8E8',
      '#0095F6',
      '#0078CA',
      '#000000',
    ])
      expect(s).toContain(hex);
    for (const file of [
      'PublicationActions',
      'PublicationMedia',
      'PublicationFeedScreen',
      'PublicationViewer',
    ])
      expect(read(dir + file + '.tsx')).not.toContain('@expo/vector-icons');
    expect(read(dir + 'publicationDesign.tsx')).toContain(
      'strokeWidth={PUBLICATION_TYPE.stroke}'
    );
  });
  it('reuses persisted social and preference endpoints without inventing unsupported menu actions', () => {
    const sheet = read(dir + 'PublicationPostOptions.tsx');
    expect(sheet).toContain('writePublicationPreference(');
    expect(sheet).not.toMatch(/Traduire|Bloquer|Signaler|Meta AI/);
    expect(read('src/features/social/Comments.tsx')).toContain(
      'sendInteraction({'
    );
    expect(read(dir + 'PublicationFeedScreen.tsx')).toContain(
      'setViewer(item)'
    );
  });
});

it('formats only real nonnegative counters compactly without changing the source', () => {
  expect(publicationCount(42, 'fr')).toBe('42');
  expect(publicationCount(1500, 'fr').replace(/\s/g, '')).toBe('1,5K');
  expect(publicationCount(-2, 'fr')).toBe('0');
  expect(publicationCount(NaN, 'ar')).toBe('0');
});
