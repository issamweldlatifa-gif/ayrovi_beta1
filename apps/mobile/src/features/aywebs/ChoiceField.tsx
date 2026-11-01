/**
 * حقل اختيار واحد في ورقة الإضافة (23/10/2026).
 *
 * الشكل: سطر مغلق يقول الاسم والقيمة المختارة وسهم — كي تتكبّ عليه يتفتّح
 * وتظهر القيم. هكذا الورقة تبقى قصيرة (صورة + عنوان + ثمن + سطرين أو ثلاثة +
 * زر الإضافة) بدل شبكة pastilles طويلة، والقيم كل واحدة تعرض ثمنها وحالتها.
 *
 * ما فيه حتى طلب شبكة هنا: هذا عرض فقط. الخادم هو من يقرأ ويحكم وقت الإضافة.
 */
import { useMemo } from 'react';
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { COMMERCE, veil } from '@/design/tokens.mobile';
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
  stock?: number | null;
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
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_event, gesture) => { if (gesture.dy > 60) onToggle(); },
  }), [onToggle]);
  const standard = options.length === 1 && options[0].value === value
    && /^(?:one\s*size|taille\s*unique|unique\s*size|standard|unique)$/i.test(value.trim());
  return (
    <View style={styles.field}>
      <AppText variant="caption" color={theme.colors.muted}>{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: standard }}
        disabled={standard}
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
            opacity: standard ? theme.opacity.disabled : 1,
          },
        ]}
      >
        <View style={styles.controlText}>
          <AppText
            variant="body"
            weight="semibold"
            color={value ? theme.colors.ink : theme.colors.muted}
            numberOfLines={1}
          >
            {value || placeholder}
          </AppText>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={theme.iconSize.md}
          color={theme.colors.muted}
        />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={onToggle} statusBarTranslucent>
        <View style={styles.overlay} accessibilityViewIsModal>
          <Pressable style={styles.backdrop} accessibilityRole="button" accessibilityLabel={t('sheet.close')} onPress={onToggle} />
          <View style={[styles.sheet, { backgroundColor: theme.colors.canvas }]}>
            <View {...swipe.panHandlers} style={[styles.sheetHeader, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
              <AppText variant="label" weight="bold" style={styles.optionLabel}>{label}</AppText>
              <Pressable accessibilityRole="button" accessibilityLabel={t('sheet.close')} onPress={onToggle} hitSlop={8} style={styles.close}>
                <Ionicons name="close-outline" size={theme.iconSize.md} color={theme.colors.ink} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {options.map((option) => {
                const active = option.value === value;
                const unavailable = option.unavailable === true;
                return (
                  <Pressable key={option.value} disabled={unavailable} accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: unavailable }} onPress={() => onSelect(option.value)}
                    testID={testID ? `${testID}-${option.value}` : undefined}
                    style={[styles.option, { flexDirection: rowDirectionFor(theme.isRTL), borderTopColor: theme.colors.line }]}>
                    <AppText variant="body" weight="semibold" color={unavailable ? theme.colors.muted : theme.colors.ink} style={styles.optionLabel}>{option.value}</AppText>
                    {option.price ? <AppText variant="label" color={unavailable ? theme.colors.muted : theme.status.danger.fg}>
                      {option.priceFrom ? `${t('aywebs.priceFrom')} ${option.price}` : option.price}
                    </AppText> : null}
                    {unavailable ? <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.notAvailable')}</AppText>
                      : option.stock != null ? <AppText variant="caption" color={theme.colors.muted}>{t('aywebs.stockLeft', { count: option.stock })}</AppText> : null}
                    {active ? <Ionicons name="checkmark" size={theme.iconSize.sm} color={theme.colors.ink} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: veil(0.35) },
  sheet: { maxHeight: '70%', borderTopLeftRadius: 8, borderTopRightRadius: 8, overflow: 'hidden', paddingBottom: 16 },
  sheetHeader: { alignItems: 'center', paddingLeft: 16, paddingRight: 8 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  control: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  controlText: { flex: 1, gap: 0 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth },
  optionLabel: { flex: 1 },
});
