import React from 'react';
import { Menu, User } from './QatafoIcons';
import { useLocale } from '../i18n/LocaleContext';
import { AppHeader } from '../design/AppHeader';
import { Button } from '../design/Button';

interface NavbarProps {
  onOpenMenuDrawer: () => void;
  onOpenAccount: () => void;
  isAuthenticated?: boolean;
  logoUrl?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenMenuDrawer, onOpenAccount, isAuthenticated = false, logoUrl }) => {
  const { isArabic, toggleLocale, tr } = useLocale();

  return (
    <AppHeader
      sticky
      title="AYROVI"
      subtitle={tr('Shopping international, simplement', 'تسوّق عالمي بكل سهولة')}
      logoUrl={logoUrl}
      actions={<>
        <Button variant="ghost" size="icon" onClick={onOpenMenuDrawer} aria-label={tr('Ouvrir le menu', 'فتح القائمة')} title={tr('Menu', 'القائمة')}>
          <Menu className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleLocale} aria-label={tr('Afficher le site en arabe', 'عرض الموقع بالفرنسية')} title={isArabic ? 'Français' : 'العربية'} className="min-w-11 px-2">
          {isArabic ? 'FR' : 'AR'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenAccount}
          className="relative"
          aria-label={isAuthenticated ? tr('Mon compte AYROVI', 'حسابي في AYROVI') : tr('Se connecter', 'تسجيل الدخول')}
          title={isAuthenticated ? tr('Mon compte AYROVI', 'حسابي في AYROVI') : tr('Se connecter', 'تسجيل الدخول')}
        >
          <User className="h-5 w-5" />
          {isAuthenticated && <span className="absolute bottom-2 end-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand" />}
        </Button>
      </>}
    />
  );
};
