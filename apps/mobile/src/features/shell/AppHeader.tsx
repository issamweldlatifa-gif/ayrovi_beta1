/**
 * En-tête applicatif — fixe, transparent au sommet, surface lisible après scroll.
 *
 * L’en-tête reste hors du ScrollView : sa géométrie et sa position ne bougent
 * jamais. `AppScreen` lui transmet l’état de défilement : le fond et le liseré
 * changent, sans déplacer le contenu; au sommet, les icônes gardent une ombre.
 *
 * ── Le menu ────────────────────────────────────────────────────────────────
 * Le tiroir regroupe des destinations réellement câblées (Accueil, Catalogue,
 * Commandes, Compte et SONIM). Aucun élément décoratif n’est rendu cliquable.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BrandMark } from '@/design/BrandMark';
import { Drawer, DrawerItem } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { adaptiveInk } from '@/features/home/heroPalette';

function HeaderIcon({
  name, label, onPress, color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.icon,
        {
          width: theme.geometry.minTarget,
          height: theme.geometry.minTarget,
          opacity: pressed ? 0.55 : 1,
        },
      ]}
      hitSlop={8}
    >
      <Ionicons name={name} size={22} color={color} />
    </Pressable>
  );
}

export function AppHeader({
  scrolled, heroBackground = null,
}: {
  scrolled: boolean;
  /** Fond de la carte Hero active : repris par le header tant qu'il est au sommet. */
  heroBackground?: string | null;
}) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  // Au sommet, sur une carte Hero : le header prend sa couleur et ses icônes
  // suivent la luminance du fond. Après défilement : surface lisible d'origine.
  const onHero = !scrolled && heroBackground !== null;
  const barBackground = onHero ? heroBackground : (scrolled ? theme.colors.surface : 'transparent');
  // Encre adaptée au fond (blanc sur fond sombre, noir sur fond clair), sans ombre :
  // l'ombre sombre sur les icônes alourdissait le header.
  const iconColor = onHero ? adaptiveInk(heroBackground, theme.colors) : theme.colors.ink;

  // En arabe, la lecture commence à droite : le logo est à DROITE, les actions
  // à gauche. Mettre le logo à gauche en RTL, c’est commencer une phrase par la
  // fin.
  const row = theme.isRTL ? 'row-reverse' : 'row';

  const go = (href: string) => {
    setMenuOpen(false);
    router.push(href as never);
  };

  return (
    <>
      <View
        style={[
          styles.bar,
          {
            height: insets.top + theme.chrome.header,
            paddingTop: insets.top + theme.space[2],
            paddingBottom: theme.space[1],
            paddingHorizontal: theme.space[2],
            flexDirection: row,
            backgroundColor: barBackground,
            borderBottomColor: scrolled ? theme.colors.line : 'transparent',
          },
        ]}
        // La barre ne doit PAS absorber les gestes : sans cela, elle bloque le
        // défilement du contenu qui passe en dessous.
        pointerEvents="box-none"
      >
        {/* Le logo ramène à l’accueil : c’est le choix validé, la barre du bas
            ne portant que les cinq outils. */}
        <Pressable
          onPress={() => go('/')}
          accessibilityRole="button"
          accessibilityLabel={t('nav.home')}
          style={({ pressed }) => [styles.logo, { opacity: pressed ? 0.6 : 1 }]}
        >
          <BrandMark size={30} nameColor={onHero ? iconColor : undefined} />
        </Pressable>

        <View style={[styles.actions, { flexDirection: row }]}>
          <HeaderIcon
            name="person-outline"
            label={t('nav.profile')}
            onPress={() => go('/(tabs)/account')}
            color={iconColor}
          />
          <HeaderIcon
            name="bag-outline"
            label={t('cart.title')}
            onPress={() => go('/(tabs)/cart')}
            color={iconColor}
          />
          <HeaderIcon
            name="menu-outline"
            label={t('nav.menu')}
            onPress={() => { setMenuOpen(true); }}
            color={iconColor}
          />
        </View>
      </View>

      {/* Le bord suit la langue : en arabe le tiroir sort à droite. */}
      <Drawer visible={menuOpen} onClose={() => { setMenuOpen(false); }} side={theme.isRTL ? 'end' : 'start'}>
        <View style={{ paddingTop: theme.space[2] }}>
          <DrawerItem icon="home-outline" label={t('tabs.home')} onPress={() => go('/')} />
          <DrawerItem icon="compass-outline" label={t('catalog.title')} onPress={() => go('/catalog')} />
          <DrawerItem icon="receipt-outline" label={t('orders.title')} onPress={() => go('/orders')} />
          <DrawerItem icon="person-outline" label={t('tabs.account')} onPress={() => go('/(tabs)/account')} />
          <DrawerItem icon="chatbubble-ellipses-outline" label={t('tabs.sonim')} onPress={() => go('/assistant')} />
        </View>
      </Drawer>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logo: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  actions: {
    alignItems: 'center',
    gap: 2,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
