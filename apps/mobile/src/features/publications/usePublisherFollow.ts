/**
 * Relation « suivre un éditeur » — UNE seule logique pour Reels et Publication.
 *
 * Même relation persistée côté serveur (`publication_follows`), mêmes clés de
 * cache : suivre « zayrovi team » depuis un Reel l'affiche suivi dans la page
 * Publication, et inversement. Un invité est envoyé vers la connexion.
 */
import { useRef } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchPublisherFollow, followPublisher } from '@/api/publisherFollow';
import { useSession } from '@/state/session';

export type PublisherFollowState = 'idle' | 'following' | 'pending' | 'error';

export interface PublisherFollow {
  /** `pending` : lecture ou écriture en cours ; `error` : lecture impossible (bouton « Réessayer »). */
  state: PublisherFollowState;
  /** L'écriture a échoué : message visible, le bouton reste utilisable. */
  writeFailed: boolean;
  disabled: boolean;
  /** Appui : invité → connexion ; erreur de lecture → relecture ; sinon bascule. */
  press: () => void;
}

export function publisherFollowKey(owner: string, publisherId: string) {
  return ['publisher-follow', owner, publisherId] as const;
}

export function usePublisherFollow(publisherId: string, onAuth: () => void): PublisherFollow {
  const session = useSession();
  const client = useQueryClient();
  const owner = session.account?.id || 'guest';
  const signedIn = session.status === 'signedIn';
  const key = publisherFollowKey(owner, publisherId);
  const mutationKey = ['publisher-follow-write', owner, publisherId];

  const relation = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchPublisherFollow(publisherId, { signal }),
    enabled: signedIn && !!publisherId,
    retry: false,
    staleTime: 0,
  });
  const busy = useIsMutating({ mutationKey }) > 0;
  const lock = useRef(false);
  const mutation = useMutation({
    mutationKey,
    mutationFn: async (following: boolean) => {
      const value = await followPublisher(publisherId, following);
      if (typeof value.following !== 'boolean') throw new Error('Unconfirmed follow');
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
      /* L'erreur reste visible et l'action peut être relancée. */
    } finally {
      lock.current = false;
    }
  }

  const disabled = signedIn && !relation.isError && (relation.isPending || busy);
  const state: PublisherFollowState = !signedIn
    ? 'idle'
    : relation.isError
      ? 'error'
      : disabled
        ? 'pending'
        : relation.data?.following
          ? 'following'
          : 'idle';

  return {
    state,
    writeFailed: mutation.isError,
    disabled,
    press: () => {
      if (signedIn && relation.isError) {
        void relation.refetch();
        return;
      }
      void toggle();
    },
  };
}
