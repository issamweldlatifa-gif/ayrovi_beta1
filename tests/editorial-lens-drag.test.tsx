// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { InteractiveLensResults } from '../client/src/ayrovix/components/InteractiveLensResults';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
beforeEach(async()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<LocaleProvider><InteractiveLensResults view={{queryLabel:'Test',list:[],eventId:'test'}} previewUrl={null} fallbackImage={null} onChoose={()=>{}} onReset={()=>{}}/></LocaleProvider>));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
function parts(){const handle=host.querySelector<HTMLElement>('.cursor-grab')!;const sheet=handle.parentElement!;Object.defineProperty(sheet.parentElement,'clientHeight',{value:1000,configurable:true});return {handle,sheet};}
describe('Lens drawer pointer lifecycle',()=>{
 it('uses the actual latest drag height on mouseup, not the stale render captured at mousedown',async()=>{
  const {handle,sheet}=parts();expect(sheet.style.height).toBe('38%');
  await act(async()=>handle.dispatchEvent(new MouseEvent('mousedown',{clientY:600,bubbles:true})));
  await act(async()=>window.dispatchEvent(new MouseEvent('mousemove',{clientY:100})));
  await act(async()=>window.dispatchEvent(new MouseEvent('mouseup',{clientY:100})));
  expect(sheet.style.height).toBe('100%');
 });
 it('does not start a drag when operating a header button',async()=>{
  const {handle,sheet}=parts();const spy=vi.spyOn(window,'addEventListener');
  await act(async()=>handle.querySelector('button')!.dispatchEvent(new MouseEvent('mousedown',{clientY:600,bubbles:true})));
  expect(spy.mock.calls.some(([name])=>name==='mousemove')).toBe(false);expect(sheet.style.height).toBe('38%');
 });
 it('cleans up global pointer listeners if the screen closes mid-drag',async()=>{
  const {handle}=parts();const spy=vi.spyOn(window,'removeEventListener');
  await act(async()=>handle.dispatchEvent(new MouseEvent('mousedown',{clientY:600,bubbles:true})));
  await act(async()=>root.render(null));
  expect(spy.mock.calls.some(([name])=>name==='mousemove')).toBe(true);expect(spy.mock.calls.some(([name])=>name==='mouseup')).toBe(true);
 });
});
