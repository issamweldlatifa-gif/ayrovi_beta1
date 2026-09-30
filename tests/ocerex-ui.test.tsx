// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OcerexScreen } from '../client/src/ocerex/OcerexScreen';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const props = { onClose: vi.fn(), onOpenLens: vi.fn(), onOrder: vi.fn(async () => {}), onOpenCart: vi.fn() };

beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  localStorage.clear(); vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('OCEREX onboarding and upload entry', () => {
  it('shows the concise first-use onboarding and persists completion', async () => {
    await act(async () => root.render(<LocaleProvider><OcerexScreen {...props} /></LocaleProvider>));
    expect(host.textContent).toContain('حوّل السعر من صورة إلى طلب مع Ayrovi.');
    expect(host.textContent).toContain('01 — صوّر');
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('ابدأ مع'))?.click());
    expect(localStorage.getItem('ayrovi:ocerex:onboarded')).toBe('1');
    expect(host.textContent).toContain('ارفع صورة السعر');
    expect(host.querySelector('[aria-label="رفع صورة"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="التقاط صورة"]')).not.toBeNull();
  });

  it('skips onboarding after the preference is stored', async () => {
    localStorage.setItem('ayrovi:ocerex:onboarded', '1');
    await act(async () => root.render(<LocaleProvider><OcerexScreen {...props} /></LocaleProvider>));
    expect(host.textContent).not.toContain('كيف تستعمل Ocerex؟');
    expect(host.textContent).toContain('ارفع صورة السعر');
  });
});
