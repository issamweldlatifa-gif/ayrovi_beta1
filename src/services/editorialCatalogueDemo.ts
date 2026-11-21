import type { QatafoDatabase } from '../db/database';
import { ZALANDO_DEMO, zalandoDemoProductId } from '../catalogue/installZalandoDemoCatalogue';
import { isStoryId, normalizeStoryEditorial, type StoryArticleBlock, type StoryEditorial } from '../../shared/storyEditorial';
import { invalidLinkedProducts, readContentProductIds, setContentProducts } from './contentProducts';
import { OFFICIAL_STORIES } from './officialStories';

export const EDITORIAL_CATALOGUE_DEMO_MIGRATION = 'official_story_reel_catalogue_demo_v1';
const text = (text: string, textAr = '') => ({ text, ...(textAr ? { textAr } : {}) });
const focus = (sku: string, title: string, titleAr: string, body: string, bodyAr: string) => ({ sku, title: text(title, titleAr), body: text(body, bodyAr) });
const stories = {
  everyday: {
    intro: text('Une tenue de tous les jours commence par des pièces qui se combinent sans effort. Jouez avec les proportions : un haut près du corps, un pantalon ample et des accessoires simples suffisent.',
      'تبدأ إطلالة كل يوم بقطع يسهل تنسيقها. جرّب المزج بين كنزة قريبة من الجسم وسروال واسع وإكسسوارات بسيطة.'),
    products: [focus('p001', 'UNE BASE TOUT EN NOIR', 'أساس باللون الأسود', 'Ce pull noir et ajusté se glisse facilement sous une veste. Portez-le rentré pour souligner la taille ou laissez-le libre pour un effet plus décontracté.', 'تنساب هذه الكنزة السوداء الضيقة بسهولة تحت السترة. أدخلها في السروال لإبراز الخصر أو اتركها لإطلالة مريحة.'),
      focus('p004', 'DE L’AISANCE À CHAQUE PAS', 'راحة في كل خطوة', 'Le pantalon noir à jambe large équilibre un haut ajusté. Essayez-le avec des baskets pour la journée ou des chaussures plus habillées en soirée.', 'يوازن السروال الأسود الواسع الكنزة الضيقة. جرّبه مع حذاء رياضي نهارًا أو حذاء أنيق مساءً.')],
  },
  wellbeing: {
    intro: text('Le bon rituel est celui qu’on a envie de retrouver. Gardez quelques gestes courts et choisissez les sensations qui vous plaisent : une brume légère ou un moment consacré à vos cheveux.',
      'أفضل روتين هو الذي تحبّ العودة إليه. اختصر الخطوات واختر ما تحبّ: رذاذ خفيف أو لحظة مخصّصة للعناية بشعرك.'),
    products: [focus('p016', 'UNE PAUSE PARFUMÉE', 'استراحة معطّرة', 'La brume Cheirosa 62 ajoute une note gourmande à la routine. Son format de 90 ml se range facilement dans un sac.', 'يضيف رذاذ Cheirosa 62 لمسة عطرية حلوة إلى روتينك. عبوة 90 مل سهلة الحمل في الحقيبة.'),
      focus('p015', 'UN GESTE POUR LES CHEVEUX', 'لحظة للعناية بالشعر', 'Le sérum Genesis de 30 ml se réserve à votre rituel capillaire. Suivez les indications du fabricant pour l’intégrer à vos produits habituels.', 'أضف سيروم Genesis بحجم 30 مل إلى روتين شعرك واتّبع تعليمات الاستعمال على العبوة.')],
  },
  trench: {
    intro: text('Notre dossier s’inspire du trench, sans promettre un modèle qui n’est pas au catalogue. Pour jouer avec la même idée de superposition, partez d’une base sombre et choisissez le volume de la veste selon la saison.',
      'نستلهم فكرة الطبقات من معطف الترنش، ونقترح بدائل موجودة في الكاتالوغ. ابدأ بقاعدة داكنة واختر حجم السترة حسب الموسم.'),
    products: [focus('p008', 'UNE VESTE DE MI-SAISON', 'سترة بين الفصول', 'Le ton cuivre de la veste varsity souligne une tenue neutre. Sa coupe sportive change du trench tout en gardant l’idée d’une couche facile à retirer.', 'يبرز اللون النحاسي للسترة الرياضية الإطلالة المحايدة. وهي بديل خفيف عن الترنش ويمكن خلعها بسهولة.'),
      focus('p019', 'LE CHINO POUR ÉQUILIBRER', 'سروال تشينو للتوازن', 'Le chino American Classic donne une ligne plus nette à une veste volumineuse. Associez le ton elmwood à un haut crème ou noir.', 'يوازن سروال التشينو American Classic السترة الواسعة. نسّق لونه الترابي مع قطعة علوية كريمية أو سوداء.')],
  },
  coffee: {
    intro: text('Pour un café improvisé, l’idéal est une tenue qui ne demande pas de réflexion. Un haut imprimé et un pantalon brun suffisent à donner du relief sans multiplier les pièces.',
      'لقهوة على السريع، يكفي تنسيق بسيط. يضيف تي شيرت مطبوع وسروال بني لمسة مختلفة من غير الإكثار من القطع.'),
    products: [focus('p018', 'LE T-SHIRT GRAPHIQUE', 'تي شيرت مطبوع', 'Le duo Tommy Hilfiger propose deux bases faciles à alterner. Le motif graphique reste visible même sous une veste ouverte.', 'يوفّر هذا الثنائي من Tommy Hilfiger قطعتين سهلتي التبديل. وتبقى الطبعة ظاهرة تحت سترة مفتوحة.'),
      focus('p005', 'UN BRUN PLUS DOUX', 'لمسة بنية هادئة', 'Le pantalon large Stradivarius donne du mouvement à la silhouette. Son ton brun fonctionne avec du blanc cassé comme avec du noir.', 'يضيف سروال Stradivarius الواسع حركة للإطلالة. يناسب لونه البني الأبيض المائل للبيج أو الأسود.')],
  },
  winter: {
    intro: text('Par temps froid, alternez les couches plutôt que de miser sur une seule pièce. Une veste à capuche couvre les trajets, et un sweat zippé se retire vite une fois à l’intérieur.',
      'في البرد، نسّق عدّة طبقات بدل الاعتماد على قطعة واحدة. سترة بغطاء رأس للخروج وكنزة بسحّاب يسهل خلعها في الداخل.'),
    products: [focus('p002', 'LA VESTE À CAPUCHE', 'سترة بغطاء رأس', 'La Superdry Everest est la pièce forte de cette sélection. Essayez le noir avec un pantalon droit et gardez assez d’aisance pour porter une couche dessous.', 'سترة Superdry Everest هي القطعة الأساسية هنا. نسّق الأسود مع سروال مستقيم واترك مساحة لطبقة تحتها.'),
      focus('p007', 'LA COUCHE QUI S’AJUSTE', 'طبقة مرنة', 'Le zip intégral du sweat gris facilite les changements de température entre l’intérieur et l’extérieur. Son gris foncé se marie avec le denim.', 'يسهّل السحّاب الكامل التأقلم عند الانتقال بين الداخل والخارج. ويلائم الرمادي الداكن الدنيم.')],
  },
  skincare: {
    intro: text('Un rituel beauté n’a pas besoin de beaucoup d’étapes. Choisissez un produit adapté, lisez sa notice et gardez les autres gestes simples.',
      'روتين العناية لا يحتاج إلى خطوات كثيرة. اختر منتجًا يناسبك واقرأ تعليماته وحافظ على بساطة بقية الخطوات.'),
    products: [focus('p017', 'UN TONIQUE À INTRODUIRE DOUCEMENT', 'تونر يُضاف تدريجيًا', 'Cette lotion contient de l’acide glycolique. Lisez les précautions de la marque et n’en faites pas une étape incontournable si votre peau ne la tolère pas.', 'يحتوي هذا التونر على حمض الجليكوليك. اقرأ احتياطات العلامة، ولا تجعله خطوة ثابتة إذا لم تتحمّله بشرتك.'),
      focus('p015', 'UN TEMPS POUR LES CHEVEUX', 'وقت مخصّص للشعر', 'Séparez les gestes visage et cheveux. Le sérum Genesis se destine à la routine capillaire et s’utilise selon sa notice.', 'افصل بين عناية الوجه والشعر. سيروم Genesis مخصّص لروتين الشعر ويُستخدم حسب التعليمات.')],
  },
  beauty: {
    intro: text('La touche finale ne se limite pas au maquillage. Un coffret permet d’explorer différents formats et une brume suffit pour ajouter une signature parfumée.',
      'اللمسة الأخيرة ليست المكياج فقط. تتيح لك العلبة تجربة مستحضرات متنوعة، بينما يمنحك رذاذ واحد لمسة عطرية.'),
    products: [focus('p014', 'UN COFFRET À EXPLORER', 'علبة للاكتشاف', 'Le calendrier beauté réunit plusieurs produits dans un coffret. Prenez le temps de découvrir chaque formule plutôt que de tout ajouter à votre routine d’un coup.', 'تجمع علبة التقويم عدة مستحضرات. جرّب كل واحد على حدة بدل إضافة الجميع إلى روتينك دفعة واحدة.'),
      focus('p016', 'UNE DERNIÈRE NOTE', 'لمسة أخيرة', 'La brume Cheirosa 62 accompagne une tenue sans lui ajouter un accessoire. Le flacon de 90 ml est aussi une idée de cadeau à associer au coffret.', 'يكمّل رذاذ Cheirosa 62 إطلالتك من دون إكسسوار إضافي. وتصلح عبوة 90 مل كهدية مع العلبة.')],
  },
} as const;

const reelPairs = {
  capsule_wardrobe: ['p001', 'p004', 'p018'], classic_outfits: ['p003', 'p019'], workwear: ['p004', 'p005', 'p019'],
  rainy_day: ['p002', 'p007'], city_break: ['p008', 'p023'], weekend_getaway: ['p010', 'p018', 'p022'], remote_work: ['p020', 'p005'],
} as const;
const offered = (sku: string) => ZALANDO_DEMO.products.find(product => product.key === `zalando-${sku}`);
const idOf = (sku: string) => zalandoDemoProductId(`zalando-${sku}`);

/** Fill only untouched owner demo rows; authored layouts, links, statuses and prices win. */
export function installEditorialCatalogueDemo(db: QatafoDatabase, now: string) {
  for (const [slug, title, description, titleAr, descriptionAr] of OFFICIAL_STORIES) {
    const id = `official_story_${slug}`;
    const cover = `/media/stories/${slug}.jpg`;
    if (!db.get(`SELECT 1 FROM stories WHERE id=? AND media_url=? AND title=? AND status='PUBLISHED'
      AND updated_at=created_at AND editorial_json='null' AND product_id IS NULL AND content_mode='normal'`, id, cover, title) || readContentProductIds(db, 'story', id).length) continue;
    const edition = stories[slug];
    const items = edition.products.filter(item => offered(item.sku) && !invalidLinkedProducts(db, [idOf(item.sku)]).length);
    const productIds = items.map(item => idOf(item.sku));
    const copy = text(title, titleAr);
    const slides: StoryEditorial['slides'] = [{ layout: 'cover', media: { kind: 'image', url: cover }, title: copy, caption: text(description, descriptionAr), action: 'read', seconds: 9 }];
    if (productIds.length) slides.push({ layout: 'product', media: { kind: 'image', url: offered(items[0]!.sku)!.images[0]! }, title: text('LA SÉLECTION', 'المختارات'), caption: text('À retrouver dans le catalogue', 'متوفّرة في الكاتالوغ'), productIds, seconds: 15 });
    slides.push({ layout: 'inset', media: { kind: 'image', url: cover }, title: copy, caption: text(description, descriptionAr), action: slug === 'trench' || slug === 'coffee' ? 'explore' : 'discover', seconds: 9 });
    const blocks: StoryArticleBlock[] = items.map(item => ({ type: 'product', productId: idOf(item.sku), title: item.title, content: item.body,
      image: offered(item.sku)!.images[0]! }));
    const editorial = normalizeStoryEditorial({ version: 1, slides, article: { cover, title: copy, intro: edition.intro, author: 'Zayrovi Team', blocks, selectionTitle: text('NOTRE SÉLECTION EN UN COUP D’ŒIL', 'مختاراتنا في لمحة') } });
    db.run('UPDATE stories SET editorial_json=?, content_mode=?, product_id=?, updated_at=? WHERE id=?', JSON.stringify(editorial), productIds.length ? 'shoppable' : 'normal', productIds[0] ?? null, now, id);
    setContentProducts(db, 'story', id, productIds, now);
  }
  for (const [topic, skus] of Object.entries(reelPairs)) {
    const id = `reel_drive_${topic}_v2`;
    if (!isStoryId(id) || !db.get(`SELECT 1 FROM reels WHERE id=? AND channel_id='pub_zayrovi' AND status='publie'
      AND updated_at=created_at AND video_url LIKE '/media/reels-owned-v2/%' AND product_id IS NULL AND content_mode='normal'`, id)
      || readContentProductIds(db, 'reel', id).length) continue;
    const ids = skus.map(idOf).filter(productId => !invalidLinkedProducts(db, [productId]).length);
    if (!ids.length) continue;
    db.run("UPDATE reels SET content_mode='shoppable', product_id=?, updated_at=? WHERE id=?", ids[0], now, id);
    setContentProducts(db, 'reel', id, ids, now);
  }
}
