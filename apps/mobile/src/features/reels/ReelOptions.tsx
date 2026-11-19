import { ReactionButton } from '@/design/reactions/ReactionButton';
import type { ContentReaction } from '@/design/reactions/reactionModel';
import { formatRailCount } from './reelTray';
import { reelCaption } from './reelCaption';
import { ReelFollow } from './ReelFollow';
import { SheetRise, SHEET_MODAL_ANIMATION } from '@/design/sheet/SheetRise';
import {
  PublicationAuthHost,
  PublicationAuthSheet,
} from '@/features/publications/PublicationAuthSheet';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n, useT } from '@/i18n';
import { veil } from '@/design/tokens.mobile';
import type { Reel } from '@/api/social';
import { ReelPublisher } from './ReelPublisher';
import { hideReelOnDevice } from './reelVisibility';

/** Genuine available actions only; device-local hiding is explicitly labelled. */
export function ReelOptions({
  reel,
  onClose,
  onShare,
  onLike,
  onComment,
  onFollowed,
  liked = false,
  canLike = true,
  interactionError = '',
  informationOnly = false,
  onReactionPick,
  reaction = null,
  reactionCount = 0,
}: {
  reel: Reel;
  onClose: () => void;
  onShare?: () => Promise<unknown>;
  onLike?: () => void;
  onComment?: () => void;
  onFollowed?: () => void;
  liked?: boolean;
  canLike?: boolean;
  interactionError?: string;
  informationOnly?: boolean;
  onReactionPick?: (choice: ContentReaction) => void;
  reaction?: ContentReaction | null;
  reactionCount?: number;
}) {
  const theme = useTheme(),
    { locale } = useI18n(),
    insets = useSafeAreaInsets();
  const t = useT();
  const ar = locale === 'ar';
  const { title, description } = reelCaption(reel, locale);
  const [auth, setAuth] = useState(false);
  const [info, setInfo] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      onClose();
    } catch {
      setError(
        ar
          ? 'تعذّر تنفيذ العملية. حاول مجددًا.'
          : 'Action impossible. Réessayez.'
      );
    } finally {
      setBusy(false);
    }
  }
  const actions = [
    ...(onShare ? [{
      icon: 'share-social-outline',
      label: ar ? 'مشاركة' : 'Partager',
      action: () => run(onShare),
    }] : []),
    ...(onLike && !onReactionPick
      ? [
          {
            // Z-Reactions : même sens que le toucher du bouton officiel —
            // J'aime, ou retirer la réaction posée (quelle qu'elle soit).
            icon: liked ? 'close-circle-outline' : 'thumbs-up-outline',
            label: ar
              ? liked
                ? 'إلغاء التفاعل'
                : 'إعجاب'
              : liked
              ? 'Retirer la réaction'
              : 'J’aime',
            action: () => {
              if (!canLike) setAuth(true);
              else onLike();
            },
          },
        ]
      : []),
    ...(onComment
      ? [
          {
            icon: 'chatbubble-outline',
            label: ar ? 'التعليقات' : 'Commentaires',
            action: () => {
              onClose();
              onComment();
            },
          },
        ]
      : []),
    {
      icon: 'eye-off-outline',
      label: ar ? 'إخفاء على هذا الجهاز' : 'Masquer sur cet appareil',
      action: () => run(() => hideReelOnDevice(reel.id)),
    },
    {
      icon: 'information-circle-outline',
      label: ar ? 'حول هذا الفيديو' : 'À propos de cette vidéo',
      action: () => setInfo((value) => !value),
    },
  ];
  return (
    <Modal transparent animationType={SHEET_MODAL_ANIMATION} visible onRequestClose={onClose}>
      <PublicationAuthHost onNavigate={onClose}>
        <View style={[styles.overlay, { backgroundColor: veil(0.45) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ar ? 'إغلاق الخيارات' : 'Fermer les options'}
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
          <SheetRise
            testID="reel-options"
            accessibilityViewIsModal
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.canvas,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View
              style={[styles.handle, { backgroundColor: theme.colors.muted }]}
            />
            <View style={styles.heading}>
              <AppText variant="h3">
                {informationOnly ? t('reel.viewerInfo') : t('reel.viewerOptions')}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ar ? 'إغلاق' : 'Fermer'}
                onPress={onClose}
                style={styles.close}
              >
                <Ionicons
                  name="close"
                  size={theme.iconSize.md}
                  color={theme.colors.ink}
                />
              </Pressable>
            </View>
            <ScrollView>
              <View style={styles.publisher}>
                <ReelPublisher />
                {!informationOnly ? <ReelFollow
                  publisherId={reel.channelId}
                  onAuth={() => setAuth(true)}
                  onFollowed={onFollowed}
                /> : null}
              </View>
              {!informationOnly && onLike && onReactionPick ? <View style={[styles.action, { borderTopColor: theme.colors.line }]}>
                <ReactionButton testID="reel-menu-reaction" variant="inline" surface="card" reaction={reaction}
                  count={reactionCount > 0 ? formatRailCount(reactionCount) : null} onTap={canLike ? onLike : () => setAuth(true)}
                  onPick={onReactionPick} guest={!canLike} ink={theme.colors.ink} />
              </View> : null}
              {!informationOnly && actions.map((action) => (
                <Pressable
                  key={action.icon}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={action.action}
                  style={[styles.action, { borderTopColor: theme.colors.line }]}
                >
                  <Ionicons
                    name={action.icon as keyof typeof Ionicons.glyphMap}
                    size={theme.iconSize.md}
                    color={theme.colors.ink}
                  />
                  <AppText variant="body" style={styles.label}>
                    {action.label}
                  </AppText>
                </Pressable>
              ))}
              {info || informationOnly ? (
                <View style={styles.info}>
                  {title ? <AppText variant="label">{title}</AppText> : null}
                  {description ? <AppText variant="body">{description}</AppText> : null}
                  <AppText variant="caption" color={theme.colors.muted}>
                    {ar
                      ? 'فيديوهات Zayrovi Team مرتبة حسب تاريخ النشر. الإخفاء يخص هذا الجهاز فقط، ويمكن إلغاؤه من قسم Reels في الرئيسية.'
                      : 'Les vidéos de Zayrovi Team sont présentées par date de publication. Le masquage concerne cet appareil uniquement et peut être annulé depuis la section Reels de l’accueil.'}
                  </AppText>
                </View>
              ) : null}
              {error || interactionError ? (
                <AppText accessibilityRole="alert" variant="body">
                  {error || interactionError}
                </AppText>
              ) : null}
            </ScrollView>
          </SheetRise>
          {auth ? (
            <PublicationAuthSheet visible onClose={() => setAuth(false)} />
          ) : null}
        </View>
      </PublicationAuthHost>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publisher: {
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  label: { flex: 1 },
  info: { paddingVertical: 12, gap: 8 },
});
