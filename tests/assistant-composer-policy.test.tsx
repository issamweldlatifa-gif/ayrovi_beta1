import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cleanAssistantText, recordingTime, shouldSubmitComposer } from '../client/src/components/assistant/composerPolicy';
import { AssistantComposer } from '../client/src/components/assistant/AssistantComposer';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';

const ready = { canSend: true, isGenerating: false, isRecording: false, isTranscribing: false };
describe('SONIM composer interaction policy', () => {
  it('submits a ready draft with Enter', () => expect(shouldSubmitComposer({ key: 'Enter' }, ready)).toBe(true));
  it.each(['shiftKey', 'ctrlKey', 'altKey', 'metaKey', 'isComposing'])('does not submit when %s is active', flag => {
    expect(shouldSubmitComposer({ key: 'Enter', [flag]: true }, ready)).toBe(false);
  });
  it('honors legacy IME keyCode 229', () => expect(shouldSubmitComposer({ key: 'Enter', keyCode: 229 }, ready)).toBe(false));
  it.each(['isGenerating', 'isRecording', 'isTranscribing'])('never submits a draft during %s', flag => {
    expect(shouldSubmitComposer({ key: 'Enter' }, { ...ready, [flag]: true })).toBe(false);
  });
  it('does not submit an empty composer or arbitrary keystrokes', () => {
    expect(shouldSubmitComposer({ key: 'Enter' }, { ...ready, canSend: false })).toBe(false);
    expect(shouldSubmitComposer({ key: 'a' }, ready)).toBe(false);
  });
  it('preserves multilingual paragraphs, code indentation and semantic symbols', () => {
    const text = 'فقرة أولى ✅\n\nDeuxième paragraphe.\n\n```\n  x = 2\n```\n1. Étape\n2. خطوة';
    expect(cleanAssistantText(text)).toBe(text);
    expect(cleanAssistantText('  [[OPEN_LENS]]\n' + text + '\n[[OPEN_LENS]]  ')).toBe(text);
  });
  it.each([[0,'0:00'],[9,'0:09'],[61,'1:01'],[-1,'0:00'],[NaN,'0:00'],[Infinity,'0:00'],[8.8,'0:08']])('formats recording time %s', (input, output) => {
    expect(recordingTime(Number(input))).toBe(output);
  });
  it('exposes cancellation and elapsed time during recording, and disables sending', () => {
    const noop = () => {};
    const html = renderToStaticMarkup(<LocaleProvider><AssistantComposer value="draft" attachments={[]} isDark={false} isGenerating={false} isRecording isTranscribing={false} recordSeconds={65} onChange={noop} onOpenAttachments={noop} onRemoveAttachment={noop} onStartRecording={noop} onFinishRecording={noop} onCancelRecording={noop} onSend={noop} onStop={noop} /></LocaleProvider>);
    expect(html).toContain('Annuler l’enregistrement');
    expect(html).toContain('1:05');
    expect(html).not.toContain('<textarea');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Envoyer"/);
  });
});
