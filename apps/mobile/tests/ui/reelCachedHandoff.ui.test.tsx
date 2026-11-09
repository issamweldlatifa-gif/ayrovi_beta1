import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReels, reelPagesKey } from '../../src/api/hooks';
import { fetchReelPage } from '../../src/api/social';
jest.mock('../../src/api/social',()=>({fetchReelPage:jest.fn()}));
const item={id:'picked',title:'Cached',videoUrl:'/media/test.mp4'};
function fixture(age=0, invalid=false) {
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  client.setQueryData(reelPagesKey(),{pages:[{items:[item],nextCursor:'home-cursor'}],pageParams:[null]},{updatedAt:Date.now()-age});
  if(invalid) void client.invalidateQueries({queryKey:reelPagesKey()});
  return {client,wrapper:({children}:{children:React.ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>};
}
afterEach(()=>jest.clearAllMocks());
it('presents only the picked cached item while fetching, without borrowing a cursor or suppressing validation',async()=>{
  let resolve!: (page: unknown)=>void;
  (fetchReelPage as jest.Mock).mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const {client,wrapper}=fixture();
  const hook=renderHook(()=>useReels(true,'picked'),{wrapper});
  expect(hook.result.current.data).toEqual([item]);
  expect(hook.result.current.isPlaceholderData).toBe(true);
  expect(hook.result.current.hasNextPage).toBe(false);
  expect(fetchReelPage).toHaveBeenCalledWith(null,expect.any(Object),'picked');
  await act(async()=>resolve({items:[{...item,title:'Fresh'}],nextCursor:'real-cursor'}));
  await waitFor(()=>expect(hook.result.current.isPlaceholderData).toBe(false));
  expect(hook.result.current.data?.[0].title).toBe('Fresh');
  expect(hook.result.current.hasNextPage).toBe(true);
  hook.unmount();client.clear();
});
it.each([[61_000,false],[0,true]])('does not hand off stale or invalidated content (%s, %s)',(age,invalid)=>{
  (fetchReelPage as jest.Mock).mockImplementation(()=>new Promise(()=>{}));
  const {client,wrapper}=fixture(age,invalid);
  const hook=renderHook(()=>useReels(true,'picked'),{wrapper});
  expect(hook.result.current.data).toBeUndefined();
  expect(hook.result.current.isPlaceholderData).toBe(false);
  hook.unmount();client.clear();
});
it('discards placeholder rows on server failure instead of pretending cached data was verified',async()=>{
  (fetchReelPage as jest.Mock).mockRejectedValue(new Error('offline'));
  const {client,wrapper}=fixture();const hook=renderHook(()=>useReels(true,'picked'),{wrapper});
  await waitFor(()=>expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.data).toBeUndefined();
  hook.unmount();client.clear();
});
