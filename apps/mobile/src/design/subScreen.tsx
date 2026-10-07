/**
 * Ossature commune des écrans empilés (compte, AYWEBs, commandes…).
 *
 * Un seul endroit pour : le bouton retour, le titre, la marge haute sûre, et le
 * geste de rafraîchissement. Sans cela, chaque écran réinvente sa coquille et
 * finit par ne plus rien avoir en commun avec les autres.
 *
 * `fallback` : où revenir quand l'écran a été ouvert directement (lien profond)
 * et qu'il n'y a rien derrière. Un écran AYWEBs ne doit pas renvoyer au compte.
 */
import type { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';

export function SubScreen({ title, subtitle, children, onRefresh, refreshing = false, fallback = '/(tabs)/account' }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Destination du bouton retour quand aucune pile n'existe derrière. */
  fallback?: string;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.canvas }}
      keyboardShouldPersistTaps="handled"
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
          paddingTop: insets.top + theme.space[2],
          paddingBottom: insets.bottom + theme.space[5],
          paddingHorizontal: theme.space[3],
          gap: theme.space[2],
        },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as never))}
          style={{ minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget, justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.ink} />
        </Pressable>
        <View style={styles.headerText}>
          <AppText variant="title">{title}</AppText>
          {subtitle ? <AppText variant="caption" color={theme.colors.muted}>{subtitle}</AppText> : null}
        </View>
      </View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerText: { flex: 1 },
});
