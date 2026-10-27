/**
 * Lens — le clavier ne doit plus recouvrir le champ de recherche (28/10/2026).
 *
 * ── Le défaut rapporté, mot pour mot ───────────────────────────────────────
 * « خلل وقت البحث بال mot clé، الكلافيي غطّى عليّ رؤية الكتابة » — en mode
 * « mots-clés » (et « adresse »), le champ vit dans le panneau du BAS de la
 * caméra, posé en `position: absolute`. Le clavier s'ouvrait par-dessus : on
 * tapait à l'aveugle.
 *
 * ── Pourquoi un test de SOURCE ─────────────────────────────────────────────
 * Le déplacement réel d'une feuille absolue en fonction du clavier n'est pas
 * observable dans `react-test-renderer` (aucun clavier, aucune fenêtre). Ce qui
 * EST vérifiable, et qui casse si quelqu'un « nettoie » le correctif :
 *
 *   1. le viseur écoute le clavier (`useKeyboardInset`) ;
 *   2. le panneau qui porte les champs est décalé de cette valeur ;
 *   3. l'écoute ne vaut que sur iOS — Android réduit déjà la fenêtre, ajouter
 *      la hauteur du clavier le ferait sauter deux fois trop haut ;
 *   4. les deux champs (adresse + mots-clés) sont bien DANS ce panneau.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const lens = readFileSync(path.join(ROOT, 'app/lens.tsx'), 'utf8');
const hook = readFileSync(path.join(ROOT, 'src/design/useKeyboardInset.ts'), 'utf8');

describe('clavier du viseur Z Lens', () => {
  it('le viseur écoute la hauteur du clavier', () => {
    expect(lens).toContain("import { useKeyboardInset } from '@/design/useKeyboardInset';");
    expect(lens).toMatch(/const keyboardInset = useKeyboardInset\(Platform\.OS === 'ios'\);/);
  });

  it('le panneau des champs remonte de la hauteur du clavier', () => {
    expect(lens).toMatch(/styles\.panel,\s*\{[^}]*bottom:\s*keyboardInset/);
  });

  it('les champs « adresse » et « mots-clés » vivent dans ce panneau', () => {
    const panel = lens.indexOf('testID="lens-panel"');
    expect(panel).toBeGreaterThan(-1);
    const linkField = lens.indexOf('onChangeText={(value) => { setLink(value);');
    const textField = lens.indexOf('onChangeText={setText}');
    expect(linkField).toBeGreaterThan(panel);
    expect(textField).toBeGreaterThan(panel);
  });

  it('le hook n’ajoute AUCUN décalage sur Android (la fenêtre y est déjà réduite)', () => {
    expect(hook).toContain("Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'");
    /* `enabled` doit couper l'abonnement : c'est ce que l'appelant utilise
       pour ne pas écouter le clavier ailleurs qu'iOS. */
    expect(lens).toContain("useKeyboardInset(Platform.OS === 'ios')");
  });
});
