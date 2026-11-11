/**
 * Clavier — ne plus jamais taper à l'aveugle (28/10/2026, refondu le 11/11/2026).
 *
 * ── Historique ─────────────────────────────────────────────────────────────
 * 28/10 : « الكلافيي غطّى عليّ رؤية الكتابة » dans Z Lens → correctif iOS
 * seulement, au motif qu'« Android réduit déjà la fenêtre ».
 * 11/11 : « وين نحب نستعملو keyboard ما يبانش وين قاعدين نكتبو » — commentaires
 * de Reel, « Recherche par lien », presque tout champ, SUR ANDROID. Depuis Expo
 * SDK 54 (ici 57), l'edge-to-edge est obligatoire : la fenêtre n'est plus
 * réduite. Toutes les protections « iOS seulement » laissaient Android nu.
 *
 * Ces tests de SOURCE verrouillent la nouvelle règle : un seul mécanisme
 * (`design/keyboard.tsx`), actif sur les DEUX plateformes, branché sur tous
 * les conteneurs qui portent des champs.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { keyboardOverlap, keyboardTopFrom } from '@/design/keyboardLogic';

const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');
const lens = read('app/lens.tsx');

describe('recouvrement réel (pur)', () => {
  it('vue plein écran, clavier dont le haut est à 524 → 320 de recouvrement', () => {
    expect(keyboardOverlap(0, 844, 524)).toBe(320);
  });
  it('fenêtre déjà réduite (vue au-dessus du clavier) → 0, jamais de double décalage', () => {
    expect(keyboardOverlap(0, 524, 524)).toBe(0);
    expect(keyboardOverlap(0, 500, 524)).toBe(0);
  });
  it('vue posée au-dessus de la barre d’onglets → seulement la part recouverte', () => {
    expect(keyboardOverlap(0, 780, 524)).toBe(256);
  });
  it('clavier fermé ou haut inconnu → 0', () => {
    expect(keyboardOverlap(0, 844, null)).toBe(0);
    expect(keyboardOverlap(0, 844, Number.NaN)).toBe(0);
  });
  it('haut du clavier : screenY d’abord, sinon écran − hauteur', () => {
    expect(keyboardTopFrom({ screenY: 524, height: 270 }, 844)).toBe(524);
    expect(keyboardTopFrom({ screenY: 0, height: 270 }, 844)).toBe(574);
    expect(keyboardTopFrom({ height: 0 }, 844)).toBeNull();
    expect(keyboardTopFrom(null, 844)).toBeNull();
  });
});

describe('aucune protection « iOS seulement »', () => {
  const files = [
    'app/lens.tsx', 'app/sign-in.tsx', 'app/forgot.tsx',
    'src/design/layout.tsx', 'src/design/subScreen.tsx', 'src/design/sheet/AppSheet.tsx',
    'src/features/publications/PublicationCommentsSheet.tsx', 'src/features/publications/PublicationViewer.tsx',
  ];
  it.each(files)('%s n’utilise plus KeyboardAvoidingView ni useKeyboardInset(ios)', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/<KeyboardAvoidingView/);
    expect(source).not.toContain("useKeyboardInset(Platform.OS === 'ios')");
  });
});

describe('branchements', () => {
  it('Z Lens : la scène se mesure, le panneau des champs remonte du recouvrement', () => {
    expect(lens).toContain("import { useKeyboardOverlap } from '@/design/keyboard';");
    expect(lens).toContain('const lensKeyboard = useKeyboardOverlap(true);');
    expect(lens).toMatch(/ref=\{lensKeyboard\.ref\}\s*onLayout=\{lensKeyboard\.measure\}/);
    expect(lens).toMatch(/styles\.panel,\s*\{[^}]*bottom:\s*keyboardInset/);
  });
  it('les champs « adresse » et « mots-clés » vivent dans ce panneau', () => {
    const panel = lens.indexOf('testID="lens-panel"');
    expect(panel).toBeGreaterThan(-1);
    expect(lens.indexOf('onChangeText={(value) => { setLink(value);')).toBeGreaterThan(panel);
    expect(lens.indexOf('onChangeText={setText}')).toBeGreaterThan(panel);
  });
  it('AppSheet (commentaires des Reels…) remonte et réduit sa hauteur', () => {
    const sheet = read('src/design/sheet/AppSheet.tsx');
    expect(sheet).toContain('const keyboard = useKeyboardOverlap(open);');
    expect(sheet).toContain('bottom: keyboardLift,');
    expect(sheet).toContain('maxHeight: presentation === \'bottom\' ? availableHeight : undefined,');
  });
  it('AppScreen évite le clavier PAR DÉFAUT, SubScreen toujours', () => {
    expect(read('src/design/layout.tsx')).toContain('keyboard = true,');
    expect(read('src/design/subScreen.tsx').match(/<KeyboardAvoider/g)?.length).toBe(2);
  });
  it('le hook écoute Android (keyboardDidShow) ET iOS (keyboardWillChangeFrame)', () => {
    const hook = read('src/design/keyboard.tsx');
    expect(hook).toContain("Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow'");
    expect(hook).not.toMatch(/enabled\s*=\s*Platform\.OS === 'ios'/);
  });
});
