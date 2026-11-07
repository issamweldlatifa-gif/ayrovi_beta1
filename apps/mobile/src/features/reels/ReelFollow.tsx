import { useRef } from 'react';
import { Pressable, View } from 'react-native';
import {
  useQuery,
  useMutation,
  useIsMutating,
  useQueryClient,
} from '@tanstack/react-query';
import { followPublisher, fetchPublisherFollow } from '@/api/publicationFeed';
import { useSession } from '@/state/session';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';

/** Reuses Publication's persisted relation and write service, not a second business core. */
export function ReelFollow({
  publisherId,
  onAuth,
}: {
  publisherId: string;
  onAuth: () => void;
}) {
  const session = useSession(),
    theme = useTheme(),
    { locale } = useI18n(),
    client = useQueryClient();
  const ar = locale === 'ar',
    owner = session.account?.id || 'guest',
    signedIn = session.status === 'signedIn';
  const key = ['publisher-follow', owner, publisherId],
    mutationKey = ['publisher-follow-write', owner, publisherId];
  const relation = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchPublisherFollow(publisherId, { signal }),
    enabled: signedIn && !!publisherId,
    retry: false,
    staleTime: 0,
  });
  const busy = useIsMutating({ mutationKey }) > 0,
    lock = useRef(false);
  const mutation = useMutation({
    mutationKey,
    mutationFn: async (following: boolean) => {
      const value = await followPublisher(publisherId, following);
      if (typeof value.following !== 'boolean')
        throw new Error('Unconfirmed follow');
      return value;
    },
    onSuccess: async (value) => {
      client.setQueryData(key, value);
      await client.invalidateQueries({ queryKey: ['publication-feed', owner] });
    },
  });
  async function toggle() {
    if (!signedIn) {
      onAuth();
      return;
    }
    if (lock.current || busy || !relation.data) return;
    lock.current = true;
    try {
      await mutation.mutateAsync(!relation.data.following);
    } catch {
      /* Error remains visible and retryable. */
    } finally {
      lock.current = false;
    }
  }
  const disabled = signedIn && (relation.isPending || busy);
  return (
    <View style={{ gap: 4, maxWidth: '48%', flexShrink: 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={
          relation.isError
            ? () => {
                relation.refetch();
              }
            : toggle
        }
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
        <AppText variant="body">
          {relation.isError
            ? ar
              ? 'إعادة المحاولة'
              : 'Réessayer'
            : disabled
            ? '…'
            : relation.data?.following
            ? ar
              ? 'متابَع'
              : 'Suivi'
            : ar
            ? '+ متابعة'
            : '+ Suivre'}
        </AppText>
      </Pressable>
      {mutation.isError ? (
        <AppText accessibilityRole="alert" variant="caption">
          {ar
            ? 'تعذّرت المتابعة. حاول مجددًا.'
            : 'Action impossible. Réessayez.'}
        </AppText>
      ) : null}
    </View>
  );
}
