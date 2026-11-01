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
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText, Button } from './ui';
import { LoadingSpinner } from './LoadingSpinner';
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
      style={[
        styles.block,
        // 17/10/2026 — décision n° 1 : plus de bloc gris, un filet le détache.
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderRadius: theme.radius.card },
      ]}
    >
      <LoadingSpinner testID="loading-spinner" />
      {labelKey ? (
        <AppText variant="caption" color={theme.colors.muted}>{t(labelKey)}</AppText>
      ) : null}
    </View>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  /**
   * ⚠️ Règle des hooks : les deux hooks sont appelés AVANT le branchement.
   *
   * Ils étaient sous le `return` hors-ligne : une erreur qui passait de
   * « pas de réseau » à « erreur serveur » (ou l'inverse, après un « réessayer »)
   * changeait le nombre de hooks d'un rendu à l'autre → React lève, et en
   * production l'application se ferme. Voir `tests/hooks-order.test.ts`.
   */
  const theme = useTheme();
  const { locale } = useI18n();

  // Une erreur réseau N'EST PAS une erreur serveur : elle a son propre état,
  // avec son propre libellé, au lieu d'un message générique trompeur.
  if (isOfflineError(error)) return <OfflineBlock onRetry={onRetry} />;
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
  const t = useT();
  return <Button label={t('common.retry')} onPress={onPress} />;
}

/**
 * Une section dont la donnée manque sans que l'écran entier échoue :
 * on montre la raison au lieu de disparaître silencieusement.
 */
export function EmptyBlock({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.block,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderRadius: theme.radius.card },
      ]}
    >
      <AppText variant="caption" color={theme.colors.muted} align="center">{children}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 10, alignItems: 'center', justifyContent: 'center', padding: 20,
    borderWidth: StyleSheet.hairlineWidth, // le gris ne sépare plus : le filet sépare.
  },
});
