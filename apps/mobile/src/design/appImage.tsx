/**
 * AppImage — UNE image, partout, avec les mêmes garanties.
 *
 * Pourquoi un composant au lieu de `Image` de React Native éparpillé :
 *   1. **Cache** : `expo-image` garde les vignettes sur disque — un catalogue
 *      déjà vu ne re-télécharge pas sur un réseau lent.
 *   2. **Placeholder** : le fond du cadre est visible pendant le chargement,
 *      puis l'image apparaît en fondu (`transition`) — pas de trou blanc.
 *   3. **Secours** : une image cassée affiche un cadre avec icône et un
 *      libellé accessible, au lieu d'un rectangle vide muet.
 *   4. **Accessibilité** : `decorative` cache l'image des lecteurs d'écran ;
 *      sinon `accessibilityLabel` est OBLIGATOIRE en pensée — le secours
 *      porte `image.unavailable` quand l'appelant n'en donne pas.
 *
 * `resizeMode` de React Native devient `contentFit` (même vocabulaire qu'Expo).
 */
import { useState } from 'react';
import { Image as ExpoImage, type ImageStyle } from 'expo-image';
import { StyleSheet, View, type StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from './theme';
import { useT } from '@/i18n';

export interface AppImageProps {
  /** URI absolue ou relative (résolue par l'appelant via `mediaUrl`). */
  uri?: string | null;
  /** Visuel embarqué dans l'application (`require('…/x.jpg')`) — prioritaire sur `uri`. */
  localSource?: number;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  style?: StyleProp<ImageStyle>;
  /** Texte lu par le lecteur d'écran — le nom du produit, par exemple. */
  accessibilityLabel?: string;
  /** Image purement décorative : cachée des lecteurs d'écran. */
  decorative?: boolean;
  testID?: string;
}

export function AppImage({
  uri, localSource, contentFit = 'cover', style, accessibilityLabel, decorative = false, testID,
}: AppImageProps) {
  const theme = useTheme();
  const t = useT();
  const [failed, setFailed] = useState(false);

  // Pas de source ou chargement cassé : cadre de secours, jamais un trou muet.
  if ((!uri && localSource == null) || failed) {
    return (
      <View
        testID={testID ? `${testID}-fallback` : undefined}
        accessibilityElementsHidden={decorative}
        accessibilityLabel={decorative ? undefined : (accessibilityLabel ?? t('image.unavailable'))}
        style={[styles.fallback, { backgroundColor: theme.colors.disabled }, style]}
      >
        {decorative ? null : (
          <Ionicons
            name="image-outline"
            size={theme.iconSize.md}
            color={theme.colors.muted}
            accessibilityElementsHidden
          />
        )}
      </View>
    );
  }

  return (
    <ExpoImage
      testID={testID}
      source={localSource ?? { uri: uri as string }}
      contentFit={contentFit}
      transition={theme.duration.fast}
      onError={() => setFailed(true)}
      accessibilityElementsHidden={decorative}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      style={[{ backgroundColor: theme.colors.line }, style]}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
