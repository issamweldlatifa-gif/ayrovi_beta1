/**
 * État vide illustré — un écran vide dit POURQUOI il est vide et propose la
 * seule action qui le remplit. Le dessin vient de l'appelant (même grammaire
 * que l'illustration du panier / des favoris), les couleurs du thème.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button } from './ui';
import { useTheme } from './theme';

export function EmptyState({
  art,
  title,
  body,
  actionLabel,
  onAction,
  testID,
}: {
  art: ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View testID={testID} style={styles.frame}>
      <View style={styles.art}>{art}</View>
      <AppText variant="h2" align="center" accessibilityRole="header">{title}</AppText>
      {body ? <AppText variant="body" align="center" color={theme.colors.muted}>{body}</AppText> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} block size="lg" testID={testID ? `${testID}-action` : undefined} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { paddingHorizontal: 24, paddingVertical: 32, gap: 12, alignItems: 'stretch' },
  art: { alignItems: 'center', paddingBottom: 8 },
  action: { paddingTop: 12 },
});
