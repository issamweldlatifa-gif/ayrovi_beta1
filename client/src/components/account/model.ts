import { Bell, CreditCard, FileText, Heart, Lock, MapPin, Moon, Package, ReceiptText, ScanSearch, Settings, ShoppingBag, Truck, User } from '../QatafoIcons';
export type AccountSection = 'home' | 'profile' | 'orders' | 'payments' | 'invoices' | 'tracking' | 'addresses' | 'favorites' | 'cart' | 'notifications' | 'appearance' | 'security' | 'settings' | 'lensHelp' | 'terms';
export const accountSections = [
  { id: 'home', label: 'Mon compte', labelAr: 'حسابي', icon: User },
  { id: 'profile', label: 'Mon profil', labelAr: 'ملفي الشخصي', icon: User },
  { id: 'orders', label: 'Mes commandes', labelAr: 'طلباتي', icon: Package },
  { id: 'payments', label: 'Paiements', labelAr: 'المدفوعات', icon: CreditCard },
  { id: 'invoices', label: 'Factures', labelAr: 'الفواتير', icon: ReceiptText },
  { id: 'tracking', label: 'Suivi des colis', labelAr: 'تتبع الشحنات', icon: Truck },
  { id: 'addresses', label: 'Mes adresses', labelAr: 'عناويني', icon: MapPin },
  { id: 'favorites', label: 'Favoris', labelAr: 'المفضلة', icon: Heart },
  { id: 'cart', label: 'Panier', labelAr: 'السلة', icon: ShoppingBag },
  { id: 'notifications', label: 'Notifications', labelAr: 'الإشعارات', icon: Bell },
  { id: 'appearance', label: 'Apparence', labelAr: 'المظهر', icon: Moon },
  { id: 'security', label: 'Connexion & sécurité', labelAr: 'الدخول والأمان', icon: Lock },
  { id: 'settings', label: 'Préférences', labelAr: 'التفضيلات', icon: Settings },
  { id: 'lensHelp', label: 'Aide AYROVIX Lens', labelAr: 'مساعدة AYROVIX Lens', icon: ScanSearch },
  { id: 'terms', label: 'Conditions & confidentialité', labelAr: 'الشروط والخصوصية', icon: FileText },
] satisfies Array<{id:AccountSection;label:string;labelAr:string;icon:React.ComponentType<any>}>;
export const accountMenuGroups: Array<{id:string;label:string;labelAr:string;items:AccountSection[]}> = [
  { id: 'general', label: 'Général', labelAr: 'عام', items: ['orders','addresses','notifications','security','settings'] },
  { id: 'support', label: 'Aide & informations', labelAr: 'المساعدة والمعلومات', items: ['lensHelp','terms'] },
];
