/**
 * Raccourcis clavier de la console (11/11/2026) — logique pure, testée sans DOM.
 *
 * Convention des consoles d'opérations (GitHub, Linear, Gmail) :
 *   • `g` puis une lettre  → aller à un écran (g o = Commandes, g c = Clients…) ;
 *   • `/`                  → la recherche globale prend le focus ;
 *   • `?`                  → la carte des raccourcis s'ouvre / se ferme ;
 *   • `⌘K` / `Ctrl+K`      → la palette (déjà en place, inchangée).
 *
 * Règles de sécurité : jamais pendant une saisie (input, textarea, select,
 * contenteditable), jamais avec Ctrl/⌘/Alt (raccourcis du navigateur), et un
 * écran n'est proposé QUE s'il figure dans la navigation serveur de l'opérateur
 * (permissions respectées : un raccourci ne contourne jamais un droit).
 */

export interface GoShortcut {
  key: string;
  section: string;
  label: string;
}

/** Une lettre = un écran. Ordre = ordre d'affichage dans la carte d'aide. */
export const GO_SHORTCUTS: readonly GoShortcut[] = [
  { key: 'd', section: 'dashboard', label: 'Tableau de bord' },
  { key: 'o', section: 'orders', label: 'Commandes' },
  { key: 'c', section: 'customers', label: 'Clients' },
  { key: 'a', section: 'aywebs-purchases', label: 'Achats AyWebs' },
  { key: 'l', section: 'lens-requests', label: 'Demandes Lens' },
  { key: 'p', section: 'catalogue-products', label: 'Produits' },
  { key: 'i', section: 'inventory', label: 'Stock' },
  { key: 'r', section: 'crm-dashboard', label: 'CRM' },
  { key: 't', section: 'crm-tasks', label: 'Tâches CRM' },
  { key: 's', section: 'social', label: 'Social (Reels, publications)' },
  { key: 'm', section: 'news', label: 'Magazine' },
  { key: 'h', section: 'assistant-support', label: 'Support assistant' },
  { key: 'u', section: 'users', label: 'Utilisateurs' },
  { key: 'e', section: 'settings', label: 'Réglages' },
] as const;

/** Délai pour taper la seconde lettre après `g`. */
export const GO_SEQUENCE_MS = 1200;

export type ShortcutAction =
  | { type: 'go'; section: string }
  | { type: 'search' }
  | { type: 'help' }
  | { type: 'close' }
  | { type: 'arm' }
  | null;

export interface ShortcutKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** Élément focalisé : on ne vole jamais une frappe destinée à un champ. */
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}

export function isTypingTarget(target: ShortcutKeyEvent['target']): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Machine à états minimale : `armedAt` = instant du dernier `g` (ou null).
 * Renvoie l'action et le nouvel état armé.
 */
export function resolveShortcut(
  event: ShortcutKeyEvent,
  armedAt: number | null,
  now: number,
  allowed: ReadonlySet<string>,
): { action: ShortcutAction; armedAt: number | null } {
  if (event.key === 'Escape') return { action: { type: 'close' }, armedAt: null };
  if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) {
    return { action: null, armedAt: null };
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const armed = armedAt !== null && now - armedAt <= GO_SEQUENCE_MS;
  if (armed) {
    const match = GO_SHORTCUTS.find((entry) => entry.key === key);
    if (match && allowed.has(match.section)) return { action: { type: 'go', section: match.section }, armedAt: null };
    return { action: null, armedAt: null };
  }
  if (key === 'g') return { action: { type: 'arm' }, armedAt: now };
  if (event.key === '/') return { action: { type: 'search' }, armedAt: null };
  if (event.key === '?') return { action: { type: 'help' }, armedAt: null };
  return { action: null, armedAt: null };
}

/** Raccourcis réellement disponibles pour cet opérateur (affichés dans la carte d'aide). */
export function availableGoShortcuts(allowed: ReadonlySet<string>): GoShortcut[] {
  return GO_SHORTCUTS.filter((entry) => allowed.has(entry.section));
}
