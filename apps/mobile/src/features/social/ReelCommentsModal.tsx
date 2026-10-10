/**
 * Feuille des commentaires d'un Reel (plein écran sur l'écran appelant).
 * Extraite de la liste des Reels pour servir aussi à la visionneuse plein écran.
 */
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { Comments } from './Comments';
import type { Reel } from '@/api/social';

export function ReelCommentsModal({ reel, onClose }: { reel: Reel; onClose: () => void }) {
  const theme = useTheme();
  const t = useT();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: theme.colors.canvas }]}>
        <AppText variant="title" weight="bold">{t('social.comments')}</AppText>
        <Comments targetId={reel.id} />
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeBtn}>
          <AppText variant="label" weight="bold" color={theme.colors.ink}>{t('social.close')}</AppText>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, padding: 20, gap: 10, paddingTop: 48 },
  closeBtn: { paddingVertical: 12, alignSelf: 'flex-start' },
});
