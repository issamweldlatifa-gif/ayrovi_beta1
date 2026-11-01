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
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Image as ExpoImage, type ImageStyle } from 'expo-image';
import { StyleSheet, View, type StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { computeImageCacheStamp, reconcileImageCacheStamp } from './imageCacheGuard';
import { useTheme } from './theme';
import { useT } from '@/i18n';

export interface AppImageProps {
  /** URI absolue ou relative (résolue par l'appelant via `mediaUrl`). */
  uri?: string | null;
  /** Source de secours historique : essayée après `uri`. */
  fallbackUri?: string | null;
  /** Chaîne ordonnée de replis (isolation, proxy, original, par exemple). */
  fallbackUris?: readonly (string | null | undefined)[];
  /** Visuel embarqué dans l'application (`require('…/x.jpg')`) — prioritaire sur `uri`. */
  localSource?: number;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  style?: StyleProp<ImageStyle>;
  /** Texte lu par le lecteur d'écran — le nom du produit, par exemple. */
  accessibilityLabel?: string;
  /** Image purement décorative : cachée des lecteurs d'écran. */
  decorative?: boolean;
  /**
   * Appelé UNE fois que le sort de l'image est scellé — chargée ou en panne.
   * Sert à retirer l'écran d'attente posé sur la fiche produit : on n'attend
   * jamais « au cas où », on attend le résultat réel du chargement.
   */
  onSettled?: () => void;
  /**
   * Flou (en points) appliqué par `expo-image` — sert l'effet « photo qui se
   * voile » quand la fiche produit monte dessus (référence Zalando, 17/10/2026).
   * 0 = nette. La valeur est choisie par l'appelant, jamais devinée ici.
   */
  /**
   * Teinte de la plaque sous l'image, pendant le chargement. `null` = aucune
   * plaque : indispensable pour une image à FOND TRANSPARENT (le mot-symbole),
   * sinon le gris du cadre se voit autour du logo (constaté le 27/10/2026).
   */
  background?: string | null;
  /** Teinte native (`expo-image`) pour les pictogrammes/mots-symboles monochromes. */
  tintColor?: string | null;
  /**
   * Clé de recyclage native (`expo-image`) : vide immédiatement l'ancien bitmap
   * lorsqu'une cellule recyclée change d'élément (boutique, produit, catégorie).
   */
  recyclingKey?: string | null;
  blurRadius?: number;
  /** Désactive le sous-échantillonnage bitmap natif pour les photos plein cadre. */
  highRes?: boolean;
  /**
   * Appelé UNE fois quand l'image a définitivement échoué (après tous les
   * replis). Sert aux pastilles de variante : plutôt qu'un cadre cassé, elles
   * affichent la couleur de l'article.
   */
  onError?: () => void;
  testID?: string;
}

let bootCacheCheckStarted = false;

/**
 * Purge une seule fois par lancement le cache disque `expo-image` lorsque la
 * binaire APK/IPA a changé (évite toute collision d'anciens `R.drawable`).
 */
export function useImageCacheGuard(): void {
  useEffect(() => {
    if (bootCacheCheckStarted) return;
    bootCacheCheckStarted = true;
    const stamp = computeImageCacheStamp({
      version: Constants.expoConfig?.version ?? null,
      androidVersionCode: Constants.expoConfig?.android?.versionCode ?? null,
      iosBuildNumber: Constants.expoConfig?.ios?.buildNumber ?? null,
      buildStamp: process.env.EXPO_PUBLIC_BUILD_STAMP ?? null,
    });
    void reconcileImageCacheStamp({
      stamp,
      storage: AsyncStorage,
      clearDiskCache: typeof ExpoImage.clearDiskCache === 'function' ? () => ExpoImage.clearDiskCache() : null,
      clearMemoryCache: typeof ExpoImage.clearMemoryCache === 'function' ? () => ExpoImage.clearMemoryCache() : null,
    });
  }, []);
}

export function AppImage({
  uri, fallbackUri, fallbackUris = [], localSource, contentFit = 'cover', style,
  accessibilityLabel, decorative = false, background, tintColor, recyclingKey, blurRadius = 0, highRes = false, onSettled, onError, testID,
}: AppImageProps) {
  const theme = useTheme();
  const t = useT();
  const sources = [uri, ...fallbackUris, fallbackUri]
    .map((value) => String(value ?? '').trim())
    .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);
  const sourceKey = sources.join('\u0000');
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const activeUri = sources[sourceIndex] ?? null;

  // Une même instance sert à plusieurs produits dans une liste recyclée : une
  // panne de l'ancien produit ne doit pas condamner l'image suivante.
  useEffect(() => {
    setSourceIndex(0);
    setFailed(false);
  }, [localSource, sourceKey]);

  const onLoadError = () => {
    if (localSource == null && sourceIndex + 1 < sources.length) {
      setSourceIndex((current) => current + 1);
      return;
    }
    setFailed(true);
    onError?.();
    onSettled?.();
  };

  // Pas de source ou chargement cassé : cadre de secours, jamais un trou muet.
  if ((!activeUri && localSource == null) || failed) {
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

  const effectiveRecyclingKey =
    recyclingKey !== undefined
      ? (recyclingKey ?? undefined)
      : localSource != null
        ? `local:${String(localSource)}`
        : (activeUri ?? undefined);

  return (
    <ExpoImage
      testID={testID}
      source={localSource ?? { uri: activeUri as string }}
      contentFit={contentFit}
      /* Un `localSource` (`require(...)`) est déjà embarqué dans l'APK : le mettre
         sur disque dans Glide (`CachePolicy.DISK` par défaut) est inutile et crée
         des collisions d'entiers `R.drawable` entre deux builds de même
         `versionCode`. `'memory'` active `DiskCacheStrategy.NONE` tout en gardant
         le bitmap décodé en RAM pour le défilement. */
      cachePolicy={localSource != null ? 'memory' : 'memory-disk'}
      allowDownscaling={highRes ? false : undefined}
      priority={highRes ? 'high' : undefined}
      recyclingKey={effectiveRecyclingKey}
      tintColor={tintColor ?? undefined}
      transition={localSource != null ? 0 : theme.duration.fast}
      blurRadius={blurRadius}
      onError={onLoadError}
      onLoad={() => onSettled?.()}
      accessibilityElementsHidden={decorative}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      style={[{ backgroundColor: background === null ? 'transparent' : (background ?? theme.colors.line) }, style]}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
