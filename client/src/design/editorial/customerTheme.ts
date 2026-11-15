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
    // Encres profondes = le NOIR officiel. Elles pointaient sur `action` du temps où l'action était
    // noire ; depuis que l'action est violette, elles repeignaient en violet les badges sombres, le
    // voile des modales, le fond des vidéos et les panneaux du thème sombre.
    '--zayrovi-ink': c.ink, '--zayrovi-ink-deep': c.ink, '--zayrovi-neutral-950': c.ink,
    '--zayrovi-primary': c.ink, '--zayrovi-primary-dark': c.ink, '--zayrovi-primary-light': c.muted,
    '--zayrovi-color-brand-accent': c.accent, '--zayrovi-on-accent': c.onAccent,
    '--zayrovi-accent-on-dark': identity.darkColors.accentText,
    '--zayrovi-accent': c.accent, '--zayrovi-accent-deep': c.accentText,
    '--zayrovi-accent-soft': c.accentSoft, '--zayrovi-on-accent-soft': c.onAccentSoft,
    '--zayrovi-cta': c.action, '--zayrovi-cta-ink': c.onAction,
    '--zayrovi-cta-hover': c.actionHover, '--zayrovi-cta-active': c.ink, '--zayrovi-cta-dark': c.actionHover,
    '--zayrovi-success': c.success, '--zayrovi-danger': c.danger, '--zayrovi-focus-ring': c.focus,
    // Bouton primaire générique = encre noire. Le violet plein est réservé à l'action principale
    // (ajout au panier, caisse, paiement, connexion) via `--zayrovi-cta` / `.s-cta` / `.ay-btn-cta`.
    '--zayrovi-button-bg': c.ink, '--zayrovi-button-color': c.canvas,
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
