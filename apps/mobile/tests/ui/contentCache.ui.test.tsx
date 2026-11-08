import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReels, useSocialCounts, queryKeys, reelPagesKey } from '../../src/api/hooks';
import { fetchReelPage, fetchSocialCounts } from '../../src/api/social';
jest.mock('../../src/api/social', () => ({
  fetchReelPage: jest.fn(async () => ({ items: [], nextCursor: null })),
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
  expect(fetchReelPage).toHaveBeenCalledTimes(1);
  await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.reels }); });
  expect(fetchReelPage).toHaveBeenCalledTimes(2);
  second.unmount();
  client.setQueryData(reelPagesKey(), { pages: [{ items: [], nextCursor: null }], pageParams: [null] }, { updatedAt: Date.now() - 61_000 });
  renderHook(() => useReels(), { wrapper });
  await waitFor(() => expect(fetchReelPage).toHaveBeenCalledTimes(3));
});
it('does not request offscreen Reels or empty social counts', async () => {
  const hook = renderHook(() => { useReels(false); useSocialCounts([]); }, { wrapper });
  await act(async () => {});
  expect(fetchReelPage).not.toHaveBeenCalled();
  expect(fetchSocialCounts).not.toHaveBeenCalled();
  hook.unmount();
});

it('loads pages on demand and retains the first page when the next request fails', async () => {
  const fetchPage = fetchReelPage as jest.Mock;
  fetchPage.mockResolvedValueOnce({ items: [{ id: 'r1' }], nextCursor: 'cursor1' });
  const hook = renderHook(() => useReels(true, 'r1'), { wrapper });
  await waitFor(() => expect(hook.result.current.data?.length).toBe(1));
  expect(fetchPage).toHaveBeenLastCalledWith(null, expect.objectContaining({ signal: expect.anything() }), 'r1');
  expect(hook.result.current.hasNextPage).toBe(true);
  fetchPage.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { await hook.result.current.fetchNextPage(); });
  await waitFor(() => expect(hook.result.current.isFetchNextPageError).toBe(true));
  expect(hook.result.current.data?.map(row => row.id)).toEqual(['r1']);
  fetchPage.mockResolvedValueOnce({ items: [{ id: 'r2' }], nextCursor: null });
  await act(async () => { await hook.result.current.fetchNextPage(); });
  await waitFor(() => expect(hook.result.current.data?.length).toBe(2));
  expect(fetchPage).toHaveBeenLastCalledWith('cursor1', expect.objectContaining({ signal: expect.anything() }), 'r1');
  expect(hook.result.current.data?.map(row => row.id)).toEqual(['r1', 'r2']);
  expect(hook.result.current.hasNextPage).toBe(false);
});

it('preserves Reel array identity on unrelated parent renders', async () => {
  (fetchReelPage as jest.Mock).mockResolvedValueOnce({ items: [{ id: 'stable' }], nextCursor: null });
  const hook = renderHook(() => useReels(), { wrapper });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  const data = hook.result.current.data;
  hook.rerender({});
  expect(hook.result.current.data).toBe(data);
});
