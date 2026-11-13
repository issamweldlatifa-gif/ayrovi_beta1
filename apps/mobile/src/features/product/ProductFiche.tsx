import { BackButton } from '@/design/BackButton';
import { CloseButton } from '@/design/CloseButton';
/**
 * GRANDE FICHE — les 4 écrans de la maquette (25/10/2026).
 *
 * Maquette de référence : `docs/design/cardproduit/mockup-complet-25-10.png`
 * (720 × 1600 px = 360 × 800 dp). Toutes les cotes sont dans `./fiche.ts`, en dp
 * (pixels ÷ 2) : **la géométrie ne se discute pas ici**, elle se lit là-bas.
 *
 * Les quatre écrans, dans l'ordre de ce fichier :
 *  1. `FichePhoto` + `FicheIdentity` + `ChoiceRow` — photo, nom souligné à la
 *     largeur du mot, prix, description, ligne « Taille » ;
 *  2. `ColorStrip` + `SectionRow` + `InfoRow` — Couleur et ses vignettes, les
 *     accordéons des sections du CRM, livraison, retours, partager ;
 *  3. `SizeSheet` — la feuille qui monte à 22 dp du haut, sans coin arrondi ;
 *  4. `GalleryViewer` — blanc, croix, photo contenue, points.
 *
 * Ce que ces pièces NE font PAS, volontairement :
 *  • aucun prix calculé ici — la fiche affiche `finalPrice` du serveur ;
 *  • **aucun prix barré, aucune remise, aucune pastille de pourcentage** ;
 *  • aucune section vide, aucun « — » : une donnée absente disparaît ;
 *  • aucun libellé écrit en dur : le nom des blocs vient du CRM quand il en
 *    donne un (`ficheLabels`), sinon de la traduction de l'application.
 */
import { forwardRef, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  LayoutAnimation,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationIcon as Ionicons } from '@/design/NavigationIcon';
import { useVideoPlayer, VideoView } from 'expo-video';

import { AppText, Button } from '@/design/ui';
import { AppSheet } from '@/design/sheet/AppSheet';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { ficheColorsFor, RADIUS, VIDEO_BACKDROP } from '@/design/tokens.mobile';
import { FONTS, MOTION } from '@/design/tokens.generated';
import { FicheGlyph, type FicheGlyphName } from '@/design/FicheGlyph';
import {
  FICHE,
  FICHE_DETAIL,
  galleryIndexFor,
  HEADER_TITLE,
  headerTitleRange,
  specIsWide,
  viewerStageHeight,
  type ColorTile,
  type GalleryItem,
  type SizeRow,
  type SpecRow,
} from './fiche';

/** Colonne des icônes : la boîte de 24 dp commence à 17 dp (maquette : 46 px). */
const ICON_BOX = FICHE.rowIcon;

/* ── 1. En-tête : transparent sur la photo, plein dès que la feuille l'atteint ── */

/*
 * Privé `Screenshot_20261113_023736` : quand la feuille atteint l'en-tête, il
 * devient blanc, le nom de la marque y apparaît, et une OMBRE douce (pas un
 * filet dur) le sépare du contenu qui passe dessous.
 */
export function FicheHeader({
  title,
  onBack,
  onCart,
  scrollY,
  topInset,
  cartCount = 0,
  justAdded = false,
  reservationCountdown = null,
}: {
  title: string;
  onBack: () => void;
  onCart: () => void;
  /** Position de défilement : le fond s'opacifie sans re-render de la page. */
  scrollY: Animated.Value;
  topInset: number;
  /** Nombre total d'articles dans le panier pour le badge. */
  cartCount?: number;
  /** Déclenche l'extension verte « Article ajouté » pendant ~2,4 s après l'ajout. */
  justAdded?: boolean;
  /** Compte à rebours `MM:SS` de la réservation de 20 minutes. */
  reservationCountdown?: string | null;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  const t = useT();

  const solid = scrollY.interpolate({
    inputRange: [FICHE.imageHeight - FICHE.headerHeight - 40, FICHE.imageHeight - FICHE.headerHeight],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  /** Le nom monte dans l'en-tête quand la marque de la feuille passe dessous. */
  const titleRange = headerTitleRange();
  const titleIn = scrollY.interpolate({ inputRange: titleRange, outputRange: [0, 1], extrapolate: 'clamp' });
  const titleShift = scrollY.interpolate({ inputRange: titleRange, outputRange: [HEADER_TITLE.travel, 0], extrapolate: 'clamp' });

  return (
    <View pointerEvents="box-none" style={[styles.header, { paddingTop: topInset, height: FICHE.headerHeight + topInset }]}>
      <Animated.View
        pointerEvents="none"
        testID="product-header-surface"
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.canvas, opacity: solid }]}
      />
      <Animated.View pointerEvents="none" testID="product-header-shadow" style={[styles.headerShadow, { opacity: solid }]}>
        <LinearGradient colors={[fc.sheetShadow, fc.sheetShadowClear]} style={styles.fill} />
      </Animated.View>
      <View pointerEvents="box-none" style={[styles.headerRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
        <BackButton onPress={onBack} label={t('common.back')} color={theme.colors.ink} testID="product-back" />

        <Animated.Text
          testID="product-header-title"
          numberOfLines={1}
          style={[
            styles.headerTitle,
            {
              color: theme.colors.ink,
              opacity: titleIn,
              transform: [{ translateY: titleShift }],
              fontFamily: theme.isRTL ? theme.font('medium') : FONTS.latin.heading,
            },
          ]}
        >
          {title}
        </Animated.Text>

        <FicheCartButton
          onPress={onCart}
          cartCount={cartCount}
          justAdded={justAdded}
          reservationCountdown={reservationCountdown}
        />
      </View>
    </View>
  );
}

/**
 * Panier de l'en-tête. 13/11 — « 18:06 » et son badge débordaient : le badge est
 * désormais un rond de 18 dp ENTIÈREMENT dans la pastille, son chiffre (11/14)
 * n'est jamais agrandi par la police système, et le compte à rebours a des
 * chiffres à chasse fixe — la pastille ne change plus de largeur chaque seconde.
 */
export function FicheCartButton({
  onPress,
  cartCount,
  justAdded,
  reservationCountdown,
}: {
  onPress: () => void;
  cartCount: number;
  justAdded: boolean;
  reservationCountdown: string | null;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  const t = useT();
  const expandAnim = useRef(new Animated.Value(justAdded ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(expandAnim, {
      toValue: justAdded ? 1 : 0,
      useNativeDriver: true,
      ...theme.spring.firm,
    }).start();
  }, [expandAnim, justAdded, theme.spring.firm]);

  const pillShiftX = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.isRTL ? -6 : 6, 0],
  });

  const showPill = justAdded || cartCount > 0;
  const badgeText = cartCount > 99 ? '99+' : String(Math.max(1, cartCount));

  if (!showPill) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('tabs.cart')}
        onPress={onPress}
        hitSlop={8}
        testID="product-header-cart"
        style={({ pressed }) => [styles.headerButton, { opacity: pressed ? theme.opacity.subtle : 1 }]}
      >
        <Ionicons name="bag-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
      </Pressable>
    );
  }

  return (
    <Animated.View style={{ transform: [{ translateX: pillShiftX }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={reservationCountdown ? `${t('tabs.cart')} ${badgeText} — ${reservationCountdown}` : `${t('tabs.cart')} ${badgeText}`}
        onPress={onPress}
        hitSlop={8}
        testID="product-header-cart-pill"
        style={({ pressed }) => [
          styles.cartPill,
          theme.elevation.low,
          {
            flexDirection: rowDirectionFor(theme.isRTL),
            backgroundColor: justAdded ? fc.success : fc.pillSurface,
            borderColor: justAdded ? fc.success : fc.hair,
            opacity: pressed ? theme.opacity.subtle : 1,
          },
        ]}
      >
        {justAdded ? (
          <AppText variant="label" color={fc.onAccent} numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {t('product.addedPill')}
          </AppText>
        ) : reservationCountdown ? (
          <AppText
            testID="product-header-countdown"
            variant="label"
            color={fc.ink}
            numberOfLines={1}
            maxFontSizeMultiplier={1.15}
            style={styles.cartCountdown}
          >
            {reservationCountdown}
          </AppText>
        ) : null}
        <View style={styles.cartPillBagWrap}>
          <Ionicons
            name="bag-outline"
            size={theme.iconSize.sm}
            color={justAdded ? fc.onAccent : fc.ink}
            accessibilityElementsHidden
          />
          <View
            testID="product-header-cart-badge"
            style={[
              styles.cartPillBadge,
              { backgroundColor: fc.accent, borderColor: justAdded ? fc.success : fc.pillSurface },
              theme.isRTL ? styles.cartPillBadgeRTL : styles.cartPillBadgeLTR,
            ]}
          >
            <AppText
              variant="captionStrong"
              color={fc.onAccent}
              numberOfLines={1}
              maxFontSizeMultiplier={1}
              style={styles.cartPillBadgeText}
            >
              {badgeText}
            </AppText>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* ── 1 bis. La photo FIXE derrière la feuille qui monte ──────────────────────
 *
 * 13/11 — « الصورة ثابتة والورقة تتحرك فوقها » (Privé) : la photo ne défile pas
 * et ne recule plus (la parallaxe du 14/11 est retirée). Elle est posée dans
 * une couche fixe ; la feuille blanche glisse par-dessus.
 *
 *  • la couche est `pointerEvents="none"` (et masquée aux lecteurs d'écran) : le
 *    glissement horizontal et l'appui se font dans la FENÊTRE de la feuille
 *    (`FicheGalleryPager`), qui pilote cette couche par `galleryX` ;
 *  • les photos sont posées côte à côte et la bande suit le doigt (pilote natif) :
 *    la galerie se feuillette sans saut, comme une vraie galerie.
 */
export function FichePhotoLayer({
  items,
  galleryX,
}: {
  items: GalleryItem[];
  /** Décalage horizontal de la galerie (pages pleine largeur). */
  galleryX: Animated.Value;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const totalHeight = FICHE.imageHeight + insets.top;
  const pages = items.length > 0 ? items : [null];
  /* La bande ne dépasse jamais la première ni la dernière photo (rebond, photo d'arrivée hors galerie). */
  const last = width * (pages.length - 1);
  const shift = last > 0
    ? galleryX.interpolate({ inputRange: [0, last], outputRange: [0, -last], extrapolate: 'clamp' })
    : 0;
  return (
    <View
      testID="product-photo-layer"
      style={[styles.pinnedPhoto, { height: totalHeight }]}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[
          styles.photoStrip,
          { width: width * pages.length, transform: [{ translateX: shift }] },
        ]}
      >
        {pages.map((item, position) => (
          <View key={item ? `${item.url}-${position}` : 'empty'} style={{ width, height: totalHeight }}>
            <FichePhoto items={items} index={position} height={totalHeight} topInset={insets.top} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

/* ── 2. Photo (écran 1) : le produit ENTIER sur le gris de son propre fond ─── */

export function FichePhoto({
  items, index, height, topInset = 0,
}: {
  items: GalleryItem[];
  /** Photo affichée (change quand on choisit une couleur). */
  index: number;
  height?: number;
  /** La photo commence sous la barre d'état : le produit n'est jamais caché par elle. */
  topInset?: number;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  const t = useT();
  const current = items[index] ?? items[0];
  const count = items.length;
  const active = Math.max(0, Math.min(index, count - 1));

  return (
    <View testID="product-photo" style={[styles.photo, { height: height ?? FICHE.imageHeight, backgroundColor: fc.photo }]}>
      {current ? (
        current.kind === 'video' ? (
          <View style={[StyleSheet.absoluteFill, styles.photoEmpty]}>
            <Ionicons name="play-outline" size={theme.iconSize.lg} color={theme.colors.ink} accessibilityElementsHidden />
          </View>
        ) : (
          /*
           * `contain` : la photo 2:3 tient ENTIÈRE dans le cadre, sous la barre
           * d'état ; le gris du cadre est celui du fichier, donc aucune bande.
           */
          <View style={[styles.photoFrame, { top: topInset }]}>
            <AppImage
              testID="product-photo-image"
              uri={mediaUrl(current.url)}
              highRes
              background={fc.photo}
              style={styles.fill}
              contentFit="contain"
              accessibilityLabel={t('product.photo', { index: String(active + 1), total: String(count) })}
              decorative
            />
          </View>
        )
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.photoEmpty]}>
          <AppText variant="caption" color={theme.colors.muted}>{t('catalog.noImage')}</AppText>
        </View>
      )}
    </View>
  );
}

/**
 * Fenêtre de la galerie, DANS la feuille (elle monte avec elle) : des pages
 * transparentes pleine largeur qu'on feuillette au doigt. Le décalage pilote la
 * bande de photos de la couche fixe ; un appui ouvre le plein écran sur la photo
 * visible. `initialIndex` : la photo d'arrivée (ou celle de la couleur choisie).
 */
export const FicheGalleryPager = forwardRef<ScrollView, {
  items: GalleryItem[];
  height: number;
  initialIndex: number;
  galleryX: Animated.Value;
  onIndexChange: (index: number) => void;
  onOpen: (index: number) => void;
}>(function FicheGalleryPager({ items, height, initialIndex, galleryX, onIndexChange, onOpen }, ref) {
  const t = useT();
  const { width } = useWindowDimensions();
  const pages = items.length > 0 ? items : [null];
  return (
    <Animated.ScrollView
      ref={ref}
      testID="product-photo-pager"
      horizontal
      pagingEnabled
      bounces={false}
      overScrollMode="never"
      decelerationRate="fast"
      showsHorizontalScrollIndicator={false}
      scrollEnabled={items.length > 1}
      contentOffset={{ x: initialIndex * width, y: 0 }}
      scrollEventThrottle={16}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: galleryX } } }], { useNativeDriver: true })}
      onMomentumScrollEnd={(event) => onIndexChange(galleryIndexFor(event.nativeEvent.contentOffset.x, width, items.length))}
      style={StyleSheet.absoluteFill}
    >
      {pages.map((item, position) => (
        <Pressable
          key={item ? `${item.url}-${position}` : 'empty'}
          accessibilityRole="button"
          accessibilityLabel={t('product.openGallery')}
          disabled={!item}
          onPress={() => onOpen(position)}
          testID={`product-photo-page-${position}`}
          style={{ width, height }}
        />
      ))}
    </Animated.ScrollView>
  );
});

/**
 * 13/11 — profondeur de la feuille (Privé) : une ombre douce sur le bord haut de
 * la feuille quand elle glisse sur la photo fixe. Jamais un trait dur.
 */
export function SheetEdgeShadow({ testID }: { testID?: string }) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  return (
    <LinearGradient
      testID={testID}
      pointerEvents="none"
      colors={[fc.sheetShadowClear, fc.sheetShadow]}
      style={styles.sheetEdge}
    />
  );
}

/**
 * Chrome de la galerie, posé dans la FENÊTRE de la feuille (il monte avec elle) :
 * les points au centre et l'icône « agrandir » (quatre coins) en bas à droite —
 * planche Privé `Screenshot_20261113_023704`.
 */
export function FichePhotoChrome({ count, active }: { count: number; active: number }) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  return (
    <>
      {count > 1 ? (
        <View pointerEvents="none" style={styles.dots} testID="product-photo-dots">
          {Array.from({ length: Math.min(count, 8) }, (_, position) => {
            const size = position === active ? FICHE.dot : FICHE.dotIdle;
            return (
              <View key={position} style={styles.dotSlot}>
                <View
                  style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: position === active ? theme.colors.ink : fc.dotIdle,
                  }}
                />
              </View>
            );
          })}
        </View>
      ) : null}
      <View pointerEvents="none" style={[styles.expand, theme.isRTL ? styles.expandRTL : styles.expandLTR]}>
        <FicheGlyph name="expand" size={FICHE_DETAIL.expandIcon} color={theme.colors.ink} testID="product-photo-expand" />
      </View>
    </>
  );
}

/* ── 3. Identité : marque soulignée, prix en face, nom complet gris dessous ── */

export function FicheIdentity({
  brand, name, price, referencePrice,
}: {
  /**
   * Marque (Privé) : police « Expanded », soulignée d'un filet fin à la largeur
   * du mot ; le nom complet passe dessous, EN ENTIER et en gris. Sans marque, le
   * nom prend la ligne soulignée.
   */
  brand?: string;
  name: string;
  price: string | null;
  /**
   * « Prix conseillé ~~25,00 €~~ » — seulement la valeur `compare_at_price` du
   * CRM, et seulement quand elle dépasse le prix de vente (sinon `null`).
   */
  referencePrice?: string | null;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  const t = useT();
  const title = brand?.trim() || name;
  const fullName = brand?.trim() ? name : '';
  return (
    <View style={styles.identity}>
      <View style={styles.identityTop}>
        <View style={styles.identityStart}>
          {/* Le filet fait exactement la largeur du mot : la boîte se rétrécit au texte. */}
          <View style={[styles.nameBox, { borderBottomColor: theme.colors.ink }]}>
            <AppText
              testID="product-fiche-title"
              numberOfLines={fullName ? 1 : undefined}
              style={[styles.name, { color: theme.colors.ink, fontFamily: theme.isRTL ? theme.font('bold') : FONTS.latin.heading }]}
            >
              {title}
            </AppText>
          </View>
          {fullName ? (
            <AppText
              testID="product-fiche-name"
              style={[styles.fullName, { color: fc.muted, fontFamily: theme.font('regular') }]}
            >
              {fullName}
            </AppText>
          ) : null}
        </View>
        {price ? (
          <View style={styles.priceColumn}>
            <AppText testID="product-fiche-price" style={[styles.price, { color: theme.colors.ink, fontFamily: theme.font('bold') }]}>
              {price}
            </AppText>
            {referencePrice ? (
              <AppText testID="product-fiche-reference-price" style={[styles.reference, { color: fc.muted, fontFamily: theme.font('regular') }]}>
                {`${t('product.referencePrice')} `}
                <AppText style={[styles.reference, styles.struck, { color: fc.muted, fontFamily: theme.font('regular') }]}>
                  {referencePrice}
                </AppText>
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ── 4. Ligne de choix : pictogramme, libellé gras, valeur, chevron ────────── */

export function ChoiceRow({
  icon, label, value, onPress, chevron = false, testID,
}: {
  icon: FicheGlyphName;
  label: string;
  value?: string;
  onPress?: () => void;
  /** Un chevron = la ligne ouvre quelque chose (la feuille de taille). */
  chevron?: boolean;
  testID?: string;
}) {
  const theme = useTheme();

  const content = (
    <>
      <View style={styles.rowIcon}>
        <FicheGlyph name={icon} size={ICON_BOX} color={theme.colors.ink} />
      </View>
      <View style={styles.rowText}>
        {/* Privé : « Couleur Marron » — libellé gras et valeur régulière sur la même ligne. */}
        <AppText numberOfLines={1} style={[styles.rowLabel, { color: theme.colors.ink, fontFamily: theme.font('bold') }]}>
          {label}
          {value ? (
            <AppText style={[styles.rowValue, { color: theme.colors.ink, fontFamily: theme.font('regular') }]}>
              {` ${value}`}
            </AppText>
          ) : null}
        </AppText>
      </View>
      {chevron ? (
        <View style={styles.chevron}>
          <Ionicons name="chevron-down-outline" size={FICHE.chevronSize} color={theme.colors.ink} accessibilityElementsHidden />
        </View>
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.row} testID={testID}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label} ${value}` : label}
      onPress={onPress}
      testID={testID}
      style={styles.row}
    >
      {content}
    </Pressable>
  );
}

/* ── 5. Vignettes de couleur : la photo de la variante, sinon son nom ──────── */

export function ColorStrip({
  tiles, selected, onSelect,
}: {
  tiles: ColorTile[];
  selected: string;
  onSelect: (tile: ColorTile) => void;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  return (
    <View style={styles.tiles}>
      {tiles.map((tile) => {
        const active = selected === tile.color;
        return (
          <Pressable
            key={tile.color}
            accessibilityRole="button"
            accessibilityLabel={tile.color}
            accessibilityState={{ selected: active, disabled: !tile.available }}
            disabled={!tile.available}
            onPress={() => onSelect(tile)}
            style={styles.tile}
          >
            {tile.image ? (
              <AppImage
                uri={mediaUrl(tile.image)}
                style={[styles.tileImage, tile.available ? null : { opacity: theme.opacity.disabled }]}
                contentFit="cover"
                decorative
              />
            ) : (
              <View style={[styles.tilePlain, { borderColor: fc.hair }]}>
                <AppText numberOfLines={2} style={[styles.tilePlainText, { color: theme.colors.ink }]}>{tile.color}</AppText>
              </View>
            )}
            <View style={[styles.tileRule, { backgroundColor: active ? fc.accent : theme.colors.canvas }]} />
            <AppText
              numberOfLines={1}
              style={[styles.tileLabel, { color: theme.colors.ink }]}
              variant="label"
            >
              {tile.color}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── 6. Accordéon : une section d'attributs du CRM (48 dp par ligne fermée) ── */

export function SectionRow({
  icon, title, children, defaultOpen = false, testID,
}: {
  icon: FicheGlyphName;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  const [open, setOpen] = useState(defaultOpen);
  /* Le chevron tourne (bas → haut) au lieu de changer d'icône d'un coup. */
  const turn = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: MOTION.fast, useNativeDriver: true }).start();
  }, [open, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <View testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.create(MOTION.fast, 'easeInEaseOut', 'opacity'));
          setOpen((value) => !value);
        }}
        style={styles.row}
      >
        <View style={styles.rowIcon}>
          <FicheGlyph name={icon} size={ICON_BOX} color={theme.colors.ink} />
        </View>
        <View style={styles.rowText}>
          <AppText numberOfLines={1} style={[styles.rowLabel, { color: theme.colors.ink, fontFamily: theme.font('bold') }]}>
            {title}
          </AppText>
        </View>
        <Animated.View style={[styles.chevron, { transform: [{ rotate }] }]}>
          <Ionicons name="chevron-down-outline" size={FICHE.chevronSize} color={theme.colors.ink} accessibilityElementsHidden />
        </Animated.View>
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
      <View style={[styles.hairline, { backgroundColor: fc.hair }]} />
    </View>
  );
}

/* ── 7. Bloc d'information (livraison, retours, partage) ───────────────────── */

export function InfoRow({
  icon, title, titleColor, iconColor, lines, onPress, testID,
}: {
  icon: FicheGlyphName;
  title: string;
  titleColor?: string;
  /** Privé : le camion de « Livraison rapide » prend le vert du titre. */
  iconColor?: string;
  lines?: string[];
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  const content = (
    <>
      <View style={[styles.rowIcon, styles.infoIcon]}>
        <FicheGlyph name={icon} size={ICON_BOX} color={iconColor ?? theme.colors.ink} />
      </View>
      <View style={styles.infoText}>
        <AppText style={[styles.infoTitle, { color: titleColor ?? theme.colors.ink, fontFamily: theme.font('bold') }]}>
          {title}
        </AppText>
        {(lines ?? []).map((line, position) => (
          <AppText
            key={`${line}-${position}`}
            style={[styles.infoLine, { color: fc.muted, fontFamily: theme.font('regular') }]}
          >
            {line}
          </AppText>
        ))}
      </View>
    </>
  );

  if (!onPress) return <View style={styles.infoRow} testID={testID}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} testID={testID} style={styles.infoRow}>
      {content}
    </Pressable>
  );
}

/**
 * 14/11 — grille des caractéristiques (Privé `Screenshot_20261113_023826`) :
 * deux colonnes, « Libellé: » en GRAS, la valeur dessous en régulier. Une valeur
 * trop longue pour une demi-colonne (une phrase d'entretien, une liste) prend
 * toute la largeur au lieu d'être coupée.
 */
export function SpecGrid({ rows, testID }: { rows: SpecRow[]; testID?: string }) {
  const theme = useTheme();
  if (rows.length === 0) return null;
  return (
    <View testID={testID} style={[styles.specGrid, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
      {rows.map((row) => (
        <View key={row.key} style={specIsWide(row) ? styles.specCellWide : styles.specCell}>
          <SpecLine label={row.label} value={row.value} />
        </View>
      ))}
    </View>
  );
}

/** Une paire « Libellé: / valeur » de la grille. */
export function SpecLine({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View>
      <AppText style={[styles.specLabel, { color: theme.colors.ink, fontFamily: theme.font('bold') }]}>
        {`${label}:`}
      </AppText>
      <AppText style={[styles.specValue, { color: theme.colors.ink, fontFamily: theme.font('regular') }]}>
        {value}
      </AppText>
    </View>
  );
}

/**
 * Lien souligné gras (« Voir les informations sur la fabrication », « Guide des
 * tailles ») — filet épais de 2 dp, à la largeur du texte.
 */
export function FicheLink({
  label, onPress, icon, testID,
}: {
  label: string;
  onPress: () => void;
  /** Privé : le réglet précède « Guide des tailles ». */
  icon?: FicheGlyphName;
  testID?: string;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      hitSlop={8}
      style={[styles.link, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}
    >
      {icon ? <FicheGlyph name={icon} size={ICON_BOX} color={fc.link} /> : null}
      <View style={[styles.linkBox, { borderBottomColor: fc.link }]}>
        <AppText style={[styles.linkText, { color: fc.link, fontFamily: theme.font('bold') }]}>{label}</AppText>
      </View>
    </Pressable>
  );
}

/** Bande grise pleine largeur — le séparateur « plus gros que les autres lignes ». */
export function GrayBand() {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  return <View style={[styles.band, { backgroundColor: fc.hair }]} />;
}

/** Filet fin pleine largeur. */
export function Hairline() {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  return <View style={[styles.hairline, { backgroundColor: fc.hair }]} />;
}

/* ── 8. Barre d'achat FIXE (prix à gauche, bouton noir à droite) ───────────── */

export function BuyBar({
  price, label, disabled, busy, onPress, testID, error,
}: {
  price: string;
  label: string;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
  testID?: string;
  /** Refus du serveur : il s'affiche DANS la barre, jamais dans un toast qui fuit. */
  error?: string | null;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="product-buy-bar"
      style={[
        styles.buyBar,
        {
          paddingBottom: insets.bottom,
          backgroundColor: theme.colors.canvas,
        },
      ]}
    >
      {error ? (
        <AppText accessibilityRole="alert" variant="caption" color={theme.status.danger.fg} style={styles.buyError}>
          {error}
        </AppText>
      ) : null}
      <View style={styles.buyRow}>
        <View style={styles.buyPrice}>
          {/* 13/11 : UNE ligne, rétrécie plutôt que coupée, et 16 dp d'air avant le bouton. */}
          <AppText
            testID="product-buy-price"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={1.15}
            style={[styles.buyPriceText, { color: theme.colors.ink, fontFamily: theme.font('bold') }]}
          >
            {price}
          </AppText>
        </View>
        {/*
          13/11 — « Ajouter au panier » est le bouton NOIR de la famille de l'app
          (`<Button tone="solid" size="lg">` : 48 dp, rayon plein, libellé blanc),
          plus une pastille violette dessinée à part. Seule la largeur vient de `FICHE`.
        */}
        <Button
          label={label}
          tone="solid"
          size="lg"
          busy={busy}
          disabled={disabled}
          onPress={onPress}
          testID={testID}
          style={styles.buyButton}
        />
      </View>
    </View>
  );
}

/* ── 9 bis. Informations sur la fabrication (lien de la section Caractéristiques) ─ */

/**
 * Privé : « Voir les informations sur la fabrication » ouvre une feuille avec le
 * fabricant. Ici : la MARQUE, le nom et les références déclarés dans le CRM —
 * aucune adresse ni usine inventée.
 */
export function MakerSheet({
  visible, onClose, rows,
}: {
  visible: boolean;
  onClose: () => void;
  rows: SpecRow[];
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  const t = useT();
  return (
    <AppSheet
      open={visible}
      onDismiss={onClose}
      presentation="bottom"
      header={(
        <View style={[styles.sheetHeaderRow, { flexDirection: rowDirectionFor(theme.isRTL), borderBottomColor: fc.hair }]}>
          <View style={styles.sheetHeaderTitles}>
            <AppText style={[styles.sheetTitle, { color: theme.colors.ink, fontFamily: theme.font('bold') }]}>
              {t('product.makerTitle')}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            hitSlop={8}
            style={styles.headerButton}
          >
            <Ionicons name="close-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
          </Pressable>
        </View>
      )}
    >
      <View style={styles.makerBody} testID="product-maker-sheet">
        <SpecGrid rows={rows} />
      </View>
    </AppSheet>
  );
}

/* ── 9. Feuille de taille (écran 3) ───────────────────────────────────────── */

export function SizeSheet({
  visible, onClose, rows, selected, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  rows: SizeRow[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  const t = useT();

  return (
    <AppSheet
      open={visible}
      onDismiss={onClose}
      presentation="bottom"
      header={(
        <View
          style={[
            styles.sheetHeaderRow,
            {
              flexDirection: rowDirectionFor(theme.isRTL),
              borderBottomColor: fc.hair,
            },
          ]}
        >
          <View style={styles.sheetHeaderTitles}>
            <AppText variant="caption" color={fc.muted}>
              {t('product.sizeSheetTitle')}
            </AppText>
            <AppText variant="h3" style={[styles.sheetTitle, { color: theme.colors.ink }]}>
              {t('catalog.size')}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            hitSlop={8}
            style={styles.headerButton}
          >
            <Ionicons name="close-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
          </Pressable>
        </View>
      )}
    >
      {rows.length > 0 ? (
        <View style={styles.sheetRows} testID="product-size-sheet">
          {rows.map((row) => {
            const active = selected === row.value;
            const color = row.available ? theme.colors.ink : fc.struck;
            return (
              <Pressable
                key={row.value}
                accessibilityRole="button"
                accessibilityLabel={row.available
                  ? (row.state === 'last' ? `${row.value} — ${t('product.sizeLast')}` : row.value)
                  : `${row.value} — ${t('catalog.variant.unavailable')}`}
                accessibilityState={{ selected: active, disabled: !row.available }}
                disabled={!row.available}
                onPress={() => onSelect(row.value)}
                style={[styles.sheetRow, { flexDirection: rowDirectionFor(theme.isRTL), borderBottomColor: fc.hair }]}
              >
                <AppText
                  variant="label"
                  style={[styles.sheetRowValue, {
                    color,
                    textDecorationLine: row.available ? 'none' : 'line-through',
                    textDecorationColor: fc.struck,
                  }]}
                >
                  {row.value}
                </AppText>
                <View style={[styles.sheetRowEnd, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
                  {row.state === 'last' ? (
                    <AppText variant="bodySmall" style={[styles.sheetRowState, { color: fc.accent }]}>
                      {t('product.sizeLast')}
                    </AppText>
                  ) : null}
                  {active ? (
                    <Ionicons name="checkmark-outline" size={theme.iconSize.sm} color={fc.accent} accessibilityElementsHidden />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <AppText style={[styles.sheetEmpty, { color: fc.muted }]}>{t('product.sizeSheetEmpty')}</AppText>
      )}
    </AppSheet>
  );
}

/* ── 9 bis. Tiroir « Panier réservé » (compte à rebours 20 minutes) ─────────── */

export function CartReservedSheet({
  visible,
  countdown,
  onClose,
  onViewCart,
}: {
  visible: boolean;
  countdown: string;
  onClose: () => void;
  onViewCart: () => void;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  const t = useT();

  return (
    <AppSheet
      open={visible}
      onDismiss={onClose}
      presentation="bottom"
      header={(
        <View
          style={[
            styles.reservedHeader,
            {
              flexDirection: rowDirectionFor(theme.isRTL),
              borderBottomColor: fc.hair,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            hitSlop={8}
            style={styles.headerButton}
          >
            <Ionicons name="close-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
          </Pressable>
        </View>
      )}
    >
      <View style={styles.reservedBody} testID="product-reserved-sheet">
        <View style={styles.reservedTimerStack}>
          <Ionicons name="bag-outline" size={theme.iconSize.lg} color={theme.colors.ink} accessibilityElementsHidden />
          <AppText variant="numeric" color={fc.accent}>
            {countdown}
          </AppText>
        </View>
        <AppText variant="h3" align="center">
          {t('product.reservedTitle')}
        </AppText>
        <AppText variant="body" align="center" color={theme.colors.secondary}>
          {t('product.reservedBody')}
        </AppText>
        <Button
          label={t('product.viewCart')}
          tone="solid"
          block
          onPress={onViewCart}
          testID="product-reserved-view-cart"
        />
      </View>
    </AppSheet>
  );
}

/* ── 10. Visionneuse plein écran (écran 4) : bord à bord sans marge blanche ── */

function VideoPage({ url }: { url: string }) {
  const player = useVideoPlayer({ uri: mediaUrl(url) }, (instance) => {
    instance.loop = false;
    instance.muted = false;
    instance.play();
  });
  useEffect(() => () => player.pause(), [player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />;
}

export function GalleryViewer({
  items, index, onClose,
}: {
  items: GalleryItem[];
  index: number | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [current, setCurrent] = useState(index ?? 0);

  useEffect(() => { if (index !== null) setCurrent(index); }, [index]);

  /** Les points : un par photo, 8 au plus, 12 dp d'écart. */
  const dots = useMemo(() => items.slice(0, 8), [items]);
  /*
   * 14/11 — plein écran Privé (`Screenshot_20261113_023800`) : fond BLANC, croix
   * en haut à gauche, la photo ENTIÈRE (`contain`) dans une bande grise de 1,43 ×
   * la largeur, centrée. L'ancien plein écran noir en `cover` agrandissait la
   * photo au point de ne plus voir le produit (« تظهر كبيرة برشا »).
   */
  /*
   * 13/11 — RÈGLE : la croix vit EN HAUT, dans une rangée d'en-tête identique à
   * celle des flèches retour (même hauteur, même retrait, même cible). La bande
   * photo commence sous cette rangée.
   */
  const stageTop = insets.top + FICHE.headerHeight;
  const stage = viewerStageHeight(width, height - insets.bottom, stageTop);
  const stageOffset = Math.max(stageTop, Math.round((height - stage) / 2) - FICHE.viewerDotsBottom);

  return (
    <Modal visible={index !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.viewer, { backgroundColor: theme.colors.canvas }]} testID="product-gallery-viewer">
        <FlatList
          data={items}
          keyExtractor={(item) => item.url}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index ?? 0}
          getItemLayout={(_, position) => ({ length: width, offset: width * position, index: position })}
          onMomentumScrollEnd={(event) => setCurrent(Math.round(event.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: position }) => (
            <View style={[styles.viewerPage, { width, height, paddingTop: stageOffset }]}>
              <View
                testID="product-gallery-stage"
                style={[styles.viewerStage, { height: stage, backgroundColor: item.kind === 'video' ? VIDEO_BACKDROP : fc.photo }]}
              >
                {item.kind === 'video' ? (
                  <VideoPage url={item.url} />
                ) : (
                  <AppImage
                    testID="product-gallery-image"
                    uri={mediaUrl(item.url)}
                    highRes
                    background={fc.photo}
                    style={styles.fill}
                    contentFit="contain"
                    accessibilityLabel={t('product.photo', { index: String(position + 1), total: String(items.length) })}
                    decorative={false}
                  />
                )}
              </View>
            </View>
          )}
        />

        {dots.length > 1 ? (
          <View pointerEvents="none" style={[styles.viewerDotsOverlay, { bottom: FICHE.viewerDotsBottom + insets.bottom }]}>
            {dots.map((item, position) => (
              <View key={`${item.url}-${position}`} style={styles.viewerDotSlot}>
                <View
                  style={{
                    width: FICHE.viewerDot,
                    height: FICHE.viewerDot,
                    borderRadius: FICHE.viewerDot / 2,
                    backgroundColor: position === current ? theme.colors.ink : fc.dotIdle,
                  }}
                />
              </View>
            ))}
          </View>
        ) : null}

        <View
          pointerEvents="box-none"
          testID="product-gallery-header"
          style={[styles.viewerHeader, { paddingTop: insets.top, height: FICHE.headerHeight + insets.top }]}
        >
          <View pointerEvents="box-none" style={[styles.headerRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
            <CloseButton onPress={onClose} label={t('common.close')} color={theme.colors.ink} testID="product-gallery-close" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ── Styles : toutes les cotes viennent de `FICHE` ─────────────────────────── */

const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, start: 0, end: 0 },
  /* La couche épinglée : la photo ne bouge pas, la feuille glisse dessus. */
  pinnedPhoto: { position: 'absolute', top: 0, start: 0, end: 0, height: FICHE.imageHeight, overflow: 'hidden' },
  photoStrip: { flexDirection: 'row' },
  headerRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  // Privé : titre aligné après la flèche (« ← adidas Sportswear »), police Expanded.
  headerTitle: { flex: 1, textAlign: 'auto', fontSize: FICHE.headerTitle, lineHeight: FICHE.nameLine, marginStart: 8 },
  headerShadow: { position: 'absolute', start: 0, end: 0, bottom: -FICHE_DETAIL.headerShadow, height: FICHE_DETAIL.headerShadow },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cartPill: {
    height: FICHE_DETAIL.cartPill,
    minWidth: FICHE_DETAIL.cartPill,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingStart: 12,
    paddingEnd: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cartCountdown: { fontVariant: ['tabular-nums'] },
  /* Le sac (24) laisse 6 dp au-dessus et en dessous dans la pastille de 36 : le badge y tient. */
  cartPillBagWrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  cartPillBadge: {
    position: 'absolute',
    top: -4,
    minWidth: FICHE_DETAIL.cartBadge,
    height: FICHE_DETAIL.cartBadge,
    borderRadius: FICHE_DETAIL.cartBadge / 2,
    borderWidth: 1,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartPillBadgeText: {
    fontSize: FICHE_DETAIL.cartBadgeText,
    lineHeight: FICHE_DETAIL.cartBadgeLine,
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  cartPillBadgeLTR: { right: -6 },
  cartPillBadgeRTL: { left: -6 },
  /* Ombres de la feuille (13/11) */
  sheetEdge: { height: FICHE_DETAIL.headerShadow },

  photo: { height: FICHE.imageHeight },
  photoFrame: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  fill: { width: '100%', height: '100%' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  expand: { position: 'absolute', bottom: FICHE_DETAIL.expandInset },
  expandLTR: { right: FICHE_DETAIL.expandInset },
  expandRTL: { left: FICHE_DETAIL.expandInset },
  dots: { position: 'absolute', start: 0, end: 0, bottom: FICHE.photoDotsBottom, flexDirection: 'row', justifyContent: 'center' },
  dotSlot: { width: FICHE.dotPitch, alignItems: 'center', justifyContent: 'center' },

  identity: { paddingHorizontal: FICHE.gutter, paddingTop: FICHE.nameTop, paddingBottom: FICHE.gutter },
  identityTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  identityStart: { flex: 1, alignItems: 'flex-start', marginEnd: 12 },
  nameBox: { maxWidth: '100%', borderBottomWidth: FICHE.underlineWidth, paddingBottom: FICHE.underlineGap },
  name: { fontSize: FICHE.nameSize, lineHeight: FICHE.nameLine },
  priceColumn: { alignItems: 'flex-end', flexShrink: 0 },
  price: { fontSize: FICHE.priceSize, lineHeight: FICHE.nameLine },
  reference: { fontSize: FICHE_DETAIL.referenceSize, lineHeight: FICHE_DETAIL.fullNameLine },
  struck: { textDecorationLine: 'line-through' },
  fullName: { fontSize: FICHE_DETAIL.fullNameSize, lineHeight: FICHE_DETAIL.fullNameLine, marginTop: FICHE.fullNameGap },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: FICHE.rowHeight,
    paddingStart: FICHE.rowIconStart,
    paddingEnd: FICHE.chevronEnd,
  },
  rowIcon: { width: ICON_BOX, alignItems: 'flex-start' },
  rowText: { flex: 1, marginStart: FICHE.rowLabelStart - FICHE.rowIconStart - ICON_BOX },
  rowLabel: { fontSize: FICHE.rowLabel },
  rowValue: { fontSize: FICHE.rowLabel },
  chevron: { width: FICHE.chevronSize, alignItems: 'flex-end' },

  tiles: { flexDirection: 'row', gap: FICHE.tileGap, paddingStart: FICHE.gutter, paddingTop: FICHE.tileTop },
  tile: { width: FICHE.tileWidth },
  tileImage: { width: FICHE.tileWidth, height: FICHE.tileHeight },
  tilePlain: {
    width: FICHE.tileWidth, height: FICHE.tileHeight, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  tilePlainText: { fontSize: FICHE.tileLabel, textAlign: 'center' },
  tileRule: { height: FICHE.tileRule },
  tileLabel: { fontSize: FICHE.tileLabel, marginTop: FICHE.tileLabelGap },

  // Privé : le contenu d'une section s'aligne sur la marge de l'écran (x = 32 px), pas sur le libellé.
  sectionBody: { paddingStart: FICHE.gutter, paddingEnd: FICHE.gutter, paddingTop: FICHE_DETAIL.sectionTop, paddingBottom: FICHE_DETAIL.sectionBottom },
  specGrid: { flexWrap: 'wrap', columnGap: FICHE_DETAIL.specColumnGap, rowGap: FICHE_DETAIL.specRowGap },
  specCell: { width: '47%', flexGrow: 1 },
  specCellWide: { width: '100%' },
  specLabel: { fontSize: FICHE_DETAIL.specLabelSize, lineHeight: FICHE_DETAIL.specLabelLine },
  specValue: { fontSize: FICHE_DETAIL.specValueSize, lineHeight: FICHE_DETAIL.specValueLine },
  link: { alignSelf: 'flex-start', alignItems: 'center', gap: 8, marginTop: FICHE_DETAIL.linkTop, marginStart: FICHE_DETAIL.linkInset },
  linkBox: { borderBottomWidth: FICHE_DETAIL.linkRule, paddingBottom: FICHE_DETAIL.linkGap },
  linkText: { fontSize: FICHE_DETAIL.linkSize, lineHeight: FICHE_DETAIL.linkLine },
  hairline: { height: FICHE.hairline },

  infoRow: {
    flexDirection: 'row',
    paddingStart: FICHE.rowIconStart,
    paddingEnd: FICHE.gutter,
    paddingTop: FICHE.infoTop,
  },
  infoIcon: { paddingTop: 2 },
  infoText: { flex: 1, marginStart: FICHE.rowLabelStart - FICHE.rowIconStart - ICON_BOX },
  infoTitle: { fontSize: FICHE.infoTitle, lineHeight: FICHE.infoLine },
  infoLine: { fontSize: FICHE.infoBody, lineHeight: FICHE.infoLine },

  band: { height: FICHE.band },

  buyBar: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  buyRow: {
    height: FICHE.barHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingStart: FICHE.gutter,
    paddingEnd: FICHE_DETAIL.barEnd,
    gap: FICHE_DETAIL.barGap,
  },
  buyError: { paddingStart: FICHE.gutter, paddingEnd: FICHE.gutter, paddingTop: 4 },
  buyPrice: { flex: 1, minWidth: 0, justifyContent: 'center' },
  buyPriceText: { fontSize: FICHE_DETAIL.barPriceSize, lineHeight: FICHE_DETAIL.barPriceLine },
  buyButton: { width: FICHE.barButtonWidth, height: FICHE.barButtonHeight, paddingHorizontal: 12 },

  sheetHeaderRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingStart: FICHE.gutter,
    paddingEnd: 8,
    paddingBottom: 10,
    borderBottomWidth: FICHE.hairline,
  },
  sheetHeaderTitles: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    fontSize: FICHE.sheetTitle,
    lineHeight: FICHE.sheetTitleLine,
  },
  sheetRows: { paddingTop: 0 },
  makerBody: { paddingTop: 16, paddingBottom: 24 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: FICHE.sizeRowHeight,
    paddingStart: 4,
    paddingEnd: 4,
    borderBottomWidth: FICHE.hairline,
  },
  sheetRowEnd: { alignItems: 'center', gap: 8 },
  sheetRowValue: { fontSize: FICHE.sheetTitle },
  sheetRowState: { fontSize: FICHE.rowState },
  sheetEmpty: { fontSize: FICHE.panelText, paddingVertical: 12 },
  reservedHeader: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingStart: 8,
    paddingEnd: 8,
    paddingBottom: 4,
    borderBottomWidth: FICHE.hairline,
  },
  reservedBody: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  reservedTimerStack: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  viewer: { flex: 1 },
  viewerPage: { justifyContent: 'flex-start' },
  viewerStage: { width: '100%', overflow: 'hidden' },
  viewerDotsOverlay: {
    position: 'absolute',
    start: 0,
    end: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  viewerDotSlot: { width: FICHE.viewerDotPitch, alignItems: 'center' },
  viewerHeader: { position: 'absolute', top: 0, start: 0, end: 0 },
});
