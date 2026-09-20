// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentSheet } from '../client/src/social/components/CommentSheet';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
const api=vi.hoisted(()=>({getComments:vi.fn(),addComment:vi.fn()}));
vi.mock('../client/src/social/storyService',()=>({...api,timeAgo:()=> 'il y a 1 min'}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement,root:Root;
const props={postId:'p1',isAuthenticated:true,onRequireAuth:vi.fn(),onClose:vi.fn()};
const comment={id:'c1',author:'Client',text:'Confirmed comment',createdAt:new Date().toISOString()};
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();api.getComments.mockResolvedValue([]);host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.stubGlobal('matchMedia',()=>({matches:true,addListener:()=>{},removeListener:()=>{},addEventListener:()=>{},removeEventListener:()=>{}}));vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{width:48,height:48}] as any);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function render(overrides:Partial<typeof props>={}){await act(async()=>root.render(<LocaleProvider><CommentSheet {...props} {...overrides}/></LocaleProvider>));}
async function type(text:string){const input=host.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));});return input;}
async function submit(){await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
describe('truthful comment sheet lifecycle',()=>{
 it('distinguishes loading from empty and failed reads, with a real retry',async()=>{
  let reject!:(e:Error)=>void;api.getComments.mockReturnValueOnce(new Promise((_r,j)=>{reject=j;}));await render();
  expect(host.querySelector('[role="status"]')).not.toBeNull();expect(host.textContent).not.toContain('Aucun commentaire');
  await act(async()=>reject(new Error('offline')));expect(host.querySelector('[role="alert"]')?.textContent).toContain('Impossible');
  api.getComments.mockResolvedValueOnce([comment]);await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Réessayer')!.click());expect(host.textContent).toContain(comment.text);
 });
 it('retains the draft and shows an error instead of inventing a published comment',async()=>{
  api.addComment.mockRejectedValue(new Error('offline'));await render();const input=await type('Mon commentaire');await submit();
  expect(api.addComment).toHaveBeenCalledWith('p1','Mon commentaire');expect(input.value).toBe('Mon commentaire');expect(host.querySelector('[role="alert"]')?.textContent).toContain('non confirmée');expect(host.textContent).toContain('Aucun commentaire');expect(input.disabled).toBe(false);
 });
 it('uses the confirmed server result, prevents concurrent writes and clears the draft only on success',async()=>{
  let resolve!:(value:any)=>void;api.addComment.mockReturnValueOnce(new Promise(r=>{resolve=r;}));await render();await type('Draft comment');await submit();await submit();
  expect(api.addComment).toHaveBeenCalledOnce();expect(host.querySelector('input')!.disabled).toBe(true);
  await act(async()=>resolve(comment));expect(host.textContent).toContain('Confirmed comment');expect(host.querySelector('input')!.value).toBe('');
 });
 it('does not append a late write response to a different post',async()=>{
  let resolve!:(value:any)=>void;api.addComment.mockReturnValueOnce(new Promise(r=>{resolve=r;}));await render();await type('Old post draft');await submit();await render({postId:'p2'});
  await act(async()=>resolve(comment));expect(host.textContent).not.toContain('Confirmed comment');expect(host.querySelector('input')!.value).toBe('');
 });
 it('keeps the draft when authentication expires and opens real authentication',async()=>{
  api.addComment.mockResolvedValue({authRequired:true});await render();await type('My comment');await submit();expect(props.onRequireAuth).toHaveBeenCalledOnce();expect(host.querySelector('input')!.value).toBe('My comment');
 });
 it('owns Escape without closing the media dialog underneath and restores focus',async()=>{
  const trigger=document.createElement('button');document.body.append(trigger);trigger.focus();const parent=vi.fn();window.addEventListener('keydown',parent);
  try {await render();await act(async()=>host.querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));expect(props.onClose).toHaveBeenCalledOnce();expect(parent).not.toHaveBeenCalled();await act(async()=>root.render(null));expect(document.activeElement).toBe(trigger);}
  finally{window.removeEventListener('keydown',parent);trigger.remove();}
 });
});
