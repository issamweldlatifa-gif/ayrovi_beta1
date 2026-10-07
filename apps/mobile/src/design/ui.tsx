/**
 * Briques d'interface minimales du shell. Pas de bibliothèque : chaque élément
 * ici est utilisé par au moins un écran, rien n'est ajouté « au cas où ».
 */
import type { ReactNode } from 'react';
import {
  Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextProps, type TextStyle as RNTextStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { useTheme, webDirection, type TextRole } from './theme';

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

export function Card({ children, title, hint }: { children?: ReactNode; title?: string; hint?: string }) {
  const theme = useTheme();
  return (
    <View
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
}

export function Button({ label, onPress, busy = false, disabled = false, tone = 'primary' }: ButtonProps) {
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
  const title = t(`screen.${tab}.subtitle`);
  const body = t(`screen.${tab}.body`);
  const tabLabel = t(`tabs.${tab}`);

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.canvas }}
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
          paddingTop: insets.top + theme.space[3],
          paddingBottom: insets.bottom + theme.space[5],
          paddingHorizontal: theme.space[3],
        },
      ]}
    >
      <View style={styles.header}>
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
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  linkLabel: { flex: 1 },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  screen: { gap: 16 },
  header: { gap: 8 },
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
