import { Pressable, View } from 'react-native';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { usePublisherFollow } from '@/features/publications/usePublisherFollow';

/** Reuses Publication's persisted relation and write service, not a second business core. */
export function ReelFollow({
  publisherId,
  onAuth,
  onFollowed,
  onMedia = false,
}: {
  publisherId: string;
  onAuth: () => void;
  onFollowed?: () => void;
  onMedia?: boolean;
}) {
  const theme = useTheme();
  const t = useT();
  const follow = usePublisherFollow(publisherId, onAuth, onFollowed);
  const ink = onMedia ? theme.colors.onMedia : theme.colors.ink;
  const label = follow.state === 'error'
    ? t('publication.followRetry')
    : follow.state === 'pending'
      ? '…'
      : follow.state === 'following'
        ? t('publication.following')
        : t('publication.follow');
  return (
    <View style={{ gap: 4, maxWidth: '48%', flexShrink: 1 }}>
      <Pressable
        testID="reel-follow"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: follow.disabled }}
        disabled={follow.disabled}
        onPress={follow.press}
        style={{
          minHeight: 44,
          borderWidth: onMedia ? 0 : 1,
          borderColor: ink,
          borderRadius: theme.radius.full,
          paddingHorizontal: onMedia ? 4 : 12,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppText variant="label" color={ink} numberOfLines={onMedia ? 1 : undefined}>
          {onMedia ? `· ${label}` : follow.state === 'idle' ? `+ ${label}` : label}
        </AppText>
      </Pressable>
      {follow.writeFailed ? (
        <AppText accessibilityRole="alert" variant="caption" color={ink}>
          {t('publication.followError')}
        </AppText>
      ) : null}
    </View>
  );
}
