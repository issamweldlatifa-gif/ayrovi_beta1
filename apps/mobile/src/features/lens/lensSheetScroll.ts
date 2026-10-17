/**
 * Pont entre la feuille de résultats (`SearchSheet`) et la liste qu'elle contient :
 * la liste signale sa position de défilement, la feuille sait alors si un
 * glissement vers le bas doit faire défiler la liste ou baisser la feuille.
 */
import { createContext, useContext } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export type LensSheetScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

export const LensSheetScrollContext = createContext<LensSheetScrollHandler | undefined>(undefined);

/** Gestionnaire `onScroll` à poser sur la liste de la feuille (absent hors feuille). */
export function useLensSheetScroll(): LensSheetScrollHandler | undefined {
  return useContext(LensSheetScrollContext);
}
