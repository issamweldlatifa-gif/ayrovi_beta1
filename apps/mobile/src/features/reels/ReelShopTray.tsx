/**
 * TIROIR « articles » d'un Reel — rendu.
 *
 * Deux modes, une seule mécanique :
 *  • `overlay` — visionneuse plein écran : le tiroir sort du bas, par-dessus la
 *    vidéo, et le bouton unique se pose au-dessus de lui ;
 *  • `inline`  — carte de la liste : le même bouton, le même carrousel, mais dans
 *    le flux (pas de position absolue).
 *
 * **La vidéo n'est jamais démontée** : le tiroir est un frère dans l'arbre, pas un
 * autre écran. Ouvrir les articles ne met donc pas le Reel en pause et ne perd
 * pas la position de lecture.
 *
 * Un seul bouton : « Voir les articles » ⇄ « Masquer les articles » (voir `reelTray.ts`).
 * Aucun article ⇒ aucun bouton.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { ARTICLE_CARD } from '@/design/articleCard';
import { LinkedProductCard } from '@/features/shopping/LinkedProductCard';
import type { LinkedProduct } from '@/api/linkedProduct';
import {
  REEL_TRAY,
  reelTrayContentBottom,
  reelTrayDefaultOpen,
  reelTrayLabelKey,
  reelTrayOffset,
  reelTrayProducts,
  type TraySource,
} from './reelTray';

export interface ReelShopTrayProps {
  reel: TraySource<LinkedProduct> & { id: string };
  mode: 'overlay' | 'inline';
  /** Fond du tiroir : la surface de l'écran (blanc en clair, sombre en sombre). */
  surface: string;
  /** Couleur du texte du bouton quand il est posé sur la vidéo. */
  onMedia: string;
  /** Le contenu qui vit au-dessus du tiroir en mode `overlay` (légende, actions). */
  children: (state: { open: boolean; bottom: number }) => React.ReactNode;
}

export function ReelShopTray({ reel, mode, surface, onMedia, children }: ReelShopTrayProps) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const products = reelTrayProducts(reel);
  const [open, setOpen] = useState(() => reelTrayDefaultOpen(reel));

  const overlay = mode === 'overlay';
  const insetBottom = overlay ? insets.bottom : 0;
  const trayHeight = REEL_TRAY.height + insetBottom;
  const pillBottom = reelTrayContentBottom(open, 'pill', REEL_TRAY.height, insetBottom);
  const captionBottom = reelTrayContentBottom(open, 'caption', REEL_TRAY.height, insetBottom);

  const pill = products.length > 0 ? (
    <Pressable
      testID={`reel-tray-toggle-${reel.id}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={t(reelTrayLabelKey(open))}
      onPress={() => setOpen((value) => !value)}
      style={({ pressed }) => [
        styles.pill,
        overlay
          ? [styles.pillOnMedia, { bottom: pillBottom, backgroundColor: theme.colors.ink }]
          : [styles.pillInline, { borderColor: theme.colors.line }],
        { opacity: pressed ? 0.86 : 1 },
      ]}
    >
      <AppText variant="label" weight="bold" color={overlay ? theme.colors.canvas : theme.colors.ink}>
        {t(reelTrayLabelKey(open))}
      </AppText>
      <Ionicons
        name={open ? 'chevron-up' : 'chevron-down'}
        size={18}
        color={overlay ? theme.colors.canvas : theme.colors.ink}
        accessibilityElementsHidden
      />
    </Pressable>
  ) : null;

  const tray = products.length > 0 ? (
    <View
      testID={`reel-tray-${reel.id}`}
      style={[
        overlay ? styles.trayOverlay : styles.trayInline,
        overlay
          ? { height: trayHeight, paddingBottom: insetBottom, backgroundColor: surface, transform: [{ translateY: reelTrayOffset(open, REEL_TRAY.height, insetBottom) }] }
          : { backgroundColor: surface },
      ]}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      {overlay ? (
        <View style={styles.grab} aria-hidden>
          <View style={[styles.grabBar, { backgroundColor: theme.colors.lineControl }]} />
        </View>
      ) : null}
      <ScrollView
        testID={`reel-tray-scroll-${reel.id}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={ARTICLE_CARD.width + REEL_TRAY.cardGap}
        decelerationRate="fast"
        contentContainerStyle={styles.row}
      >
        {products.map((product) => (
          <LinkedProductCard
            key={product.id}
            product={product}
            testID={`reel-product-${reel.id}-${product.id}`}
          />
        ))}
      </ScrollView>
    </View>
  ) : null;

  if (!overlay) {
    // Dans le flux, pas d'animation : fermé = pas de tiroir du tout (rien de caché
    // qui resterait lisible par un lecteur d'écran).
    return (
      <View style={styles.inlineWrap}>
        {pill}
        {open ? tray : null}
      </View>
    );
  }

  return (
    <>
      {children({ open, bottom: captionBottom })}
      {pill}
      {tray}
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: REEL_TRAY.pillHeight,
    minWidth: REEL_TRAY.pillMinWidth,
    paddingHorizontal: 16,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  // Habillage posé SUR la vidéo : noir d'encre de la marque, texte de la surface.
  pillOnMedia: { position: 'absolute', start: 16 },
  pillInline: { alignSelf: 'flex-start', marginHorizontal: 12, marginTop: 10, borderWidth: StyleSheet.hairlineWidth },
  trayOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    justifyContent: 'center',
  },
  trayInline: { marginTop: 10 },
  grab: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
  grabBar: { width: 36, height: 4, borderRadius: 999 },
  row: {
    gap: REEL_TRAY.cardGap,
    paddingHorizontal: REEL_TRAY.padding,
    alignItems: 'center',
  },
  inlineWrap: { paddingBottom: 4 },
});
