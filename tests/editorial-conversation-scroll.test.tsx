// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssistantMessages } from '../client/src/components/assistant/AssistantMessages';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { type AssistantMessage } from '../client/src/components/assistant/types';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const noop=()=>{};
async function render(messages:AssistantMessage[]){await act(async()=>root.render(<LocaleProvider><AssistantMessages messages={messages} isGenerating motionState="thinking" isDark={false} copiedId={null} feedback={{}} selectedProduct={null} productBusyId="" isOrdering={false} onPrompt={noop} onCopy={noop} onRegenerate={noop} onFeedback={noop} onOpenComment={noop} onOpenLens={noop} onSelectProduct={noop} onProductOrder={noop}/></LocaleProvider>));}
describe('SONIM preserves the reader position while responses stream',()=>{
 it('does not pull the reader down until they return near the end, but follows a new user message',async()=>{
  const first:AssistantMessage={id:'reply-1',role:'assistant',text:'First paragraph\n\nSecond paragraph'};
  await render([first]);const scroller=host.querySelector<HTMLElement>('[data-assistant-messages]')!;
  Object.defineProperties(scroller,{scrollHeight:{value:1200,configurable:true},clientHeight:{value:300,configurable:true}});
  scroller.scrollTop=200;await act(async()=>{scroller.dispatchEvent(new Event('scroll'));});
  await render([{...first,text:first.text+'\nMore text'}]);expect(scroller.scrollTop).toBe(200);
  await render([first,{id:'user-2',role:'user',text:'A new question'}]);expect(scroller.scrollTop).toBe(1200);
  scroller.scrollTop=890;await act(async()=>{scroller.dispatchEvent(new Event('scroll'));});
  await render([first,{id:'user-2',role:'user',text:'A new question'},{id:'reply-2',role:'assistant',text:'Answer'}]);expect(scroller.scrollTop).toBe(1200);
 });
 it('renders untrusted response markup as text, preserves paragraphs and exposes wrapping action controls',async()=>{
  await render([{id:'safe',role:'assistant',text:'<img src=x onerror=alert(1)>\n\nمرحبا ✅'},{id:'user',role:'user',text:'question'}]);
  expect(host.querySelector('img')).toBeNull();expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(host.querySelector('.whitespace-pre-wrap')?.textContent).toContain('\n\nمرحبا ✅');
  expect(host.querySelector('.assistant-message-actions')?.className).toContain('flex-wrap');
 });
});
