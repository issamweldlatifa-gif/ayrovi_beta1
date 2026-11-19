import { distinctPublicationSubtitle, EDITORIAL_FEED as E } from '../../../../../../shared/publicationEditorial';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { PublicationBlock } from '@/api/publicationBlocks';
import { useTheme } from '@/design/theme';
import { veil } from '@/design/tokens.mobile';
import { useI18n, useT } from '@/i18n';
import { FOLLOW_ON_MEDIA, PublicationFollow } from '../PublicationFollow';
import { PUBLICATION_PALETTE as P, PublicationSponsored, PublicationText } from '../publicationDesign';
import { publicationBlockFont } from '../publicationTokens';
import { blockInks } from './blockColors';
import { BlockProductCard } from './BlockProductCard';
import { publicationRailDirection } from './railDirection';
import { PublicationVideo } from './PublicationVideo';
import { PUBLICATION_TEMPLATE as T, type PublicationTemplateMetrics } from './templateMetrics';

/** Ombre du titre posé sur la vidéo : nette, jamais un halo gris. */
export const CINEMA_TITLE_SHADOW = { textShadowColor: veil(0.6), textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } } as const;

export function CinemaTemplate({
  block,
  metrics,
  active,
  onOpenProduct,
}: {
  block: PublicationBlock;
  metrics: PublicationTemplateMetrics;
  active: boolean;
  onOpenProduct: (id: string) => void;
}) {
  const theme = useTheme();
  const orientation = publicationRailDirection(theme.isRTL);
  const t = useT();
  const { locale } = useI18n();
  const media = block.media;
  if (!media) return null;
  const panel = blockInks(block.bgColor, P.ink, P.paper);
  const heading = { fontFamily: publicationBlockFont(locale, 'heading') };
  const subtitle = distinctPublicationSubtitle(block.title, block.subtitle);
  const label = block.subtitle ? `${block.title}. ${block.subtitle}` : block.title;
  const reserveReference = block.products.some((product) => product.compareAtPrice != null && product.compareAtPrice > product.price);
  const scrolls = block.products.length > 2;
  const cards = block.products.map((product) => (
    <BlockProductCard
      key={product.id}
      product={product}
      width={metrics.cinema.cardWidth}
      imageHeight={metrics.cinema.cardImageHeight}
      railTileStyle={scrolls ? orientation.tile : undefined}
      compact
      sponsored={false}
      inks={panel}
      reserveReference={reserveReference}
      onOpen={onOpenProduct}
      testID={`publication-block-${block.id}-product-${product.id}`}
    />
  ));

  return (
    <View testID={`publication-block-${block.id}`} style={[styles.block, { backgroundColor: block.bgColor }]}>
      <View testID={`publication-block-${block.id}-media`} style={[styles.media, { height: metrics.cinema.videoHeight }]}>
        {media.type === 'video' ? (
          <PublicationVideo fit="contain" uri={media.url} poster={media.poster} active={active} label={label} testID={`publication-block-${block.id}-video`} />
        ) : null}
        {/* Voile central : le titre blanc reste éclatant même sur une scène claire. */}
        <LinearGradient
          pointerEvents="none"
          colors={[veil(0), veil(0.38), veil(0)]}
          locations={[0.2, 0.5, 0.8]}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.center} testID={`publication-block-${block.id}-headline`}>
          <PublicationText
            testID={`publication-block-${block.id}-title`}
            variant="h2"
            color={FOLLOW_ON_MEDIA.ink}
            numberOfLines={2}
            style={[styles.title, heading, CINEMA_TITLE_SHADOW]}
          >
            {block.title}
          </PublicationText>
          {subtitle ? (
            <PublicationText variant="body" color={FOLLOW_ON_MEDIA.ink} numberOfLines={2} style={[styles.subtitle, CINEMA_TITLE_SHADOW]}>
              {subtitle}
            </PublicationText>
          ) : null}
        </View>
        {/* Éditeur + « Suivre » EN HAUT de la vidéo, blanc sur voile dégradé (comme le modèle `media`). */}
        <View pointerEvents="box-none" style={styles.top} testID={`publication-block-${block.id}-follow-overlay`}>
          <LinearGradient pointerEvents="none" colors={[FOLLOW_ON_MEDIA.scrim, veil(0)]} style={StyleSheet.absoluteFill} />
          <PublicationFollow
            look="media"
            publisherId={block.publisher.id}
            publisherName={block.publisher.name}
            ink={FOLLOW_ON_MEDIA.ink}
            muted={FOLLOW_ON_MEDIA.ink}
            testID={`publication-block-${block.id}-follow`}
          />
          {block.sponsored ? (
            <View style={styles.sponsored}>
              <PublicationSponsored color={FOLLOW_ON_MEDIA.ink} testID={`publication-block-${block.id}-sponsored`} />
            </View>
          ) : null}
        </View>
      </View>

      <View testID={`publication-block-${block.id}-panel`} style={styles.panel}>
        {scrolls ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel={t('publication.products', { title: block.title })}
            testID={`publication-block-${block.id}-row`}
            style={orientation.viewport}
            contentContainerStyle={styles.rowContent}
            decelerationRate="fast"
            snapToInterval={metrics.cinema.snap}
            snapToAlignment="start"
            disableIntervalMomentum
          >
            {cards}
          </ScrollView>
        ) : (
          <View testID={`publication-block-${block.id}-pair`} style={[styles.rowContent, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>{cards}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { width: '100%' },
  media: { width: '100%', overflow: 'hidden', backgroundColor: P.ink },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: T.bandInset * 2, gap: 4 },
  title: { fontSize: T.cinemaTitleSize, lineHeight: T.cinemaTitleLine, textAlign: 'center' },
  subtitle: { textAlign: 'center', fontSize: E.description, lineHeight: E.descriptionLine },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: T.bandInset, paddingTop: 8, paddingBottom: 32 },
  sponsored: { paddingTop: 4 },
  panel: { paddingTop: T.cinemaPanelTop, paddingBottom: T.cinemaPanelBottom },
  rowContent: { paddingHorizontal: T.bandInset, gap: T.cardSpacing },
});
