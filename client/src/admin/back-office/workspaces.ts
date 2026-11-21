import type { BackOfficeNavigation, BackOfficeNavItem } from './framework';
import type { OfficeIconName } from '../../design/admin/OfficeIcon';

export type OfficeWorkspaceKey = Extract<OfficeIconName, 'overview' | 'crm' | 'erp' | 'finance' | 'cms' | 'admin' | 'other'>;

export type OfficeLanguage = 'fr' | 'ar';
export const officeText = (lang: OfficeLanguage, fr: string, ar: string) => lang === 'ar' ? ar : fr;

// Presentation only: membership never creates a route/grant. The server payload is
// still the only source of visible destinations, and unclassified screens stay reachable.
const workspaces: Array<{ key: OfficeWorkspaceKey; fr: string; ar: string; sections: string[] }> = [
  { key: 'overview', fr: 'Vue générale', ar: 'نظرة عامة', sections: ['dashboard'] },
  { key: 'crm', fr: 'Clients & relations', ar: 'العملاء والعلاقات', sections: [
    'crm-dashboard', 'customers', 'crm-parties', 'crm-contacts', 'crm-activities', 'crm-tasks', 'crm-issues',
    'assistant-support', 'lens-requests', 'arrival-ingestion',
  ] },
  { key: 'erp', fr: 'Ventes & ressources', ar: 'المبيعات والموارد', sections: [
    'orders', 'aywebs-purchases', 'catalogue-products', 'catalogue-categories', 'catalogue-brands', 'inventory',
    'inventory-movements', 'inventory-stocktakes', 'purchasing', 'purchasing-orders', 'purchasing-receipts',
    'pricing', 'promos', 'erp-employees', 'erp-organization',
  ] },
  { key: 'finance', fr: 'Finance & contrôle', ar: 'المالية والرقابة', sections: ['reports'] },
  { key: 'cms', fr: 'Contenus & apparence', ar: 'المحتوى والمظهر', sections: [
    'zayrovi-news', 'zayrovi-highlights', 'news', 'magazine-agent', 'social', 'stories', 'hero', 'home-featured', 'home-sections', 'public-nav',
    'lens-section', 'arrivals', 'promotions', 'interface', 'design', 'products', 'brands',
  ] },
  { key: 'admin', fr: 'Administration', ar: 'الإدارة والصلاحيات', sections: [
    'users', 'erp-permissions', 'erp-audit', 'audit', 'erp-events', 'erp-environment', 'settings', 'assistant',
    'discovery-sources', 'discovery-markets', 'lens-lab', 'ai-discovery',
  ] },
];

export function buildOfficeWorkspaces(groups: BackOfficeNavigation['groups']) {
  const remaining = new Map(groups.flatMap(group => group.items).filter(item => item.permitted).map(item => [item.section, item]));
  const organized = workspaces.map(({ sections, ...workspace }) => ({ ...workspace, items: sections.flatMap(section => {
    const item = remaining.get(section);
    remaining.delete(section);
    return item ? [item] : [];
  }) }));
  if (remaining.size) organized.push({ key: 'other', fr: 'Autres outils', ar: 'أدوات أخرى', items: [...remaining.values()] });
  return organized.filter(group => group.items.length > 0);
}

const arabic: Record<string, string> = {
  dashboard: 'لوحة القيادة', 'crm-dashboard': 'ملخّص العلاقات', customers: 'الحرفاء', 'crm-parties': 'ملفات الحرفاء والشركاء',
  'crm-contacts': 'جهات الاتصال', 'crm-activities': 'الأنشطة', 'crm-tasks': 'المهام والمتابعة', 'crm-issues': 'الشكاوى',
  'assistant-support': 'الدعم', 'lens-requests': 'طلبات Lens', 'arrival-ingestion': 'متابعة الشحنات',
  orders: 'الطلبات والفواتير', reports: 'التقارير والمعاملات', 'aywebs-purchases': 'مشتريات AYWEBs', 'catalogue-products': 'المنتجات',
  'catalogue-categories': 'الأصناف', 'catalogue-brands': 'العلامات التجارية', inventory: 'المخزون',
  'inventory-movements': 'حركة المخزون', 'inventory-stocktakes': 'الجرد', purchasing: 'المزوّدون',
  'purchasing-orders': 'أوامر الشراء', 'purchasing-receipts': 'الاستلام', pricing: 'الأسعار والصرف', promos: 'العروض',
  'erp-employees': 'الموظّفون', 'erp-organization': 'المؤسسة', news: 'مجلتي', 'magazine-agent': 'وكيل مجلتي',
  social: 'المنشورات وReels', stories: 'القصص الرسمية', hero: 'الواجهة الرئيسية', 'home-featured': 'غلاف الواجهة',
  'home-sections': 'أقسام الواجهة السابقة', 'public-nav': 'روابط الواجهة السابقة', 'lens-section': 'قسم Lens',
  arrivals: 'الشحنات المنشورة', promotions: 'العروض المنشورة', interface: 'واجهتي', design: 'التصميم',
  products: 'المنتجات (الشاشة السابقة)', brands: 'العلامات (الشاشة السابقة)', users: 'حسابات المستخدمين',
  'erp-permissions': 'الأدوار والصلاحيات', 'erp-audit': 'التدقيق الإداري', audit: 'سجل التدقيق', 'erp-events': 'الأحداث',
  'erp-environment': 'مركز الوحدات', settings: 'الإعدادات', assistant: 'المساعد الذكي', 'discovery-sources': 'مصادر الاكتشاف',
  'discovery-markets': 'الأسواق', 'lens-lab': 'مختبر Lens', 'ai-discovery': 'الاكتشاف الذكي',
};

const french: Record<string, string> = {
  'erp-environment': 'Centre des modules', orders: 'Commandes & factures', reports: 'Rapports & transactions', 'home-sections': 'Sections de l’accueil historique', 'public-nav': 'Navigation de l’interface historique',
};

export function officeItemLabel(item: Pick<BackOfficeNavItem, 'section' | 'label'>, lang: OfficeLanguage) {
  return (lang === 'ar' ? arabic[item.section] : french[item.section]) ?? item.label;
}
