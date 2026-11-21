import { useQuery } from '@tanstack/react-query';
import { HIGHLIGHT_LIMIT } from '../../../../shared/zayroviHighlights';
import { useSession } from '@/state/session';
import { apiGet } from './client';
import { parseReels } from './social';

export const highlightsKey = ['home', 'zayrovi-highlights'] as const;

export function useZayroviHighlights(enabled = true) {
  const session = useSession();
  return useQuery({
    queryKey: [...highlightsKey, session.account ? `account:${session.account.id}` : 'guest'],
    queryFn: async ({ signal }) => parseReels(await apiGet('/api/public/zayrovi-highlights', { signal })).slice(0, HIGHLIGHT_LIMIT),
    enabled: enabled && session.status !== 'loading',
    staleTime: 30_000,
  });
}
