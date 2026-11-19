import { describe, expect, it } from 'vitest';
import { buildOfficeWorkspaces, officeItemLabel } from '../client/src/admin/back-office/workspaces';
import type { BackOfficeNavItem } from '../client/src/admin/back-office/framework';

const item = (section: string, permitted = true): BackOfficeNavItem => ({ section, permitted, label: section, description: '', icon: 'Home', group: 'Old', domain: 'ERP', moduleKey: 'module', moduleStatus: 'active', surface: 'custom', navPermission: 'dashboard:read' });

describe('Unified Admin workspaces', () => {
  it('preserves visible destinations, deduplicates and does not introduce permissions or lose future sections', () => {
    const items = ['dashboard', 'customers', 'orders', 'inventory', 'home-sections', 'erp-permissions', 'future-module'].map(section => item(section));
    const result = buildOfficeWorkspaces([{ label: 'Old', domain: 'ERP', items: [...items, items[2], item('news', false)] }]);
    expect(result.map(group => group.key)).toEqual(['overview', 'crm', 'erp', 'cms', 'admin', 'other']);
    expect(result.flatMap(group => group.items)).toEqual(items);
    expect(result[2].items.map(entry => entry.section)).toEqual(['orders', 'inventory']);
  });
  it('places finance in its own workspace only if permitted', () => {
    expect(buildOfficeWorkspaces([{ label: 'Old', domain: 'ERP', items: [item('reports', false)] }])).toEqual([]);
    const finance = buildOfficeWorkspaces([{ label: 'Old', domain: 'ERP', items: [item('reports')] }]);
    expect(finance.map(group => group.key)).toEqual(['finance']);
    expect(finance[0].items.map(entry => entry.section)).toEqual(['reports']);
  });
  it('names the new workspace views in both languages without changing IDs', () => {
    expect(officeItemLabel(item('orders'), 'fr')).toBe('Commandes & factures');
    expect(officeItemLabel(item('orders'), 'ar')).toBe('الطلبات والفواتير');
    expect(officeItemLabel(item('future-module'), 'ar')).toBe('future-module');
  });
});
