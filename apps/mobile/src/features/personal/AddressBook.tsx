import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fetchAddresses, updateAddress, deleteAddress, type Address } from '@/api/account';
import { userMessage } from '@/api/errors';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { RADIUS } from '@/design/tokens.mobile';
import { AppText, Button } from '@/design/ui';
import { useI18n } from '@/i18n';

export const addressRoute = (id?: string): Href => (id ? { pathname: '/account/address-edit', params: { id } } : '/account/address-edit') as Href;
export const useAddressBook = (owner: string) => useQuery({ queryKey: ['account', 'addresses', owner], queryFn: ({ signal }) => fetchAddresses({ signal }) });

export function AddressBook({ owner }: { owner: string }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const { width } = useWindowDimensions();
  const addresses = useAddressBook(owner);
  const [confirm, setConfirm] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async ({ item, remove }: { item: Address; remove?: boolean }) => {
      if (remove) await deleteAddress(item.id);
      else await updateAddress(item.id, { ...item, isDefault: true });
    },
    onSuccess: async () => { setConfirm(null); await client.invalidateQueries({ queryKey: ['account', 'addresses'] }); },
  });
  const direction = rowDirectionFor(theme.isRTL);
  if (addresses.isPending) return <LoadingBlock />;
  if (addresses.isError) return <ErrorBlock error={addresses.error} onRetry={() => void addresses.refetch()} />;
  const add = <View style={[styles.add, { borderColor: theme.colors.lineControl }]}>
    <Ionicons name="add-outline" size={theme.iconSize.xl} color={theme.colors.muted} />
    {!addresses.data.length ? <AppText align="center">{t('addresses.empty')}</AppText> : null}
    <Button label={t('addresses.add')} tone="quiet" onPress={() => router.push(addressRoute())} />
  </View>;
  return <View style={styles.stack}>
    {addresses.data.length ? <ScrollView horizontal showsHorizontalScrollIndicator={addresses.data.length > 1}
      contentContainerStyle={[styles.cards, { flexDirection: direction }]}>
      {addresses.data.map(item => <View key={item.id} style={[styles.card, { width: Math.min(415, Math.max(220, width - 72)), borderColor: theme.colors.lineControl }]}>
        <View style={[styles.top, { flexDirection: direction }]}>
          <AppText variant="subtitle" style={styles.grow}>{item.label || t('addresses.label')}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={t('addresses.edit')} disabled={mutation.isPending} onPress={() => router.push(addressRoute(item.id))}
            style={[styles.icon, { borderColor: theme.colors.lineControl }]}>
            <Ionicons name="pencil-outline" size={theme.iconSize.md} color={theme.colors.ink} />
          </Pressable>
        </View>
        <AppText variant="bodyStrong">{item.recipientName}</AppText>
        <AppText>{item.addressLine}</AppText>
        {[item.postalCode, item.city, item.governorate].some(Boolean) ? <AppText>{[item.postalCode, item.city, item.governorate].filter(Boolean).join(' · ')}</AppText> : null}
        {item.phone ? <AppText variant="bodySmall" color={theme.colors.muted}>{item.phone}</AppText> : null}
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.isDefault, disabled: item.isDefault || mutation.isPending }}
          disabled={item.isDefault || mutation.isPending} onPress={() => mutation.mutate({ item })} style={[styles.defaultRow, { flexDirection: direction }]}>
          <Ionicons name={item.isDefault ? 'checkbox-outline' : 'square-outline'} size={theme.iconSize.md} color={theme.colors.ink} />
          <AppText variant="bodySmall" style={styles.grow}>{t('addresses.default')}</AppText>
        </Pressable>
        <Button label={t('common.delete')} tone="danger" disabled={mutation.isPending} onPress={() => { mutation.reset(); setConfirm(item.id); }} />
        {confirm === item.id ? <View style={styles.stack}>
          <AppText>{t('addresses.confirmDelete')}</AppText>
          <Button label={t('addresses.deleteConfirm')} tone="danger" busy={mutation.isPending} onPress={() => mutation.mutate({ item, remove: true })} />
          <Button label={t('common.cancel')} tone="quiet" disabled={mutation.isPending} onPress={() => setConfirm(null)} />
        </View> : null}
      </View>)}
    </ScrollView> : null}
    {mutation.isError ? <AppText accessibilityRole="alert" color={theme.status.danger.fg}>{userMessage(mutation.error)[locale]}</AppText> : null}
    {add}
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: 12 }, cards: { gap: 12 }, top: { alignItems: 'center', gap: 8 }, grow: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.md, padding: 16, gap: 8 },
  icon: { height: 44, width: 44, borderRadius: RADIUS.full, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  defaultRow: { minHeight: 44, gap: 8, alignItems: 'center' },
  add: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.md, padding: 16, gap: 12, alignItems: 'center' },
});
