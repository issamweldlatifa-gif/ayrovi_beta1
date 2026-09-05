/**
 * AYROVI Back Office (P2.0) — navigation dérivée, pas recopiée.
 *
 * La barre latérale était une liste de 37 entrées écrite à la main dans le client, avec ses
 * permissions dupliquées. Ici, la navigation est CALCULÉE à partir de trois systèmes qui
 * existent déjà :
 *   1. le registre des ressources (`src/back-office/resources.ts`) → quelles entrées existent,
 *      dans quel groupe, dans quel ordre, avec quel libellé ;
 *   2. le registre de modules ERP (`src/erp-core/modules.ts`) → le statut d'un module
 *      (`active` | `legacy` | `planned`) ;
 *   3. le moteur d'autorisation (`hasPermission` legacy, puis `can()` ERP) → ce que le rôle
 *      appelant peut voir.
 *
 * Aucune liste de modules n'est donc maintenue à la main côté client, et un module `planned`
 * n'apparaît jamais comme une entrée cliquable : il est exposé dans `roadmap`, marqué « à venir ».
 */
import type { QatafoDatabase } from '../db/database';
import type { AdminPermission, AdminRole } from '../admin/permissions';
import { hasPermission } from '../admin/permissions';
import { can } from '../erp-core/permissions';
import { ERP_MODULES } from '../erp-core/modules';
import { BACK_OFFICE_DOMAINS, BACK_OFFICE_GROUP_ORDER, resourceDescriptors, type BackOfficeDomain } from './resources';

export interface BackOfficeNavItem {
  section: string;
  label: string;
  description: string;
  icon: string;
  group: string;
  domain: BackOfficeDomain;
  moduleKey: string;
  /** 'active' | 'legacy' | 'planned' — vient du registre ERP, jamais inventé. */
  moduleStatus: string;
  /** L'écran est rendu par le moteur de ressources ou par son composant existant. */
  surface: string;
  component?: string;
  /** Ce qui gouverne la visibilité aujourd'hui (parité stricte avec l'existant). */
  navPermission: string;
  permitted: boolean;
  /** Ressource canonique quand cette entrée est une ancienne surface. */
  canonicalOf?: string;
}

export interface BackOfficeGroup {
  label: string;
  domain: BackOfficeDomain;
  items: BackOfficeNavItem[];
}

export interface BackOfficeNavigation {
  role: string;
  domains: Array<{ key: BackOfficeDomain; label: string; description: string; permitted: number; total: number }>;
  groups: BackOfficeGroup[];
  roadmap: Array<{ key: string; label: string; module: string; status: string; description: string }>;
  counts: { sections: number; visible: number; modules: number };
}

function splitPermission(permission: string): { module: string; action: string } {
  const [moduleKey = '', action = ''] = String(permission).split(':');
  return { module: moduleKey, action };
}

/** Visibilité d'une entrée = permission legacy de la navigation, enrichie du moteur ERP. */
export function canSeeSection(db: QatafoDatabase, role: AdminRole | string | null | undefined, item: { navPermission: string; module: string; permissionModule?: string }): boolean {
  if (!role) return false;
  const { module: permissionModule, action } = splitPermission(item.navPermission);
  if (hasPermission(role as AdminRole, item.navPermission as AdminPermission)) return true;
  // Un rôle peut n'avoir que le grant ERP (pas la chaîne legacy) : la navigation le suit,
  // sans jamais rien verrouiller de plus que ce que la route appliquera.
  const decision = can(db, role, { module: item.permissionModule ?? permissionModule, action, resourceType: null });
  return decision.allowed;
}

/** Payload complet de navigation pour un rôle donné (mis en cache par rôle pendant 30 s). */
export function backOfficeNavigation(db: QatafoDatabase, role: AdminRole | string | null | undefined): BackOfficeNavigation {
  const descriptors = resourceDescriptors();
  const items: BackOfficeNavItem[] = [];
  for (const descriptor of descriptors) {
    if (!descriptor.nav) continue;
    items.push({
      section: descriptor.section,
      label: descriptor.label,
      description: descriptor.description,
      icon: descriptor.nav.icon,
      group: descriptor.nav.group,
      domain: descriptor.domain,
      moduleKey: descriptor.module,
      moduleStatus: ERP_MODULES.find((module) => module.key === descriptor.module)?.status ?? 'legacy',
      surface: descriptor.surface,
      ...(descriptor.component ? { component: descriptor.component } : {}),
      navPermission: descriptor.navPermission,
      permitted: canSeeSection(db, role, { navPermission: descriptor.navPermission, module: descriptor.module, permissionModule: descriptor.permissionModule }),
      ...(descriptor.canonicalOf ? { canonicalOf: descriptor.canonicalOf } : {}),
    });
  }

  const groups: BackOfficeGroup[] = BACK_OFFICE_GROUP_ORDER.map((label) => {
    const inGroup = items.filter((item) => item.group === label).sort((a, b) => {
      const order = (item: BackOfficeNavItem) => {
        const descriptor = descriptors.find((candidate) => candidate.section === item.section);
        return descriptor?.nav?.order ?? 9999;
      };
      return order(a) - order(b);
    });
    return { label, domain: inGroup[0]?.domain ?? 'ERP', items: inGroup };
  });

  const visibleGroups = groups.map((group) => ({ ...group, items: group.items.filter((item) => item.permitted) })).filter((group) => group.items.length > 0);

  const modulesWithScreens = new Set(descriptors.map((descriptor) => descriptor.module));
  const roadmap = ERP_MODULES
    .filter((module) => module.status === 'planned' && !modulesWithScreens.has(module.key))
    .map((module) => ({ key: module.key, label: module.label, module: module.key, status: module.status, description: module.description ?? '' }));

  const domains = BACK_OFFICE_DOMAINS.map((domain) => {
    const scoped = items.filter((item) => item.domain === domain.key);
    return { key: domain.key, label: domain.label, description: domain.description, permitted: scoped.filter((item) => item.permitted).length, total: scoped.length };
  }).filter((domain) => domain.total > 0);

  return {
    role: String(role ?? 'ANONYMOUS'),
    domains,
    groups: visibleGroups,
    roadmap,
    counts: { sections: items.length, visible: items.filter((item) => item.permitted).length, modules: ERP_MODULES.length },
  };
}

/** Toutes les sections atteignables (nav + alias + hors nav) — la liste qui protège les deep links. */
export function backOfficeSections(): string[] {
  return resourceDescriptors().flatMap((descriptor) => [descriptor.section, ...(descriptor.aliases ?? [])]);
}
