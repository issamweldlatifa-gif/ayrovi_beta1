import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark, ZMark } from '@/design/BrandMark';
import { AppText } from '@/design/ui';
import { PUBLICATION_THEME as P, RADIUS, veil } from '@/design/tokens.mobile';
import { useI18n } from '@/i18n';

const AuthHostContext = createContext<null | {
  show: (close: () => void) => void;
}>(null);
/** Render authentication in the owning modal, not in a second iOS modal presentation. */
export function PublicationAuthHost({
  children,
  onNavigate,
}: {
  children: ReactNode;
  onNavigate: () => void;
}) {
  const [close, setClose] = useState<null | (() => void)>(null);
  const show = useCallback(
    (callback: () => void) => setClose(() => callback),
    []
  );
  const context = useMemo(() => ({ show }), [show]);
  const dismiss = () => {
    close?.();
    setClose(null);
  };
  return (
    <AuthHostContext.Provider value={context}>
      <View style={{ flex: 1 }}>
        {children}
        {close ? (
          <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
            <AuthContent
              onClose={dismiss}
              onSignIn={() => {
                dismiss();
                onNavigate();
                router.push('/sign-in');
              }}
            />
          </View>
        ) : null}
      </View>
    </AuthHostContext.Provider>
  );
}
function AuthContent({
  onClose,
  onSignIn,
}: {
  onClose: () => void;
  onSignIn: () => void;
}) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.overlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          ar ? 'إغلاق طلب الدخول' : 'Fermer la demande de connexion'
        }
        onPress={onClose}
        style={styles.backdrop}
      />
      <View
        testID="publication-auth-sheet"
        accessibilityViewIsModal
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}
      >
        <View style={styles.handle} />
        <View style={styles.logo}>
          <ZMark width={48} color={P.ink} />
        </View>
        <BrandMark nameSize={24} color={P.ink} />
        <AppText variant="h3" color={P.ink} align="center">
          {ar ? 'كون جزء من الحكاية' : 'Faites partie de l’inspiration'}
        </AppText>
        <AppText color={P.muted} align="center">
          {ar
            ? 'سجّل الدخول باش تتفاعل، تعلّق، تتابع الناشرين وتحفظ إلهامك.'
            : 'Connectez-vous pour réagir, commenter, suivre les éditeurs et retrouver vos inspirations.'}
        </AppText>
        <Pressable
          accessibilityRole="button"
          onPress={onSignIn}
          style={styles.primary}
        >
          <AppText variant="label" color={P.paper}>
            {ar ? 'تسجيل الدخول' : 'Se connecter'}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={styles.later}
        >
          <AppText color={P.muted}>
            {ar ? 'موش توّا' : 'Continuer à découvrir'}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
/** Guest writes require sign-in; reading remains public. */
export function PublicationAuthSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const host = useContext(AuthHostContext);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (visible && host) host.show(() => closeRef.current());
  }, [visible, host]);
  if (host) return null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <AuthContent
        onClose={onClose}
        onSignIn={() => {
          onClose();
          router.push('/sign-in');
        }}
      />
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: veil(0.45) },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 24,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: P.paper,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: RADIUS.xs,
    backgroundColor: P.line,
  },
  logo: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 38,
    backgroundColor: P.neutral,
  },
  primary: {
    minHeight: 52,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    backgroundColor: P.accent,
  },
  later: { minHeight: 44, justifyContent: 'center' },
});
