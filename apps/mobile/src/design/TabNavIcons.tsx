/**
 * Icônes vectorielles officielles intégrées de la barre de navigation principale.
 *
 * Pourquoi une suite vectorielle unique (`react-native-svg`) :
 * - Grille unique `24 × 24` (`viewBox="0 0 24 24"`) et cadre optique identique
 *   `[3.25 .. 20.75]` (`17.5 × 17.5` pt) sur tous les onglets.
 * - Épaisseur de trait strictement uniforme (`1.7` au repos, `2.05` sélectionné),
 *   sans décalage de ligne de base de police ni aplat gris d'image matricielle.
 */
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export interface TabNavIconProps {
  color: ColorValue;
  size?: number;
  focused?: boolean;
}

const STROKE_IDLE = 1.7;
const STROKE_ACTIVE = 2.05;

/** Onglet Accueil — silhouette architecturale épurée sur le cadre `[3.25 .. 20.75]`. */
export function TabHomeIcon({ color, size = 24, focused = false }: TabNavIconProps) {
  const strokeWidth = focused ? STROKE_ACTIVE : STROKE_IDLE;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Path
        d="M3.5 10.3L12 3.4L20.5 10.3V19A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V10.3Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.5 20.5V14.4A1.2 1.2 0 0 1 10.7 13.2H13.3A1.2 1.2 0 0 1 14.5 14.4V20.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Onglet Lens — viseur optique à coins arrondis et cube produit 3D isométrique. */
export function TabLensIcon({ color, size = 24, focused = false }: TabNavIconProps) {
  const strokeWidth = focused ? STROKE_ACTIVE : STROKE_IDLE;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Path
        d="M3.25 7.75V5.5A2.25 2.25 0 0 1 5.5 3.25H7.75M16.25 3.25H18.5A2.25 2.25 0 0 1 20.75 5.5V7.75M3.25 16.25V18.5A2.25 2.25 0 0 0 5.5 20.75H7.75M20.75 16.25V18.5A2.25 2.25 0 0 1 18.5 20.75H16.25"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 7.5L15.9 9.75V14.25L12 16.5L8.1 14.25V9.75L12 7.5Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M8.1 9.75L12 12L15.9 9.75M12 12V16.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Onglet Sonim — bulle conversationnelle IA avec ondes vocales équilibrées. */
export function TabSonimIcon({ color, size = 24, focused = false }: TabNavIconProps) {
  const strokeWidth = focused ? STROKE_ACTIVE : STROKE_IDLE;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Path
        d="M12 3.5C16.83 3.5 20.75 6.95 20.75 11.2C20.75 15.45 16.83 18.9 12 18.9C10.42 18.9 8.94 18.53 7.66 17.88L4.1 19.5L5.05 16.12C3.92 14.77 3.25 13.06 3.25 11.2C3.25 6.95 7.17 3.5 12 3.5Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M8.85 10.1V12.3M12 8.4V14M15.15 10.1V12.3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Onglet Profil — portrait géométrique minimaliste sur le cadre `[3.25 .. 20.75]`. */
export function TabProfileIcon({ color, size = 24, focused = false }: TabNavIconProps) {
  const strokeWidth = focused ? STROKE_ACTIVE : STROKE_IDLE;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Circle
        cx="12"
        cy="7.9"
        r="3.7"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Path
        d="M4.6 20.3C4.6 16.55 7.9 14.2 12 14.2C16.1 14.2 19.4 16.55 19.4 20.3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
