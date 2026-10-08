/**
 * Les cinq onglets du produit : Accueil · Lens · AYWEBs · Panier · Compte.
 *
 * Les icônes sont des glyphes texte uniquement si la fonte d'icônes n'est pas
 * disponible — sinon des icônes vectorielles. Aucun onglet n'existe sans son
 * écran : un onglet mort est un mensonge à l'utilisateur.
 */
import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useT } from '@/i18n';
import { useTheme } from '@/design/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  index: { active: 'home', inactive: 'home-outline' },
  lens: { active: 'scan-circle', inactive: 'scan-circle-outline' },
  aywebs: { active: 'pricetags', inactive: 'pricetags-outline' },
  cart: { active: 'bag-handle', inactive: 'bag-handle-outline' },
  account: { active: 'person', inactive: 'person-outline' },
};

export default function TabsLayout() {
  const theme = useTheme();
  const t = useT();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.ink,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          backgroundColor: theme.colors.canvas,
          borderTopColor: theme.colors.line,
          borderTopWidth: 1,
          paddingTop: 6,
          // En arabe, le premier onglet doit être à DROITE : un utilisateur
          // arabophone ne cherche pas « الرئيسية » à gauche. La direction est
          // posée sur la barre, pas sur toute l'application — le contenu
          // (images marchandes, chiffres, liens) garde son sens de lecture.
          ...(theme.isRTL ? { direction: 'rtl' as const } : null),
          // Barre VOLONTAIREMENT FIXE. Le repli au défilement est construit et
          // testé (`design/chrome`) mais désactivé ici : une barre qui saccade
          // sur un appareil modeste est pire qu’une barre stable. Réactiver =
          // restaurer `useChromeScroll` et le bloc `chromeHidden`.
        },
        tabBarLabelStyle: {
          ...theme.text('caption', 'bold'),
          fontSize: 11,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const pair = ICONS[route.name] ?? ICONS.index;
          return <Ionicons name={focused ? pair.active : pair.inactive} size={size ?? 24} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="lens" options={{ title: t('tabs.lens') }} />
      <Tabs.Screen name="aywebs" options={{ title: t('tabs.aywebs') }} />
      <Tabs.Screen name="cart" options={{ title: t('tabs.cart') }} />
      <Tabs.Screen name="account" options={{ title: t('tabs.account') }} />
    </Tabs>
  );
}
