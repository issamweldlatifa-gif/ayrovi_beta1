/**
 * AYROVI Back Office (P2.0) — recherche globale.
 *
 * Une seule abstraction pour « retrouver un enregistrement » dans tout le back office, au lieu
 * d'un champ de recherche par écran. Contraintes volontaires :
 *  • LECTURE SEULE : aucun écrit, aucune mutation, aucun bouton dans ce module.
 *  • Pas de seconde autorisation : une source n'est interrogée que si le rôle appelant a déjà
 *    le droit d'ouvrir l'écran correspondant (`hasPermission` legacy, sinon grant ERP).
 *  • Colonnes figées par source (allowlist) : la requête ne peut jamais citer une colonne
 *    arbitraire, et le terme est passé en paramètre lié — aucun LIKE injecté.
 *  • Coût borné : 5 lignes par source, 8 sources, un seul `COUNT` jamais — donc une dizaine de
 *    requêtes indexées au pire, annulables.
 *  • Traçabilité : la recherche est une LECTURE de données contenant du personnel client ; elle
 *    produit une ligne d'audit `ACCESS` via le rédacteur unique (aucun nouveau rédacteur).
 */
import type { QatafoDatabase } from '../db/database';
import type { AdminPermission, AdminRole } from '../admin/permissions';
import { hasPermission } from '../admin/permissions';
import { can } from '../erp-core/permissions';

export interface SearchSource {
  /** Clé de ressource du framework (sert aussi de regroupement de résultats). */
  resource: string;
  label: string;
  table: string;
  /** Colonne affichée en titre + colonne secondaire. */
  title: string;
  secondary?: string;
  /** Allowlist de colonnes testées avec LIKE — jamais une colonne venue de la requête. */
  searchColumns: string[];
  /** Where fixe (ex. ne jamais chercher dans les lignes archivées ? ici on les montre, datées). */
  orderBy: string;
  /** Section `?section=` à ouvrir, et paramètre de deep link vers l'enregistrement. */
  section: string;
  idParam: string;
  /** Ce qui gouverne l'accès : la permission de LECTURE de l'écran, pas une chaîne inventée. */
  permission: AdminPermission;
  /** Grant ERP équivalent, quand il existe (le moteur tranche en dernier). */
  erp?: { module: string; action: string };
  codeColumn?: string;
}

export const SEARCH_SOURCES: readonly SearchSource[] = [
  { resource: 'cms.products', label: 'Produits', table: 'products', title: 'name', secondary: 'brand_name', searchColumns: ['name', 'description', 'brand_name', 'category'], orderBy: 'updated_at DESC', section: 'products', idParam: 'id', permission: 'content:read', erp: { module: 'cms', action: 'read' } },
  { resource: 'cms.brands', label: 'Marques', table: 'brands', title: 'name', secondary: 'category', searchColumns: ['name', 'description', 'category'], orderBy: 'display_order ASC', section: 'brands', idParam: 'id', permission: 'content:read', erp: { module: 'cms', action: 'read' } },
  { resource: 'cms.news', label: 'مجلتي (articles)', table: 'news_items', title: 'title', secondary: 'category', searchColumns: ['title', 'summary', 'author'], orderBy: 'published_at DESC', section: 'news', idParam: 'id', permission: 'content:read', erp: { module: 'cms', action: 'read' } },
  { resource: 'cms.arrivals', label: 'Arrivages (vitrine)', table: 'arrivals', title: 'name', secondary: 'status', searchColumns: ['name', 'description', 'badge'], orderBy: 'expected_arrival_at DESC', section: 'arrivals', idParam: 'id', permission: 'content:read', erp: { module: 'cms', action: 'read' } },
  // `orders` ne porte pas de nom de client : la recherche se fait sur la référence, le téléphone
  // et l'e-mail de livraison (colonnes réellement présentes, vérifiées sur PRAGMA table_info).
  { resource: 'sales.order', label: 'Commandes', table: 'orders', title: 'order_number', secondary: 'status', codeColumn: 'invoice_number', searchColumns: ['order_number', 'phone', 'contact_email', 'tracking_code', 'invoice_number'], orderBy: 'created_at DESC', section: 'orders', idParam: 'order', permission: 'commerce:read', erp: { module: 'sales', action: 'read' } },
  { resource: 'crm.party', label: 'Clients', table: 'customers', title: 'name', secondary: 'governorate', codeColumn: 'phone', searchColumns: ['name', 'phone', 'normalized_phone', 'address'], orderBy: 'updated_at DESC', section: 'customers', idParam: 'id', permission: 'commerce:read', erp: { module: 'sales', action: 'read' } },
  { resource: 'crm.arrival', label: 'Arrivages CRM', table: 'crm_arrivals', title: 'name', secondary: 'status', searchColumns: ['name'], orderBy: 'created_at DESC', section: 'arrival-ingestion', idParam: 'arrival', permission: 'commerce:read' },
  { resource: 'core.employee', label: 'Employés', table: 'erp_employees', title: 'employee_code', secondary: 'job_title', searchColumns: ['employee_code', 'first_name', 'last_name', 'job_title'], orderBy: 'employee_code ASC', section: 'erp-employees', idParam: 'id', permission: 'users:write' },
] as const;

export interface SearchHit {
  resource: string;
  label: string;
  id: string;
  title: string;
  secondary?: string | null;
  code?: string | null;
  /** Deep link existant, uniquement enrichi du paramètre d'enregistrement. */
  href: string;
  section: string;
}

const MAX_PER_SOURCE = 5;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;

export function canSearchSource(db: QatafoDatabase, role: AdminRole | string | null | undefined, source: SearchSource): boolean {
  if (!role) return false;
  if (hasPermission(role as AdminRole, source.permission)) return true;
  if (!source.erp) return false;
  return can(db, role, { module: source.erp.module, action: source.erp.action, resourceType: null }).allowed;
}

function columnIsSafe(source: SearchSource, column: string): boolean {
  return source.searchColumns.includes(column);
}

/**
 * Une recherche, toutes sources autorisées. Les colonnes de chaque source sont vérifiées
 * contre l'allowlist locale (défense en profondeur si un appelant interne les filtrait) :
 * jamais une valeur de requête n'atteint le SQL autrement qu'en paramètre lié.
 */
export function globalSearch(db: QatafoDatabase, role: AdminRole | string | null | undefined, rawQuery: unknown): { query: string; hits: SearchHit[]; sources: Array<{ resource: string; label: string; count: number; skipped?: string }> } {
  const query = String(rawQuery ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);
  const sources: Array<{ resource: string; label: string; count: number; skipped?: string }> = [];
  const hits: SearchHit[] = [];
  if (query.length < MIN_QUERY_LENGTH) return { query, hits, sources };

  const like = `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  for (const source of SEARCH_SOURCES) {
    if (!canSearchSource(db, role, source)) {
      sources.push({ resource: source.resource, label: source.label, count: 0, skipped: 'permission' });
      continue;
    }
    const columns = source.searchColumns.filter((column) => columnIsSafe(source, column));
    if (!columns.length) {
      sources.push({ resource: source.resource, label: source.label, count: 0, skipped: 'no-searchable-column' });
      continue;
    }
    const selected = [source.title, source.secondary, source.codeColumn, 'id']
      .filter((column, index, all): column is string => Boolean(column) && all.indexOf(column) === index);
    const where = columns.map((column) => `"${column}" LIKE ? ESCAPE '\\'`).join(' OR ');
    const rows = db.all<Record<string, unknown>>(
      `SELECT ${selected.map((column) => `"${source.table}"."${column}" AS "${column}"`).join(', ')} FROM "${source.table}" WHERE ${where} ORDER BY ${source.orderBy} LIMIT ?`,
      ...columns.map(() => like), MAX_PER_SOURCE);
    for (const row of rows) {
      hits.push({
        resource: source.resource,
        label: source.label,
        id: String(row.id ?? ''),
        title: String(row[source.title] ?? '—'),
        ...(source.secondary ? { secondary: row[source.secondary] == null ? null : String(row[source.secondary]) } : {}),
        ...(source.codeColumn ? { code: row[source.codeColumn] == null ? null : String(row[source.codeColumn]) } : {}),
        href: `/admin?section=${source.section}&${source.idParam}=${encodeURIComponent(String(row.id ?? ''))}`,
        section: source.section,
      });
    }
    sources.push({ resource: source.resource, label: source.label, count: rows.length });
  }
  return { query, hits, sources };
}
