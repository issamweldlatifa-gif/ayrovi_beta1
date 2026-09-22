/**
 * P2.0 — contrat client du framework de ressources.
 *
 * Ces types décrivent la payload de `/api/admin/back-office/*`. Ils ne redéfinissent aucune
 * règle : la vérité reste serveur (src/back-office/resources.ts). Le client ne fait que la
 * consommer — c'est précisément la correction de la duplication « ResourceConfig (serveur) /
 * ResourceDefinition (client) » relevée par l'audit et par le rapport de Discovery (DUP-09).
 */
import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { adminApi } from '../api';

export type ResourceActionKey = 'list' | 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'assign';

export type FieldKind = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'image' | 'boolean' | 'list';

export interface BackOfficeFieldDef {
  key: string;
  label: string;
  type: FieldKind;
  required?: boolean;
  options?: string[];
  hint?: string;
  readonly?: boolean;
}

export interface BackOfficeColumnDef {
  key: string;
  label: string;
  render?: 'entity' | 'status' | 'money' | 'datetime' | 'code' | 'text';
  sortable?: boolean;
  hiddenByDefault?: boolean;
  /** Traduction lisible d'une valeur technique (clé d'énumération) : la liste dit la même chose que le formulaire. */
  labels?: Record<string, string>;
}

export interface BackOfficeStatusValue {
  value: string;
  label: string;
  tone: string;
}

export interface ResourceDescriptor {
  key: string;
  label: string;
  singular: string;
  description: string;
  domain: string;
  module: string;
  moduleStatus: string;
  permissionModule?: string;
  surface: 'framework' | 'custom';
  component?: string | null;
  section: string;
  aliases?: string[];
  api: { prefix: string; kind: 'generic' | 'module' | 'none' };
  actions: ResourceActionKey[];
  permissions: Partial<Record<ResourceActionKey, string>>;
  navPermission: string;
  columns: BackOfficeColumnDef[];
  fields: BackOfficeFieldDef[];
  status?: { field: string; vocabulary: string | null; values: string[] } | null;
  statuses?: BackOfficeStatusValue[];
  audit: { module: string; resourceType: string };
  canonicalOf?: string | null;
  notes?: string | null;
  visible?: boolean;
  search?: boolean;
  capabilities?: Partial<Record<ResourceActionKey, boolean | null>>;
}

export interface BackOfficeNavItem {
  section: string;
  label: string;
  description: string;
  icon: string;
  group: string;
  domain: string;
  moduleKey: string;
  moduleStatus: string;
  surface: string;
  component?: string;
  navPermission: string;
  permitted: boolean;
  canonicalOf?: string;
}

export interface BackOfficeNavigation {
  role: string;
  domains: Array<{ key: string; label: string; description: string; permitted: number; total: number }>;
  groups: Array<{ label: string; domain: string; items: BackOfficeNavItem[] }>;
  roadmap: Array<{ key: string; label: string; module: string; status: string; description: string }>;
  counts: { sections: number; visible: number; modules: number };
}

export interface BackOfficeContextPayload {
  frameworkVersion: string;
  role: string;
  legacyPermissions: string[];
  employee: { code: string; label: string | null; jobTitle: string | null; status: string; branch: string | null; department: string | null } | null;
  counts: { sections: number; visible: number; modules: number };
  domains: BackOfficeNavigation['domains'];
  roadmap: BackOfficeNavigation['roadmap'];
  session: { name: string; email: string };
}

export interface SearchHit {
  resource: string;
  label: string;
  id: string;
  title: string;
  secondary?: string | null;
  code?: string | null;
  href: string;
  section: string;
}

/** Un seul fetch partagé par toute la coquille (aucune requête par écran). */
const inflight = new Map<string, Promise<unknown>>();
function sharedFetch<T>(url: string): Promise<T> {
  const existing = inflight.get(url) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = adminApi<{ data: T }>(url).then((result) => result.data);
  inflight.set(url, promise);
  promise.catch(() => inflight.delete(url));
  return promise;
}

export function fetchNavigation(): Promise<BackOfficeNavigation> {
  return sharedFetch<BackOfficeNavigation>('/back-office/navigation');
}

export function fetchContext(): Promise<BackOfficeContextPayload> {
  return sharedFetch<BackOfficeContextPayload>('/back-office/context');
}

export function fetchResources(): Promise<{ frameworkVersion: string; resources: ResourceDescriptor[] }> {
  return sharedFetch<{ frameworkVersion: string; resources: ResourceDescriptor[] }>('/back-office/resources');
}

/** Capacités d'une ressource — l'UI s'en sert pour désactiver avec motif, pas pour deviner. */
export function fetchResourceCapabilities(key: string): Promise<ResourceDescriptor> {
  return adminApi<{ data: ResourceDescriptor }>(`/back-office/resources/${encodeURIComponent(key)}`).then((result) => result.data);
}

export function runGlobalSearch(query: string): Promise<{ query: string; hits: SearchHit[]; sources: Array<{ resource: string; label: string; count: number; skipped?: string }> }> {
  return adminApi<{ data: any }>(`/back-office/search?q=${encodeURIComponent(query)}`).then((result) => result.data);
}

interface BackOfficeStore {
  context: BackOfficeContextPayload | null;
  navigation: BackOfficeNavigation | null;
  resources: ResourceDescriptor[];
  loading: boolean;
  error: string;
  retry: () => void;
  descriptorFor: (section: string) => ResourceDescriptor | undefined;
  /** Capacités par action d'une section (null = le framework ne décide pas, l'écran garde sa règle). */
  capabilitiesFor: (section: string) => Partial<Record<ResourceActionKey, boolean | null>> | undefined;
  /** Charge la matrice d'une ressource au premier usage — une requête, puis le cache module. */
  loadCapabilities: (section: string) => Promise<void>;
}

/** Actions que le framework sait gate — miroir de `RESOURCE_ACTIONS` côté serveur. */
export const RESOURCE_ACTIONS = ['list', 'view', 'create', 'edit', 'delete', 'approve', 'export', 'assign'] as const;
export const RESOURCE_ACTION_LABELS: Record<string, string> = {
  list: 'Consulter', view: 'Voir le détail', create: 'Créer', edit: 'Modifier', delete: 'Archiver',
  approve: 'Approuver', export: 'Exporter', assign: 'Assigner',
};

const BackOfficeContext = createContext<BackOfficeStore | null>(null);

/**
 * Deep link de section. `?section=…` reste la forme écrite par l'application ; la forme
 * `/admin/<section>` est acceptée en lecture (liens sortants, e-mails, favoris anciens) : elle
 * n'ajoute aucune route, elle ne fait qu'initialiser la même variable d'écran. La validation
 * « cette section est-elle permise ? » reste faite par la navigation serveur, pas ici.
 */
export function sectionFromAdminPath(pathname: string): string | null {
  const match = /^\/admin\/([a-z0-9][a-z0-9-]{0,40})$/.exec(pathname || '');
  return match ? match[1] : null;
}

export const BACK_OFFICE_FRAMEWORK_VERSION = 'p2.0';

/**
 * Cache volontairement module-level : la matrice d'une ressource est la même pour tous les
 * composants d'un écran (liste, entête, palette), et ne doit pas être redemandée par chacun.
 * Elle est invalidée à la déconnexion par `resetBackOfficeCache()` — jamais pendant la session.
 */
const capabilitiesBySection = new Map<string, ResourceDescriptor>();

export function resetBackOfficeCache() {
  capabilitiesBySection.clear();
  inflight.clear();
}

export function BackOfficeProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<BackOfficeContextPayload | null>(null);
  const [navigation, setNavigation] = useState<BackOfficeNavigation | null>(null);
  const [resources, setResources] = useState<ResourceDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([fetchContext(), fetchNavigation(), fetchResources()])
      .then(([nextContext, nextNavigation, nextResources]) => {
        if (!active) return;
        setContext(nextContext);
        setNavigation(nextNavigation);
        setResources(nextResources.resources ?? []);
        for (const descriptor of nextResources.resources ?? []) {
          if (!capabilitiesBySection.has(descriptor.section)) capabilitiesBySection.set(descriptor.section, descriptor);
        }
      })
      .catch((reason: any) => { if (active) setError(reason?.message || 'Framework indisponible'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  const loadCapabilities = useCallback(async (section: string) => {
    const cached = capabilitiesBySection.get(section);
    if (cached?.permissions && Object.keys(cached.capabilities ?? {}).length) return;
    try {
      const loaded = await fetchResourceCapabilities(section);
      capabilitiesBySection.set(section, { ...cached, ...loaded });
      setTick((value) => value + 1);
    } catch {
      // Une matrice indisponible ne doit jamais casser un écran : l'UI retombe sur sa règle legacy.
    }
  }, []);

  const store: BackOfficeStore = {
    context,
    navigation,
    resources,
    loading,
    error,
    retry,
    descriptorFor: (section) => {
      const base = resources.find((descriptor) => descriptor.section === section || (descriptor.aliases ?? []).includes(section));
      const cached = capabilitiesBySection.get(section);
      return cached ? { ...base, ...cached } : base;
    },
    capabilitiesFor: (section) => (tick >= 0 ? capabilitiesBySection.get(section)?.capabilities : undefined),
    loadCapabilities,
  };
  return createElement(BackOfficeContext.Provider, { value: store }, children);
}

export function useBackOffice(): BackOfficeStore {
  const store = useContext(BackOfficeContext);
  if (!store) throw new Error('useBackOffice doit être appelé dans <BackOfficeProvider>.');
  return store;
}
