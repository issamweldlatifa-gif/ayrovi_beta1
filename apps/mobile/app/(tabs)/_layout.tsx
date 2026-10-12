/**
 * Barre du bas — les quatre OUTILS et le Profil.
 *
 * ── Ce qui a changé, et pourquoi ───────────────────────────────────────────
 * La barre porte désormais : Lens · AYWEBs · SONIM · Vision · Profil. OCEREX
 * n’y figure plus (route conservée, sans fusion avec Lens). L’accueil se
 * atteint par le LOGO de l’en-tête, le panier par son icône, les notifications
 * par la cloche.
 *
 * `index` (l’accueil) et les anciens onglets Compte/Panier restent donc des
 * routes — le tiroir et l’en-tête pointent dessus — mais sont retirés de la
 * barre avec `href: null`. Un onglet masqué n’est pas un onglet supprimé : les
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
       * visité : sans cela, on revenait à Lens depuis SONIM.
       */
      initialRouteName="index"
      backBehavior="initialRoute"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
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
          // En arabe, le premier outil est à DROITE : un utilisateur arabophone
          // ne cherche pas « Lens » à gauche.
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
          return <Ionicons name={focused ? pair.active : pair.inactive} size={size ?? 24} color={color} />;
        },
      })}
    >
      {/* Barre : Lens · AYWEBs · SONIM · Vision · Profil. Ordre voulu ; en RTL
          la barre se lit de droite à gauche, Lens reste le premier. */}
      <Tabs.Screen name="account" options={{ title: t('tabs.account') }} />

      {/* OCEREX retiré de la barre : la route reste déclarée (aucune fusion
          avec Lens), elle n’est simplement plus un onglet. */}

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
