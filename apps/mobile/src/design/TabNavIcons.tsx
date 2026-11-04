/**
 * Icônes officielles de la barre de navigation principale — famille unique à trait
 * fin (`Ionicons` `-outline`) partagée par toute l'application et ses extensions :
 *   1. Accueil (`home-outline`)
 *   2. Lens (`camera-outline`)
 *   3. AYWEBs (`paw-outline` — patte de chat officielle en violet `#571EF6`,
 *      remplaçant les badges matriciels `assets/aywebs/aywebs-icon-violet.png`
 *      et `assets/aywebs/aywebs-icon-white.png` dans la barre d'onglets pour
 *      garantir une seule famille vectorielle à trait fin)
 *   4. Sonim (`sparkles-outline`)
 *   5. Profil (`person-outline`)
 */
import React from 'react';
import { View, type ColorValue } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '@/design/theme';

export type TabNavIconProps = {
  color: ColorValue;
  size?: number;
  focused?: boolean;
};

function TabStrokeGlyph({
  name,
  color,
  size,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: ColorValue;
  size?: number;
}) {
  const theme = useTheme();
  const dim = size ?? theme.iconSize.md;
  return (
    <View style={{ width: dim, height: dim, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={dim} color={String(color)} accessibilityElementsHidden />
    </View>
  );
}

export function TabHomeIcon({ color, size }: TabNavIconProps) {
  return <TabStrokeGlyph name="home-outline" color={color} size={size} />;
}

export function TabLensIcon({ color, size }: TabNavIconProps) {
  return <TabStrokeGlyph name="camera-outline" color={color} size={size} />;
}

export function TabAyWebsIcon({ color, size }: TabNavIconProps) {
  return <TabStrokeGlyph name="paw-outline" color={color} size={size} />;
}

export const TabAywebsPawIcon = TabAyWebsIcon;

export function TabSonimIcon({ color, size }: TabNavIconProps) {
  return <TabStrokeGlyph name="sparkles-outline" color={color} size={size} />;
}

export function TabProfileIcon({ color, size }: TabNavIconProps) {
  return <TabStrokeGlyph name="person-outline" color={color} size={size} />;
}
