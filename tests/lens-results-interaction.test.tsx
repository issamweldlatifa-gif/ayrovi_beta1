// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { InteractiveLensResults } from '../client/src/ayrovix/components/InteractiveLensResults';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
let roi: ReturnType<typeof vi.fn>, reset: ReturnType<typeof vi.fn>;
const box = [.2,.1,.4,.7] as [number,number,number,number];
const props = () => ({ view:{queryLabel:'Jacket',list:[],eventId:'test'},previewUrl:'image-a.jpg',fallbackImage:null,onChoose:vi.fn(),onReset:reset,onRoiSearch:roi,detectedProducts:[{name:'Jacket',category:'clothing',box}] });
beforeEach(() => {
 host=document.createElement('div');document.body.append(host);root=createRoot(host);roi=vi.fn();reset=vi.fn();
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(400);
 vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(800);
 vi.spyOn(HTMLImageElement.prototype,'naturalWidth','get').mockReturnValue(800);
 vi.spyOn(HTMLImageElement.prototype,'naturalHeight','get').mockReturnValue(400);
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({x:0,y:0,left:0,top:0,width:400,height:800,right:400,bottom:800,toJSON(){}});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
async function render(p: any = props()){await act(async()=>root.render(<LocaleProvider><InteractiveLensResults {...p}/></LocaleProvider>));}
async function click(selector:string){await act(async()=>host.querySelector<HTMLButtonElement>(selector)!.click());}
async function key(selector:string,key:string,type='keydown'){await act(async()=>host.querySelector(selector)!.dispatchEvent(new KeyboardEvent(type,{key,bubbles:true,cancelable:true})));}
describe('Lens result interaction',()=>{
 it('keeps full-image controls out of the expanded result surface',async()=>{
  await render();expect(host.querySelector('.lens-results')?.getAttribute('data-expanded')).toBe('false');
  await click('.lens-sheet-handle');expect(host.querySelector('.lens-results')?.getAttribute('data-expanded')).toBe('true');
  expect(host.querySelector('.lens-results-chrome')?.getAttribute('aria-hidden')).toBe('true');
  expect(host.querySelector('.lens-results-image')?.hasAttribute('inert')).toBe(true);
  await key('.lens-sheet-handle','Escape');expect(host.querySelector('.lens-results')?.getAttribute('data-expanded')).toBe('false');expect(reset).not.toHaveBeenCalled();
  await click('.lens-results-chrome button');expect(reset).toHaveBeenCalledTimes(1);
 });
 it('never searches just because detections arrive; only explicit selection starts a crop',async()=>{
  await render();expect(host.querySelectorAll('.lens-selection-corner')).toHaveLength(4);expect(roi).not.toHaveBeenCalled();
  await click('.lens-product-dot');expect(roi).toHaveBeenCalledWith({x:20,y:10,w:40,h:70});
 });
 it('allows keyboard resize without a network request on each keydown repeat',async()=>{
  await render();await key('.lens-corner-nw','ArrowRight');await key('.lens-corner-nw','ArrowRight');
  expect(roi).not.toHaveBeenCalled();await key('.lens-corner-nw','ArrowRight','keyup');expect(roi).toHaveBeenCalledTimes(1);expect(roi.mock.calls[0][0].x).toBe(22);
 });
 it('stops analysis dots when loading completes without resetting selection',async()=>{
  const p=props();await render({...p,isLoading:true});expect(host.querySelector('.lens-analysis-dots')).toBeTruthy();
  await click('.lens-product-dot');await render({...p,isLoading:false});expect(host.querySelector('.lens-analysis-dots')).toBeNull();expect(host.querySelector('.lens-selection')).toBeTruthy();
 });
 it('retains expanded position when a response arrives',async()=>{
  const p=props();await render({...p,isLoading:true});await click('.lens-sheet-handle');await render({...p,isLoading:false,view:{...p.view,eventId:'new'}});
  expect(host.querySelector('.lens-results')?.getAttribute('data-expanded')).toBe('true');
 });
 it('clears crop and returns to peek for a new image',async()=>{
  const p=props();await render(p);await click('.lens-product-dot');await click('.lens-sheet-handle');
  await render({...p,previewUrl:'image-b.jpg',detectedProducts:[]});expect(host.querySelector('.lens-selection')).toBeNull();expect(host.querySelector('.lens-results')?.getAttribute('data-expanded')).toBe('false');
 });
 it('uses a full result list for link/text search without a pointless drawer gesture',async()=>{
  await render({...props(),previewUrl:null});expect(host.querySelector('.lens-results')?.getAttribute('data-expanded')).toBe('true');expect(host.querySelector('.lens-sheet-handle')).toBeNull();expect(host.querySelector('.lens-results-chrome')?.hasAttribute('inert')).toBe(false);
 });
 it('drops malformed provider detections rather than rendering invalid geometry',async()=>{
  await render({...props(),detectedProducts:[{name:'bad',category:'x',box:[NaN,0,1,1]}]});expect(host.querySelector('.lens-product-dot')).toBeNull();expect(host.querySelector('.lens-selection')).toBeNull();
 });
});
