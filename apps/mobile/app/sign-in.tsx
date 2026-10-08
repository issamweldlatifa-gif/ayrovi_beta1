/**
 * Écran de connexion — téléphone (SMS), e-mail, ou création de compte.
 *
 * Règles tenues par cet écran :
 *   • il ne propose QUE ce que le serveur sait faire (`/auth/config`). Une
 *     méthode absente du serveur est expliquée, pas cliquable ;
 *   • chaque échec affiche la raison réelle, dans la langue de l'utilisateur ;
 *   • le bouton d'action porte l'état d'attente : aucun écran figé muet ;
 *   • en développement, quand aucun SMS n'est configuré, le serveur renvoie le
 *     code — on l'affiche tel quel plutôt que de laisser l'utilisateur bloqué.
 */
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText, Button, Card, Field, Segmented } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { authMessage, type AuthMessageKey } from '@/api/authMessages';
import { fetchServerReadiness, mobileSessionSupport } from '@/api/public';
import { newHandoffCode, pollHandoff, providerStartUrl, type ProviderId } from '@/api/providers';
import { closeProviderBrowser } from '@/features/auth/browser';
import { useSession } from '@/state/session';

type Mode = 'phone' | 'email' | 'register';

export default function SignInScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const session = useSession();

  const [mode, setMode] = useState<Mode>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<ProviderId | null>(null);
  const [failure, setFailure] = useState<{ message: string; hint?: string } | null>(null);

  /**
   * هل الخادم اللي نحكي معه يعرف عميل الموبايل؟ (المعلومة هذي موش تفصيل تقني:
   * خادم قديم = كل محاولة دخول غادي تفشل.) نسألو مرّة، وبلا إعادة محاولة:
   * كان الخادم ما جاوبش، ما نعرضوش لافتة — الضغطة على «دخول» تقول الحقيقة.
   */
  const readiness = useQuery({
    queryKey: ['server', 'ready'],
    queryFn: ({ signal }) => fetchServerReadiness({ signal }),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const legacyServer = mobileSessionSupport(readiness.data) === 'legacy';
  // Arrêt de l'attente demandé par l'utilisateur : drapeau lu par la boucle.
  const cancelled = useRef(false);

  const config = session.authConfig;

  /** Traduit un échec puis l'affiche — un seul chemin pour tous les formulaires. */
  const show = (error: unknown, fallback?: AuthMessageKey) => {
    const message = authMessage(error, fallback);
    setFailure({ message: 'key' in message ? t(message.key) : message[locale] });
  };

  const run = async (action: () => Promise<void>, fallback?: AuthMessageKey) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      show(error, fallback);
    } finally {
      setBusy(false);
    }
  };

  const closeIfSignedIn = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/account');
  };

  const sendCode = () => run(async () => {
    // Refus local AVANT l'appel : inutile de consommer un quota SMS pour un
    // numéro qui ne peut pas être tunisien.
    if (phone.replace(/\D/g, '').length < 8) {
      setFailure({ message: t('auth.error.phone') });
      return;
    }
    await session.requestPhoneCode(phone);
  }, 'auth.error.phone');

  const confirmCode = () => run(async () => {
    await session.confirmPhoneCode(code);
    closeIfSignedIn();
  }, 'auth.error.otpInvalid');

  const emailSignIn = () => run(async () => {
    await session.signInWithEmail(email, password);
    closeIfSignedIn();
  }, 'auth.error.credentials');

  const register = () => run(async () => {
    await session.signUpWithEmail({ displayName: name, email, password, locale, marketingOptIn: marketing });
    closeIfSignedIn();
  }, 'auth.error.register');

  /**
   * Fournisseur : on ouvre le navigateur système, puis on attend que le SERVEUR
   * dépose la session. L'application n'invente aucune session et ne lit aucun
   * jeton : elle réclame, avec un code à usage unique, ce que le serveur a
   * rangé après vérification.
   */
  const startProvider = async (provider: ProviderId) => {
    setFailure(null);
    setBusy(true);
    setWaiting(provider);
    cancelled.current = false;
    try {
      const handoff = await newHandoffCode();
      await WebBrowser.openBrowserAsync(providerStartUrl(provider, handoff)).catch(() => null);
      const issue = await pollHandoff(handoff, {
        attempts: 40,
        delayMs: 1500,
        shouldStop: () => cancelled.current,
      });
      await closeProviderBrowser();
      if (!issue) {
        // Absence de connexion, pas échec : la formulation ne dramatise pas.
        // Mais « rien n'a changé » sans piste laisse la personne seule devant
        // l'écran : on nomme les deux causes réelles côté Google, celle qu'on
        // ne peut pas voir d'ici (mode « Testing ») la première.
        setFailure({ message: t('auth.providers.incomplete'), hint: t('auth.providers.incompleteHint') });
        return;
      }
      await session.adoptSession(issue);
      closeIfSignedIn();
    } catch (error) {
      await closeProviderBrowser();
      show(error, 'auth.error.unavailable');
    } finally {
      setWaiting(null);
      setBusy(false);
    }
  };

  const challenge = session.challenge;

  // Un fournisseur n'est proposé QUE si le serveur le dit configuré : un bouton
  // qui mène à une page d'erreur est pire qu'une absence expliquée.
  const providers: { id: ProviderId; label: string; enabled: boolean }[] = [
    { id: 'google', label: t('auth.providers.google'), enabled: config?.google === true },
    { id: 'facebook', label: t('auth.providers.facebook'), enabled: config?.facebook === true },
    { id: 'apple', label: t('auth.providers.apple'), enabled: config?.apple === true },
  ];
  const offered = providers.filter((provider) => provider.enabled);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
    >
      <ScrollView
        contentContainerStyle={[
          styles.screen,
          { paddingTop: insets.top + theme.space[2], paddingBottom: insets.bottom + theme.space[5] },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={[styles.close, { minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget }]}
        >
          <Ionicons name="close" size={26} color={theme.colors.ink} />
        </Pressable>

        <AppText variant="title">{t('auth.title')}</AppText>
        <AppText variant="body" color={theme.colors.secondary} style={styles.intro}>{t('auth.subtitle')}</AppText>

        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'phone', label: t('auth.tabs.phone') },
            { value: 'email', label: t('auth.tabs.email') },
            { value: 'register', label: t('auth.tabs.register') },
          ]}
        />

        {legacyServer ? (
          <View
            accessibilityRole="alert"
            style={[styles.alert, {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.danger,
              borderRadius: theme.radius.card,
            }]}
          >
            <AppText variant="label" weight="bold" color={theme.colors.danger}>
              {t('signin.serverLegacy.title')}
            </AppText>
            <AppText variant="caption" color={theme.colors.secondary}>
              {t('signin.serverLegacy.body')}
            </AppText>
          </View>
        ) : null}

        {failure?.hint ? (
          <AppText variant="caption" color={theme.colors.muted}>{failure.hint}</AppText>
        ) : null}
        {failure ? (
          <View
            accessibilityRole="alert"
            style={[styles.alert, {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.line,
              borderRadius: theme.radius.card,
            }]}
          >
            <AppText variant="label" weight="bold" color={theme.colors.danger}>{failure.message}</AppText>
          </View>
        ) : null}

        {mode === 'phone' ? (
          <Card title={t('auth.tabs.phone')} hint={config && !config.phoneOtp ? t('auth.error.unavailable') : undefined}>
            {!challenge ? (
              <>
                <Field
                  label={t('auth.phone.label')}
                  placeholder={t('auth.phone.placeholder')}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  editable={!busy && (config?.phoneOtp ?? true)}
                />
                <Button label={t('auth.phone.send')} onPress={sendCode} busy={busy} disabled={config?.phoneOtp === false} />
              </>
            ) : (
              <>
                <AppText variant="caption" color={theme.colors.muted}>
                  {t('auth.phone.sent', { phone: challenge.maskedPhone || phone })}
                </AppText>
                {challenge.developmentCode ? (
                  <AppText variant="caption" color={theme.colors.accentText}>
                    {t('auth.phone.dev', { code: challenge.developmentCode })}
                  </AppText>
                ) : null}
                <Field
                  label={t('auth.phone.code')}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!busy}
                />
                <Button label={t('auth.phone.verify')} onPress={confirmCode} busy={busy} />
                <Button label={t('auth.phone.resend')} onPress={sendCode} tone="quiet" disabled={busy} />
                <Button label={t('auth.phone.change')} onPress={session.cancelPhoneCode} tone="quiet" disabled={busy} />
              </>
            )}
          </Card>
        ) : null}

        {mode === 'email' ? (
          <Card title={t('auth.tabs.email')} hint={config && !config.email ? t('auth.error.unavailable') : undefined}>
            <Field
              label={t('auth.email.label')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!busy}
            />
            <Field
              label={t('auth.password.label')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!busy}
            />
            <Button label={t('auth.email.submit')} onPress={emailSignIn} busy={busy} />
            {/* Le lien reste visible même quand la récupération est fermée :
                l'écran suivant explique POURQUOI au lieu de laisser un vide. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/forgot')}
              style={[styles.forgotLink, { minHeight: theme.geometry.minTarget }]}
            >
              <AppText variant="label" weight="bold" color={theme.colors.accentText}>
                {t('auth.forgot.link')}
              </AppText>
            </Pressable>
          </Card>
        ) : null}

        {mode === 'register' ? (
          <Card title={t('auth.tabs.register')} hint={t('auth.register.hint')}>
            <Field label={t('auth.name.label')} value={name} onChangeText={setName} editable={!busy} />
            <Field
              label={t('auth.email.label')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!busy}
            />
            <Field
              label={t('auth.password.label')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!busy}
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: marketing }}
              onPress={() => setMarketing((value) => !value)}
              style={[styles.checkboxRow, { minHeight: theme.geometry.minTarget }]}
            >
              <Ionicons
                name={marketing ? 'checkbox' : 'square-outline'}
                size={22}
                color={marketing ? theme.colors.accent : theme.colors.muted}
              />
              <AppText variant="caption" style={styles.checkboxLabel}>{t('auth.marketing')}</AppText>
            </Pressable>
            <Button label={t('auth.register.submit')} onPress={register} busy={busy} />
            <AppText variant="caption" color={theme.colors.muted}>{t('auth.legal')}</AppText>
          </Card>
        ) : null}

        <Card title={t('auth.providers.title')} hint={offered.length ? t('auth.providers.hint') : t('auth.error.unavailable')}>
          {/* Les trois fournisseurs sont TOUJOURS nommés : celui qui n'est pas
              configuré est annoncé comme tel, jamais passé sous silence — un
              utilisateur qui cherche « Facebook » doit lire pourquoi il ne le
              trouve pas, pas croire à un oubli. */}
          {providers.map((provider) =>
            provider.enabled ? (
              <Button
                key={provider.id}
                label={provider.label}
                onPress={() => startProvider(provider.id)}
                busy={waiting === provider.id}
                disabled={busy && waiting !== provider.id}
              />
            ) : (
              <AppText key={provider.id} variant="caption" color={theme.colors.muted}>
                {provider.label} — {t('auth.providers.off')}
              </AppText>
            ),
          )}
          {offered.length ? (
            <AppText variant="caption" color={theme.colors.muted}>{t('auth.providers.sameAccount')}</AppText>
          ) : null}
          {waiting ? (
            <>
              <AppText variant="label" weight="bold" color={theme.colors.accentText}>{t('auth.providers.waiting')}</AppText>
              <Button
                label={t('auth.providers.cancel')}
                tone="quiet"
                onPress={() => {
                  cancelled.current = true;
                }}
              />
            </>
          ) : null}
        </Card>

        <AppText variant="caption" color={theme.colors.muted}>
          {session.storageSecure ? t('auth.secure.keychain') : t('auth.secure.fallback')}
        </AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 16, gap: 12 },
  close: { alignItems: 'flex-start', justifyContent: 'center' },
  intro: { marginBottom: 4 },
  alert: { borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkboxLabel: { flex: 1 },
  forgotLink: { justifyContent: 'center' },
});
