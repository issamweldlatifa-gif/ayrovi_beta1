import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText, Field } from '@/design/ui';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { DELIVERY_INSTRUCTIONS_MAX, type DeliveryDraft } from './deliveryAddress';

export function DeliveryMethod() {
  const theme = useTheme(); const t = useT();
  return <View style={[styles.method, { borderColor: theme.colors.line, borderBottomColor: theme.colors.ink,
    borderRadius: theme.radius.control, flexDirection: rowDirectionFor(theme.isRTL) }]}>
    <Ionicons name="home-outline" size={theme.iconSize.lg} color={theme.colors.ink} />
    <AppText variant="bodyStrong" style={styles.grow}>{t('addresses.homeDelivery')}</AppText>
    <Ionicons name="checkmark-outline" size={theme.iconSize.md} color={theme.colors.ink} />
  </View>;
}

export function DeliveryFields({ draft, change, governorates = [], disabled = false }: {
  draft: DeliveryDraft; change: (field: keyof DeliveryDraft, value: string) => void; governorates?: readonly string[]; disabled?: boolean;
}) {
  const theme = useTheme(); const t = useT(); const [open, setOpen] = useState(false);
  return <>
    <Field label={t('addresses.recipient')} value={draft.recipientName} onChangeText={value => change('recipientName', value)} editable={!disabled}
      autoCapitalize="words" autoComplete="name" maxLength={100} />
    <Field label={t('addresses.line')} value={draft.addressLine} onChangeText={value => change('addressLine', value)} editable={!disabled}
      autoComplete="street-address" autoCapitalize="sentences" maxLength={500} />
    <Field label={t('addresses.notes')} value={draft.deliveryNotes} onChangeText={value => change('deliveryNotes', value)} editable={!disabled}
      maxLength={DELIVERY_INSTRUCTIONS_MAX} />
    <Field label={t('addresses.postal')} value={draft.postalCode} onChangeText={value => change('postalCode', value)} editable={!disabled}
      autoComplete="postal-code" maxLength={20} keyboardType="number-pad" />
    <Field label={t('addresses.city')} value={draft.city} onChangeText={value => change('city', value)} editable={!disabled}
      autoComplete="postal-address-locality" autoCapitalize="words" maxLength={100} />
    {governorates.length ? <View style={styles.stack}>
      <AppText variant="label">{t('addresses.governorate')}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={`${t('addresses.governorate')} : ${draft.governorate || t('addresses.chooseGovernorate')}`}
        accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => setOpen(value => !value)}
        style={[styles.option, { flexDirection: rowDirectionFor(theme.isRTL), borderColor: theme.colors.lineControl, borderRadius: theme.radius.control }]}>
        <AppText style={styles.grow}>{draft.governorate || t('addresses.chooseGovernorate')}</AppText>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} color={theme.colors.ink} size={theme.iconSize.sm} />
      </Pressable>
      {draft.governorate && !governorates.includes(draft.governorate) ?
        <AppText accessibilityRole="alert" variant="caption" color={theme.status.danger.fg}>{t('addresses.invalidGovernorate')}</AppText> : null}
      {open ? <View style={styles.stack}>{governorates.map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: draft.governorate === value }}
        onPress={() => { change('governorate', value); setOpen(false); }} disabled={disabled}
        style={[styles.option, { borderColor: theme.colors.line, borderRadius: theme.radius.control }]}>
        <AppText variant={draft.governorate === value ? 'bodyStrong' : 'body'}>{value}</AppText>
      </Pressable>)}</View> : null}
    </View> : <Field label={t('addresses.governorate')} value={draft.governorate} onChangeText={value => change('governorate', value)} editable={!disabled}
      autoCapitalize="words" maxLength={80} />}
    <Field label={t('checkout.phone')} value={draft.phone} onChangeText={value => change('phone', value)} editable={!disabled}
      autoComplete="tel" keyboardType="phone-pad" maxLength={24} />
    <AppText variant="caption" color={theme.colors.muted}>{t('checkout.phoneHint')}</AppText>
    <View style={styles.stack}>
      <AppText variant="label">{t('addresses.country')}</AppText>
      <AppText variant="bodyStrong">{t('addresses.tunisia')}</AppText>
    </View>
  </>;
}

const styles = StyleSheet.create({
  method: { minHeight: 64, alignItems: 'center', gap: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 3 },
  option: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, alignItems: 'center', gap: 8 },
  stack: { gap: 8 }, grow: { flex: 1, minWidth: 0 },
});
