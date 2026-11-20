/** Route state only. No records, credentials or permissions are persisted by the tab strip. */
export type WorkTab = { section: string; request?: string; focus?: string };
export const HOME_TAB = 'dashboard';
export const MAX_WORK_TABS = 7;

export function visitWorkTab(tabs: WorkTab[], target: WorkTab): WorkTab[] {
  const current = tabs.findIndex(tab => tab.section === target.section);
  if (current !== -1) {
    const match = tabs[current];
    if (match.request === target.request && match.focus === target.focus) return tabs;
    return tabs.map((tab, index) => index === current ? target : tab);
  }
  const next = [...tabs, target];
  if (next.length > MAX_WORK_TABS) next.splice(next.findIndex(tab => tab.section !== HOME_TAB), 1);
  return next;
}

export function closeWorkTab(tabs: WorkTab[], section: string): { tabs: WorkTab[]; fallback?: WorkTab } {
  const index = tabs.findIndex(tab => tab.section === section);
  if (section === HOME_TAB || index === -1) return { tabs };
  const next = tabs.filter(tab => tab.section !== section);
  return { tabs: next, fallback: next[index] ?? next[index - 1] };
}

/** Move known archival/duplicate screens away from day-to-day work without deleting routes. */
export function isSecondaryOfficeScreen(section: string, canonicalOf?: string) {
  return Boolean(canonicalOf) || ['home-sections', 'public-nav'].includes(section);
}
