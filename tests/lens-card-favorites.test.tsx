// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi,describe} from 'vitest';
import {useLensFavorites} from '../client/src/ayrovix/components/useLensFavorites';
import type {AyrovixCandidate} from '../client/src/ayrovix/types';
const api=vi.hoisted(()=>vi.fn());
vi.mock('../client/src/customer/api',()=>({customerApi:api}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const item={id:'a',kind:'external',title:'Jacket',sourceUrl:'https://example.com/a',image:'/a.png',priceTnd:500} as AyrovixCandidate;
const saved={id:'saved-a',source_url:item.sourceUrl,product_id:null};
let state:ReturnType<typeof useLensFavorites>,root:Root,host:HTMLElement;
const account=(id='A')=>({account:{id},csrfToken:'csrf-'+id}) as any;
function Fixture({session,open}:{session:any;open:()=>void}){state=useLensFavorites(session,open);return <button disabled={state.busy} aria-pressed={state.isSaved(item)} onClick={()=>state.toggle(item)}>favorite</button>;}
const open=vi.fn();
async function render(session:any=account()){await act(async()=>root.render(<Fixture session={session} open={open}/>));}
async function click(){await act(async()=>host.querySelector('button')!.click());}
beforeEach(()=>{api.mockReset();open.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);api.mockResolvedValue({data:[]});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
describe('Lens account favorites',()=>{
 it('opens account for guests without pretending a save or making a write',async()=>{
  await render(null);await click();expect(open).toHaveBeenCalledTimes(1);expect(api).not.toHaveBeenCalled();expect(state.isSaved(item)).toBe(false);expect(state.message).toBe('auth');
 });
 it('loads existing favorites once without rotating the account CSRF session',async()=>{
  api.mockResolvedValue({data:[saved]});await render();expect(state.isSaved(item)).toBe(true);expect(api).toHaveBeenCalledTimes(1);expect(api.mock.calls[0][0]).toBe('/api/customer/account/favorites');
 });
 it('saves and removes through the existing account API with CSRF',async()=>{
  await render();api.mockResolvedValueOnce({data:saved});await click();expect(state.isSaved(item)).toBe(true);
  const call=api.mock.calls.at(-1)!;expect(call[0]).toBe('/api/customer/account/favorites');expect(call[2]).toBe('csrf-A');expect(JSON.parse(call[1].body)).toMatchObject({sourceUrl:item.sourceUrl,title:'Jacket',priceTND:500});
  api.mockResolvedValueOnce({success:true});await click();expect(state.isSaved(item)).toBe(false);expect(api.mock.calls.at(-1)![0]).toBe('/api/customer/account/favorites/saved-a');expect(api.mock.calls.at(-1)![1].method).toBe('DELETE');
 });
 it('does not show a saved heart on a failed write',async()=>{
  await render();api.mockRejectedValueOnce(new Error('offline'));await click();expect(state.isSaved(item)).toBe(false);expect(state.message).toBe('save');expect(state.busy).toBe(false);
 });
 it('does not remove a saved heart on a failed delete',async()=>{
  api.mockResolvedValueOnce({data:[saved]});await render();api.mockRejectedValueOnce(new Error('offline'));await click();expect(state.isSaved(item)).toBe(true);
 });
 it('serializes repeated clicks and ignores a stale save after switching accounts',async()=>{
  await render();let resolve!:(value:any)=>void;api.mockImplementationOnce(()=>new Promise(r=>resolve=r));
  await act(async()=>{void state.toggle(item);void state.toggle(item);});expect(api).toHaveBeenCalledTimes(2);expect(state.busy).toBe(true);
  await render(account('B'));await act(async()=>resolve({data:saved}));expect(state.isSaved(item)).toBe(false);expect(state.busy).toBe(false);
 });
 it('retries initial load before mutating, so an existing favorite is not mistaken for an unsaved one',async()=>{
  api.mockRejectedValueOnce(new Error('offline'));await render();expect(state.message).toBe('load');api.mockResolvedValueOnce({data:[saved]}).mockResolvedValueOnce({success:true});await click();expect(api.mock.calls.at(-1)![1].method).toBe('DELETE');expect(state.isSaved(item)).toBe(false);
 });
});
