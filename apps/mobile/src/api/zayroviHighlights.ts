import { useQuery } from '@tanstack/react-query';
import { HIGHLIGHT_LIMIT } from '../../../../shared/zayroviHighlights';
import { useSession } from '@/state/session';
import { apiGetEnvelope, type RequestOptions } from './client';
import { parseReels } from './social';

export const highlightsKey = ['home', 'zayrovi-highlights'] as const;

export async function fetchZayroviHighlights(options: RequestOptions = {}) {
  const response = await apiGetEnvelope<{ highlightsEnabled?: boolean; data: unknown }>('/api/public/zayrovi-highlights', options);
  return { enabled: response.highlightsEnabled !== false, reels: parseReels(response).slice(0, HIGHLIGHT_LIMIT) };
}

export function useZayroviHighlights(enabled = true) {
  const session = useSession();
  return useQuery({
    queryKey: [...highlightsKey, session.account ? `account:${session.account.id}` : 'guest'],
    queryFn: ({ signal }) => fetchZayroviHighlights({ signal }),
    enabled: enabled && session.status !== 'loading',
    staleTime: 30_000,
  });
}
