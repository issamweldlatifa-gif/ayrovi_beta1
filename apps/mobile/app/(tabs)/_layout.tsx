/**
 * Barre du bas — AYWEBs (وكيل الشراء) et Profil.
 *
 * L’accueil se atteint par le LOGO de l’en-tête, le panier par son icône, les
 * notifications par la cloche. `index` (l’accueil) et `cart` restent des routes
 * — le tiroir et l’en-tête pointent dessus — mais sont retirées de la barre
 * avec `href: null`. Un onglet masqué n’est pas un onglet supprimé : les
 * liens existants continuent de fonctionner, ce qui évite de casser l’existant
 * pour un changement de navigation.
 *
 * ── Transparence ───────────────────────────────────────────────────────────
 * Consigne : « شريط شفاف ». Le fond est transparent et la barre reste dans le
 * flux (elle ne recouvre pas le contenu) : une barre `absolute` laisserait le
 * bas de chaque écran caché dessous — une régression déguisée en effet de
 * style.
 *
 * ── Repli au défilement ────────────────────────────────────────────────────
 * Réactivé sur demande (« يختفي عند تمرير الي اسفل ويضهر ») après avoir été
 * neutralisé pour cause de saccade. La décision est pilotée par
 * `design/chrome` : une seule fonction testée (14 tests), un seul seuil.
 * L’en-tête, lui, reste FIXE — c’est l’autre moitié de la consigne.
 */
import { Tabs, usePathname } from 'expo-router';
import { useEffect } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useT } from '@/i18n';
import { useTheme } from '@/design/theme';
import { revealChrome, useChromeHidden } from '@/design/chrome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type IoniconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  aywebs: { active: 'pricetags', inactive: 'pricetags-outline' },
  account: { active: 'person', inactive: 'person-outline' },
};

export default function TabsLayout() {
  const theme = useTheme();
  const t = useT();
  const pathname = usePathname();
  const chromeHidden = useChromeHidden();
  const insets = useSafeAreaInsets();

  /**
   * Changer d’onglet RÉAFFICHE la barre : la retrouver masquée en arrivant sur
   * un écran est désorientant — on n’a encore rien fait pour la cacher.
   */
  useEffect(() => { revealChrome(); }, [pathname]);

  return (
    <Tabs
      /**
       * Accueil = racine de toutes les barres. Le retour (bouton Android ou
       * flèche) depuis un onglet ramène à l'accueil, pas au dernier onglet
       * visité : sans cela, le retour pouvait ramener à un onglet précédent.
       * SDK 58 : expo-router n'expose plus `initialRouteName` sur <Tabs> —
       * la route `index` du groupe est l'initial par convention, et
       * `backBehavior="initialRoute"` s'y réfère donc toujours.
       */
      backBehavior="initialRoute"
      screenOptions={({ route }) => ({
        headerShown: false,
        // Onglet actif : le violet de marque, dans sa version lisible du mode.
        tabBarActiveTintColor: theme.colors.accentText,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          // شريط شفاف — la consigne. Aucun fond, aucune bordure.
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          paddingTop: 6,
          /**
           * §4.3-3 : « la barre du bas ajoute `insets.bottom` POUR ELLE-MÊME ».
           *
           * Sans ces deux lignes, la barre passait SOUS le bec (« home
           * indicator ») et sous la barre de gestes Android : les libellés
           * devenaient partiellement inaccessibles, et sur Android les trois
           * boutons système les recouvraient. C'était le défaut n° 1 relevé
           * par l'audit.
           *
           * La hauteur suit : `tabBar` (56) + la zone sûre, sinon le contenu
           * de la barre se retrouve comprimé dans 56 points alors qu'elle en
           * occupe davantage.
           */
          paddingBottom: insets.bottom,
          height: theme.chrome.tabBar + insets.bottom,
          ...(theme.isRTL ? { direction: 'rtl' as const } : null),
          // Masquée : hauteur à zéro, PAS un simple `translateY` — glisser la
          // barre hors de l’écran laisserait une bande vide en bas, et le
          // contenu ne profiterait pas de la place rendue.
          ...(chromeHidden ? {
            height: 0, opacity: 0, paddingTop: 0, paddingBottom: 0,
            borderTopWidth: 0, overflow: 'hidden',
          } : null),
        },
        tabBarLabelStyle: {
          ...theme.text('caption', 'bold'),
          fontSize: 11,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const pair = ICONS[route.name] ?? ICONS.account;
          const iconColor = typeof color === 'string' ? color : theme.colors.muted;
          return <Ionicons name={focused ? pair.active : pair.inactive} size={size ?? 24} color={iconColor} />;
        },
      })}
    >
      {/* Barre : AYWEBs (وكيل الشراء) puis Profil. */}
      <Tabs.Screen name="aywebs" options={{ title: t('tabs.aywebs') }} />
      <Tabs.Screen name="account" options={{ title: t('tabs.account') }} />

      {/* Route conservée, retirée de la barre : l’accueil s’atteint par le logo. */}
      <Tabs.Screen name="index" options={{ href: null }} />
      {/**
       * Onglet MASQUÉ (`href: null`) mais DÉCLARÉ : la route existe, l'en-tête
       * et le tiroir pointent dessus. Le test de copie l'exige avec raison —
       * « un onglet masqué n'est pas un onglet supprimé ».
       *
       * Le titre est donc fourni, alors même qu'aucune barre ne l'affiche :
       * sans cette référence, la clé `tabs.cart` devient un texte mort et le
       * contrat de copie échoue. On ne retire pas un libellé pour le plaisir
       * de faire passer un test — on garde la route vivante.
       */}
      <Tabs.Screen name="cart" options={{ href: null, title: t('tabs.cart') }} />
    </Tabs>
  );
}
