/**
 * feuille « Résultats Lens » (maquette 2) — deux états:
 *
 *  • pendant la recherche, sans fiche: une carte centrée à l'écran, avec la photo,
 *    les étapes du serveur, les emplacements gris, et «Réessayer» / «Annuler» ;
 *  • dès que des fiches arrivent: la feuille s'ouvre en plein écran et affiche
 *    les cartes complètes, avec la barre d'état tant que l'analyse continue.
 *
 * Les étapes et les fiches viennent du serveur (`progress`, `results`). Rien n'est simulé.
 */
import { ActivityIndicator, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LensProgress, LensStep } from '@/api/lensStream';
import type { LensCandidate } from '@/api/lens';
import { AppText, Button, ResponsiveActionGroup } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { Skeleton } from '@/design/skeleton';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { LensResultCard } from '@/features/lens/LensResultCard';

const ORDER: readonly LensStep[] = ['identified', 'searching', 'reading'];

export interface LensResultsSheetProps {
  /** Affichée tant que l'analyse tourne, ou qu'il y a des fiches à montrer. */
  visible: boolean;
  busy: boolean;
  /** Photo envoyée — vignette en tête de la feuille. */
  imageUri: string;
  progress: LensProgress | null;
  results: readonly LensCandidate[];
  /** Message de la feuille (ex. confirmation de surveillance de prix). */
  note: string;
  onClose: () => void;
  onRetry: () => void;
  onOpenCandidate: (candidate: LensCandidate) => void;
  onWatch: (candidate: LensCandidate) => void;
  watchBusy: boolean;
}

export function LensResultsSheet({
  visible, busy, imageUri, progress, results, note,
  onClose, onRetry, onOpenCandidate, onWatch, watchBusy,
}: LensResultsSheetProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const hasResults = results.length > 0;
  const current = progress ? ORDER.indexOf(progress.step) : 0;
  const labels: Record<LensStep, string> = {
    identified: t('lens.progress.identified'),
    searching: t('lens.progress.searching'),
    reading: t('lens.progress.reading'),
  };
  const hint = progress?.step === 'reading' && progress.total
    ? t('lens.progress.count', { done: progress.done ?? 0, total: progress.total })
    : t('lens.progress.searchingHint');

  const steps = (
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
  );

  const header = (
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
  );

  const actions = (
    <ResponsiveActionGroup>
      <Button label={t('lens.progress.retry')} tone="quiet" onPress={onRetry} />
      <Button label={busy ? t('lens.progress.cancel') : t('lens.close')} onPress={onClose} />
    </ResponsiveActionGroup>
  );

  const noteLine = note ? (
    <AppText variant="caption" color={theme.colors.ink} accessibilityRole="alert">{note}</AppText>
  ) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {hasResults ? (
        <View style={[styles.fullScreen, { backgroundColor: theme.colors.canvas, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.fullTop}>
            <View style={styles.fullHead}>{header}</View>
            <Button label={t('lens.close')} tone="quiet" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={styles.fullList}>
            {busy ? steps : null}
            {results.map((candidate, index) => (
              <LensResultCard
                key={candidate.id || `${candidate.sourceUrl}-${index}`}
                candidate={candidate}
                onOpen={onOpenCandidate}
                onWatch={onWatch}
                watchBusy={watchBusy}
              />
            ))}
            {noteLine}
          </ScrollView>
          <View style={styles.fullFoot}>{actions}</View>
        </View>
      ) : (
        <View style={styles.centerBackdrop}>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.colors.canvas, borderRadius: theme.radius.card },
            ]}
          >
            {header}
            {steps}
            <View style={styles.placeholders}>
              <Skeleton width="48%" height={120} radius={theme.radius.card} />
              <Skeleton width="48%" height={120} radius={theme.radius.card} />
            </View>
            <AppText variant="caption" color={theme.colors.muted} align="center">{t('lens.progress.wait')}</AppText>
            {noteLine}
            {actions}
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  centerBackdrop: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { padding: 16, gap: 12 },
  fullScreen: { flex: 1, padding: 16, gap: 12 },
  fullTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  fullHead: { flex: 1 },
  fullList: { gap: 12, paddingBottom: 12 },
  fullFoot: { paddingTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 56, height: 56 },
  headText: { flex: 1, gap: 2 },
  steps: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  placeholders: { flexDirection: 'row', justifyContent: 'space-between' },
});
