import React, { useEffect, useState } from 'react';
import { X, User } from './QatafoIcons';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useLocale } from '../i18n/LocaleContext';
import { useNavigationHistory } from '../navigation/NavigationHistory';
import type { CustomerSession } from '../types';
import { Button, buttonClasses } from '../design/Button';
import { getCommerceConfig } from '../services/publicApi';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  session: CustomerSession | null;
  onOpenAccount: (section?: 'home' | 'orders' | 'favorites' | 'cart' | 'addresses') => void;
  onOpenAssistant: () => void;
  onOpenLens: () => void;
}

interface MenuItemProps {
  label: string;
  onClick: () => void;
  badge?: string;
}

const MenuItem: React.FC<MenuItemProps> = ({ label, onClick, badge }) => (
  <button type="button" onClick={onClick} className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2.5 text-start text-sm font-bold text-ink transition hover:bg-brand/5 hover:text-brand-dark">
    <span className="min-w-0 flex-1">{label}</span>
    {badge && <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-black text-ink">{badge}</span>}
  </button>
);

const MenuGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="border-t border-line px-4 py-4 first:border-t-0">
    <h2 className="mb-1.5 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-muted">{title}</h2>
    <div className="space-y-0.5">{children}</div>
  </section>
);

export const MenuDrawer: React.FC<MenuDrawerProps> = ({ isOpen, onClose, session, onOpenAccount, onOpenAssistant, onOpenLens }) => {
  const { tr, direction, locale, setLocale } = useLocale();
  const navigation = useNavigationHistory();
  const [supportUrl, setSupportUrl] = useState('');
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    getCommerceConfig().then((payload) => {
      if (active) setSupportUrl(String(payload.data?.channels?.whatsapp || ''));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const openCms = (page: 'arrivals' | 'promotions' | 'stories' | 'news' | 'products') => navigation.navigate([{ id: `cms:${page}` }]);
  const openAbout = () => {
    navigation.navigate([]);
    window.setTimeout(() => document.getElementById('about-ayrovi')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  const firstName = session?.account.displayName?.trim().split(/\s+/)[0] || tr('Client', 'حريف');

  return (
    <div className="fixed inset-0 z-[85] overflow-hidden" dir={direction} role="dialog" aria-modal="true" aria-label={tr('Menu AYROVI', 'قائمة AYROVI')}>
      <button type="button" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-ink/55 backdrop-blur-sm" aria-label={tr('Fermer le menu', 'إغلاق القائمة')} />

      <div className={`fixed inset-y-0 flex max-w-full ${direction === 'rtl' ? 'right-0' : 'left-0'}`}>
        <div className={`flex w-screen max-w-sm flex-col bg-white shadow-overlay ${direction === 'rtl' ? 'border-l' : 'border-r'} border-line`}>
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex min-w-0 items-center gap-3">
              {session?.account.avatarUrl
                ? <img src={session.account.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
                : <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-sm font-black text-white">{session ? firstName.slice(0, 2).toUpperCase() : <User className="h-6 w-6" />}</span>}
              <div className="min-w-0">
                <strong className="block truncate text-sm font-black text-ink">{session ? tr(`Bonjour, ${firstName}`, `مرحبًا، ${firstName}`) : 'AYROVI'}</strong>
                <button type="button" onClick={() => onOpenAccount('home')} className="mt-0.5 text-xs font-bold text-brand underline-offset-4 hover:underline">{session ? tr('Mon compte', 'حسابي') : tr('Se connecter / Créer un compte', 'تسجيل الدخول / إنشاء حساب')}</button>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={tr('Fermer', 'إغلاق')}><X className="h-6 w-6" /></Button>
          </header>

          <div className="flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
            <MenuGroup title={tr('Découvrir', 'استكشف')}>
              <MenuItem label={tr('Arrivages', 'المنتجات القادمة')} onClick={() => openCms('arrivals')} />
              <MenuItem label={tr('Promotions', 'العروض')} onClick={() => openCms('promotions')} />
              <MenuItem label={tr('Social', 'التواصل')} onClick={() => openCms('stories')} />
              <MenuItem label={tr('Magazine', 'مجلتي')} onClick={() => openCms('news')} />
            </MenuGroup>

            <MenuGroup title={tr('Suite IA', 'مجموعة الذكاء الاصطناعي')}>
              <MenuItem label="AYROVI AI" onClick={onOpenAssistant} />
              <MenuItem label="AYROVIX Lens" onClick={onOpenLens} />
              <MenuItem label="AYVISI Vision" badge={tr('Bientôt', 'قريبًا')} onClick={() => navigation.navigate([{ id: 'app:vision' }])} />
            </MenuGroup>

            <MenuGroup title={tr('Catalogue', 'الكتالوج')}>
              <MenuItem label={tr('Tous les produits', 'كل المنتجات')} onClick={() => openCms('products')} />
            </MenuGroup>

            <MenuGroup title={tr('Mon compte', 'حسابي')}>
              <MenuItem label={tr('Mes commandes', 'طلباتي')} onClick={() => onOpenAccount('orders')} />
              <MenuItem label={tr('Mes favoris', 'المفضلة')} onClick={() => onOpenAccount('favorites')} />
              <MenuItem label={tr('Mon panier', 'سلّتي')} onClick={() => onOpenAccount('cart')} />
              <MenuItem label={tr('Mes adresses', 'عناويني')} onClick={() => onOpenAccount('addresses')} />
            </MenuGroup>

            <MenuGroup title={tr('Aide et informations', 'المساعدة والمعلومات')}>
              {supportUrl
                ? <a href={supportUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 rounded-control px-3 py-2.5 text-sm font-bold text-ink transition hover:bg-brand/5">{tr('Contacter le support', 'التواصل مع الدعم')}</a>
                : <MenuItem label={tr('Contacter le support via AYROVI AI', 'التواصل مع الدعم عبر AYROVI AI')} onClick={onOpenAssistant} />}
              <MenuItem label={tr('À propos d’AYROVI', 'حول AYROVI')} onClick={openAbout} />
              <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 rounded-control px-3 py-2.5 text-sm font-bold text-ink transition hover:bg-brand/5">{tr('Conditions de vente et retours', 'شروط البيع والإرجاع')}</a>
              <div className="mt-2 flex items-center gap-2 rounded-card border border-line p-2">
                <button type="button" onClick={() => setLocale('fr')} className={buttonClasses(locale === 'fr' ? 'primary' : 'ghost', 'sm', 'flex-1')}>FR</button>
                <button type="button" onClick={() => setLocale('ar')} className={buttonClasses(locale === 'ar' ? 'primary' : 'ghost', 'sm', 'flex-1')}>AR</button>
              </div>
            </MenuGroup>
          </div>
        </div>
      </div>
    </div>
  );
};
