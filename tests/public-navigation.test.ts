/**
 * Barre publique sous l'en-tête — contrat Admin ↔ site public (décision produit du 2026-09-22).
 *
 * Ce que ces tests figent :
 *  • les trois destinations officielles sont semées et servies dans l'ordre Admin ;
 *  • l'Admin peut renommer (FR/AR), réordonner, masquer et ajouter des onglets ;
 *  • une destination hors contrat est refusée (400) — l'Admin ne peut pas publier un lien mort ;
 *  • un onglet masqué disparaît du site, et tout masquer retire la barre entière ;
 *  • l'écriture suit `content:write` : le rôle Contenu écrit, le rôle Commandes non.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { resourceDescriptorBySection } from '../src/back-office/resources';
import { PUBLIC_NAV_DESTINATIONS } from '../shared/publicNavigation';

type Session = { agent: ReturnType<typeof request.agent>; csrf: string };

const publicList = async () => {
  const response = await request(app).get('/api/public/navigation');
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
  return response.body.data as Array<{ id: string; destination: string; href: string; labelFr: string; labelAr: string; order: number }>;
};

async function loginAs(role: 'CONTENT_MANAGER' | 'ORDER_MANAGER', superAgent: any, superCsrf: string): Promise<Session> {
  const email = `public-nav-${role.toLowerCase()}-${Date.now()}@test.ayrovi.tn`;
  const password = 'PublicNav2026!x';
  const insert = await superAgent.post('/api/admin/users').set('x-csrf-token', superCsrf).send({ name: `Nav ${role}`, email, password, role });
  expect(insert.status, JSON.stringify(insert.body)).toBe(201);
  const agent = request.agent(app);
  const login = await agent.post('/api/admin/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  return { agent, csrf: login.body.data.csrfToken };
}

describe('barre publique sous l’en-tête', () => {
  let superAdmin: Session;
  let content: Session;
  let orders: Session;

  beforeAll(async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    superAdmin = { agent, csrf: login.body.data.csrfToken };
    content = await loginAs('CONTENT_MANAGER', superAdmin.agent, superAdmin.csrf);
    orders = await loginAs('ORDER_MANAGER', superAdmin.agent, superAdmin.csrf);
  });

  test('le site sert les trois destinations officielles, dans l’ordre publié', async () => {
    const items = await publicList();
    expect(items.map((item) => item.destination)).toEqual(PUBLIC_NAV_DESTINATIONS.map((destination) => destination.id));
    expect(items.map((item) => item.href)).toEqual(PUBLIC_NAV_DESTINATIONS.map((destination) => destination.href));
    expect(items.map((item) => item.order)).toEqual([...items.map((item) => item.order)].sort((a, b) => a - b));
    expect(items[0]).toMatchObject({ labelFr: 'Arrivage', labelAr: 'Arrivage' });
  });

  test('l’écran Admin est une ressource du framework, rangée dans « Contenu »', () => {
    const descriptor = resourceDescriptorBySection('public-nav');
    expect(descriptor).toBeTruthy();
    expect(descriptor!.key).toBe('cms.public-nav');
    expect(descriptor!.nav).toMatchObject({ group: 'Contenu' });
    expect(descriptor!.surface).toBe('framework');
    expect(descriptor!.permissions.edit).toBe('cms:write');
  });

  test('le rôle Contenu écrit la barre, le rôle Commandes non', async () => {
    const created = await content.agent.post('/api/admin/public-nav').set('x-csrf-token', content.csrf)
      .send({ destination: 'arrivals', label_fr: 'Nouveautés', label_ar: 'جديد', display_order: 5, active: 1 });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const denied = await orders.agent.post('/api/admin/public-nav').set('x-csrf-token', orders.csrf)
      .send({ destination: 'arrivals', label_fr: 'Interdit', display_order: 6, active: 1 });
    expect(denied.status).toBe(403);
    // Nettoyage : on retire l'entrée de test pour laisser le contrat semé intact.
    const removed = await content.agent.delete(`/api/admin/public-nav/${created.body.data.id}`).set('x-csrf-token', content.csrf);
    expect(removed.status).toBe(200);
  });

  test('un onglet réordonné et renommé est servi tel quel, une destination inventée est refusée', async () => {
    // La liste Admin contient aussi les entrées archivées (suppression logique) : on ne
    // renomme que l'onglet publié, celui que le site sert réellement.
    const list = await superAdmin.agent.get('/api/admin/public-nav?sort=display_order&direction=asc');
    const arrivals = list.body.data.find((row: any) => row.destination === 'arrivals' && row.active === 1);

    const renamed = await superAdmin.agent.put(`/api/admin/public-nav/${arrivals.id}`).set('x-csrf-token', superAdmin.csrf)
      .send({ label_fr: 'Arrivage express', label_ar: 'وصول سريع', display_order: 1 });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);

    const items = await publicList();
    expect(items[0]).toMatchObject({ destination: 'arrivals', labelFr: 'Arrivage express', labelAr: 'وصول سريع', href: '/arrivage' });

    const invalid = await superAdmin.agent.post('/api/admin/public-nav').set('x-csrf-token', superAdmin.csrf)
      .send({ destination: 'https://exemple.tn', label_fr: 'Lien libre', display_order: 2, active: 1 });
    expect(invalid.status).toBe(400);

    // Remise en état : le libellé semé revient (aucun test ne dépend de l'ordre des fichiers).
    await superAdmin.agent.put(`/api/admin/public-nav/${arrivals.id}`).set('x-csrf-token', superAdmin.csrf).send({ label_fr: 'Arrivage', label_ar: 'Arrivage', display_order: 10 });
  });

  test('un onglet masqué disparaît du site ; tout masquer retire la barre entière', async () => {
    const list = await superAdmin.agent.get('/api/admin/public-nav');
    const rows = list.body.data as any[];
    expect(rows.length).toBeGreaterThanOrEqual(3);

    for (const row of rows) {
      const masked = await superAdmin.agent.put(`/api/admin/public-nav/${row.id}`).set('x-csrf-token', superAdmin.csrf).send({ active: 0 });
      expect(masked.status).toBe(200);
    }
    expect(await publicList()).toEqual([]);

    for (const row of rows) {
      const restored = await superAdmin.agent.put(`/api/admin/public-nav/${row.id}`).set('x-csrf-token', superAdmin.csrf).send({ active: 1 });
      expect(restored.status).toBe(200);
    }
    expect((await publicList()).length).toBe(rows.length);
  });
});
