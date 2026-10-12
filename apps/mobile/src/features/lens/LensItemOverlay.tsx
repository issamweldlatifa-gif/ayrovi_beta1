/**
 * Cadres des éléments détectés, posés sur la photo envoyée (Lens, plusieurs produits).
 *
 * Les cadres viennent du serveur (`box` normalisé 0..1). Le conteneur a exactement
 * la taille de l'image affichée, donc les pourcentages tombent juste sur l'élément.
 * Un tap sur un cadre choisit l'élément: la recherche est refaite pour lui seul (`roi`).
 */
import { Pressable, StyleSheet, View } from 'react-native';

import type { LensDetectedItem } from '@/api/lens';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';

export interface LensItemOverlayProps {
  /** Taille affichée de l'image (pas la taille native). */
  width: number;
  height: number;
  items: readonly LensDetectedItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function LensItemOverlay({ width, height, items, selectedIndex, onSelect }: LensItemOverlayProps) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <View style={[styles.layer, { width, height }]}>
      {items.map((item, index) => {
        const selected = index === selectedIndex;
        return (
          <Pressable
            key={`${item.name}-${index}`}
            accessibilityRole="button"
            accessibilityLabel={t('lens.itemPick', { name: item.name })}
            accessibilityState={{ selected }}
            onPress={() => onSelect(index)}
            style={[
              styles.box,
              {
                left: item.box.x * width,
                top: item.box.y * height,
                width: item.box.w * width,
                height: item.box.h * height,
                borderWidth: selected ? 3 : 2,
                borderColor: selected ? theme.colors.action : theme.colors.canvas,
                borderRadius: theme.radius.control,
              },
            ]}
          >
            <View style={[styles.tag, { backgroundColor: selected ? theme.colors.action : theme.colors.ink, borderRadius: theme.radius.control }]}>
              <AppText variant="caption" weight="bold" color={theme.colors.canvas} numberOfLines={1}>
                {item.name}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0 },
  box: { position: 'absolute' },
  tag: { position: 'absolute', top: 4, left: 4, maxWidth: '90%', paddingHorizontal: 6, paddingVertical: 2 },
});
