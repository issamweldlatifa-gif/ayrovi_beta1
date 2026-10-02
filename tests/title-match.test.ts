import { describe, expect, it } from 'vitest';
import { normalizeTitle, titleOverlap } from '../src/ayrovix/services/titleMatch';

describe('correspondance de titres — la preuve avant les faits', () => {
  it('le recouvrement ignore casse, accents et ponctuation', () => {
    expect(normalizeTitle('Crème  ÉCLAT, 50ml')).toBe('creme eclat 50ml');
    expect(titleOverlap('Nike Air Max 270', 'nike air max 270 homme')).toBe(1);
    expect(titleOverlap('Nike Air Max 270', 'Cafetière inox')).toBe(0);
  });
});
