import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createAddress, deleteAddress, updateAddress, type Address } from '@/api/account';
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
  const [form, setForm] = useState(() => ({ label: item?.label ?? '', recipientName: item?.recipientName ?? name, phone: item?.phone ?? phone,
    governorate: item?.governorate ?? '', city: item?.city ?? '', postalCode: item?.postalCode ?? '', addressLine: item?.addressLine ?? '',
    deliveryNotes: item?.deliveryNotes ?? '', isDefault: item?.isDefault ?? false }));
  const mutation = useMutation({ mutationFn: async (action: 'save' | 'delete') => {
    if (action === 'delete' && item) return deleteAddress(item.id);
    const input = { ...form, label: form.label.trim() || t('addresses.home') };
    return item ? updateAddress(item.id, input) : createAddress(input);
  }, onSuccess: () => { void client.invalidateQueries({ queryKey: ['account', 'addresses'] }); } });
  const finish = () => goBack('/account/addresses');
  const fields = [
    ['label', 'addresses.label', 40], ['recipientName', 'addresses.recipient', 100], ['phone', 'auth.phone.label', 24],
    ['addressLine', 'addresses.line', 500], ['deliveryNotes', 'addresses.notes', 500], ['postalCode', 'addresses.postal', 20],
    ['city', 'addresses.city', 100], ['governorate', 'addresses.governorate', 80],
  ] as const;
  const complete = Boolean(form.recipientName.trim() && form.phone.trim() && form.governorate.trim() && form.addressLine.trim());
  return <PersonalLayout title={title} fallback="/account/addresses" footer={<Button label={t('common.save')} block size="lg"
    busy={mutation.isPending && mutation.variables === 'save'} disabled={!complete || mutation.isPending || confirm} onPress={() => mutation.mutate('save', { onSuccess: finish })} />}>
    {fields.map(([field, label, max]) => <Field key={field} label={t(label)} value={form[field]} maxLength={max} editable={!mutation.isPending}
      keyboardType={field === 'phone' ? 'phone-pad' : 'default'} multiline={field === 'addressLine' || field === 'deliveryNotes'}
      onChangeText={value => setForm(previous => ({ ...previous, [field]: value }))} />)}
    <Field label={t('addresses.country')} value={t('addresses.tunisia')} editable={false} />
    <ToggleRow label={t('addresses.default')} value={form.isDefault} disabled={item?.isDefault || mutation.isPending}
      onChange={value => setForm(previous => ({ ...previous, isDefault: value }))} />
    {item ? <Button label={t('addresses.deleteAction')} tone="danger" disabled={mutation.isPending || confirm} onPress={() => { mutation.reset(); setConfirm(true); }} /> : null}
    {confirm ? <>
      <AppText>{t('addresses.confirmDelete')}</AppText>
      <Button label={t('addresses.deleteConfirm')} tone="danger" busy={mutation.isPending} onPress={() => mutation.mutate('delete', { onSuccess: finish })} />
      <Button label={t('common.cancel')} tone="quiet" disabled={mutation.isPending} onPress={() => setConfirm(false)} />
    </> : null}
    {mutation.isError ? <AppText accessibilityRole="alert" color={theme.status.danger.fg}>{userMessage(mutation.error)[locale]}</AppText> : null}
  </PersonalLayout>;
}
