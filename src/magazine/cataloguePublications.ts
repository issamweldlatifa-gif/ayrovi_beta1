import type { QatafoDatabase } from '../db/database';
import { zalandoDemoProductId } from '../catalogue/installZalandoDemoCatalogue';
import { PUBLICATION_SHOWCASE_PREFIX } from '../services/publicationShowcase';
import { setContentProducts } from '../services/contentProducts';
import { normalizeMediaLink } from '../../shared/mediaLinks';
import { isPublicationCampaign } from '../../shared/publicationCampaign';

export const CATALOGUE_PUBLICATIONS_MIGRATION = 'catalogue_publications_v1';
export const CATALOGUE_PUBLICATIONS_PREFIX = 'publication_catalogue_v1_';

const editions = [
  { key: 'capsule', category: 'fashion', template: 'video', title: 'La garde-robe capsule', reel: 'reel_drive_capsule_wardrobe_v2', fit: 'contain', products: [1, 4, 8, 11] },
  { key: 'denim', category: 'fashion', template: 'photo', title: 'Denim et mailles', products: [6, 7, 9, 10] },
  { key: 'classiques', category: 'fashion', template: 'video', title: 'Les classiques du vestiaire', reel: 'reel_drive_classic_outfits_v2', fit: 'cover', products: [2, 3, 5, 19] },
  { key: 'casual', category: 'fashion', template: 'split', title: 'Le vestiaire casual', products: [12, 13, 18, 20] },
  { key: 'beaute', category: 'beauty', template: 'campaign_orange', title: 'La sélection beauté', products: [14, 15, 16, 17] },
  { key: 'essentiels', category: 'fashion', template: 'campaign_red', title: 'Les essentiels du quotidien', products: [21, 22, 23, 24] },
] as const;

/** Hide only the original unlinked starter artwork in the native reference feed, not CRM records. */
export function legacyReferenceArtworkFilter() {
  const assets = [
    ['pub_post_01', '/media/hero-femme.jpg'], ['pub_post_02', '/media/hero-enfants.jpg'],
    ...['style', 'home', 'tech', 'lifestyle'].map(key => [`publication_editorial_${key}`, `/media/publications/editorial-${key}.jpg`]),
  ];
  return {
    sql: `substr(pub.id,1,?)<>? AND NOT (pub.content_mode='normal' AND (${assets.map(() => '(pub.id=? AND pub.image_url=?)').join(' OR ')}))`,
    args: [PUBLICATION_SHOWCASE_PREFIX.length, PUBLICATION_SHOWCASE_PREFIX, ...assets.flat()],
  };
}

const link = (input: string, kind: 'image' | 'video') => {
  const result = normalizeMediaLink(input, kind);
  return result.ok ? result.url : '';
};
const productId = (n: number) => zalandoDemoProductId(`zalando-p${String(n).padStart(3, '0')}`);

/** Additive and non-destructive; after creation, subsequent boots never overwrite CRM decisions. */
export function installCataloguePublications(db: QatafoDatabase, now = new Date().toISOString()): boolean {
  if (db.get('SELECT 1 FROM applied_data_migrations WHERE key=?', CATALOGUE_PUBLICATIONS_MIGRATION)) return false;
  if (!db.get("SELECT 1 FROM story_publishers WHERE id='pub_zayrovi' AND official=1")) return false;
  return db.transaction(() => {
    if (db.get('SELECT 1 FROM applied_data_migrations WHERE key=?', CATALOGUE_PUBLICATIONS_MIGRATION)) return false;
    const catalogue = db.all<{ id: string; image: string }>("SELECT id,image FROM products WHERE visibility='CATALOG' AND status='ACTIVE' AND final_price>0 AND id GLOB 'product_official_zalando-p[0-9][0-9][0-9]'");
    const photos = new Map(catalogue.map(row => [row.id, link(row.image, 'image')]));
    // Wait for the two existing sources. Never publish empty rails, stale photo fallbacks or invented product cards.
    if (!editions.every(edition => edition.products.every(n => photos.get(productId(n))))) return false;
    const entries = editions.map(edition => {
      const ids = edition.products.map(productId);
      const reel = 'reel' in edition ? db.get<{ video_url: string; poster_url: string }>(
        "SELECT video_url,poster_url FROM reels WHERE id=? AND channel_id='pub_zayrovi' AND status='publie' AND publish_at<=?", edition.reel, now
      ) : undefined;
      const cover = 'reel' in edition ? link(reel?.poster_url || '', 'image') : photos.get(ids[0]!)!;
      const url = 'reel' in edition ? link(reel?.video_url || '', 'video') : cover;
      const media = 'reel' in edition ? [{ type: 'video', url, poster: cover, fit: edition.fit, alt: edition.title }]
        : isPublicationCampaign(edition.template) ? [] : [{ type: 'image', url, alt: edition.title }];
      return { edition, ids, cover, url, media };
    });
    if (entries.some(entry => !entry.url || !entry.cover)) return false;
    for (const [index, { edition, ids, cover, media }] of entries.entries()) {
      const id = `${CATALOGUE_PUBLICATIONS_PREFIX}${edition.key}`;
      const result = db.run(`INSERT OR IGNORE INTO publications
        (id,title,subtitle,channel_id,image_url,publish_at,status,created_at,updated_at,category,media_origin,template_id,post_type,media_json,content_mode,product_id)
        VALUES (?,?,'','pub_zayrovi',?,?,'publie',?, ?,?,'uploaded',?,?,?,'shoppable',?)`, id, edition.title,
        isPublicationCampaign(edition.template) ? '' : cover, new Date(Date.parse(now) - index * 1000).toISOString(), now, now,
        edition.category, edition.template, 'reel' in edition ? 'video' : isPublicationCampaign(edition.template) ? 'collection' : 'image', JSON.stringify(media), ids[0]);
      if (result.changes) setContentProducts(db, 'publication', id, ids, now);
    }
    db.run('INSERT INTO applied_data_migrations(key,applied_at) VALUES (?,?)', CATALOGUE_PUBLICATIONS_MIGRATION, now);
    return true;
  });
}
