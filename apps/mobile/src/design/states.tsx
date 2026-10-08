/**
 * États honnêtes d'un écran alimenté par le réseau :
 * chargement, erreur (avec réessai), hors-ligne, vide.
 *
 * Règle du projet : on n'affiche JAMAIS un contenu inventé à la place d'une
 * donnée absente. Un écran vide dit pourquoi il est vide.
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './ui';
import { useTheme } from './theme';
import { useI18n } from '@/i18n';
import { userMessage } from '@/api/errors';

export function LoadingBlock({ label }: { label?: { fr: string; ar: string } }) {
  const theme = useTheme();
  const { locale } = useI18n();
  return (
    <View
      accessibilityRole="progressbar"
      style={[styles.block, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card }]}
    >
      <ActivityIndicator color={theme.colors.accent} />
      {label ? (
        <AppText variant="caption" color={theme.colors.muted}>{label[locale]}</AppText>
      ) : null}
    </View>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const theme = useTheme();
  const { locale } = useI18n();
  const message = userMessage(error);
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.block,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.card,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <AppText variant="label" weight="bold" color={theme.status.danger.fg} align="center">
        {message[locale]}
      </AppText>
      {onRetry ? <RetryButton onPress={onRetry} /> : null}
    </View>
  );
}

export function RetryButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const { locale } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.retry,
        {
          minHeight: theme.geometry.minTarget,
          borderRadius: theme.radius.cta,
          backgroundColor: pressed ? theme.colors.actionHover : theme.colors.action,
          paddingHorizontal: theme.space[3],
        },
      ]}
    >
      <AppText variant="label" weight="bold" color={theme.colors.onAction}>
        {locale === 'ar' ? 'عاود المحاولة' : 'Réessayer'}
      </AppText>
    </Pressable>
  );
}

/**
 * Une section dont la donnée manque sans que l'écran entier échoue :
 * on montre la raison au lieu de disparaître silencieusement.
 */
export function EmptyBlock({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.block, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card }]}>
      <AppText variant="caption" color={theme.colors.muted} align="center">{children}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10, alignItems: 'center', justifyContent: 'center', padding: 20 },
  retry: { alignItems: 'center', justifyContent: 'center' },
});
