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
import { type ComponentProps, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoView } from 'expo-video';

import { AppText, Button } from '@/design/ui';
import { AppSheet } from '@/design/sheet/AppSheet';
import { LoadingSpinner } from '@/design/LoadingSpinner';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { FICHE_COLORS, ficheColorsFor, RADIUS, SHEET_CORNER_RADIUS, VIDEO_BACKDROP } from '@/design/tokens.mobile';
import { FICHE, type ColorTile, type GalleryItem, type SizeRow } from './fiche';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Colonne des icônes : la boîte de 24 dp commence à 17 dp (maquette : 46 px). */
const ICON_BOX = FICHE.rowIcon;

/* ── 1. En-tête : transparent sur la photo, plein dès qu'elle est sortie ───── */

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
  /** Nombre total d'articles dans le panier pour le badge violet. */
  cartCount?: number;
  /** Déclenche l'extension verte « Article ajouté » pendant ~2,4 s après l'ajout. */
  justAdded?: boolean;
  /** Compte à rebours `MM:SS` de la réservation de 20 minutes. */
  reservationCountdown?: string | null;
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

  const solid = scrollY.interpolate({
    inputRange: [FICHE.imageHeight - FICHE.headerHeight - 40, FICHE.imageHeight - FICHE.headerHeight],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const pillShiftX = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.isRTL ? -6 : 6, 0],
  });

  const showPill = justAdded || cartCount > 0;
  const badgeText = cartCount > 99 ? '99+' : String(Math.max(1, cartCount));

  return (
    <View pointerEvents="box-none" style={[styles.header, { paddingTop: topInset, height: FICHE.headerHeight + topInset }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.colors.canvas,
            opacity: solid,
            borderBottomWidth: FICHE.headerRule,
            borderBottomColor: fc.hair,
          },
        ]}
      />
      <View style={[styles.headerRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={onBack}
          hitSlop={8}
          style={styles.headerButton}
        >
          <Ionicons
            name={theme.isRTL ? 'chevron-forward-outline' : 'chevron-back-outline'}
            size={theme.iconSize.md}
            color={theme.colors.ink}
            accessibilityElementsHidden
          />
        </Pressable>

        <Animated.Text
          numberOfLines={1}
          style={[styles.headerTitle, { color: theme.colors.ink, opacity: solid, fontFamily: theme.font('semibold') }]}
        >
          {title}
        </Animated.Text>

        {showPill ? (
          <Animated.View style={{ transform: [{ translateX: pillShiftX }] }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('tabs.cart')}
              onPress={onCart}
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
                <AppText variant="label" weight="bold" color={fc.onAccent} numberOfLines={1}>
                  {t('product.addedPill')}
                </AppText>
              ) : reservationCountdown ? (
                <AppText variant="label" weight="semibold" color={fc.ink} numberOfLines={1}>
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
                    { backgroundColor: fc.accent },
                    theme.isRTL ? styles.cartPillBadgeRTL : styles.cartPillBadgeLTR,
                  ]}
                >
                  <AppText variant="caption" weight="bold" color={fc.onAccent}>
                    {badgeText}
                  </AppText>
                </View>
              </View>
            </Pressable>
          </Animated.View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('tabs.cart')}
            onPress={onCart}
            hitSlop={8}
            testID="product-header-cart"
            style={styles.headerButton}
          >
            <Ionicons name="bag-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/* ── 1 bis. La photo ÉPINGLÉE derrière la feuille qui monte ──────────────────
 *
 * Planche `docs/design/bigcard/mockup-sticky-24-10.png` : « الصورة ثابتة والورقة
 * تتحرك ». La photo ne défile donc PAS : elle est posée dans une couche fixe en
 * haut de l'écran, et la feuille blanche monte par-dessus au défilement.
 *
 * Deux conséquences volontaires :
 *  • la couche est `pointerEvents="none"` (et masquée aux lecteurs d'écran) :
 *    l'appui qui ouvre le plein écran se fait dans la FENÊTRE de la feuille, pas
 *    ici — sinon deux zones tactiles se superposeraient pour le même geste ;
 *  • les points de galerie restent dans la photo : ils disparaissent sous la
 *    feuille en même temps qu'elle, comme sur la planche.
 */
export function FichePhotoLayer({ items, index }: { items: GalleryItem[]; index: number }) {
  const insets = useSafeAreaInsets();
  const totalHeight = FICHE.imageHeight + insets.top;
  return (
    <View
      style={[styles.pinnedPhoto, { height: totalHeight }]}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <FichePhoto items={items} index={index} height={totalHeight} onOpen={() => {}} />
    </View>
  );
}

/* ── 2. Photo (écran 1) : une photo, des points, un appui = plein écran ────── */

export function FichePhoto({
  items, index, height, onOpen,
}: {
  items: GalleryItem[];
  /** Photo affichée (change quand on choisit une couleur). */
  index: number;
  height?: number;
  onOpen: (index: number) => void;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  const t = useT();
  const current = items[index] ?? items[0];
  const count = items.length;
  const active = Math.max(0, Math.min(index, count - 1));

  return (
    <View style={[styles.photo, { height: height ?? FICHE.imageHeight, backgroundColor: theme.colors.surface }]}>
      {current ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('product.openGallery')}
          onPress={() => onOpen(active)}
          style={StyleSheet.absoluteFill}
        >
          {current.kind === 'video' ? (
            <View style={[StyleSheet.absoluteFill, styles.photoEmpty]}>
              <Ionicons name="play-outline" size={theme.iconSize.lg} color={theme.colors.ink} accessibilityElementsHidden />
            </View>
          ) : (
            <AppImage
              uri={mediaUrl(current.url)}
              highRes
              background={theme.colors.surface}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityLabel={t('product.photo', { index: String(active + 1), total: String(count) })}
              decorative
            />
          )}
        </Pressable>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.photoEmpty]}>
          <AppText variant="caption" color={theme.colors.muted}>{t('catalog.noImage')}</AppText>
        </View>
      )}

      {count > 1 ? (
        <View pointerEvents="none" style={styles.dots}>
          {items.map((item, position) => {
            const size = position === active ? FICHE.dot : FICHE.dotIdle;
            return (
              <View key={`${item.url}-${position}`} style={styles.dotSlot}>
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
    </View>
  );
}

/* ── 3. Identité : nom souligné à la largeur du mot, prix en face, description ─ */

export function FicheIdentity({
  name, price, description,
}: {
  name: string;
  price: string | null;
  description: string;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  return (
    <View style={styles.identity}>
      <View style={styles.identityTop}>
        {/* Le filet fait exactement la largeur du mot : la boîte se rétrécit au texte. */}
        <View style={[styles.nameBox, { borderBottomColor: fc.nameUnderline }]}>
          <AppText numberOfLines={2} style={[styles.name, { color: theme.colors.ink, fontFamily: theme.font('regular') }]}>
            {name}
          </AppText>
        </View>
        {price ? (
          <AppText style={[styles.price, { color: theme.colors.ink, fontFamily: theme.font('bold') }]}>{price}</AppText>
        ) : null}
      </View>
      {description ? (
        <AppText
          numberOfLines={2}
          style={[styles.description, { color: fc.muted, fontFamily: theme.font('regular') }]}
        >
          {description}
        </AppText>
      ) : null}
    </View>
  );
}

/* ── 4. Ligne de choix : icône, libellé, valeur, chevron ───────────────────── */

export function ChoiceRow({
  icon, label, value, onPress, chevron = false, testID,
}: {
  icon: IoniconName;
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
        <Ionicons name={icon} size={ICON_BOX} color={theme.colors.ink} accessibilityElementsHidden />
      </View>
      <View style={styles.rowText}>
        <AppText numberOfLines={1} style={[styles.rowLabel, { color: theme.colors.ink, fontFamily: theme.font('bold') }]}>
          {label}
        </AppText>
        {value ? (
          <AppText numberOfLines={1} style={[styles.rowValue, { color: theme.colors.ink, fontFamily: theme.font('regular') }]}>
            {value}
          </AppText>
        ) : null}
      </View>
      {chevron ? (
        <View style={styles.chevron}>
          <Ionicons name="chevron-down-outline" size={FICHE.chevronSize} color={theme.colors.ink} accessibilityElementsHidden />
        </View>
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;
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
              style={[styles.tileLabel, { color: theme.colors.ink, fontFamily: active ? theme.font('bold') : theme.font('regular') }]}
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
  icon, title, children, defaultOpen = false,
}: {
  icon: IoniconName;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        onPress={() => setOpen((value) => !value)}
        style={styles.row}
      >
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={ICON_BOX} color={theme.colors.ink} accessibilityElementsHidden />
        </View>
        <View style={styles.rowText}>
          <AppText numberOfLines={1} style={[styles.rowLabel, { color: theme.colors.ink, fontFamily: theme.font('bold') }]}>
            {title}
          </AppText>
        </View>
        <View style={styles.chevron}>
          <Ionicons name={open ? 'chevron-up-outline' : 'chevron-down-outline'} size={FICHE.chevronSize} color={theme.colors.ink} accessibilityElementsHidden />
        </View>
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
      <View style={[styles.hairline, { backgroundColor: fc.hair }]} />
    </View>
  );
}

/* ── 7. Bloc d'information (livraison, retours, partage) ───────────────────── */

export function InfoRow({
  icon, title, titleColor, lines, onPress, testID,
}: {
  icon: IoniconName;
  title: string;
  titleColor?: string;
  lines?: string[];
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  const content = (
    <>
      <View style={[styles.rowIcon, styles.infoIcon]}>
        <Ionicons name={icon} size={ICON_BOX} color={theme.colors.ink} accessibilityElementsHidden />
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

  if (!onPress) return <View style={styles.infoRow}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} testID={testID} style={styles.infoRow}>
      {content}
    </Pressable>
  );
}

/** Ligne « libellé — valeur » d'un accordéon (Caractéristiques, Matière…). */
export function SpecLine({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  const fc = ficheColorsFor(theme.mode);
  return (
    <View style={[styles.specLine, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
      <AppText numberOfLines={1} style={[styles.specLabel, { color: fc.muted, fontFamily: theme.font('regular') }]}>
        {label}
      </AppText>
      <AppText style={[styles.specValue, { color: theme.colors.ink, fontFamily: theme.font('regular') }]}>
        {value}
      </AppText>
    </View>
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
  const blocked = disabled || busy;
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
          <AppText style={[styles.buyPriceText, { color: theme.colors.ink, fontFamily: theme.font('bold') }]}>{price}</AppText>
        </View>
        {/*
          Bouton du CTA : 207 × 48 dp, rayon 24 dp, **noir** (maquette). Ce n'est pas
          le `Button` du Design System (pastille à rayon plein) : la cote est gelée,
          donc la forme vient de `FICHE`, la couleur de l'encre du thème.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: blocked, busy }}
          disabled={blocked}
          onPress={onPress}
          testID={testID}
          style={({ pressed }) => [
            styles.buyButton,
            {
              backgroundColor: pressed ? theme.colors.secondary : theme.colors.ink,
              opacity: disabled ? theme.opacity.disabled : 1,
            },
          ]}
        >
          {busy
            ? <LoadingSpinner size="sm" color={theme.colors.canvas} testID={testID ? `${testID}-busy` : undefined} />
            : (
              <AppText style={[styles.buyButtonLabel, { color: theme.colors.canvas, fontFamily: theme.font('bold') }]}>
                {label}
              </AppText>
            )}
        </Pressable>
      </View>
    </View>
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
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={[styles.sheetScrim, { height: FICHE.sheetTop, backgroundColor: fc.scrim }]}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.canvas,
              borderTopLeftRadius: SHEET_CORNER_RADIUS,
              borderTopRightRadius: SHEET_CORNER_RADIUS,
            },
          ]}
        >
          <View style={[styles.sheetHeaderRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
            <AppText style={[styles.sheetTitle, { color: theme.colors.ink, fontFamily: theme.font('semibold') }]}>
              {t('product.sizeSheetTitle')}
            </AppText>
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

          {/* Recommandation : la dalle lavande de la maquette. */}
          <View style={[styles.sheetPanel, { backgroundColor: fc.recommendation }]}>
            <View style={styles.sheetPanelIcon}>
              <Ionicons name="pricetag-outline" size={ICON_BOX} color={theme.colors.ink} accessibilityElementsHidden />
            </View>
            <AppText style={[styles.sheetPanelText, { color: theme.colors.ink, fontFamily: theme.font('regular') }]}>
              {t('product.sizeRecommendation')}
            </AppText>
          </View>

          <AppText style={[styles.sheetColumn, { color: theme.colors.ink, fontFamily: theme.font('semibold') }]}>
            {t('catalog.size').toUpperCase()}
          </AppText>

          {rows.length > 0 ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetRows}>
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
                    style={[styles.sheetRow, { borderBottomColor: fc.hair }]}
                  >
                    <AppText
                      style={[styles.sheetRowValue, {
                        color,
                        fontFamily: active ? theme.font('bold') : theme.font('regular'),
                        textDecorationLine: row.available ? 'none' : 'line-through',
                        textDecorationColor: fc.struck,
                      }]}
                    >
                      {row.value}
                    </AppText>
                    <View style={[styles.sheetRowEnd, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
                      {row.state === 'last' ? (
                        <AppText style={[styles.sheetRowState, { color: fc.accent, fontFamily: theme.font('regular') }]}>
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
            </ScrollView>
          ) : (
            <AppText style={[styles.sheetEmpty, { color: fc.muted }]}>{t('product.sizeSheetEmpty')}</AppText>
          )}
        </View>
      </View>
    </Modal>
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
        <View style={[styles.reservedHeader, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          <AppText variant="lead" weight="bold">{t('product.reservedTitle')}</AppText>
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
        <View style={[styles.reservedTimerRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          <Ionicons name="bag-outline" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
          <AppText variant="lead" weight="bold" color={fc.accent}>
            {countdown}
          </AppText>
        </View>
        <AppText variant="body" align="center" color={theme.colors.ink}>
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

  /** Les points de la maquette : un par photo, 8 au plus, 12 dp d'écart. */
  const dots = useMemo(() => items.slice(0, 8), [items]);

  return (
    <Modal visible={index !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.viewer, { backgroundColor: VIDEO_BACKDROP }]} testID="product-gallery-viewer">
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
            <View style={{ width, height }}>
              {item.kind === 'video' ? (
                <VideoPage url={item.url} />
              ) : (
                <AppImage
                  uri={mediaUrl(item.url)}
                  highRes
                  background={VIDEO_BACKDROP}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityLabel={t('product.photo', { index: String(position + 1), total: String(items.length) })}
                  decorative={false}
                />
              )}
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
                    backgroundColor: position === current ? fc.onAccent : fc.dotIdle,
                  }}
                />
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          hitSlop={8}
          style={[styles.viewerClose, { top: insets.top + FICHE.viewerCloseTop }]}
        >
          <Ionicons name="close-outline" size={theme.iconSize.md} color={fc.onAccent} accessibilityElementsHidden />
        </Pressable>
      </View>
    </Modal>
  );
}

/* ── Styles : toutes les cotes viennent de `FICHE` ─────────────────────────── */

const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, start: 0, end: 0 },
  /* La couche épinglée : la photo ne bouge pas, la feuille glisse dessus. */
  pinnedPhoto: { position: 'absolute', top: 0, start: 0, end: 0, height: FICHE.imageHeight },
  headerRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FICHE.headerTitle },
  cartPill: {
    height: 36,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cartPillBagWrap: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  cartPillBadge: {
    position: 'absolute',
    top: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartPillBadgeLTR: { right: -6 },
  cartPillBadgeRTL: { left: -6 },

  photo: { height: FICHE.imageHeight },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', start: 0, end: 0, bottom: FICHE.photoDotsBottom, flexDirection: 'row', justifyContent: 'center' },
  dotSlot: { width: FICHE.dotPitch, alignItems: 'center', justifyContent: 'center' },

  identity: { paddingHorizontal: FICHE.gutter, paddingTop: FICHE.nameTop },
  identityTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  nameBox: { flexShrink: 1, borderBottomWidth: FICHE.underlineWidth, paddingBottom: FICHE.underlineGap, marginEnd: 12 },
  name: { fontSize: FICHE.nameSize, lineHeight: FICHE.nameLine },
  price: { fontSize: FICHE.priceSize, lineHeight: FICHE.nameLine, marginStart: 8 },
  description: { fontSize: FICHE.descriptionSize, lineHeight: FICHE.descriptionLine, marginTop: FICHE.descriptionGap },

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

  sectionBody: { paddingStart: FICHE.rowLabelStart, paddingEnd: FICHE.gutter, paddingBottom: 16, gap: 8 },
  specLine: { alignItems: 'baseline', gap: 8 },
  specLabel: { fontSize: FICHE.infoBody },
  specValue: { flex: 1, fontSize: FICHE.infoBody },
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
    paddingEnd: 8,
  },
  buyError: { paddingStart: FICHE.gutter, paddingEnd: FICHE.gutter, paddingTop: 4 },
  buyPrice: { flex: 1, justifyContent: 'center' },
  buyPriceText: { fontSize: FICHE.barPrice },
  buyButton: {
    width: FICHE.barButtonWidth,
    height: FICHE.barButtonHeight,
    borderRadius: FICHE.barButtonRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyButtonLabel: { fontSize: FICHE.barPrice },

  sheetRoot: { flex: 1 },
  sheetScrim: { backgroundColor: FICHE_COLORS.scrim },
  sheet: { flex: 1, overflow: 'hidden' },
  sheetHeaderRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingStart: FICHE.gutter,
    paddingEnd: 8,
    marginTop: 12,
  },
  sheetTitle: {
    flex: 1,
    fontSize: FICHE.sheetTitle, lineHeight: FICHE.sheetTitleLine,
  },
  sheetPanel: {
    marginHorizontal: FICHE.panelGutter,
    marginTop: FICHE.panelTop,
    height: FICHE.panelHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: FICHE.panelIconStart,
    paddingEnd: FICHE.panelGutter,
  },
  sheetPanelIcon: { width: ICON_BOX, alignItems: 'flex-start' },
  sheetPanelText: {
    flex: 1,
    fontSize: FICHE.panelText,
    lineHeight: FICHE.panelLine,
    marginStart: FICHE.panelTextStart - FICHE.panelIconStart - ICON_BOX,
  },
  sheetColumn: {
    fontSize: FICHE.columnHeader,
    paddingStart: FICHE.rowStateEnd, paddingTop: FICHE.columnsTop,
  },
  sheetRows: { paddingTop: FICHE.rowsTop },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: FICHE.sizeRowHeight,
    paddingStart: FICHE.rowStateEnd,
    paddingEnd: FICHE.rowStateEnd,
    borderBottomWidth: FICHE.hairline,
  },
  sheetRowEnd: { alignItems: 'center', gap: 8 },
  sheetRowValue: { fontSize: FICHE.rowSize },
  sheetRowState: { fontSize: FICHE.rowState },
  sheetEmpty: { fontSize: FICHE.panelText, paddingHorizontal: FICHE.gutter, marginTop: FICHE.panelTop },
  reservedHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingStart: 16,
    paddingEnd: 8,
  },
  reservedBody: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  reservedTimerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  viewer: { flex: 1 },
  viewerDotsOverlay: {
    position: 'absolute',
    start: 0,
    end: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  viewerDotSlot: { width: FICHE.viewerDotPitch, alignItems: 'center' },
  viewerClose: {
    position: 'absolute', start: FICHE.viewerCloseStart,
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
  },
});
