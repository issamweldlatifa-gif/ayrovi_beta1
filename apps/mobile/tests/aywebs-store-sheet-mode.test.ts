import { describe, expect, it } from 'vitest';
import { readOnlyStoreSelection } from '@/features/aywebs/storeSheetMode';

describe('mode de feuille par boutique', () => {
  it('Amazon et Zalando gardent le choix interactif historique', () => {
    expect(readOnlyStoreSelection('amazon')).toBe(false);
    expect(readOnlyStoreSelection('Zalando')).toBe(false);
  });
  it('les autres boutiques et les identifiants inconnus restent inchangés', () => {
    for (const id of ['shein', 'temu', 'aliexpress', '', null, 'unknown']) {
      expect(readOnlyStoreSelection(id)).toBe(true);
    }
  });
});
