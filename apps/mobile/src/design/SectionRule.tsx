/**
 * Respiration entre deux sections de l'accueil — SANS filet.
 *
 * 15/11 (« نحي الخطوط اللي زدتهم بين الأقسام ») : les filets gris sont retirés.
 * La séparation vient désormais de l'espace seul, comme Zalando : une section
 * se termine, 48 dp de blanc (`RHYTHM.section`), la suivante commence. L'écart
 * d'écran (`screenContentGap`, 16) s'ajoute de part et d'autre de l'espaceur :
 * on n'ajoute donc ici que le complément pour atteindre exactement 48.
 */
import { View } from 'react-native';
import { useTheme } from './theme';
import { RHYTHM } from './rhythm';
import { screenContentGap } from './layoutLogic';

/** Hauteur propre de l'espaceur : 48 − 2 × 16 (deux écarts d'écran) = 16. */
export function sectionBreakHeight(space: readonly number[]): number {
  return Math.max(0, RHYTHM.section - 2 * screenContentGap(space));
}

export function SectionBreak() {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: sectionBreakHeight(theme.space) }}
      testID="section-break"
    />
  );
}
