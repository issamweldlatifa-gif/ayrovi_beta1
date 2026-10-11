/**
 * Logo « ▶ Reels • Shop » — la marque des Reels, à deux endroits : l'en-tête de la
 * section d'accueil et l'en-tête transparent de la visionneuse plein écran.
 *
 * Règle typographique (demande du client) : « Reels » est en GRAS et pleine
 * couleur, « Shop » est plus léger et gris. Le triangle a le même poids visuel
 * que le libellé (même taille de police que la ligne).
 *
 * Le nom de la marque n'est pas traduit : c'est un logo, pas un texte d'interface.
 */
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';

export interface ReelsShopMarkProps {
  /** `onMedia` = blanc, pour poser le logo sur une vidéo. */
  tone?: 'ink' | 'onMedia';
}

export function ReelsShopMark({ tone = 'ink' }: ReelsShopMarkProps) {
  const theme = useTheme();
  const t = useT();
  const main = tone === 'onMedia' ? theme.colors.onMedia : theme.colors.ink;
  // « Shop » reste plus discret que « Reels » sur les deux fonds.
  const secondary = tone === 'onMedia' ? 'rgba(255,255,255,0.7)' : theme.colors.muted;

  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={t('home.reelsShop.label')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <Ionicons name="play" size={18} color={main} accessibilityElementsHidden />
      <AppText variant="title" weight="semibold" color={main}>Reels</AppText>
      <AppText variant="title" color={secondary}>•</AppText>
      <AppText variant="title" color={secondary}>Shop</AppText>
    </View>
  );
}
