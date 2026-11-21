import { useQuery } from '@tanstack/react-query';
import type { HomeDailyOffer, ZayroviNewsFeed } from '../../../../shared/zayroviNews';
import { apiGetData } from './client';

export function useZayroviNews() {
  return useQuery({ queryKey: ['zayrovi-news'], queryFn: ({ signal }) => apiGetData<ZayroviNewsFeed>('/api/public/zayrovi-news', { signal }),
    staleTime: 30_000, refetchInterval: 60_000 });
}

export function useHomeDailyOffer() {
  return useQuery({ queryKey: ['home-daily-offer'], queryFn: ({ signal }) => apiGetData<HomeDailyOffer>('/api/public/zayrovi-news?view=home', { signal }),
    staleTime: 30_000, refetchInterval: 60_000 });
}
