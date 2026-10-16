/**
 * Carte « ce que nous avons reconnu » — l'équivalent ZAYROVI de l'« AI
 * Overview » de Google Lens.
 *
 * RÈGLE ABSOLUE : on n'affiche QUE ce que le serveur a publié.
 *   • `description` — soit le titre de la meilleure page trouvée par la
 *     recherche visuelle (SerpApi), soit la description donnée par la vision
 *     (Anthropic) quand SerpApi n'a rien trouvé. Jamais une phrase écrite
 *     par l'application.
 *   • `brand` / `model` / `category` — les mêmes champs, tels quels.
 *
 * Aucun prix, aucune disponibilité, aucun « ça ressemble à » : le prix vient
 * de la page marchande, et il arrive dans les cartes, pas ici.
 */
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/design/theme';
import { AppText } from '@/design/ui';
import { useT } from '@/i18n';
import type { LensIdentification } from '@/api/lens';

export function LensOverviewCard({ identification }: { identification: LensIdentification }) {
  const theme = useTheme();
  const t = useT();
  const description = String(identification.description || '').trim();
  const brand = String(identification.brand || '').trim();
  const model = String(identification.model || '').trim();
  // `product` / `other` sont des valeurs techniques du serveur, pas une
  // information à afficher : on ne montre que les catégories parlant.
  const rawCategory = String(identification.category || '').trim().toLowerCase();
  const category = ['product', 'other', 'unknown', 'general'].includes(rawCategory) ? '' : rawCategory;
  if (!description && !brand && !model) return null;

  const facts = [brand, model].filter(Boolean).join(' · ');
  return (
    <View
      style={[styles.wrap, { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider }]}
      testID="lens-overview-card"
    >
      <AppText variant="label" weight="bold" color={theme.colors.muted}>{t('lens.overview.title')}</AppText>
      {description ? (
        <AppText variant="body" weight="semibold" numberOfLines={3}>{description}</AppText>
      ) : null}
      {facts || category ? (
        <AppText variant="caption" color={theme.colors.muted} numberOfLines={1}>
          {[facts, category].filter(Boolean).join(' · ')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
});
