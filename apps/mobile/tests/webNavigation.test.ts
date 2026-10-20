import { describe, expect, it } from 'vitest';

import { decideWebNavigation, isWebPageUrl } from '@/features/aywebs/webNavigation';

describe('AYWEBs WebView navigation', () => {
  it('يبقي صفحات الويب داخل التطبيق', () => {
    expect(decideWebNavigation('https://www.amazon.com/dp/B000')).toBe('allow');
    expect(decideWebNavigation('http://shop.example.jp/item/1')).toBe('allow');
    expect(decideWebNavigation('about:blank')).toBe('allow');
  });

  it('يمنع المخططات التي تفتح تطبيقات خارجية بلا فتح', () => {
    expect(decideWebNavigation('intent://item/123#Intent;scheme=https;package=com.amazon.mShop;end')).toBe('block');
    expect(decideWebNavigation('market://details?id=com.facebook.katana')).toBe('block');
    expect(decideWebNavigation('fb://profile/1')).toBe('block');
    expect(decideWebNavigation('whatsapp://send?text=hi')).toBe('block');
    expect(decideWebNavigation('tel:+21650000000')).toBe('block');
    expect(decideWebNavigation('javascript:alert(1)')).toBe('block');
    expect(decideWebNavigation('')).toBe('block');
  });

  it('صيغة الرابط الأولي: مضيف مطلوب، بلا مسافات', () => {
    expect(isWebPageUrl('https://ayrovi.tn/x')).toBe(true);
    expect(isWebPageUrl('https://')).toBe(false);
    expect(isWebPageUrl('https://exa mple.com')).toBe(false);
    expect(isWebPageUrl('ftp://host/file')).toBe(false);
    expect(isWebPageUrl('not a url')).toBe(false);
  });
});
