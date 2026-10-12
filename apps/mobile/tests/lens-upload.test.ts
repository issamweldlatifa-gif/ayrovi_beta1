import { describe, expect, it } from 'vitest';

import { isLensAllowedMime, lensMimeOf, lensUploadInputFrom } from '@/api/lens';

describe('Lens upload format', () => {
  it('الصيغ المقبولة: JPEG و PNG و WebP فقط', () => {
    expect(isLensAllowedMime('image/jpeg')).toBe(true);
    expect(isLensAllowedMime('image/PNG')).toBe(true);
    expect(isLensAllowedMime('image/webp')).toBe(true);
    expect(isLensAllowedMime('image/heic')).toBe(false);
    expect(isLensAllowedMime('image/heif')).toBe(false);
    expect(isLensAllowedMime('application/pdf')).toBe(false);
  });

  it('المصوّر يعلن النوع؛ وإلا يُستنتج من الامتداد', () => {
    expect(lensMimeOf({ uri: 'file:///a/b.jpg', mimeType: 'image/heic' })).toBe('image/heic');
    expect(lensMimeOf({ uri: 'file:///a/b.png' })).toBe('image/png');
    expect(lensMimeOf({ uri: 'file:///a/b.webp' })).toBe('image/webp');
    expect(lensMimeOf({ uri: 'content://media/123' })).toBe('image/jpeg');
  });

  it('الرفع يحمل النوع المعلن نفسه، ولا يخترع رابطاً ولا صيغة', () => {
    expect(lensUploadInputFrom({ uri: 'file:///x.png', mimeType: 'image/png' })).toEqual({
      uri: 'file:///x.png', mimeType: 'image/png', fileName: undefined,
    });
  });
});
