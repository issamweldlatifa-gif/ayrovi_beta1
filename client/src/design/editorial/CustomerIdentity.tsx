import React from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { IconFamily } from './IconFamily';
import { customerTheme } from './customerTheme';

export function CustomerIdentity({ children }: { children: React.ReactNode }) {
  const { locale, direction } = useLocale();
  return <IconFamily family="editorial" direction={direction}>
    <div data-ay-design="editorial" className="ay-customer-root" lang={locale} dir={direction} style={customerTheme(locale)}>
      {children}
    </div>
  </IconFamily>;
}
