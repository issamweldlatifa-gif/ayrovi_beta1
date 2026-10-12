/**
 * Feuille « Résultats Lens » pendant l'analyse (maquette 2).
 *
 * Panneau en bas de l'écran, au-dessus de la photo envoyée. Les étapes viennent
 * du serveur (`progress`) : « Image lue », « Recherche des boutiques »,
 * « Lecture des fiches produit ». Avant le premier événement, la première étape
 * est « en cours » et rien n'est coché. Les emplacements gris restent affichés
 * tant qu'aucune fiche n'est arrivée.
 */
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LensProgress, LensStep } from '@/api/lensStream';
import { AppText, Button, ResponsiveActionGroup } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { Skeleton } from '@/design/skeleton';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';

const ORDER: readonly LensStep[] = ['identified', 'searching', 'reading'];

export interface LensProgressSheetProps {
  /** Affichée tant que l'analyse tourne. */
  visible: boolean;
  /** Photo envoyée — vignette en tête de la feuille. */
  imageUri: string;
  progress: LensProgress | null;
  /** Nombre de fiches déjà reçues : tant qu'il vaut 0, les emplacements gris restent. */
  cardCount: number;
  onCancel: () => void;
  onRetry: () => void;
}

export function LensProgressSheet({ visible, imageUri, progress, cardCount, onCancel, onRetry }: LensProgressSheetProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const current = progress ? ORDER.indexOf(progress.step) : 0;
  const labels: Record<LensStep, string> = {
    identified: t('lens.progress.identified'),
    searching: t('lens.progress.searching'),
    reading: t('lens.progress.reading'),
  };
  const hint = progress?.step === 'reading' && progress.total
    ? t('lens.progress.count', { done: progress.done ?? 0, total: progress.total })
    : t('lens.progress.searchingHint');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.canvas,
              borderTopLeftRadius: theme.radius.card,
              borderTopRightRadius: theme.radius.card,
              paddingBottom: 16 + insets.bottom,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.line }]} />

          <View style={styles.head}>
            {imageUri ? (
              <AppImage
                uri={imageUri}
                style={[styles.thumb, { borderRadius: theme.radius.control }]}
                contentFit="cover"
                accessibilityLabel={t('lens.previewAlt')}
              />
            ) : null}
            <View style={styles.headText}>
              <AppText variant="lead" weight="bold">{t('lens.progress.title')}</AppText>
              <AppText variant="body" color={theme.colors.muted}>{hint}</AppText>
            </View>
          </View>

          <View style={styles.steps}>
            {ORDER.map((step, index) => {
              const state = index < current ? 'done' : index === current ? 'active' : 'pending';
              return (
                <View key={step} style={styles.row} accessibilityState={{ busy: state === 'active' }}>
                  {state === 'active' ? (
                    <ActivityIndicator size="small" color={theme.colors.action} />
                  ) : (
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: state === 'done' ? theme.status.success.fg : theme.colors.line },
                      ]}
                    />
                  )}
                  <AppText variant="label" color={state === 'pending' ? theme.colors.muted : theme.colors.ink}>
                    {labels[step]}
                  </AppText>
                </View>
              );
            })}
          </View>

          {cardCount === 0 ? (
            <View style={styles.placeholders}>
              <Skeleton width="48%" height={120} radius={theme.radius.card} />
              <Skeleton width="48%" height={120} radius={theme.radius.card} />
            </View>
          ) : null}

          <AppText variant="caption" color={theme.colors.muted} align="center">{t('lens.progress.wait')}</AppText>

          <ResponsiveActionGroup>
            <Button label={t('lens.progress.retry')} tone="quiet" onPress={onRetry} />
            <Button label={t('lens.progress.cancel')} onPress={onCancel} />
          </ResponsiveActionGroup>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { padding: 16, gap: 12 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 56, height: 56 },
  headText: { flex: 1, gap: 2 },
  steps: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  placeholders: { flexDirection: 'row', justifyContent: 'space-between' },
});
