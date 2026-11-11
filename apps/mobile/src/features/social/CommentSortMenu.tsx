/**
 * Menu de tri de la feuille des commentaires d'un Reel — fidèle à la
 * référence vidéo du 10/11/2026 (image à 25 s) :
 *   • carte NOIRE (#0D0D0D mesuré, plus sombre que la feuille #121212),
 *     coins arrondis, ancrée sous l'icône de tri, bord aligné sur elle ;
 *   • deux entrées en gras blanc « Commentaires populaires » /
 *     « Commentaires récents », séparées par un filet en retrait.
 *
 * Rendu dans un `Modal` transparent : un enfant qui DÉBORDE de l'en-tête de la
 * feuille ne reçoit pas les touchers sur Android ; le `Modal` couvre tout
 * l'écran, se ferme d'un toucher à côté ou avec « retour », et laisse la vidéo
 * vivante dessous. Position = mesure réelle du bouton (`measureInWindow`).
 */
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { RADIUS } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { COMMENT_SORTS, type CommentSort } from './commentSort';

export interface SortAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const LABELS = { popular: 'social.sortPopular', recent: 'social.sortRecent' } as const;

/** Écart entre le bas de l'icône et le haut de la carte (référence : ~4 pt). */
const GAP = 4;

export function CommentSortMenu({ anchor, value, onPick, onClose }: {
  /** Position du bouton de tri dans la fenêtre ; `null` = menu fermé. */
  anchor: SortAnchor | null;
  value: CommentSort;
  onPick: (sort: CommentSort) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  if (!anchor) return null;
  const top = anchor.y + anchor.height + GAP;
  // Bord de la carte aligné sur le bord EXTÉRIEUR de l'icône (droite en LTR,
  // gauche en RTL), jamais collé à l'écran.
  const edge = theme.isRTL
    ? { left: Math.max(8, anchor.x) }
    : { right: Math.max(8, width - (anchor.x + anchor.width)) };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('social.close')}
        testID="comment-sort-backdrop"
      />
      <View
        accessibilityRole="menu"
        testID="comment-sort-menu"
        style={[styles.card, edge, { top, backgroundColor: theme.colors.reelSheetMenu, ...theme.elevation.high }]}
      >
        {COMMENT_SORTS.map((sort, index) => (
          <View key={sort}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.colors.reelSheetLine }]} /> : null}
            <Pressable
              accessibilityRole="menuitem"
              accessibilityState={{ selected: value === sort }}
              onPress={() => onPick(sort)}
              testID={`comment-sort-${sort}`}
              style={({ pressed }) => [styles.item, { opacity: pressed ? theme.opacity.subtle : 1 }]}
            >
              <AppText variant="bodyStrong" color={theme.colors.reelSheetInk} numberOfLines={1}>
                {t(LABELS[sort])}
              </AppText>
            </Pressable>
          </View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', minWidth: 180, borderRadius: RADIUS.sm, paddingVertical: 4, overflow: 'hidden' },
  item: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 20 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
});
