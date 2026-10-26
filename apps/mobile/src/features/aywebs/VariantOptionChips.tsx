import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

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
        {options.map((option) => {
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
                styles.swatchRing,
                { borderColor: active ? '#FFD60A' : 'transparent', opacity: disabled ? 0.4 : 1 },
              ]}>
                <View style={[styles.swatch, { backgroundColor: colorFor(option.value), borderColor: theme.colors.line }]}>
                  {active ? <Ionicons name="checkmark" size={15} color={isLightColor(colorFor(option.value)) ? '#111111' : '#FFFFFF'} /> : null}
                </View>
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
                  borderColor: active ? '#FFD60A' : theme.colors.line,
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

/** Named colors get a true swatch; unknown merchant labels stay visible on neutral gray. */
function colorFor(value: string): string {
  const name = value.normalize('NFD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '').toLowerCase();
  if (/\b(black|noir|schwarz|nero|negro)\b/.test(name) || /اسود/.test(name)) return '#171717';
  if (/\b(white|blanc|weiss|bianco|blanco)\b/.test(name) || /ابيض/.test(name)) return '#FFFFFF';
  if (/\b(red|rouge|rot|rosso|rojo)\b/.test(name) || /احمر/.test(name)) return '#D72638';
  if (/\b(blue|bleu|blau|blu|azul)\b/.test(name) || /ازرق/.test(name)) return '#2F6BCE';
  if (/\b(navy|marine)\b/.test(name)) return '#18284A';
  if (/\b(green|vert|grun|verde)\b/.test(name) || /اخضر/.test(name)) return '#31845A';
  if (/\b(pink|rose|rosa)\b/.test(name) || /وردي/.test(name)) return '#E78BA8';
  if (/\b(purple|violet|mauve|lila|violeta)\b/.test(name) || /بنفسجي/.test(name)) return '#8753A8';
  if (/\b(yellow|jaune|gelb|giallo|amarillo)\b/.test(name) || /اصفر/.test(name)) return '#F4CD36';
  if (/\b(orange|oranje|naranja)\b/.test(name) || /برتقالي/.test(name)) return '#E68734';
  if (/\b(brown|marron|braun|brun|castano)\b/.test(name) || /بني/.test(name)) return '#795548';
  if (/\b(gray|grey|gris|grau|grigio|grijs)\b/.test(name) || /رمادي/.test(name)) return '#92979D';
  if (/\b(beige|cream|creme|ivory|ivoire)\b/.test(name) || /عاجي|بيج/.test(name)) return '#D8C7A6';
  return '#C7CBD1';
}

function isLightColor(color: string): boolean {
  return color === '#FFFFFF' || color === '#F4CD36' || color === '#D8C7A6' || color === '#C7CBD1';
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  options: { flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 },
  colorOption: { minWidth: 58, maxWidth: 82, minHeight: 66, alignItems: 'center', justifyContent: 'center', gap: 2 },
  swatchRing: { width: 38, height: 38, borderWidth: 2, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sizeOption: { minWidth: 48, minHeight: 44, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', gap: 1 },
});
