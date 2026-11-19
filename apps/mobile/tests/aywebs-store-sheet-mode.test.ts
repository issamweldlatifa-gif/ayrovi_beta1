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

describe('principe « le client choisit sur la page » (19/11/2026)', async () => {
  const { initialSheetQuantity, pageQuantityOf } = await import('@/features/aywebs/storeSheetMode');
  const { selectionConfirmDelayMs, prefetchIsSelectionSnapshot, AYWEBS_SELECTION_CONFIRM_DELAY_MS } = await import('@/features/aywebs/captureFlow');

  it('capture en mode sélection ⇒ feuille en lecture seule pour TOUTES les boutiques, Amazon et Zalando compris', () => {
    for (const id of ['amazon', 'zalando', 'shein', 'temu', 'aliexpress']) {
      expect(readOnlyStoreSelection(id, { captureMode: 'selection' })).toBe(true);
    }
  });

  it('retour arrière « matrix » (capture non marquée) ⇒ Amazon et Zalando retrouvent le choix dans la feuille', () => {
    expect(readOnlyStoreSelection('amazon', { title: 'x' })).toBe(false);
    expect(readOnlyStoreSelection('zalando', null)).toBe(false);
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

  it('double lecture : relecture à ~400 ms, sauf si deux lectures identiques sont déjà prouvées', () => {
    expect(selectionConfirmDelayMs({ captureMode: 'selection', selection: { reads: 1 } }, 0)).toBe(AYWEBS_SELECTION_CONFIRM_DELAY_MS);
    expect(AYWEBS_SELECTION_CONFIRM_DELAY_MS).toBe(400);
    expect(selectionConfirmDelayMs({ captureMode: 'selection', selection: { reads: 2, stable: true } }, 0)).toBeNull();
    // Deux lectures différentes (la page bougeait) ⇒ une relecture de plus, bornée.
    expect(selectionConfirmDelayMs({ captureMode: 'selection', selection: { reads: 2, stable: false } }, 1)).toBe(400);
    expect(selectionConfirmDelayMs({ captureMode: 'selection', selection: { reads: 2, stable: false } }, 2)).toBeNull();
    // Ancien chemin : aucune relecture.
    expect(selectionConfirmDelayMs({ title: 'x' }, 0)).toBeNull();
  });

  it('une pré-lecture en mode sélection n’est jamais réutilisée comme choix au clic', () => {
    expect(prefetchIsSelectionSnapshot({ captureMode: 'selection' })).toBe(true);
    expect(prefetchIsSelectionSnapshot({ title: 'x' })).toBe(false);
  });
});
