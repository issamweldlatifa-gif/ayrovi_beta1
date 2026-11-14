import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Retour sur appareil du 14/11/2026 (captures 125034 → 125105, planches
 * Zalando 125655 → 125749) :
 *  1. système d'espacement (`RHYTHM`) appliqué — Publication d'abord ;
 *  2. barre Publication redessinée + signet « Enregistrer » ;
 *  3. feuille de commentaires « bloquée » (dessinée DANS la rangée de liste) ;
 *  4. bouton son du Reel dans la même famille que le rail ;
 *  5. icônes du bloc transparentes ; 6. icônes plus grandes ;
 *  7. cœurs du double-tap rapides et fluides ; 8. J'aime posé cerné de blanc ;
 *  9. tons courts pour J'aime et commentaire.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

describe('1 — système d’espacement RHYTHM', () => {
  it('chaque rôle vient de l’échelle de l’identité, et les rôles croissent strictement', async () => {
    const { RHYTHM } = await import('../src/design/tokens.mobile');
    const { SPACE } = await import('../src/design/tokens.generated');
    const values = Object.values(RHYTHM);
    for (const value of values) expect(SPACE as readonly number[]).toContain(value);
    for (let i = 1; i < values.length; i += 1) expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    expect(RHYTHM).toMatchObject({ inline: 4, tight: 8, related: 12, group: 16, block: 24, cluster: 32, section: 48, chapter: 64 });
  });

  it('Publication : la barre colle à son bloc, le blanc sépare les blocs (proximité)', async () => {
    const { PUBLICATION_TEMPLATE: T } = await import('../src/features/publications/templates/templateMetrics');
    expect(T.barTop).toBe(4);
    expect(T.blockSpacing).toBe(32);
    expect(T.blockSpacing).toBeGreaterThan(T.barTop * 4);
    expect(read('src/features/publications/publicationTokens.ts')).toMatch(/cardTextTop: 12,/);
  });

  it('les propriétaires globaux passent au rythme (écrans, en-têtes de section, feuilles)', () => {
    expect(code('src/design/layoutLogic.ts')).toContain('const gap = space[3];');
    expect(code('src/design/ui.tsx')).toContain('gap: RHYTHM.inline');
    expect(code('src/design/sheet/AppSheet.tsx')).toMatch(/body: \{ paddingHorizontal: RHYTHM\.group, paddingVertical: RHYTHM\.related, gap: RHYTHM\.related \}/);
  });
});

describe('2–3 — barre redessinée, signet, feuille en portail', () => {
  const engagement = code('src/features/publications/PublicationEngagement.tsx');
  const screen = code('src/features/publications/PublicationTemplatesScreen.tsx');

  it('la feuille de commentaires est rendue par le portail, l’hôte à la racine de l’écran', () => {
    expect(engagement).toMatch(/<SheetPortal>\s*<PublicationCommentsSheet/);
    expect(screen).toMatch(/<SheetPortalHost>[\s\S]*<FlatList[\s\S]*<\/SheetPortalHost>/);
    const portal = code('src/design/sheet/SheetPortal.tsx');
    expect(portal).toContain("pointerEvents=\"box-none\" style={StyleSheet.absoluteFill}");
    // Hors hôte : rendu sur place (aperçus, tests isolés).
    expect(portal).toContain('return store ? null : <>{children}</>;');
  });

  it('signet : fournisseur à l’écran, invité ⇒ connexion, état lisible au lecteur d’écran', () => {
    expect(screen).toMatch(/<PublicationSavedProvider>[\s\S]*<FlatList/);
    expect(engagement).toMatch(/<ReelGlyph name="bookmark" size=\{icon\} color=\{P\.ink\} filled=\{isSaved\} \/>/);
    expect(engagement).toContain('accessibilityState={{ selected: isSaved }}');
    expect(code('src/features/publications/PublicationSaved.tsx')).toMatch(/if \(!owner\) \{ setAuth\(true\); return; \}/);
  });

  it('mémoire des enregistrements : lecture tolérante, bascule, plafond, clé par compte', async () => {
    vi.doMock('@react-native-async-storage/async-storage', () => ({ default: {} }));
    vi.doMock('@/state/session', () => ({ useSession: () => ({ status: 'guest' }) }));
    vi.doMock('../src/features/publications/PublicationAuthSheet', () => ({ PublicationAuthSheet: () => null }));
    const saved = await import('../src/features/publications/PublicationSaved');
    expect(saved.parseSavedBlocks(null)).toEqual([]);
    expect(saved.parseSavedBlocks('oops')).toEqual([]);
    expect(saved.parseSavedBlocks('{"a":1}')).toEqual([]);
    expect(saved.parseSavedBlocks('["a", 3, "", "b", "a"]')).toEqual(['a', 'b']);
    expect(saved.toggleSavedBlock(['a'], 'b')).toEqual(['a', 'b']);
    expect(saved.toggleSavedBlock(['a', 'b'], 'a')).toEqual(['b']);
    const many = Array.from({ length: saved.PUBLICATION_SAVED_LIMIT }, (_, i) => `id${i}`);
    const next = saved.toggleSavedBlock(many, 'new');
    expect(next).toHaveLength(saved.PUBLICATION_SAVED_LIMIT);
    expect(next.at(-1)).toBe('new');
    expect(saved.publicationSavedKey('acc-1')).toBe('publication-saved:acc-1');
  });

  it('icônes de la barre : 24 (au lieu de 18), à l’encre, au trait', () => {
    expect(engagement).toMatch(/<ReelGlyph name="comment" size=\{icon\} color=\{P\.ink\} \/>/);
    expect(engagement).toMatch(/<ReelGlyph name="share" size=\{icon\} color=\{P\.ink\} mirrored=\{theme\.isRTL\} \/>/);
  });
});

describe('4–6, 8 — famille de glyphes', () => {
  const icons = code('src/features/reels/ReelIcons.tsx');

  it('le haut-parleur a une forme PLEINE adoucie, comme le reste du rail', () => {
    expect(icons).toMatch(/SOFT_FILLED[^=]*= new Set\(\[[^\]]*'muted', 'sound', 'bookmark'\]\)/);
    expect(icons).toMatch(/<Rect \{\.\.\.SPEAKER_CUFF\} fill=\{fill\}/);
    expect(icons).toMatch(/<Path d=\{SPEAKER_HORN\} fill=\{fill\}/);
  });

  it('la bulle au trait est VIDE (transparente) — les points restent percés dans la pleine', () => {
    expect(icons).toMatch(/<Path d=\{BUBBLE\} fill="none" \{\.\.\.stroke\} \/>/);
    expect(icons).not.toMatch(/BUBBLE_DOTS\.map\(\(\[cx, cy\]\) => \(\s*<Circle/);
    expect(icons).toContain('BUBBLE_PIERCED');
  });

  it('liseré des réactions posées : contour de la teinte puis anneau blanc', () => {
    expect(icons).toMatch(/export const REEL_GLYPH_RIM = 0\.9;/);
    expect(icons).toMatch(/glyphBody\(name, color, true, RIM_OUTLINE\)/);
    expect(icons).toMatch(/glyphBody\(name, color, true, 0, rim, REEL_GLYPH_RIM\)/);
  });

  it('rail Reels : glyphes de 30 sur vidéo, bouton de réaction compris', async () => {
    const { MEDIA_RAIL_GLYPH, ICON_SIZE } = await import('../src/design/tokens.mobile');
    expect(MEDIA_RAIL_GLYPH).toBe(30);
    expect(MEDIA_RAIL_GLYPH).toBeGreaterThan(ICON_SIZE.md);
    expect(MEDIA_RAIL_GLYPH).toBeLessThan(ICON_SIZE.lg);
    expect(code('src/features/reels/ReelShopTray.tsx')).toMatch(/ink=\{onMedia\}\s*size=\{MEDIA_RAIL_GLYPH\}/);
  });

  it('la vidéo d’un bloc Publication utilise le même haut-parleur plein', () => {
    expect(code('src/features/publications/templates/PublicationVideo.tsx')).toMatch(/<ReelGlyph name=\{muted \? 'muted' : 'sound'\}[^>]*filled \/>/);
  });
});

describe('7 — cœurs du double-tap', () => {
  it('une seule horloge native de 640 ms (plus de ressort mou + pause + envol)', () => {
    const hearts = code('src/design/reactions/DoubleTapHearts.tsx');
    expect(hearts).toMatch(/lifetime: 640,/);
    expect(hearts).not.toMatch(/Animated\.spring|Animated\.delay|Animated\.sequence/);
    expect(hearts).toMatch(/Animated\.timing\(clock, \{[\s\S]*?useNativeDriver: true/);
    expect(hearts).toContain('renderToHardwareTextureAndroid');
  });
});

describe('9 — tons d’interaction', () => {
  beforeEach(() => { vi.resetModules(); });

  it('les deux fichiers existent, courts (< 16 Ko), en WAV PCM', () => {
    for (const name of ['like', 'comment']) {
      const file = fs.readFileSync(path.join(ROOT, `assets/sounds/${name}.wav`));
      expect(file.subarray(0, 4).toString()).toBe('RIFF');
      expect(file.subarray(8, 12).toString()).toBe('WAVE');
      expect(file.length).toBeLessThan(16 * 1024);
    }
  });

  it('J’aime sonne quand on POSE une réaction (jamais au retrait) ; le commentaire au succès serveur', () => {
    expect(code('src/design/reactions/useContentReaction.ts')).toMatch(/if \(next === 'like' \|\| next === 'love'\) playInteractionSound\('like'\);/);
    for (const rel of ['src/features/publications/PublicationEngagement.tsx', 'src/features/social/ReelCommentsModal.tsx']) {
      expect(code(rel)).toMatch(/onSuccess: \(result\) => \{\s*playInteractionSound\('comment'\);/);
    }
  });

  it('sans module natif : muet, ne lève jamais ; rafale bornée', async () => {
    const sounds = await import('../src/design/feedback/interactionSounds');
    sounds.resetInteractionSoundsForTests({ audio: () => { throw new Error('no native module'); }, source: () => 1 });
    expect(() => sounds.playInteractionSound('like', 1000)).not.toThrow();
    expect(sounds.playInteractionSound('like', 5000)).toBe(false);
    expect(sounds.playInteractionSound('comment', 9000)).toBe(false);
  });

  it('avec le module : rejoue depuis 0 au volume des tons, et ignore un doublon à moins de 120 ms', async () => {
    const player = { volume: 1, seekTo: vi.fn(async () => undefined), play: vi.fn() };
    const createAudioPlayer = vi.fn(() => player);
    const sounds = await import('../src/design/feedback/interactionSounds');
    sounds.resetInteractionSoundsForTests({ audio: () => ({ createAudioPlayer }) as never, source: (kind) => (kind === 'like' ? 1 : 2) });
    expect(sounds.playInteractionSound('like', 1000)).toBe(true);
    expect(createAudioPlayer).toHaveBeenCalledWith(1);
    expect(player.volume).toBe(sounds.INTERACTION_SOUND_VOLUME);
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(sounds.playInteractionSound('like', 1050)).toBe(false);
    expect(sounds.playInteractionSound('like', 1200)).toBe(true);
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    sounds.resetInteractionSoundsForTests();
  });
});
