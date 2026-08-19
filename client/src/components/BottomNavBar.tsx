import React, { useEffect, useRef, useState } from 'react';
import { Home, LensBox, MessageCircle, ShoppingBag, User } from './QatafoIcons';
import { useNavigationHistory } from '../navigation/NavigationHistory';
import { useLocale } from '../i18n/LocaleContext';
import type { InterfaceIconLibrary, PublicInterfaceConfig } from '../config/interfaceConfig';
import { Bot as LucideBot, Home as LucideHome, ScanSearch as LucideScanSearch, ShoppingBag as LucideBag, User as LucideUser } from 'lucide-react';
import { FaCamera, FaHouse, FaRobot, FaBagShopping, FaUser } from 'react-icons/fa6';
import { BsCamera, BsChatDots, BsHouse, BsBag, BsPerson } from 'react-icons/bs';
import { MdHome, MdSmartToy, MdCenterFocusStrong, MdShoppingBag, MdPerson } from 'react-icons/md';

interface BottomNavBarProps {
  isAiDrawerOpen: boolean;
  isCartOpen?: boolean;
  isAccountOpen?: boolean;
  isLensOpen?: boolean;
  cartCount?: number;
  onGoHome: () => void;
  onToggleAiDrawer: () => void;
  onOpenLens: () => void;
  onOpenCart: () => void;
  onOpenAccount: () => void;
  config: PublicInterfaceConfig['navigation'];
  iconConfig: PublicInterfaceConfig['icons'];
}

const ICON_SETS: Record<InterfaceIconLibrary, [React.ElementType, React.ElementType, React.ElementType, React.ElementType, React.ElementType]> = {
  ayrovi: [Home, LensBox, MessageCircle, ShoppingBag, User],
  lucide: [LucideHome, LucideScanSearch, LucideBot, LucideBag, LucideUser],
  fontawesome: [FaHouse, FaCamera, FaRobot, FaBagShopping, FaUser],
  bootstrap: [BsHouse, BsCamera, BsChatDots, BsBag, BsPerson],
  material: [MdHome, MdCenterFocusStrong, MdSmartToy, MdShoppingBag, MdPerson],
};

const NAV_ITEM = 'relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl text-[10px] font-extrabold text-[#111318] transition duration-200 hover:bg-black/[0.05] active:scale-[0.96]';

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  isAiDrawerOpen,
  isCartOpen = false,
  isAccountOpen = false,
  isLensOpen = false,
  cartCount = 0,
  onGoHome,
  onToggleAiDrawer,
  onOpenLens,
  onOpenCart,
  onOpenAccount,
  config,
  iconConfig,
}) => {
  const navigation = useNavigationHistory();
  const { tr, direction } = useLocale();
  const [HomeIcon, LensIcon, AiIcon, CartIcon, AccountIcon] = ICON_SETS[iconConfig.library];
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const frame = useRef<number | null>(null);
  const overlayOpen = isAiDrawerOpen || isCartOpen || isAccountOpen || isLensOpen || Boolean(navigation.stack[0]?.id);
  const isHome = !navigation.stack[0]?.id;
  const count = Math.max(0, Math.min(99, Math.trunc(cartCount)));
  const iconStyle = (active: boolean): React.CSSProperties => ({
    width: iconConfig.size,
    height: iconConfig.size,
    color: active ? '#111318' : '#111318',
    fill: iconConfig.style === 'solid' && ['ayrovi', 'lucide'].includes(iconConfig.library) ? 'currentColor' : undefined,
  });

  useEffect(() => {
    lastScrollY.current = Math.max(0, window.scrollY);
    const updateVisibility = () => {
      frame.current = null;
      const current = Math.max(0, window.scrollY);
      const delta = current - lastScrollY.current;
      if (current <= 24 || overlayOpen) setIsVisible(true);
      else if (delta > 8) setIsVisible(false);
      else if (delta < -8) setIsVisible(true);
      lastScrollY.current = current;
    };
    const onScroll = () => {
      if (frame.current === null) frame.current = window.requestAnimationFrame(updateVisibility);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [overlayOpen]);

  const items = [
    { id: 'home', label: config.homeLabel || tr('Accueil', 'الرئيسية'), Icon: HomeIcon, active: isHome, onClick: onGoHome, aria: tr('Accueil AYROVI', 'الرئيسية') },
    { id: 'lens', label: config.lensLabel, Icon: LensIcon, active: isLensOpen, onClick: onOpenLens, aria: tr('Lens — recherche par image', 'Lens — البحث بالصورة') },
    { id: 'ai', label: config.aiLabel, Icon: AiIcon, active: isAiDrawerOpen, onClick: onToggleAiDrawer, aria: tr('AI — assistant conversationnel', 'AI — المساعد الذكي') },
    { id: 'cart', label: config.cartLabel || tr('Panier', 'السلة'), Icon: CartIcon, active: isCartOpen, onClick: onOpenCart, aria: tr(`Panier, ${count} article(s)`, `السلة، ${count} منتج`), badge: count },
    { id: 'account', label: config.accountLabel || tr('Compte', 'حسابي'), Icon: AccountIcon, active: isAccountOpen, onClick: onOpenAccount, aria: tr('Mon compte', 'حسابي') },
  ] as const;

  return (
    <div
      className={`ayrovi-glass-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t px-2 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-1 ${isVisible ? 'is-visible' : 'is-hidden'}`}
      aria-hidden={!isVisible}
      inert={isVisible ? undefined : true}
    >
      <nav className="mx-auto grid max-w-lg grid-cols-5 gap-0.5" style={{ minHeight: config.height }} aria-label={tr('Navigation principale', 'التنقل الرئيسي')} dir={direction}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className={NAV_ITEM}
            style={item.active ? { backgroundColor: 'rgba(17,19,24,.08)' } : undefined}
            aria-label={item.aria}
            aria-current={item.active ? 'page' : undefined}
            aria-pressed={item.active}
          >
            <span className="relative">
              <item.Icon className="interface-runtime-icon" style={iconStyle(item.active)} />
              {'badge' in item && item.badge > 0 && (
                <span className="absolute -end-2 -top-1.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[8px] font-black leading-none text-white">
                  {item.badge}
                </span>
              )}
            </span>
            {config.showLabels && <span className="max-w-full truncate px-0.5">{item.label}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
};
