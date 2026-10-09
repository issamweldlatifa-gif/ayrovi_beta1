/**
 * Bannière « hors ligne » — affichée par la racine quand `expo-network`
 * rapporte une connexion coupée.
 *
 * Pourquoi dans le flux et PAS en `position: absolute` : le verrou §17
 * n'autorise `absolute` que pour une vraie superposition, et ce bandeau n'en
 * est pas une — il Pousse le contenu vers le bas quand le réseau tombe, ce
 * qui est honnête (l'état est visible, rien ne recouvre le contenu).
 *
 * Sémantique : avertissement (warning), JAMAIS la marque — un état n'est pas
 * de l'orange (§2.10.2), et le budget orange ne bouge pas.
 */
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from './ui';
import { useTheme } from './theme';
import { useT } from '@/i18n';

export function NetworkBanner() {
  const theme = useTheme();
  const t = useT();
  return (
    <View
      accessibilityRole="alert"
      testID="network-banner"
      style={[
        styles.banner,
        {
          backgroundColor: theme.status.warning.soft,
          borderBottomColor: theme.status.warning.border,
        },
      ]}
    >
      <Ionicons
        name="cloud-offline-outline"
        size={theme.iconSize.sm}
        color={theme.status.warning.fg}
        accessibilityElementsHidden
      />
      <AppText variant="caption" weight="bold" color={theme.status.warning.fg}>
        {t('offline.banner')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
