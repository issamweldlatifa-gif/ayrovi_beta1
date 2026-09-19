// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantComposer } from '../client/src/components/assistant/AssistantComposer';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
const onSend = vi.fn(), onStop = vi.fn(), onCancel = vi.fn(), onFinish = vi.fn();
beforeEach(() => { vi.clearAllMocks(); container=document.createElement('div');document.body.append(container);root=createRoot(container); });
afterEach(async () => { await act(async () => root.unmount());container.remove(); });
async function render(state: Partial<React.ComponentProps<typeof AssistantComposer>> = {}) {
  await act(async () => root.render(<LocaleProvider><AssistantComposer value="مرحبا" attachments={[]} isDark={false} isGenerating={false} isRecording={false} isTranscribing={false} recordSeconds={0} onChange={()=>{}} onOpenAttachments={()=>{}} onRemoveAttachment={()=>{}} onStartRecording={()=>{}} onFinishRecording={onFinish} onCancelRecording={onCancel} onSend={onSend} onStop={onStop} {...state} /></LocaleProvider>));
}
async function enter(init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true, ...init });
  await act(async () => { container.querySelector('textarea')!.dispatchEvent(event); });
  return event;
}
describe('actual SONIM composer DOM events', () => {
  it('sends a ready draft and prevents the browser newline', async () => {
    await render();const event=await enter();expect(onSend).toHaveBeenCalledTimes(1);expect(event.defaultPrevented).toBe(true);expect(onStop).not.toHaveBeenCalled();
  });
  it('does not submit an IME confirmation', async () => {
    await render();const event=await enter({isComposing:true});expect(onSend).not.toHaveBeenCalled();expect(event.defaultPrevented).toBe(false);
  });
  it('preserves Shift+Enter for a multiline draft', async () => {
    await render();const event=await enter({shiftKey:true});expect(onSend).not.toHaveBeenCalled();expect(event.defaultPrevented).toBe(false);
  });
  it('never stops generation by pressing Enter in a draft; the stop button still works', async () => {
    await render({isGenerating:true});await enter();expect(onStop).not.toHaveBeenCalled();expect(onSend).not.toHaveBeenCalled();
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Arrêter la réponse"]')!.click(); });
    expect(onStop).toHaveBeenCalledTimes(1);
  });
  it('connects cancellation and finish to their real parent callbacks', async () => {
    await render({isRecording:true,recordSeconds:73});expect(container.textContent).toContain('1:13');
    await act(async () => {container.querySelector<HTMLButtonElement>('[aria-label="Annuler l’enregistrement"]')!.click();});
    expect(onCancel).toHaveBeenCalledTimes(1);expect(onSend).not.toHaveBeenCalled();
    await act(async () => {container.querySelector<HTMLButtonElement>('[aria-label="Terminer l’enregistrement"]')!.click();});
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
