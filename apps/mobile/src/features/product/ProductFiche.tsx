/**
 * GRANDE FICHE — pièces d'interface (24/10/2026).
 *
 * Planche : `docs/design/bigcard/mockup-sticky-24-10.png` + `mockup-gallery-24-10.png`.
 * Règles pures (seuil d'en-tête, galerie, sections) : `./fiche.ts`.
 *
 * Ce que ces pièces NE font PAS, volontairement :
 *  • aucun prix calculé ici — la fiche affiche `finalPrice` du serveur ;
 *  • aucune section vide, aucun « — » : une donnée absente disparaît ;
 *  • aucun bouton qui ne peut pas aboutir (le CTA est désactivé tant que le
 *    choix de taille n'est pas complet).
 *
 * Décisions du propriétaire appliquées : photo **430** fixe, feuille qui monte
 * par-dessus, en-tête transparent → plein, **CTA noir**, feuille de taille au
 * lieu de puces qui poussent la page.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
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
import { frost, veil } from '@/design/tokens.mobile';
import { FICHE, type GalleryItem, type SizeChoice } from './fiche';

/* ── 1. En-tête : transparent sur la photo, plein dès que la feuille le touche ── */

export function FicheHeader({
  title, onBack, scrollY, topInset, trailing,
}: {
  title: string;
  onBack: () => void;
  /** Position de défilement : l'en-tête s'opacifie sans re-render de la page. */
  scrollY: Animated.Value;
  topInset: number;
  trailing?: ReactNode;
}) {
  const theme = useTheme();
  const t = useT();
  const isRTL = theme.isRTL;

  // Le fond monte en opacité sur les 40 px qui précèdent le seuil : pas de saut.
  const solid = scrollY.interpolate({
    inputRange: [FICHE.imageHeight - FICHE.headerHeight - FICHE.overlap - 40, FICHE.imageHeight - FICHE.headerHeight - FICHE.overlap],
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={onBack}
        hitSlop={8}
        style={styles.headerButton}
      >
        <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={26} color={theme.colors.ink} accessibilityElementsHidden />
      </Pressable>

      <Animated.Text
        numberOfLines={1}
        style={[styles.headerTitle, { color: theme.colors.ink, opacity: solid }]}
      >
        {title}
      </Animated.Text>

      {trailing ?? <View style={styles.headerButton} />}
    </View>
  );
}

/* ── 2. Photo FIXE (elle ne défile pas : c'est la feuille qui monte) ────────── */

export function FicheMedia({
  items, onOpen, topInset,
}: {
  items: GalleryItem[];
  onOpen: (index: number) => void;
  topInset: number;
}) {
  const theme = useTheme();
  const t = useT();
  const first = items[0];
  const count = items.length;

  return (
    <View style={[styles.media, { height: FICHE.imageHeight + topInset, backgroundColor: theme.colors.surface }]}>
      {first ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('product.openGallery')}
          onPress={() => onOpen(0)}
          style={StyleSheet.absoluteFill}
        >
          <AppImage
            uri={mediaUrl(first.url)}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel={t('product.photo', { index: '1', total: String(count) })}
            decorative
          />
        </Pressable>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.mediaEmpty]}>
          <AppText variant="caption" color={theme.colors.muted}>{t('catalog.noImage')}</AppText>
        </View>
      )}

      {count > 1 ? (
        <View pointerEvents="none" style={styles.dots}>
          {items.map((item, index) => (
            <View
              key={`${item.url}-${index}`}
              style={[styles.dot, { backgroundColor: index === 0 ? theme.colors.onMedia : frost(0.45) }]}
            />
          ))}
        </View>
      ) : null}

      {count > 1 ? (
        <View pointerEvents="none" style={[styles.counter, { backgroundColor: theme.colors.mediaScrim }]}>
          <AppText variant="caption" color={theme.colors.onMedia}>{`1/${count}`}</AppText>
        </View>
      ) : null}
    </View>
  );
}

/* ── 3. Visionneuse plein écran : photos puis vidéo, même geste ─────────────── */

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
  const { width, height } = useWindowDimensions();
  const [current, setCurrent] = useState(index ?? 0);

  useEffect(() => { if (index !== null) setCurrent(index); }, [index]);

  return (
    <Modal visible={index !== null} animationType="fade" transparent={false} onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.viewer, { backgroundColor: theme.colors.scrim }]}>
        <FlatList
          data={items}
          keyExtractor={(item) => item.url}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index ?? 0}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(event) => setCurrent(Math.round(event.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <View style={{ width, height }}>
              {item.kind === 'video' ? (
                <VideoPage url={item.url} />
              ) : (
                <AppImage uri={mediaUrl(item.url)} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={t('product.photo', { index: String(items.indexOf(item) + 1), total: String(items.length) })} decorative={false} />
              )}
            </View>
          )}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          hitSlop={8}
          style={[styles.viewerClose, { top: insets.top + 8 }]}
        >
          <Ionicons name="close" size={26} color={theme.colors.onMedia} accessibilityElementsHidden />
        </Pressable>

        <View pointerEvents="none" style={[styles.viewerCounter, { bottom: insets.bottom + 16 }]}>
          <AppText variant="caption" color={theme.colors.onMedia}>{`${current + 1}/${items.length}`}</AppText>
        </View>
      </View>
    </Modal>
  );
}

/* ── 4. Feuille « choisir la taille » ──────────────────────────────────────── */

export function SizeSheet({
  visible, onClose, choices, selected, onSelect, colorChoices, color, onColor,
}: {
  visible: boolean;
  onClose: () => void;
  choices: SizeChoice[];
  selected: string;
  onSelect: (value: string) => void;
  colorChoices: SizeChoice[];
  color: string;
  onColor: (value: string) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const grid = (values: SizeChoice[], current: string, onPick: (value: string) => void) => (
    <View style={styles.sizeGrid}>
      {values.map((choice) => {
        const active = current === choice.value;
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: !choice.available }}
            accessibilityLabel={choice.available ? choice.value : `${choice.value} — ${t('catalog.variant.unavailable')}`}
            disabled={!choice.available}
            onPress={() => onPick(choice.value)}
            style={[
              styles.sizeCell,
              {
                borderColor: active ? theme.colors.ink : theme.colors.line,
                backgroundColor: active ? theme.colors.accentSoft : theme.colors.canvas,
                opacity: choice.available ? 1 : 0.4,
              },
            ]}
          >
            <AppText variant="body" weight={active ? 'bold' : 'regular'}>{choice.value}</AppText>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }]} />
      <View style={[styles.sheet, { backgroundColor: theme.colors.canvas, paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.sheetGrab, { backgroundColor: theme.colors.line }]} />
        <AppText variant="title" weight="bold">{t('product.sizeSheetTitle')}</AppText>
        <AppText variant="caption" color={theme.colors.muted}>{t('catalog.size')}</AppText>
        {choices.length > 0 ? grid(choices, selected, (value) => { onSelect(value); onClose(); }) : (
          <AppText variant="caption" color={theme.colors.muted}>{t('product.sizeSheetEmpty')}</AppText>
        )}
        {colorChoices.length > 1 ? (
          <>
            <AppText variant="label" weight="bold" style={styles.sheetLabel}>{t('catalog.color')}</AppText>
            {grid(colorChoices, color, (value) => { onColor(value); })}
          </>
        ) : null}
        <AppText variant="caption" color={theme.colors.muted} style={styles.sheetNote}>{t('product.sizeSheetNote')}</AppText>
      </View>
    </Modal>
  );
}

/* ── 5. Section pliable (accordéon) ────────────────────────────────────────── */

export function Accordion({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={[styles.accordion, { borderBottomColor: theme.colors.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        onPress={() => setOpen((value) => !value)}
        style={styles.accordionHead}
      >
        <AppText variant="label" weight="bold">{title}</AppText>
        <Ionicons name={open ? 'remove' : 'add'} size={20} color={theme.colors.ink} accessibilityElementsHidden />
      </Pressable>
      {open ? <View style={styles.accordionBody}>{children}</View> : null}
    </View>
  );
}

/* ── 6. Barre d'achat FIXE (CTA noir, décision du 24/10) ───────────────────── */

export function BuyBar({
  price, label, disabled, busy, onPress, testID,
}: {
  price: string;
  label: string;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.buyBar,
        {
          paddingBottom: insets.bottom + 10,
          backgroundColor: theme.colors.canvas,
          borderTopColor: theme.colors.line,
        },
      ]}
    >
      <View style={styles.buyPrice}>
        <AppText variant="caption" color={theme.colors.muted}>{price}</AppText>
      </View>
      <Button
        label={label}
        tone="solid"
        onPress={onPress}
        busy={busy}
        disabled={disabled}
        testID={testID}
        style={styles.buyButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700' },

  media: { position: 'absolute', top: 0, start: 0, end: 0, justifyContent: 'flex-end' },
  mediaEmpty: { alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', bottom: 24, start: 0, end: 0, flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { width: FICHE.dot, height: FICHE.dot, borderRadius: FICHE.dot / 2 },
  counter: { position: 'absolute', top: 60, end: 14, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },

  viewer: { flex: 1 },
  viewerClose: { position: 'absolute', start: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  viewerCounter: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: veil(0.45) },

  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 10, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10 },
  sheetGrab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  sheetLabel: { marginTop: 8 },
  sheetNote: { marginTop: 6 },
  sizeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeCell: { minWidth: 56, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },

  accordion: { borderBottomWidth: StyleSheet.hairlineWidth },
  accordionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  accordionBody: { paddingBottom: 16, gap: 8 },

  buyBar: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  buyPrice: { minWidth: 84 },
  buyButton: { flex: 1 },
});
