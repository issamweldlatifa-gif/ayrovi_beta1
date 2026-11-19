/** Shared mobile / CRM preview measurements. All dimensions are at the layout viewport scale. */
export const EDITORIAL_FEED = { gutter: 12, gap: 4, peek: 16, radius: 8, ratio: 1.44, title: 16, titleLine: 22, description: 13, descriptionLine: 19, publisher: 14, publisherLine: 19, follow: 13, followLine: 18, sponsor: 12, sponsorLine: 18 } as const;
export const EDITORIAL_CAMPAIGN = { gutter: 20, gap: 16, radius: 16, ratio: 1.44, title: 20, titleLine: 26, description: 14, descriptionLine: 20 } as const;
export type PublicationImageFormat = 'cover' | 'wide';
export const publicationImageFormat = (value: unknown): PublicationImageFormat => value === 'wide' ? 'wide' : 'cover';
export const EDITORIAL_ASPECT = { cover: 1.16, wide: 2.07, video: 1.25 } as const;
export function editorialHeroHeight(width: number, type?: string, format?: PublicationImageFormat) {
  return Math.round(width / (type === 'video' ? EDITORIAL_ASPECT.video : EDITORIAL_ASPECT[format ?? 'cover']));
}
export function editorialFeedRail(width: number, count: number) {
  const s = EDITORIAL_FEED, columns = width >= 600 ? 4 : 3;
  // Keep the same compact image scale for even a one-product editorial post.
  const cardWidth = Math.max(1, (width - 2 * s.gutter - columns * s.gap - s.peek) / columns);
  return { cardWidth, imageHeight: Math.round(cardWidth * s.ratio), snap: cardWidth + s.gap, scroll: count > columns };
}
export function editorialCampaignRail(width: number) {
  const s = EDITORIAL_CAMPAIGN, columns = width >= 600 ? 4 : 2;
  const cardWidth = Math.max(1, (width - 2 * s.gutter - (columns - 1) * s.gap) / columns);
  return { cardWidth, imageHeight: Math.round(cardWidth * s.ratio), snap: cardWidth + s.gap };
}
export function distinctPublicationSubtitle(title: string, subtitle: string) {
  const clean = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return clean(title) === clean(subtitle) ? '' : subtitle.trim();
}

export const EDITORIAL_CINEMA = { aspect: 1.125, title: 24, titleLine: 29, panelTop: 12, panelBottom: 16 } as const;
export const EDITORIAL_BANDS = { aspect: 2.5, top: 12, bottom: 12, panelTop: 16, panelBottom: 12, followTop: 8, pairTop: 12, pairGap: 8 } as const;

export const PUBLICATION_TEMPLATE = {
  referenceWidth: 360, maxContentWidth: 640, blockSpacing: 24, barTop: 4,
  mediaInset: EDITORIAL_FEED.gutter, imageAspect: EDITORIAL_ASPECT.wide, collectionImageAspect: EDITORIAL_ASPECT.cover, videoAspect: EDITORIAL_ASPECT.video, mediaRadius: EDITORIAL_FEED.radius, rowSpacing: EDITORIAL_FEED.gap,
  bandInset: EDITORIAL_CAMPAIGN.gutter, bandPaddingTop: EDITORIAL_BANDS.top, bandPaddingBottom: EDITORIAL_BANDS.bottom,
  panelPaddingTop: EDITORIAL_BANDS.panelTop, panelPaddingBottom: EDITORIAL_BANDS.panelBottom, followTop: EDITORIAL_BANDS.followTop,
  cardRatio: EDITORIAL_CAMPAIGN.ratio, cardRadius: EDITORIAL_CAMPAIGN.radius, cardSpacing: EDITORIAL_CAMPAIGN.gap, containerMediaAspect: EDITORIAL_BANDS.aspect,
  pairInset: EDITORIAL_CAMPAIGN.gutter, pairSpacing: EDITORIAL_CAMPAIGN.gap, pairMediaAspect: EDITORIAL_BANDS.aspect, pairTitleGap: EDITORIAL_BANDS.pairGap, pairCardsTop: EDITORIAL_BANDS.pairTop, pairCardRatio: EDITORIAL_CAMPAIGN.ratio,
  cinemaAspect: EDITORIAL_CINEMA.aspect, cinemaPanelTop: EDITORIAL_CINEMA.panelTop, cinemaPanelBottom: EDITORIAL_CINEMA.panelBottom, cinemaTitleSize: EDITORIAL_CINEMA.title, cinemaTitleLine: EDITORIAL_CINEMA.titleLine,
  wideFrom: 600,
} as const;

export function publicationTemplateMetrics(screenWidth: number) {
  const t = PUBLICATION_TEMPLATE;
  const width = Math.min(t.maxContentWidth, Number.isFinite(screenWidth) && screenWidth > 0 ? screenWidth : t.referenceWidth);
  const mediaWidth = Math.max(1, width - 2 * EDITORIAL_FEED.gutter);
  const bandWidth = Math.max(1, width - 2 * EDITORIAL_CAMPAIGN.gutter);
  const editorial = editorialFeedRail(width, 0);
  const campaign = editorialCampaignRail(width);
  // A duo stays a duo on large screens, without letting the cards grow past phone size.
  const pair = editorialCampaignRail(Math.min(400, width));
  return {
    width,
    media: { width: mediaWidth, imageHeight: editorialHeroHeight(mediaWidth, 'image', 'wide'), videoHeight: editorialHeroHeight(mediaWidth, 'video'), tileWidth: editorial.cardWidth, tileHeight: editorial.imageHeight },
    container: { cardWidth: campaign.cardWidth, cardImageHeight: campaign.imageHeight, snap: campaign.snap, mediaHeight: Math.round(bandWidth / EDITORIAL_BANDS.aspect) },
    cinema: { videoHeight: Math.round(width / EDITORIAL_CINEMA.aspect), cardWidth: campaign.cardWidth, cardImageHeight: campaign.imageHeight, snap: campaign.snap },
    pair: { tileWidth: pair.cardWidth, cardImageHeight: pair.imageHeight, mediaWidth: bandWidth, mediaHeight: Math.round(bandWidth / EDITORIAL_BANDS.aspect) },
  };
}
export type PublicationTemplateMetrics = ReturnType<typeof publicationTemplateMetrics>;

export const EDITORIAL_COLLECTION = { copy: 14, copyLine: 21, controlRadius: 22 } as const;
