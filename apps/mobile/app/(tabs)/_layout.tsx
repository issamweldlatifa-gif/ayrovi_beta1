/**
 * Barre du bas — AYWEBs (وكيل الشراء) et Profil.
 *
 * L’accueil se atteint par le LOGO de l’en-tête, le panier par son icône, les
 * notifications par la cloche. `index` (l’accueil) et `cart` restent des routes
 * — le tiroir et l’en-tête pointent dessus — mais n’ont pas de bouton dans la
 * barre. SDK 58 : `href: null` les rendrait `hidden` et le routeur
 * redirigerait alors leur focus vers le premier onglet visible ; on utilise
 * donc `NO_TAB_BUTTON` (bouton nul, encombrement nul, route toujours
 * ouvrable). Une route sans bouton n’est pas une route supprimée : les liens
 * existants continuent de fonctionner, ce qui évite de casser l’existant.
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

/**
 * SDK 58 : `initialRouteName` n'est plus une prop de `<Tabs>` (erreur de type
 * explicite). Le remplacement officiel est `unstable_settings.anchor` : il dit
 * au routeur que l'écran D'ACCUEIL (`index` — Hero, sections, Reels, Lens) est
 * la première route du groupe, donc celle qui s'ouvre au lancement et celle que
 * `backBehavior="initialRoute"` rejoint. Sans lui, le routeur retombait sur la
 * première route déclarée (`aywebs`) et l'accueil disparaissait de l'ouverture.
 */
export const unstable_settings = {
  anchor: 'index',
};

/**
 * Route OUVRABLE mais SANS BOUTON dans la barre (accueil `index`, panier
 * `cart`) — contrat d'affichage historique : la barre ne montre que AYWEBs et
 * Profil, alors que le logo, le tiroir et l'icône panier continuent d'ouvrir
 * ces écrans.
 *
 * Pourquoi pas `href: null` : en SDK 58, `href: null` pose `hidden: true`
 * (TabsClient.processScreens) et `useVisibleTabsWithRedirect` remplace toute
 * route masquée qui reçoit le focus par la PREMIÈRE route visible (`aywebs`)
 * — l'accueil et le panier devenaient inaccessibles. La route reste donc
 * déclarée et visible pour le routeur (pas de `hidden`, pas de redirection),
 * mais son bouton ne rend rien et son encombrement est nul : aucun onglet
 * fantôme, la barre ne garde que les deux vrais boutons.
 */
export const NO_TAB_BUTTON = {
  tabBarButton: () => null,
  tabBarItemStyle: { display: 'none' as const },
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
       * SDK 58 : expo-router n'expose plus `initialRouteName` sur <Tabs>.
       * L'ancre est posée par `unstable_settings.anchor = 'index'` ci-dessus ;
       * `backBehavior="initialRoute"` rejoint alors cette ancre (l'accueil).
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

      {/* Accueil : ouvrable (logo, tiroir, lien « / ») mais sans bouton dans la
          barre — NO_TAB_BUTTON, pas `href: null` (qui déclencherait la
          redirection SDK 58 vers le premier onglet visible). */}
      <Tabs.Screen name="index" options={{ ...NO_TAB_BUTTON, title: t('tabs.home') }} />
      {/**
       * Panier : déclaré et OUVRABLE (icône panier de l'en-tête, ponts
       * d'ajout AYWEBs, liens profonds /cart et /panier) mais sans bouton dans
       * la barre — NO_TAB_BUTTON plutôt que `href: null`, qui le rendrait
       * `hidden` et donc redirigé vers le premier onglet visible en SDK 58.
       * Le titre garde la clé `tabs.cart` référencée par le contrat de copie.
       */}
      <Tabs.Screen name="cart" options={{ ...NO_TAB_BUTTON, title: t('tabs.cart') }} />
    </Tabs>
  );
}
