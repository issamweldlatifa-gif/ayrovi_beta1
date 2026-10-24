/**
 * ATTRIBUTS DE LA MATRICE — données, pas code (24/10/2026).
 *
 * Planche de référence : `docs/design/bigcard/families-attributes-24-10.png`.
 * Chaque attribut déclare **à quelles familles il s'applique** (slugs des
 * racines d'arbre : `femme`, `chaussures`, `electronique`…). C'est ce lien qui
 * fait qu'un produit de la famille « أحذية » voit « ارتفاع الكعب » et **pas**
 * « الذاكرة » — sans une ligne de code par famille.
 *
 * Même règle que les catégories : installation **explicite** depuis le
 * back-office, idempotente, sans jamais réécrire un attribut existant (le
 * propriétaire peut renommer, changer les options ou vider la portée : on ne
 * repasse pas derrière lui).
 */
import type { QatafoDatabase } from '../db/database';
import { createAttribute } from './attributes';
import type { CatalogueActor } from './audit';
import type { ErpAuditContextInput } from '../erp-core/audit';

export interface AttributeSeed {
  key: string;
  label: string;
  dataType: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT';
  /** `product` = décrit le produit ; `variant` = varie par variante. */
  target: 'product' | 'variant';
  options?: string[];
  /** Slugs de familles (racines). Vide = toutes. */
  families: string[];
  /** Section d'affichage de la fiche. */
  section: string;
  sortOrder: number;
}

/** Les 21 attributs de la matrice, dans l'ordre des sections de la planche. */
export const ATTRIBUTE_MATRIX: AttributeSeed[] = [
  // ── الخامة والعناية (ملابس · أحذية) ──
  { key: 'material', label: 'الخامة', dataType: 'TEXT', target: 'product', families: ['femme', 'homme', 'enfants', 'chaussures', 'maison'], section: 'matiere', sortOrder: 10 },
  { key: 'composition', label: 'التركيبة', dataType: 'TEXT', target: 'product', families: ['femme', 'homme', 'enfants'], section: 'matiere', sortOrder: 11 },
  { key: 'care', label: 'العناية', dataType: 'TEXT', target: 'product', families: ['femme', 'homme', 'enfants'], section: 'matiere', sortOrder: 12 },
  { key: 'size_chart', label: 'جدول القياسات', dataType: 'TEXT', target: 'product', families: ['femme', 'homme', 'enfants', 'chaussures', 'essentiels'], section: 'matiere', sortOrder: 13 },
  // ── المقاس والقيس ──
  { key: 'heel_height', label: 'ارتفاع الكعب (سم)', dataType: 'NUMBER', target: 'product', families: ['chaussures'], section: 'mesures', sortOrder: 20 },
  { key: 'shoe_width', label: 'عرض القدم', dataType: 'SELECT', target: 'product', options: ['ضيّق', 'عادي', 'عريض'], families: ['chaussures'], section: 'mesures', sortOrder: 21 },
  // ── الخواص التقنية ──
  { key: 'memory_storage', label: 'الذاكرة', dataType: 'SELECT', target: 'product', options: ['64 Go', '128 Go', '256 Go', '512 Go', '1 To'], families: ['electronique'], section: 'technique', sortOrder: 30 },
  { key: 'display', label: 'الشاشة', dataType: 'TEXT', target: 'product', families: ['electronique'], section: 'technique', sortOrder: 31 },
  { key: 'processor', label: 'المعالج', dataType: 'TEXT', target: 'product', families: ['electronique'], section: 'technique', sortOrder: 32 },
  { key: 'battery', label: 'البطّارية', dataType: 'TEXT', target: 'product', families: ['electronique'], section: 'technique', sortOrder: 33 },
  { key: 'network_os', label: 'الشبكة والنظام', dataType: 'TEXT', target: 'product', families: ['electronique'], section: 'technique', sortOrder: 34 },
  { key: 'power_capacity', label: 'القدرة', dataType: 'SELECT', target: 'product', options: ['500 W', '800 W', '1200 W', '2000 W'], families: ['maison'], section: 'pratique', sortOrder: 40 },
  // ── المنزل ──
  { key: 'dimensions', label: 'الأبعاد', dataType: 'TEXT', target: 'product', families: ['maison'], section: 'pratique', sortOrder: 41 },
  { key: 'assembly', label: 'التركيب', dataType: 'SELECT', target: 'product', options: ['جاهز', 'يتطلّب تركيباً'], families: ['maison'], section: 'pratique', sortOrder: 42 },
  { key: 'style', label: 'الستايل', dataType: 'TEXT', target: 'product', families: ['femme', 'homme', 'maison'], section: 'identite', sortOrder: 43 },
  // ── الجمال والعناية ──
  { key: 'ingredients', label: 'المكوّنات', dataType: 'TEXT', target: 'product', families: ['beaute'], section: 'beaute', sortOrder: 50 },
  { key: 'skin_type', label: 'نوع البشرة', dataType: 'SELECT', target: 'product', options: ['دهنية', 'جافة', 'مختلطة', 'حسّاسة'], families: ['beaute'], section: 'beaute', sortOrder: 51 },
  { key: 'pao', label: 'PAO (شهر بعد الفتح)', dataType: 'TEXT', target: 'product', families: ['beaute'], section: 'beaute', sortOrder: 52 },
  { key: 'free_from', label: 'خالي من', dataType: 'TEXT', target: 'product', families: ['beaute'], section: 'beaute', sortOrder: 53 },
  // ── المستلزمات ──
  { key: 'package_size', label: 'العدد في العلبة', dataType: 'SELECT', target: 'product', options: ['1', '3', '6'], families: ['essentiels'], section: 'pratique', sortOrder: 60 },
  // ── الضمان ──
  { key: 'warranty', label: 'الضمان', dataType: 'TEXT', target: 'product', families: ['electronique', 'maison'], section: 'pratique', sortOrder: 70 },
];

export interface AttributeSeedReport {
  inserted: number;
  skipped: number;
  failed: Array<{ key: string; code: string }>;
  total: number;
}

export interface AttributeSeedOptions {
  actor: CatalogueActor;
  context?: ErpAuditContextInput | null;
}

/**
 * Installe la matrice. Idempotent par `attribute_key` : un attribut déjà déclaré
 * n'est ni renommé, ni re-typé, ni déplacé.
 */
export function seedAttributeMatrix(db: QatafoDatabase, options: AttributeSeedOptions): AttributeSeedReport {
  let inserted = 0;
  let skipped = 0;
  const failed: Array<{ key: string; code: string }> = [];

  for (const entry of ATTRIBUTE_MATRIX) {
    const existing = db.get<{ id: string }>('SELECT id FROM catalogue_attributes WHERE attribute_key=?', entry.key);
    if (existing) { skipped += 1; continue; }
    const created = createAttribute(db, {
      attribute_key: entry.key,
      label: entry.label,
      data_type: entry.dataType,
      target: entry.target,
      options: entry.options ?? [],
      families: entry.families,
      section: entry.section,
      sort_order: entry.sortOrder,
    }, options.actor);
    if (!created.ok) { failed.push({ key: entry.key, code: String(created.code) }); continue; }
    inserted += 1;
  }

  return { inserted, skipped, failed, total: ATTRIBUTE_MATRIX.length };
}
