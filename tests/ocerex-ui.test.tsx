// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { OcerexError } from '../client/src/features/ocerex/screens/OcerexError';
import { OcerexOnboarding } from '../client/src/features/ocerex/screens/OcerexOnboarding';
import { markOcerexOnboardingComplete, ocerexOnboardingComplete } from '../client/src/features/ocerex/utils/preferences';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  window.localStorage.clear();
  window.localStorage.setItem('ayrovi.locale.v1', 'ar');
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('OCEREX first-use screen', () => {
  it('shows the short Arabic onboarding once, then keeps it dismissed', async () => {
    await act(async () => root.render(<LocaleProvider><OcerexOnboarding onStart={() => markOcerexOnboardingComplete(window.localStorage, null)} /></LocaleProvider>));
    expect(host.textContent).toContain('حوّل السعر من صورة إلى طلب مع Ayrovi.');
    expect(host.textContent).toContain('كيف تستعمل Ocerex؟');
    expect(host.textContent).toContain('ابدأ مع Ocerex');
    const button = host.querySelector('button');
    await act(async () => button?.click());
    expect(ocerexOnboardingComplete(window.localStorage, null)).toBe(true);
  });

  it('renders the specified error states', async () => {
    await act(async () => root.render(<LocaleProvider><OcerexError code="NO_PRICE_FOUND" onRetry={() => undefined} /></LocaleProvider>));
    expect(host.textContent).toContain('لم نتمكن من العثور على سعر واضح.');
    expect(host.textContent).toContain('رفع صورة أخرى');
    await act(async () => root.render(<LocaleProvider><OcerexError code="LOW_CONFIDENCE" onRetry={() => undefined} onContinueLink={() => undefined} /></LocaleProvider>));
    expect(host.textContent).toContain('تعذر تحديد السعر المرجعي بدقة.');
    expect(host.textContent).toContain('متابعة بالرابط');
  });
});
