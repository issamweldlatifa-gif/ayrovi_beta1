/**
 * Modèle `sponsored_pair` — planche GBox « WE Fashion » (14/11, 224107).
 *
 *   ┌──────── bandeau (couleur du CRM) ────────┐
 *   │ Sponsorisé ⓘ                              │
 *   │ Titre                 (gros, gras, 3 l.)  │
 *   │ Sous-titre                                │
 *   │   ┌──────────────────────────────────────── ← image : x = 24 dp, DÉBORDE à droite
 *   │   │  image (rapport 2,09)                    (« une image puis deux cartes »)
 *   └───┴────────────────────────────────────────
 *                   56 dp de blanc
 *   ╭──────────╮ ╭──────────╮
 *   │      ♡   │ │      ♡   │  ← 13/11 : deux cartes du système (164 dp, marge 12, écart 8), cœur nu
 *   │ [Nouveau]│ │          │
 *   ╰──────────╯ ╰──────────╯
 *   Sponsorisé   Sponsorisé
 *   Marque       Marque
 *   Nom          Nom
 *   Prix         Prix
 *
 * Avant le 14/11, le duo posait l'image et UNE carte côte à côte : le
 * propriétaire a signalé que « le modèle avec une image et deux cartes dessous »
 * ne correspondait pas. Le CRM accepte désormais 1 ou 2 produits ; avec un seul,
 * la carte garde sa largeur (jamais étirée).
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import type { PublicationBlock } from '@/api/publicationBlocks';
import { AppImage } from '@/design/appImage';
import { useTheme } from '@/design/theme';
import { useI18n, useT } from '@/i18n';
import { PUBLICATION_PALETTE as P, PUBLICATION_TYPE, PublicationSponsored, PublicationText } from '../publicationDesign';
import { publicationBlockFont } from '../publicationTokens';
import { blockInks } from './blockColors';
import { BlockProductCard } from './BlockProductCard';
import { PUBLICATION_TEMPLATE as T, type PublicationTemplateMetrics } from './templateMetrics';

export function SponsoredPairTemplate({
  block,
  metrics,
  onOpenProduct,
}: {
  block: PublicationBlock;
  metrics: PublicationTemplateMetrics;
  onOpenProduct: (id: string) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const products = block.products.slice(0, 2);
  const first = products[0];
  if (!first || !block.media) return null;
  const band = blockInks(block.bgColor, P.ink, P.paper);
  const paper = blockInks(P.paper, P.ink, P.paper);
  const heading = { fontFamily: publicationBlockFont(locale, 'heading') };
  const label = [block.sponsored ? t('publication.sponsored') : '', block.title, block.subtitle].filter(Boolean).join('. ');
  const direction = theme.isRTL ? 'row-reverse' : 'row';
  const reserveReference = products.some((product) => product.compareAtPrice != null && product.compareAtPrice > product.price);
  return (
    <View testID={`publication-block-${block.id}`} style={styles.block}>
      <View testID={`publication-block-${block.id}-band`} style={[styles.band, { backgroundColor: block.bgColor }]}>
        <View style={styles.bandText}>
          {block.sponsored ? (
            <PublicationSponsored color={band.muted} testID={`publication-block-${block.id}-sponsored`} />
          ) : (
            <PublicationText variant="caption" color={band.muted} numberOfLines={1}>{block.publisher.name}</PublicationText>
          )}
          <View style={styles.titles}>
            <PublicationText testID={`publication-block-${block.id}-title`} variant="h2" color={band.ink} numberOfLines={2} style={[styles.title, heading]}>
              {block.title}
            </PublicationText>
            {block.subtitle ? (
              <PublicationText variant="h2" color={band.ink} numberOfLines={3} style={[styles.title, heading]}>{block.subtitle}</PublicationText>
            ) : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          testID={`publication-block-${block.id}-sponsor`}
          onPress={() => onOpenProduct(first.id)}
          style={({ pressed }) => [
            styles.media,
            theme.isRTL ? styles.mediaRTL : styles.mediaLTR,
            { width: metrics.pair.mediaWidth, height: metrics.pair.mediaHeight },
            pressed ? { opacity: theme.opacity.subtle } : null,
          ]}
        >
          <AppImage testID={`publication-block-${block.id}-media`} uri={mediaUrl(block.media.url)} decorative contentFit="cover" style={styles.fill} />
        </Pressable>
      </View>

      <View testID={`publication-block-${block.id}-cards`} style={[styles.cards, { flexDirection: direction }]}>
        {products.map((product) => (
          <BlockProductCard
            key={product.id}
            product={product}
            width={metrics.pair.tileWidth}
            imageHeight={metrics.pair.cardImageHeight}
            sponsored={block.sponsored}
            inks={paper}
            reserveReference={reserveReference}
            onOpen={onOpenProduct}
            testID={`publication-block-${block.id}-product-${product.id}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { width: '100%' },
  band: { paddingTop: T.bandPaddingTop },
  bandText: { paddingHorizontal: T.bandInset },
  titles: { paddingTop: 8 },
  title: { fontSize: PUBLICATION_TYPE.bandTitleSize, lineHeight: PUBLICATION_TYPE.bandTitleLine },
  media: { marginTop: T.pairTitleGap, backgroundColor: P.neutral, overflow: 'hidden' },
  mediaLTR: { alignSelf: 'flex-end' },
  mediaRTL: { alignSelf: 'flex-start' },
  fill: { width: '100%', height: '100%' },
  cards: { paddingHorizontal: T.pairInset, paddingTop: T.pairCardsTop, gap: T.pairSpacing },
});
