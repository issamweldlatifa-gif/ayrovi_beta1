import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { mediaUrl } from '@/api/client';
import { AppImage } from '@/design/appImage';
import { COMMERCE } from '@/design/tokens.mobile';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import type { ChoiceOption } from '@/features/aywebs/ChoiceField';

export function VariantOptionChips({
  kind, label, value, options, onSelect,
}: {
  kind: 'color' | 'size';
  label: string;
  value: string;
  options: ChoiceOption[];
  onSelect: (value: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <AppText variant="label" weight="bold">{label}</AppText>
      <View style={[styles.options, { flexDirection: theme.isRTL ? 'row-reverse' : 'row' }]}>
        {options.map((option, index) => {
          const active = option.value === value;
          const disabled = option.unavailable === true;
          return kind === 'color' ? (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${option.value}${option.price ? `, ${option.price}` : ''}`}
              accessibilityState={{ selected: active, disabled }}
              disabled={disabled}
              onPress={() => onSelect(option.value)}
              style={styles.colorOption}
            >
              <View style={[
                styles.imageRing,
                { borderColor: active ? COMMERCE.action : theme.colors.line, opacity: disabled ? 0.45 : 1 },
              ]}>
                {option.image ? (
                  <AppImage
                    uri={mediaUrl(option.image)}
                    contentFit="cover"
                    decorative
                    testID={`aywebs-color-image-${index}`}
                    style={styles.productImage}
                  />
                ) : (
                  <View style={[styles.imagePlaceholder, { backgroundColor: theme.colors.disabled }]}>
                    <Ionicons name="image-outline" size={20} color={theme.colors.muted} />
                  </View>
                )}
                {active ? (
                  <View style={styles.selectedMark}>
                    <Ionicons name="checkmark" size={13} color={COMMERCE.onAction} />
                  </View>
                ) : null}
              </View>
              <AppText variant="caption" numberOfLines={1} color={disabled ? theme.colors.muted : theme.colors.ink}>
                {option.value}
              </AppText>
              {option.price ? <AppText variant="caption" color={theme.colors.muted}>{option.price}</AppText> : null}
            </Pressable>
          ) : (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${option.value}${option.price ? `, ${option.price}` : ''}`}
              accessibilityState={{ selected: active, disabled }}
              disabled={disabled}
              onPress={() => onSelect(option.value)}
              style={[
                styles.sizeOption,
                {
                  borderColor: active ? COMMERCE.action : theme.colors.line,
                  backgroundColor: active ? theme.status.warning.soft : theme.colors.surface,
                  opacity: disabled ? 0.45 : 1,
                },
              ]}
            >
              <AppText variant="label" weight={active ? 'bold' : 'regular'}>{option.value}</AppText>
              {option.price ? <AppText variant="caption" color={theme.colors.muted}>{option.price}</AppText> : null}
              {disabled ? <AppText variant="caption" color={theme.colors.muted}>×</AppText> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  options: { flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 },
  colorOption: { minWidth: 62, maxWidth: 90, minHeight: 82, alignItems: 'center', justifyContent: 'center', gap: 2 },
  imageRing: { position: 'relative', width: 58, height: 58, borderWidth: 2, borderRadius: 30, padding: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  productImage: { width: 50, height: 50, borderRadius: 25 },
  imagePlaceholder: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  selectedMark: { position: 'absolute', right: 2, bottom: 2, width: 19, height: 19, borderRadius: 10, backgroundColor: COMMERCE.action, alignItems: 'center', justifyContent: 'center' },
  sizeOption: { minWidth: 48, minHeight: 44, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', gap: 1 },
});
