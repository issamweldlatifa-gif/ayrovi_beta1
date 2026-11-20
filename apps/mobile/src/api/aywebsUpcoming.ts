import { useQuery } from '@tanstack/react-query';
import { normalizeAywebsUpcoming, type PublicUpcomingStore } from '../../../../shared/aywebsUpcoming';
import { apiGetData } from './client';

export function useAywebsUpcoming() {
  return useQuery({ queryKey: ['home', 'aywebs-upcoming'], staleTime: 60_000, refetchInterval: 60_000,
    queryFn: async ({ signal }) => {
      const raw = await apiGetData<{ serverTime?: string; stores?: unknown[] }>('/api/public/aywebs-upcoming', { signal });
      const time = Date.parse(raw?.serverTime || '');
      const valid = normalizeAywebsUpcoming({ enabled: true, stores: raw?.stores });
      const stores: PublicUpcomingStore[] = valid?.stores.flatMap((store, index) => {
        const source = raw?.stores?.[index] as Partial<PublicUpcomingStore> | undefined;
        if (!source || typeof source.name !== 'string' || !source.name.trim()) return [];
        const logo = typeof source.logo === 'string' && /^\/stores\/[a-z0-9-]+\.png$/.test(source.logo) ? source.logo : '';
        return [{ ...store, name: source.name.slice(0, 100), logo }];
      }) ?? [];
      return { offsetMs: Number.isFinite(time) ? time - Date.now() : 0, stores };
    },
  });
}
