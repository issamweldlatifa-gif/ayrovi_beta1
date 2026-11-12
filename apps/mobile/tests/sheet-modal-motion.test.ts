/** Feuilles en `Modal` (12/11/2026) : le voile fond, la feuille monte avec le ressort d'AppSheet. */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.tsx')) out.push(path);
  }
  return out;
}

describe('mouvement unique des feuilles', () => {
  it('plus aucun Modal ne glisse d’un bloc (voile compris)', () => {
    const offenders = [...walk(join(root, 'src')), ...walk(join(root, 'app'))]
      .filter((file) => readFileSync(file, 'utf8').includes('animationType="slide"'))
      .map((file) => file.slice(root.length + 1));
    expect(offenders).toEqual([]);
  });
  it('les anciennes feuilles montent par SheetRise', () => {
    for (const file of [
      'src/features/reels/ReelOptions.tsx',
      'src/features/aywebs/ChoiceField.tsx',
      'src/features/publications/PublicationAuthSheet.tsx',
      'src/features/publications/PublicationCommentsSheet.tsx',
      'app/lens.tsx',
    ]) {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source, file).toContain('<SheetRise');
      expect(source, file).toContain('SHEET_MODAL_ANIMATION');
    }
    const rise = readFileSync(join(root, 'src/design/sheet/SheetRise.tsx'), 'utf8');
    expect(rise).toContain('SHEET_SPRING');
    expect(rise).toContain('useReduceMotion');
  });
});
