import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText, Button, Card, Field, ToggleRow } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { AppImage } from '@/design/appImage';
import { useI18n } from '@/i18n';
import { deleteAvatar, fetchOverview, updateProfile, uploadAvatar } from '@/api/account';
import { authMessage } from '@/api/authMessages';
import { PersonalGuest, PersonalLayout } from '@/features/personal/PersonalLayout';
import { useSession } from '@/state/session';

/**
 * Filet de sécurité de l'écran : si le rendu lève, expo-router affiche le repli
 * (arabe + français, bouton « عاود ») à la place de l'écran — l'application
 * reste ouverte, l'utilisateur peut revenir. Voir `src/design/AppErrorBoundary.tsx`
 * et la cause du 25/10/2026 (ordre des hooks). Toute route en a un : c'est
 * vérifié par `tests/error-boundary-coverage.test.ts`.
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function ProfileEdit() {
  const t = useI18n().t;
  const { account, status } = useSession();
  if (status !== 'signedIn' || !account?.id) return <PersonalLayout title={t('personal.edit')}><PersonalGuest loading={status === 'loading'} /></PersonalLayout>;
  return <ProfileForm key={account.id} accountId={account.id} />;
}

function ProfileForm({ accountId }: { accountId: string }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const session = useSession();

  const overview = useQuery({
    queryKey: ['account', 'overview', accountId, locale],
    queryFn: ({ signal }) => fetchOverview({ signal, headers: { 'Accept-Language': locale } }),
    staleTime: 0,
  });

  const account = overview.data?.account ?? session.account;
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [marketing, setMarketing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [saved, setSaved] = useState(false);

  const shownName = name ?? account?.displayName ?? '';
  const shownEmail = email ?? account?.email ?? '';
  const shownMarketing = marketing ?? account?.marketingOptIn ?? false;
  const dirty = shownName !== (account?.displayName ?? '') || shownEmail !== (account?.email ?? '') || shownMarketing !== (account?.marketingOptIn ?? false);

  const save = async () => {
    if (busy || photoBusy || !dirty || !shownName.trim()) return;
    setBusy(true);
    setFailure('');
    setSaved(false);
    try {
      await updateProfile({ displayName: shownName, email: shownEmail || undefined, marketingOptIn: shownMarketing });
      await session.refreshAccount();
      // Les autres écrans (onglet Compte, synthèse) montrent le même nom.
      await queryClient.invalidateQueries({ queryKey: ['account'] });
      setSaved(true);
      setName(null);
      setEmail(null);
      setMarketing(null);
    } catch (error) {
      const message = authMessage(error, 'auth.error.register');
      setFailure('key' in message ? t(message.key) : message[locale]);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Choix de la photo. Le serveur refuse tout ce qui n'est pas JPG/PNG/WebP non
   * animé et recadre lui-même en 256×256 : on ne promet donc pas le cadrage,
   * on le demande au sélecteur pour éviter d'envoyer 8 Mo pour rien.
   */
  const pickPhoto = async () => {
    setFailure('');
    setSaved(false);
    setPhotoBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setFailure(t('profile.photoPermission')); return; }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      await uploadAvatar({
        uri: asset.uri,
        name: asset.fileName || 'avatar.jpg',
        type: asset.mimeType || 'image/jpeg',
        // `file` n'existe que sur le web (aperçu) : un vrai File, que le
        // navigateur sait joindre en multipart sans qu'on le lui décrive.
        blob: asset.file,
      });
      await session.refreshAccount();
      await queryClient.invalidateQueries({ queryKey: ['account'] });
    } catch (error) {
      const message = authMessage(error);
      setFailure('key' in message ? t(message.key) : message[locale]);
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setFailure('');
    setPhotoBusy(true);
    try {
      await deleteAvatar();
      await session.refreshAccount();
      await queryClient.invalidateQueries({ queryKey: ['account'] });
    } catch (error) {
      const message = authMessage(error);
      setFailure('key' in message ? t(message.key) : message[locale]);
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <PersonalLayout title={t('personal.edit')} footer={<Button label={t('common.save')} onPress={save} busy={busy} disabled={!dirty || !shownName.trim() || photoBusy} block size="lg" />}>
      {overview.isLoading ? <LoadingBlock /> : null}
      {overview.isError ? <ErrorBlock error={overview.error} onRetry={() => overview.refetch()} /> : null}

      <Field label={t('auth.name.label')} value={shownName} onChangeText={setName} editable={!busy} />
      <Field
        label={t('auth.email.label')}
        value={shownEmail}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!busy}
      />
      <AppText variant="caption" color={theme.colors.muted}>{t('profile.emailHint')}</AppText>
      <ToggleRow label={t('auth.marketing')} value={shownMarketing} onChange={setMarketing} disabled={busy} />
      {failure ? (
        <AppText accessibilityRole="alert" variant="label" color={theme.status.danger.fg}>{failure}</AppText>
      ) : null}
      {saved ? (
        <AppText accessibilityRole="alert" variant="label" color={theme.status.success.fg}>
          {t('profile.saved')}
        </AppText>
      ) : null}
      {/* Enregistrer sans rien changer ne sert à rien : le bouton le dit. */}
      {!shownName.trim() ? (
        <AppText variant="caption" color={theme.status.danger.fg}>{t('profile.nameRequired')}</AppText>
      ) : null}

      <Field label={t('profile.phone')} value={account?.phone || '—'} editable={false} />
      <AppText variant="caption" color={theme.colors.muted}>{t('profile.phoneLocked')}</AppText>
      <Card title={t('profile.photo')}>
        <View style={styles.photoRow}>
          {account?.avatarUrl ? (
            <AppImage
              uri={account.avatarUrl}
              style={[styles.avatar, { borderColor: theme.colors.line, borderRadius: theme.radius.control }]}
              contentFit="cover"
              accessibilityLabel={t('profile.photo')}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty, { borderColor: theme.colors.line, borderRadius: theme.radius.control, backgroundColor: theme.colors.surface }]}>
              <AppText variant="caption" color={theme.colors.muted} align="center">{t('profile.photoNone')}</AppText>
            </View>
          )}
          <View style={styles.photoActions}>
            <Button label={t('profile.photoPick')} onPress={pickPhoto} busy={photoBusy} disabled={busy} />
            {account?.avatarUrl ? (
              <Button label={t('profile.photoRemove')} tone="danger" onPress={removePhoto} disabled={photoBusy || busy} />
            ) : null}
          </View>
        </View>
        <AppText variant="caption" color={theme.colors.muted}>{t('profile.photoHint')}</AppText>
      </Card>

    </PersonalLayout>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  photoActions: { flex: 1, gap: 8 },
  avatar: { width: 84, height: 84, borderWidth: StyleSheet.hairlineWidth },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
});
