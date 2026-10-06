import { describe, expect, it } from 'vitest';
import { AYWEBS_STORES } from '../shared/aywebsStores';
import { AYWEBS_ADAPTER_DESCRIPTORS } from '../src/aywebs/adapters/registry';
import { AYWEBS_ADAPTER_CONTRACT_VERSION } from '../src/aywebs/adapters/contract';

describe('AYWEBs store capabilities stay honest about merchant purchase', () => {
  it('keeps product-reading support separate from automated merchant purchase', () => {
    expect(AYWEBS_ADAPTER_CONTRACT_VERSION).toBe(2);
    for (const store of AYWEBS_STORES) {
      const descriptor = AYWEBS_ADAPTER_DESCRIPTORS.find((candidate) => candidate.id === store.adapter);
      expect(descriptor, store.id).toBeDefined();
      expect(store.capabilities, store.id).not.toContain('purchase');
      expect(store.capabilities, store.id).not.toContain('tracking');
      expect(descriptor?.reads, store.id).toContain('availability');
      expect(store.integrationType, store.id).toBe('PARTIALLY_SUPPORTED');
      expect(descriptor?.purchaseMode, store.id).toBe('MANUAL_REVIEW');
    }
  });
});
