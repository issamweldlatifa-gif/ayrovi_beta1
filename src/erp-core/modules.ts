/**
 * AYROVI ERP Core — Module registry (P1).
 *
 * Before this file, "which modules exist" was implicit: 28 hand-written nav
 * entries in client/src/admin/AdminApp.tsx, permission strings scattered across
 * two routers, and no declaration of what the system contains.
 *
 * This registry is the single answer to:
 *   • does the module exist and is it enabled?
 *   • which base permission guards it?
 *   • which admin API prefix and which admin section id serve it?
 *
 * It is deliberately NOT a page generator: P1 registers only what already has
 * an implementation (legacyModules = pages that exist today), plus the ERP core
 * modules. Future modules are declared as `planned` so the UI can show the
 * roadmap without creating empty pages.
 */
export type ErpModuleStatus = 'active' | 'legacy' | 'planned';

export interface ErpModuleDefinition {
  key: string;
  label: string;
  /** Stable grouping used by the back-office navigation. */
  section: 'CORE' | 'OPERATIONS' | 'FINANCE' | 'CONTENT' | 'SYSTEM';
  status: ErpModuleStatus;
  /** Base permission name from the existing system (never invented). */
  basePermission: string;
  /** Route prefix under /api/admin. */
  apiPrefix?: string;
  /** Section id of the existing AdminApp navigation. */
  adminSection?: string;
  description?: string;
}

export const ERP_MODULES: readonly ErpModuleDefinition[] = [
  // ---- ERP Core (built in P1) ----
  { key: 'core', label: 'ERP Core', section: 'CORE', status: 'active', basePermission: 'dashboard:read', apiPrefix: '/core', adminSection: 'core', description: 'Registre des modules, environnements, événements' },
  { key: 'employees', label: 'Employés', section: 'CORE', status: 'active', basePermission: 'users:write', apiPrefix: '/core/employees', adminSection: 'employees', description: 'Identité employée, code EMP-, rattachements' },
  { key: 'organization', label: 'Organisation', section: 'CORE', status: 'active', basePermission: 'users:write', apiPrefix: '/core/organization', adminSection: 'organization', description: 'Organisation, succursales, départements, équipes' },
  { key: 'permissions', label: 'Rôles & permissions', section: 'CORE', status: 'active', basePermission: 'users:write', apiPrefix: '/core/permissions', adminSection: 'permissions', description: 'Moteur module:action:resource:scope, sans remplacer les rôles actuels' },
  { key: 'audit', label: 'Journal d’audit', section: 'CORE', status: 'active', basePermission: 'audit:read', apiPrefix: '/core/audit', adminSection: 'audit-core', description: 'Un seul système d’audit pour tous les modules' },

  // ---- Existing capabilities, now declared as modules ----
  { key: 'crm', label: 'CRM / Arrivals', section: 'OPERATIONS', status: 'active', basePermission: 'commerce:read', apiPrefix: '/arrival-ingestion', adminSection: 'arrival-ingestion', description: 'Arrivages, sources, extraction IA, classification, expéditions' },
  { key: 'sales', label: 'Ventes & commandes', section: 'OPERATIONS', status: 'legacy', basePermission: 'commerce:read', adminSection: 'orders', description: 'OMS existant (orders/order_items/deliveries)' },
  { key: 'customers', label: 'Clients', section: 'OPERATIONS', status: 'legacy', basePermission: 'commerce:read', adminSection: 'customers', description: 'Fiches clients CRM + comptes clients' },
  { key: 'catalog', label: 'Catalogue', section: 'OPERATIONS', status: 'active', basePermission: 'content:read', apiPrefix: '/catalogue', adminSection: 'products', description: 'P2.1 — produit canonique, variantes/SKU, arborescence de catégories, marques, médias, attributs' },
  { key: 'inventory', label: 'Stock', section: 'OPERATIONS', status: 'planned', basePermission: 'commerce:read', description: 'Emplacements, quantités, mouvements — P6' },
  { key: 'purchasing', label: 'Achats', section: 'OPERATIONS', status: 'planned', basePermission: 'commerce:read', description: 'Fournisseurs, demandes d’achat, commandes d’achat — P8' },
  { key: 'shipping', label: 'Expéditions', section: 'OPERATIONS', status: 'legacy', basePermission: 'commerce:read', adminSection: 'orders', description: 'Livraisons client + cartons CRM' },

  { key: 'finance', label: 'Finance', section: 'FINANCE', status: 'legacy', basePermission: 'payments:write', adminSection: 'reports', description: 'Paiements, transactions, justificatifs, factures, dépenses' },
  { key: 'accounting', label: 'Comptabilité', section: 'FINANCE', status: 'planned', basePermission: 'reports:read', description: 'Plan comptable, écritures, périodes — P10' },

  { key: 'cms', label: 'CMS', section: 'CONTENT', status: 'legacy', basePermission: 'content:read', adminSection: 'arrivals', description: 'Contenu, hero, blocks, trust bar, social, magazine — reste dans /admin' },
  { key: 'marketing', label: 'Marketing', section: 'CONTENT', status: 'legacy', basePermission: 'content:read', adminSection: 'promotions', description: 'Promotions et campagnes' },
  { key: 'support', label: 'Support', section: 'CONTENT', status: 'legacy', basePermission: 'commerce:read', adminSection: 'assistant-support', description: 'Tickets de l’assistant' },
  { key: 'reports', label: 'Rapports', section: 'FINANCE', status: 'legacy', basePermission: 'reports:read', adminSection: 'reports', description: 'Rapports financiers, export CSV' },
  { key: 'automation', label: 'Automatisation', section: 'SYSTEM', status: 'planned', basePermission: 'settings:write', description: 'Workflows, règles, jobs — P9' },

  { key: 'settings', label: 'Paramètres', section: 'SYSTEM', status: 'legacy', basePermission: 'settings:write', adminSection: 'settings' },
  { key: 'users', label: 'Comptes administrateur', section: 'SYSTEM', status: 'legacy', basePermission: 'users:write', adminSection: 'users', description: 'admin_users : comptes de connexion (conservés tels quels)' },
] as const;

export const ERP_MODULE_BY_KEY = new Map(ERP_MODULES.map((module) => [module.key, module]));

export function erpModuleDefinition(key: string): ErpModuleDefinition | undefined {
  return ERP_MODULE_BY_KEY.get(key);
}

/** Module that owns a resource type (used by audit + permission resolution). */
const RESOURCE_TO_MODULE: Record<string, string> = {
  order: 'sales',
  order_item: 'sales',
  delivery: 'shipping',
  payment: 'finance',
  payment_transaction: 'finance',
  payment_proof: 'finance',
  invoice: 'finance',
  expense: 'finance',
  customer: 'customers',
  customer_account: 'customers',
  crm_arrival: 'crm',
  crm_arrival_client: 'crm',
  crm_arrival_source: 'crm',
  crm_extraction_job: 'crm',
  crm_extracted_product: 'crm',
  crm_category: 'crm',
  crm_shipment: 'crm',
  crm_shipment_carton: 'crm',
  product: 'catalog',
  brand: 'catalog',
  variant: 'catalog',
  category: 'catalog',
  product_media: 'catalog',
  product_attribute: 'catalog',
  promotion: 'marketing',
  story: 'cms',
  news: 'cms',
  publication: 'cms',
  reel: 'cms',
  setting: 'settings',
  media: 'cms',
  admin_user: 'users',
  employee: 'employees',
  organization: 'organization',
  branch: 'organization',
  department: 'organization',
  team: 'organization',
  role: 'permissions',
  role_permission: 'permissions',
  assistant_support_ticket: 'support',
};

export function moduleForResourceType(resourceType: string | null | undefined): string {
  if (!resourceType) return 'system';
  return RESOURCE_TO_MODULE[resourceType] ?? 'system';
}

/** Payload exposed to the back office; the frontend renders groups from this. */
export function moduleRegistryPayload() {
  const sections = ['CORE', 'OPERATIONS', 'FINANCE', 'CONTENT', 'SYSTEM'] as const;
  return sections.map((section) => ({
    section,
    modules: ERP_MODULES.filter((module) => module.section === section).map((module) => ({
      key: module.key, label: module.label, status: module.status,
      basePermission: module.basePermission, adminSection: module.adminSection ?? null,
      description: module.description ?? '',
    })),
  }));
}
