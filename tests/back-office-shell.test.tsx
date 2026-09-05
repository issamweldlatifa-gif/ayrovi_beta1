/**
 * P2.0 — tests de la coquille unifiée et du framework de ressources (côté client).
 *
 * Le serveur est couvert par `back-office-foundation.test.ts` (registre, navigation, permissions,
 * recherche, self-test). Ce fichier couvre ce que la spec exige de la coquille :
 *  • la sidebar vient du serveur, aucune liste n'est recopiée dans le client ;
 *  • un deep-link `?section=…&request=…` continue d'atteindre exactement le même écran ;
 *  • une action refusée est invisible dans la palette et justifiée dans la table ;
 *  • un framework indisponible n'enterre aucun écran ;
 *  • `DataTable` reste UN SEUL moteur : le comportement par défaut des appels existants est
 *    inchangé, les capacités nouvelles sont opt-in, et `ResourceWorkspace` s'appuie dessus.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BackOfficeContextPayload, BackOfficeNavigation, ResourceDescriptor } from '../client/src/admin/back-office/framework';

const NAVIGATION: BackOfficeNavigation = {
  role: 'ADMIN',
  domains: [
    { key: 'ERP', label: 'ERP', description: 'Cœur', permitted: 3, total: 4 },
    { key: 'COMMERCE', label: 'Commerce', description: 'Vente', permitted: 2, total: 3 },
  ],
  groups: [
    {
      label: 'Vue générale', domain: 'ERP', items: [
        { section: 'dashboard', label: 'Tableau de bord', description: 'Activité', icon: 'Home', group: 'Vue générale', domain: 'ERP', moduleKey: 'dashboard', moduleStatus: 'active', surface: 'custom', navPermission: 'dashboard:read', permitted: true },
        { section: 'users', label: 'Utilisateurs', description: 'Comptes', icon: 'User', group: 'Vue générale', domain: 'ERP', moduleKey: 'users', moduleStatus: 'active', surface: 'custom', navPermission: 'users:read', permitted: true },
      ],
    },
    {
      label: 'Catalogue', domain: 'COMMERCE', items: [
        { section: 'products', label: 'Produits', description: 'Fiche produit legacy', icon: 'ShoppingBag', group: 'Catalogue', domain: 'COMMERCE', moduleKey: 'catalog', moduleStatus: 'legacy', surface: 'framework', navPermission: 'catalog:read', permitted: true, canonicalOf: 'catalogue-products' },
      ],
    },
  ],
  roadmap: [{ key: 'accounting', label: 'Comptabilité', module: 'accounting', status: 'planned', description: 'Écritures' }],
  counts: { sections: 39, visible: 37, modules: 21 },
};

const PRODUCTS_DESCRIPTOR: ResourceDescriptor = {
  key: 'catalog.product.legacy', label: 'Produits', singular: 'produit', description: 'Ancienne surface produit.',
  domain: 'COMMERCE', module: 'catalog', moduleStatus: 'legacy', surface: 'framework', section: 'products',
  api: { prefix: '/products', kind: 'generic' }, actions: ['list', 'view', 'create', 'edit', 'delete'],
  permissions: { list: 'cms:read', edit: 'cms:write' }, navPermission: 'cms:read',
  columns: [
    { key: 'name', label: 'Nom', render: 'entity' },
    { key: 'slug', label: 'Slug', render: 'code', hiddenByDefault: true, sortable: true },
    { key: 'price', label: 'Prix', render: 'money', sortable: true },
    { key: 'status', label: 'Statut', render: 'status' },
    { key: 'updated_at', label: 'Modifié', render: 'datetime' },
  ],
  fields: [
    { key: 'name', label: 'Nom', type: 'text', required: true },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'status', label: 'Statut', type: 'select', required: true, options: ['DRAFT', 'ACTIVE'] },
    { key: 'arrival_ids', label: 'Arrivages liés', type: 'list', readonly: true },
  ],
  status: { field: 'status', vocabulary: 'cms', values: ['DRAFT', 'ACTIVE'] },
  statuses: [{ value: 'DRAFT', label: 'Brouillon', tone: 'neutral' }, { value: 'ACTIVE', label: 'Actif', tone: 'success' }],
  audit: { module: 'CATALOG', resourceType: 'PRODUCT' },
  canonicalOf: 'catalog.product', notes: 'Conservé pour les deep links.',
  capabilities: { list: true, create: true, edit: true, delete: true },
};

const CONTEXT: BackOfficeContextPayload = {
  frameworkVersion: 'p2.0', role: 'ADMIN', legacyPermissions: ['content:write'],
  employee: { code: 'EMP-014', label: 'Rania Ben Salah', jobTitle: 'Ops', status: 'ACTIVE', branch: 'Nabeul', department: 'Ventes' },
  counts: NAVIGATION.counts, domains: NAVIGATION.domains, roadmap: NAVIGATION.roadmap,
  session: { name: 'Rania', email: 'admin@ayrovi.tn' },
};

const IDENTITY = { name: 'Rania', email: 'admin@ayrovi.tn', role: 'ADMIN', permissions: ['content:write', 'dashboard:read'] };

let store: any = {
  context: CONTEXT, navigation: NAVIGATION, resources: [PRODUCTS_DESCRIPTOR], loading: false, error: '', retry: vi.fn(),
  descriptorFor: (section: string) => (section === 'products' ? PRODUCTS_DESCRIPTOR : undefined),
  capabilitiesFor: () => ({ list: true, edit: true, create: true, delete: true }),
  loadCapabilities: vi.fn(),
};

vi.mock('../client/src/admin/back-office/framework', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, BackOfficeProvider: ({ children }: any) => children, useBackOffice: () => store };
});

// `vi.mock` est hoisté par vitest avant tout import : ces imports statiques voient bien le store simulé.
import { BackOfficeShell } from '../client/src/admin/back-office/BackOfficeShell';
import { CommandPalette, buildPaletteEntries } from '../client/src/admin/back-office/BackOfficeSearch';
import { ResourceTableView, buildColumns, fieldDefinitionsFor, renderCell, AuditTrailPanel } from '../client/src/admin/back-office/ResourceWorkspace';
import { DataTable } from '../client/src/admin/components';
import { sectionFromAdminPath } from '../client/src/admin/back-office/framework';

/**
 * `window` n'existe pas dans l'environnement node des tests : on le simule juste assez pour
 * vérifier la lecture du deep-link, sans tromper le composant sur sa disponibilité réelle.
*/
function withLocation<T>(search: string, run: () => T, pathname = '/admin'): T {
  const previous = (globalThis as any).window;
  (globalThis as any).window = {
    location: { search, pathname }, addEventListener() {}, removeEventListener() {},
    localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 0, clearTimeout() {}, dispatchEvent: () => true,
  };
  try { return run(); } finally {
    if (previous === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous;
  }
}

const renderShell = (renderPage: (ctx: any) => React.ReactNode) => renderToStaticMarkup(
  <BackOfficeShell identity={IDENTITY} onLogout={vi.fn()} renderPage={renderPage} />,
);

describe('BackOfficeShell — navigation pilotée par le registre', () => {
  it('affiche les groupes et entrées renvoyés par le serveur, avec le statut legacy', () => {
    const markup = renderShell(() => <div>page</div>);
    expect(markup).toContain('Vue générale');
    expect(markup).toContain('Tableau de bord');
    expect(markup).toContain('Utilisateurs');
    expect(markup).toContain('Produits');
    expect(markup).toContain('is-active');
    expect(markup).toContain('legacy');
    expect(markup).toContain('doublon');
    expect(markup).toContain('framework p2.0');
  });

  it('expose le DomainSwitcher avec les compteurs du registre, jamais une liste figée', () => {
    const markup = renderShell(() => <div>page</div>);
    expect(markup).toContain('Domaines du back office');
    expect(markup).toContain('Commerce');
    expect(markup).toContain('2/3');
    expect(markup).toContain('Tous');
  });

  it('place les modules planifiés hors navigation : visibles comme roadmap, jamais cliquables', () => {
    const markup = renderShell(() => <div>page</div>);
    const nav = markup.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(nav).toContain('Modules à venir');
    expect(nav).toContain('Comptabilité');
    // L'entrée de navigation doit rester absente : un module sans écran n'est pas une route.
    const links = [...NAVIGATION.groups.flatMap((group) => group.items)].map((item) => item.section);
    expect(links).not.toContain('accounting');
    expect(markup).toContain('bo-roadmap-item');
  });

  it('garde le deep-link ?section=…&request=… et le transmet à la page', () => {
    withLocation('?section=products&request=REQ-42', () => {
      let seen: any = null;
      renderShell((ctx) => { seen = ctx; return <div>page</div>; });
      expect(seen.section).toBe('products');
      expect(seen.requestedReview).toBe('REQ-42');
      expect(typeof seen.navigate).toBe('function');
      expect(typeof seen.can).toBe('function');
      expect(seen.can('content:write')).toBe(true);
      expect(seen.can('settings:write')).toBe(false);
    });
  });

  it('accepte la forme /admin/<section> sans ajouter aucune route', () => {
    expect(sectionFromAdminPath('/admin/products')).toBe('products');
    expect(sectionFromAdminPath('/admin/orders')).toBe('orders');
    expect(sectionFromAdminPath('/admin')).toBeNull();
    expect(sectionFromAdminPath('/admin/news/draft-1')).toBeNull();
    expect(sectionFromAdminPath('/admin/../etc/passwd')).toBeNull();
    expect(sectionFromAdminPath('/admin/Produits')).toBeNull();
    // la query garde la priorité : c'est la forme écrite par l'application
    const seen = withLocation('?section=users', () => {
      let ctx: any = null;
      renderShell((value) => { ctx = value; return <div>page</div>; });
      return ctx;
    }, '/admin/products');
    expect(seen.section).toBe('users');
    const fromPath = withLocation('', () => {
      let ctx: any = null;
      renderShell((value) => { ctx = value; return <div>page</div>; });
      return ctx;
    }, '/admin/products');
    expect(fromPath.section).toBe('products');
  });

  it('signale la ressource legacy par son maître canonique sans retirer l’écran', () => {
    const markup = withLocation('?section=products', () => renderShell(() => <div>page</div>));
    expect(markup).toContain('Ancienne surface');
    expect(markup).toContain('catalog.product');
    expect(markup).toContain('Conservé pour les deep links.');
  });

  it('affiche l’identité employée rattachée au compte', () => {
    let seen: any = null;
    renderShell((ctx) => { seen = ctx; return <div>page</div>; });
    expect(store.context.employee?.code).toBe('EMP-014');
    expect(seen.section).toBe('dashboard');
    expect(renderShell(() => <div>page</div>)).toContain('admin-profile');
  });

  it('ne condamne aucun écran quand le framework échoue : bandeau + page rendue', () => {
    const previous = store;
    store = { ...previous, navigation: null, context: null, error: 'Framework indisponible', loading: false, descriptorFor: () => undefined };
    try {
      const markup = renderShell(() => <div>contenu de la page</div>);
      expect(markup).toContain('Navigation indisponible');
      expect(markup).toContain('Réessayer');
      expect(markup).toContain('contenu de la page');
    } finally { store = previous; }
  });

  it('neutralise les entrées non permises côté serveur : elles n’arrivent jamais dans la coquille', () => {
    const previous = store;
    const filtered: BackOfficeNavigation = {
      ...NAVIGATION,
      groups: [{ label: 'Vue générale', domain: 'ERP', items: [NAVIGATION.groups[0].items[0]] }],
      roadmap: [],
    };
    store = { ...previous, navigation: filtered };
    try {
      const markup = renderShell(() => <div>page</div>);
      expect(markup).toContain('Tableau de bord');
      expect(markup).not.toContain('Utilisateurs');
      expect(markup).not.toContain('Produits');
    } finally { store = previous; }
  });
});

describe('CommandPalette — uniquement des commandes permises', () => {
  it('construit ses entrées depuis la navigation filtrée', () => {
    const entries = buildPaletteEntries(NAVIGATION.groups.flatMap((group) => group.items));
    expect(entries.map((entry) => entry.section)).toEqual(['dashboard', 'users', 'products']);
    expect(entries.every((entry) => entry.kind === 'écran')).toBe(true);
  });

  it('propose une création permise et passe celle qui est refusée', () => {
    const allowed = renderToStaticMarkup(<CommandPalette open onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(allowed).toContain('Créer un·e produit');
    const previous = store;
    store = {
      ...previous,
      resources: [{ ...PRODUCTS_DESCRIPTOR, capabilities: { ...PRODUCTS_DESCRIPTOR.capabilities, create: false } }],
    };
    try {
      const denied = renderToStaticMarkup(<CommandPalette open onClose={vi.fn()} onNavigate={vi.fn()} />);
      expect(denied).not.toContain('Créer un·e produit');
      // Les écrans autorisés restent accessibles : seuls les gestes refusés disparaissent.
      expect(denied).toContain('Tableau de bord');
    } finally { store = previous; }
  });

  it('n’invente aucune commande quand le framework n’a pas répondu', () => {
    const previous = store;
    store = { ...previous, navigation: null, resources: [] };
    try {
      const markup = renderToStaticMarkup(<CommandPalette open onClose={vi.fn()} onNavigate={vi.fn()} />);
      expect(markup).toContain('Aucune commande permise pour ce texte.');
    } finally { store = previous; }
  });
});

describe('ResourceWorkspace — rendu générique d’un descripteur', () => {
  it('respecte hiddenByDefault, le tri déclaré et l’ordre des colonnes', () => {
    const columns = buildColumns(PRODUCTS_DESCRIPTOR);
    expect(columns.map((column) => column.key)).toEqual(['name', 'price', 'status', 'updated_at']);
    expect(columns.map((column) => Boolean(column.sortable))).toEqual([false, true, false, false]);
  });

  it('délègue le rendu des cellules à un seul endroit', () => {
    const row = { name: 'Sneakers', slug: 'sneakers', price: 120, status: 'ACTIVE', updated_at: '2026-03-01T10:00:00.000Z', image: '/media/a.png' };
    const entity = renderCell('entity', row, 'name');
    expect(renderToStaticMarkup(<span>{entity}</span>)).toContain('admin-entity');
    expect(renderToStaticMarkup(<span>{renderCell('money', row, 'price')}</span>)).toContain('TND');
    expect(renderToStaticMarkup(<span>{renderCell('code', row, 'slug')}</span>)).toContain('<code>sneakers</code>');
    expect(renderToStaticMarkup(<span>{renderCell('status', row, 'status')}</span>)).toContain('status-badge--success');
    expect(renderToStaticMarkup(<span>{renderCell(undefined, row, 'missing')}</span>)).toBe('<span>—</span>');
  });

  it('nourrit le formulaire partagé depuis les champs du descripteur, sans copie', () => {
    const fields = fieldDefinitionsFor(PRODUCTS_DESCRIPTOR);
    expect(fields.map((field) => field.key)).toEqual(['name', 'description', 'status', 'arrival_ids']);
    expect(fields.find((field) => field.key === 'description')?.full).toBe(true);
    expect(fields.find((field) => field.key === 'arrival_ids')?.readonly).toBe(true);
    expect(fields.find((field) => field.key === 'status')?.options).toEqual(['DRAFT', 'ACTIVE']);
  });

  it('grise une action refusée avec sa raison, et masque ce que la ressource ne sait pas faire', () => {
    const denied = renderToStaticMarkup(
      <ResourceTableView descriptor={PRODUCTS_DESCRIPTOR} rows={[{ id: '1', name: 'Sneakers', price: 120, status: 'ACTIVE' }]}
        capabilities={{ edit: false, delete: false }} canWrite onEdit={vi.fn()} onArchive={vi.fn()} />,
    );
    expect(denied).toContain('Modifier');
    expect(denied).toContain('disabled');
    expect(denied).toContain('Édition refusée pour ce rôle');
    expect(denied).toContain('Archivage refusé pour ce rôle');

    const readOnly = renderToStaticMarkup(
      <ResourceTableView descriptor={{ ...PRODUCTS_DESCRIPTOR, actions: ['list', 'view'] }} rows={[{ id: '1', name: 'Sneakers', price: 120, status: 'ACTIVE' }]} />,
    );
    expect(readOnly).not.toContain('Modifier');
    expect(readOnly).not.toContain('Archiver');
    expect(readOnly).toContain('Produits — Ancienne surface produit.');
  });

  it('reste muet sur le journal d’audit tant qu’aucun enregistrement n’est sélectionné', () => {
    const markup = renderToStaticMarkup(<AuditTrailPanel resourceType="PRODUCT" resourceId={null} module="CATALOG" />);
    expect(markup).toContain('Sélectionnez un enregistrement');
  });
});

describe('DataTable — un seul moteur, capacités opt-in', () => {
  const columns = [{ key: 'name', label: 'Nom' }, { key: 'price', label: 'Prix' }];
  const rows = [{ id: '1', name: 'Sneakers', price: 120 }, { id: '2', name: 'Sac', price: 80 }];

  it('garde le markup d’origine pour les appels existants', () => {
    const markup = renderToStaticMarkup(<DataTable columns={columns} rows={rows} />);
    expect(markup).not.toContain('aria-sort');
    expect(markup).not.toContain('checkbox');
    expect(markup).not.toContain('admin-table-bulkbar');
    expect(markup).not.toContain('<caption');
  });

  it('ajoute tri, sélection, densité, légende, erreurs et actions quand on le demande', () => {
    const markup = renderToStaticMarkup(<DataTable
      columns={[{ ...columns[0], sortable: true }, { ...columns[1], align: 'end', hidden: true }]}
      rows={rows} selectable selection={['1']} onSelectionChange={vi.fn()}
      sort={{ key: 'name', direction: 'asc' }} onSortChange={vi.fn()} density="compact"
      caption="Produits du catalogue" rowActions={[{ key: 'audit', label: 'Journal', onRun: vi.fn() }]}
      bulkActions={[{ key: 'export', label: 'Exporter', onRun: vi.fn() }]}
    />);
    expect(markup).toContain('aria-sort="ascending"');
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain('admin-table-bulkbar');
    expect(markup).toContain('<caption');
    expect(markup).toContain('is-compact');
    expect(markup).toContain('Journal');
    // un état d'erreur remplace les lignes et propose le réessai (jamais les deux à la fois)
    const failed = renderToStaticMarkup(<DataTable columns={columns} rows={rows} error="Liste indisponible" onRetry={vi.fn()} />);
    expect(failed).toContain('Liste indisponible');
    expect(failed).toContain('Réessayer');
    expect(failed).not.toContain('Sneakers');
    // colonne masquée par défaut : l'appelant doit l'activer explicitement, elle n'est pas rendue
    expect(markup).not.toContain('Prix');
  });

  it('affiche l’action d’état vide quand la liste est vide', () => {
    const markup = renderToStaticMarkup(<DataTable columns={columns} rows={[]} emptyText="Aucun produit" emptyAction={<button>Créer</button>} />);
    expect(markup).toContain('Aucun produit');
    expect(markup).toContain('Créer');
  });
});

describe('Consolidation — une seule implémentation par abstraction', () => {
  const admin = readFileSync('client/src/admin/AdminApp.tsx', 'utf8');
  const components = readFileSync('client/src/admin/components.tsx', 'utf8');

  it('ne garde aucune liste de navigation dans le client', () => {
    expect(admin).not.toContain('const navGroups');
    expect(admin).not.toContain('legacyNavGroups');
    expect(admin).toContain('<BackOfficeShell');
    expect(admin).toContain('BackOfficeProvider');
  });

  it('ne redéclare ni formulaire, ni cloche, ni formatteurs hors du module partagé', () => {
    expect(admin).not.toContain('const ResourceForm');
    expect(admin).not.toContain('const NotificationsBell');
    expect(admin).not.toContain('const labels: Record<string, string>');
    expect(admin).not.toContain('function formatMoney');
    expect(admin).toContain("from './back-office/resource-ui'");
  });

  it('laisse DataTable et ResourceForm à un seul définition dans le back office', () => {
    expect([...components.matchAll(/export (?:const|function) DataTable/g)]).toHaveLength(1);
    const shared = readFileSync('client/src/admin/back-office/resource-ui.tsx', 'utf8');
    expect([...shared.matchAll(/export const ResourceForm/g)]).toHaveLength(1);
    const workspace = readFileSync('client/src/admin/back-office/ResourceWorkspace.tsx', 'utf8');
    expect(workspace).toContain('<DataTable');
    expect(workspace).not.toContain('<table');
    expect(admin).toContain('<DataTable');
  });

  it('relie les capacités de la ressource à la matrice centrale, avec repli legacy', () => {
    expect(admin).toContain('capabilitiesFor(resource)');
    expect(admin).toContain('capability?.edit ?? canWrite');
    expect(admin).toContain('capability?.create ?? canWrite');
  });
});
