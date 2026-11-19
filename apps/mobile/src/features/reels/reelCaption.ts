import type { Reel } from '@/api/social';
import type { Locale } from '@/i18n/keys';

/** Editorial copy for the five owner clips already published with Arabic seed titles. */
const OWNER_COPY: Record<string, { ar: string; fr: string; description: Record<Locale, string> }> = {
  reel_owner_shoes_v1: {
    ar: 'أحذية', fr: 'Chaussures',
    description: { fr: 'Des baskets pour les petits pas du quotidien.', ar: 'صباط سبور للصغار، لكل نهار.' },
  },
  reel_owner_clothing_v1: {
    ar: 'ملابس', fr: 'Vêtements',
    description: { fr: 'Des idées de tenues à découvrir en vidéo.', ar: 'أفكار لبسة تتفرّج عليها في الفيديو.' },
  },
  reel_owner_home_v1: {
    ar: 'أدوات منزلية', fr: 'Maison',
    description: { fr: 'Des idées et accessoires pour la maison.', ar: 'أفكار وحاجات للدار.' },
  },
  reel_owner_perfume_v1: {
    ar: 'عطور', fr: 'Parfums',
    description: { fr: 'Un aperçu de notre sélection de parfums.', ar: 'لمحة على اختياراتنا من العطور.' },
  },
  reel_owner_accessories_v1: {
    ar: 'إكسسوارات', fr: 'Accessoires',
    description: { fr: 'Des accessoires à découvrir en vidéo.', ar: 'إكسسوارات تتفرّج عليها في الفيديو.' },
  },
};

/** Localize the original seed copy only; never hide or rewrite authored copy. */
export function reelCaption(reel: Pick<Reel, 'id' | 'title' | 'description'>, locale: Locale) {
  const title = reel.title?.trim() ?? '';
  const description = reel.description?.trim() ?? '';
  const owner = Object.prototype.hasOwnProperty.call(OWNER_COPY, reel.id) ? OWNER_COPY[reel.id] : undefined;
  const seeded = owner && (title === owner.ar || title === owner.fr || !title) ? owner : undefined;
  return {
    title: seeded ? seeded[locale] : title,
    description: description || seeded?.description[locale] || '',
  };
}
