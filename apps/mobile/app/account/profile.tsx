/**
 * Mon profil — nom affiché, adresse e-mail, acceptation des offres.
 *
 * Le serveur ne modifie QUE ces trois champs (le téléphone se vérifie par SMS,
 * il ne s'édite pas). Après enregistrement, la session est relue : le nom
 * affiché doit changer partout, pas seulement sur cet écran.
 */
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText, Button, Card, Field, ToggleRow } from '@/design/ui';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { deleteAvatar, fetchOverview, updateProfile, uploadAvatar } from '@/api/account';
import { authMessage } from '@/api/authMessages';
import { SubScreen } from '@/design/subScreen';
import { useSession } from '@/state/session';

export default function ProfileScreen() {
  const theme = useTheme();
  const t = useI18n().t;
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const session = useSession();

  const overview = useQuery({
    queryKey: ['account', 'overview', session.account?.id ?? 'anon'],
    queryFn: ({ signal }) => fetchOverview({ signal }),
    // Le profil affiché est celui du SERVEUR : on ne pré-remplit pas avec un
    // cache local qui pourrait dater.
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

  const save = async () => {
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
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFailure(t('profile.photoPermission'));
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    setPhotoBusy(true);
    try {
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
    <SubScreen title={t('profile.title')} subtitle={t('profile.subtitle')}>
      {overview.isLoading ? <LoadingBlock /> : null}
      {overview.isError ? <ErrorBlock error={overview.error} onRetry={() => overview.refetch()} /> : null}

      <Card title={t('profile.photo')}>
        <View style={styles.photoRow}>
          {account?.avatarUrl ? (
            <Image
              source={{ uri: account.avatarUrl }}
              style={[styles.avatar, { borderColor: theme.colors.line, borderRadius: theme.radius.control }]}
              resizeMode="cover"
              accessibilityLabel={t('profile.photo')}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty, { borderColor: theme.colors.line, borderRadius: theme.radius.control, backgroundColor: theme.colors.surface }]}>
              <AppText variant="caption" color={theme.colors.muted} align="center">{t('profile.photoNone')}</AppText>
            </View>
          )}
          <View style={styles.photoActions}>
            <Button label={t('profile.photoPick')} onPress={pickPhoto} busy={photoBusy} />
            {account?.avatarUrl ? (
              <Button label={t('profile.photoRemove')} tone="quiet" onPress={removePhoto} disabled={photoBusy} />
            ) : null}
          </View>
        </View>
        <AppText variant="caption" color={theme.colors.muted}>{t('profile.photoHint')}</AppText>
      </Card>

      <Card title={t('profile.identity')}>
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
          <AppText accessibilityRole="alert" variant="label" weight="bold" color={theme.status.danger.fg}>{failure}</AppText>
        ) : null}
        {saved ? (
          <AppText accessibilityRole="alert" variant="label" weight="bold" color={theme.status.success.fg}>
            {t('profile.saved')}
          </AppText>
        ) : null}
        {/* Enregistrer sans rien changer ne sert à rien : le bouton le dit. */}
        {!shownName.trim() ? (
          <AppText variant="caption" color={theme.status.danger.fg}>{t('profile.nameRequired')}</AppText>
        ) : null}
        <Button label={t('common.save')} onPress={save} busy={busy} disabled={!shownName.trim()} />
      </Card>

      <Card title={t('profile.phone')}>
        <AppText variant="body">{account?.phone || '—'}</AppText>
        <AppText variant="caption" color={theme.colors.muted}>{t('profile.phoneLocked')}</AppText>
      </Card>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  photoActions: { flex: 1, gap: 8 },
  avatar: { width: 84, height: 84, borderWidth: StyleSheet.hairlineWidth },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
});
