/**
 * En-tête applicatif — TRANSPARENT, FIXE, AU-DESSUS du contenu.
 *
 * ── Pourquoi au-dessus et pas dedans ───────────────────────────────────────
 * La consigne produit est explicite : « شفاف ويبقى ثابت عند تمرير الي اسفل …
 * وتمر صفحه داخله » — transparent, fixe, et la page défile DESSOUS. Un en-tête
 * dans le `ScrollView` descend avec le contenu et ne remonte jamais : ce serait
 * l'inverse du résultat voulu. Il est donc hors du défilement, positionné en
 * absolu, et le contenu lui laisse la place en haut (pas de bande morte : la
 * page passe réellement sous lui, y compris sous les icônes).
 *
 * ── Lisibilité sans trahir la transparence ─────────────────────────────────
 * Un en-tête transparent posé sur un visuel clair rend ses icônes illisibles.
 * Plutôt qu'un fond opaque (qui annulerait la consigne), les icônes portent une
 * ombre portée : elles restent lisibles sur n'importe quel visuel, et le fond
 * reste réellement transparent.
 *
 * ── Le menu ────────────────────────────────────────────────────────────────
 * Le tiroir reprend les destinations qui NE sont pas dans la barre du bas
 * (Accueil · Compte · Commandes · Catalogue). Un menu qui n'ouvre rien est un
 * mensonge : chaque entrée mène quelque part, et il n'y a pas d'entrée morte.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BrandMark } from '@/design/BrandMark';
import { AppText, Drawer, DrawerItem } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n, useT } from '@/i18n';
import { usePrefs } from '@/state/prefs';
import { APP_IDENTIFIER, APP_VERSION, APP_VERSION_CODE, BUILD_STAMP } from '@/config/app';

/** Cible tactile : en dessous de 44 pt, le doigt passe à côté de l’icône. */
const HIT = 44;

const ICON_SHADOW = {
  // Lisibilité sur visuel clair sans poser de fond : voir l’en-tête du fichier.
  textShadowColor: 'rgba(0,0,0,0.55)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
} as const;

function HeaderIcon({
  name, label, onPress,
}: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.icon, { opacity: pressed ? 0.55 : 1 }]}
      hitSlop={8}
    >
      <Ionicons name={name} size={22} color={theme.colors.ink} style={ICON_SHADOW} />
    </Pressable>
  );
}

export function AppHeader() {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { locale } = useI18n();
  const { themeMode } = usePrefs();
  const [menuOpen, setMenuOpen] = useState(false);

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
        style={[styles.bar, { paddingTop: insets.top + theme.space[2], flexDirection: row }]}
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
          <BrandMark size={30} />
        </Pressable>

        <View style={[styles.actions, { flexDirection: row }]}>
          <HeaderIcon
            name="person-outline"
            label={t('nav.profile')}
            onPress={() => go('/(tabs)/account')}
          />
          <HeaderIcon
            name="bag-outline"
            label={t('cart.title')}
            onPress={() => go('/(tabs)/cart')}
          />
          <HeaderIcon
            name="menu-outline"
            label={t('nav.menu')}
            onPress={() => { setMenuOpen(true); }}
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

          {/**
           * ختم البناء — ما بقاش في الواجهة (ما يجيش في واجهة مستهلك)، بس
           * **ما تحذفش**: هو اللي يخليك تعرف أي نسخة تخدم فعلاً على الجهاز.
           * بلاصتو الطبيعية هي «حول»، وهنا لين تتكوّن شاشتها.
           */}
          <View style={[styles.diag, { borderTopColor: theme.colors.line }]}>
            <AppText variant="caption" weight="bold" color={theme.colors.muted}>
              {t('home.diagnostics')}
            </AppText>
            <AppText variant="caption" color={theme.colors.muted}>
              {t('home.diagnostics.body')}
            </AppText>
            <AppText variant="caption" color={theme.colors.muted}>
              {`${t('common.version')} ${APP_VERSION} (${APP_VERSION_CODE}) · ${t('common.build')} ${BUILD_STAMP}`}
            </AppText>
            <AppText variant="caption" color={theme.colors.muted}>
              {`${t('common.identity')} ${theme.identity.name} · ${theme.identity.version}`}
            </AppText>
            <AppText variant="caption" color={theme.colors.muted}>
              {`${t('common.language')} ${locale} · ${t('common.theme')} ${theme.mode} · ${themeMode}`}
            </AppText>
            <AppText variant="caption" color={theme.colors.muted}>{APP_IDENTIFIER}</AppText>
          </View>
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
    paddingHorizontal: 12,
    paddingBottom: 8,
    // transparent — volontairement. Aucun fond, aucune bordure.
    backgroundColor: 'transparent',
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
    width: HIT,
    height: HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diag: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
});
