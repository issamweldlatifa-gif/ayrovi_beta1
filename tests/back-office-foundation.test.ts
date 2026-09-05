/**
 * P2.0 — Back Office Shell + Resource Framework (côté serveur).
 *
 * Cette phase n’ajoute AUCUNE capacité : elle donne aux capacités existantes une coquille, une
 * navigation dérivée et un descripteur de ressource servi par l’API. Les tests ci-dessous figent
 * donc surtout ce qui ne doit PAS changer : les deep links, les droits de chaque rôle, les
 * contrats des écrans legacy, et le fait qu’un bouton grisé par le framework ne peut pas
 * contredire la route qu’il appelle.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app, db } from '../src/server';
import { ALL_ADMIN_PERMISSIONS, hasPermission } from '../src/admin/permissions';
import { can } from '../src/erp-core/permissions';
import { ERP_MODULES } from '../src/erp-core/modules';
import { backOfficeSections, canSeeSection } from '../src/back-office/navigation';
import { resourceDescriptors, resourceDescriptorBySection } from '../src/back-office/resources';
import { BACK_OFFICE_FRAMEWORK_VERSION } from '../src/back-office/routes';

const suffix = Date.now();
type Session = { agent: ReturnType<typeof request.agent>; csrf: string };

async function loginAs(role: 'ADMIN' | 'CONTENT_MANAGER' | 'ORDER_MANAGER', superAgent: any, superCsrf: string): Promise<Session> {
  const email = `bo-${role.toLowerCase()}-${suffix}@test.ayrovi.tn`;
  const password = 'BackOffice2026!x';
  const insert = await superAgent.post('/api/admin/users').set('x-csrf-token', superCsrf)
    .send({ name: `BackOffice ${role}`, email, password, role });
  expect(insert.status, JSON.stringify(insert.body)).toBe(201);
  const agent = request.agent(app);
  const login = await agent.post('/api/admin/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  return { agent, csrf: login.body.data.csrfToken };
}

describe('back office shell (P2.0)', () => {
  let superAdmin: Session;
  let admin: Session;
  let content: Session;
  let orders: Session;

  beforeAll(async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    superAdmin = { agent, csrf: login.body.data.csrfToken };
    admin = await loginAs('ADMIN', superAdmin.agent, superAdmin.csrf);
    content = await loginAs('CONTENT_MANAGER', superAdmin.agent, superAdmin.csrf);
    orders = await loginAs('ORDER_MANAGER', superAdmin.agent, superAdmin.csrf);
  });

  describe('le registre de ressources est la source unique', () => {
    test('les 9 ressources du moteur générique sont dérivées, pas recopiées', () => {
      const descriptors = resourceDescriptors().filter((descriptor) => descriptor.surface === 'framework');
      expect(descriptors.map((descriptor) => descriptor.section).sort()).toEqual(
        ['arrivals', 'assistant', 'brands', 'hero', 'news', 'products', 'promotions', 'stories', 'ticker'].sort());
      // Les colonnes viennent de ResourceConfig : vérifier une colonne = vérifier le moteur.
      const products = descriptors.find((descriptor) => descriptor.section === 'products')!;
      expect(products.fields.map((field) => field.key)).toEqual(
        ['name', 'description', 'image', 'additional_images', 'brand_id', 'brand_name', 'category', 'source_url', 'source_platform', 'original_price', 'currency', 'express_available', 'stock_status', 'status']);
      expect(products.fields.find((field) => field.key === 'source_platform')!.type).toBe('select');
      expect(products.fields.find((field) => field.key === 'additional_images')!.type).toBe('list');
      expect(products.fields.find((field) => field.key === 'express_available')!.type).toBe('boolean');
      expect(products.fields.find((field) => field.key === 'original_price')!.type).toBe('number');
      expect(products.statuses).toEqual(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']);
    });

    test('aucune clé, aucune section, aucun alias dupliqué', () => {
      const descriptors = resourceDescriptors();
      const keys = descriptors.map((descriptor) => descriptor.key);
      const sections = descriptors.flatMap((descriptor) => [descriptor.section, ...(descriptor.aliases ?? [])]);
      expect(new Set(keys).size).toBe(keys.length);
      expect(new Set(sections).size).toBe(sections.length);
    });

    test(' chaque module cité existe dans le registre ERP ou dans le moteur de permissions', () => {
      const registry = new Set(ERP_MODULES.map((module) => module.key));
      // Vocabulaires existants : les préfixes legacy réels + les modules connus du moteur ERP.
      const engineModules = new Set<string>([
        ...ALL_ADMIN_PERMISSIONS.map((permission) => permission.split(':')[0]),
        'core', 'cms', 'catalog', 'sales', 'crm', 'customers', 'finance', 'users', 'ai', 'employees',
        'organization', 'permissions', 'audit', 'reports', 'settings', 'support', 'marketing', 'inventory',
        'purchasing', 'accounting', 'shipping', 'automation',
      ]);
      for (const descriptor of resourceDescriptors()) {
        expect(registry.has(descriptor.module), `module ${descriptor.module} absent du registre`).toBe(true);
        if (descriptor.permissionModule) expect(engineModules.has(descriptor.permissionModule), `permissionModule ${descriptor.permissionModule} inconnu`).toBe(true);
        for (const permission of Object.values(descriptor.permissions)) {
          const [moduleKey, action] = String(permission).split(':');
          expect(engineModules.has(moduleKey), `permission ${permission} sur un module inconnu`).toBe(true);
          expect(descriptor.actions.length).toBeGreaterThan(0);
          expect(['read', 'write', 'create', 'update', 'delete', 'approve', 'export', 'assign', 'manage']).toContain(action);
        }
      }
    });

    test('le self-test du framework ne remonte aucun problème', async () => {
      const result = await superAdmin.agent.get('/api/admin/back-office/self-test');
      expect(result.status).toBe(200);
      expect(result.body.data.problems).toEqual([]);
      expect(result.body.data.status).toBe('ok');
      expect(result.body.data.frameworkVersion).toBe(BACK_OFFICE_FRAMEWORK_VERSION);
      expect(result.body.data.frameworkRendered).toBe(9);
    });
  });

  describe('deep links : rien de ce qui fonctionnait ne doit cesser de répondre', () => {
    test('les 39 identifiants de section couvrent la navigation legacy ET les alias', () => {
      const sections = new Set(backOfficeSections());
      // La liste vient de l’AdminApp d’origine (37 entrées) + les 2 sections hors nav
      // atteignables par deep link (`hero`, `stories`).
      const expected = [
        'dashboard', 'arrivals', 'products', 'promotions', 'social', 'news', 'magazine-agent', 'brands',
        'hero-visuals', 'lens-section', 'home-sections', 'ticker', 'trust-bar', 'catalogue-products',
        'catalogue-categories', 'catalogue-brands', 'arrival-ingestion', 'orders', 'lens-requests',
        'assistant-support', 'lens-lab', 'ai-discovery', 'customers', 'pricing', 'reports', 'erp-employees',
        'erp-organization', 'erp-permissions', 'erp-audit', 'erp-events', 'erp-environment', 'interface',
        'design', 'assistant', 'settings', 'users', 'audit', 'hero', 'stories',
      ];
      for (const section of expected) expect(sections.has(section), `section perdue: ${section}`).toBe(true);
      expect(expected.length).toBe(39);
    });

    test('la navigation serveur couvre exactement les entrées de la barre latérale legacy', () => {
      // Liste figée telle qu'elle était écrite dans `AdminApp.tsx` avant P2.0 (`navGroups`).
      // Depuis P2.0, le client ne contient plus AUCUNE liste de navigation : la source est le
      // registre serveur. Ce snapshot est donc la preuve d'équivalence — il ne doit jamais être
      // « aligné » sur le serveur, c'est l'inverse qui est engagé.
      const legacyIds = [
        'dashboard', 'arrivals', 'products', 'promotions', 'social', 'news', 'magazine-agent', 'brands',
        'hero-visuals', 'lens-section', 'home-sections', 'ticker', 'trust-bar', 'catalogue-products',
        'catalogue-categories', 'catalogue-brands', 'arrival-ingestion', 'orders', 'lens-requests',
        'assistant-support', 'lens-lab', 'ai-discovery', 'customers', 'pricing', 'reports', 'erp-employees',
        'erp-organization', 'erp-permissions', 'erp-audit', 'erp-events', 'erp-environment', 'interface',
        'design', 'assistant', 'settings', 'users', 'audit',
      ];
      expect(legacyIds.length).toBe(37);
      // 1) chaque id legacy est bien un descripteur enregistré, à la même section ;
      for (const id of legacyIds) {
        expect(resourceDescriptorBySection(id)?.section, `descripteur manquant pour ${id}`).toBe(id);
      }
      // 2) la navigation calculée rend exactement ce même ensemble, ni plus ni moins ;
      const navigable = backOfficeSections();
      const sections = resourceDescriptors()
        .filter((descriptor) => descriptor.nav && navigable.includes(descriptor.section))
        .map((descriptor) => descriptor.section)
        .sort();
      expect(sections).toEqual([...legacyIds].sort());
      // 3) et le client ne réintroduit aucune copie de cette liste.
      const adminApp = fs.readFileSync(path.resolve(process.cwd(), 'client/src/admin/AdminApp.tsx'), 'utf8');
      expect(adminApp, 'le client ne doit plus porter de liste de navigation').not.toContain('const navGroups');
      expect(adminApp).toContain('<BackOfficeShell');
    });

    test('le SPA continue de servir une section legacy et une section du framework', async () => {
      const legacy = await superAdmin.agent.get('/admin?section=hero');
      expect(legacy.status).toBe(200);
      expect(legacy.headers['content-type']).toContain('text/html');
      const framework = await superAdmin.agent.get('/admin?section=catalogue-products');
      expect(framework.status).toBe(200);
    });
  });

  describe('navigation dérivée du registre + permissions + statut de module', () => {
    test('SUPER_ADMIN voit les 37 entrées navigables', async () => {
      const result = await superAdmin.agent.get('/api/admin/back-office/navigation');
      expect(result.status).toBe(200);
      const items = result.body.data.groups.flatMap((group: any) => group.items);
      expect(items.length).toBe(37);
      expect(result.body.data.counts).toMatchObject({ sections: 37, visible: 37 });
      expect(result.body.data.groups.map((group: any) => group.label)).toEqual(
        ['Vue générale', 'Contenu', 'Catalogue', 'Commerce', 'ERP', 'Système']);
    });

    test('un rôle ne voit que ce que la permission autorise — sans jamais enlever davantage', async () => {
      const cases: Array<[Session, string[], string[]]> = [
        [content, ['products', 'ticker', 'news'], ['users', 'erp-permissions', 'lens-lab', 'erp-employees', 'customers']],
        [orders, ['orders', 'arrival-ingestion'], ['users', 'settings', 'products', 'erp-audit']],
        [admin, ['reports', 'products', 'arrival-ingestion'], ['users', 'erp-permissions', 'erp-employees']],
      ];
      for (const [session, allowed, denied] of cases) {
        const result = await session.agent.get('/api/admin/back-office/navigation');
        const visible = new Set(result.body.data.groups.flatMap((group: any) => group.items.map((item: any) => item.section)));
        for (const section of allowed) expect(visible.has(section), `${section} devrait être visible`).toBe(true);
        for (const section of denied) expect(visible.has(section), `${section} ne devrait pas être visible`).toBe(false);
      }
    });

    test("la visibilité calculée est identique à l’ancienne règle, rôle par rôle", () => {
      for (const role of ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'ORDER_MANAGER'] as const) {
        for (const descriptor of resourceDescriptors().filter((item) => item.nav)) {
          const expected = hasPermission(role, descriptor.navPermission as any);
          const decided = canSeeSection(db, role, { navPermission: descriptor.navPermission, module: descriptor.module });
          if (expected) expect(decided, `${role} ne doit pas perdre ${descriptor.section}`).toBe(true);
        }
      }
    });

    test("un module planifié n’apparaît jamais comme un écran cliquable", async () => {
      const result = await superAdmin.agent.get('/api/admin/back-office/navigation');
      const sections = result.body.data.groups.flatMap((group: any) => group.items.map((item: any) => item.section));
      const roadmap = result.body.data.roadmap.map((entry: any) => entry.module);
      expect(roadmap).toContain('inventory');
      expect(roadmap).toContain('purchasing');
      expect(roadmap).toContain('accounting');
      for (const planned of roadmap) expect(sections.some((section: string) => section.includes(planned)), `module planifié ${planned} ne doit pas être une entrée`).toBe(false);
    });

    test('le contexte expose l’identité employé et les domaines, sans secret', async () => {
      const result = await admin.agent.get('/api/admin/back-office/context');
      expect(result.status).toBe(200);
      expect(result.body.data.frameworkVersion).toBe(BACK_OFFICE_FRAMEWORK_VERSION);
      expect(result.body.data.role).toBe('ADMIN');
      expect(result.body.data.legacyPermissions).toContain('content:write');
      expect(result.body.data.legacyPermissions).not.toContain('users:write');
      expect(result.body.data.domains.map((domain: any) => domain.key)).toEqual(['ERP', 'COMMERCE', 'CRM', 'CONTENT']);
      expect(JSON.stringify(result.body)).not.toContain('csrf');
      expect(JSON.stringify(result.body)).not.toContain('password');
    });
  });

  describe('descripteurs servis au client + capacités réelles', () => {
    test('la liste des ressources est lisible par tout compte administrateur authentifié', async () => {
      const result = await content.agent.get('/api/admin/back-office/resources');
      expect(result.status).toBe(200);
      const resources = result.body.data.resources as any[];
      expect(resources.length).toBeGreaterThanOrEqual(39);
      expect(result.body.data.modules.map((section: any) => section.section))
        .toEqual(['CORE', 'OPERATIONS', 'FINANCE', 'CONTENT', 'SYSTEM']);
      const news = resources.find((item) => item.key === 'cms.news')!;
      expect(news.visible).toBe(true);
      const users = resources.find((item) => item.key === 'system.user-account')!;
      expect(users.visible).toBe(false);
      // Aucune table n’est exposée au client par mégarde : seule la route l’est.
      expect(JSON.stringify(news)).not.toContain('"table"');
    });

    test('une ressource inconnue répond 404 avec un code, jamais 500', async () => {
      const result = await admin.agent.get('/api/admin/back-office/resources/nope.nope');
      expect(result.status).toBe(404);
      expect(result.body.code).toBe('RESOURCE_NOT_FOUND');
    });

    test('une capacité ne peut pas contredire la route que le bouton appelle', async () => {
      const result = await content.agent.get('/api/admin/back-office/resources/cms.arrivals');
      expect(result.status).toBe(200);
      const capabilities = result.body.data.capabilities as Record<string, boolean | null>;
      // `arrivals` est écrit par le moteur générique sous content:write : le framework doit dire la
      // même chose, ni plus (sinon on grise un bouton valide) ni moins (sinon on en laisse un faux).
      expect(capabilities.edit).toBe(hasPermission('CONTENT_MANAGER', 'content:write'));
      expect(capabilities.list).toBe(true);
      // Le moteur ERP est la décision, pas une seconde autorité : même résultat, même question.
      expect(capabilities.edit).toBe(can(db, 'CONTENT_MANAGER', { module: 'cms', action: 'write', resourceType: 'arrival' }).allowed);
    });

    test('une action sans clé ERP déclarée reste « indécise », jamais refusée', async () => {
      const result = await orders.agent.get('/api/admin/back-office/resources/support.ticket');
      expect(result.status).toBe(200);
      expect(result.body.data.capabilities.edit).toBeNull();
      const list = await orders.agent.get('/api/admin/assistant-support');
      expect([200, 403]).toContain(list.status);
    });

    test('les statuts viennent du vocabulaire partagé, avec ton et libellé', async () => {
      const result = await admin.agent.get('/api/admin/back-office/resources/sales.order');
      expect(result.body.data.status.values).toEqual([
        'CREATED', 'AWAITING_DEPOSIT', 'AWAITING_PAYMENT_VERIFICATION', 'CONFIRMED', 'PREPARING',
        'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']);
      expect(result.body.data.statuses[0]).toMatchObject({ value: 'CREATED', label: 'Créée', tone: 'neutral' });
      expect(result.body.data.statuses[9]).toMatchObject({ value: 'CANCELLED', tone: 'danger' });
    });
  });

  describe('recherche globale', () => {
    beforeAll(async () => {
      // Une donnée de recherche, créée par la voie canonique (le moteur générique), pas par un INSERT.
      const created = await admin.agent.post('/api/admin/brands').set('x-csrf-token', admin.csrf)
        .send({ name: `Cherchable ${suffix}`, category: 'FASHION', display_order: 5, active: 1, description: 'marque de test' });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
    });

    test('un terme court ne déclenche aucune requête', async () => {
      const result = await admin.agent.get('/api/admin/back-office/search?q=a');
      expect(result.status).toBe(200);
      expect(result.body.data.hits).toEqual([]);
      expect(result.body.data.sources).toEqual([]);
    });

    test('les résultats portent un deep link existant, pas une route inventée', async () => {
      const result = await admin.agent.get(`/api/admin/back-office/search?q=${encodeURIComponent(`Cherchable ${suffix}`)}`);
      expect(result.status).toBe(200);
      const hit = result.body.data.hits.find((item: any) => item.resource === 'cms.brands');
      expect(hit, JSON.stringify(result.body.data)).toBeTruthy();
      expect(hit.href).toBe(`/admin?section=brands&id=${encodeURIComponent(hit.id)}`);
      expect(resourceDescriptorBySection('brands')).toBeTruthy();
    });

    test('une source non autorisée est signalée comme sautée, jamais interrogée', async () => {
      const result = await content.agent.get('/api/admin/back-office/search?q=whatever');
      const sources = result.body.data.sources as any[];
      const skipped = sources.filter((source) => source.skipped === 'permission').map((source) => source.resource);
      expect(skipped).toEqual(expect.arrayContaining(['sales.order', 'crm.party', 'core.employee']));
      expect(sources.some((source) => source.resource === 'cms.brands' && !source.skipped)).toBe(true);
    });

    test('une recherche est une lecture de données clients : elle est auditée, une ligne', async () => {
      const before = db.get<{ n: number }>('SELECT COUNT(*) n FROM audit_logs WHERE module=?', 'BACK_OFFICE')!.n;
      const result = await admin.agent.get('/api/admin/back-office/search?q=ayrovi');
      expect(result.status).toBe(200);
      const after = db.get<{ n: number }>('SELECT COUNT(*) n FROM audit_logs WHERE module=?', 'BACK_OFFICE')!.n;
      expect(after - before).toBe(1);
      const row = db.get<any>('SELECT action, user_id, resource_type, ip_address, employee_code FROM audit_logs WHERE module=? ORDER BY created_at DESC LIMIT 1', 'BACK_OFFICE');
      expect(row.action).toBe('ACCESS');
      expect(row.resource_type).toBe('search');
      expect(row.user_id).toBeTruthy();
    });

    test('la recherche n’est pas ouverte aux non-connectés', async () => {
      const anonymous = await request(app).get('/api/admin/back-office/search?q=ayrovi');
      expect(anonymous.status).toBe(401);
    });
  });

  describe('non-régression des systèmes existants (la coquille ne remplace rien)', () => {
    test('les surfaces appelées par l’admin aujourd’hui répondent comme avant', async () => {
      const checks: Array<[Session, string, number]> = [
        [content, '/api/admin/news', 200],
        [content, '/api/admin/products', 200],
        [content, '/api/admin/ai-knowledge', 403],
        [admin, '/api/admin/orders?page=1&pageSize=5', 200],
        [admin, '/api/admin/catalogue/meta', 200],
        [admin, '/api/admin/core/modules', 200],
        [admin, '/api/admin/core/audit?limit=5', 200],
        [admin, '/api/admin/arrival-ingestion/arrivals', 200],
        [admin, '/api/admin/reports/finance', 200],
        [orders, '/api/admin/customers', 200],
      ];
      for (const [session, url, expected] of checks) {
        const response = await session.agent.get(url);
        expect(`${response.status} ${url}`, JSON.stringify(response.body).slice(0, 160)).toBe(`${expected} ${url}`);
      }
    });

    test('la coquille n’a ajouté aucune route publique ni aucun chemin nouveau pour une capacité existante', () => {
      const adminRoutes = fs.readFileSync(path.resolve(process.cwd(), 'src/admin/routes.ts'), 'utf8');
      expect(adminRoutes).toContain("router.use('/back-office', createBackOfficeRouter(db))");
      expect(adminRoutes).toContain('registerFrameworkResources(resources)');
      // Les chemins générés par le moteur sont intacts (le descripteur ne les a pas renommés).
      for (const name of ['arrivals', 'products', 'promotions', 'stories', 'news', 'brands', 'hero-slides', 'announcements', 'ai-knowledge']) {
        expect(adminRoutes, `ressource ${name} toujours décrite côté serveur`).toMatch(new RegExp(`^  '?${name}'?: \\{`, 'm'));
      }
    });

    test('le module back-office n’écrit dans aucune table métier', () => {
      const files = ['routes.ts', 'resources.ts', 'navigation.ts', 'search.ts'] as const;
      for (const file of files) {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'src/back-office', file), 'utf8');
        expect(source, `${file} ne doit pas écrire`).not.toMatch(/INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM/);
      }
    });

    test('les permissions legacy restent le plancher : aucune chaîne nouvelle ajoutée au Set', () => {
      expect(ALL_ADMIN_PERMISSIONS).toHaveLength(15);
      expect(ALL_ADMIN_PERMISSIONS.filter((permission) => permission.startsWith('back-office'))).toEqual([]);
    });
  });
});
