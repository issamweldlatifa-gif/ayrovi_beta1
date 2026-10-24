/**
 * CATÉGORIES INTERNATIONALES — données, pas code (24/10/2026).
 *
 * Le propriétaire l'a demandé deux fois : « les catégories connues au niveau
 * international », et « jamais un développeur pour ajouter une catégorie ».
 * L'arbre vit donc ici comme **données** et s'installe par une action explicite
 * du back-office — pas au démarrage.
 *
 * ── Pourquoi pas au boot ────────────────────────────────────────────────────
 * `bootstrap.ts` le dit déjà : « Grants are data; a boot never fabricates
 * catalogue content ». Un démarrage qui plante des catégories remplirait la base
 * d'un client qui n'a rien demandé, et rendrait impossible de distinguer « ces
 * catégories viennent du produit » de « ce sont les miennes ».
 *
 * ── Règles ──────────────────────────────────────────────────────────────────
 *  • **idempotent** : un slug déjà présent n'est ni dupliqué, ni renommé, ni
 *    déplacé — on ne réécrit jamais une donnée que quelqu'un a modifiée ;
 *  • **aucune suppression** : l'installation n'enlève rien à personne ;
 *  • la famille d'un produit = la **racine** de l'arbre (voir
 *    `rootCategoryOf` dans `src/public/routes.ts`) : c'est cette liste qui la
 *    définit, pas une constante du code d'affichage.
 */
import type { QatafoDatabase } from '../db/database';
import { createCategory, type CatalogueCategoryRow } from './categories';
import type { CatalogueActor } from './audit';
import type { ErpAuditContextInput } from '../erp-core/audit';

export interface SeedNode {
  name: string;
  slug: string;
  children?: SeedNode[];
}

/** Arbre de référence : 9 familles, les rayons qu'un client reconnaît partout. */
export const INTERNATIONAL_CATEGORIES: SeedNode[] = [
  {
    name: 'ملابس نساء', slug: 'femme',
    children: [
      { name: 'جاكيتات ومعاطف', slug: 'femme-vestes' },
      { name: 'فساتين', slug: 'femme-robes' },
      { name: 'بلوزات وقمصان', slug: 'femme-hauts' },
      { name: 'سراويل', slug: 'femme-pantalons' },
      { name: 'تنانير', slug: 'femme-jupes' },
      { name: 'تريكو', slug: 'femme-maille' },
    ],
  },
  {
    name: 'ملابس رجال', slug: 'homme',
    children: [
      { name: 'جاكيتات ومعاطف', slug: 'homme-vestes' },
      { name: 'قمصان', slug: 'homme-chemises' },
      { name: 'سراويل', slug: 'homme-pantalons' },
      { name: 'تريكو', slug: 'homme-maille' },
      { name: 'بدلات', slug: 'homme-costumes' },
    ],
  },
  {
    name: 'ملابس أطفال', slug: 'enfants',
    children: [
      { name: 'ملابس أولاد', slug: 'enfants-garcons' },
      { name: 'ملابس بنات', slug: 'enfants-filles' },
      { name: 'أحذية أطفال', slug: 'enfants-chaussures' },
    ],
  },
  {
    name: 'أحذية', slug: 'chaussures',
    children: [
      { name: 'أحذية نساء', slug: 'chaussures-femme' },
      { name: 'أحذية رجال', slug: 'chaussures-homme' },
      { name: 'رياضية', slug: 'chaussures-sport' },
      { name: 'صيفية', slug: 'chaussures-ete' },
    ],
  },
  {
    name: 'حقائب وإكسسوارات', slug: 'accessoires',
    children: [
      { name: 'حقائب', slug: 'accessoires-sacs' },
      { name: 'أحزمة', slug: 'accessoires-ceintures' },
      { name: 'محافظ', slug: 'accessoires-portefeuilles' },
      { name: 'نظارات', slug: 'accessoires-lunettes' },
      { name: 'مجوهرات', slug: 'accessoires-bijoux' },
      { name: 'ساعات', slug: 'accessoires-montres' },
    ],
  },
  {
    name: 'جمال وعناية', slug: 'beaute',
    children: [
      { name: 'عطور', slug: 'beaute-parfums' },
      { name: 'مكياج', slug: 'beaute-maquillage' },
      { name: 'عناية بالبشرة', slug: 'beaute-soin-visage' },
      { name: 'عناية بالشعر', slug: 'beaute-cheveux' },
    ],
  },
  {
    name: 'إلكترونيك', slug: 'electronique',
    children: [
      { name: 'هواتف', slug: 'electronique-telephones' },
      { name: 'حواسيب', slug: 'electronique-ordinateurs' },
      { name: 'سماعات وصوت', slug: 'electronique-audio' },
      { name: 'أجهزة لوحية', slug: 'electronique-tablettes' },
      { name: 'ساعات ذكية', slug: 'electronique-montres' },
      { name: 'كاميرات', slug: 'electronique-cameras' },
    ],
  },
  {
    name: 'منزل وديكور', slug: 'maison',
    children: [
      { name: 'أثاث', slug: 'maison-meubles' },
      { name: 'مطبخ', slug: 'maison-cuisine' },
      { name: 'إضاءة', slug: 'maison-luminaire' },
      { name: 'أغطية وسرير', slug: 'maison-linge' },
      { name: 'ديكور', slug: 'maison-decoration' },
    ],
  },
  {
    name: 'مستلزمات', slug: 'essentiels',
    children: [
      { name: 'عناية شخصية', slug: 'essentiels-soin' },
      { name: 'تنظيف', slug: 'essentiels-entretien' },
      { name: 'منظمات', slug: 'essentiels-rangement' },
    ],
  },
];

export interface SeedReport {
  inserted: number;
  /** Déjà présents : on n'y touche pas (ni nom, ni parent, ni ordre). */
  skipped: number;
  /** Refus explicites (slug invalide, conflit) — jamais silencieux. */
  failed: Array<{ slug: string; code: string }>;
  /** Nombre total de nœuds dans l'arbre de référence. */
  total: number;
}

export interface SeedOptions {
  actor: CatalogueActor;
  context?: ErpAuditContextInput | null;
}

function countNodes(nodes: SeedNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children ?? []), 0);
}

/**
 * Installe l'arbre. Une seule passe, profondeur d'abord : un enfant n'est créé
 * qu'une fois son parent connu (la clé étrangère l'exige).
 */
export function seedInternationalCategories(db: QatafoDatabase, options: SeedOptions): SeedReport {
  let inserted = 0;
  let skipped = 0;
  const failed: Array<{ slug: string; code: string }> = [];

  const walk = (nodes: SeedNode[], parentId: string | null): void => {
    for (const node of nodes) {
      const existing = db.get<{ id: string }>('SELECT id FROM catalogue_categories WHERE slug=?', node.slug);
      let id = existing?.id ?? null;
      if (id) {
        skipped += 1;
      } else {
        const created = createCategory(
          db,
          { name: node.name, slug: node.slug, parent_id: parentId },
          { actor: options.actor, context: options.context ?? null },
        );
        if (!created.ok) {
          failed.push({ slug: node.slug, code: String(created.code) });
          // Un parent refusé rend ses enfants impossibles : on ne les invente pas.
          continue;
        }
        id = (created.value as CatalogueCategoryRow).id;
        inserted += 1;
      }
      if (node.children?.length) walk(node.children, id);
    }
  };

  walk(INTERNATIONAL_CATEGORIES, null);
  return { inserted, skipped, failed, total: countNodes(INTERNATIONAL_CATEGORIES) };
}
