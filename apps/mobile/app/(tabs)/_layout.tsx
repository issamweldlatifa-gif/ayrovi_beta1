/**
 * Barre du bas — les cinq OUTILS, et rien d’autre.
 *
 * ── Ce qui a changé, et pourquoi ───────────────────────────────────────────
 * L’ancienne barre portait des DESTINATIONS (Accueil · Compte · Panier). La
 * consigne produit est différente : la barre porte les outils
 * (Lens · AYWEBs · SONIM · Vision · OCEREX), l’accueil se atteint par le LOGO
 * de l’en-tête, le compte et le panier par leurs icônes en haut à droite.
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

type IoniconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  lens: { active: 'scan-circle', inactive: 'scan-circle-outline' },
  aywebs: { active: 'pricetags', inactive: 'pricetags-outline' },
  sonim: { active: 'chatbubble-ellipses', inactive: 'chatbubble-ellipses-outline' },
  vision: { active: 'eye', inactive: 'eye-outline' },
  ocerex: { active: 'camera', inactive: 'camera-outline' },
};

export default function TabsLayout() {
  const theme = useTheme();
  const t = useT();
  const pathname = usePathname();
  const chromeHidden = useChromeHidden();

  /**
   * Changer d’onglet RÉAFFICHE la barre : la retrouver masquée en arrivant sur
   * un écran est désorientant — on n’a encore rien fait pour la cacher.
   */
  useEffect(() => { revealChrome(); }, [pathname]);

  return (
    <Tabs
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
          // En arabe, le premier outil est à DROITE : un utilisateur arabophone
          // ne cherche pas « Lens » à gauche.
          ...(theme.isRTL ? { direction: 'rtl' as const } : null),
          // Masquée : hauteur à zéro, PAS un simple `translateY` — glisser la
          // barre hors de l’écran laisserait une bande vide en bas, et le
          // contenu ne profiterait pas de la place rendue.
          ...(chromeHidden ? {
            height: 0, opacity: 0, paddingTop: 0, borderTopWidth: 0, overflow: 'hidden',
          } : null),
        },
        tabBarLabelStyle: {
          ...theme.text('caption', 'bold'),
          fontSize: 11,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const pair = ICONS[route.name] ?? ICONS.lens;
          return <Ionicons name={focused ? pair.active : pair.inactive} size={size ?? 24} color={color} />;
        },
      })}
    >
      {/* Les cinq outils — ordre volontaire : en RTL ils apparaîtront de droite
          à gauche, Lens le premier. */}
      <Tabs.Screen name="lens" options={{ title: t('tabs.lens') }} />
      <Tabs.Screen name="aywebs" options={{ title: t('tabs.aywebs') }} />
      <Tabs.Screen name="sonim" options={{ title: t('tabs.sonim') }} />
      <Tabs.Screen name="vision" options={{ title: t('tabs.vision') }} />
      <Tabs.Screen name="ocerex" options={{ title: t('tabs.ocerex') }} />

      {/* Routes conservées, retirées de la barre : l’accueil s’atteint par le
          logo, le compte et le panier par l’en-tête. */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="account" options={{ href: null }} />
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
