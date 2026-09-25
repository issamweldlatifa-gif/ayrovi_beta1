// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { AssistantMessages } from '../client/src/components/assistant/AssistantMessages';
import { AssistantHistoryNotice } from '../client/src/components/assistant/AssistantHistoryNotice';
import type { AssistantMessage } from '../client/src/components/assistant/types';
const noop = () => {};
const render = (messages: AssistantMessage[]) => renderToStaticMarkup(<LocaleProvider><AssistantMessages messages={messages} isGenerating={false} motionState="idle" isDark={false} copiedId={null} feedback={{}} selectedProduct={null} productBusyId="" isOrdering={false} onPrompt={noop} onCopy={noop} onRegenerate={noop} onFeedback={noop} onOpenComment={noop} onOpenLens={noop} onSelectProduct={noop} onProductOrder={async () => {}} onOpenCart={noop} onProductBack={noop}/></LocaleProvider>);
beforeEach(() => localStorage.clear());
describe('historical content remains visible and accurately labelled', () => {
  it('renders Lens-only warnings and action-only responses without needing prose', () => {
    const html = render([{ id: 'lens', role: 'assistant', text: '', lensSummary: { confidence: .8, verified: false, warnings: ['WARNING_LAST'] } }, { id: 'action', role: 'assistant', text: '', suggestedActions: [{ label: 'ACTION_LAST', prompt: 'Prompt complet' }] }]);
    expect(html).toContain('WARNING_LAST'); expect(html).toContain('ACTION_LAST');
    expect(html).toContain('80%'); expect(html).not.toContain('Lecture vérifiée');
  });
  it('marks an interrupted even-empty answer, while leaving legacy completion unknown', () => {
    expect(render([{ id: 'partial', role: 'assistant', text: '', incomplete: true }])).toContain('Réponse interrompue avant sa fin');
    expect(render([{ id: 'legacy', role: 'assistant', text: 'Text' }])).not.toContain('data-incomplete-response');
    expect(render([{ id: 'complete', role: 'assistant', text: 'Text', incomplete: false }])).not.toContain('data-incomplete-response');
  });
  it.each(['fr', 'ar'])('exposes storage failure, retry and snapshot limits in %s', locale => {
    localStorage.setItem('ayrovi.locale.v1', locale);
    const html = renderToStaticMarkup(<LocaleProvider><AssistantHistoryNotice status="quota" restored onRetry={noop}/></LocaleProvider>);
    expect(html).toContain('role="status"');
    expect(html).toContain(locale === 'ar' ? 'إعادة محاولة الحفظ' : 'Réessayer l’enregistrement');
    expect(html).toContain(locale === 'ar' ? 'ليسا تحققًا جديدًا' : 'pas une nouvelle vérification');
    expect(html).toContain(locale === 'ar' ? 'ليس صورها' : 'pas leurs images');
  });
});
