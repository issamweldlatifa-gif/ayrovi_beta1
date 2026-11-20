import { describe, expect, it } from 'vitest';
import { initialSheetQuantity, isSelectionCapture, pageQuantityOf } from '@/features/aywebs/storeSheetMode';

describe('quantité de la feuille catalogue', () => {
  it('distingue une ancienne capture en cache du parcours catalogue', () => {
    expect(isSelectionCapture({ captureMode: 'selection' })).toBe(true);
    expect(isSelectionCapture({ contract: { store: 'shein' } })).toBe(false);
  });

  it('quantité de la page : lue dans la capture ou dans captured_selection, bornée 1…99', () => {
    expect(pageQuantityOf({ pageQuantity: 3 })).toBe(3);
    expect(pageQuantityOf({ capturedSelection: { pageQuantity: 2 } })).toBe(2);
    expect(pageQuantityOf({ pageQuantity: 0 })).toBeNull();
    expect(pageQuantityOf({ pageQuantity: 150 })).toBeNull();
    expect(pageQuantityOf(null)).toBeNull();
  });

  it('la quantité de la page pré-remplit la feuille tant que le client n’y a pas touché', () => {
    expect(initialSheetQuantity(3, 10, false, 1)).toBe(3);
    expect(initialSheetQuantity(30, 10, false, 1)).toBe(10);
    expect(initialSheetQuantity(3, 10, true, 5)).toBe(5);
    expect(initialSheetQuantity(null, 10, false, 1)).toBe(1);
  });

});
