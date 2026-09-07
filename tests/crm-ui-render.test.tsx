// @vitest-environment jsdom
/**
 * AYROVI CRM 360 (E7-bis) — la couche client n'est pas un vœu : chaque écran se monte,
 * reçoit ses données (fetch simulé), et s'affiche sans exception. Un deep link
 * `?id=party_…` (résultat de la recherche globale) ouvre la vue 360°.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const META = {
  capabilities: {
    party: { view: true, create: true, edit: true, archive: true, delete: false, export: false, manage: false },
    contact: { view: true, create: true, edit: true, archive: false, delete: true, export: false, manage: false },
    activity: { view: true, create: true, edit: true, archive: false, delete: false, export: false, manage: false },
    task: { view: true, create: true, edit: true, archive: false, delete: false, export: false, manage: false },
    note: { view: true, create: true, edit: true, archive: false, delete: false, export: false, manage: false },
    issue: { view: true, create: true, edit: true, archive: false, delete: false, export: false, manage: false },
    communication: { view: true, create: true, edit: true, archive: false, delete: false, export: false, manage: false },
    timeline: { view: true, create: false, edit: false, archive: false, delete: false, export: false, manage: false },
    dashboard: { view: true, create: false, edit: false, archive: false, delete: false, export: false, manage: false },
    crm_config: { view: true, create: false, edit: false, archive: false, delete: false, export: false, manage: false },
  },
  statuses: {
    partyTypes: ['INDIVIDUAL', 'COMPANY'], partyKinds: ['CUSTOMER', 'PARTNER', 'SUPPLIER', 'PROSPECT', 'OTHER'],
    partyStatuses: ['ACTIVE', 'INACTIVE', 'ARCHIVED'], partySources: ['MANUAL', 'IMPORT'],
    contactStatuses: ['ACTIVE', 'INACTIVE'], activityKinds: ['CALL', 'MEETING'], activityStatuses: ['OPEN', 'COMPLETED', 'CANCELLED'],
    taskStatuses: ['OPEN', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'], taskPriorities: ['LOW', 'NORMAL', 'HIGH'],
    issueStatuses: ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'], issuePriorities: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
    commChannels: ['EMAIL', 'PHONE'], commDirections: ['INBOUND', 'OUTBOUND'],
  },
};

const NOW = new Date().toISOString();

function json(data: unknown) {
  return new Response(JSON.stringify({ success: true, data, pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}

const DETAIL = {
  party: {
    id: 'party_1', party_code: 'CUS-000001', name: 'Cliente Test', kind: 'CUSTOMER', party_type: 'INDIVIDUAL',
    status: 'ACTIVE', email: 'c@test.tn', phone: '+21622000001', governorate: 'Tunis', city: 'Tunis',
    owner_name: null, next_follow_up_at: null, updated_at: NOW, created_at: NOW,
  },
  contacts: [{ id: 'c_1', party_id: 'party_1', first_name: 'Ines', last_name: 'B', title: 'Achat', email: 'i@test.tn', phone: '+21622000001', is_primary: 1 }],
  legacy: { orderCount: 0, lifetimeValue: null },
  counters: { open_tasks: 1, overdue_tasks: 0, open_follow_ups: 0, open_issues: 0, open_activities: 0, note_count: 1 },
};

function stubFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/crm/meta')) return json(META);
    if (url.includes('/crm/dashboard')) return json({
      parties: { customersActive: 2, customersNew30d: 1 }, contacts: 1,
      activities: { open: 0, completed30d: 0 }, tasks: { open: 1, overdue: 0, dueToday: 1, upcoming: 0, followUps: 0, completed30d: 0 },
      issues: { open: 0, inProgress: 1, waiting: 0, resolved30d: 0, total: 1 },
      recentlyActive: 1, ownerNextActions: [], generatedAt: NOW,
    });
    if (url.includes('/crm/parties/party_1/timeline')) return json([]);
    if (/\/crm\/parties\/party_1([?&]|$)/.test(url)) return json(DETAIL);
    if (url.includes('/crm/parties')) return json([{ id: 'party_1', party_code: 'CUS-000001', name: 'Cliente Test', kind: 'CUSTOMER', party_type: 'INDIVIDUAL', status: 'ACTIVE', email: 'c@test.tn', phone: '+21622000001', governorate: 'Tunis', owner_name: null, updated_at: NOW }]);
    if (url.includes('/crm/contacts')) return json([{ id: 'c_1', party_id: 'party_1', first_name: 'Ines', last_name: 'B', email: 'i@test.tn', phone: '+21622000001', is_primary: 1, status: 'ACTIVE' }]);
    if (url.includes('/crm/activities')) return json([{ id: 'a_1', party_id: 'party_1', kind: 'CALL', subject: 'Appel de suivi', party_name: 'Cliente Test', scheduled_at: NOW, status: 'OPEN' }]);
    if (url.includes('/crm/tasks')) return json([{ id: 't_1', task_no: 'TSK-0001', title: 'Relancer', party_id: 'party_1', status: 'OPEN', priority: 'HIGH', is_follow_up: 0, due_at: NOW, owner_name: 'Admin' }]);
    if (url.includes('/crm/issues')) return json([{ id: 'i_1', issue_no: 'ISU-0001', subject: 'Colis', status: 'OPEN', priority: 'URGENT', party_id: 'party_1', created_at: NOW }]);
    return json([]);
  });
}

const SCREENS: Array<[string, string, string]> = [
  ['CrmDashboardPage', 'Tableau de bord relationnel', ''],
  ['CrmPartiesPage', 'Fiches clients & partenaires', 'Cliente Test'],
  ['CrmContactsPage', 'Contacts', 'Ines'],
  ['CrmActivitiesPage', 'Activités', 'Appel de suivi'],
  ['CrmTasksPage', 'Tâches & suivis', 'Relancer'],
  ['CrmIssuesPage', 'Issues & réclamations', 'ISU-0001'],
];

let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  vi.stubGlobal('fetch', stubFetch());
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
});

async function flush() {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

describe('CRM 360 — rendu des six écrans (E7-bis)', () => {
  it('chaque écran se monte, affiche son titre et sa première ligne', async () => {
    const pages = await import('../client/src/admin/CrmPages');
    for (const [name, title, row] of SCREENS) {
      const Component = pages[name as keyof typeof pages] as React.ComponentType;
      await act(async () => { root!.render(React.createElement(Component)); });
      await flush();
      const text = host!.textContent ?? '';
      expect(text, `${title} absent du rendu`).toContain(title);
      if (row) expect(text, `ligne introuvable: ${row}`).toContain(row);
      expect(host!.innerHTML).not.toContain('data:base64'); // aucune image de substitution
      act(() => root!.unmount());
      root = createRoot(host!);
    }
  });

  it('un deep link ?id=party_… ouvre la vue 360° directement', async () => {
    window.history.replaceState(null, '', '/?section=crm-parties&id=party_1');
    const { CrmPartiesPage } = await import('../client/src/admin/CrmPages');
    await act(async () => { root!.render(React.createElement(CrmPartiesPage)); });
    await flush();
    const text = host!.textContent ?? '';
    expect(text).toContain('Timeline 360°');
    expect(text).toContain('CUS-000001'); // code de la fiche dans le titre du modal
    window.history.replaceState(null, '', '/');
  });
});
