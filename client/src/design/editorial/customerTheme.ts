import { FONT_STACK } from '../../../../shared/brand.generated';
import type { CSSProperties } from 'react';
import identity from './identity.json';
import type { PublicInterfaceConfig } from '../../config/interfaceConfig';

export const CUSTOMER_FONTS = { ar: FONT_STACK, fr: FONT_STACK };

/** Compatibility adapter, not a second palette. Never mutates CMS config or <html>.
 * CMS owns content, media, section order/visibility, layout and navigation.
 * The approved editorial contract owns customer colors, typography and geometry.
 */
export function customerTheme(locale: 'ar' | 'fr', config?: PublicInterfaceConfig): CSSProperties {
  const c = identity.colors;
  const values: Record<string, string> = {
    '--font-primary': CUSTOMER_FONTS[locale],
    '--zayrovi-font-body': CUSTOMER_FONTS[locale],
    '--zayrovi-font': CUSTOMER_FONTS[locale],
    '--zayrovi-font-display': FONT_STACK,
    '--zayrovi-bg-main': c.canvas, '--zayrovi-white': c.canvas, '--zayrovi-page-bg': c.canvas,
    '--zayrovi-bg-surface': c.surface, '--zayrovi-neutral-50': c.surface,
    '--zayrovi-surface-raised': c.canvas,
    '--zayrovi-border-soft': c.line, '--zayrovi-neutral-200': c.line,
    '--zayrovi-text-primary': c.ink, '--zayrovi-heading-color': c.ink, '--zayrovi-neutral-900': c.ink,
    '--zayrovi-text-secondary': c.muted, '--zayrovi-neutral-500': c.muted, '--zayrovi-text-color': c.ink,
    '--zayrovi-info': c.info, '--zayrovi-info-soft': c.infoSoft,
    '--zayrovi-info-dark': identity.darkColors.info, '--zayrovi-info-soft-dark': identity.darkColors.infoSoft,
    '--zayrovi-ink': c.ink, '--zayrovi-ink-deep': c.action, '--zayrovi-neutral-950': c.action,
    '--zayrovi-primary': c.ink, '--zayrovi-primary-dark': c.action, '--zayrovi-primary-light': c.muted,
    '--zayrovi-color-brand-orange': c.accent, '--zayrovi-orange': c.accent,
    '--zayrovi-accent': c.accent, '--zayrovi-accent-deep': c.accentText, '--zayrovi-accent-soft': c.surface,
    '--zayrovi-cta': c.action, '--zayrovi-cta-ink': c.onAction,
    '--zayrovi-cta-hover': c.actionHover, '--zayrovi-cta-active': c.ink, '--zayrovi-cta-dark': c.actionHover,
    '--zayrovi-success': c.success, '--zayrovi-danger': c.danger, '--zayrovi-focus-ring': c.focus,
    '--zayrovi-button-bg': c.action, '--zayrovi-button-color': c.onAction,
    '--zayrovi-button-secondary-bg': c.canvas, '--zayrovi-button-secondary-color': c.ink,
    '--zayrovi-button-border': c.line, '--zayrovi-button-border-width': '1px',
    '--zayrovi-button-height': `${identity.geometry.controlHeight}px`,
    '--zayrovi-radius-cta': `${identity.geometry.ctaRadius}px`,
    '--zayrovi-radius-control': `${identity.geometry.controlRadius}px`,
    '--zayrovi-radius-card': `${identity.geometry.cardRadius}px`,
    '--zayrovi-radius-sheet': `${identity.geometry.sheetRadius}px`,
    '--zayrovi-radius-icon': `${identity.geometry.ctaRadius}px`,
    '--zayrovi-card-border-width': '1px', '--zayrovi-shadow-card': 'none', '--zayrovi-shadow-xs': 'none',
    '--zayrovi-header-bg': c.canvas, '--zayrovi-header-text': c.ink,
    '--zayrovi-announcement-bg': c.surface, '--zayrovi-announcement-text': c.ink,
    '--zayrovi-hero-bg': c.canvas, '--zayrovi-hero-text': c.ink,
    '--zayrovi-footer-bg': c.canvas, '--zayrovi-footer-text': c.ink,
    '--zayrovi-icon-color': c.ink, '--zayrovi-icon-active-color': c.accentText,
    '--zayrovi-body-line-height': locale === 'ar' ? String(identity.typography.arabicLineHeight) : String(identity.typography.bodyLineHeight),
    '--zayrovi-arabic-line-height': String(identity.typography.arabicLineHeight),
    '--zayrovi-body-weight': String(identity.typography.bodyWeight),
    '--zayrovi-heading-weight': String(identity.typography.headingWeight),
    '--zayrovi-price-weight': String(identity.typography.priceWeight),
    '--zayrovi-heading-line-height': String(identity.typography.headingLineHeight),
    '--zayrovi-arabic-heading-line-height': String(identity.typography.arabicHeadingLineHeight),
    '--zayrovi-letter-spacing': '0em',
    '--zayrovi-text-align': 'start',
    '--zayrovi-section-gap': `${config?.layout.sectionGap ?? 0}px`,
    '--zayrovi-content-max': `${config?.layout.maxWidth ?? identity.geometry.contentMax}px`,
    '--zayrovi-page-padding': `${Math.max(16, config?.layout.pagePadding ?? 16)}px`,
    '--zayrovi-bottom-nav-height': `${config?.navigation.height ?? 72}px`,
  };
  return values as CSSProperties;
}
