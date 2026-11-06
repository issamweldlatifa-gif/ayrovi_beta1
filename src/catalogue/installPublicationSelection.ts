import type { QatafoDatabase } from '../db/database';
import selection from './publicationSelection.json';
import { createStockItem } from '../inventory/stock';
import { setContentProducts } from '../services/contentProducts';
export const SELECTION = selection;
export const selectionId = (key: string) => `product_selection_${key}`;

/** Owner-approved catalogue + opening inventory. One-shot; never replenishes sold stock. */
export function installPublicationSelection(db: QatafoDatabase) {
  const now = new Date().toISOString();
  for (const [index, item] of selection.products.entries()) {
    const id = selectionId(item.key);
    if (db.get('SELECT id FROM products WHERE id=? OR slug=?', id, item.key))
      continue;
    let brand = db.get<any>(
      'SELECT id FROM brands WHERE name=? COLLATE NOCASE',
      item.brand
    );
    if (!brand) {
      brand = { id: `brand_selection_${item.key}` };
      db.run(
        `INSERT INTO brands(id,name,category,created_at,updated_at) VALUES (?,?,?,?,?)`,
        brand.id,
        item.brand,
        item.category === 'beauty'
          ? 'BEAUTY'
          : item.category === 'home'
          ? 'HOME'
          : 'FASHION',
        now,
        now
      );
    }
    const categorySlug =
      item.category === 'beauty'
        ? 'soins-cheveux'
        : item.category === 'home'
        ? 'arts-table'
        : item.key.startsWith('ck-')
        ? 'hauts'
        : item.key === 'mk-bri-ruched'
        ? 'chaussures'
        : 'accessoires';
    let category = db.get<any>(
      'SELECT id FROM catalogue_categories WHERE slug=?',
      categorySlug
    );
    if (!category) {
      category = { id: `category_selection_${categorySlug}` };
      const labels = {
        'soins-cheveux': 'Soins des cheveux',
        'arts-table': 'Arts de la table',
        hauts: 'Hauts',
        chaussures: 'Chaussures',
        accessoires: 'Accessoires',
      };
      db.run(
        `INSERT INTO catalogue_categories(id,name,slug,status,created_at,updated_at) VALUES (?,?,?,'ACTIVE',?,?)`,
        category.id,
        labels[categorySlug],
        categorySlug,
        now,
        now
      );
    }
    // Local sale price, explicitly approved by owner. Source EUR is provenance, not a second checkout price.
    db.run(
      `INSERT INTO products(id,name,description,image,additional_images,brand_id,brand_name,category,category_id,source_url,source_platform,original_price,currency,converted_price,customs_fee,shipping_fee,service_fee,final_price,express_available,stock_status,status,product_code,slug,product_type,visibility,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'','ZAYROVI',0,'TND',?,0,0,0,?,0,'AVAILABLE','ACTIVE',?,?,'STANDARD','CATALOG',?,?)`,
      id,
      item.name,
      item.description,
      item.image,
      '[]',
      brand.id,
      item.brand,
      categorySlug,
      category.id,
      item.salePriceTND,
      item.salePriceTND,
      `SEL-${String(index + 1).padStart(3, '0')}`,
      item.key,
      now,
      now
    );
    db.run(
      'UPDATE products SET fiche_labels=? WHERE id=?',
      JSON.stringify({
        size:
          item.category === 'beauty'
            ? 'Contenance'
            : item.key === 'mk-bri-ruched'
            ? 'Pointure'
            : 'Taille',
      }),
      id
    );
    db.run(
      `INSERT INTO catalogue_media(id,product_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at) VALUES (?,?,'IMAGE',?,?,0,1,?,?)`,
      `media_${id}`,
      id,
      item.image,
      item.name,
      now,
      now
    );
    for (const [size, quantity] of Object.entries(item.stock)) {
      const variantId = `variant_${id}_${size.replace(/[^a-zA-Z0-9]/g, '_')}`;
      db.run(
        `INSERT INTO catalogue_variants(id,product_id,sku,size,color,status,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?,?)`,
        variantId,
        id,
        `SEL-${index + 1}-${size}`,
        size,
        item.color,
        index,
        now,
        now
      );
      const result = createStockItem(db, {
        productId: id,
        variantId,
        location: 'MAIN',
        quantity,
        reorderPoint: 1,
        actor: { id: null, name: 'Installation autorisée par le propriétaire' },
      });
      if (!result.ok)
        throw new Error(`SELECTION_STOCK_INSTALL_FAILED:${item.key}`);
    }
    for (const [key, label, value] of [
      [
        'selection_source_price_eur',
        'Prix source EUR',
        String(item.sourcePriceEUR),
      ],
      [
        'selection_conversion_rate',
        'Taux EUR/TND retenu',
        String(selection.eurToTnd),
      ],
      [
        'selection_source',
        'Source du produit',
        'Zalando.fr — capture fournie par le propriétaire',
      ],
    ]) {
      db.run(
        `INSERT OR IGNORE INTO catalogue_attributes(id,attribute_key,label,data_type,applies_to,options,families,section,status,sort_order,created_at,updated_at) VALUES (?,?,?,'TEXT','product','[]','[]','pratique','ARCHIVED',100,?,?)`,
        `attr_${key}`,
        key,
        label,
        now,
        now
      );
      db.run(
        `INSERT INTO catalogue_attribute_values(id,attribute_key,product_id,value_text,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
        `${id}_${key}`,
        key,
        id,
        value,
        now,
        now
      );
    }
  }
  replacePublicationSelection(db, now);
}

function replacePublicationSelection(db: QatafoDatabase, now: string) {
  const products = Object.fromEntries(
    selection.products.map((item) => [item.key, item])
  );
  const hair = [
    'kerastase-volumifique',
    'kerastase-chronologiste',
    'ordinary-hair-density',
  ];
  const red = ['mk-laila-pochette', 'mk-bri-ruched', 'mk-charms-braided'];
  const watches = ['armani-traditional', 'furla-easy-shape'];
  const plan: Array<[string, string, string, string[], string, string]> = [
    [
      'publication_showcase_social_mosaic',
      'social_mosaic',
      'Les détails qui composent une allure',
      [...red, ...watches, 'ck-henley-white'],
      'Une sélection de pièces à découvrir : accessoires bordeaux, montres et haut blanc. Ouvrez les fiches pour retrouver chaque produit.',
      'Explorer la sélection',
    ],
    [
      'publication_showcase_shoppable',
      'shoppable',
      'La touche bordeaux',
      ['mk-bri-ruched'],
      'Les ballerines Bri Ruched de MICHAEL Michael Kors. Découvrez le produit et choisissez votre pointure.',
      'Voir le produit',
    ],
    [
      'publication_showcase_caption_photo',
      'caption_photo',
      'Le blanc, simplement',
      ['ck-henley-white'],
      'Le Henley blanc à manches longues Calvin Klein Jeans. Retrouvez les tailles disponibles sur sa fiche.',
      'Voir le produit',
    ],
    [
      'publication_showcase_social_strip',
      'social_strip',
      'Trois soins à découvrir',
      hair,
      'Kérastase et The Ordinary : trois références pour les cheveux, avec leurs formats et leurs fiches détaillées.',
      'Explorer les soins',
    ],
    [
      'publication_showcase_social_pair',
      'social_pair',
      'Deux signatures au poignet',
      watches,
      'Cadran bleu et bracelet argenté, ou montre bicolore : découvrez les deux modèles et leurs prix.',
      'Découvrir les montres',
    ],
    [
      'publication_showcase_campaign',
      'campaign',
      'Votre sélection cheveux.',
      [hair[0]],
      'Shampooing 250 ml et sérums 30 ml et 60 ml : explorez trois produits et consultez leurs informations.',
      'Découvrir les soins',
    ],
    [
      'publication_showcase_carousel',
      'carousel',
      'L’accord bordeaux',
      red,
      'Pochette Laila, ballerines Bri Ruched et porte-clés tressé : trois pièces à découvrir ensemble ou séparément.',
      'Explorer l’ensemble',
    ],
    [
      'pub_post_02',
      'photo',
      'Le Henley blanc Calvin Klein Jeans',
      ['ck-henley-white'],
      'Un haut à manches longues et col Henley. Découvrez les tailles S, M, XL et XXL.',
      'Voir le produit',
    ],
    [
      'pub_post_01',
      'campaign',
      'Trois références pour les cheveux',
      [hair[0]],
      'Découvrez les produits Kérastase et The Ordinary, leurs formats et leurs fiches.',
      'Explorer les soins',
    ],
    [
      'publication_editorial_style',
      'carousel',
      'Une silhouette, trois détails',
      red,
      'Découvrez la sélection bordeaux : sac, ballerines et porte-clés.',
      'Explorer l’ensemble',
    ],
    [
      'publication_editorial_home',
      'photo',
      'Une touche de couleur à table',
      ['swarovski-tasse'],
      'Une tasse Swarovski multicolore avec sa soucoupe. Retrouvez la pièce sur sa fiche.',
      'Voir le produit',
    ],
    [
      'publication_editorial_tech',
      'social_pair',
      'Le temps, deux signatures',
      watches,
      'Deux montres à découvrir : Emporio Armani et Furla.',
      'Découvrir les montres',
    ],
    [
      'publication_editorial_lifestyle',
      'photo',
      'Un instant à soi',
      ['swarovski-tasse'],
      'Découvrez la tasse multicolore Swarovski et sa soucoupe.',
      'Voir le produit',
    ],
  ];
  for (const [id, template, title, keys, description, label] of plan) {
    const old = db.get<any>('SELECT * FROM publications WHERE id=?', id);
    // Only replace the known bundled examples, not photographs the owner already changed in CRM.
    if (
      !old ||
      !/^\/media\/(publications\/|editorial\/featured-beauty\.jpg|catalogue\/baskets-|hero-(?:enfants|femme)\.jpg|publication-)/.test(
        old.image_url
      )
    )
      continue;
    const media = keys.map((key) => ({
      type: 'image',
      url: products[key].image,
      alt: products[key].name,
      fit: 'contain',
    }));
    const linked =
      id.endsWith('campaign') || id === 'pub_post_01' ? hair : keys;
    const direct = linked.length === 1;
    db.run(
      `UPDATE publications SET title=?,subtitle='',image_url=?,description=?,template_id=?,post_type=?,media_json=?,media_origin='uploaded',description_position=?,content_mode='shoppable',product_id=?,action_label=?,action_target=?,updated_at=?,category=? WHERE id=?`,
      title,
      media[0].url,
      description,
      template,
      media.length > 1 ? 'carousel' : 'image',
      JSON.stringify(media),
      [
        'social_mosaic',
        'social_pair',
        'social_strip',
        'caption_photo',
        'shoppable',
      ].includes(template)
        ? 'above'
        : 'below',
      selectionId(linked[0]),
      label,
      direct ? 'products' : 'detail',
      now,
      hair.includes(keys[0])
        ? 'beauty'
        : keys[0] === 'swarovski-tasse'
        ? 'home'
        : 'fashion',
      id
    );
    setContentProducts(db, 'publication', id, linked.map(selectionId), now);
  }
}
