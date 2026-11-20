import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkTabStrip } from '../client/src/admin/back-office/WorkTabStrip';
import { closeWorkTab, isSecondaryOfficeScreen, MAX_WORK_TABS, visitWorkTab } from '../client/src/admin/back-office/workTabs';
import { OrderVolumeChart, orderVolumeBuckets } from '../client/src/admin/back-office/OrderVolumeChart';

describe('Admin workbench', () => {
  it('keeps route context, limits the strip and preserves the pinned home tab', () => {
    let tabs = visitWorkTab([{ section: 'dashboard' }], { section: 'orders', request: 'AWAITING_DEPOSIT' });
    tabs = visitWorkTab(tabs, { section: 'orders', focus: 'test-order' });
    expect(tabs).toEqual([{ section: 'dashboard' }, { section: 'orders', focus: 'test-order' }]);
    for (let i = 0; i < 12; i++) tabs = visitWorkTab(tabs, { section: `tool-${i}` });
    expect(tabs).toHaveLength(MAX_WORK_TABS);
    expect(tabs[0].section).toBe('dashboard');
    expect(tabs.at(-1)?.section).toBe('tool-11');
    expect(closeWorkTab(tabs, 'tool-11').fallback?.section).toBe('tool-10');
    expect(closeWorkTab(tabs, 'dashboard').tabs).toBe(tabs);
  });

  it('exposes separate focusable close controls and marks one active route', () => {
    const markup = renderToStaticMarkup(<WorkTabStrip tabs={[{ section: 'dashboard' }, { section: 'orders' }]} active="orders" label={id => id} icon={() => null} go={() => {}} close={() => {}} open={() => {}} />);
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Fermer orders"');
    expect(markup).not.toContain('Fermer dashboard');
  });

  it('only demotes duplicate and explicitly historical surfaces', () => {
    expect(isSecondaryOfficeScreen('public-nav')).toBe(true);
    expect(isSecondaryOfficeScreen('products', 'catalog.product')).toBe(true);
    expect(isSecondaryOfficeScreen('catalogue-products')).toBe(false);
    expect(isSecondaryOfficeScreen('orders')).toBe(false);
  });

  it('aggregates real UTC counts in at most 18 buckets and has an honest empty state', () => {
    const series = orderVolumeBuckets([{ date: '2026-11-17', orders: 5 }, { date: '2026-11-20', orders: 3 }], 365, new Date('2026-11-20T12:00:00Z'));
    expect(series.length).toBeLessThanOrEqual(18);
    expect(series.reduce((total, bucket) => total + bucket.orders, 0)).toBe(8);
    expect(series.at(-1)?.until).toBe('2026-11-20');
    expect(renderToStaticMarkup(<OrderVolumeChart daily={[]} days={30} />)).toContain('Aucune commande sur cette période.');
  });
});
