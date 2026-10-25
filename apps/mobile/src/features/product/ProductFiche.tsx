/**
 * GRANDE FICHE — pièces d'interface (réécrites le 25/10/2026).
 *
 * Maquette de référence : `docs/design/cardproduit/mockup-complet-25-10.png`
 * (4 écrans) — les cotes sont dans `./fiche.ts`, mesurées en dp (pixels ÷ 2).
 *
 * Typographie et icônes : **uniquement les ressources officielles du projet** —
 * Zalando Sans / Noto Sans Arabic (`theme.font(...)`) et Ionicons embarqué. Aucune
 * police ni aucun pictogramme rapporté.
 *
 * Ce que ces pièces NE font PAS, volontairement :
 *  • aucun prix calculé ici — la fiche affiche `finalPrice` du serveur ;
 *  • **aucun prix barré, aucune remise, aucune pastille de pourcentage** ;
 *  • aucune section vide, aucun « — » : une donnée absente disparaît ;
 *  • aucun bouton qui ne peut pas aboutir (le CTA reste désactivé tant que le
 *    choix de taille n'est pas complet).
 */
import { type ComponentProps, type ReactNode, useEffect, useMemo, useState } from 'react';
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
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { useT } from '@/i18n';
import { mediaUrl } from '@/api/client';
import { FICHE_COLORS, veil } from '@/design/tokens.mobile';
import { FICHE, type ColorTile, type GalleryItem, type SizeRow } from './fiche';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/* ── 1. En-tête : transparent sur la photo, plein dès qu'elle est sortie ───── */

export function FicheHeader({
  title, onBack, onCart, scrollY, topInset,
}: {
  title: string;
  onBack: () => void;
  onCart: () => void;
  /** Position de défilement : le fond s'opacifie sans re-render de la page. */
  scrollY: Animated.Value;
  topInset: number;
}) {
  const theme = useTheme();
  const t = useT();

  const solid = scrollY.interpolate({
    inputRange: [FICHE.imageHeight - FICHE.headerHeight - 40, FICHE.imageHeight - FICHE.headerHeight],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View pointerEvents="box-none" style={[styles.header, { paddingTop: topInset, height: FICHE.headerHeight + topInset }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.colors.canvas,
            opacity: solid,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.colors.line,
          },
        ]}
      />
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={onBack}
          hitSlop={8}
          style={styles.headerButton}
        >
          <Ionicons
            name={theme.isRTL ? 'chevron-forward' : 'chevron-back'}
            size={26}
            color={theme.colors.ink}
            accessibilityElementsHidden
          />
        </Pressable>

        <Animated.Text
          numberOfLines={1}
          style={[styles.headerTitle, { color: theme.colors.ink, opacity: solid, fontFamily: theme.font('bold') }]}
        >
          {title}
        </Animated.Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tabs.cart')}
          onPress={onCart}
          hitSlop={8}
          style={styles.headerButton}
        >
          <Ionicons name="bag-handle-outline" size={24} color={theme.colors.ink} accessibilityElementsHidden />
        </Pressable>
      </View>
    </View>
  );
}

/* ── 2. Photo (écran 1) : une photo, des points, un appui = plein écran ────── */

export function FichePhoto({
  items, index, onOpen,
}: {
  items: GalleryItem[];
  /** Photo affichée (change quand on choisit une couleur). */
  index: number;
  onOpen: (index: number) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const current = items[index] ?? items[0];
  const count = items.length;

  return (
    <View style={[styles.photo, { backgroundColor: theme.colors.surface }]}>
      {current ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('product.openGallery')}
          onPress={() => onOpen(Math.max(0, index))}
          style={StyleSheet.absoluteFill}
        >
          {current.kind === 'video' ? (
            <View style={[StyleSheet.absoluteFill, styles.photoEmpty]}>
              <Ionicons name="play" size={36} color={theme.colors.ink} accessibilityElementsHidden />
            </View>
          ) : (
            <AppImage
              uri={mediaUrl(current.url)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityLabel={t('product.photo', { index: String(index + 1), total: String(count) })}
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
            const size = position === Math.max(0, index) ? FICHE.dot : FICHE.dotIdle;
            return (
              <View key={`${item.url}-${position}`} style={styles.dotSlot}>
                <View
                  style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: position === Math.max(0, index) ? theme.colors.ink : FICHE_COLORS.dotIdle,
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
  return (
    <View style={styles.identity}>
      <View style={styles.identityTop}>
        {/* Le filet fait exactement la largeur du mot : la boîte se rétrécit au texte. */}
        <View style={[styles.nameBox, { borderBottomColor: FICHE_COLORS.nameUnderline }]}>
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
          style={[styles.description, { color: theme.colors.muted, fontFamily: theme.font('regular') }]}
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
      <Ionicons name={icon} size={FICHE.rowIcon} color={theme.colors.ink} accessibilityElementsHidden />
      <View style={styles.rowText}>
        <AppText style={[styles.rowLabel, { color: theme.colors.ink, fontFamily: theme.font('bold') }]}>{label}</AppText>
        {value ? (
          <AppText numberOfLines={1} style={[styles.rowValue, { color: theme.colors.ink, fontFamily: theme.font('regular') }]}>
            {value}
          </AppText>
        ) : null}
      </View>
      {chevron ? <Ionicons name="chevron-down" size={FICHE.chevronSize + 5} color={theme.colors.ink} accessibilityElementsHidden /> : null}
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
              <View style={[styles.tilePlain, { borderColor: theme.colors.line }]}>
                <AppText numberOfLines={2} style={[styles.tilePlainText, { color: theme.colors.ink }]}>{tile.color}</AppText>
              </View>
            )}
            <View style={[styles.tileRule, { backgroundColor: active ? theme.colors.accent : theme.colors.canvas }]} />
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

/* ── 6. Ligne de section pliable (Caractéristiques · Matière · …) ──────────── */

export function SectionRow({
  icon, title, children, defaultOpen = false,
}: {
  icon: IoniconName;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const theme = useTheme();
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
        <Ionicons name={icon} size={FICHE.rowIcon} color={theme.colors.ink} accessibilityElementsHidden />
        <View style={styles.rowText}>
          <AppText style={[styles.rowLabel, { color: theme.colors.ink, fontFamily: theme.font('bold') }]}>{title}</AppText>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={FICHE.chevronSize + 5} color={theme.colors.ink} accessibilityElementsHidden />
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
      <View style={[styles.hairline, { backgroundColor: theme.colors.line }]} />
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
  const content = (
    <>
      <Ionicons name={icon} size={FICHE.rowIcon} color={theme.colors.ink} accessibilityElementsHidden />
      <View style={styles.rowText}>
        <AppText style={[styles.infoTitle, { color: titleColor ?? theme.colors.ink, fontFamily: theme.font('bold') }]}>
          {title}
        </AppText>
        {(lines ?? []).map((line, position) => (
          <AppText
            key={`${line}-${position}`}
            style={[styles.infoLine, { color: theme.colors.muted, fontFamily: theme.font('regular') }]}
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

/** Bande grise pleine largeur — le séparateur « plus gros que les autres lignes ». */
export function GrayBand() {
  const theme = useTheme();
  return <View style={[styles.band, { backgroundColor: theme.colors.line }]} />;
}

/** Filet fin pleine largeur. */
export function Hairline() {
  const theme = useTheme();
  return <View style={[styles.hairline, { backgroundColor: theme.colors.line }]} />;
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
        <View style={styles.buyButtonBox}>
          <Button label={label} tone="solid" block onPress={onPress} busy={busy} disabled={disabled} testID={testID} />
        </View>
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
  const t = useT();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={[styles.sheetScrim, { height: FICHE.sheetTop }]}
        />
        <View style={[styles.sheet, { backgroundColor: theme.colors.canvas }]}>
          <View style={[styles.sheetGrab, { backgroundColor: FICHE_COLORS.sheetGrab }]} />
          <AppText style={[styles.sheetTitle, { color: theme.colors.ink, fontFamily: theme.font('regular') }]}>
            {t('product.sizeSheetTitle')}
          </AppText>

          {/* Recommandation : la dalle lavande de la maquette. */}
          <View style={[styles.sheetPanel, { backgroundColor: FICHE_COLORS.recommendation }]}>
            <Ionicons name="resize-outline" size={FICHE.rowIcon} color={theme.colors.ink} accessibilityElementsHidden />
            <AppText style={[styles.sheetPanelText, { color: theme.colors.ink, fontFamily: theme.font('regular') }]}>
              {t('product.sizeRecommendation')}
            </AppText>
          </View>

          <View style={styles.sheetColumns}>
            <AppText style={[styles.sheetColumn, { color: theme.colors.ink, fontFamily: theme.font('semibold') }]}>
              {t('catalog.size').toUpperCase()}
            </AppText>
          </View>

          {rows.length > 0 ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetRows}>
              {rows.map((row) => {
                const active = selected === row.value;
                const color = row.available ? theme.colors.ink : theme.colors.muted;
                return (
                  <Pressable
                    key={row.value}
                    accessibilityRole="button"
                    accessibilityLabel={row.available
                      ? (row.state ? `${row.value} — ${t('product.sizeLast')}` : row.value)
                      : `${row.value} — ${t('catalog.variant.unavailable')}`}
                    accessibilityState={{ selected: active, disabled: !row.available }}
                    disabled={!row.available}
                    onPress={() => onSelect(row.value)}
                    style={styles.sheetRow}
                  >
                    <AppText style={[styles.sheetRowValue, { color, fontFamily: theme.font('regular'), textDecorationLine: row.available ? 'none' : 'line-through' }]}>
                      {row.value}
                    </AppText>
                    {row.state === 'last' ? (
                      <AppText style={[styles.sheetRowState, { color: theme.colors.accent, fontFamily: theme.font('regular') }]}>
                        {t('product.sizeLast')}
                      </AppText>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <AppText style={[styles.sheetEmpty, { color: theme.colors.muted }]}>{t('product.sizeSheetEmpty')}</AppText>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* ── 10. Visionneuse plein écran (écran 4) : blanc, croix, points ──────────── */

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
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [current, setCurrent] = useState(index ?? 0);

  useEffect(() => { if (index !== null) setCurrent(index); }, [index]);

  /** Les points de la maquette : un par photo, 8 au plus, 12 dp d'écart. */
  const dots = useMemo(() => items.slice(0, 8), [items]);

  return (
    <Modal visible={index !== null} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.viewer, { backgroundColor: theme.colors.canvas, paddingTop: insets.top }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          hitSlop={8}
          style={styles.viewerClose}
        >
          <Ionicons name="close" size={FICHE.viewerCloseSize} color={theme.colors.ink} accessibilityElementsHidden />
        </Pressable>

        <View style={[styles.viewerStage, { backgroundColor: FICHE_COLORS.viewerStage }]}>
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
              <View style={{ width }}>
                {item.kind === 'video' ? (
                  <VideoPage url={item.url} />
                ) : (
                  <AppImage
                    uri={mediaUrl(item.url)}
                    style={StyleSheet.absoluteFill}
                    contentFit="contain"
                    accessibilityLabel={t('product.photo', { index: String(position + 1), total: String(items.length) })}
                    decorative={false}
                  />
                )}
              </View>
            )}
          />
        </View>

        <View style={styles.viewerDotsSpacer} />

        <View pointerEvents="none" style={[styles.viewerDots, { marginBottom: FICHE.viewerDotsBottom + insets.bottom }]}>
          {dots.map((item, position) => (
            <View key={`${item.url}-${position}`} style={styles.viewerDotSlot}>
              <View
                style={{
                  width: FICHE.viewerDot,
                  height: FICHE.viewerDot,
                  borderRadius: FICHE.viewerDot / 2,
                  backgroundColor: position === current ? theme.colors.ink : FICHE_COLORS.dotIdle,
                }}
              />
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

/* ── Styles : toutes les cotes viennent de `FICHE` ─────────────────────────── */

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
  },
  headerRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FICHE.headerTitle },

  photo: { height: FICHE.imageHeight },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', start: 0, end: 0, bottom: FICHE.photoDotsBottom, flexDirection: 'row', justifyContent: 'center' },
  dotSlot: { width: FICHE.dotPitch, alignItems: 'center', justifyContent: 'center' },

  identity: { paddingHorizontal: FICHE.gutter, paddingTop: FICHE.nameTop },
  identityTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  nameBox: { flexShrink: 1, borderBottomWidth: FICHE.underlineWidth, paddingBottom: FICHE.underlineGap, marginEnd: 12 },
  name: { fontSize: FICHE.nameSize, lineHeight: FICHE.nameSize + 4 },
  price: { fontSize: FICHE.priceSize, lineHeight: FICHE.nameSize + 4, marginStart: 8 },
  description: { fontSize: FICHE.descriptionSize, lineHeight: FICHE.descriptionLine, marginTop: FICHE.descriptionGap },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: FICHE.rowHeight,
    paddingStart: FICHE.rowIconStart,
    paddingEnd: FICHE.chevronEnd,
  },
  rowText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: FICHE.colorValueGap },
  rowLabel: { fontSize: FICHE.rowLabel },
  rowValue: { flexShrink: 1, fontSize: FICHE.rowLabel },

  tiles: { flexDirection: 'row', gap: FICHE.tileGap, paddingStart: FICHE.gutter, paddingTop: FICHE.tileTop },
  tile: { width: FICHE.tileWidth },
  tileImage: { width: FICHE.tileWidth, height: FICHE.tileHeight },
  tilePlain: { width: FICHE.tileWidth, height: FICHE.tileHeight, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tilePlainText: { fontSize: FICHE.tileLabel, textAlign: 'center' },
  tileRule: { height: FICHE.tileRule, marginTop: FICHE.tileRuleGap },
  tileLabel: { fontSize: FICHE.tileLabel, marginTop: FICHE.tileLabelGap },

  sectionBody: { paddingStart: FICHE.rowLabelStart, paddingEnd: FICHE.gutter, paddingBottom: 16, gap: 8 },
  hairline: { height: StyleSheet.hairlineWidth },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingStart: FICHE.rowIconStart,
    paddingEnd: FICHE.gutter,
    paddingTop: FICHE.infoTop,
  },
  infoTitle: { fontSize: FICHE.infoTitle, lineHeight: FICHE.infoLine },
  infoLine: { fontSize: FICHE.infoBody, lineHeight: FICHE.infoLine },

  band: { height: FICHE.band },

  buyBar: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
  },
  buyRow: {
    height: FICHE.barHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: FICHE.gutter,
    paddingEnd: 8,
  },
  buyError: { paddingStart: FICHE.gutter, paddingEnd: FICHE.gutter, paddingTop: 4 },
  buyPrice: { width: FICHE.barPriceWidth, justifyContent: 'center' },
  buyPriceText: { fontSize: FICHE.barPrice },
  buyButtonBox: { width: FICHE.barButtonWidth, height: FICHE.barButtonHeight, justifyContent: 'center' },

  sheetRoot: { flex: 1 },
  sheetScrim: { backgroundColor: veil(0.35) },
  sheet: { flex: 1 },
  sheetGrab: { alignSelf: 'center', width: FICHE.grabWidth, height: FICHE.grabHeight, borderRadius: FICHE.grabHeight / 2, marginTop: FICHE.grabTop },
  sheetTitle: { fontSize: FICHE.sheetTitle, paddingHorizontal: FICHE.gutter, marginTop: FICHE.sheetTitleTop },
  sheetPanel: {
    marginHorizontal: FICHE.panelGutter,
    marginTop: FICHE.panelTop,
    height: FICHE.panelHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingStart: FICHE.panelIconStart,
    paddingEnd: FICHE.panelGutter,
  },
  sheetPanelText: { flex: 1, fontSize: FICHE.panelText, lineHeight: FICHE.panelLine },
  sheetColumns: { flexDirection: 'row', paddingStart: FICHE.rowStateEnd, paddingTop: FICHE.columnsTop },
  sheetColumn: { fontSize: FICHE.columnHeader, letterSpacing: 1 },
  sheetRows: { paddingTop: FICHE.rowsTop },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: FICHE.sizeRowHeight,
    paddingStart: FICHE.rowStateEnd,
    paddingEnd: FICHE.rowStateEnd,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetRowValue: { fontSize: FICHE.rowSize },
  sheetRowState: { fontSize: FICHE.rowState },
  sheetEmpty: { fontSize: FICHE.panelText, paddingHorizontal: FICHE.gutter, marginTop: FICHE.panelTop },

  viewer: { flex: 1 },
  viewerClose: { position: 'absolute', top: FICHE.viewerCloseTop, start: FICHE.viewerCloseStart, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  viewerStage: { flex: 1, marginTop: FICHE.viewerTop },
  viewerDotsSpacer: { height: FICHE.viewerStageBottom },
  viewerDots: { flexDirection: 'row', justifyContent: 'center' },
  viewerDotSlot: { width: FICHE.viewerDotPitch, alignItems: 'center' },
});
