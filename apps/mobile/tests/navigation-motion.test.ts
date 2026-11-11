import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stackMotion } from '../src/design/navigationMotion';

describe('mouvement de navigation (11/11)', () => {
  it('pousse depuis le bord de lecture, et le respecte en arabe', () => {
    expect(stackMotion(false, false).push.animation).toBe('slide_from_right');
    expect(stackMotion(true, false).push.animation).toBe('slide_from_left');
    expect(stackMotion(false, false).push.gestureEnabled).toBe(true);
  });
  it('feuilles depuis le bas, médias en fondu, rien si moins de mouvement', () => {
    const motion = stackMotion(false, false);
    expect(motion.sheet.animation).toBe('slide_from_bottom');
    expect(motion.media.animation).toBe('fade');
    const reduced = stackMotion(false, true);
    expect([reduced.push.animation, reduced.sheet.animation, reduced.media.animation]).toEqual(['none', 'none', 'none']);
  });
  it('le Stack racine applique ces options (Reels, Lens et stories en fondu)', () => {
    const layout = readFileSync(join(__dirname, '../app/_layout.tsx'), 'utf8');
    expect(layout).toContain('...motion.push');
    for (const name of ['reels-viewer', 'z-lens', 'lens', 'stories']) {
      expect(layout).toContain(`<Stack.Screen name="${name}" options={motion.media} />`);
    }
  });
});
