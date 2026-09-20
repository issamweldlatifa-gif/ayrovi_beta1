// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantVoiceModeScreen } from '../client/src/components/assistant/AssistantVoiceModeScreen';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { useSmoothedLevel, normalizeAudioLevel } from '../client/src/hooks/useSmoothedLevel';
import { VoiceOutput } from '../client/src/components/assistant/voice/VoiceOutput';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);localStorage.clear();vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{width:48,height:48}] as any);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const noop=()=>{};
const defaults={state:'listening' as const,volumeLevel:0,isDark:false,isMuted:false,isSpeakerMuted:false,onToggleMute:noop,onToggleSpeaker:noop,onExit:noop,onTapOrb:noop};
async function render(props:Partial<React.ComponentProps<typeof AssistantVoiceModeScreen>>={}){await act(async()=>root.render(<LocaleProvider><AssistantVoiceModeScreen {...defaults} {...props}/></LocaleProvider>));}
async function click(label:string){const button=host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;expect(button).toBeTruthy();await act(async()=>button.click());}
describe('editorial voice interaction and truthful settings',()=>{
 it('Escape closes only the active nested settings; it does not close the parent assistant',async()=>{
  const exit=vi.fn(),ancestor=vi.fn();window.addEventListener('keydown',ancestor);
  try{await render({onExit:exit});await click('Options du mode vocal');
   expect(host.querySelector('.editorial-voice__header')?.hasAttribute('inert')).toBe(true);
   await act(async()=>host.querySelector('.editorial-voice__settings button')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
   expect(host.querySelector('.editorial-voice__settings')).toBeNull();expect(exit).not.toHaveBeenCalled();expect(ancestor).not.toHaveBeenCalled();
   await act(async()=>host.querySelector('.editorial-voice')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
   expect(exit).toHaveBeenCalledTimes(1);expect(ancestor).not.toHaveBeenCalled();
  }finally{window.removeEventListener('keydown',ancestor);}
 });
 it('shows actual initial settings and sends the exact displayed speed',async()=>{
  const change=vi.fn();await render({initialSettings:{voiceId:'Puck',gender:'male',rate:1.25},onVoiceSettingsChange:change});await click('Options du mode vocal');
  expect(host.querySelector('.voice-choices [aria-pressed=true]')?.textContent).toContain('Puck');
  expect(host.querySelector('.voice-rates [aria-pressed=true]')?.textContent).toBe('1.25x');
  const speed=[...host.querySelectorAll<HTMLButtonElement>('.voice-rates button')].find(b=>b.textContent==='1.1x')!;await act(async()=>speed.click());
  expect(change).toHaveBeenCalledWith({rate:1.1});expect(speed.getAttribute('aria-pressed')).toBe('true');
 });
 it('does not pretend optional actions work when handlers are unavailable',async()=>{
  await render({onTapOrb:undefined});expect(host.querySelector<HTMLButtonElement>('.editorial-voice__talk')?.disabled).toBe(true);
  await click('Options du mode vocal');expect(host.querySelector('fieldset')?.disabled).toBe(true);
 });
 it('keeps a copy-safe, finite audio configuration',()=>{
  const output=new VoiceOutput();output.configure({voiceId:'Kore',rate:1.25});const copy=output.getSettings();copy.rate=0;
  output.configure({rate:NaN});expect(output.getSettings()).toMatchObject({voiceId:'Kore',rate:1.25});
  output.configure({rate:Infinity});expect(output.getSettings().rate).toBe(1.25);output.configure({rate:8});expect(output.getSettings().rate).toBe(1.3);
 });
 it('clamps corrupt audio levels rather than drawing NaN/negative amplitudes',()=>{
  expect([NaN,Infinity,-1,0,.5,2].map(normalizeAudioLevel)).toEqual([0,0,0,0,.5,1]);
 });
 it('settles its animation and cancels pending frames on unmount',async()=>{
  const pending=new Map<number,FrameRequestCallback>();let id=0;
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{pending.set(++id,callback);return id;});
  vi.stubGlobal('cancelAnimationFrame',(key:number)=>pending.delete(key));
  function Meter({value}:{value:number}){const level=useSmoothedLevel(value);return <span>{level}</span>;}
  await act(async()=>root.render(<Meter value={0}/>));expect(pending.size).toBe(0);
  await act(async()=>root.render(<Meter value={1}/>));expect(pending.size).toBe(1);
  for(let n=0;n<40&&pending.size;n++){const batch=[...pending];pending.clear();await act(async()=>{for(const [,callback] of batch)callback(n*16);});}
  expect(host.textContent).toBe('1');expect(pending.size).toBe(0);
  await act(async()=>root.render(<Meter value={0}/>));expect(pending.size).toBe(1);await act(async()=>root.render(null));expect(pending.size).toBe(0);
 });
});
