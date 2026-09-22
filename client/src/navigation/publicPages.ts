/** Real document destinations; no in-place homepage tab panels. */
export const PUBLIC_PAGES = [
  { id: 'arrivals', href: '/arrivage', label: 'Arrivage' },
  { id: 'promotions', href: '/gift-cards', label: 'Gift & Cards' },
  { id: 'news', href: '/magazine', label: 'Magazine' },
] as const;
export type PublicPageId = (typeof PUBLIC_PAGES)[number]['id'];
export function publicPageForPath(pathname: string): PublicPageId | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  return PUBLIC_PAGES.find(page => page.href === path)?.id;
}
