import type { QatafoDatabase } from '../db/database';
import { TEST_PRODUCT_ID } from '../catalogue/seedTestProduct';
import { publicLinkedProduct } from './shoppableContent';
import { setContentProducts } from './contentProducts';

const reference = (file: string) =>
  `/media/publications/style-references/${file}`;
const editorial = (file: string) => `/media/publications/${file}`;
export const PUBLICATION_SHOWCASE_PREFIX = 'publication_showcase_';

/** Authored live examples requested by the owner, not a client-only mock feed.
 * Called by a one-shot migration: CRM edits, archiving and deletion always win. */
export function installPublicationShowcase(
  db: QatafoDatabase,
  now = new Date().toISOString()
) {
  const publisher = db.get<{ id: string }>(
    'SELECT id FROM story_publishers WHERE official=1 ORDER BY id LIMIT 1'
  );
  if (!publisher) return [];
  const product = publicLinkedProduct(
    'shoppable',
    db.get<any>('SELECT * FROM products WHERE id=?', TEST_PRODUCT_ID)
  );
  const examples = [
    {
      template: 'social_mosaic',
      title: 'Une semaine, plusieurs allures',
      description:
        'Du denim, des lignes simples et des détails qui changent tout. Parcourez les images pour trouver votre inspiration.',
      files: [
        'look-street.jpg',
        'look-denim.jpg',
        'look-boots.jpg',
        'look-denim-detail.jpg',
        'look-blue-knit.jpg',
        'look-black-top.jpg',
      ].map(reference),
    },
    {
      template: 'shoppable',
      title: product?.name || 'Le sens du détail',
      description: product
        ? 'Une paire pour accompagner le quotidien. Retrouvez les photos, les tailles et les disponibilités sur la fiche produit.'
        : 'Lignes nettes et contrastes discrets : une inspiration autour de la chaussure.',
      files: [product?.image || reference('shoe-black.jpg')],
      productId: product?.id,
    },
    {
      template: 'caption_photo',
      title: 'L’allure en rouge',
      description:
        'Une couleur affirmée, une silhouette et toute une personnalité. Laissez parler votre style.',
      files: [reference('campaign-red.jpeg')],
    },
    {
      template: 'social_strip',
      title: 'Trois regards sur le style',
      description:
        'Une silhouette, une matière, un détail. Faites défiler les photos pour découvrir chaque inspiration.',
      files: ['look-street.jpg', 'look-denim.jpg', 'look-boots.jpg'].map(
        reference
      ),
    },
    {
      template: 'social_pair',
      title: 'Deux façons de porter l’essentiel',
      description:
        'Maille bleue ou haut noir : deux inspirations pour composer votre propre silhouette.',
      files: ['look-blue-knit.jpg', 'look-black-top.jpg'].map(reference),
    },
    {
      template: 'campaign',
      title: 'Votre nouveau rituel.',
      description:
        'Une touche de couleur. Toute votre personnalité. Prenez un instant pour vous et découvrez une autre façon de vivre la beauté.',
      files: [editorial('editorial-beauty-mirror.jpg')],
      generated: true,
    },
    {
      template: 'carousel',
      title: 'Les essentiels de saison',
      description:
        'Trois nuances, une allure. Explorez la galerie et choisissez votre inspiration : caramel, brun ou ivoire.',
      files: [
        'bag-editorial-caramel.jpg',
        'bag-editorial-brown.jpg',
        'bag-editorial-ivory.jpg',
      ].map(editorial),
      generated: true,
    },
  ];
  // Below the current newest publication: preserve the existing À la une selection.
  const latest = db.get<{ at: string }>(
    "SELECT MAX(publish_at) at FROM publications WHERE status='publie' AND publish_at<=?",
    now
  );
  const base =
    latest?.at && Number.isFinite(Date.parse(latest.at))
      ? Date.parse(latest.at)
      : Date.parse(now);
  const inserted: string[] = [];
  for (const [index, item] of examples.entries()) {
    const id = PUBLICATION_SHOWCASE_PREFIX + item.template;
    if (db.get('SELECT id FROM publications WHERE id=?', id)) continue;
    const social = item.template.startsWith('social_');
    const media = item.files.map((url) => ({
      type: 'image',
      url,
      alt: item.title,
    }));
    const action = item.template === 'campaign' ? 'Découvrir le rituel' : '';
    db.run(
      `INSERT INTO publications
      (id,title,subtitle,channel_id,image_url,publish_at,status,created_at,updated_at,category,media_origin,template_id,post_type,media_json,description,description_position,content_mode,product_id,action_label,action_target)
      VALUES (?,?,?,?,?,?,'publie',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      item.title,
      '',
      publisher.id,
      item.files[0],
      new Date(base - (index + 1) * 1000).toISOString(),
      now,
      now,
      item.template === 'campaign' ? 'beauty' : 'fashion',
      item.generated ? 'generated' : 'uploaded',
      item.template,
      social || item.template === 'carousel' ? 'carousel' : 'image',
      JSON.stringify(media),
      item.description,
      social || ['caption_photo', 'shoppable'].includes(item.template)
        ? 'above'
        : 'below',
      item.productId ? 'shoppable' : 'normal',
      item.productId || null,
      action,
      'detail'
    );
    if (item.productId)
      setContentProducts(db, 'publication', id, [item.productId], now);
    inserted.push(id);
  }
  return inserted;
}
