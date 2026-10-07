/**
 * Mes adresses — liste, ajout, suppression, adresse par défaut.
 *
 * Le serveur exige quatre champs (destinataire, téléphone, gouvernorat, ligne
 * d'adresse) ; la ville, le code postal et les notes sont facultatifs. L'écran
 * suit EXACTEMENT cette règle : pas de champ obligatoire qui ne le serait pas,
 * pas de champ facultatif présenté comme obligatoire.
 *
 * La première adresse devient automatiquement celle par défaut (règle du
 * serveur) — et si on supprime celle par défaut, le serveur en promeut une autre.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText, Button, Card, Field } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import {
  createAddress, deleteAddress, fetchAddresses, type Address,
} from '@/api/account';
import { userMessage } from '@/api/errors';
import { SubScreen } from '@/design/subScreen';

const GOVERNORATES = [
  'Ariana', 'Béja', 'Ben Arous', 'Bizerte', 'Gabès', 'Gafsa', 'Jendouba', 'Kairouan', 'Kasserine',
  'Kébili', 'Kef', 'Mahdia', 'Manouba', 'Médenine', 'Monastir', 'Nabeul', 'Sfax', 'Sidi Bouzid',
  'Siliana', 'Sousse', 'Tataouine', 'Tozeur', 'Tunis', 'Zaghouan',
];

export default function AddressesScreen() {
  const theme = useTheme();
  const t = useI18n().t;
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const addresses = useQuery({ queryKey: ['account', 'addresses'], queryFn: ({ signal }) => fetchAddresses({ signal }) });

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: '', recipientName: '', phone: '', governorate: '', city: '', addressLine: '', deliveryNotes: '' });
  const [failure, setFailure] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['account'] });

  const add = useMutation({
    mutationFn: () => createAddress({
      label: form.label.trim() || 'Maison',
      recipientName: form.recipientName.trim(),
      phone: form.phone.trim(),
      governorate: form.governorate.trim(),
      city: form.city.trim(),
      addressLine: form.addressLine.trim(),
      deliveryNotes: form.deliveryNotes.trim(),
    }),
    onSuccess: async () => {
      setForm({ label: '', recipientName: '', phone: '', governorate: '', city: '', addressLine: '', deliveryNotes: '' });
      setAdding(false);
      await invalidate();
    },
    onError: (error) => setFailure(userMessage(error)[locale]),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAddress(id),
    onSuccess: invalidate,
    onError: (error) => setFailure(userMessage(error)[locale]),
  });

  const complete = form.recipientName.trim() && form.phone.trim() && form.governorate.trim() && form.addressLine.trim();

  return (
    <SubScreen
      title={t('addresses.title')}
      subtitle={t('addresses.subtitle')}
      onRefresh={() => addresses.refetch()}
      refreshing={addresses.isRefetching}
    >
      {failure ? (
        <AppText accessibilityRole="alert" variant="label" weight="bold" color={theme.colors.danger}>{failure}</AppText>
      ) : null}
      {addresses.isLoading ? <LoadingBlock /> : null}
      {addresses.isError ? <ErrorBlock error={addresses.error} onRetry={() => addresses.refetch()} /> : null}
      {addresses.data && addresses.data.length === 0 && !adding ? (
        <EmptyBlock><AppText variant="body" align="center">{t('addresses.empty')}</AppText></EmptyBlock>
      ) : null}

      {addresses.data?.map((address) => (
        <AddressCard
          key={address.id}
          address={address}
          onDelete={() => remove.mutate(address.id)}
          busy={remove.isPending}
        />
      ))}

      {adding ? (
        <Card title={t('addresses.new')}>
          <Field label={t('addresses.label')} placeholder={t('addresses.labelPlaceholder')} value={form.label} onChangeText={(v) => setForm({ ...form, label: v })} />
          <Field label={t('addresses.recipient')} value={form.recipientName} onChangeText={(v) => setForm({ ...form, recipientName: v })} />
          <Field label={t('auth.phone.label')} placeholder="20 123 456" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} />
          <Field label={t('addresses.governorate')} value={form.governorate} onChangeText={(v) => setForm({ ...form, governorate: v })} autoCapitalize="words" />
          <AppText variant="caption" color={theme.colors.muted}>{GOVERNORATES.join(' · ')}</AppText>
          <Field label={t('addresses.city')} value={form.city} onChangeText={(v) => setForm({ ...form, city: v })} />
          <Field label={t('addresses.line')} value={form.addressLine} onChangeText={(v) => setForm({ ...form, addressLine: v })} multiline />
          <Field label={t('addresses.notes')} value={form.deliveryNotes} onChangeText={(v) => setForm({ ...form, deliveryNotes: v })} />
          <Button label={t('common.save')} onPress={() => { setFailure(''); add.mutate(); }} busy={add.isPending} disabled={!complete} />
          <Button label={t('common.cancel')} tone="quiet" onPress={() => { setAdding(false); setFailure(''); }} />
        </Card>
      ) : (
        <Button label={t('addresses.add')} onPress={() => setAdding(true)} />
      )}
    </SubScreen>
  );
}

function AddressCard({ address, onDelete, busy }: { address: Address; onDelete: () => void; busy: boolean }) {
  const theme = useTheme();
  const t = useI18n().t;
  return (
    <Card title={address.label || t('addresses.label')}>
      <View style={styles.row}>
        {address.isDefault ? (
          <AppText variant="caption" weight="bold" color={theme.colors.accentText}>{t('addresses.default')}</AppText>
        ) : null}
      </View>
      <AppText variant="body" weight="bold">{address.recipientName}</AppText>
      <AppText variant="caption">{address.phone}</AppText>
      <AppText variant="caption">{address.addressLine}</AppText>
      <AppText variant="caption" color={theme.colors.muted}>
        {[address.city, address.postalCode, address.governorate].filter(Boolean).join(' · ')}
      </AppText>
      {address.deliveryNotes ? (
        <AppText variant="caption" color={theme.colors.muted}>{address.deliveryNotes}</AppText>
      ) : null}
      <Button label={t('common.delete')} tone="quiet" onPress={onDelete} busy={busy} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'flex-end' },
});
