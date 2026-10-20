import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import {
  canIssueAyWebsCaptureQuote,
  isAyWebsCaptureVariantSelectionVerified,
  validateAyWebsCapturedPage,
} from '../src/aywebs/webviewCapture';

const url = 'https://www.amazon.com/dp/B012345678';

describe('fc3cce38 engine with 651cd581 integration', () => {
  it('returns a JSON string compatible with the existing bridge and validates its price', () => {
    const dom = new JSDOM(`<!doctype html><html><head><title>Product</title>
      <script type="application/ld+json">{"@type":"Product","name":"Product","offers":{"@type":"Offer","price":"19.99","priceCurrency":"USD","availability":"https://schema.org/InStock"}}</script>
      </head><body><h1 id="productTitle">Product</h1></body></html>`, { url, runScripts: 'outside-only' });
    try {
      const message = dom.window.eval(AYWEBS_CAPTURE_SCRIPT);
      expect(typeof message).toBe('string');
      const result = validateAyWebsCapturedPage(JSON.parse(String(message)), url);
      expect(result.ok).toBe(true);
      expect(result.price).toBe(19.99);
      expect(result.currency).toBe('USD');
    } finally {
      dom.window.close();
    }
  });

  const quote = {
    captureUsed: true, priceVerified: true, currencyVerified: true,
    selectionVerified: true, availability: 'AVAILABLE' as const,
    unstructuredVariantEvidence: false,
  };

  it('allows a verified quote and rejects unknown availability', () => {
    expect(canIssueAyWebsCaptureQuote(quote)).toBe(true);
    expect(canIssueAyWebsCaptureQuote({ ...quote, availability: 'UNKNOWN' })).toBe(false);
  });

  it('never quotes an unverified currency or unmatched selection', () => {
    expect(canIssueAyWebsCaptureQuote({ ...quote, currencyVerified: false })).toBe(false);
    expect(canIssueAyWebsCaptureQuote({ ...quote, selectionVerified: false })).toBe(false);
    expect(canIssueAyWebsCaptureQuote({ ...quote, unstructuredVariantEvidence: true })).toBe(false);
  });

  it('requires exact selected variant evidence before reusing the captured price', () => {
    const input = {
      variantGroups: [{ attribute: 'size', sourceKey: 'size_name', label: 'Size', values: ['S', 'M'] }],
      requestedAttributes: { size: 'M' }, capturedAttributes: { size: 'M' },
      selectionComplete: true, selectionBacked: true, unstructuredVariantEvidence: false,
    };
    expect(isAyWebsCaptureVariantSelectionVerified(input)).toBe(true);
    expect(isAyWebsCaptureVariantSelectionVerified({ ...input, requestedAttributes: { size: 'S' } })).toBe(false);
  });
});
