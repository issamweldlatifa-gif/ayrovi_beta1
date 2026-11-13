import { Pressable, View } from 'react-native';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { usePublisherFollow } from '@/features/publications/usePublisherFollow';

/** Reuses Publication's persisted relation and write service, not a second business core. */
export function ReelFollow({
  publisherId,
  onAuth,
}: {
  publisherId: string;
  onAuth: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const follow = usePublisherFollow(publisherId, onAuth);
  const label = follow.state === 'error'
    ? t('publication.followRetry')
    : follow.state === 'pending'
      ? '…'
      : follow.state === 'following'
        ? t('publication.following')
        : `+ ${t('publication.follow')}`;
  return (
    <View style={{ gap: 4, maxWidth: '48%', flexShrink: 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: follow.disabled }}
        disabled={follow.disabled}
        onPress={follow.press}
        style={{
          minHeight: 44,
          borderWidth: 1,
          borderColor: theme.colors.ink,
          borderRadius: theme.radius.full,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppText variant="body">{label}</AppText>
      </Pressable>
      {follow.writeFailed ? (
        <AppText accessibilityRole="alert" variant="caption">
          {t('publication.followError')}
        </AppText>
      ) : null}
    </View>
  );
}
