/**
 * SONIM — amorces, au-dessus de la conversation.
 *
 * Pourquoi des amorces plutôt qu'une page blanche : face à un champ vide, la
 * personne ne sait pas ce que l'assistant SAIT faire. Une amorce n'est pas une
 * réponse toute prête — elle remplit le champ, la personne corrige et envoie.
 *
 * Elles disparaissent pendant la réponse : proposer autre chose pendant que
 * SONIM écrit détourne le regard de la réponse en cours.
 *
 * Aucune amorce n'est inventée ici : elles viennent des touches d'interface
 * (`sonim.chip.*`), donc traduites, et modifiables sans toucher au code.
 */
import { ScrollView, StyleSheet } from 'react-native';
import { Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';

export interface SonimChip {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export function SonimChips({
  chips, onPick, disabled = false,
}: {
  chips: SonimChip[];
  onPick: (chip: SonimChip) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  if (chips.length === 0 || disabled) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
      style={styles.row}
    >
      {chips.map((chip) => (
        <Pressable
          key={chip.id}
          accessibilityRole="button"
          accessibilityLabel={chip.label}
          onPress={() => onPick(chip)}
          style={({ pressed }) => [
            styles.chip,
            {
              flexDirection: rowDirectionFor(theme.isRTL),
              minHeight: 36,
              borderRadius: theme.radius.control,
              borderColor: theme.colors.line,
              backgroundColor: theme.colors.surface,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name={chip.icon} size={16} color={theme.colors.accent} accessibilityElementsHidden />
          <AppText variant="caption" color={theme.colors.ink}>{chip.label}</AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexGrow: 0, marginBottom: 8 },
  chip: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
