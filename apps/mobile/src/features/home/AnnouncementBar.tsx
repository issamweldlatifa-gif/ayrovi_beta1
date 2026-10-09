/**
 * Messages d'annonce publiés depuis l'Admin (`/api/public/announcement-messages`).
 *
 * Une seule annonce à l'écran à la fois : sur mobile, une barre qui défile ou
 * qui empile trois messages vole la place du contenu. Un appui passe au
 * suivant — et le compteur dit combien il en reste, donc l'utilisateur sait
 * qu'il n'a pas tout perdu.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/design/ui';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import type { Announcement } from '@/api/public';

export function AnnouncementBar({ messages }: { messages: Announcement[] }) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);

  if (!messages.length) return null;
  const current = messages[Math.min(index, messages.length - 1)];
  const multiple = messages.length > 1;

  return (
    <Pressable
      accessibilityRole={multiple ? 'button' : 'text'}
      accessibilityLabel={current.text}
      accessibilityHint={multiple ? 'Passe à l’annonce suivante' : undefined}
      disabled={!multiple}
      onPress={() => setIndex((value) => (value + 1) % messages.length)}
      style={[
        styles.bar,
        { flexDirection: rowDirectionFor(theme.isRTL) },
        {
          backgroundColor: theme.colors.infoSoft,
          borderColor: theme.colors.line,
          borderRadius: theme.radius.control,
          padding: theme.space[2],
        },
      ]}
    >
      <View style={[styles.marker, { backgroundColor: theme.colors.accent }]} />
      <AppText variant="caption" style={styles.text}>{current.text}</AppText>
      {multiple ? (
        <AppText variant="caption" weight="bold" color={theme.colors.muted}>
          {`${Math.min(index, messages.length - 1) + 1}/${messages.length}`}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth },
  marker: { width: 4, height: 20, borderRadius: 2 },
  text: { flex: 1 },
});
