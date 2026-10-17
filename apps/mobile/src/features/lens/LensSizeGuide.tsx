/**
 * Z Lens — « Guide des tailles » de la fiche produit (référence Zalando).
 *
 * Ce que ce guide DIT et ce qu'il NE DIT PAS — la ligne est nette, et elle est
 * écrite à l'écran :
 *  • il affiche les tailles RÉELLEMENT publiées par le marchand pour ce produit
 *    (`sizes` + disponibilité par variante) : aucune taille inventée ;
 *  • il rappelle COMMENT se mesurer : c'est une méthode générale, pas une
 *    donnée produit ;
 *  • il n'affiche AUCUNE équivalence chiffrée (FR ↔ US ↔ UK) : nous n'avons
 *    pas de table publiée par le marchand, donc nous n'en affichons pas.
 *
 * L'outil Zalando « Obtenir une recommandation » reste une aide interactive
 * propre à leur site : elle n'est pas dans les données de la page, elle n'est
 * donc ni copiée ni simulée.
 */
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { LensCandidate } from '@/api/lens';
import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { SPACE } from '@/design/tokens.generated';
import { useT } from '@/i18n';
import { veil } from '@/design/tokens.mobile';

export function LensSizeGuide({
  visible,
  candidate,
  unavailableSizes,
  onClose,
}: {
  visible: boolean;
  candidate: LensCandidate;
  /** Tailles réellement signalées indisponibles par la source. */
  unavailableSizes: ReadonlySet<string>;
  onClose: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const sizes = candidate.sizes.filter(Boolean);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} testID="lens-size-guide">
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        testID="lens-size-guide-backdrop"
      >
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg }]}
          accessibilityRole="button"
          onPress={() => undefined}
          testID="lens-size-guide-sheet"
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <AppText variant="title" weight="bold">{t('lens.sizeGuide.title')}</AppText>

            <View style={styles.block}>
              <AppText weight="bold">{t('lens.sizeGuide.available')}</AppText>
              {sizes.length ? (
                <View style={[styles.sizes, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]} testID="lens-size-guide-sizes">
                  {sizes.map((size) => {
                    const unavailable = unavailableSizes.has(size);
                    return (
                      <View
                        key={size}
                        style={[
                          styles.sizeChip,
                          {
                            borderColor: unavailable ? theme.colors.line : theme.colors.ink,
                            borderRadius: theme.radius.control,
                          },
                        ]}
                      >
                        <AppText
                          weight="semibold"
                          style={unavailable ? styles.sizeOff : undefined}
                          color={unavailable ? theme.colors.muted : undefined}
                        >
                          {size}
                        </AppText>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <AppText color={theme.colors.muted}>{t('lens.sizeGuide.noSizes')}</AppText>
              )}
            </View>

            <View style={styles.block}>
              <AppText weight="bold">{t('lens.sizeGuide.howTo')}</AppText>
              <AppText color={theme.colors.muted}>{t('lens.sizeGuide.howToBody')}</AppText>
            </View>

            {/* Honnêteté : ce qui est générique est annoncé comme tel. */}
            <AppText variant="caption" color={theme.colors.muted} style={styles.note} accessibilityRole="text">
              {t('lens.sizeGuide.genericNote')}
            </AppText>

            <Button label={t('common.close')} onPress={onClose} block testID="lens-size-guide-close" />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: veil(0.46) },
  sheet: { maxHeight: '78%', marginHorizontal: 12, marginBottom: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 20 },
  content: { gap: 12, paddingBottom: 8 },
  block: { gap: 8 },
  sizes: { flexWrap: 'wrap', gap: 8 },
  sizeChip: {
    minWidth: 56, minHeight: 44, paddingHorizontal: 12,
    alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth,
  },
  sizeOff: { textDecorationLine: 'line-through' },
  note: { marginTop: SPACE[1] },
  close: { minHeight: 44 },
});
