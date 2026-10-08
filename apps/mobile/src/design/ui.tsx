/**
 * Briques d'interface minimales du shell. Pas de bibliothèque : chaque élément
 * ici est utilisé par au moins un écran, rien n'est ajouté « au cas où ».
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated, Dimensions, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch,
  Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextProps, type TextStyle as RNTextStyle,
  type LayoutChangeEvent, type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { useTheme, webDirection, type TextRole } from './theme';
import { useChromeHidden, useChromeScroll } from './chrome';

/* ── Texte ─────────────────────────────────────────────────────────────────── */

export interface AppTextProps {
  children: ReactNode;
  variant?: TextRole;
  weight?: 'regular' | 'bold';
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

/* ── Pastille de phase ─────────────────────────────────────────────────────── */

export function PhaseBadge({ phase }: { phase: string }) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={[styles.badge, { backgroundColor: theme.colors.infoSoft, borderRadius: theme.radius.cta }]}>
      <AppText variant="caption" weight="bold" color={theme.colors.accentText}>
        {t('common.phase', { phase })}
      </AppText>
    </View>
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

/* ── Ligne clé / valeur (diagnostic) ───────────────────────────────────────── */

export function KeyValue({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.kv, { borderTopColor: theme.colors.line }]}>
      <AppText variant="caption" color={theme.colors.muted}>{label}</AppText>
      <AppText variant="caption" weight="bold" style={styles.kvValue}>{value}</AppText>
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
                  borderLeftWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderLeftColor: theme.colors.lineControl,
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
}

export function Button({ label, onPress, busy = false, disabled = false, tone = 'primary', block = false, style }: ButtonProps) {
  const theme = useTheme();
  const blocked = busy || disabled;
  const quiet = tone === 'quiet';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        block ? { alignSelf: 'stretch' } : null,
        style,
        {
          minHeight: theme.geometry.controlHeight,
          borderRadius: theme.radius.control,
          backgroundColor: quiet ? 'transparent' : theme.colors.action,
          borderColor: quiet ? theme.colors.lineControl : theme.colors.action,
          opacity: blocked ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <AppText variant="label" weight="bold" color={quiet ? theme.colors.ink : theme.colors.onAction}>
        {label}
      </AppText>
    </Pressable>
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
export function LinkRow({ label, value, onPress, icon, tone = 'default' }: LinkRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.linkRow,
        {
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
          color={tone === 'danger' ? theme.colors.danger : theme.colors.accentText}
        />
      ) : null}
      <AppText variant="body" color={tone === 'danger' ? theme.colors.danger : undefined} style={styles.linkLabel}>
        {label}
      </AppText>
      {value ? <AppText variant="caption" color={theme.colors.muted}>{value}</AppText> : null}
      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
    </Pressable>
  );
}

export function ToggleRow({ label, value, onChange, disabled = false }: {
  label: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.linkRow, { borderTopColor: theme.colors.line, minHeight: theme.geometry.minTarget }]}>
      <AppText variant="body" style={styles.linkLabel}>{label}</AppText>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
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

/* ── Écran ─────────────────────────────────────────────────────────────────── */

export interface ScreenProps {
  tab: 'home' | 'lens' | 'aywebs' | 'cart' | 'account';
  phase: string;
  children?: ReactNode;
  /** Tirer vers le bas pour rafraîchir : le geste natif attendu sur mobile. */
  onRefresh?: () => void;
  refreshing?: boolean;
}

/**
 * Un onglet = un titre, une phrase de mission, la phase qui le livre, et son
 * contenu. Aucun écran ne réinvente sa mise en page.
 */
export function Screen({ tab, phase, children, onRefresh, refreshing = false }: ScreenProps) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  // Le défilement pilote la barre d'onglets (voir `design/chrome`).
  const onChromeScroll = useChromeScroll();
  const chromeHidden = useChromeHidden();
  const title = t(`screen.${tab}.subtitle`);
  const body = t(`screen.${tab}.body`);
  const tabLabel = t(`tabs.${tab}`);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      {/**
       * En-tête HORS du défilement : avant, il vivait DANS la liste et
       * disparaissait au premier geste, pour ne jamais revenir — ce n'est pas
       * « se replier », c'est « partir ». Dehors, il peut se replier et se
       * déplier, piloté par la MÊME décision que la barre d'onglets
       * (`useChromeHidden`) : un seul état, deux gestes, jamais désaccordés.
       */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + theme.space[3],
            paddingHorizontal: theme.space[3],
          },
          // Replié : hauteur à zéro, contenu rendu à l'écran — c'est la place
          // libérée qui fait l'intérêt du geste.
          chromeHidden ? styles.headerCollapsed : null,
        ]}
        accessibilityElementsHidden={chromeHidden}
      >
        <AppText variant="caption" weight="bold" color={theme.colors.accentText}>
          {tabLabel.toUpperCase()}
        </AppText>
        <AppText variant="title" style={styles.headerTitle}>{title}</AppText>
        <AppText variant="body" color={theme.colors.secondary}>{body}</AppText>
        <View style={styles.badgeRow}>
          <PhaseBadge phase={phase} />
          <AppText variant="caption" color={theme.colors.muted}>{t('common.inThisVersion')}</AppText>
        </View>
      </View>

      <ScrollView
        style={{ backgroundColor: theme.colors.canvas }}
        onScroll={onChromeScroll}
        scrollEventThrottle={16}
        refreshControl={onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        ) : undefined}
        contentContainerStyle={[
          styles.screen,
          {
            paddingTop: theme.space[3],
            paddingBottom: insets.bottom + theme.space[5],
            paddingHorizontal: theme.space[3],
          },
        ]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  screen: { gap: 16 },
  header: { gap: 8, paddingBottom: 12, overflow: 'hidden' },
  headerCollapsed: { height: 0, paddingTop: 0, paddingBottom: 0, opacity: 0 },
  headerTitle: { marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  card: { gap: 8, borderWidth: StyleSheet.hairlineWidth },
  cardHint: { marginBottom: 2 },
  kv: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    gap: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth,
  },
  kvValue: { flexShrink: 1, textAlign: 'right' },
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
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="fermer" />
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
      onPress={onPress}
      style={({ pressed }) => [
        styles.drawerItem,
        {
          minHeight: theme.geometry.minTarget,
          backgroundColor: active ? theme.colors.surface : 'transparent',
          borderRadius: theme.radius.control,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={active ? theme.colors.accent : theme.colors.ink} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" weight={active ? 'bold' : 'regular'} color={theme.colors.ink}>{label}</AppText>
        {hint ? <AppText variant="caption" color={theme.colors.muted}>{hint}</AppText> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
    </Pressable>
  );
}
