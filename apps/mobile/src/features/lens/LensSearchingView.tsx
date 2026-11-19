/**
 * Z Lens — l'attente AVANT les premiers résultats (demande du 19/11, capture du site).
 *
 * Plein écran, calme, une seule chose à regarder :
 *   • derrière : la photo elle-même, floutée et voilée de noir ;
 *   • au centre : une carte arrondie qui montre ce qu'on cherche — la zone du
 *     produit repéré si le repérage l'a trouvée, sinon la photo entière ;
 *   • dessous : une pilule sombre (anneau qui tourne + étape réelle de la
 *     recherche) puis « Annuler », pilule givrée.
 *
 * Le libellé est TOUJOURS l'étape envoyée par la recherche (jamais une
 * identification inventée). Dès qu'un premier résultat arrive, l'écran de
 * sélection + le tiroir de résultats reprennent la main.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { AppImage } from '@/design/appImage';
import { AppText } from '@/design/ui';
import { LoadingSpinner } from '@/design/LoadingSpinner';
import { useT } from '@/i18n';
import { RADIUS, frost, veil } from '@/design/tokens.mobile';
import type { LensBox } from '@/api/lens';
import { LENS_SEARCHING, lensSearchingCard } from './lensSearchingLayout';
import { LENS_COLORS } from './lensPalette';

export function LensSearchingView({
  uri,
  photo,
  selection,
  screen,
  label,
  onCancel,
}: {
  uri: string | null;
  photo: { width: number; height: number } | null;
  selection: LensBox | null;
  screen: { width: number; height: number };
  label: string;
  onCancel: () => void;
}) {
  const t = useT();
  const card = lensSearchingCard(screen, photo, selection);
  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} testID="lens-searching" accessibilityViewIsModal>
      {uri ? (
        <AppImage uri={uri} contentFit="cover" blurRadius={LENS_SEARCHING.blur} decorative background={null} style={StyleSheet.absoluteFill} testID="lens-searching-backdrop" />
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: veil(0.45) }]} />

      <View style={[styles.card, { width: card.width, height: card.height }]} testID="lens-searching-card">
        {uri ? (
          card.image ? (
            <AppImage
              uri={uri}
              contentFit="fill"
              decorative
              background={null}
              style={{ position: 'absolute', width: card.image.width, height: card.image.height, left: card.image.left, top: card.image.top }}
              testID="lens-captured-preview"
            />
          ) : (
            <AppImage uri={uri} contentFit="cover" decorative background={null} style={StyleSheet.absoluteFill} testID="lens-captured-preview" />
          )
        ) : null}
      </View>

      <View style={styles.status} accessibilityRole="progressbar" accessibilityLiveRegion="polite" accessibilityLabel={label} testID="lens-searching-status">
        <LoadingSpinner size="sm" color={LENS_COLORS.white} testID="lens-search-bar-loading" />
        <AppText variant="body" color={LENS_COLORS.white} numberOfLines={1} style={styles.statusLabel} testID="lens-search-bar-label">{label}</AppText>
      </View>

      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        hitSlop={8}
        style={({ pressed }) => [styles.cancel, { backgroundColor: frost(pressed ? 0.32 : 0.22) }]}
        testID="lens-search-bar-cancel"
      >
        <AppText variant="body" color={LENS_COLORS.white}>{t('common.cancel')}</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', backgroundColor: LENS_COLORS.black, paddingHorizontal: 24 },
  card: {
    borderRadius: LENS_SEARCHING.radius,
    overflow: 'hidden',
    backgroundColor: veil(0.6),
    shadowColor: LENS_COLORS.black,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  status: {
    marginTop: 32,
    minHeight: 48,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    borderRadius: RADIUS.full,
    backgroundColor: veil(0.72),
  },
  statusLabel: { flexShrink: 1 },
  cancel: {
    marginTop: 16,
    minHeight: 48,
    minWidth: 120,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
  },
});
