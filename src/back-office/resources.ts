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
  render?: 'entity' | 'status' | 'money' | 'datetime' | 'code' | 'number' | 'text';
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
  // ---- P2.2 — Stock (module neuf : aucune surface legacy à dualiser) ----
  {
    key: 'inventory.stock', label: 'Stock', singular: 'ligne de stock', module: 'inventory', domain: 'COMMERCE',
    description: 'Quantités par produit, variante et emplacement — la seule table qui détient le stock, jamais `products`.',
    navPermission: 'commerce:read',
    permissions: {
      list: 'inventory:read', view: 'inventory:read', create: 'inventory:create',
      edit: 'inventory:update', delete: 'inventory:update',
    },
    section: 'inventory', nav: { group: 'Commerce', order: 260, icon: 'Package' },
    // `custom` + un composant qui N'EST qu'une commande du moteur : la preuve que
    // `ResourceWorkspace` sert un écran réel, sans ajouter une sixième liste quelque part.
    surface: 'custom', component: 'InventoryStockPage', api: { prefix: '/inventory/stock', kind: 'module' },
    columns: [
      { key: 'product_name', label: 'Produit', render: 'entity', sortable: true },
      { key: 'product_code', label: 'Code', render: 'code', sortable: false },
      { key: 'sku', label: 'SKU', render: 'code', hiddenByDefault: true },
      { key: 'location', label: 'Emplacement', sortable: true },
      { key: 'quantity', label: 'Quantité', render: 'number', sortable: true },
      { key: 'reorder_point', label: 'Point de commande', render: 'number', hiddenByDefault: true, sortable: true },
      { key: 'stock_state', label: 'État', render: 'status' },
      { key: 'last_movement_at', label: 'Dernier mouvement', render: 'datetime', sortable: true },
      { key: 'updated_at', label: 'Modifié le', render: 'datetime', sortable: true, hiddenByDefault: true },
    ],
    fields: [
      { key: 'product_id', label: 'Identifiant produit', type: 'text', hint: 'Ou « code produit » — la fiche produit reste la source de la désignation' },
      { key: 'variant_id', label: 'Variante', type: 'text', hint: 'Vide = ligne sans variante' },
      { key: 'location', label: 'Emplacement', type: 'text', required: true, hint: 'Étiquette courte : MAIN, TUNIS-1…' },
      { key: 'quantity', label: 'Quantité d’ouverture', type: 'number', readonly: true, hint: 'Écrite comme mouvement OPENING_BALANCE ; ensuite, seul un mouvement déplace la quantité' },
      { key: 'reorder_point', label: 'Point de commande', type: 'number', hint: 'Déclenche l’état « stock bas » ; ne bloque aucune vente' },
      { key: 'status', label: 'Statut', type: 'select', options: ['ACTIVE', 'ARCHIVED'] },
    ],
    actions: ['list', 'view', 'create', 'edit', 'delete'],
    statusField: 'status', statuses: ['ACTIVE', 'LOW', 'OUT', 'ARCHIVED'],
    audit: { module: 'INVENTORY', resourceType: 'stock_item' },
    notes: 'P2.2 — écran rendu par ResourceWorkspace depuis le descripteur ; aucune quantité stockée sur la fiche produit.',
  },
  {
    key: 'inventory.movement', label: 'Mouvements de stock', singular: 'mouvement', module: 'inventory', domain: 'COMMERCE',
    description: 'Journal append-only : chaque unité entrée, sortie ou ajustée, avec solde avant/après et motif.',
    navPermission: 'commerce:read',
    permissions: { list: 'inventory:read', view: 'inventory:read', create: 'inventory:write' },
    section: 'inventory-movements', nav: { group: 'Commerce', order: 270, icon: 'History' },
    surface: 'custom', component: 'InventoryMovementsPage', api: { prefix: '/inventory/movements', kind: 'module' },
    columns: [
      { key: 'created_at', label: 'Horodatage', render: 'datetime', sortable: true },
      { key: 'product_name', label: 'Produit', render: 'entity' },
      { key: 'direction', label: 'Sens', render: 'status' },
      { key: 'quantity', label: 'Quantité', render: 'number', sortable: true },
      { key: 'location', label: 'Emplacement' },
      { key: 'balance_after', label: 'Solde après', render: 'number' },
      { key: 'reason', label: 'Motif' },
    ],
    fields: [
      { key: 'product_code', label: 'Code produit', type: 'text', hint: 'Ou sélectionnez la ligne de stock' },
      { key: 'location', label: 'Emplacement', type: 'text', required: true },
      { key: 'direction', label: 'Sens', type: 'select', required: true, options: ['IN', 'OUT', 'ADJUST'] },
      { key: 'quantity', label: 'Quantité', type: 'number', required: true, hint: 'Signée pour un ajustement' },
      { key: 'reason', label: 'Motif', type: 'select', required: true, options: ['RECEPTION', 'SALE', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'DAMAGE', 'LOSS', 'STOCKTAKE_VARIANCE', 'OPENING_BALANCE', 'CORRECTION', 'OTHER'] },
      { key: 'note', label: 'Note', type: 'textarea', hint: 'Obligatoire pour un ajustement' },
    ],
    actions: ['list', 'view', 'create'],
    statusField: 'direction', statuses: ['IN', 'OUT', 'ADJUST'], statusVocabulary: 'inventory.movement',
    audit: { module: 'INVENTORY', resourceType: 'stock_movement' },
    notes: 'Aucun verbe d’édition ni de suppression : un mouvement ne se corrige que par un mouvement.',
  },
  {
    key: 'inventory.stocktake', label: 'Inventaires', singular: 'inventaire', module: 'inventory', domain: 'COMMERCE',
    description: 'Comptage physique par emplacement, puis validation — les écarts ne touchent le stock qu’à l’approbation.',
    navPermission: 'commerce:read',
    permissions: {
      list: 'inventory:read', view: 'inventory:read', create: 'inventory:create',
      edit: 'inventory:update', approve: 'inventory:approve',
    },
    section: 'inventory-stocktakes', nav: { group: 'Commerce', order: 280, icon: 'CheckCircle2' },
    surface: 'custom', component: 'InventoryStocktakesPage', api: { prefix: '/inventory/stocktakes', kind: 'module' },
    columns: [
      { key: 'code', label: 'Référence', render: 'code', sortable: true },
      { key: 'location', label: 'Emplacement', sortable: true },
      { key: 'status', label: 'Statut', render: 'status', sortable: true },
      { key: 'lines_count', label: 'Lignes', render: 'number' },
      { key: 'counted_count', label: 'Comptées', render: 'number' },
      { key: 'variance_count', label: 'Écarts', render: 'number' },
      { key: 'created_at', label: 'Ouvert le', render: 'datetime', sortable: true },
    ],
    fields: [
      { key: 'location', label: 'Emplacement', type: 'text', required: true },
      { key: 'note', label: 'Note de session', type: 'textarea' },
    ],
    actions: ['list', 'view', 'create', 'edit', 'approve'],
    statusField: 'status', statuses: ['DRAFT', 'COUNTING', 'SUBMITTED', 'APPROVED', 'REJECTED'], statusVocabulary: 'inventory.stocktake',
    audit: { module: 'INVENTORY', resourceType: 'stocktake' },
    notes: 'Compter exige inventory:update, trancher exige inventory:approve — deux droits distincts.',
  },
  {
    key: 'purchasing.supplier', label: 'Fournisseurs', singular: 'fournisseur', module: 'purchasing', domain: 'COMMERCE',
    description: 'Fiches fournisseurs : devise de paiement, délai, conditions. On ne supprime pas un fournisseur, on le désactive.',
    navPermission: 'commerce:read',
    permissions: {
      list: 'purchasing:read', view: 'purchasing:read', create: 'purchasing:create',
      edit: 'purchasing:update', delete: 'purchasing:update',
    },
    section: 'purchasing', nav: { group: 'Commerce', order: 290, icon: 'Truck' },
    // `custom` + un composant qui n'est qu'une commande du moteur : la preuve que le module est
    // servi par `ResourceWorkspace`, sans sixième liste écrite à la main quelque part.
    surface: 'custom', component: 'PurchasingSuppliersPage', api: { prefix: '/purchasing/suppliers', kind: 'module' },
    columns: [
      { key: 'code', label: 'Code', render: 'code', sortable: true },
      { key: 'name', label: 'Fournisseur', render: 'entity', sortable: true },
      { key: 'contact_name', label: 'Interlocuteur', sortable: false },
      { key: 'phone', label: 'Téléphone', hiddenByDefault: true },
      { key: 'email', label: 'E-mail', hiddenByDefault: true },
      { key: 'currency', label: 'Devise' },
      { key: 'lead_time_days', label: 'Délai (jours)', render: 'number', sortable: true },
      { key: 'orders_count', label: 'Commandes', render: 'number', sortable: true },
      { key: 'orders_open', label: 'En cours', render: 'number', hiddenByDefault: true },
      { key: 'status', label: 'Statut', render: 'status', sortable: true },
    ],
    fields: [
      { key: 'name', label: 'Raison sociale', type: 'text', required: true, hint: 'Unique à la casse près : deux fiches pour un interlocuteur, c’est deux historiques' },
      { key: 'code', label: 'Code', type: 'text', readonly: true, hint: 'Réservé par la numérotation (SUP-…), jamais éditable' },
      { key: 'contact_name', label: 'Interlocuteur', type: 'text' },
      { key: 'phone', label: 'Téléphone', type: 'text' },
      { key: 'email', label: 'E-mail', type: 'text' },
      { key: 'address', label: 'Adresse', type: 'textarea' },
      { key: 'currency', label: 'Devise de paiement', type: 'select', options: ['TND', 'EUR', 'USD'] },
      { key: 'payment_terms', label: 'Conditions de règlement', type: 'text' },
      { key: 'lead_time_days', label: 'Délai de livraison (jours)', type: 'number', hint: 'Base de planification des commandes' },
      { key: 'status', label: 'Statut', type: 'select', options: ['ACTIVE', 'INACTIVE'] },
      { key: 'notes', label: 'Notes internes', type: 'textarea' },
    ],
    actions: ['list', 'view', 'create', 'edit', 'delete'],
    statusField: 'status', statuses: ['ACTIVE', 'INACTIVE'],
    audit: { module: 'PURCHASING', resourceType: 'supplier' },
    notes: 'La suppression est refusée par l’API tant que des commandes sont engagées — la fiche reste lisible.',
  },
  {
    key: 'purchasing.purchase_order', label: 'Commandes d’achat', singular: 'commande d’achat', module: 'purchasing', domain: 'COMMERCE',
    description: 'Commande fournisseur avec lignes, totaux calculés, soumission puis approbation ; la réception ne se décrète pas ici.',
    navPermission: 'commerce:read',
    permissions: {
      list: 'purchasing:read', view: 'purchasing:read', create: 'purchasing:create',
      edit: 'purchasing:update', approve: 'purchasing:approve',
    },
    section: 'purchasing-orders', nav: { group: 'Commerce', order: 300, icon: 'Clipboard' },
    surface: 'custom', component: 'PurchasingOrdersPage', api: { prefix: '/purchasing/orders', kind: 'module' },
    columns: [
      { key: 'po_number', label: 'Référence', render: 'code', sortable: true },
      { key: 'supplier_name', label: 'Fournisseur', render: 'entity', sortable: true },
      { key: 'status', label: 'Statut', render: 'status', sortable: true },
      { key: 'currency', label: 'Devise' },
      { key: 'subtotal', label: 'Montant', render: 'number', sortable: true },
      { key: 'total_tnd', label: 'Équivalent TND', render: 'number', hiddenByDefault: true },
      { key: 'lines_count', label: 'Lignes', render: 'number' },
      { key: 'ordered_units', label: 'Commandées', render: 'number' },
      { key: 'received_units', label: 'Reçues', render: 'number' },
      { key: 'updated_at', label: 'Modifiée le', render: 'datetime', sortable: true },
    ],
    fields: [
      { key: 'supplier_id', label: 'Identifiant fournisseur', type: 'text', required: true, hint: 'Un fournisseur actif, choisi dans la liste' },
      { key: 'currency', label: 'Devise de la commande', type: 'select', options: ['TND', 'EUR', 'USD'] },
      { key: 'exchange_rate', label: 'Taux vers TND', type: 'number', hint: '1 unité de devise commandée = ? TND ; la saisie n’est jamais réécrite' },
      { key: 'arrival_id', label: 'Arrivage CRM lié', type: 'text', hint: 'Additif : aucune colonne n’a été ajoutée au CRM' },
      { key: 'note', label: 'Note d’achat', type: 'textarea' },
    ],
    actions: ['list', 'view', 'create', 'edit', 'approve'],
    statusField: 'status', statuses: ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
    statusVocabulary: 'purchasing.order',
    audit: { module: 'PURCHASING', resourceType: 'purchase_order' },
    notes: 'Les totaux sont lus sur les lignes, jamais stockés. Une commande soumise n’est plus modifiable.',
  },
  {
    key: 'purchasing.goods_receipt', label: 'Réceptions', singular: 'réception', module: 'purchasing', domain: 'COMMERCE',
    description: 'Bons de réception partiels : l’affichage écrit les mouvements de stock, la sur-réception est refusée.',
    navPermission: 'commerce:read',
    permissions: {
      list: 'purchasing:read', view: 'purchasing:read', create: 'purchasing:write',
      edit: 'purchasing:write',
    },
    section: 'purchasing-receipts', nav: { group: 'Commerce', order: 310, icon: 'PackageCheck' },
    surface: 'custom', component: 'PurchasingReceiptsPage', api: { prefix: '/purchasing/receipts', kind: 'module' },
    columns: [
      { key: 'receipt_number', label: 'Référence', render: 'code', sortable: true },
      { key: 'po_number', label: 'Commande', render: 'code', sortable: true },
      { key: 'supplier_name', label: 'Fournisseur', render: 'entity' },
      { key: 'status', label: 'Statut', render: 'status', sortable: true },
      { key: 'location', label: 'Emplacement' },
      { key: 'units', label: 'Pièces', render: 'number' },
      { key: 'cost', label: 'Coût', render: 'number', hiddenByDefault: true },
      { key: 'created_at', label: 'Créée le', render: 'datetime', sortable: true },
    ],
    fields: [
      { key: 'purchase_order_id', label: 'Commande d’achat', type: 'text', required: true, hint: 'Seule une commande approuvée peut être réceptionnée' },
      { key: 'location', label: 'Emplacement de réception', type: 'text', required: true, hint: 'MAIN, TUNIS-1… ; la ligne de stock est ouverte par le module Stock' },
      { key: 'note', label: 'Note de quai', type: 'textarea' },
    ],
    actions: ['list', 'view', 'create', 'edit'],
    statusField: 'status', statuses: ['DRAFT', 'POSTED', 'DISCARDED'], statusVocabulary: 'purchasing.receipt',
    audit: { module: 'PURCHASING', resourceType: 'goods_receipt' },
    notes: 'Un bon affiché est immuable : l’écart se corrige par un mouvement ADJUST côté stock.',
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
  {
    key: 'crm360.dashboard', label: 'Tableau de bord relationnel', singular: 'indicateur', module: 'crm360', domain: 'CRM',
    description: 'KPI du module relationnel (E2) : clients actifs, tâches en retard, issues vivantes — calculés sur les vraies données.',
    navPermission: 'commerce:read', permissions: { view: 'commerce:read' },
    section: 'crm-dashboard', nav: { group: 'CRM', order: 10, icon: 'ChartLine' },
    surface: 'custom', component: 'CrmDashboardPage', api: { prefix: '/crm/dashboard', kind: 'module' },
    columns: [], fields: [], actions: ['view'], audit: { module: 'CRM', resourceType: 'dashboard' },
  },
  {
    key: 'crm360.party', label: 'Fiches clients & partenaires', singular: 'fiche relationnelle', module: 'crm360', domain: 'CRM',
    description: 'Fiche relationnelle (Party) : une identité, un historique, des prochaines actions — refus de doublon et archivage terminal tracés.',
    navPermission: 'commerce:read',
    permissions: { list: 'commerce:read', view: 'commerce:read', create: 'orders:write', edit: 'orders:write', delete: 'orders:write' },
    section: 'crm-parties', nav: { group: 'CRM', order: 20, icon: 'User' },
    surface: 'custom', component: 'CrmPartiesPage', api: { prefix: '/crm/parties', kind: 'module' },
    columns: [], fields: [], actions: ['list', 'view', 'create', 'edit', 'delete'],
    statusField: 'status', statuses: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], statusVocabulary: 'crm.party',
    audit: { module: 'CRM', resourceType: 'party' },
    notes: 'Les écritures restent soumises aux grants ERP `crm360:<action>` ; l’écran lit les capacités réelles via `/crm/meta`. L’archivage (terminal, action `crm360:archive`) est exposé par l’écran sous le bouton « Archiver » ; la clé déclarative `delete` ci-dessus n’est qu’un libellé du moteur générique, jamais une suppression physique.',
  },
  {
    key: 'crm360.contact', label: 'Contacts', singular: 'contact', module: 'crm360', domain: 'CRM',
    description: 'Interlocuteurs rattachés aux fiches — l’unicité téléphone/e-mail par fiche est une règle de base.',
    navPermission: 'commerce:read',
    permissions: { list: 'commerce:read', view: 'commerce:read', create: 'orders:write', edit: 'orders:write', delete: 'orders:write' },
    section: 'crm-contacts', nav: { group: 'CRM', order: 30, icon: 'MessageSquare' },
    surface: 'custom', component: 'CrmContactsPage', api: { prefix: '/crm/contacts', kind: 'module' },
    columns: [], fields: [], actions: ['list', 'view', 'create', 'edit', 'delete'], audit: { module: 'CRM', resourceType: 'contact' },
  },
  {
    key: 'crm360.activity', label: 'Activités', singular: 'activité', module: 'crm360', domain: 'CRM',
    description: 'Appels, rendez-vous, visites, e-mails : ce qui a réellement été fait ou reste à faire sur une fiche.',
    navPermission: 'commerce:read',
    permissions: { list: 'commerce:read', view: 'commerce:read', create: 'orders:write', edit: 'orders:write' },
    section: 'crm-activities', nav: { group: 'CRM', order: 40, icon: 'Calendar' },
    surface: 'custom', component: 'CrmActivitiesPage', api: { prefix: '/crm/activities', kind: 'module' },
    columns: [], fields: [], actions: ['list', 'view', 'create', 'edit'],
    statusField: 'status', statuses: ['OPEN', 'COMPLETED', 'CANCELLED'], statusVocabulary: 'crm.activity',
    audit: { module: 'CRM', resourceType: 'activity' },
  },
  {
    key: 'crm360.task', label: 'Tâches & suivis', singular: 'tâche', module: 'crm360', domain: 'CRM',
    description: 'Les prochaines actions : propriétaire, échéance, priorité — le retard se calcule, jamais ne se devine.',
    navPermission: 'commerce:read',
    permissions: { list: 'commerce:read', view: 'commerce:read', create: 'orders:write', edit: 'orders:write' },
    section: 'crm-tasks', nav: { group: 'CRM', order: 50, icon: 'Clipboard' },
    surface: 'custom', component: 'CrmTasksPage', api: { prefix: '/crm/tasks', kind: 'module' },
    columns: [], fields: [], actions: ['list', 'view', 'create', 'edit'],
    statusField: 'status', statuses: ['OPEN', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'], statusVocabulary: 'crm.task',
    audit: { module: 'CRM', resourceType: 'task' },
  },
  {
    key: 'crm360.issue', label: 'Issues & réclamations', singular: 'dossier', module: 'crm360', domain: 'CRM',
    description: 'Dossiers support rattachés aux fiches — la résolution s’écrit, la clôture se trace.',
    navPermission: 'commerce:read',
    permissions: { list: 'commerce:read', view: 'commerce:read', create: 'orders:write', edit: 'orders:write' },
    section: 'crm-issues', nav: { group: 'CRM', order: 60, icon: 'Bell' },
    surface: 'custom', component: 'CrmIssuesPage', api: { prefix: '/crm/issues', kind: 'module' },
    columns: [], fields: [], actions: ['list', 'view', 'create', 'edit'],
    statusField: 'status', statuses: ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'], statusVocabulary: 'crm.issue',
    audit: { module: 'CRM', resourceType: 'issue' },
  },
];

/** Nav : un seul endroit au monde déclare ce que voit un administrateur (groupes, ordre, icônes). */
export const BACK_OFFICE_GROUP_ORDER = ['Vue générale', 'Contenu', 'Catalogue', 'Commerce', 'CRM', 'ERP', 'Système'] as const;

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
