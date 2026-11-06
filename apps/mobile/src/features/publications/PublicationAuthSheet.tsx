import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark, ZMark } from '@/design/BrandMark';
import { AppText } from '@/design/ui';
import { PUBLICATION_THEME as P, RADIUS, veil } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';

/** An intentional guest interaction requests sign-in; no write or fabricated local engagement. */
export function PublicationAuthSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { locale } = useI18n(); const ar = locale === 'ar'; const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel={ar ? 'إغلاق طلب الدخول' : 'Fermer la demande de connexion'} onPress={onClose} style={styles.backdrop} />
      <View testID="publication-auth-sheet" accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.handle} />
        <View style={styles.logo}><ZMark width={48} color={P.ink} /></View>
        <BrandMark nameSize={24} color={P.ink} />
        <AppText variant="h3" color={P.ink} align="center">{ar ? 'كون جزء من الحكاية' : 'Faites partie de l’inspiration'}</AppText>
        <AppText color={P.muted} align="center">{ar ? 'سجّل الدخول باش تعجبك المنشورات، تعلّق، تتابع الناشرين وتحفظ إلهامك.' : 'Connectez-vous pour aimer, commenter, suivre les éditeurs et retrouver vos inspirations.'}</AppText>
        <Pressable accessibilityRole="button" onPress={() => { onClose(); router.push('/sign-in'); }} style={styles.primary}><AppText variant="label" color={P.paper}>{ar ? 'تسجيل الدخول' : 'Se connecter'}</AppText></Pressable>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.later}><AppText color={P.muted}>{ar ? 'موش توّا' : 'Continuer à découvrir'}</AppText></Pressable>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ overlay: { flex: 1, justifyContent: 'flex-end' }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: veil(.45) }, sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', alignItems: 'center', gap: 16, padding: 24, borderTopLeftRadius: 32, borderTopRightRadius: 32, backgroundColor: P.paper }, handle: { width: 36, height: 4, borderRadius: RADIUS.xs, backgroundColor: P.line }, logo: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 38, backgroundColor: P.neutral }, primary: { minHeight: 52, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.full, backgroundColor: P.accent }, later: { minHeight: 44, justifyContent: 'center' } });
