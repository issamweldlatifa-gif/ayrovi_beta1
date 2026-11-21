import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAddress, deleteAddress, updateAddress, type Address } from '@/api/account';
import { fetchCommercePolicy } from '@/api/checkout';
import { DeliveryFields, DeliveryMethod } from '@/features/personal/DeliveryFields';
import { deliveryDraft, isDeliveryComplete } from '@/features/personal/deliveryAddress';
import { userMessage } from '@/api/errors';
import { goBack } from '@/design/navigation';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { AppText, Button, Field, ToggleRow } from '@/design/ui';
import { useAddressBook } from '@/features/personal/AddressBook';
import { PersonalGuest, PersonalLayout } from '@/features/personal/PersonalLayout';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function AddressEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { status, account } = useSession();
  const { t } = useI18n();
  const addressId = typeof id === 'string' ? id : undefined;
  const title = t(addressId ? 'addresses.edit' : 'addresses.new');
  if (status !== 'signedIn' || !account?.id) return <PersonalLayout title={title}><PersonalGuest loading={status === 'loading'} /></PersonalLayout>;
  return addressId ? <ExistingAddress owner={account.id} id={addressId} title={title} /> :
    <AddressForm key={account.id} title={title} name={account.displayName} phone={account.phone} />;
}

function ExistingAddress({ owner, id, title }: { owner: string; id: string; title: string }) {
  const { t } = useI18n();
  const addresses = useAddressBook(owner);
  if (addresses.isPending) return <PersonalLayout title={title}><LoadingBlock /></PersonalLayout>;
  if (addresses.isError) return <PersonalLayout title={title}><ErrorBlock error={addresses.error} onRetry={() => void addresses.refetch()} /></PersonalLayout>;
  const item = addresses.data.find(address => address.id === id);
  if (!item) return <PersonalLayout title={title}><AppText>{t('addresses.notFound')}</AppText></PersonalLayout>;
  return <AddressForm key={`${owner}:${id}`} title={title} item={item} />;
}

function AddressForm({ item, title, name = '', phone = '' }: { item?: Address; title: string; name?: string; phone?: string }) {
  const { t, locale } = useI18n();
  const theme = useTheme();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const policy = useQuery({ queryKey: ['commerce', 'policy'], queryFn: ({ signal }) => fetchCommercePolicy({ signal }), staleTime: 5 * 60_000 });
  const [form, setForm] = useState(() => ({ ...deliveryDraft(item ?? { recipientName: name, phone }), label: item?.label ?? '', isDefault: item?.isDefault ?? false }));
  const mutation = useMutation({ mutationFn: async (action: 'save' | 'delete') => {
    if (action === 'delete' && item) return deleteAddress(item.id);
    const input = { ...form, label: form.label.trim() || t('addresses.home') };
    const saved = await (item ? updateAddress(item.id, input) : createAddress(input));
    if (!saved) throw new Error('Malformed address');
    return saved;
  }, onSuccess: () => { void client.invalidateQueries({ queryKey: ['account', 'addresses'] }); } });
  const finish = () => goBack('/account/addresses');
  const regions = policy.data?.governorates;
  const complete = isDeliveryComplete(form) && (!regions?.length || regions.includes(form.governorate));
  return <PersonalLayout title={title} fallback="/account/addresses">
    <DeliveryMethod />
    <AppText variant="h3" accessibilityRole="header">{title}</AppText>
    <DeliveryFields draft={form} disabled={mutation.isPending} governorates={regions}
      change={(field, value) => setForm(previous => ({ ...previous, [field]: value }))} />
    <Field label={t('addresses.label')} value={form.label} maxLength={40} editable={!mutation.isPending}
      onChangeText={label => setForm(previous => ({ ...previous, label }))} />
    <ToggleRow label={t('addresses.default')} value={form.isDefault} disabled={item?.isDefault || mutation.isPending}
      onChange={value => setForm(previous => ({ ...previous, isDefault: value }))} />
    <Button label={t('addresses.save')} block size="lg" busy={mutation.isPending && mutation.variables === 'save'}
      disabled={!complete || mutation.isPending || confirm} onPress={() => mutation.mutate('save', { onSuccess: finish })} />
    <Button label={t('common.cancel')} tone="quiet" block size="lg" disabled={mutation.isPending || confirm} onPress={finish} />
    {item ? <Button label={t('addresses.deleteAction')} tone="danger" disabled={mutation.isPending || confirm} onPress={() => { mutation.reset(); setConfirm(true); }} /> : null}
    {confirm ? <>
      <AppText>{t('addresses.confirmDelete')}</AppText>
      <Button label={t('addresses.deleteConfirm')} tone="danger" busy={mutation.isPending} onPress={() => mutation.mutate('delete', { onSuccess: finish })} />
      <Button label={t('common.cancel')} tone="quiet" disabled={mutation.isPending} onPress={() => setConfirm(false)} />
    </> : null}
    {mutation.isError ? <AppText accessibilityRole="alert" color={theme.status.danger.fg}>{userMessage(mutation.error)[locale]}</AppText> : null}
  </PersonalLayout>;
}
