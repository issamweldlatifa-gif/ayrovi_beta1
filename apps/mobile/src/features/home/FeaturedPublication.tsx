/**
 * Section « à la une » de l'accueil — la dernière publication du magazine.
 *
 * Présentation (d'après la capture de référence) : une grande image aux coins
 * arrondis, puis le titre en gras, le sous-titre, et un bouton « Découvrir » en
 * contour pleine largeur.
 *
 * Règles :
 *  • la section ouvre la page PUBLICATIONS de l'application (jamais une page du site) ;
 *  • rien ne s'affiche tant que la publication n'est pas chargée, ou s'il n'y en a aucune :
 *    pas de bloc vide ni d'erreur sur l'accueil ;
 *  • une publication sans image garde son texte et son bouton.
 */
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { usePublications } from '@/api/hooks';
import { mediaUrl } from '@/api/client';
import type { Publication } from '@/api/social';
import { AppImage } from '@/design/appImage';
import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';

/** La publication la plus récente. Une date illisible compte pour la plus ancienne. */
export function latestPublication(rows: readonly Publication[] | undefined | null): Publication | null {
  if (!rows || rows.length === 0) return null;
  const time = (row: Publication) => {
    const value = Date.parse(row.publishAt);
    return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
  };
  return rows.reduce((best, row) => (time(row) > time(best) ? row : best));
}

export function FeaturedPublication() {
  const theme = useTheme();
  const t = useT();
  const publications = usePublications();
  const featured = latestPublication(publications.data);

  if (!featured) return null;

  return (
    <View style={styles.section} testID="home-featured">
      <AppText variant="caption" color={theme.colors.muted}>{t('home.featured.label')}</AppText>

      {featured.imageUrl ? (
        <AppImage
          uri={mediaUrl(featured.imageUrl)}
          style={[styles.image, { borderRadius: theme.radius.card }]}
          contentFit="cover"
          accessibilityLabel={featured.title || undefined}
          decorative={!featured.title}
        />
      ) : null}

      {featured.title ? (
        <AppText variant="title" weight="bold">{featured.title}</AppText>
      ) : null}
      {featured.subtitle ? (
        <AppText variant="body" color={theme.colors.secondary}>{featured.subtitle}</AppText>
      ) : null}

      <Button
        label={t('home.featured.cta')}
        tone="quiet"
        block
        onPress={() => { router.push('/publications'); }}
        testID="home-featured-cta"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  // Presque carré, comme la référence : l'image porte la section.
  image: { width: '100%', aspectRatio: 1, overflow: 'hidden' },
});
