import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { selectNetworkObserver } from '../apps/mobile/src/features/aywebs/networkObservers/select';
import { AMAZON_NETWORK_OBSERVER_SCRIPT } from '../apps/mobile/src/features/aywebs/networkObservers/amazon';
import { AYWEBS_NETWORK_OBSERVER_SCRIPT } from '../apps/mobile/src/features/aywebs/networkObserverScript';
import { AYWEBS_STORES } from '../shared/aywebsStores';

describe('single-script observer selection', () => {
  it('matches every registered Amazon domain and selects only the Amazon script', () => {
    const store = AYWEBS_STORES.find((s) => s.id === 'amazon')!;
    expect(store.domains.length).toBeGreaterThan(0);
    for (const domain of store.domains) for (const prefix of ['', 'www.', 'm.']) {
      const selected = selectNetworkObserver(`https://${prefix}${domain}/dp/B0ABCDEFGH`);
      expect(selected.kind).toBe('amazon');
      expect(selected.script).toBe(AMAZON_NETWORK_OBSERVER_SCRIPT);
      expect(selected.script).not.toContain(AYWEBS_NETWORK_OBSERVER_SCRIPT);
      const dom = new JSDOM('', { url: `https://${prefix}${domain}/`, runScripts: 'outside-only' });
      try {
        dom.window.eval(selected.script!);
        expect((dom.window as any).__aywebsAmazonNetObserverInstalled).toBe(true);
      } finally { dom.window.close(); }
    }
  });
  it('never selects Amazon for lookalike domains, credentials or non-web URLs', () => {
    for (const url of ['https://amazon.fr.evil.test', 'https://amazon.fr@evil.test/', 'https://evilamazon.fr', 'https://www.zalando.fr']) {
      expect(selectNetworkObserver(url)).toEqual({ kind: 'legacy', script: AYWEBS_NETWORK_OBSERVER_SCRIPT });
    }
    for (const url of ['', 'about:blank', 'intent://amazon.fr', 'https://']) {
      expect(selectNetworkObserver(url)).toEqual({ kind: 'none', script: undefined });
    }
  });
});


test('the Amazon observer itself refuses unregistered and deceptive hosts', () => {
  for (const host of ['amazon.xyz', 'amazon.fr.evil.test', 'evilamazon.fr', 'www.zalando.fr']) {
    const dom = new JSDOM('', { url: `https://${host}/`, runScripts: 'outside-only' });
    try {
      dom.window.eval(AMAZON_NETWORK_OBSERVER_SCRIPT);
      expect((dom.window as any).__aywebsNetObserverInstalled).toBeUndefined();
    } finally { dom.window.close(); }
  }
});

it('selects independently for each simulated redirect and back-navigation document', () => {
  // This models a native document-aware caller. It does not emulate WebView timing.
  const urls = [
    'https://www.zalando.fr/item',
    'https://www.amazon.fr/dp/B0ABCDEFGH',
    'https://m.amazon.co.uk/dp/B0ABCDEFGH',
    'https://www.zalando.fr/item',
  ];
  for (const [index, url] of urls.entries()) {
    const choice = selectNetworkObserver(url);
    const dom = new JSDOM('', { url, runScripts: 'outside-only' });
    try {
      dom.window.eval(choice.script!);
      expect((dom.window as any).__aywebsNetObserverInstalled).toBe(true);
      expect(Boolean((dom.window as any).__aywebsAmazonNetObserverInstalled)).toBe(index === 1 || index === 2);
      expect(choice.script).toBe(index === 1 || index === 2 ? AMAZON_NETWORK_OBSERVER_SCRIPT : AYWEBS_NETWORK_OBSERVER_SCRIPT);
    } finally { dom.window.close(); }
  }
});
