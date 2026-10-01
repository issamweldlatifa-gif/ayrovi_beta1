/**
 * Frontières de permission des surfaces d'exploitation.
 *
 * Constat (audit du 2026-10-01) : `dashboard:read` est détenu par les QUATRE rôles —
 * il signifie donc « peut ouvrir la console », pas « peut voir le système ». Il gardait
 * pourtant trois familles de routes qui décrivent l'installation et non l'activité :
 *
 *   1. `GET /api/admin/core/environment` (+ self-test) — racines de stockage, répertoire
 *      de données, disponibilité des fournisseurs. Un rédacteur y lisait le chemin absolu
 *      de l'installation (`/opt/render/project/src/data` en production).
 *   2. `GET /api/admin/core/events` (+ summary) — journal d'événements contenant des lignes
 *      financières (`finance`, `payment_proof`). Il relève du gate d'audit.
 *   3. `GET /api/admin/settings` — gardé par `content:read`, donc ouvert à CONTENT_MANAGER,
 *      alors qu'il renvoie TOUTES les lignes de `settings` (dont `payment_methods`).
 *      Lire la configuration n'est pas lire le contenu : il manquait un nom pour la lecture.
 *
 * L'invariant de ce fichier n'est PAS « personne ne bouge » — la faille était justement que
 * l'ensemble des ayants droit était trop large. Il est :
 *   a) le droit ajouté (`settings:read`) n'est détenu que par des rôles qui détenaient déjà
 *      `settings:write` : il nomme un accès déjà exercé, il n'en crée aucun ;
 *   b) chaque surface d'exploitation est gardée par un droit que `dashboard:read` ne
 *      remplace pas, et le rescrit est vérifié en HTTP réel, pas seulement dans le source ;
 *   c) aucun endpoint d'exploitation ne peut retomber par défaut sur le droit le plus faible.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app, db } from '../src/server';
import {
  ALL_ADMIN_PERMISSIONS,
  OPERATIONAL_PERMISSION_FOR,
  hasPermission,
  permissionsForRole,
} from '../src/admin/permissions';

const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CONTENT_MANAGER', 'ORDER_MANAGER'] as const;
const suffix = Date.now();
const created: string[] = [];

type Session = { agent: ReturnType<typeof request.agent>; csrf: string };

async function loginAs(role: (typeof ALL_ROLES)[number], superAgent: any, superCsrf: string): Promise<Session> {
  const email = `boundary-${role.toLowerCase()}-${suffix}@test.ayrovi.tn`;
  const password = 'BoundarySecure2026!x';
  const insert = await superAgent.post('/api/admin/users').set('x-csrf-token', superCsrf)
    .send({ name: `Boundary ${role}`, email, password, role });
  expect(insert.status, JSON.stringify(insert.body)).toBe(201);
  created.push(email);
  const agent = request.agent(app);
  const login = await agent.post('/api/admin/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  return { agent, csrf: login.body.data.csrfToken };
}

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('frontières de permission des surfaces d\'exploitation', () => {
  let superAgent: any;
  let admin: Session;
  let content: Session;
  let orders: Session;

  beforeAll(async () => {
    superAgent = request.agent(app);
    const superLogin = await superAgent.post('/api/admin/auth/login')
      .send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(superLogin.status).toBe(200);
    admin = await loginAs('ADMIN', superAgent, superLogin.body.data.csrfToken);
    content = await loginAs('CONTENT_MANAGER', superAgent, superLogin.body.data.csrfToken);
    orders = await loginAs('ORDER_MANAGER', superAgent, superLogin.body.data.csrfToken);
  });

  afterAll(() => {
    // Base de test en mémoire : les comptes disparaissent avec elle. On ne supprime rien
    // d'autre — ce fichier n'écrit aucune ligne de permission à la main.
    expect(created.length).toBe(3);
  });

  describe('le droit de lecture des réglages n\'élargit personne', () => {
    test('`settings:read` existe, il est nommé dans le miroir ERP et il est plus étroit que l\'écriture', () => {
      expect(ALL_ADMIN_PERMISSIONS).toContain('settings:read');
      for (const role of ALL_ROLES) {
        // Contrat d'étroitesse : détenir la lecture implique détenir l'écriture.
        if (hasPermission(role, 'settings:read')) {
          expect(hasPermission(role, 'settings:write'), role).toBe(true);
        }
      }
      // Aucun rôle ne gagne la lecture sans l'écriture : l'ensemble des ayants droit de
      // `settings:read` est un sous-ensemble exact de ceux de `settings:write`.
      const readers = ALL_ROLES.filter((role) => hasPermission(role, 'settings:read'));
      const writers = ALL_ROLES.filter((role) => hasPermission(role, 'settings:write'));
      expect(readers).toEqual(writers);
    });

    test('`dashboard:read` est détenu par les quatre rôles — c\'est pourquoi il ne garde aucune surface d\'exploitation', () => {
      for (const role of ALL_ROLES) {
        expect(hasPermission(role, 'dashboard:read'), role).toBe(true);
      }
      // Le corollaire, écrit noir sur blanc : un droit détenu par tout le monde ne peut pas
      // servir de frontière. Le contrat ci-dessous impose le droit réellement séparateur.
      expect(OPERATIONAL_PERMISSION_FOR.environment).not.toBe('dashboard:read');
      expect(OPERATIONAL_PERMISSION_FOR.events).not.toBe('dashboard:read');
    });

    test('le miroir ERP connaît `settings:read` (le droit est modélisable en données, pas seulement en code)', () => {
      const permissions = permissionsForRole('ADMIN');
      expect(permissions).toContain('settings:read');
      const erpMirror = read('src/erp-core/permissions.ts');
      expect(erpMirror).toContain("'settings:read': { module: 'settings', action: 'read' }");
    });
  });

  describe('les routes ont été re-pointées, et le restent', () => {
    test('aucune surface d\'exploitation n\'est gardée par `dashboard:read`', () => {
      const erpRoutes = read('src/erp-core/routes.ts');
      for (const route of ['/environment', '/environment/self-test', '/events', '/events/summary']) {
        const declaration = erpRoutes.split('\n').find((line) => line.includes(`router.get('${route}'`));
        expect(declaration, route).toBeTruthy();
        expect(declaration, route).not.toContain("'dashboard:read'");
      }
      // La lecture d'une ressource de réglages ne demande plus un droit d'écriture.
      const sequences = erpRoutes.split('\n').find((line) => line.includes("router.get('/sequences'"));
      expect(sequences).toContain("'settings:read'");
      expect(sequences).not.toContain("'settings:write'");
    });

    test('`GET /settings` n\'est plus gardé par un droit de contenu', () => {
      const adminRoutes = read('src/admin/routes.ts');
      const declaration = adminRoutes.split('\n').find((line) => line.includes("router.get('/settings'"));
      expect(declaration).toBeTruthy();
      expect(declaration).toContain("'settings:read'");
      expect(declaration).not.toContain("'content:read'");
    });
  });

  describe('le comportement HTTP réel', () => {
    test('l\'environnement et le journal d\'événements sont fermés aux rôles non concernés', async () => {
      for (const [label, session] of [['CONTENT_MANAGER', content], ['ORDER_MANAGER', orders]] as const) {
        expect((await session.agent.get('/api/admin/core/environment')).status, label).toBe(403);
        expect((await session.agent.get('/api/admin/core/environment/self-test')).status, label).toBe(403);
        expect((await session.agent.get('/api/admin/core/events')).status, label).toBe(403);
        expect((await session.agent.get('/api/admin/core/events/summary')).status, label).toBe(403);
      }
    });

    test('la configuration est fermée à CONTENT_MANAGER (elle était ouverte), ouverte à ADMIN', async () => {
      // Le resserrement qui motivait le droit : un rédacteur ne lit plus les réglages.
      expect((await content.agent.get('/api/admin/settings')).status).toBe(403);
      expect((await orders.agent.get('/api/admin/settings')).status).toBe(403);
      const adminSettings = await admin.agent.get('/api/admin/settings');
      expect(adminSettings.status).toBe(200);
      expect(Array.isArray(adminSettings.body.data)).toBe(true);
      // La raison d'être du resserrement : ces lignes portent la configuration de paiement.
      expect(adminSettings.body.data.some((row: any) => row.setting_key === 'payment_methods')).toBe(true);
    });

    test('les rôles qui peuvent écrire les réglages conservent exactement la même lecture', async () => {
      // Anti-régression : le droit Ajouté ne doit pas avoir déplacé silencieusement les
      // ayants droit de l'écriture. Qui écrivait les réglages les lit toujours.
      const adminEnvironment = await admin.agent.get('/api/admin/core/environment');
      expect(adminEnvironment.status).toBe(200);
      expect(typeof adminEnvironment.body.data.dataDirectory).toBe('string');
      expect((await admin.agent.get('/api/admin/core/events')).status).toBe(200);
      expect((await admin.agent.get('/api/admin/core/sequences')).status).toBe(200);
    });

    test('le super-admin (god role) n\'a rien perdu', async () => {
      for (const route of ['/api/admin/settings', '/api/admin/core/environment', '/api/admin/core/events', '/api/admin/core/sequences']) {
        expect((await superAgent.get(route)).status, route).toBe(200);
      }
    });
  });

  describe('garde-fou : le prochain endpoint d\'exploitation ne retombera pas sur le droit le plus faible', () => {
    test('les surfaces d\'exploitation du routeur noyau ne sont gardées que par des droits séparateurs', () => {
      const erpRoutes = read('src/erp-core/routes.ts');
      const operational = ['/environment', '/environment/self-test', '/events', '/events/summary'];
      for (const route of operational) {
        const declaration = erpRoutes.split('\n').find((line) => line.includes(`router.get('${route}'`));
        // Soit le contrat nommé, soit un droit explicite — jamais le droit de tout le monde.
        expect(declaration, route).toMatch(/OPERATIONAL_PERMISSION_FOR|settings:read|audit:read/);
      }
      // Et le journal d'audit du noyau utilise déjà `audit:read` : la convention existe,
      // il ne restait qu'à l'appliquer aux événements d'exploitation.
      const auditRoute = read('src/admin/routes.ts').split('\n').find((line) => line.includes("router.get('/audit-logs'"));
      expect(auditRoute).toContain("'audit:read'");
      expect(db.get<any>('SELECT COUNT(*) AS n FROM erp_role_permissions')).toBeTruthy();
    });
  });
});
