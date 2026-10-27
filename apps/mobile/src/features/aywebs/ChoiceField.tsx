/**
 * حقل اختيار واحد في ورقة الإضافة (23/10/2026).
 *
 * الشكل: سطر مغلق يقول الاسم والقيمة المختارة وسهم — كي تتكبّ عليه يتفتّح
 * وتظهر القيم. هكذا الورقة تبقى قصيرة (صورة + عنوان + ثمن + سطرين أو ثلاثة +
 * زر الإضافة) بدل شبكة pastilles طويلة، والقيم كل واحدة تعرض ثمنها وحالتها.
 *
 * ما فيه حتى طلب شبكة هنا: هذا عرض فقط. الخادم هو من يقرأ ويحكم وقت الإضافة.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { COMMERCE } from '@/design/tokens.mobile';
import { rowDirectionFor } from '@/design/layoutLogic';

export interface ChoiceOption {
  /** القيمة كما نشرتها الصفحة — تُرسل للخادم كما هي. */
  value: string;
  /** نصّ الثمن المنشور لهذه القيمة (« 12,95 € »)، إن وُجد. */
  price?: string;
  /** صورة تاجر لهذه القيمة، لا swatch مرسوم أو لون مخمّن. */
  image?: string;
  priceFrom?: boolean;
  unavailable?: boolean;
  available?: boolean;
}

export interface ChoiceFieldProps {
  label: string;
  value: string;
  open: boolean;
  options: ChoiceOption[];
  onToggle: () => void;
  onSelect: (value: string) => void;
  /** كي ما يبقى حتى اختيار بعد: نكتب «اختر» بلون خافت. */
  placeholder: string;
  testID?: string;
}

export function ChoiceField({
  label, value, open, options, onToggle, onSelect, placeholder, testID,
}: ChoiceFieldProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const chosen = options.find((option) => option.value === value);
  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}${value ? ` : ${value}` : ''}`}
        onPress={onToggle}
        testID={testID}
        style={[
          styles.control,
          {
            flexDirection: rowDirectionFor(theme.isRTL),
            borderColor: open ? COMMERCE.action : theme.colors.line,
            borderRadius: theme.radius.control,
            minHeight: theme.geometry.minTarget + 8,
          },
        ]}
      >
        <View style={styles.controlText}>
          <AppText variant="caption" color={theme.colors.muted}>{label}</AppText>
          <AppText
            variant="body"
            weight="semibold"
            color={value ? theme.colors.ink : theme.colors.muted}
            numberOfLines={1}
          >
            {value || placeholder}
          </AppText>
        </View>
        {chosen?.price ? (
          <AppText variant="label" color={theme.colors.ink}>
            {chosen.priceFrom ? `${t('aywebs.priceFrom')} ${chosen.price}` : chosen.price}
          </AppText>
        ) : null}
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={theme.iconSize.md}
          color={theme.colors.muted}
        />
      </Pressable>

      {open ? (
        <View
          style={[
            styles.options,
            { borderColor: theme.colors.line, borderRadius: theme.radius.control, marginTop: 4, backgroundColor: theme.colors.surface },
          ]}
        >
          {options.map((option, index) => {
            const active = option.value === value;
            const unavailable = option.unavailable === true;
            return (
              <Pressable
                key={option.value}
                disabled={unavailable}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: unavailable }}
                onPress={() => onSelect(option.value)}
                testID={testID ? `${testID}-${option.value}` : undefined}
                style={[
                  styles.option,
                  index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.line } : null,
                  {
                    minHeight: theme.geometry.minTarget,
                    flexDirection: rowDirectionFor(theme.isRTL),
                    backgroundColor: active ? theme.status.warning.soft : theme.colors.surface,
                  },
                ]}
              >
                <AppText
                  variant="body"
                  weight={active ? 'semibold' : 'regular'}
                  color={unavailable ? theme.colors.muted : theme.colors.ink}
                  style={styles.optionLabel}
                >
                  {option.value}
                </AppText>
                {option.price ? (
                  <AppText variant="label" color={unavailable ? theme.colors.muted : theme.colors.ink}>
                    {option.priceFrom ? `${t('aywebs.priceFrom')} ${option.price}` : option.price}
                  </AppText>
                ) : null}
                {unavailable ? (
                  <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.notAvailable')}</AppText>
                ) : active ? (
                  <Ionicons name="checkmark-circle" size={theme.iconSize.md} color={theme.status.success.fg} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 0 },
  control: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  controlText: { flex: 1, gap: 0 },
  options: { borderWidth: 1, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  optionLabel: { flex: 1 },
});
