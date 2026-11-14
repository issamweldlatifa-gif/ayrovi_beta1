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
    expect(s).toContain('verified: BRAND_ACCENT');
    // 14/11 : le badge vérifié prend le bleu d'action unique (Bleu Z) — plus deux bleus voisins.
    expect(JSON.parse(fs.readFileSync(path.join(root, '../../assets/brand/appearance.json'), 'utf8')).accent).toBe('#0A63F5');
    for (const hex of [
      '#FFFFFF',
      '#101010',
      '#454545',
      '#666666',
      '#E8E8E8',
      '#0A63F5',
      '#000000',
    ])
      expect(s).toContain(hex);
    for (const file of [
      'PublicationHeader',
      'PublicationTemplatesScreen',
      'templates/MediaTemplate',
      'templates/ContainerTemplate',
      'templates/SponsoredPairTemplate',
      'templates/PublicationVideo',
    ])
      expect(read(dir + file + '.tsx')).not.toContain('@expo/vector-icons');
    expect(read(dir + 'publicationDesign.tsx')).toContain(
      'strokeWidth={PUBLICATION_TYPE.stroke}'
    );
  });
  it('refonte 13/11 : en-tête seul + blocs du CRM ; seul « Suivre » est permis', () => {
    const page = read(dir + 'PublicationTemplatesScreen.tsx');
    expect(page).toContain('<PublicationHeader />');
    expect(page).toContain('fetchPublicationBlocks');
    const templates = walk(dir + 'templates').filter((f) => f.endsWith('.tsx'));
    expect(templates.length).toBeGreaterThanOrEqual(5);
    for (const file of [...templates, dir + 'PublicationTemplatesScreen.tsx', dir + 'PublicationHeader.tsx']) {
      const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      // Ni réaction, ni commentaire, ni partage, ni favori. « Suivre » est permis
      // depuis le 13/11 (« نسيت زر Follow »), mais seulement via `PublicationFollow`.
      // 14/11 (planches GBox) : le cœur des cartes est permis, mais SEULEMENT dans
      // `BlockProductCard` (seul lieu du rond blanc) et branché sur les vrais favoris.
      const hearts = file.endsWith('templates/BlockProductCard.tsx') ? /ReactionButton|sendInteraction|Comments|share-outline|followPublisher/ : /ReactionButton|sendInteraction|Comments|share-outline|heart-outline|'heart'|favorite=|followPublisher/;
      expect(source, file).not.toMatch(hearts);
    }
    expect(read(dir + 'templates/BlockProductCard.tsx')).toContain('usePublicationFavorites');
    expect(read(dir + 'PublicationFavorites.tsx')).toContain('useProductFavorites');
    expect(read(dir + 'PublicationTemplatesScreen.tsx')).toContain('<PublicationFavoritesProvider>');
    // Le bouton « Suivre » des planches : pilule sous le container, en ligne dans l'en-tête media.
    expect(read(dir + 'templates/ContainerTemplate.tsx')).toContain('look="pill"');
    expect(read(dir + 'templates/MediaTemplate.tsx')).toContain('look="inline"');
    // Une seule relation « suivre » : Reels et Publication partagent le même hook.
    expect(read(dir + 'PublicationFollow.tsx')).toContain('usePublisherFollow');
    expect(read('src/features/reels/ReelFollow.tsx')).toContain('usePublisherFollow');
    // L'ancien fil (posts, visionneuse, commentaires) a disparu du dossier.
    for (const gone of ['PublicationFeedScreen', 'PublicationViewer', 'PublicationCard', 'PublicationActions', 'PublicationCommentsSheet'])
      expect(fs.existsSync(path.join(root, dir + gone + '.tsx'))).toBe(false);
  });
});
