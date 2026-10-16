/**
 * Z Lens — menu ⋮ de l'en-tête : Informations, Historique, puis les pages
 * Politique de confidentialité, Conditions d'utilisation et Produits interdits
 * (spécification du client, 16/10/2026).
 */
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT, type TranslationKey } from '@/i18n';
import { LENS_COLORS } from './lensPalette';

export type LensMenuItem = 'info' | 'history' | 'privacy' | 'terms' | 'rules';

const ITEMS: Array<{ id: LensMenuItem; label: TranslationKey; icon: keyof typeof Ionicons.glyphMap; separatorBefore?: boolean }> = [
  { id: 'info', label: 'lens.menu.info', icon: 'information-circle-outline' },
  { id: 'history', label: 'lens.menu.history', icon: 'time-outline' },
  { id: 'privacy', label: 'lens.menu.privacy', icon: 'shield-checkmark-outline', separatorBefore: true },
  { id: 'terms', label: 'lens.menu.terms', icon: 'document-text-outline' },
  { id: 'rules', label: 'lens.menu.rules', icon: 'ban-outline' },
];

export function LensMenu({ visible, top, onClose, onPick }: {
  visible: boolean;
  /** Bord haut du menu, juste sous le bouton ⋮. */
  top: number;
  onClose: () => void;
  onPick: (item: LensMenuItem) => void;
}) {
  const theme = useTheme();
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: LENS_COLORS.cameraScrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('sheet.close')} />
      <View
        style={[
          styles.card,
          theme.isRTL ? styles.cardStart : styles.cardEnd,
          { top, backgroundColor: LENS_COLORS.white, borderRadius: theme.radius.lg, ...theme.elevation.high },
        ]}
        accessibilityRole="menu"
        testID="lens-menu"
      >
        {ITEMS.map((item) => (
          <View key={item.id}>
            {item.separatorBefore ? <View style={[styles.separator, { backgroundColor: LENS_COLORS.resultLine }]} /> : null}
            <Pressable
              onPress={() => onPick(item.id)}
              accessibilityRole="menuitem"
              style={({ pressed }) => [
                styles.item,
                { flexDirection: theme.isRTL ? 'row-reverse' : 'row', backgroundColor: pressed ? LENS_COLORS.skeleton : LENS_COLORS.white },
              ]}
              testID={`lens-menu-${item.id}`}
            >
              <Ionicons name={item.icon} size={theme.iconSize.md} color={LENS_COLORS.black} accessibilityElementsHidden />
              <AppText color={LENS_COLORS.black} style={styles.label}>{t(item.label)}</AppText>
            </Pressable>
          </View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', width: 280, paddingVertical: 4, overflow: 'hidden' },
  cardEnd: { right: 12 },
  cardStart: { left: 12 },
  item: { minHeight: 52, alignItems: 'center', gap: 16, paddingHorizontal: 16 },
  label: { flex: 1 },
  separator: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
