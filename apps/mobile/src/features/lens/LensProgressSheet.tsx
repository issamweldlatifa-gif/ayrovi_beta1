/**
 * Feuille « Résultats Lens » pendant l'analyse (maquette 2).
 *
 * Les étapes viennent du serveur (`progress`) : « Image lue », « Recherche des
 * boutiques », « Lecture des fiches produit ». Avant le premier événement, la photo
 * est en cours d'envoi : la première étape est alors « en cours », rien n'est coché.
 * Les emplacements gris restent affichés tant qu'aucune fiche n'est arrivée.
 */
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { LensProgress, LensStep } from '@/api/lensStream';
import { AppText, Button, Card } from '@/design/ui';
import { Skeleton } from '@/design/skeleton';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';

const ORDER: readonly LensStep[] = ['identified', 'searching', 'reading'];

export interface LensProgressSheetProps {
  progress: LensProgress | null;
  /** Nombre de fiches déjà reçues : tant qu'il vaut 0, les emplacements gris restent. */
  cardCount: number;
  onCancel: () => void;
}

export function LensProgressSheet({ progress, cardCount, onCancel }: LensProgressSheetProps) {
  const theme = useTheme();
  const { t } = useI18n();

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
    <Card title={t('lens.progress.title')} hint={hint}>
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

      {cardCount === 0 ? (
        <View style={styles.placeholders}>
          <Skeleton width="48%" height={120} radius={theme.radius.card} />
          <Skeleton width="48%" height={120} radius={theme.radius.card} />
        </View>
      ) : null}

      <AppText variant="caption" color={theme.colors.muted}>{t('lens.progress.wait')}</AppText>
      <Button label={t('lens.progress.cancel')} onPress={onCancel} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  placeholders: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
});
