/**
 * Section « à la une » de l'accueil, sous les onglets.
 *
 * Présentation (d'après la capture de référence) : une grande image aux coins
 * arrondis, puis le titre en gras, le sous-titre, et un bouton « Découvrir » en
 * contour pleine largeur.
 *
 * Qui décide : l'ADMIN (Contenu → Section à la une) — affichée ou non, publication
 * choisie ou la plus récente, libellé du bouton. Le serveur ne renvoie que des
 * publications publiées ; l'application n'invente rien.
 *
 * Règles :
 *  • le bouton ouvre la page Publications de l'APPLICATION (jamais une page du site) ;
 *  • rien ne s'affiche tant que le réglage n'est pas lu, ni si la section est masquée
 *    ou si aucune publication n'est à montrer : pas de bloc vide sur l'accueil ;
 *  • une publication sans image garde son texte et son bouton.
 */
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { useHomeFeatured } from '@/api/hooks';
import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { MEDIA_RATIO } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';

export function FeaturedPublication() {
  const theme = useTheme();
  const t = useT();
  const featured = useHomeFeatured();
  const publication = featured.data?.publication ?? null;

  if (!publication) return null;

  const ctaLabel = featured.data?.ctaLabel || t('home.featured.cta');

  return (
    <View style={styles.section} testID="home-featured">
      <AppText variant="caption" color={theme.colors.muted}>{t('home.featured.label')}</AppText>

      {publication.imageUrl ? (
        <AppImage
          uri={mediaUrl(publication.imageUrl)}
          style={[styles.image, { borderRadius: theme.radius.card }]}
          contentFit="cover"
          accessibilityLabel={publication.title || undefined}
          decorative={!publication.title}
        />
      ) : null}

      {publication.title ? (
        <AppText variant="title" weight="semibold">{publication.title}</AppText>
      ) : null}
      {publication.subtitle ? (
        <AppText variant="body" color={theme.colors.secondary}>{publication.subtitle}</AppText>
      ) : null}

      <Button
        label={ctaLabel}
        tone="quiet"
        block
        onPress={() => { router.push('/publications'); }}
        testID="home-featured-cta"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Marge horizontale = celle de l'écran (AppScreen) : pas de double marge.
  section: { paddingVertical: 16, gap: 12 },
  // Pleine largeur de la colonne (même marge que le reste de l'accueil), hauteur = ratio du système.
  image: { width: '100%', aspectRatio: MEDIA_RATIO.square, overflow: 'hidden' },
});
