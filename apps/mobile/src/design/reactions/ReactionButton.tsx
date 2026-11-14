/**
 * Z-Reactions — LE bouton d'interaction officiel (11/11/2026).
 *
 * Remplace les trois boutons séparés du rail Reels (pouce haut, cœur, pouce
 * bas), le sélecteur à deux choix des publications et le cœur des stories :
 *
 *  • toucher      → J'aime / retirer la réaction posée ;
 *  • appui long   → sélecteur flottant J'aime · J'adore · Je n'aime pas, qui
 *                   s'ouvre d'un ressort court (stagger 40 ms), dans un Modal
 *                   transparent (jamais rogné par une carte `overflow: hidden`) ;
 *  • effets       → J'aime : bascule −28° + trois éclats (référence 10/11) ;
 *                   J'adore : cœur ROUGE qui se tasse puis bondit + petits cœurs ;
 *                   Je n'aime pas : bascule +28° qui oscille.
 *
 * Deux présentations, une seule famille : `rail` (colonne posée sur la vidéo,
 * compteur sous l'icône) et `inline` (rangée d'actions, compteur à côté).
 * Toutes les animations passent par le driver natif et s'éteignent quand le
 * système demande moins de mouvement.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { useReduceMotion } from '@/design/motion';
import { MEDIA_GLYPH_SHADOW, RADIUS, elevation, veil } from '@/design/tokens.mobile';
import { LikeSparks, ReelGlyph } from '@/features/reels/ReelIcons';
import {
  REACTION_LONG_PRESS_MS,
  REACTION_ORDER,
  reactionGlyph,
  reactionLabelKey,
  type ContentReaction,
} from './reactionModel';

export interface ReactionButtonProps {
  reaction: ContentReaction | null;
  /** Compteur affiché (J'aime + J'adore). `null` = pas de compteur. */
  count: string | null;
  onTap: () => void;
  onPick: (choice: ContentReaction) => void;
  /** Désactivé (rare) : grisé, aucun geste. */
  disabled?: boolean;
  /**
   * Visiteur : le bouton reste VISIBLE et actif, mais l'appui long ne montre pas
   * le sélecteur — il appelle `onTap`, qui ouvre la connexion chez l'appelant.
   */
  guest?: boolean;
  variant: 'rail' | 'inline';
  /** Encre de l'état neutre (blanc sur média, encre sur carte). */
  ink: string;
  /** Le sélecteur se pose sur un média sombre (voile) ou sur une carte claire. */
  surface?: 'media' | 'card';
  size?: number;
  testID?: string;
  /** Mise en page de l'hôte (alignement de la rangée) — jamais la géométrie de la cible. */
  style?: StyleProp<ViewStyle>;
  /** Incrémenté par l'hôte (barre d'outils, menu) pour ouvrir le sélecteur sans appui long. */
  openRequest?: number;
  /** Compteur lu à voix haute (valeur brute) quand l'affichage est compact. */
  accessibilityCount?: string;
  /**
   * Barre Publication (14/11) : le texte à côté du glyphe est un LIBELLÉ
   * (« J'aime ») qui prend la couleur de la réaction posée, comme Facebook.
   */
  tintLabel?: boolean;
  /** Compteur en graisse forte, à l'encre (barre Publication redessinée, 14/11). */
  strongCount?: boolean;
}

const TILT_DEG = 28;
const HEART_SETTLE_MS = 200;
const MINI_HEARTS = [
  { x: -10, y: -19, size: 10, rotate: '-14deg' },
  { x: 0, y: -13, size: 6, rotate: '0deg' },
  { x: 10, y: -22, size: 12, rotate: '14deg' },
] as const;
/** Une case du sélecteur : glyphe 28 + libellé « Je n’aime pas » lisible sur une ligne. */
const PICKER_ITEM_WIDTH = 76;
const PICKER_ITEM_HEIGHT = 60;
const PICKER_PAD = 6;
const PICKER_WIDTH = PICKER_ITEM_WIDTH * REACTION_ORDER.length + PICKER_PAD * 2;
const PICKER_HEIGHT = PICKER_ITEM_HEIGHT + PICKER_PAD * 2;
const EDGE = 8;

export function reactionColor(reaction: ContentReaction | null, colors: { reactionLike: string; reactionLove: string; reactionDislike: string }, ink: string): string {
  if (reaction === 'like') return colors.reactionLike;
  if (reaction === 'love') return colors.reactionLove;
  if (reaction === 'dislike') return colors.reactionDislike;
  return ink;
}

/** Glyphe animé (bascule, bond, éclats, petits cœurs) — réutilisé par le bouton. */
function ReactionGlyph({ reaction, ink, size, media = false }: { reaction: ContentReaction | null; ink: string; size: number; media?: boolean }) {
  const theme = useTheme();
  const reduce = useReduceMotion();
  const tilt = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const sparks = useRef(new Animated.Value(reaction === 'like' ? 1 : 0)).current;
  const minis = useRef(new Animated.Value(0)).current;
  const miniFade = useRef(new Animated.Value(0)).current;
  const previous = useRef(reaction);

  useEffect(() => {
    const before = previous.current;
    previous.current = reaction;
    if (before === reaction) return;
    [tilt, scale, sparks, minis, miniFade].forEach((value) => value.stopAnimation());
    tilt.setValue(0);
    scale.setValue(1);
    miniFade.setValue(0);
    sparks.setValue(reaction === 'like' && reduce ? 1 : 0);
    if (reduce || reaction === null) return;
    if (reaction === 'like') {
      tilt.setValue(-TILT_DEG);
      Animated.parallel([
        Animated.spring(tilt, { toValue: 0, friction: 5, tension: 160, useNativeDriver: true }),
        Animated.timing(sparks, { toValue: 1, duration: 160, delay: 110, useNativeDriver: true }),
      ]).start();
    } else if (reaction === 'dislike') {
      tilt.setValue(TILT_DEG);
      Animated.spring(tilt, { toValue: 0, friction: 3.5, tension: 120, useNativeDriver: true }).start();
    } else {
      scale.setValue(0.82);
      minis.setValue(0);
      miniFade.setValue(1);
      Animated.parallel([
        Animated.sequence([
          Animated.delay(HEART_SETTLE_MS),
          Animated.spring(scale, { toValue: 1, friction: 3.2, tension: 220, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(HEART_SETTLE_MS + 20),
          Animated.timing(minis, { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.delay(420),
          Animated.timing(miniFade, { toValue: 0, duration: 320, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [reaction, reduce, tilt, scale, sparks, minis, miniFade]);
  useEffect(
    () => () => [tilt, scale, sparks, minis, miniFade].forEach((value) => value.stopAnimation()),
    [tilt, scale, sparks, minis, miniFade],
  );

  const color = reactionColor(reaction, theme.colors, ink);
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [
            { rotate: tilt.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] }) },
            { scale },
          ],
        }}
      >
        {/* Sur vidéo (option A, 14/11) : pouce blanc PLEIN au repos, ombre douce.
            Sur carte : contour au repos, plein coloré une fois posé.
            Posé (retour du 14/11, « pas tout bleu ») : liseré BLANC + contour
            défini, comme le pouce de Facebook — jamais une tache de couleur. */}
        <ReelGlyph
          name={reactionGlyph(reaction)}
          size={size}
          color={color}
          filled={media || reaction !== null}
          shadow={media ? MEDIA_GLYPH_SHADOW : undefined}
          rim={reaction !== null ? (media ? theme.colors.onMedia : theme.colors.surface) : undefined}
        />
      </Animated.View>
      {reaction === 'like' ? (
        <Animated.View pointerEvents="none" style={[styles.sparks, { opacity: sparks, transform: [{ scale: sparks }] }]}>
          <LikeSparks size={size} color={ink} />
        </Animated.View>
      ) : null}
      {reaction === 'love'
        ? MINI_HEARTS.map((mini, index) => (
            <Animated.View
              key={index}
              pointerEvents="none"
              style={[
                styles.mini,
                {
                  top: size / 2 - mini.size / 2,
                  start: size / 2 - mini.size / 2,
                  opacity: Animated.multiply(minis, miniFade),
                  transform: [
                    { translateX: minis.interpolate({ inputRange: [0, 1], outputRange: [0, mini.x] }) },
                    { translateY: minis.interpolate({ inputRange: [0, 1], outputRange: [0, mini.y] }) },
                    { scale: minis.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                    { rotate: mini.rotate },
                  ],
                },
              ]}
            >
              <ReelGlyph name="heart" size={mini.size} color={theme.colors.reactionLove} filled />
            </Animated.View>
          ))
        : null}
    </View>
  );
}

/** Position du sélecteur : à gauche du rail (sur la vidéo) ou au-dessus du bouton (rangée). */
export function reactionPickerPosition(
  anchor: { x: number; y: number; width: number; height: number },
  variant: 'rail' | 'inline',
  screen: { width: number; height: number },
  rtl: boolean,
): { left: number; top: number } {
  const clampX = (x: number) => Math.max(EDGE, Math.min(screen.width - PICKER_WIDTH - EDGE, x));
  const clampY = (y: number) => Math.max(EDGE, Math.min(screen.height - PICKER_HEIGHT - EDGE, y));
  if (variant === 'rail') {
    const beside = rtl ? anchor.x + anchor.width + EDGE : anchor.x - PICKER_WIDTH - EDGE;
    return { left: clampX(beside), top: clampY(anchor.y + anchor.height / 2 - PICKER_HEIGHT / 2) };
  }
  const start = rtl ? anchor.x + anchor.width - PICKER_WIDTH : anchor.x;
  const above = anchor.y - PICKER_HEIGHT - EDGE;
  return { left: clampX(start), top: above >= EDGE ? above : clampY(anchor.y + anchor.height + EDGE) };
}

function ReactionPicker({ current, position, surface, onPick, onClose }: {
  current: ContentReaction | null;
  position: { left: number; top: number };
  surface: 'media' | 'card';
  onPick: (choice: ContentReaction) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const reduce = useReduceMotion();
  const enter = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const items = useRef(REACTION_ORDER.map(() => new Animated.Value(reduce ? 1 : 0))).current;
  useEffect(() => {
    if (reduce) return;
    Animated.parallel([
      Animated.spring(enter, { toValue: 1, friction: 7, tension: 260, useNativeDriver: true }),
      Animated.stagger(40, items.map((value) => Animated.spring(value, { toValue: 1, friction: 6, tension: 240, useNativeDriver: true }))),
    ]).start();
  }, [reduce, enter, items]);
  const onMedia = surface === 'media';
  const label = onMedia ? theme.colors.onMedia : theme.colors.ink;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable testID="reaction-picker-dismiss" accessibilityLabel={t('social.close')} style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View
        testID="reaction-picker"
        accessibilityRole="menu"
        accessibilityLabel={t('social.reactionPicker')}
        style={[
          styles.picker,
          onMedia ? { backgroundColor: veil(0.78) } : [{ backgroundColor: theme.colors.surface }, elevation.high],
          {
            left: position.left,
            top: position.top,
            flexDirection: theme.isRTL ? 'row-reverse' : 'row',
            opacity: enter,
            transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
          },
        ]}
      >
        {REACTION_ORDER.map((choice, index) => {
          const selected = current === choice;
          const color = reactionColor(choice, theme.colors, label);
          return (
            <Animated.View
              key={choice}
              style={{
                opacity: items[index],
                transform: [{ translateY: items[index]!.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
              }}
            >
              <Pressable
                testID={`reaction-pick-${choice}`}
                accessibilityRole="menuitem"
                accessibilityLabel={t(reactionLabelKey(choice))}
                accessibilityState={{ selected }}
                onPress={() => onPick(choice)}
                style={({ pressed }) => [
                  styles.pickerItem,
                  selected ? { backgroundColor: onMedia ? veil(0.35) : theme.colors.divider, borderColor: color, borderWidth: 1.5 } : null,
                  { transform: [{ scale: pressed ? 1.18 : 1 }] },
                ]}
              >
                <ReelGlyph name={reactionGlyph(choice)} size={28} color={color} filled />
                <AppText variant="caption" color={label} numberOfLines={1}>
                  {t(reactionLabelKey(choice))}
                </AppText>
              </Pressable>
            </Animated.View>
          );
        })}
      </Animated.View>
    </Modal>
  );
}

export function ReactionButton({
  reaction, count, onTap, onPick, disabled = false, guest = false, variant, ink, surface = variant === 'rail' ? 'media' : 'card', size, testID,
  style, openRequest = 0, accessibilityCount, tintLabel = false, strongCount = false,
}: ReactionButtonProps) {
  const theme = useTheme();
  const t = useT();
  const screen = useWindowDimensions();
  const anchor = useRef<View>(null);
  const [picker, setPicker] = useState<{ left: number; top: number } | null>(null);
  const glyphSize = size ?? theme.iconSize.md;

  const openPicker = useCallback(() => {
    if (disabled) return;
    if (guest) { onTap(); return; }
    const node = anchor.current;
    const fallback = { left: Math.max(EDGE, screen.width / 2 - PICKER_WIDTH / 2), top: screen.height / 2 - PICKER_HEIGHT / 2 };
    // Ouvert TOUT DE SUITE (le ressort part de 0.6/opacité 0, donc la mesure
    // native — une image plus tard — recale la position sans saut visible).
    setPicker(fallback);
    if (!node?.measureInWindow) return;
    node.measureInWindow((x, y, width, height) => {
      setPicker(Number.isFinite(x) && width > 0
        ? reactionPickerPosition({ x, y, width, height }, variant, screen, theme.isRTL)
        : fallback);
    });
  }, [disabled, guest, onTap, screen, variant, theme.isRTL]);
  const lastRequest = useRef(openRequest);
  useEffect(() => {
    if (openRequest === lastRequest.current) return;
    lastRequest.current = openRequest;
    openPicker();
  }, [openRequest, openPicker]);

  const label = reaction === 'like' ? t('social.liked')
    : reaction === 'love' ? t('social.loved')
    : reaction === 'dislike' ? t('social.disliked')
    : t('social.like');

  const rail = variant === 'rail';
  return (
    <>
      <Pressable
        ref={anchor}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('social.reactionHint')}
        accessibilityValue={accessibilityCount ?? count ? { text: accessibilityCount ?? count ?? '' } : undefined}
        accessibilityState={{ selected: reaction !== null, disabled }}
        accessibilityActions={[{ name: 'activate' }, { name: 'longpress', label: t('social.reactionPicker') }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'longpress') openPicker();
          else onTap();
        }}
        disabled={disabled}
        onPress={onTap}
        onLongPress={openPicker}
        delayLongPress={REACTION_LONG_PRESS_MS}
        hitSlop={4}
        style={({ pressed }) => [
          rail ? styles.rail : [styles.inline, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }],
          style,
          { opacity: disabled ? theme.opacity.disabled : pressed ? theme.opacity.subtle : 1 },
        ]}
      >
        <ReactionGlyph reaction={reaction} ink={ink} size={glyphSize} media={surface === 'media'} />
        {count ? (
          <AppText
            variant={tintLabel || strongCount ? 'captionStrong' : 'caption'}
            color={tintLabel ? reactionColor(reaction, theme.colors, ink) : ink}
            numberOfLines={1}
          >
            {count}
          </AppText>
        ) : null}
      </Pressable>
      {picker ? (
        <ReactionPicker
          current={reaction}
          position={picker}
          surface={surface}
          onClose={() => setPicker(null)}
          onPick={(choice) => {
            setPicker(null);
            onPick(choice);
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  rail: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  inline: { minWidth: 44, minHeight: 44, alignItems: 'center', gap: 4 },
  // Trois éclats du pouce vert, au-dessus de la pointe (décalée à droite).
  sparks: { position: 'absolute', top: -6, start: 12 },
  mini: { position: 'absolute' },
  picker: {
    position: 'absolute',
    padding: PICKER_PAD,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
  },
  pickerItem: {
    width: PICKER_ITEM_WIDTH,
    height: PICKER_ITEM_HEIGHT,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
