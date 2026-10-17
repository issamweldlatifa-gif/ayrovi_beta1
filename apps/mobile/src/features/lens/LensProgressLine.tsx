/**
 * Ligne d'avancement de la recherche Z Lens.
 *
 * Une phrase honnête + une barre. Jamais un pourcentage inventé : quand le
 * serveur ne dit pas combien de fiches il reste, la barre reste INDÉTERMINÉE
 * (un segment qui avance) au lieu de faire semblant d'un chiffre exact.
 *
 * Les étapes viennent du serveur (`progress` du flux `/analyze-image`) :
 *   • `identified` — le produit est reconnu (l'identification est déjà là) ;
 *   • `searching`  — la recherche visuelle tourne ;
 *   • `reading`    — les fiches marchandes sont lues, `done/total` est connu.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { useT, type Translate } from '@/i18n';
import type { LensStreamProgress } from '@/api/lensStream';
import { LENS_COLORS } from './lensPalette';

const TRACK_HEIGHT = 2;

/**
 * Le texte de l'étape — source UNIQUE pour la ligne d'avancement et pour la
 * barre flottante (elles ne doivent jamais dire deux choses différentes).
 */
export function lensProgressLabel(progress: LensStreamProgress | null, t: Translate): string {
  const step = progress?.step ?? 'searching';
  if (step === 'identified') return t('lens.progress.identified');
  if (step === 'reading') return t('lens.progress.reading', { done: progress?.done ?? 0, total: progress?.total ?? 0 });
  return t('lens.progress.searching');
}

export function LensProgressLine({ progress }: { progress: LensStreamProgress | null }) {
  const theme = useTheme();
  const t = useT();
  const step = progress?.step ?? 'searching';
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
  const known = step === 'reading' && total > 0;
  const ratio = known ? Math.min(1, Math.max(0, done / total)) : 0;

  const label = lensProgressLabel(progress, t);

  // Segment indéterminé : avance et revient, sans CSS ni minuteur JS.
  const slide = useRef(new Animated.Value(0)).current;
  const reduced = theme.motion.reduced === 0;
  useEffect(() => {
    if (known || reduced) return;
    const loop = Animated.loop(Animated.timing(slide, {
      toValue: 1,
      duration: 1100,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }));
    loop.start();
    return () => loop.stop();
  }, [known, reduced, slide]);

  return (
    <View style={styles.wrap} testID="lens-progress-line">
      <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>{label}</AppText>
      <View style={[styles.track, { backgroundColor: LENS_COLORS.resultLine }]}>
        {known ? (
          <View
            testID="lens-progress-bar"
            style={[
              styles.fill,
              { width: `${Math.round(ratio * 100)}%`, backgroundColor: LENS_COLORS.active },
            ]}
          />
        ) : (
          <Animated.View
            testID="lens-progress-bar-indeterminate"
            style={[
              styles.segment,
              {
                backgroundColor: LENS_COLORS.active,
                transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 140] }) }],
                opacity: slide.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 1, 0.35] }),
              },
            ]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingTop: 2 },
  track: { height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT, overflow: 'hidden' },
  fill: { height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT },
  segment: { width: '32%', height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT },
});
