import { PUBLICATION_PALETTE as P } from './publicationDesign';
import { PublicationAuthHost } from './PublicationAuthSheet';
import { useRef, useState } from 'react';
import { RADIUS, ICON_SIZE, veil } from '@/design/tokens.mobile';
import {
  KeyboardAvoidingView,
  PanResponder,
  Modal,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { PublicationIcon as Ionicons } from './publicationDesign';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PublicationText as AppText } from './publicationDesign';
import { useI18n } from '@/i18n';
import { Comments } from '@/features/social/Comments';
export function PublicationCommentsSheet({
  targetId,
  onClose,
}: {
  targetId: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;
  const drag = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 && g.vy > 0.3) close.current();
        else if (g.dy < -30) setExpanded(true);
        else if (g.dy > 30) setExpanded(false);
      },
    })
  ).current;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <PublicationAuthHost onNavigate={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{
            flex: 1,
            paddingTop: insets.top + 48,
            justifyContent: 'flex-end',
            backgroundColor: veil(0.25),
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              locale === 'ar' ? 'إغلاق التعليقات' : 'Fermer les commentaires'
            }
            onPress={onClose}
            style={{ flex: 1 }}
          />
          <View
            style={{
              height: expanded ? '94%' : '72%',
              backgroundColor: P.paper,
              borderTopLeftRadius: RADIUS.xl,
              borderTopRightRadius: RADIUS.xl,
              paddingHorizontal: 16,
              paddingBottom: Math.max(12, insets.bottom),
              gap: 8,
            }}
          >
            <View
              {...drag.panHandlers}
              testID="publication-comments-drag"
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={
                locale === 'ar'
                  ? 'توسيع التعليقات'
                  : 'Agrandir les commentaires'
              }
              accessibilityActions={[
                { name: 'increment' },
                { name: 'decrement' },
              ]}
              onAccessibilityAction={(e) =>
                setExpanded(e.nativeEvent.actionName === 'increment')
              }
              style={{ minHeight: 24, justifyContent: 'center' }}
            >
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: RADIUS.xs,
                  backgroundColor: P.line,
                  alignSelf: 'center',
                  marginTop: 8,
                }}
              />
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <AppText variant="h3">
                {locale === 'ar' ? 'التعليقات' : 'Commentaires'}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={locale === 'ar' ? 'إغلاق' : 'Fermer'}
                onPress={onClose}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={ICON_SIZE.md} />
              </Pressable>
            </View>
            <Comments targetId={targetId} publication />
          </View>
        </KeyboardAvoidingView>
      </PublicationAuthHost>
    </Modal>
  );
}
