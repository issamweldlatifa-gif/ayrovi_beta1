/**
 * Briques d'interface minimales du shell. Pas de bibliothèque : chaque élément
 * ici est utilisé par au moins un écran, rien n'est ajouté « au cas où ».
 */
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, Modal, Pressable, StyleSheet, Switch,
  Text, TextInput, View, useWindowDimensions,
  type StyleProp, type TextInputProps, type TextProps, type TextStyle as RNTextStyle,
  type LayoutChangeEvent, type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, webDirection, type FontWeightName, type TextRole } from './theme';
import { actionDirectionFor, responsiveMetricsFor, rowDirectionFor } from './layoutLogic';
import { useT } from '@/i18n';

/* ── Texte ─────────────────────────────────────────────────────────────────── */

export interface AppTextProps {
  children: ReactNode;
  variant?: TextRole;
  weight?: FontWeightName;
  color?: string;
  align?: 'auto' | 'center';
  numberOfLines?: number;
  style?: StyleProp<RNTextStyle>;
  /** Rôle lu par les lecteurs d'écran — `alert` pour un message d'échec. */
  accessibilityRole?: TextProps['accessibilityRole'];
}

export function AppText({
  children, variant = 'body', weight, color, align = 'auto', numberOfLines, style, accessibilityRole,
}: AppTextProps) {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole={accessibilityRole}
      numberOfLines={numberOfLines}
      style={[
        theme.text(variant, weight),
        { color: color ?? theme.colors.ink },
        theme.isRTL ? { textAlign: 'right' } : null,
        align === 'center' ? { textAlign: 'center' } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ── Carte ─────────────────────────────────────────────────────────────────── */

export function Card({ children, title, hint, onLayout }: {
  children?: ReactNode;
  title?: string;
  hint?: string;
  /**
   * قياس موضع البطاقة — يحتاجو مسلك الطلب باش يعرف **وين** العميل داخل
   * الاستمارة (المؤشّر يقرا التمرير، موش عدّاد). توسيع البطاقة أفضل من
   * تغليفها بـ`View` زايد: التخطيط يبقى كما هو.
   */
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const theme = useTheme();
  return (
    <View
      onLayout={onLayout}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.card,
          padding: theme.space[3],
          borderColor: theme.colors.line,
        },
      ]}
    >
      {title ? <AppText variant="label" weight="bold">{title}</AppText> : null}
      {hint ? (
        <AppText variant="caption" color={theme.colors.muted} style={styles.cardHint}>{hint}</AppText>
      ) : null}
      {children}
    </View>
  );
}

/* ── En-tête de section (§18.2-3) ─────────────────────────────────────────── */

/**
 * §18.2-3 : « chaque section commence par un `SectionHeader` — pas de titre
 * libre ». Avant ce composant, chaque écran fabriquait le sien : une taille,
 * une graisse et une marge différentes à chaque fois.
 *
 * Le niveau typographique est FIGÉ dans le composant : `title` (label, gras)
 * au-dessus, `hint` (caption) en dessous. Un appelant ne choisit pas la
 * hiérarchie, sinon ce n'est plus un système.
 *
 * `action` reste optionnel et cadré à droite (miroir en RTL par `row-reverse`)
 * : c'est le seul ornement autorisé — « voir tout », pas un bouton quelconque.
 */
export function SectionHeader({
  title,
  hint,
  action,
  style,
}: {
  title: string;
  /** Phrase d'intention sous le titre. */
  hint?: string;
  /** Lien « voir tout » — seul ornement autorisé. */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          gap: theme.space[1],
          paddingBottom: theme.space[1],
          // RTL : l'action passe à gauche, le texte à droite.
          flexDirection: theme.isRTL ? 'row-reverse' : 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        },
        style,
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" weight="bold" color={theme.colors.ink}>
          {title}
        </AppText>
        {hint ? (
          <AppText variant="caption" color={theme.colors.muted}>
            {hint}
          </AppText>
        ) : null}
      </View>
      {action ?? null}
    </View>
  );
}

/* ── Ligne clé / valeur (diagnostic) ───────────────────────────────────────── */

export function KeyValue({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.kv,
        {
          borderTopColor: theme.colors.line,
          // En arabe, le libellé part à droite et la valeur à gauche.
          flexDirection: rowDirectionFor(theme.isRTL),
        },
      ]}
    >
      <AppText variant="caption" color={theme.colors.muted}>{label}</AppText>
      <AppText
        variant="caption"
        weight="bold"
        style={[styles.kvValue, { textAlign: theme.isRTL ? 'left' : 'right' }]}
      >
        {value}
      </AppText>
    </View>
  );
}

/* ── Sélecteur segmenté ───────────────────────────────────────────────────── */

export interface SegmentedOption<T extends string> { value: T; label: string }

export function Segmented<T extends string>({
  options, value, onChange, label,
}: { options: SegmentedOption<T>[]; value: T; onChange: (next: T) => void; label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.segmentedBlock}>
      {label ? <AppText variant="caption" color={theme.colors.muted}>{label}</AppText> : null}
      <View style={[styles.segmented, { borderColor: theme.colors.lineControl, borderRadius: theme.radius.control }]}>
        {options.map((option, index) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(option.value)}
              style={[
                styles.segment,
                {
                  minHeight: theme.geometry.minTarget,
                  backgroundColor: active ? theme.colors.action : 'transparent',
                  // Le séparateur suit le côté de la lecture, pas la gauche.
                  [theme.isRTL ? 'borderRightWidth' : 'borderLeftWidth']:
                    index === 0 ? 0 : StyleSheet.hairlineWidth,
                  [theme.isRTL ? 'borderRightColor' : 'borderLeftColor']: theme.colors.lineControl,
                },
              ]}
            >
              <AppText
                variant="label"
                weight={active ? 'bold' : 'regular'}
                color={active ? theme.colors.onAction : theme.colors.ink}
                align="center"
              >
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ── Boutons ───────────────────────────────────────────────────────────────── */

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /** Pictogramme posé avant le libellé (ex. logo Google). */
  leading?: ReactNode;
  /** `busy` = action en cours : le bouton le DIT au lieu de rester muet. */
  busy?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'quiet';
  /**
   * Pleine largeur du conteneur (Q8). Sans cette option, un bouton ne se
   * dimensionnait qu'à son texte : deux boutons côte à côte sortaient avec
   * deux largeurs différentes, et un écran entier gardait un bouton rétréci au
   * milieu. C'est exactement le défaut de « centrage et de gabarit » signalé.
   */
  block?: boolean;
  /** Laisse le parent décider (ex. `flex: 1` dans une rangée). */
  style?: StyleProp<ViewStyle>;
  /** Contexte lu par le lecteur d'écran (ex. « passer à la caisse »). */
  accessibilityHint?: string;
  testID?: string;
}

/** Épaisseur du contour des boutons « quiet » (référence : contour net, pas un filet). */
export const BUTTON_OUTLINE_WIDTH = 2;

export function Button({ label, onPress, busy = false, disabled = false, tone = 'primary', block = false, style, accessibilityHint, testID, leading }: ButtonProps) {
  const theme = useTheme();
  const blocked = busy || disabled;
  const quiet = tone === 'quiet';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        block ? { alignSelf: 'stretch' } : null,
        style,
        {
          minHeight: theme.geometry.controlHeight,
          // Système de boutons : pastille (CTA), contour encre épais en mode « quiet ».
          borderRadius: theme.radius.cta,
          borderWidth: quiet ? BUTTON_OUTLINE_WIDTH : StyleSheet.hairlineWidth,
          backgroundColor: quiet ? 'transparent' : theme.colors.action,
          borderColor: quiet ? theme.colors.ink : theme.colors.action,
          opacity: blocked ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {leading ? (
        // Pictogramme (ex. logo Google) posé avant le libellé, dans le sens de lecture.
        <View style={[styles.leadingRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          {leading}
          <AppText variant="label" weight="bold" color={quiet ? theme.colors.ink : theme.colors.onAction}>
            {label}
          </AppText>
        </View>
      ) : (
        <AppText variant="label" weight="bold" color={quiet ? theme.colors.ink : theme.colors.onAction}>
          {label}
        </AppText>
      )}
      {/* Attente visible DANS le bouton, côté fin de ligne (comme les grands services) : le libellé reste centré. */}
      {busy ? (
        <View
          pointerEvents="none"
          style={[styles.busyIndicator, theme.isRTL ? { left: 16 } : { right: 16 }]}
        >
          <ActivityIndicator
            testID={testID ? `${testID}-busy` : undefined}
            size="small"
            color={quiet ? theme.colors.ink : theme.colors.onAction}
            importantForAccessibility="no"
            accessibilityElementsHidden
          />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Groupe d’actions qui ne laisse pas les libellés localisés déborder : rangée
 * de même largeur en espace confortable, pile pleine largeur sur mobile.
 */
export function ResponsiveActionGroup({ children, style, testID }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const direction = actionDirectionFor(responsiveMetricsFor(width).breakpoint, theme.isRTL);

  return (
    <View
      testID={testID}
      style={[styles.actionGroup, { flexDirection: direction, gap: theme.space[1] }, style]}
    >
      {Children.map(children, (child) => child == null ? null : (
        <View style={direction === 'row' ? styles.actionItemRow : styles.actionItem}>
          {child}
        </View>
      ))}
    </View>
  );
}

/* ── Ligne de réglage et ligne de navigation ───────────────────────────────── */

export interface LinkRowProps {
  label: string;
  /** Détail court à droite du libellé (compteur, statut). */
  value?: string;
  onPress: () => void;
  /** Nom d'icône Ionicons. */
  icon?: string;
  /** `danger` pour une action destructrice (supprimer un favori, une adresse). */
  tone?: 'default' | 'danger';
}

/** Ligne cliquable d'un menu : icône, libellé, valeur éventuelle, chevron. */
export function LinkRow({ label, value, onPress, icon, tone = 'default', testID }: LinkRowProps & { testID?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.linkRow,
        {
          flexDirection: rowDirectionFor(theme.isRTL),
          minHeight: theme.geometry.minTarget,
          borderTopColor: theme.colors.line,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon as keyof typeof Ionicons.glyphMap}
          size={20}
          color={tone === 'danger' ? theme.status.danger.fg : theme.colors.ink}
          accessibilityElementsHidden
        />
      ) : null}
      <AppText variant="body" color={tone === 'danger' ? theme.status.danger.fg : undefined} style={styles.linkLabel}>
        {label}
      </AppText>
      {value ? <AppText variant="caption" color={theme.colors.muted}>{value}</AppText> : null}
      <Ionicons
        name={theme.isRTL ? 'chevron-back' : 'chevron-forward'}
        size={18}
        color={theme.colors.muted}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

export function ToggleRow({ label, value, onChange, disabled = false }: {
  label: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.linkRow, { flexDirection: rowDirectionFor(theme.isRTL), borderTopColor: theme.colors.line, minHeight: theme.geometry.minTarget }]}>
      <AppText variant="body" style={styles.linkLabel}>{label}</AppText>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityLabel={label}
        trackColor={{ false: theme.colors.lineControl, true: theme.colors.accent }}
        thumbColor={theme.colors.surface}
      />
    </View>
  );
}

/* ── Champ de saisie (liens marchands, phase P3) ───────────────────────────── */

export function Field(props: TextInputProps & { label?: string }) {
  const theme = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={styles.segmentedBlock}>
      {label ? <AppText variant="caption" color={theme.colors.muted}>{label}</AppText> : null}
      <TextInput
        placeholderTextColor={theme.colors.muted}
        {...rest}
        style={[
          theme.text('body'),
          {
            color: theme.colors.ink,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.lineControl,
            borderRadius: theme.radius.control,
            borderWidth: StyleSheet.hairlineWidth,
            minHeight: theme.geometry.controlHeight,
            paddingHorizontal: theme.space[3],
            ...webDirection(theme.isRTL),
          },
          style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  leadingRow: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  busyIndicator: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  drawerScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  drawerPanel: {
    position: 'absolute', top: 0, bottom: 0,
    paddingHorizontal: 16, gap: 4,
    borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth,
  },
  drawerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  linkLabel: { flex: 1 },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  actionGroup: { alignItems: 'stretch' },
  actionItem: { alignItems: 'stretch' },
  actionItemRow: { flex: 1, minWidth: 0, alignItems: 'stretch' },
  card: { gap: 8, borderWidth: StyleSheet.hairlineWidth },
  cardHint: { marginBottom: 2 },
  kv: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    gap: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth,
  },
  kvValue: { flexShrink: 1 },
  segmentedBlock: { gap: 6 },
  segmented: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
});

/* ── Tiroir latéral (menu) ─────────────────────────────────────────────────── */

/**
 * Un tiroir — pas une bibliothèque, pas un « au cas où » : SONIM en a besoin
 * pour son menu (nouvelle discussion · historique · ma commande · AYROVIX ·
 * réglages), et aucun écran n'avait encore de menu latéral.
 *
 * Choix délibéré : `Animated` de React Native, PAS Reanimated. Reanimated
 * exige un greffon Babel que ce projet n'a pas (pas de `babel.config.js`) ;
 * l'ajouter pour une seule animation serait une dépendance de plus et une
 * source de panne à la construction. `Animated` est déjà là, tourne sur le
 * thread natif, et respecte `theme.motion.reduced`.
 *
 * Le tiroir sort du bord de DÉPART (`start`), pas de la gauche : en arabe,
 * l'interface se lit de droite à gauche, et un menu qui sort de la gauche
 * arrive « de derrière » la lecture.
 */
export interface DrawerProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Bord d'où sort le tiroir. */
  side?: 'start' | 'end';
}

export function Drawer({ visible, onClose, children, side = 'start' }: DrawerProps) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const reduced = theme.motion.reduced === 0;
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduced ? 0 : theme.motion.standard,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Démontage APRÈS la sortie : couper le Modal trop tôt tronque l'animation.
      if (finished && !visible) setMounted(false);
    });
  }, [progress, reduced, theme.motion.standard, visible]);

  const width = Math.min(320, Dimensions.get('window').width * 0.82);
  const fromStart = (side === 'start') === theme.isRTL ? 'right' : 'left';
  const offset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [fromStart === 'left' ? -width : width, 0],
  });

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[styles.drawerScrim, { opacity: progress }]}
          accessibilityElementsHidden
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.drawerPanel,
            {
              width,
              backgroundColor: theme.colors.canvas,
              borderLeftColor: theme.colors.line,
              borderRightColor: theme.colors.line,
              paddingTop: insets.top + theme.space[3],
              paddingBottom: insets.bottom + theme.space[3],
              [fromStart === 'left' ? 'left' : 'right']: 0,
              transform: [{ translateX: offset }],
            },
          ]}
          accessibilityViewIsModal
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Une entrée de tiroir : cible tactile pleine, état désactivé EXPLIQUÉ. */
export function DrawerItem({
  icon, label, hint, onPress, active = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
  active?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.drawerItem,
        {
          flexDirection: rowDirectionFor(theme.isRTL),
          minHeight: theme.geometry.minTarget,
          backgroundColor: active ? theme.colors.surface : 'transparent',
          borderRadius: theme.radius.control,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={22}
        color={active ? theme.colors.accent : theme.colors.ink}
        accessibilityElementsHidden
      />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" weight={active ? 'bold' : 'regular'} color={theme.colors.ink}>{label}</AppText>
        {hint ? <AppText variant="caption" color={theme.colors.muted}>{hint}</AppText> : null}
      </View>
      <Ionicons
        name={theme.isRTL ? 'chevron-back' : 'chevron-forward'}
        size={18}
        color={theme.colors.muted}
        accessibilityElementsHidden
      />
    </Pressable>
  );
}
