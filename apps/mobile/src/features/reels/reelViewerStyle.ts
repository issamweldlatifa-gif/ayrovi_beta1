/** Fullscreen-only optical and touch measurements, in dp (720px reference at 2×). */
export const REEL_VIEWER = {
  inset: 12, railCenter: 32, railStep: 52, railTarget: 44, railGlyph: 24,
  railReserve: 64, railCenterOffset: 4,
  pillHeight: 48, pillMinWidth: 164, pillPad: 22, pillGap: 10, pillGlyph: 22,
  pillBottom: 30, cardBottom: 14, cardGap: 12, nextCardPeek: 4,
  headerTarget: 44, backDisc: 40, backGlyph: 24, infoDisc: 24, infoGlyph: 18,
  playDisc: 48, playGlyph: 20, avatar: 24, thumbRatio: 0.30, cardRatio: 0.456,
  cardRadius: 12, paper: '#FFFFFF', ink: '#000000', photo: '#F3F3F3', secondary: '#555555', savings: '#AF0922',
} as const;

export function reelViewerCardSize(viewportWidth: number, fontScale = 1) {
  const v = REEL_VIEWER;
  const width = Math.max(1, Math.min(420, Math.round(viewportWidth - v.inset - v.cardGap - v.nextCardPeek)));
  return { width, height: Math.max(Math.round(width * v.cardRatio), Math.round(100 * fontScale)), thumb: Math.round(width * v.thumbRatio) };
}

export function reelViewerAnchors(cardHeight: number, safeBottom: number, hasProducts: boolean, open: boolean, fontScale = 1) {
  const v = REEL_VIEWER;
  const pillHeight = Math.max(v.pillHeight, Math.ceil(21 * fontScale) + 16);
  const trayHeight = cardHeight + v.cardBottom + safeBottom;
  const pillBottom = open && hasProducts ? trayHeight + 16 : safeBottom + v.pillBottom;
  return { trayHeight, pillBottom, pillHeight,
    captionBottom: hasProducts ? pillBottom + pillHeight + 14 : pillBottom + 4,
    railBottom: pillBottom + v.railCenterOffset + (pillHeight - v.railTarget) / 2,
  };
}

/** This family is already distributed in the app under OFL, not remote web CSS. */
export const REEL_TYPE = {
  publisher: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 14, lineHeight: 24 },
  pill: { fontSize: 16, lineHeight: 21 },
  brand: { fontSize: 14, lineHeight: 19 },
  product: { fontSize: 13, lineHeight: 18 },
  price: { fontSize: 14, lineHeight: 19 },
  reference: { fontSize: 12, lineHeight: 17 },
} as const;
