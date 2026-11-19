import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { emptyBlock, PublicationBlockPreview } from '../client/src/admin/PublicationBlocksTab';
import { editorialHeroHeight, EDITORIAL_FEED as E, EDITORIAL_CAMPAIGN as C, publicationTemplateMetrics } from '../shared/publicationEditorial';

const product = { id: 'product', name: 'Chaussures test', image: '/p.jpg', status: 'ACTIVE', final_price: 42, currency: 'TND' };
const m = publicationTemplateMetrics(360);
const scale = 320 / 360;
const render = (kind: Parameters<typeof emptyBlock>[0], wide = false) => new JSDOM(renderToStaticMarkup(
  <PublicationBlockPreview form={{ ...emptyBlock(kind), title: 'Collection été', subtitle: 'Collection été', media_url: '/m.jpg', image_format: wide ? 'wide' : 'cover' }} products={[product]} />,
)).window.document;

describe('CRM and mobile share the same compact layouts', () => {
  it('editorial: compact photo-only row, publisher before cover, title after row; format changes the cover only', () => {
    const cover = render('media'), wide = render('media', true);
    const row = cover.querySelector<HTMLElement>('[data-testid="preview-row"]')!;
    expect(row.style.gap).toBe(`${E.gap * scale}px`);
    expect(row.firstElementChild?.getAttribute('style')).toContain(`width:${m.media.tileWidth * scale}px`);
    expect(row.textContent).not.toContain('Chaussures test');
    expect(cover.querySelector('[data-testid="preview-heart"]')).not.toBeNull();
    expect(cover.body.textContent?.match(/Collection été/g)).toHaveLength(1);
    for (const [doc, format] of [[cover, 'cover'], [wide, 'wide']] as const) {
      const img = doc.querySelector<HTMLImageElement>('img[src="/m.jpg"]')!;
      expect(img.parentElement!.style.height).toBe(`${editorialHeroHeight(336, 'image', format) * scale}px`);
      expect(doc.querySelector('strong')!.compareDocumentPosition(img) & 4).toBeTruthy();
      expect(doc.querySelector('[data-testid="preview-row"]')!.compareDocumentPosition(img) & 2).toBeTruthy();
    }
  });

  it.each(['container', 'sponsored_pair', 'cinema'] as const)('%s retains the price and narrower campaign tiles', kind => {
    const doc = render(kind);
    const row = doc.querySelector<HTMLElement>('[data-testid="preview-row"]')!;
    expect(row.style.gap).toBe(`${C.gap * scale}px`);
    expect(row.firstElementChild?.getAttribute('style')).toContain(`width:${152 * scale}px`);
    expect(row.textContent).toContain('TND');
  });
});
