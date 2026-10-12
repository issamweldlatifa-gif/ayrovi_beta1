/**
 * ورقة «Résultats Lens» (المرجع 02): ورقة سفلية بمقبض، فوق الصورة.
 *
 *  • أثناء البحث: صف الصورة والعنوان، الخطوات بأيقونات (✓ / دوّامة / مستند)،
 *    بطاقتان رماديتان بشبكة، «Cela peut prendre…»، وزرّا «Réessayer» و«Annuler» جنباً إلى جنب؛
 *  • حين تصل الفيشات: الورقة تكبر وتعرض الشبكة بعمودين، والصورة تبقى فوقها بالإطارات.
 *
 * التخطيط عمود في الـModal (الصورة فوق، الورقة تحتها): لا موضع مطلق هنا.
 * الخطوات والفيشات تأتي من الخادم. لا شيء مُحاكى.
 */
import { ActivityIndicator, Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { LensProgress, LensStep } from '@/api/lensStream';
import type { LensCandidate, LensDetectedItem } from '@/api/lens';
import { AppText, Button } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { LensResultCard } from '@/features/lens/LensResultCard';
import { LensItemOverlay } from '@/features/lens/LensItemOverlay';

const ORDER: readonly LensStep[] = ['identified', 'searching', 'reading'];

/** Taille affichée d'une image native, rentrée dans une boîte, sans la déformer. */
export function fitImage(
  width: number, height: number, maxWidth: number, maxHeight: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export interface LensResultsSheetProps {
  /** Affichée tant que l'analyse tourne, ou qu'il y a des éléments / fiches à montrer. */
  visible: boolean;
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
  /** Message de la feuille (ex. confirmation de surveillance de prix). */
  note: string;
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

export function LensResultsSheet({
  visible, busy, imageUri, imageSize, progress, results, items, selectedIndex, note,
  onClose, onRetry, onSelectItem, onOpenCandidate, onWatch, watchBusy,
  favoriteUrls, favoriteBusy, onToggleFavorite,
}: LensResultsSheetProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
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

  /** الصورة: فوق الورقة. بدون حجم أصلي تُعرض وحدها (بلا إطارات مخمّنة). */
  const photo = (() => {
    if (!imageUri) return null;
    const maxWidth = windowWidth - 32;
    const maxHeight = windowHeight * (expanded ? 0.28 : 0.5);
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
      <View style={{ width: fitted.width, height: fitted.height }}>
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
    <ScrollView style={styles.list} contentContainerStyle={styles.grid}>
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
    </ScrollView>
  );

  const noteLine = note ? (
    <AppText variant="caption" color={theme.colors.ink} accessibilityRole="alert">{note}</AppText>
  ) : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.colors.ink, paddingTop: insets.top }]}>
        <View style={styles.stage}>{photo}</View>

        <View style={[styles.sheet, { backgroundColor: theme.colors.canvas, borderTopLeftRadius: theme.radius.card, borderTopRightRadius: theme.radius.card, paddingBottom: insets.bottom + 12, maxHeight: windowHeight * 0.72 }]}>
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

          {busy ? steps : null}
          {expanded ? cards : busy ? placeholders : null}
          {busy && !expanded ? (
            <AppText variant="caption" color={theme.colors.muted} align="center">{t('lens.progress.wait')}</AppText>
          ) : null}
          {noteLine}

          <View style={styles.actions}>
            <View style={styles.action}>
              <Button label={t('lens.progress.retry')} tone="quiet" block onPress={onRetry} />
            </View>
            <View style={styles.action}>
              <Button label={busy ? t('lens.progress.cancel') : t('lens.close')} block onPress={onClose} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  sheet: { paddingHorizontal: 16, paddingTop: 10, gap: 12 },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 56, height: 56 },
  headText: { flex: 1, gap: 2 },
  steps: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  list: { flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  cell: { width: '48%' },
  placeholder: { borderWidth: StyleSheet.hairlineWidth, padding: 10, gap: 8 },
  placeholderImage: { width: '100%', aspectRatio: 1 },
  placeholderLine: { height: 8, borderRadius: 4 },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
});
