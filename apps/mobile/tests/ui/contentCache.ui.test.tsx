import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReels, useSocialCounts, queryKeys } from '../../src/api/hooks';
import { fetchReels, fetchSocialCounts } from '../../src/api/social';
jest.mock('../../src/api/social', () => ({
  fetchReels: jest.fn(async () => []),
  fetchSocialCounts: jest.fn(async () => ({})),
}));
let client: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => client.clear());
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
it('reuses fresh content across navigation, then refreshes stale data and manual invalidation', async () => {
  const first = renderHook(() => useReels(), { wrapper });
  await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
  first.unmount();
  const second = renderHook(() => useReels(), { wrapper });
  expect(fetchReels).toHaveBeenCalledTimes(1);
  await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.reels }); });
  expect(fetchReels).toHaveBeenCalledTimes(2);
  second.unmount();
  client.setQueryData(queryKeys.reels, [], { updatedAt: Date.now() - 61_000 });
  renderHook(() => useReels(), { wrapper });
  await waitFor(() => expect(fetchReels).toHaveBeenCalledTimes(3));
});
it('does not request offscreen Reels or empty social counts', async () => {
  const hook = renderHook(() => { useReels(false); useSocialCounts([]); }, { wrapper });
  await act(async () => {});
  expect(fetchReels).not.toHaveBeenCalled();
  expect(fetchSocialCounts).not.toHaveBeenCalled();
  hook.unmount();
});
