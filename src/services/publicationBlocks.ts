/**
 * Blocs de la page Publication (modèles pilotés par le CRM, 13/11/2026).
 * Contrat et règles : `shared/publicationBlocks.ts`.
 *
 *  • Aucune copie produit : le bloc ne stocke que des identifiants ; nom, marque,
 *    photo, prix et stock sont lus dans le catalogue au moment de la lecture.
 *  • Un produit devenu non vendable disparaît de la rangée ; un bloc qui n'a
 *    plus assez de produits n'est pas renvoyé (jamais de carte vide).
 *  • Lecture publique en DEUX requêtes, quel que soit le nombre de blocs.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { normalizeMediaLink } from '../../shared/mediaLinks';
import {
  containerPanelColor,
  isRenderablePublicationBlock,
  normalizePublicationBlockInput,
  PUBLICATION_BLOCK_LIMITS,
  PUBLICATION_PUBLISHER_NAME,
  type PublicationBlockInput,
  type PublicationBlockKind,
  type PublicationBlockProduct,
  type PublicationBlockPublic,
  type PublicationBlockValidation,
} from '../../shared/publicationBlocks';
import { isSellableProduct, STOREFRONT_CURRENCY } from './shoppableContent';

type Store = Pick<QatafoDatabase, 'get' | 'all' | 'run'>;

export const PUBLICATION_BLOCKS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS publication_blocks (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('container','media','sponsored_pair')),
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    bg_color TEXT NOT NULL DEFAULT '#FFFFFF',
    panel_color TEXT NOT NULL DEFAULT '',
    sponsored INTEGER NOT NULL DEFAULT 0,
    media_type TEXT NOT NULL DEFAULT '' CHECK(media_type IN ('','image','video')),
    media_url TEXT NOT NULL DEFAULT '',
    poster_url TEXT NOT NULL DEFAULT '',
    product_ids TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_publication_blocks_order ON publication_blocks(active, sort_order, id);
`;

export interface PublicationBlockRow {
  id: string;
  kind: PublicationBlockKind;
  title: string;
  subtitle: string;
  bg_color: string;
  panel_color: string;
  sponsored: number;
  media_type: '' | 'image' | 'video';
  media_url: string;
  poster_url: string;
  product_ids: string;
  sort_order: number;
  active: number;
  created_at: string;
  updated_at: string;
}

/** Forme renvoyée au CRM : booléens et liste d'identifiants déjà décodés. */
export interface PublicationBlockAdmin extends Omit<PublicationBlockRow, 'sponsored' | 'active' | 'product_ids'> {
  sponsored: boolean;
  active: boolean;
  product_ids: string[];
}

export function parseProductIds(raw: unknown): string[] {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
  } catch {
    return [];
  }
}

export function toAdminBlock(row: PublicationBlockRow): PublicationBlockAdmin {
  return { ...row, sponsored: !!row.sponsored, active: !!row.active, product_ids: parseProductIds(row.product_ids) };
}

const checkLink = (value: unknown, kind: 'image' | 'video') => {
  const result = normalizeMediaLink(value, kind);
  if (result.ok === false) return { ok: false as const, error: result.error };
  return { ok: true as const, url: result.url };
};

/**
 * Validation complète : forme (module partagé) + produits existants et vendables
 * (base). Un produit inconnu est refusé avec son identifiant, jamais ignoré en silence.
 */
export function validatePublicationBlock(
  db: Store,
  body: Record<string, unknown> | null | undefined,
  existing?: PublicationBlockAdmin,
): PublicationBlockValidation {
  const checked = normalizePublicationBlockInput(body, existing, checkLink);
  if (checked.ok === false) return checked;
  for (const id of checked.value.product_ids) {
    const product = db.get<any>('SELECT id,name,image,status,final_price FROM products WHERE id=?', id);
    if (!product) return { ok: false, error: `Produit introuvable : ${id}.` };
    if (!isSellableProduct(product)) return { ok: false, error: `Produit non vendable (inactif ou sans prix) : ${product.name}.` };
  }
  return checked;
}

export function listAdminBlocks(db: Store): PublicationBlockAdmin[] {
  return db.all<PublicationBlockRow>('SELECT * FROM publication_blocks ORDER BY sort_order, created_at, id').map(toAdminBlock);
}

export function readAdminBlock(db: Store, id: string): PublicationBlockAdmin | null {
  const row = db.get<PublicationBlockRow>('SELECT * FROM publication_blocks WHERE id=?', id);
  return row ? toAdminBlock(row) : null;
}

export function createBlock(db: Store, value: PublicationBlockInput, now = new Date().toISOString(), id = `pubblock_${randomUUID()}`): string {
  const last = db.get<{ n: number | null }>('SELECT MAX(sort_order) n FROM publication_blocks');
  const order = Number.isFinite(Number(last?.n)) && last?.n !== null ? Number(last!.n) + 1 : 0;
  db.run(
    `INSERT INTO publication_blocks (id,kind,title,subtitle,bg_color,panel_color,sponsored,media_type,media_url,poster_url,product_ids,sort_order,active,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, value.kind, value.title, value.subtitle, value.bg_color, value.panel_color, value.sponsored ? 1 : 0,
    value.media_type, value.media_url, value.poster_url, JSON.stringify(value.product_ids), order, value.active ? 1 : 0, now, now,
  );
  return id;
}

export function updateBlock(db: Store, id: string, value: PublicationBlockInput, now = new Date().toISOString()): void {
  db.run(
    `UPDATE publication_blocks SET kind=?,title=?,subtitle=?,bg_color=?,panel_color=?,sponsored=?,media_type=?,media_url=?,poster_url=?,product_ids=?,active=?,updated_at=? WHERE id=?`,
    value.kind, value.title, value.subtitle, value.bg_color, value.panel_color, value.sponsored ? 1 : 0,
    value.media_type, value.media_url, value.poster_url, JSON.stringify(value.product_ids), value.active ? 1 : 0, now, id,
  );
}

export function deleteBlock(db: Store, id: string): boolean {
  if (!db.get('SELECT 1 FROM publication_blocks WHERE id=?', id)) return false;
  db.run('DELETE FROM publication_blocks WHERE id=?', id);
  return true;
}

/**
 * Nouvel ordre : la liste doit contenir EXACTEMENT les blocs existants (aucun
 * oubli, aucun doublon, aucun inconnu) — sinon rien n'est écrit.
 */
export function reorderBlocks(db: Store, ids: unknown, now = new Date().toISOString()): { ok: true } | { ok: false; error: string } {
  const list = Array.isArray(ids) ? ids.map((id) => String(id)) : [];
  const existing = db.all<{ id: string }>('SELECT id FROM publication_blocks').map((row) => row.id);
  const unique = new Set(list);
  if (unique.size !== list.length || list.length !== existing.length || existing.some((id) => !unique.has(id))) {
    return { ok: false, error: 'Ordre invalide : la liste doit reprendre chaque bloc une seule fois.' };
  }
  list.forEach((id, index) => db.run('UPDATE publication_blocks SET sort_order=?,updated_at=? WHERE id=?', index, now, id));
  return { ok: true };
}

/* ── Lecture publique ─────────────────────────────────────────────────────── */

function publicProduct(row: Record<string, any> | undefined): PublicationBlockProduct | null {
  if (!row || !isSellableProduct(row as any)) return null;
  const stock = row.stock_status || 'AVAILABLE';
  return {
    id: row.id,
    name: row.name,
    brand: typeof row.brand_name === 'string' ? row.brand_name.trim() : '',
    image: row.image || '',
    price: Number(row.final_price),
    currency: STOREFRONT_CURRENCY,
    stockStatus: stock,
    available: stock !== 'OUT_OF_STOCK',
  };
}

export function readPublicBlocks(db: Store): PublicationBlockPublic[] {
  const rows = db.all<PublicationBlockRow>(
    'SELECT * FROM publication_blocks WHERE active=1 ORDER BY sort_order, created_at, id LIMIT ?',
    PUBLICATION_BLOCK_LIMITS.publicBlocks,
  );
  const wanted = [...new Set(rows.flatMap((row) => parseProductIds(row.product_ids)))];
  const products = new Map<string, Record<string, any>>();
  if (wanted.length > 0) {
    const found = db.all<any>(
      `SELECT id,name,brand_name,image,status,final_price,stock_status FROM products WHERE id IN (${wanted.map(() => '?').join(',')})`,
      ...wanted,
    );
    for (const product of found) products.set(product.id, product);
  }
  const blocks: PublicationBlockPublic[] = [];
  for (const row of rows) {
    const cards = parseProductIds(row.product_ids)
      .map((id) => publicProduct(products.get(id)))
      .filter((card): card is PublicationBlockProduct => card !== null);
    const block: PublicationBlockPublic = {
      id: row.id,
      kind: row.kind,
      title: row.title,
      subtitle: row.subtitle,
      bgColor: row.bg_color,
      panelColor: row.kind === 'container' ? row.panel_color || containerPanelColor(row.bg_color) : '',
      sponsored: !!row.sponsored,
      media: row.media_url && row.media_type ? { type: row.media_type, url: row.media_url, poster: row.poster_url || '' } : null,
      products: cards,
      publisher: { name: PUBLICATION_PUBLISHER_NAME },
    };
    if (isRenderablePublicationBlock(block)) blocks.push(block);
  }
  return blocks;
}

/* ── Contenu de démonstration ─────────────────────────────────────────────── */

const OFFICIAL = (key: string) => `product_official_${key}`;
const PHOTO = (file: string) => `/media/catalogue/official/${file}.jpg`;
/** Vidéos produit officielles fournies par le propriétaire (fichiers MP4 directs). */
export const OFFICIAL_VIDEOS = {
  nike: 'https://assets.nmp.nike.com/a/videos/6ad99ea4-fb65-4ee8-abfb-0662f8274c11/video.mp4',
  logitech: 'https://resource.logitech.com/q_auto,c_fill/content/dam/logitech/en/products/mice/mx-master-4/product-tour/mx-master-4-product-tour-hero-loop-video.mp4',
} as const;

/**
 * Démonstration (catalogue officiel du 12/11/2026) : douze blocs qui alternent
 * les trois modèles, chacun avec les produits qui lui correspondent. Vidéos :
 * les deux MP4 officiels (Nike, Logitech) et les deux clips du propriétaire qui
 * montrent des articles du catalogue (défilé, baskets).
 */
export const PUBLICATION_BLOCKS_DEMO: Array<Omit<PublicationBlockInput, 'active' | 'panel_color' | 'poster_url'> & {
  panel_color?: string;
  poster_url?: string;
  reel?: string;
}> = [
  {
    kind: 'media', title: 'Nike Dri-FIT', subtitle: 'L’entraînement commence ici : des hauts qui respirent avec vous.', bg_color: '#FFFFFF', sponsored: true,
    media_type: 'video', media_url: OFFICIAL_VIDEOS.nike, poster_url: PHOTO('nike-dri-fit-legend-1'),
    product_ids: [OFFICIAL('nike-dri-fit-legend'), OFFICIAL('puma-essentials-logo-tee'), OFFICIAL('adidas-essentials-hoodie'), OFFICIAL('uniqlo-airism-tee')],
  },
  {
    kind: 'container', title: 'The North Face', subtitle: 'Prêts pour l’hiver ?', bg_color: '#111111', sponsored: true,
    media_type: '', media_url: '',
    product_ids: [OFFICIAL('tnf-1996-retro-nuptse'), OFFICIAL('adidas-essentials-hoodie'), OFFICIAL('levis-501-original')],
  },
  {
    kind: 'sponsored_pair', title: 'Sony', subtitle: 'Le silence, version WH-1000XM6', bg_color: '#1F3A5F', sponsored: true,
    media_type: 'image', media_url: PHOTO('sony-wh-1000xm6-2'),
    product_ids: [OFFICIAL('sony-wh-1000xm6')],
  },
  {
    kind: 'media', title: 'Smartphones', subtitle: 'Les nouveaux phares, et de quoi les garder chargés.', bg_color: '#FFFFFF', sponsored: false,
    media_type: 'image', media_url: PHOTO('samsung-galaxy-s26-ultra-1'),
    product_ids: [OFFICIAL('samsung-galaxy-s26-ultra'), OFFICIAL('apple-iphone-18-pro'), OFFICIAL('anker-prime-26k')],
  },
  {
    kind: 'container', title: 'Sneakers', subtitle: 'Deux classiques, du matin au soir.', bg_color: '#F2AD11', sponsored: false,
    media_type: '', media_url: '',
    product_ids: [OFFICIAL('converse-chuck-taylor-hi'), OFFICIAL('new-balance-574-core')],
  },
  {
    kind: 'media', title: 'Chaussures', subtitle: 'Un pas d’avance, du matin au soir.', bg_color: '#FFFFFF', sponsored: false,
    media_type: 'video', media_url: '/media/reels-owned/shoes-v1.mp4', poster_url: '/media/reels-owned/shoes-v1.jpg', reel: 'reel_owner_shoes_v1',
    product_ids: [OFFICIAL('new-balance-574-core'), OFFICIAL('converse-chuck-taylor-hi')],
  },
  {
    kind: 'sponsored_pair', title: 'Garmin', subtitle: 'Chaque foulée compte', bg_color: '#2E7D5B', sponsored: true,
    media_type: 'image', media_url: PHOTO('garmin-forerunner-265-2'),
    product_ids: [OFFICIAL('garmin-forerunner-265')],
  },
  {
    kind: 'container', title: 'Le son, partout', subtitle: 'Casques et enceinte à emporter.', bg_color: '#4262AD', sponsored: false,
    media_type: '', media_url: '',
    product_ids: [OFFICIAL('bose-quietcomfort'), OFFICIAL('sony-wh-1000xm6'), OFFICIAL('jbl-go-4')],
  },
  {
    kind: 'media', title: 'Logitech MX Master 4', subtitle: 'Un bureau qui travaille pour vous.', bg_color: '#F4F4F4', sponsored: true,
    media_type: 'video', media_url: OFFICIAL_VIDEOS.logitech, poster_url: PHOTO('logitech-mx-master-4-2'),
    product_ids: [OFFICIAL('logitech-mx-master-4'), OFFICIAL('anker-prime-26k'), OFFICIAL('canon-eos-r5'), OFFICIAL('nintendo-switch-neon')],
  },
  {
    kind: 'media', title: 'Mode', subtitle: 'Les pièces vues sur le podium.', bg_color: '#E9E4DC', sponsored: false,
    media_type: 'video', media_url: '/media/reels-owned/clothing-v1.mp4', poster_url: '/media/reels-owned/clothing-v1.jpg', reel: 'reel_owner_clothing_v1',
    product_ids: [OFFICIAL('zara-pleated-mini-dress'), OFFICIAL('hm-relaxed-cotton-shirt'), OFFICIAL('levis-501-original'), OFFICIAL('tnf-1996-retro-nuptse')],
  },
  {
    kind: 'sponsored_pair', title: 'Zara', subtitle: 'La petite robe noire', bg_color: '#8B1A2B', sponsored: true,
    media_type: 'image', media_url: PHOTO('zara-pleated-mini-dress-2'),
    product_ids: [OFFICIAL('zara-pleated-mini-dress')],
  },
  {
    kind: 'container', title: 'Jeux et photo', subtitle: 'Pour jouer et immortaliser.', bg_color: '#C9E4DE', sponsored: false,
    media_type: '', media_url: '',
    product_ids: [OFFICIAL('nintendo-switch-neon'), OFFICIAL('canon-eos-r5'), OFFICIAL('jbl-go-4')],
  },
];

export function installPublicationBlocksDemo(db: Store, now = new Date().toISOString()): number {
  if (db.get('SELECT 1 FROM publication_blocks LIMIT 1')) return 0;
  let created = 0;
  for (const [index, demo] of PUBLICATION_BLOCKS_DEMO.entries()) {
    // La vidéo de démonstration vient du Reel installé (adresse réelle, jamais devinée).
    let mediaUrl = demo.media_url;
    let posterUrl = demo.poster_url ?? '';
    if (demo.reel) {
      const reel = db.get<{ video_url: string; poster_url: string }>('SELECT video_url,poster_url FROM reels WHERE id=?', demo.reel);
      if (!reel?.video_url) continue;
      mediaUrl = reel.video_url;
      posterUrl = reel.poster_url || posterUrl;
    }
    const productIds = demo.product_ids.filter((id) => isSellableProduct(db.get<any>('SELECT id,name,image,status,final_price FROM products WHERE id=?', id)));
    const checked = normalizePublicationBlockInput(
      { ...demo, media_url: mediaUrl, poster_url: posterUrl, product_ids: productIds, active: true },
      undefined,
      checkLink,
    );
    if (checked.ok === false) continue;
    createBlock(db, checked.value, new Date(Date.parse(now) + index).toISOString(), `pubblock_demo_${index + 1}`);
    created += 1;
  }
  return created;
}
