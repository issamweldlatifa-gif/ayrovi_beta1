/**
 * AYROVI Back Office (P2.0) — Resource Framework registry.
 *
 * Le problème réglé ici : la description d'une ressource vivait à DEUX endroits — le moteur
 * générique du back office (`resources` dans src/admin/routes.ts : table, champs, permissions,
 * tri, recherche, suppression logique) et un miroir écrit à la main côté client
 * (`resources: Record<string, ResourceDefinition>` dans AdminApp.tsx, 91 lignes). Deux sources
 * = dérive garantie. Le serveur devient la source unique : les descripteurs du moteur sont
 * DÉRIVÉS du `resources` existant (import direct, aucune recopie), et les écrans qui n'utilisent
 * pas le moteur déclarent une surface « custom » pointant vers leur écran actuel — sans le réécrire.
 *
 * Règles appliquées, et vérifiées par tests/back-office-foundation.test.ts :
 *  • aucune nouvelle table, aucune migration : P2.0 ne touche pas au schéma ;
 *  • aucun chemin d'API inventé : `api.prefix` est le préfixe déjà servi (`/products`,
 *    `/catalogue/products`, `/core/employees`, `/arrival-ingestion`…) ;
 *  • aucun second système d'autorisation : `navPermission` est exactement la permission legacy
 *    qui gouverne l'entrée de navigation aujourd'hui (parité stricte, y compris les aberrations
 *    connues comme `settings` en `content:read` — corrigées par une donnée, pas par du code),
 *    et `permissions` sont des clés `module:action` résolues par `can()` (src/erp-core/permissions.ts) ;
 *  • aucun deep-link perdu : `section` + `aliases` couvrent les 39 identifiants `?section=`
 *    réellement atteignables aujourd'hui (37 dans la nav + `hero` et `stories` hors nav) ;
 *  • `arrival-ingestion` est déclaré, jamais redistribué.
 */
/**
 * Forme du descripteur du moteur générique (src/admin/routes.ts). Elle est redéclarée ici —
 * et vérifiée par `registerFrameworkResources` — pour que la dépendance aille dans UN seul
 * sens : `src/admin/routes.ts` enregistre ses ressources auprès du framework, jamais l'inverse.
 * Un cycle d'imports entre la coquille et le moteur legacy serait une dette d'architecture.
 */
export interface FrameworkResourceConfig {
  table: string;
  module: string;
  prefix: string;
  permission: string;
  readPermission?: string;
  fields: string[];
  required: string[];
  searchable: string[];
  sortable: string[];
  defaultSort: string;
  jsonFields?: string[];
  enums?: Record<string, string[]>;
  softDelete: Record<string, unknown>;
}

let frameworkConfigs: Record<string, FrameworkResourceConfig> | null = null;

/** Enregistrement par le moteur legacy, au chargement du router admin. Idempotent. */
export function registerFrameworkResources(configs: Record<string, FrameworkResourceConfig>): void {
  frameworkConfigs = configs;
  cache = null;
  BY_KEY.clear();
  BY_SECTION.clear();
}

export function frameworkResourceConfigs(): Record<string, FrameworkResourceConfig> {
  if (!frameworkConfigs) throw new Error('back-office: aucune ressource du moteur enregistrée — `registerFrameworkResources` doit être appelé au montage du router admin.');
  return frameworkConfigs;
}

export type BackOfficeDomain = 'ERP' | 'COMMERCE' | 'CRM' | 'CONTENT';
export type ResourceActionKey = 'list' | 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'assign';
export type ResourceSurface = 'framework' | 'custom';

export interface BackOfficeFieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'image' | 'boolean' | 'list';
  required?: boolean;
  options?: string[];
  hint?: string;
  /** Champ présenté mais jamais écrit par cette ressource (ex. `final_price` calculé). */
  readonly?: boolean;
}

export interface BackOfficeColumnDef {
  key: string;
  label: string;
  render?: 'entity' | 'status' | 'money' | 'datetime' | 'code' | 'text';
  sortable?: boolean;
  hiddenByDefault?: boolean;
}

export interface BackOfficeResourceDescriptor {
  /** Clé stable `domaine.entité` — jamais un nom de table. */
  key: string;
  label: string;
  singular: string;
  description: string;
  domain: BackOfficeDomain;
  /** Clé du registre ERP (`ERP_MODULES`) : le rattachement de navigation, pas une chaîne inventée. */
  module: string;
  /**
   * Clé de module utilisée par le moteur d'autorisation quand elle diffère du rattachement de
   * navigation (ex. la base de connaissances de l'assistant : écran rattaché à `settings`,
   * droits nommés `ai:read` / `ai:write`). Le registre ERP compte 21 modules figés par les tests
   * de P1 — y ajouter une entrée est une décision de registre, pas un détail de code.
   */
  permissionModule?: string;
  /** Permission legacy qui gouverne l'entrée de navigation aujourd'hui (parité exacte). */
  navPermission: string;
  /** Clés ERP `module:action` vérifiées sur les opérations de la ressource. */
  permissions: Partial<Record<ResourceActionKey, string>>;
  /** Identifiant `?section=` principal — inchangé par rapport à l'existant. */
  section: string;
  /** Autres identifiants de section qui atteignent le même écran (deep links historiques). */
  aliases?: string[];
  /** Où la coquille place cette entrée ; null = ressource non navigable (sous-objet). */
  nav: { group: string; order: number; icon: string } | null;
  /** 'framework' : rendu par le moteur ; 'custom' : le composant React existant est conservé. */
  surface: ResourceSurface;
  /** Nom du composant client à monter quand `surface = 'custom'` (aucun composant n'est créé ici). */
  component?: string;
  api: { prefix: string; kind: 'generic' | 'module' | 'none' };
  columns: BackOfficeColumnDef[];
  fields: BackOfficeFieldDef[];
  actions: ResourceActionKey[];
  statusField?: string;
  statuses?: string[];
  /** Clé de vocabulaire partagé (src/domain/statuses.ts) — une seule source pour les libellés. */
  statusVocabulary?: string;
  audit: { module: string; resourceType: string };
  /** Ressource legacy dont le maître canonique est ailleurs (produits, marques). */
  canonicalOf?: string;
  /** Une ressource sans entrée de navigation doit dire où elle se voit (auto-test du framework). */
  navlessReason?: string;
  notes?: string;
}

/* ---------------------------------------------------------------------------------- */
/* Dérivation depuis le moteur générique — aucune colonne recopiée                    */
/* ---------------------------------------------------------------------------------- */

const FIELD_LABELS: Record<string, string> = {
  name: 'Nom', title: 'Titre', question: 'Question', text: 'Message', answer: 'Réponse',
  description: 'Description', summary: 'Résumé', content: 'Contenu', category: 'Catégorie',
  status: 'Statut', active: 'Actif', priority: 'Priorité', display_order: 'Ordre d’affichage',
  image: 'Image', logo: 'Logo', media_url: 'Média', main_image: 'Image principale', video: 'Vidéo',
  secondary_images: 'Images secondaires', additional_images: 'Images supplémentaires',
  type: 'Type', media_type: 'Type de média', url: 'URL', source_url: 'URL source',
  source_platform: 'Plateforme', brand_id: 'Marque', brand_name: 'Marque (texte)', product_id: 'Produit',
  arrival_id: 'Arrivage', promotion_id: 'Promotion', cta: 'Appel à l’action', target_url: 'Cible',
  badge: 'Badge', published_at: 'Publication', publish_at: 'Publication', expires_at: 'Expiration',
  ends_at: 'Fin', starts_at: 'Début', expected_arrival_at: 'Arrivée prévue', departure_at: 'Départ',
  created_at: 'Créé le', updated_at: 'Modifié le', author: 'Auteur', keywords: 'Mots-clés',
  original_price: 'Prix d’origine', final_price: 'Prix final', currency: 'Devise',
  discount_type: 'Type de remise', value: 'Valeur', promo_code: 'Code promo', usage_limit: 'Limite d’utilisation',
  usage_count: 'Utilisations', stock_status: 'État du stock', express_available: 'Disponible en express',
};

const LONG_TEXT = new Set(['description', 'content', 'summary', 'answer']);
const MONEY = new Set(['original_price', 'final_price', 'value', 'amount_tnd', 'converted_price', 'customs_fee', 'shipping_fee', 'service_fee']);
const IMAGE = new Set(['image', 'logo', 'media_url', 'main_image', 'video']);
const NUMERIC = new Set(['priority', 'display_order', 'usage_limit', 'usage_count', 'quantity']);

function labelFor(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function fieldKind(field: string, config: FrameworkResourceConfig): BackOfficeFieldDef['type'] {
  if (config.enums?.[field]?.length) return 'select';
  if (config.jsonFields?.includes(field) || field === 'keywords') return 'list';
  if (/(^|_)at$/.test(field)) return 'date';
  if (IMAGE.has(field)) return 'image';
  if (field === 'active' || field === 'express_available') return 'boolean';
  if (/_price$/.test(field) || MONEY.has(field) || NUMERIC.has(field)) return 'number';
  if (LONG_TEXT.has(field)) return 'textarea';
  return 'text';
}

function columnFor(field: string, config: FrameworkResourceConfig): BackOfficeColumnDef {
  const render: BackOfficeColumnDef['render'] =
    field === config.fields[0] ? 'entity'
      : field === 'status' || field === 'active' ? 'status'
        : MONEY.has(field) || /_price$/.test(field) ? 'money'
          : /_at$/.test(field) ? 'datetime' : 'text';
  // Une colonne de liste ou de texte long n'est pas une colonne de table.
  if (config.jsonFields?.includes(field) || field === 'content' || field === 'description' || field === 'answer') {
    return { key: field, label: labelFor(field), render: 'text', sortable: false, hiddenByDefault: true };
  }
  return { key: field, label: labelFor(field), render, sortable: config.sortable.includes(field) };
}

/** Par ressource du moteur : à quel module elle appartient, et où la navigation la montre. */
const LEGACY_RESOURCE_META: Record<string, {
  key: string; module: string; permissionModule?: string; domain: BackOfficeDomain; label?: string; singular?: string;
  description?: string; section: string; aliases?: string[]; resourceType?: string;
  nav: BackOfficeResourceDescriptor['nav']; permissions?: Partial<Record<ResourceActionKey, string>>;
  actions?: ResourceActionKey[]; canonicalOf?: string; navlessReason?: string; notes?: string;
}> = {
  arrivals: {
    key: 'cms.arrivals', module: 'cms', domain: 'CONTENT', label: 'Arrivages', singular: 'arrivage',
    description: 'Calendrier marketing des arrivages, affiché sur le site — à ne pas confondre avec les arrivages CRM.',
    section: 'arrivals', resourceType: 'arrival',
    nav: { group: 'Contenu', order: 10, icon: 'Calendar' },
  },
  products: {
    key: 'cms.products', module: 'cms', domain: 'CONTENT', label: 'Produits (ancienne surface)', singular: 'produit',
    description: 'Ancien écran générique sur `products`. Le maître canonique est le module Catalogue (P2.1).',
    section: 'products', resourceType: 'product', canonicalOf: 'catalog.product',
    notes: 'Conservé : la surface publique et 41 cas de tests en dépendent. Consolidation = migration d’écran, pas de donnée.',
    nav: { group: 'Contenu', order: 20, icon: 'ShoppingBag' },
  },
  promotions: {
    key: 'marketing.promotions', module: 'marketing', domain: 'CONTENT', label: 'Promotions', singular: 'promotion',
    description: 'Campagnes et codes promo. Le moteur de consommation du code reste à écrire (P2.9).',
    section: 'promotions', resourceType: 'promotion',
    nav: { group: 'Contenu', order: 30, icon: 'Gift' },
  },
  stories: {
    key: 'cms.stories', module: 'cms', domain: 'CONTENT', label: 'Stories (données)', singular: 'story',
    description: 'Lignes `stories` servies par le moteur générique ; l’écran de planification est « Social ».',
    section: 'stories', nav: null,
    navlessReason: 'Surface de données du moteur générique ; l’écran de planification des stories est « Social » (content.social). Deep link `?section=stories` conservé.',
  },
  news: {
    key: 'cms.news', module: 'cms', domain: 'CONTENT', label: 'مجلتي', singular: 'article',
    description: 'Articles du magazine ; l’écran reste l’éditeur existant (brouillons IA inclus).',
    section: 'news', nav: { group: 'Contenu', order: 50, icon: 'FileText' },
  },
  brands: {
    key: 'cms.brands', module: 'cms', domain: 'CONTENT', label: 'Marques (ancienne surface)', singular: 'marque',
    description: 'Ancien écran générique sur `brands` ; le canonique est Catalogue › Marques.',
    section: 'brands', resourceType: 'brand', canonicalOf: 'catalog.brand',
    nav: { group: 'Contenu', order: 60, icon: 'Tag' },
  },
  'hero-slides': {
    key: 'cms.hero-slides', module: 'cms', domain: 'CONTENT', label: 'Hero slides', singular: 'slide',
    description: 'Diaporama du hero (table `hero_slides`).',
    section: 'hero', aliases: ['hero-slides'], resourceType: 'hero_visual', nav: null,
    navlessReason: 'Table `hero_slides` éditée par le moteur générique ; l’écran visible est « Hero Management » (content.hero-visuals). Deep links `hero` et `hero-slides` conservés.',
  },
  announcements: {
    key: 'cms.announcements', module: 'cms', domain: 'CONTENT', label: 'Ticker annonces', singular: 'annonce',
    description: 'Bandeau d’annonces du haut de page.',
    section: 'ticker', resourceType: 'announcement', nav: { group: 'Contenu', order: 110, icon: 'Bell' },
  },
  'ai-knowledge': {
    key: 'ai.knowledge', module: 'settings', permissionModule: 'ai', domain: 'ERP', label: 'Assistant IA', singular: 'entrée de connaissance',
    description: 'Base de connaissances servie à l’assistant (FAQ, réponses prédéfinies).',
    section: 'assistant', resourceType: 'ai_knowledge', nav: { group: 'Système', order: 420, icon: 'MessageSquare' },
    // P1 closure gate : la ressource est sortie de `settings:write` ; les droits sont nommés.
    permissions: { list: 'ai:read', view: 'ai:read', create: 'ai:write', edit: 'ai:write', delete: 'ai:write' },
  },
};

function descriptorFromLegacyConfig(name: string, config: FrameworkResourceConfig): BackOfficeResourceDescriptor {
  const meta = LEGACY_RESOURCE_META[name];
  if (!meta) throw new Error(`back-office: ressource du moteur sans correspondance de module: ${name}`);
  const statusField = config.fields.includes('status') ? 'status' : config.fields.includes('active') ? 'active' : undefined;
  const descriptor: BackOfficeResourceDescriptor = {
    key: meta.key,
    label: meta.label ?? labelFor(name),
    singular: meta.singular ?? labelFor(name),
    description: meta.description ?? `${config.table} — surface du moteur de ressources.`,
    domain: meta.domain,
    module: meta.module,
    ...(meta.permissionModule ? { permissionModule: meta.permissionModule } : {}),
    navPermission: String(config.readPermission ?? 'content:read'),
    permissions: meta.permissions ?? {
      list: 'cms:read', view: 'cms:read', create: 'cms:write', edit: 'cms:write', delete: 'cms:write',
    },
    section: meta.section,
    nav: meta.nav,
    surface: 'framework',
    ...(meta.navlessReason ? { navlessReason: meta.navlessReason } : {}),
    api: { prefix: `/${name}`, kind: 'generic' },
    columns: config.fields.map((field) => columnFor(field, config)),
    fields: config.fields.map((field) => ({
      key: field,
      label: labelFor(field),
      type: fieldKind(field, config),
      required: config.required.includes(field),
      ...(config.enums?.[field] ? { options: config.enums[field] } : {}),
    })),
    actions: meta.actions ?? ['list', 'view', 'create', 'edit', 'delete'],
    audit: { module: config.module, resourceType: meta.resourceType ?? name },
    ...(meta.aliases ? { aliases: meta.aliases } : {}),
    ...(meta.canonicalOf ? { canonicalOf: meta.canonicalOf, notes: meta.notes } : meta.notes ? { notes: meta.notes } : {}),
    ...(statusField ? { statusField, ...(config.enums?.[statusField] ? { statuses: config.enums[statusField] } : {}) } : {}),
  };
  return descriptor;
}

/* ---------------------------------------------------------------------------------- */
/* Surfaces existantes hors moteur générique — écrans conservés tels quels             */
/* ---------------------------------------------------------------------------------- */

const CUSTOM_RESOURCES: BackOfficeResourceDescriptor[] = [
  {
    key: 'core.dashboard', label: 'Tableau de bord', singular: 'tableau de bord', module: 'core', domain: 'ERP',
    description: 'Vue d’ensemble : commandes, revenus, arrivages, tâches en attente.',
    navPermission: 'dashboard:read', permissions: { view: 'core:read' },
    section: 'dashboard', nav: { group: 'Vue générale', order: 1, icon: 'Home' },
    surface: 'custom', component: 'DashboardPage', api: { prefix: '/dashboard', kind: 'generic' },
    columns: [], fields: [], actions: ['view'], audit: { module: 'DASHBOARD', resourceType: 'dashboard' },
  },
  {
    key: 'catalog.product', label: 'Produits', singular: 'produit', module: 'catalog', domain: 'COMMERCE',
    description: 'Fiche produit canonique (P2.1) : désignation, slug, marques, catégories, variantes/SKU, médias, attributs.',
    navPermission: 'content:read',
    permissions: { list: 'catalog:read', view: 'catalog:read', create: 'catalog:create', edit: 'catalog:update', delete: 'catalog:delete', approve: 'catalog:approve' },
    section: 'catalogue-products', nav: { group: 'Catalogue', order: 120, icon: 'ShoppingBag' },
    surface: 'custom', component: 'CatalogueProductsPage', api: { prefix: '/catalogue/products', kind: 'module' },
    columns: [
      { key: 'name', label: 'Nom', render: 'entity' }, { key: 'code', label: 'Code', render: 'code' },
      { key: 'slug', label: 'Slug', render: 'code', hiddenByDefault: true, sortable: true },
      { key: 'brand_id', label: 'Marque' }, { key: 'status', label: 'Statut', render: 'status' },
      { key: 'updated_at', label: 'Modifié le', render: 'datetime', sortable: true },
    ],
    fields: [
      { key: 'name', label: 'Nom', type: 'text', required: true },
      { key: 'slug', label: 'Slug', type: 'text', hint: 'Vide = généré depuis le nom ; jamais écrasé silencieusement' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'final_price', label: 'Prix final', type: 'number', readonly: true, hint: 'Calculé par Prix & taux' },
    ],
    actions: ['list', 'view', 'create', 'edit', 'delete', 'approve'],
    statusField: 'status', statuses: ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'], statusVocabulary: 'catalogue.product',
    audit: { module: 'CATALOGUE_PRODUCTS', resourceType: 'product' },
    notes: 'Écran P2.1 inchangé ; le descripteur permet à la coquille de connaître les actions sans dupliquer les droits.',
  },
  {
    key: 'catalog.category', label: 'Catégories', singular: 'catégorie', module: 'catalog', domain: 'COMMERCE',
    description: 'Arborescence des catégories (anti-cycle vérifié dans le service).',
    navPermission: 'content:read',
    permissions: { list: 'catalog:read', view: 'catalog:read', create: 'catalog:create', edit: 'catalog:update', delete: 'catalog:delete' },
    section: 'catalogue-categories', nav: { group: 'Catalogue', order: 130, icon: 'LayoutGrid' },
    surface: 'custom', component: 'CatalogueCategoriesPage', api: { prefix: '/catalogue/categories', kind: 'module' },
    columns: [{ key: 'name', label: 'Nom', render: 'entity' }, { key: 'slug', label: 'Slug', render: 'code' }, { key: 'status', label: 'Statut', render: 'status' }],
    fields: [{ key: 'name', label: 'Nom', type: 'text', required: true }, { key: 'parent_id', label: 'Parent', type: 'select' }],
    actions: ['list', 'view', 'create', 'edit', 'delete'], statusVocabulary: 'catalogue.status',
    audit: { module: 'CATALOGUE_CATEGORIES', resourceType: 'category' },
  },
  {
    key: 'catalog.brand', label: 'Marques', singular: 'marque', module: 'catalog', domain: 'COMMERCE',
    description: 'Marques canoniques : nom et slug uniques, univers, ordre d’affichage.',
    navPermission: 'content:read',
    permissions: { list: 'catalog:read', view: 'catalog:read', create: 'catalog:create', edit: 'catalog:update', delete: 'catalog:delete' },
    section: 'catalogue-brands', nav: { group: 'Catalogue', order: 140, icon: 'Tag' },
    surface: 'custom', component: 'CatalogueBrandsPage', api: { prefix: '/catalogue/brands', kind: 'module' },
    columns: [{ key: 'name', label: 'Nom', render: 'entity' }, { key: 'slug', label: 'Slug', render: 'code' }, { key: 'category', label: 'Univers' }, { key: 'status', label: 'Statut', render: 'status' }],
    fields: [{ key: 'name', label: 'Nom', type: 'text', required: true }, { key: 'category', label: 'Univers', type: 'select' }],
    actions: ['list', 'view', 'create', 'edit', 'delete'], statusVocabulary: 'catalogue.status',
    audit: { module: 'CATALOGUE_BRANDS', resourceType: 'brand' },
  },
  {
    key: 'catalog.pricing', label: 'Prix & taux', singular: 'réglage de prix', module: 'catalog', domain: 'COMMERCE',
    description: 'Taux de conversion, douane par catégorie, frais — source de vérité des recalculs produits.',
    navPermission: 'commerce:read', permissions: { view: 'catalog:read', edit: 'catalog:write' },
    section: 'pricing', nav: { group: 'Commerce', order: 250, icon: 'Calculator' },
    surface: 'custom', component: 'PricingPage', api: { prefix: '/pricing', kind: 'generic' },
    columns: [], fields: [], actions: ['view', 'edit'], audit: { module: 'PRICING', resourceType: 'pricing_config' },
  },
  {
    key: 'crm.arrival', label: 'Arrivals CRM', singular: 'arrivage', module: 'crm', domain: 'CRM',
    description: 'Ingestion d’arrivages : documents, extraction IA, revue, classification, cartons, expédition vers Warehouse Core.',
    navPermission: 'commerce:read',
    // Aucune clé ERP déclarée volontairement : le CRM est gated `commerce:*` en legacy et ne
    // possède pas encore de grants `crm:*`. Prétendre le contraire griserait des boutons valides.
    permissions: {},
    section: 'arrival-ingestion', nav: { group: 'Commerce', order: 210, icon: 'Package' },
    surface: 'custom', component: 'ArrivalIngestionPage', api: { prefix: '/arrival-ingestion', kind: 'module' },
    columns: [], fields: [], actions: ['list', 'view', 'create', 'edit', 'assign'],
    audit: { module: 'ARRIVAL_INGESTION', resourceType: 'crm_arrival' },
    notes: 'Intouchable en P2.0 : logique, tables, 45 routes et codes d’erreur restent tels quels. Seule la coquille entoure l’écran.',
  },
  {
    key: 'sales.order', label: 'Commandes', singular: 'commande', module: 'sales', domain: 'COMMERCE',
    description: 'OMS : statuts, acomptes, livraison, factures liées. Machine à états encore déclarée dans le handler (→ P2.3).',
    navPermission: 'commerce:read',
    permissions: { list: 'sales:read', view: 'sales:read', edit: 'sales:write', approve: 'sales:write', export: 'reports:read' },
    section: 'orders', nav: { group: 'Commerce', order: 220, icon: 'Package' },
    surface: 'custom', component: 'OrdersPage', api: { prefix: '/orders', kind: 'generic' },
    columns: [
      { key: 'order_number', label: 'Référence', render: 'code', sortable: true },
      { key: 'status', label: 'Statut', render: 'status' }, { key: 'payment_status', label: 'Paiement', render: 'status' },
      { key: 'deposit_status', label: 'Acompte', render: 'status' }, { key: 'governorate', label: 'Gouvernorat' },
      { key: 'total_tnd', label: 'Total', render: 'money' }, { key: 'created_at', label: 'Créée le', render: 'datetime', sortable: true },
    ],
    fields: [{ key: 'status', label: 'Statut', type: 'select', required: true }, { key: 'tracking_no', label: 'Numéro de suivi', type: 'text' }],
    actions: ['list', 'view', 'edit', 'approve', 'export'], statusField: 'status', statusVocabulary: 'sales.order',
    audit: { module: 'ORDERS', resourceType: 'order' },
  },
  {
    key: 'sales.lens-requests', label: 'Demandes Lens', singular: 'demande', module: 'sales', domain: 'COMMERCE',
    description: 'Revue des analyses Lens et des devis clients.',
    navPermission: 'commerce:read', permissions: { list: 'sales:read', view: 'sales:read', edit: 'sales:write', approve: 'sales:write' },
    section: 'lens-requests', nav: { group: 'Commerce', order: 230, icon: 'Sparkles' },
    surface: 'custom', component: 'LensRequestsPage', api: { prefix: '/ayrovix-reviews', kind: 'generic' },
    columns: [], fields: [], actions: ['list', 'view', 'edit', 'approve'], statusVocabulary: 'ayrovix.review',
    audit: { module: 'AYROVIX', resourceType: 'ayrovix_review' },
  },
  {
    key: 'crm.party', label: 'Clients', singular: 'client', module: 'customers', domain: 'CRM',
    description: 'Fiches clients (`customers`) et comptes e-commerce (`customer_accounts`) — fusion dans `parties` prévue plus tard.',
    navPermission: 'commerce:read', permissions: {} /* la page Clients garde sa décision legacy (orders:write) */,
    section: 'customers', nav: { group: 'Commerce', order: 240, icon: 'User' },
    surface: 'custom', component: 'CustomersPage', api: { prefix: '/customers', kind: 'generic' },
    columns: [
      { key: 'name', label: 'Nom', render: 'entity' }, { key: 'phone', label: 'Téléphone', render: 'code' },
      { key: 'governorate', label: 'Gouvernorat' }, { key: 'status', label: 'Statut', render: 'status' },
    ],
    fields: [{ key: 'status', label: 'Statut', type: 'select' }], actions: ['list', 'view', 'edit', 'assign'],
    audit: { module: 'CUSTOMERS', resourceType: 'customer' },
    notes: 'Deux identités coexistent (DUP-01 de la Discovery) : P2.0 ne les fusionne pas, il les expose dans une seule navigation.',
  },
  {
    key: 'support.ticket', label: 'Support IA', singular: 'ticket', module: 'support', domain: 'CRM',
    description: 'Tickets escaladés depuis l’assistant : statut, priorité, affectation, note interne.',
    navPermission: 'commerce:read', permissions: {} /* le support est encore gated orders:write (aucun grant support:* semé) */,
    section: 'assistant-support', nav: { group: 'Commerce', order: 225, icon: 'MessageSquare' },
    surface: 'custom', component: 'AssistantSupportPage', api: { prefix: '/assistant-support', kind: 'generic' },
    columns: [{ key: 'subject', label: 'Sujet', render: 'entity' }, { key: 'status', label: 'Statut', render: 'status' }, { key: 'priority', label: 'Priorité', render: 'status' }],
    fields: [
      { key: 'status', label: 'Statut', type: 'select', options: ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] },
      { key: 'priority', label: 'Priorité', type: 'select', options: ['NORMAL', 'HIGH'] },
      { key: 'admin_note', label: 'Note interne', type: 'textarea' },
    ],
    actions: ['list', 'view', 'edit', 'assign'], statusField: 'status', statuses: ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
    audit: { module: 'ASSISTANT_SUPPORT', resourceType: 'assistant_support_ticket' },
  },
  {
    key: 'core.employee', label: 'Employés', singular: 'employé', module: 'employees', domain: 'ERP',
    description: 'Identité employée (`EMP-…`) liée 1:1 au compte de connexion, statut et rattachements.',
    navPermission: 'users:write', permissions: { list: 'employees:read', view: 'employees:read', edit: 'employees:write', assign: 'employees:write' },
    section: 'erp-employees', nav: { group: 'ERP', order: 310, icon: 'User' },
    surface: 'custom', component: 'ErpEmployeesPage', api: { prefix: '/core/employees', kind: 'module' },
    columns: [{ key: 'employee_code', label: 'Code', render: 'code' }, { key: 'first_name', label: 'Prénom' }, { key: 'last_name', label: 'Nom' }, { key: 'job_title', label: 'Fonction' }, { key: 'status', label: 'Statut', render: 'status' }],
    fields: [{ key: 'job_title', label: 'Fonction', type: 'text' }, { key: 'status', label: 'Statut', type: 'select', options: ['ACTIVE', 'INACTIVE', 'ON_LEAVE'] }],
    actions: ['list', 'view', 'edit', 'assign'], statusField: 'status',
    audit: { module: 'EMPLOYEES', resourceType: 'employee' },
  },
  {
    key: 'core.organization', label: 'Organisation', singular: 'unité', module: 'organization', domain: 'ERP',
    description: 'Organisation, succursales, départements, équipes — base des portées de permission.',
    navPermission: 'users:write', permissions: { list: 'organization:read', view: 'organization:read', create: 'organization:write' },
    section: 'erp-organization', nav: { group: 'ERP', order: 320, icon: 'Grid' },
    surface: 'custom', component: 'ErpOrganizationPage', api: { prefix: '/core/organization', kind: 'module' },
    columns: [], fields: [], actions: ['list', 'view', 'create'], audit: { module: 'ORGANIZATION', resourceType: 'organization' },
  },
  {
    key: 'core.role-permission', label: 'Rôles & permissions', singular: 'grant', module: 'permissions', domain: 'ERP',
    description: 'Matrice `module:action:resource:scope` éditée en données (`erp_role_permissions`).',
    navPermission: 'users:write', permissions: { list: 'permissions:read', edit: 'permissions:manage', assign: 'permissions:manage' },
    section: 'erp-permissions', nav: { group: 'ERP', order: 330, icon: 'ShieldCheck' },
    surface: 'custom', component: 'ErpPermissionsPage', api: { prefix: '/core/permissions', kind: 'module' },
    columns: [
      { key: 'module', label: 'Module' }, { key: 'action', label: 'Action', render: 'code' },
      { key: 'resourceType', label: 'Ressource', render: 'code' }, { key: 'scope', label: 'Portée', render: 'code' },
      { key: 'granted', label: 'Accordé', render: 'status' },
    ],
    fields: [], actions: ['list', 'view', 'edit', 'assign'], audit: { module: 'PERMISSIONS', resourceType: 'role_permission' },
  },
  {
    key: 'core.audit', label: 'Audit (ERP)', singular: 'événement', module: 'audit', domain: 'ERP',
    description: 'Le journal unifié : un rédacteur, diff champ à champ, lectures sensibles et refus inclus.',
    navPermission: 'audit:read', permissions: { list: 'audit:read', view: 'audit:read', export: 'audit:read' },
    section: 'erp-audit', nav: { group: 'ERP', order: 340, icon: 'History' },
    surface: 'custom', component: 'ErpAuditPage', api: { prefix: '/core/audit', kind: 'module' },
    columns: [
      { key: 'created_at', label: 'Date', render: 'datetime' }, { key: 'actor_name', label: 'Acteur' },
      { key: 'action', label: 'Action', render: 'code' }, { key: 'module', label: 'Module' },
      { key: 'entity_id', label: 'Enregistrement', render: 'code' },
    ],
    fields: [], actions: ['list', 'view', 'export'], audit: { module: 'AUDIT', resourceType: 'audit_event' },
  },
  {
    key: 'core.audit-legacy', label: 'Journal d’audit (legacy)', singular: 'ligne', module: 'audit', domain: 'ERP',
    description: 'Ancien lecteur de `audit_logs` — conservé pour compatibilité, fusionné visuellement avec « Audit (ERP) » plus tard.',
    navPermission: 'audit:read', permissions: { list: 'audit:read' },
    section: 'audit', nav: { group: 'Système', order: 460, icon: 'History' },
    surface: 'custom', component: 'AuditPage', api: { prefix: '/audit-logs', kind: 'generic' },
    columns: [], fields: [], actions: ['list', 'view'], audit: { module: 'AUDIT', resourceType: 'audit_event' },
    notes: 'Consolidation prévue (DUP-06) : l’écran disparaît de la nav une fois l’équivalence prouvée, l’API reste.',
  },
  {
    key: 'core.events', label: 'Événements', singular: 'événement', module: 'core', domain: 'ERP',
    description: '`erp_events` : un événement durable dérivé de chaque écriture auditée.',
    navPermission: 'dashboard:read', permissions: { list: 'core:read' },
    section: 'erp-events', nav: { group: 'ERP', order: 350, icon: 'Bell' },
    surface: 'custom', component: 'ErpEventsPage', api: { prefix: '/core/events', kind: 'module' },
    columns: [], fields: [], actions: ['list', 'view'], audit: { module: 'EVENTS', resourceType: 'erp_event' },
  },
  {
    key: 'core.registry', label: 'Modules & environnement', singular: 'module', module: 'core', domain: 'ERP',
    description: 'Registre des modules, environnement, auto-test — c’est aussi la source de cette navigation.',
    navPermission: 'dashboard:read', permissions: { list: 'core:read' },
    section: 'erp-environment', nav: { group: 'ERP', order: 360, icon: 'Settings' },
    surface: 'custom', component: 'ErpEnvironmentPage', api: { prefix: '/core/modules', kind: 'module' },
    columns: [], fields: [], actions: ['list', 'view'], audit: { module: 'ENVIRONMENT', resourceType: 'erp_module' },
  },
  {
    key: 'finance.reports', label: 'Rapports', singular: 'rapport', module: 'reports', domain: 'ERP',
    description: 'Rapports financiers et export CSV (la lecture de l’export est auditée depuis P0).',
    navPermission: 'reports:read', permissions: { view: 'reports:read', export: 'reports:read' },
    section: 'reports', nav: { group: 'Commerce', order: 260, icon: 'ChartLine' },
    surface: 'custom', component: 'ReportsPage', api: { prefix: '/reports/finance', kind: 'generic' },
    columns: [], fields: [], actions: ['view', 'export'], audit: { module: 'REPORTS', resourceType: 'financial_report' },
  },
  {
    key: 'content.social', label: 'Social', singular: 'publication', module: 'cms', domain: 'CONTENT',
    description: 'Publications, reels et éditeurs de stories.',
    navPermission: 'content:read', permissions: { list: 'cms:read', edit: 'cms:write' },
    section: 'social', nav: { group: 'Contenu', order: 40, icon: 'ChartLine' },
    surface: 'custom', component: 'SocialAdminPage', api: { prefix: '/publications', kind: 'generic' },
    columns: [], fields: [], actions: ['list', 'view', 'edit'], audit: { module: 'SOCIAL', resourceType: 'publication' },
  },
  {
    key: 'content.magazine-agent', label: 'وكيل مجلتي', singular: 'brouillon', module: 'cms', domain: 'CONTENT',
    description: 'Agent de rédaction du magazine : brouillons générés par l’IA, transférés vers مجلتي après relecture.',
    navPermission: 'content:read', permissions: { list: 'cms:read', edit: 'cms:write', approve: 'cms:write' },
    section: 'magazine-agent', nav: { group: 'Contenu', order: 45, icon: 'Sparkles' },
    surface: 'custom', component: 'MagazineAgentPage', api: { prefix: '/magazine-agent', kind: 'generic' },
    columns: [], fields: [], actions: ['list', 'view', 'edit', 'approve'], audit: { module: 'MAGAZINE_AGENT', resourceType: 'magazine_draft' },
  },
  {
    key: 'content.hero-visuals', label: 'Hero Management', singular: 'visuel', module: 'cms', domain: 'CONTENT',
    description: 'Visuels du hero d’accueil (table `hero_visuals`, distincte de `hero_slides`).',
    navPermission: 'content:read', permissions: { list: 'cms:read', edit: 'cms:write' },
    section: 'hero-visuals', nav: { group: 'Contenu', order: 70, icon: 'Image' },
    surface: 'custom', component: 'HeroVisualsPage', api: { prefix: '/hero-visuals', kind: 'generic' },
    columns: [], fields: [], actions: ['list', 'view', 'edit'], audit: { module: 'HERO_VISUALS', resourceType: 'hero_visual' },
  },
  {
    key: 'content.lens-section', label: 'LENS', singular: 'section', module: 'cms', domain: 'CONTENT',
    description: 'Section Lens de la page d’accueil.', navPermission: 'content:read', permissions: { list: 'cms:read', edit: 'cms:write' },
    section: 'lens-section', nav: { group: 'Contenu', order: 80, icon: 'LensBox' },
    surface: 'custom', component: 'LensSectionPage', api: { prefix: '/lens-hero', kind: 'generic' },
    columns: [], fields: [], actions: ['list', 'view', 'edit'], audit: { module: 'LENS_SECTION', resourceType: 'lens_hero_settings' },
  },
  {
    key: 'content.home-sections', label: 'Sections accueil', singular: 'bloc', module: 'cms', domain: 'CONTENT',
    description: 'Blocs de la page d’accueil.', navPermission: 'content:read', permissions: { list: 'cms:read', edit: 'cms:write' },
    section: 'home-sections', nav: { group: 'Contenu', order: 90, icon: 'LayoutGrid' },
    surface: 'custom', component: 'HomeSectionsPage', api: { prefix: '/home-blocks', kind: 'generic' },
    columns: [], fields: [], actions: ['list', 'view', 'edit'], audit: { module: 'HOME_SECTIONS', resourceType: 'home_block' },
  },
  {
    key: 'content.trust-bar', label: 'Trust Bar', singular: 'élément', module: 'cms', domain: 'CONTENT',
    description: 'Barre de réassurance (icones, libellés, ordre).', navPermission: 'content:read', permissions: { list: 'cms:read', edit: 'cms:write' },
    section: 'trust-bar', nav: { group: 'Contenu', order: 120, icon: 'ShieldCheck' },
    surface: 'custom', component: 'TrustBarPage', api: { prefix: '/trust-bar', kind: 'generic' },
    columns: [], fields: [], actions: ['list', 'view', 'edit'], audit: { module: 'TRUST_BAR', resourceType: 'trust_bar_item' },
  },
  {
    key: 'marketing.ai-discovery', label: 'AI Discovery', singular: 'rapport', module: 'marketing', domain: 'CONTENT',
    description: 'Agrégats de découverte produit par l’IA.', navPermission: 'reports:read', permissions: { view: 'reports:read' },
    section: 'ai-discovery', nav: { group: 'Commerce', order: 235, icon: 'ChartLine' },
    surface: 'custom', component: 'AiDiscoveryPage', api: { prefix: '/ai-discovery', kind: 'generic' },
    columns: [], fields: [], actions: ['view'], audit: { module: 'AI_DISCOVERY', resourceType: 'discovery' },
  },
  {
    key: 'ai.lens-lab', label: 'Lens Test Lab', singular: 'test', module: 'settings', domain: 'ERP',
    description: 'Laboratoire d’objectifs — fonction de réglages, volontairement sous `settings:write`.',
    navPermission: 'settings:write', permissions: { view: 'settings:write', edit: 'settings:write' },
    section: 'lens-lab', nav: { group: 'Commerce', order: 232, icon: 'Camera' },
    surface: 'custom', component: 'LensLabPage', api: { prefix: '/lens-lab', kind: 'generic' },
    columns: [], fields: [], actions: ['view', 'edit'], audit: { module: 'LENS_LAB', resourceType: 'lens_lab_run' },
  },
  {
    key: 'system.interface', label: 'واجهتي', singular: 'réglage', module: 'settings', domain: 'CONTENT',
    description: 'Interface du site : sections, ordres, thèmes.', navPermission: 'settings:write', permissions: { view: 'settings:write', edit: 'settings:write' },
    section: 'interface', nav: { group: 'Système', order: 400, icon: 'Eye' },
    surface: 'custom', component: 'InterfaceStudio', api: { prefix: '/settings', kind: 'generic' },
    columns: [], fields: [], actions: ['view', 'edit'], audit: { module: 'INTERFACE', resourceType: 'interface_config' },
  },
  {
    key: 'system.design', label: 'Développement', singular: 'préréglage', module: 'settings', domain: 'CONTENT',
    description: 'Préréglages de thème et tokens.', navPermission: 'settings:write', permissions: { view: 'settings:write', edit: 'settings:write' },
    section: 'design', nav: { group: 'Système', order: 410, icon: 'Palette' },
    surface: 'custom', component: 'DesignPage', api: { prefix: '/settings', kind: 'generic' },
    columns: [], fields: [], actions: ['view', 'edit'], audit: { module: 'SETTINGS', resourceType: 'theme_preset' },
  },
  {
    key: 'system.settings', label: 'Paramètres', singular: 'réglage', module: 'settings', domain: 'ERP',
    description: 'Réglages globaux (table `settings`) — namespace unique visé en P2.8.',
    navPermission: 'content:read', permissions: { edit: 'settings:write' },
    section: 'settings', nav: { group: 'Système', order: 440, icon: 'Settings' },
    surface: 'custom', component: 'SettingsPage', api: { prefix: '/settings', kind: 'generic' },
    columns: [], fields: [], actions: ['view', 'edit'], audit: { module: 'SETTINGS', resourceType: 'setting' },
    notes: 'Parité conservée : l’entrée reste visible avec `content:read` comme aujourd’hui, l’écriture exige `settings:write`.',
  },
  {
    key: 'system.user-account', label: 'Utilisateurs', singular: 'compte', module: 'users', domain: 'ERP',
    description: 'Comptes de connexion `admin_users` — conservés, jamais remplacés par les fiches employés.',
    navPermission: 'users:write', permissions: { list: 'users:read', view: 'users:read', create: 'users:write', edit: 'users:write' },
    section: 'users', nav: { group: 'Système', order: 450, icon: 'ShieldCheck' },
    surface: 'custom', component: 'UsersPage', api: { prefix: '/users', kind: 'generic' },
    columns: [], fields: [], actions: ['list', 'view', 'create', 'edit'], audit: { module: 'USERS', resourceType: 'admin_user' },
  },
];

/** Nav : un seul endroit au monde déclare ce que voit un administrateur (groupes, ordre, icônes). */
export const BACK_OFFICE_GROUP_ORDER = ['Vue générale', 'Contenu', 'Catalogue', 'Commerce', 'ERP', 'Système'] as const;

export const BACK_OFFICE_DOMAINS: ReadonlyArray<{ key: BackOfficeDomain; label: string; description: string; order: number }> = [
  { key: 'ERP', label: 'ERP', description: 'Cœur, identité, réglages, rapports', order: 10 },
  { key: 'COMMERCE', label: 'Commerce', description: 'Catalogue, ventes, finance, expéditions', order: 20 },
  { key: 'CRM', label: 'CRM', description: 'Arrivages, clients, support', order: 30 },
  { key: 'CONTENT', label: 'Contenu', description: 'Site, éditorial, campagnes', order: 40 },
];

let cache: BackOfficeResourceDescriptor[] | null = null;

/** Registre complet, dérivé une seule fois par processus. */
export function resourceDescriptors(): BackOfficeResourceDescriptor[] {
  if (cache) return cache;
  const framework = Object.entries(frameworkResourceConfigs()).map(([name, config]) => descriptorFromLegacyConfig(name, config));
  cache = [...framework, ...CUSTOM_RESOURCES];
  return cache;
}

const BY_KEY = new Map<string, BackOfficeResourceDescriptor>();
const BY_SECTION = new Map<string, BackOfficeResourceDescriptor>();

function index() {
  if (BY_KEY.size) return;
  for (const descriptor of resourceDescriptors()) {
    BY_KEY.set(descriptor.key, descriptor);
    BY_SECTION.set(descriptor.section, descriptor);
    for (const alias of descriptor.aliases ?? []) BY_SECTION.set(alias, descriptor);
  }
}

export function resourceDescriptorByKey(key: string): BackOfficeResourceDescriptor | undefined {
  index();
  return BY_KEY.get(key);
}

/** Résolution d'un `?section=` — y compris les alias historiques (`hero`, `hero-slides`). */
export function resourceDescriptorBySection(section: string): BackOfficeResourceDescriptor | undefined {
  index();
  return BY_SECTION.get(section);
}

/** Actions que le framework sait rendre, dans l'ordre de présentation. */
export const RESOURCE_ACTIONS: readonly ResourceActionKey[] = ['list', 'view', 'create', 'edit', 'delete', 'approve', 'export', 'assign'];

/** Le verbe HTTP que le framework utilisera pour une action (aucune route n'est créée ici). */
export const ACTION_METHOD: Record<ResourceActionKey, 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE'> = {
  list: 'GET', view: 'GET', create: 'POST', edit: 'PUT', delete: 'PUT', approve: 'PATCH', export: 'GET', assign: 'PUT',
};
