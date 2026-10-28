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
import { AppImage } from '@/design/appImage';
import { useT } from '@/i18n';
import { useTheme } from '@/design/theme';
import { revealChrome, useChromeHidden } from '@/design/chrome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type IoniconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  account: { active: 'person', inactive: 'person-outline' },
};

/**
 * Onglet AYWEBs — c'est le MOT-SYMBOLE qui tient lieu d'icône (28/10/2026 :
 * « الأيقونة الحالية بش تولي شعار — هو أيقونة، بطريقة متناسقة »).
 *
 * Même fichier officiel que l'en-tête, même traitement : violet de marque en
 * thème clair, blanc en thème sombre (le violet #571EF6 sur #0A0A0A ne se lit
 * pas). 75 × 20, soit exactement le ratio du fichier (551 × 147 ≈ 3.75) :
 * aucune déformation, et une hauteur qui tient dans la barre à côté du libellé.
 */
const AYWEB_TAB_LOGO = { width: 75, height: 20 };

/**
 * Filet de sécurité de l'écran : si le rendu lève, expo-router affiche le repli
 * (arabe + français, bouton « عاود ») à la place de l'écran — l'application
 * reste ouverte, l'utilisateur peut revenir. Voir `src/design/AppErrorBoundary.tsx`
 * et la cause du 25/10/2026 (ordre des hooks). Toute route en a un : c'est
 * vérifié par `tests/error-boundary-coverage.test.ts`.
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

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
       */
      initialRouteName="index"
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
        tabBarLabelStyle: { ...theme.text('caption', 'bold') },
        tabBarIcon: ({ focused, color, size }) => {
          if (route.name === 'aywebs') {
            return (
              <AppImage
                localSource={
                  theme.mode === 'dark'
                    ? require('../../assets/aywebs/aywebs-wordmark-white.png')
                    : require('../../assets/aywebs/aywebs-wordmark-violet.png')
                }
                contentFit="contain"
                decorative
                background={null}
                style={AYWEB_TAB_LOGO}
                testID="aywebs-tab-logo"
              />
            );
          }
          const pair = ICONS[route.name] ?? ICONS.account;
          return <Ionicons name={focused ? pair.active : pair.inactive} size={size ?? theme.iconSize.md} color={color} />;
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
