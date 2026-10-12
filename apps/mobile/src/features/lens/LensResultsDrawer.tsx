/**
 * درج «Résultats Lens» (المرجع 02): يطلع من الأسفل فوق الكاميرا، والصورة تبقى
 * فوقه بالإطارات.
 *
 *  • أثناء البحث: خطوات بأيقونات (✓ / دوّامة / مستند)، بطاقتان رماديتان، و«Cela peut prendre…»؛
 *  • حين تصل الفيشات: تظهر الشبكة بعمودين، وملخص التحليل بعدها.
 *
 * الخطوات والفيشات تأتي من الخادم. لا شيء مُحاكى.
 */
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { LensProgress, LensStep } from '@/api/lensStream';
import type { LensAnalysis, LensCandidate, LensDetectedItem } from '@/api/lens';
import { AppText, Button, KeyValue } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { LensResultCard } from '@/features/lens/LensResultCard';
import { LensItemOverlay } from '@/features/lens/LensItemOverlay';
import { LensDrawer } from '@/features/lens/LensDrawer';

const ORDER: readonly LensStep[] = ['identified', 'searching', 'reading'];

/** Taille affichée d'une image native, rentrée dans une boîte, sans la déformer. */
export function fitImage(
  width: number, height: number, maxWidth: number, maxHeight: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export interface LensResultsDrawerProps {
  busy: boolean;
  /** Photo envoyée. */
  imageUri: string;
  /** Taille native de la photo (sans elle, pas de cadres: on ne devine pas la place). */
  imageSize: { width: number; height: number } | null;
  progress: LensProgress | null;
  results: readonly LensCandidate[];
  /** Éléments détectés dans la photo entière (ne changent pas pendant une recherche par élément). */
  items: readonly LensDetectedItem[];
  /** Élément choisi (−1 = la photo entière). */
  selectedIndex: number;
  /** Message du drawer (ex. confirmation de surveillance de prix, échec). */
  note: string;
  /** Résumé du serveur (identification, requête, stock). `null` tant qu'il n'y a pas d'analyse. */
  analysis: LensAnalysis | null;
  onClose: () => void;
  onRetry: () => void;
  onSelectItem: (index: number) => void;
  onOpenCandidate: (candidate: LensCandidate) => void;
  onWatch: (candidate: LensCandidate) => void;
  watchBusy: boolean;
  /** `sourceUrl` des fiches déjà enregistrées dans les favoris du compte. */
  favoriteUrls: ReadonlySet<string>;
  favoriteBusy: boolean;
  onToggleFavorite: (candidate: LensCandidate) => void;
}

export function LensResultsDrawer({
  busy, imageUri, imageSize, progress, results, items, selectedIndex, note, analysis,
  onClose, onRetry, onSelectItem, onOpenCandidate, onWatch, watchBusy,
  favoriteUrls, favoriteBusy, onToggleFavorite,
}: LensResultsDrawerProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const expanded = results.length > 0 || items.length > 0;
  const current = progress ? ORDER.indexOf(progress.step) : 0;
  const labels: Record<LensStep, string> = {
    identified: t('lens.progress.identified'),
    searching: t('lens.progress.searching'),
    reading: t('lens.progress.reading'),
  };
  const hint = progress?.step === 'reading' && progress.total
    ? t('lens.progress.count', { done: progress.done ?? 0, total: progress.total })
    : t('lens.progress.searchingHint');

  /** الصورة: أعلى الدرج. بدون حجم أصلي تُعرض وحدها (بلا إطارات مخمّنة). */
  const photo = (() => {
    if (!imageUri) return null;
    const maxWidth = windowWidth - 32;
    const maxHeight = windowHeight * (expanded ? 0.26 : 0.4);
    if (!imageSize || imageSize.width <= 0 || imageSize.height <= 0) {
      return (
        <AppImage
          uri={imageUri}
          style={{ width: maxWidth, height: maxHeight, borderRadius: theme.radius.card }}
          contentFit="contain"
          accessibilityLabel={t('lens.previewAlt')}
        />
      );
    }
    const fitted = fitImage(imageSize.width, imageSize.height, maxWidth, maxHeight);
    return (
      <View style={[styles.stage, { width: fitted.width, height: fitted.height }]}>
        <AppImage
          uri={imageUri}
          style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.card }]}
          contentFit="cover"
          accessibilityLabel={t('lens.previewAlt')}
        />
        {items.length > 0 ? (
          <LensItemOverlay
            width={fitted.width}
            height={fitted.height}
            items={items}
            selectedIndex={selectedIndex}
            onSelect={onSelectItem}
          />
        ) : null}
      </View>
    );
  })();

  const steps = (
    <View style={[styles.steps, { borderColor: theme.colors.divider }]}>
      {ORDER.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'active' : 'pending';
        return (
          <View key={step} style={[styles.row, { borderBottomColor: theme.colors.divider }]} accessibilityState={{ busy: state === 'active' }}>
            {state === 'done' ? (
              <Ionicons name="checkmark-circle" size={24} color={theme.status.success.fg} />
            ) : state === 'active' ? (
              <ActivityIndicator size="small" color={theme.colors.action} />
            ) : (
              <Ionicons name="document-text-outline" size={22} color={theme.colors.muted} />
            )}
            <AppText variant="label" weight="bold" color={state === 'pending' ? theme.colors.muted : theme.colors.ink}>
              {labels[step]}
            </AppText>
          </View>
        );
      })}
    </View>
  );

  const placeholders = (
    <View style={styles.grid}>
      {[0, 1].map((index) => (
        <View key={index} style={[styles.cell, styles.placeholder, { borderColor: theme.colors.line, borderRadius: theme.radius.card }]}>
          <View style={[styles.placeholderImage, { backgroundColor: theme.colors.divider, borderRadius: theme.radius.control }]} />
          <View style={[styles.placeholderLine, { backgroundColor: theme.colors.divider, width: '100%' }]} />
          <View style={[styles.placeholderLine, { backgroundColor: theme.colors.divider, width: '100%' }]} />
          <View style={[styles.placeholderLine, { backgroundColor: theme.colors.divider, width: '60%' }]} />
        </View>
      ))}
    </View>
  );

  const cards = (
    <View style={styles.grid}>
      {results.map((candidate, index) => (
        <View key={candidate.id || `${candidate.sourceUrl}-${index}`} style={styles.cell}>
          <LensResultCard
            candidate={candidate}
            onOpen={onOpenCandidate}
            onWatch={onWatch}
            watchBusy={watchBusy}
            favorite={favoriteUrls.has(candidate.sourceUrl)}
            favoriteBusy={favoriteBusy}
            onToggleFavorite={onToggleFavorite}
          />
        </View>
      ))}
    </View>
  );

  return (
    <LensDrawer title={t('lens.progress.title')} subtitle={hint} onClose={onClose}>
      {photo}

      {busy ? steps : null}
      {expanded ? cards : busy ? placeholders : null}
      {busy && !expanded ? (
        <AppText variant="caption" color={theme.colors.muted} align="center">{t('lens.progress.wait')}</AppText>
      ) : null}

      {analysis ? (
        <View style={styles.analysis}>
          <AppText variant="label" weight="bold">{t('lens.analysisTitle')}</AppText>
          <KeyValue
            label={t('lens.identification')}
            value={[analysis.identification.brand, analysis.identification.model].filter(Boolean).join(' ')
              || analysis.identification.description
              || t('lens.identificationUnknown')}
          />
          {analysis.query ? <KeyValue label={t('lens.query')} value={analysis.query} /> : null}
          <KeyValue label={t('lens.resultsCount')} value={String(analysis.candidates.length)} />
          {analysis.excluded.count > 0 ? (
            <AppText variant="caption" color={theme.colors.muted}>
              {t('lens.excluded', { count: analysis.excluded.count })}
            </AppText>
          ) : null}
          <AppText variant="caption" color={theme.colors.muted}>
            {t('lens.liveStock', { fetched: analysis.liveStock.fetched, cached: analysis.liveStock.cacheHits })}
          </AppText>
        </View>
      ) : null}

      {note ? (
        <AppText variant="caption" color={theme.colors.ink} accessibilityRole="alert">{note}</AppText>
      ) : null}

      <View style={styles.actions}>
        <View style={styles.action}>
          <Button label={t('lens.progress.retry')} tone="quiet" block onPress={onRetry} />
        </View>
        <View style={styles.action}>
          <Button label={busy ? t('lens.progress.cancel') : t('lens.close')} block onPress={onClose} />
        </View>
      </View>
    </LensDrawer>
  );
}

const styles = StyleSheet.create({
  stage: { alignSelf: 'center' },
  steps: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  cell: { width: '48%' },
  placeholder: { borderWidth: StyleSheet.hairlineWidth, padding: 10, gap: 8 },
  placeholderImage: { width: '100%', aspectRatio: 1 },
  placeholderLine: { height: 8, borderRadius: 4 },
  analysis: { gap: 6 },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
});
