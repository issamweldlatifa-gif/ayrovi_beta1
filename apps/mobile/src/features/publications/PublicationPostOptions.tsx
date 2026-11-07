import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { apiUrl } from '@/api/client';
import { DEFAULT_API_BASE_URL } from '@/api/config';
import { isApiError, userMessage } from '@/api/errors';
import {
  writePublicationPreference,
  type FeedPost,
} from '@/api/publicationFeed';
import { RADIUS, veil, ICON_SIZE } from '@/design/tokens.mobile';
import { PublicationAuthSheet } from './PublicationAuthSheet';
import {
  PublicationIcon,
  PublicationText,
  PUBLICATION_PALETTE as P,
} from './publicationDesign';

/** Inline sheet can live inside the existing viewer modal on iOS. Real supported actions only. */
export function PublicationPostOptions({
  post,
  onClose,
  onPreference,
}: {
  post: FeedPost;
  onClose: () => void;
  onPreference?: (action: string, id: string) => void;
}) {
  const { locale } = useI18n(),
    ar = locale === 'ar';
  const session = useSession(),
    client = useQueryClient(),
    insets = useSafeAreaInsets();
  const [auth, setAuth] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const owner = session.account?.id || 'guest';
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => back.remove();
  }, [onClose]);
  async function run(action: 'copy' | 'save' | 'hidden' | 'not_interested') {
    if (lock.current) return;
    if (action !== 'copy' && session.status !== 'signedIn') {
      setAuth(true);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (action === 'copy')
        await Clipboard.setStringAsync(
          new URL(
            apiUrl(`/publications?post=${encodeURIComponent(post.id)}`),
            typeof location !== 'undefined'
              ? location.origin
              : DEFAULT_API_BASE_URL
          ).toString()
        );
      else {
        await writePublicationPreference(
          post.id,
          action === 'save' ? { saved: !post.saved } : { feedback: action }
        );
        await client.invalidateQueries({
          queryKey: ['publication-feed', owner],
        });
        onPreference?.(action, post.id);
      }
      onClose();
    } catch (e) {
      if (isApiError(e) && e.status === 401) setAuth(true);
      else
        setError(
          isApiError(e)
            ? userMessage(e)[ar ? 'ar' : 'fr']
            : ar
            ? 'تعذّر الحفظ. أعد المحاولة.'
            : 'Action non enregistrée. Réessayez.'
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const rows = [
    ['copy', ar ? 'نسخ الرابط' : 'Copier le lien', 'link-outline'],
    [
      'save',
      post.saved
        ? ar
          ? 'إلغاء الحفظ'
          : 'Retirer des enregistrements'
        : ar
        ? 'حفظ المنشور'
        : 'Enregistrer',
      'bookmark-outline',
    ],
    [
      'hidden',
      ar ? 'إخفاء المنشور' : 'Masquer cette publication',
      'eye-outline',
    ],
    [
      'not_interested',
      ar ? 'لا يهمّني' : 'Ça ne m’intéresse pas',
      'eye-off-outline',
    ],
  ] as const;
  return (
    <View
      testID="publication-post-options"
      style={styles.overlay}
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ar ? 'إغلاق الخيارات' : 'Fermer les options'}
        onPress={onClose}
        style={{ flex: 1 }}
      />
      <View
        style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom) }]}
      >
        <View style={styles.handle} />
        <View style={styles.group}>
          {rows.map(([action, label, icon], i) => (
            <Pressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={label}
              disabled={busy}
              accessibilityState={{ disabled: busy, busy }}
              onPress={() => void run(action)}
              style={[
                styles.row,
                {
                  flexDirection: ar ? 'row-reverse' : 'row',
                  borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                },
              ]}
            >
              <PublicationText style={{ flex: 1 }}>{label}</PublicationText>
              <PublicationIcon name={icon} size={ICON_SIZE.md} color={P.ink} />
            </Pressable>
          ))}
        </View>
        {error ? (
          <PublicationText
            color={P.reactionError}
            accessibilityLiveRegion="polite"
          >
            {error}
          </PublicationText>
        ) : null}
      </View>
      <PublicationAuthSheet visible={auth} onClose={() => setAuth(false)} />
    </View>
  );
}
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: veil(0.4),
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  sheet: {
    backgroundColor: P.neutral,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: 16,
    gap: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: P.muted,
    alignSelf: 'center',
  },
  group: {
    backgroundColor: P.paper,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 16,
  },
  row: {
    minHeight: 56,
    alignItems: 'center',
    gap: 12,
    borderBottomColor: P.line,
  },
});
