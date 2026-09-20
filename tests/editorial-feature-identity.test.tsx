// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AyroviMotion } from '../client/src/components/AyroviMotion';
import { BottomNavBar } from '../client/src/components/BottomNavBar';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { NavigationHistoryProvider } from '../client/src/navigation/NavigationHistory';
import { DEFAULT_INTERFACE_CONFIG } from '../client/src/config/interfaceConfig';
import glyphs from '../client/src/design/editorial/glyphs.json';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement,root:Root;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);window.history.replaceState(null,'','/');});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
describe('feature identity is consistent, not a brand exception',()=>{
 it('has distinct canonical SONIM, Vision and Lens geometry, not generic sparkle/eye aliases',()=>{
  expect(glyphs.Sonim).not.toEqual(glyphs.Sparkles);expect(glyphs.Vision).not.toEqual(glyphs.Eye);
  expect(new Set([glyphs.Lens,glyphs.Vision,glyphs.Sonim].map(x=>JSON.stringify(x))).size).toBe(3);
  expect([glyphs.Lens,glyphs.Vision,glyphs.Sonim].every(g=>!g.mirrorRtl)).toBe(true);
 });
 it('preserves the navigation destinations/callbacks while using the three feature icons',async()=>{
  const lens=vi.fn(),sonim=vi.fn();await act(async()=>root.render(<LocaleProvider><NavigationHistoryProvider><BottomNavBar isAiDrawerOpen={false} onOpenLens={lens} onToggleAiDrawer={sonim} config={DEFAULT_INTERFACE_CONFIG.navigation} iconConfig={DEFAULT_INTERFACE_CONFIG.icons}/></NavigationHistoryProvider></LocaleProvider>));
  expect([...host.querySelectorAll('nav [data-editorial-icon]')].map(el=>el.getAttribute('data-editorial-icon'))).toEqual(['Lens','Sonim','Vision']);
  const buttons=host.querySelectorAll<HTMLButtonElement>('nav button');await act(async()=>{buttons[0].click();buttons[1].click();});expect(lens).toHaveBeenCalledOnce();expect(sonim).toHaveBeenCalledOnce();
  await act(async()=>buttons[2].click());expect(host.querySelector('[role="dialog"] [data-editorial-icon="Vision"]')).not.toBeNull();
  expect(host.textContent).toContain('Bientôt disponible'); // No fictional new backend capability.
 });
 it('uses SONIM in every activity state, settles and cleans up without old geometry',async()=>{
  vi.useFakeTimers();
  for(const state of ['thinking','analyzing','reasoning','creating'] as const){await act(async()=>root.render(<AyroviMotion state={state} label="SONIM activity"/>));expect(host.querySelectorAll('[data-editorial-icon="Sonim"]')).toHaveLength(1);expect(host.querySelector('polygon,[data-brand-mark]')).toBeNull();}
  await act(async()=>root.render(<AyroviMotion state="idle"/>));expect(host.querySelector('[data-state="settling"]')).not.toBeNull();
  await act(async()=>vi.advanceTimersByTime(680));expect(host.querySelector('[data-state="idle"]')).not.toBeNull();
 });
});
