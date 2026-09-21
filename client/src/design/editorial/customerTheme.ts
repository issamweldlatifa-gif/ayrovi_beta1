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
    '--ayrovi-font-body': CUSTOMER_FONTS[locale],
    '--ayrovi-font': CUSTOMER_FONTS[locale],
    '--ayrovi-font-display': FONT_STACK,
    '--ayrovi-bg-main': c.canvas, '--ayrovi-white': c.canvas, '--ayrovi-page-bg': c.canvas,
    '--ayrovi-bg-surface': c.surface, '--ayrovi-neutral-50': c.surface,
    '--ayrovi-surface-raised': c.canvas,
    '--ayrovi-border-soft': c.line, '--ayrovi-neutral-200': c.line,
    '--ayrovi-text-primary': c.ink, '--ayrovi-heading-color': c.ink, '--ayrovi-neutral-900': c.ink,
    '--ayrovi-text-secondary': c.muted, '--ayrovi-neutral-500': c.muted, '--ayrovi-text-color': c.ink,
    '--ayrovi-ink': c.ink, '--ayrovi-ink-deep': c.action, '--ayrovi-neutral-950': c.action,
    '--ayrovi-primary': c.ink, '--ayrovi-primary-dark': c.action, '--ayrovi-primary-light': c.muted,
    '--ayrovi-color-brand-orange': c.accent, '--ayrovi-orange': c.accent,
    '--ayrovi-accent': c.accent, '--ayrovi-accent-deep': c.accentText, '--ayrovi-accent-soft': c.surface,
    '--ayrovi-cta': c.action, '--ayrovi-cta-ink': c.onAction,
    '--ayrovi-cta-hover': c.actionHover, '--ayrovi-cta-active': c.ink, '--ayrovi-cta-dark': c.actionHover,
    '--ayrovi-success': c.success, '--ayrovi-danger': c.danger, '--ayrovi-focus-ring': c.focus,
    '--ayrovi-button-bg': c.action, '--ayrovi-button-color': c.onAction,
    '--ayrovi-button-secondary-bg': c.canvas, '--ayrovi-button-secondary-color': c.ink,
    '--ayrovi-button-border': c.line, '--ayrovi-button-border-width': '1px',
    '--ayrovi-button-height': `${identity.geometry.controlHeight}px`,
    '--ayrovi-radius-control': '0px', '--ayrovi-radius-card': '0px', '--ayrovi-radius-sheet': '0px', '--ayrovi-radius-icon': '0px',
    '--ayrovi-card-border-width': '1px', '--ayrovi-shadow-card': 'none', '--ayrovi-shadow-xs': 'none',
    '--ayrovi-header-bg': c.canvas, '--ayrovi-header-text': c.ink,
    '--ayrovi-announcement-bg': c.surface, '--ayrovi-announcement-text': c.ink,
    '--ayrovi-hero-bg': c.canvas, '--ayrovi-hero-text': c.ink,
    '--ayrovi-footer-bg': c.canvas, '--ayrovi-footer-text': c.ink,
    '--ayrovi-icon-color': c.ink, '--ayrovi-icon-active-color': c.accentText,
    '--ayrovi-body-line-height': locale === 'ar' ? '1.8' : '1.5', '--ayrovi-letter-spacing': '0em',
    '--ayrovi-text-align': 'start',
    '--ayrovi-section-gap': `${config?.layout.sectionGap ?? 0}px`,
    '--ayrovi-content-max': `${config?.layout.maxWidth ?? identity.geometry.contentMax}px`,
    '--ayrovi-page-padding': `${Math.max(16, config?.layout.pagePadding ?? 16)}px`,
    '--ayrovi-bottom-nav-height': `${config?.navigation.height ?? 72}px`,
  };
  return values as CSSProperties;
}
