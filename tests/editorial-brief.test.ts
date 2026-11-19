import { describe, expect, it } from 'vitest';
import { buildEditorialBrief } from '../client/src/admin/editorialBrief';

describe('Manual CMS production handoff', () => {
  it('exports the reel brief without private draft rows, media source links or an editor request', () => {
    const draft = {
      id: 'private-draft-id', content_type: 'reel' as const, title: 'عرض جديد', summary: 'Résumé',
      referenceMedia: [{ url: 'https://example.invalid/secret-link' }], product: { id: 'private-product-id' },
      content: { language: 'ar-TN', reel: { duration_seconds: 20, scenes: [{ text: 'لقطة نضارات', stock_query: 'https://example.invalid/signed-url' }], cta: 'شوف المنتوج' }, publication: { caption: 'wrong section' } },
    };
    const brief = buildEditorialBrief(draft);
    expect(brief).toContain('لقطة نضارات');
    expect(brief).toContain('20 ثانية');
    expect(brief).toContain('حقوق الصور');
    expect(brief).not.toMatch(/private-|https:|signed-url|wrong section/);
  });
  it('handles a partial draft and bounds frame count', () => {
    expect(buildEditorialBrief({ title: 'Draft', content_type: 'story', summary: '', content: null })).toContain('Draft');
    const brief = buildEditorialBrief({ title: 'Draft', content_type: 'story', summary: '', content: { story: { frames: Array.from({ length: 40 }, (_, i) => ({ text: `frame-${i}` })) } } });
    expect(brief).toContain('frame-19');
    expect(brief).not.toContain('frame-20');
  });
});
