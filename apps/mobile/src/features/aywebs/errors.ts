import { isApiError, userMessage } from '@/api/errors';
import type { Locale, Translate, TranslationKey } from '@/i18n';

const AYWEBS_ERROR_KEYS: Record<string, TranslationKey> = {
  AYWEBS_DISABLED: 'aywebs.error.disabled',
  CAPTURE_DISABLED: 'aywebs.error.disabled',
  CAPTURE_DISABLED_FOR_STORE: 'aywebs.error.disabled',
  DOMAIN_NOT_ALLOWED: 'aywebs.error.unsupportedStore',
  STORE_UNKNOWN: 'aywebs.error.unsupportedStore',
  PRODUCT_PAGE_REQUIRED: 'aywebs.error.captureIncomplete',
  CAPTURE_INCOMPLETE: 'aywebs.error.captureIncomplete',
  PRICE_AMBIGUOUS: 'aywebs.error.captureIncomplete',
  PRICE_UNAVAILABLE: 'aywebs.error.captureIncomplete',
  PRODUCT_UNAVAILABLE: 'aywebs.error.unavailable',
};

export function ayWebsErrorMessage(error: unknown, locale: Locale, t: Translate): string {
  if (isApiError(error)) {
    const key = AYWEBS_ERROR_KEYS[error.code];
    if (key) return t(key);
    return userMessage(error)[locale];
  }
  return t('aywebs.error.generic');
}

export function ayWebsLinkMessage(linked: boolean, reason: string, t: Translate): string {
  if (linked) return t('aywebs.add.linked');
  const messages: Record<string, TranslationKey> = {
    BRIDGE_FAILED: 'aywebs.add.linkFailed',
    PRICE_UNAVAILABLE: 'aywebs.add.linkPriceUnavailable',
    PRICE_CHANGED: 'aywebs.add.linkPriceChanged',
    VARIANT_UNAVAILABLE: 'aywebs.add.linkVariantUnavailable',
    OUT_OF_STOCK: 'aywebs.add.linkOutOfStock',
    CUSTOMER_ACTION_REQUIRED: 'aywebs.add.linkActionRequired',
  };
  return t(messages[reason] ?? 'aywebs.add.notLinked');
}

export function ayWebsReadinessMessage(
  reason: string | null,
  t: Translate,
): string {
  if (!reason) return '';
  const messages: Record<string, TranslationKey> = {
    SESSION_REQUIRED: 'aywebs.add.blocked.session',
    VARIANT_REQUIRED: 'aywebs.add.blocked.variant',
    VARIANT_UNPUBLISHED: 'aywebs.add.blocked.unpublished',
    OUT_OF_STOCK: 'aywebs.add.blocked.outOfStock',
    AVAILABILITY_UNKNOWN: 'aywebs.add.blocked.availability',
    PRICE_UNVERIFIED: 'aywebs.add.blocked.unverified',
    PRICE_UNAVAILABLE: 'aywebs.add.blocked.price',
    QUOTE_MISSING: 'aywebs.add.blocked.quote',
  };
  const key = messages[reason];
  return key ? t(key) : '';
}
