/**
 * États honnêtes d'un écran alimenté par le réseau :
 * chargement, erreur (avec réessai), HORS-LIGNE (avec réessai), vide.
 *
 * Règle du projet : on n'affiche JAMAIS un contenu inventé à la place d'une
 * donnée absente. Un écran vide dit pourquoi il est vide — et un écran sans
 * réseau le dit aussi, au lieu de montrer une « erreur serveur » générique
 * qui ferait croire à une panne alors que c'est la connexion qui manque.
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from './ui';
import { useTheme } from './theme';
import { useI18n, useT, type TranslationKey } from '@/i18n';
import { isApiError, userMessage } from '@/api/errors';

/** Vrai quand l'échec vient du RÉSEAU (pas du serveur) — `ApiError.isOffline`. */
export const isOfflineError = (error: unknown): boolean =>
  isApiError(error) && error.isOffline;

export function LoadingBlock({ labelKey }: { labelKey?: TranslationKey }) {
  const theme = useTheme();
  const t = useT();
  return (
    <View
      accessibilityRole="progressbar"
      style={[styles.block, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.card }]}
    >
      <ActivityIndicator color={theme.colors.accent} />
      {labelKey ? (
        <AppText variant="caption" color={theme.colors.muted}>{t(labelKey)}</AppText>
      ) : null}
    </View>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  // Une erreur réseau N'EST PAS une erreur serveur : elle a son propre état,
  // avec son propre libellé, au lieu d'un message générique trompeur.
  if (isOfflineError(error)) return <OfflineBlock onRetry={onRetry} />;
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

/**
 * État hors-ligne : icône, titre, explication, et un bouton réessayer.
 * Le libellé ne reprend PAS le message d'erreur générique — « pas de
 * connexion » n'est pas « le serveur a échoué ».
 */
export function OfflineBlock({ onRetry }: { onRetry?: () => void }) {
  const theme = useTheme();
  const t = useT();
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.block,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.card,
          borderColor: theme.status.warning.border,
        },
      ]}
    >
      <Ionicons
        name="cloud-offline-outline"
        size={theme.iconSize.lg}
        color={theme.status.warning.fg}
        accessibilityElementsHidden
      />
      <AppText variant="label" weight="bold" color={theme.status.warning.fg} align="center">
        {t('offline.title')}
      </AppText>
      <AppText variant="caption" color={theme.colors.muted} align="center">
        {t('offline.body')}
      </AppText>
      {onRetry ? <RetryButton onPress={onRetry} /> : null}
    </View>
  );
}

export function RetryButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.retry')}
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
        {t('common.retry')}
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
