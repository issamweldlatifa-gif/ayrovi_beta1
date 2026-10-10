/**
 * Écran de connexion — page unique, façon ChatGPT.
 *
 * Parcours :
 *   • « start » : adresse e-mail → code reçu par e-mail → session (dans l'écran) ;
 *   • autres méthodes proposées sous « OU » : Google, numéro de téléphone, mot de passe ;
 *   • conditions et confidentialité toujours en bas, ouvertes dans l'application.
 *
 * Règles tenues par cet écran :
 *   • il ne propose QUE ce que le serveur sait faire (`/auth/config`). Une
 *     méthode absente du serveur est expliquée, pas cliquable ;
 *   • chaque échec affiche la raison réelle, dans la langue de l'utilisateur ;
 *   • le bouton d'action porte l'état d'attente : aucun écran figé muet ;
 *   • en développement, quand aucun SMS ni e-mail n'est configuré, le serveur
 *     renvoie le code — on l'affiche tel quel plutôt que de laisser l'utilisateur bloqué.
 */
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText, Button, Card, Field } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useI18n } from '@/i18n';
import { authMessage, type AuthMessageKey } from '@/api/authMessages';
import { fetchServerReadiness, mobileSessionSupport } from '@/api/public';
import {
  googleNativeLogin, newHandoffCode, pollHandoff, providerDoneUrl, providerStartUrl, type ProviderId,
} from '@/api/providers';
import { closeProviderBrowser, openLegalPage, openProviderSession } from '@/features/auth/browser';
import { API_BASE_URL } from '@/api/config';
import { useSession } from '@/state/session';
import { signInWithGoogleNative, googleFailureCode } from '@/features/auth/googleNative';

/** « start » = adresse e-mail (page d'accueil de la connexion). */
type Mode = 'start' | 'phone' | 'password' | 'register';

/** Forme minimale d'une adresse : le serveur fait foi, ceci évite un aller-retour inutile. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

export default function SignInScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const session = useSession();

  const [mode, setMode] = useState<Mode>('start');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<ProviderId | null>(null);
  const [failure, setFailure] = useState<{ message: string; hint?: string } | null>(null);

  /**
   * Le serveur qu'on interroge sait-il reconnaître le client mobile ? Question
   * posée une fois, sans relance : un serveur ancien ferait échouer chaque
   * tentative, autant le dire tout de suite.
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
  const emailChallenge = session.emailChallenge;
  const challenge = session.challenge;

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

  /**
   * Google NATIF : sélecteur de compte dans l'application, puis jeton vérifié par le
   * serveur. Aucun onglet navigateur, donc aucune sortie de l'application.
   */
  const startGoogleNative = async () => {
    setFailure(null);
    setBusy(true);
    setWaiting('google');
    try {
      const outcome = await signInWithGoogleNative();
      if (outcome.kind === 'cancelled') return;
      const issue = await googleNativeLogin(outcome.idToken);
      await session.adoptSession(issue);
      closeIfSignedIn();
    } catch (error) {
      const kind = googleFailureCode(error);
      if (kind === 'play') setFailure({ message: t('auth.google.noPlayServices') });
      else if (kind === 'config') setFailure({ message: t('auth.google.config') });
      else show(error, 'auth.google.failed');
    } finally {
      setWaiting(null);
      setBusy(false);
    }
  };

  const changeMode = (next: Mode) => {
    setFailure(null);
    setMode(next);
  };

  const closeIfSignedIn = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/account');
  };

  /* ── Téléphone (SMS) ──────────────────────────────────────────────────── */

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

  /* ── E-mail : code (par défaut) et mot de passe (en option) ───────────── */

  // Connexion par code e-mail : tout reste dans l'écran, aucun navigateur ni lien de retour.
  const sendEmailCode = () => run(async () => {
    if (!EMAIL_SHAPE.test(email.trim())) {
      setFailure({ message: t('auth.emailCode.invalidAddress') });
      return;
    }
    setEmailCode('');
    await session.requestEmailCode(email, locale);
  }, 'auth.error.unavailable');

  const confirmEmailCode = () => run(async () => {
    await session.confirmEmailCode(emailCode);
    closeIfSignedIn();
  }, 'auth.emailCode.invalid');

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
      // Onglet personnalisé : le consentement se déroule DANS l'application.
      const outcome = await openProviderSession(providerStartUrl(provider, handoff), providerDoneUrl());
      await closeProviderBrowser();
      if (outcome === 'cancel') {
        // Renoncement, pas panne.
        return;
      }
      const issue = await pollHandoff(handoff, {
        attempts: 40,
        delayMs: 1500,
        shouldStop: () => cancelled.current,
      });
      if (!issue) {
        // Absence de connexion, pas échec : on nomme les deux causes réelles côté Google.
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

  // Un fournisseur n'est proposé QUE si le serveur le dit configuré : un bouton
  // qui mène à une page d'erreur est pire qu'une absence expliquée.
  const providers: { id: ProviderId; label: string; enabled: boolean }[] = [
    { id: 'google', label: t('auth.providers.google'), enabled: config?.googleNative === true },
    { id: 'facebook', label: t('auth.providers.facebook'), enabled: config?.facebook === true },
    { id: 'apple', label: t('auth.providers.apple'), enabled: config?.apple === true },
  ];
  const offered = providers.filter((provider) => provider.enabled);

  const emailReady = EMAIL_SHAPE.test(email.trim());

  /* ── Titres selon l'étape ─────────────────────────────────────────────── */
  let heading = { title: t('auth.title'), subtitle: t('auth.subtitle') };
  if (mode === 'start') {
    heading = emailChallenge
      ? { title: t('auth.emailCode.checkInbox'), subtitle: t('auth.emailCode.sentTo', { email: emailChallenge.maskedEmail || email }) }
      : { title: t('auth.start.title'), subtitle: t('auth.start.subtitle') };
  }

  /* ── Bloc « OU » : Google, puis les autres fournisseurs configurés ────── */
  const otherWays = (
    <>
      <View style={styles.orRow}>
        <View style={[styles.orLine, { backgroundColor: theme.colors.line }]} />
        <AppText variant="caption" color={theme.colors.muted}>{t('auth.or')}</AppText>
        <View style={[styles.orLine, { backgroundColor: theme.colors.line }]} />
      </View>
      {providers.map((provider) =>
        provider.enabled ? (
          <Button
            key={provider.id}
            label={provider.label}
            tone="quiet"
            onPress={() => (provider.id === 'google' ? startGoogleNative() : startProvider(provider.id))}
            busy={waiting === provider.id}
            disabled={busy && waiting !== provider.id}
            testID={`auth-provider-${provider.id}`}
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
          <AppText variant="label" weight="bold" color={theme.status.info.fg}>{t('auth.providers.waiting')}</AppText>
          <Button
            label={t('auth.providers.cancel')}
            tone="quiet"
            onPress={() => {
              cancelled.current = true;
            }}
          />
        </>
      ) : null}
    </>
  );

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
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
          style={[styles.close, { minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget }]}
        >
          <Ionicons name="close" size={26} color={theme.colors.ink} accessibilityElementsHidden />
        </Pressable>

        <AppText variant="title">{heading.title}</AppText>
        <AppText variant="body" color={theme.colors.secondary} style={styles.intro}>{heading.subtitle}</AppText>

        {legacyServer ? (
          <View
            accessibilityRole="alert"
            style={[styles.alert, {
              backgroundColor: theme.colors.surface,
              borderColor: theme.status.danger.fg,
              borderRadius: theme.radius.card,
            }]}
          >
            <AppText variant="label" weight="bold" color={theme.status.danger.fg}>
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
            <AppText variant="label" weight="bold" color={theme.status.danger.fg}>{failure.message}</AppText>
          </View>
        ) : null}

        {/* Page d'accueil : adresse → code. */}
        {mode === 'start' && !emailChallenge ? (
          <>
            <Field
              label={t('auth.email.label')}
              accessibilityLabel={t('auth.email.label')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!busy && config?.emailCode !== false}
            />
            <Button
              label={t('auth.continue')}
              onPress={sendEmailCode}
              busy={busy}
              disabled={!emailReady || config?.emailCode === false}
              testID="auth-email-code-send"
            />
            {otherWays}
            <Button label={t('auth.start.phone')} tone="quiet" onPress={() => changeMode('phone')} disabled={busy} testID="auth-start-phone" />
            <Button label={t('auth.start.password')} tone="quiet" onPress={() => changeMode('password')} disabled={busy} testID="auth-start-password" />
          </>
        ) : null}

        {/* Étape « code » : même page, code reçu par e-mail. */}
        {mode === 'start' && emailChallenge ? (
          <>
            <AppText variant="caption" color={theme.colors.muted}>{t('auth.emailCode.spam')}</AppText>
            {emailChallenge.developmentCode ? (
              <AppText variant="caption" color={theme.status.info.fg}>
                {t('auth.emailCode.dev', { code: emailChallenge.developmentCode })}
              </AppText>
            ) : null}
            <Field
              label={t('auth.emailCode.code')}
              accessibilityLabel={t('auth.emailCode.code')}
              value={emailCode}
              onChangeText={setEmailCode}
              keyboardType="number-pad"
              maxLength={6}
              editable={!busy}
            />
            <Button label={t('auth.continue')} onPress={confirmEmailCode} busy={busy} testID="auth-email-code-verify" />
            <Button label={t('auth.emailCode.resend')} onPress={sendEmailCode} tone="quiet" disabled={busy} />
            <Button label={t('auth.emailCode.change')} onPress={session.cancelEmailCode} tone="quiet" disabled={busy} />
            {otherWays}
            <Button label={t('auth.start.password')} tone="quiet" onPress={() => changeMode('password')} disabled={busy} />
          </>
        ) : null}

        {/* Téléphone : Tunisie uniquement (le serveur ne normalise que les numéros tunisiens). */}
        {mode === 'phone' ? (
          <>
            {!challenge ? (
              <>
                <Field
                  label={t('auth.phone.country')}
                  accessibilityLabel={t('auth.phone.country')}
                  value={t('auth.phone.countryValue')}
                  editable={false}
                />
                <Field
                  label={t('auth.phone.label')}
                  accessibilityLabel={t('auth.phone.label')}
                  placeholder={t('auth.phone.placeholder')}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  editable={!busy && (config?.phoneOtp ?? true)}
                />
                <Button
                  label={t('auth.continue')}
                  onPress={sendCode}
                  busy={busy}
                  disabled={config?.phoneOtp === false}
                  testID="auth-send-code"
                />
              </>
            ) : (
              <>
                <AppText variant="caption" color={theme.colors.muted}>
                  {t('auth.phone.sent', { phone: challenge.maskedPhone || phone })}
                </AppText>
                {challenge.developmentCode ? (
                  <AppText variant="caption" color={theme.status.info.fg}>
                    {t('auth.phone.dev', { code: challenge.developmentCode })}
                  </AppText>
                ) : null}
                <Field
                  label={t('auth.phone.code')}
                  accessibilityLabel={t('auth.phone.code')}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!busy}
                />
                <Button label={t('auth.phone.verify')} onPress={confirmCode} busy={busy} testID="auth-verify-code" />
                <Button label={t('auth.phone.resend')} onPress={sendCode} tone="quiet" disabled={busy} />
                <Button label={t('auth.phone.change')} onPress={session.cancelPhoneCode} tone="quiet" disabled={busy} />
              </>
            )}
            {otherWays}
            <Button label={t('auth.start.email')} tone="quiet" onPress={() => changeMode('start')} disabled={busy} />
          </>
        ) : null}

        {/* Mot de passe : méthode en option, pour les comptes qui en ont un. */}
        {mode === 'password' ? (
          <Card title={t('auth.tabs.email')} hint={config && !config.email ? t('auth.error.unavailable') : undefined}>
            <Field
              label={t('auth.email.label')}
              accessibilityLabel={t('auth.email.label')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!busy}
            />
            <Field
              label={t('auth.password.label')}
              accessibilityLabel={t('auth.password.label')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!busy}
            />
            <Button label={t('auth.email.submit')} onPress={emailSignIn} busy={busy} testID="auth-email-submit" />
            {/* Le lien reste visible même quand la récupération est fermée :
                l'écran suivant explique POURQUOI au lieu de laisser un vide. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/forgot')}
              style={[styles.link, { minHeight: theme.geometry.minTarget }]}
            >
              <AppText variant="label" weight="bold" color={theme.colors.accentText}>
                {t('auth.forgot.link')}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => changeMode('register')}
              style={[styles.link, { minHeight: theme.geometry.minTarget }]}
            >
              <AppText variant="label" weight="bold" color={theme.colors.accentText}>
                {t('auth.start.createAccount')}
              </AppText>
            </Pressable>
            <Button label={t('auth.emailCode.useCode')} tone="quiet" onPress={() => changeMode('start')} disabled={busy} />
          </Card>
        ) : null}

        {mode === 'register' ? (
          <Card title={t('auth.tabs.register')} hint={t('auth.register.hint')}>
            <Field label={t('auth.name.label')} accessibilityLabel={t('auth.name.label')} value={name} onChangeText={setName} editable={!busy} />
            <Field
              label={t('auth.email.label')}
              accessibilityLabel={t('auth.email.label')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!busy}
            />
            <Field
              label={t('auth.password.label')}
              accessibilityLabel={t('auth.password.label')}
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
                accessibilityElementsHidden
              />
              <AppText variant="caption" style={styles.checkboxLabel}>{t('auth.marketing')}</AppText>
            </Pressable>
            <Button label={t('auth.register.submit')} onPress={register} busy={busy} testID="auth-register-submit" />
            <AppText variant="caption" color={theme.colors.muted}>{t('auth.legal')}</AppText>
            <Button label={t('auth.emailCode.useCode')} tone="quiet" onPress={() => changeMode('start')} disabled={busy} />
          </Card>
        ) : null}

        {mode === 'start' ? (
          <AppText variant="caption" color={theme.colors.muted}>
            {session.storageSecure ? t('auth.secure.keychain') : t('auth.secure.fallback')}
          </AppText>
        ) : null}

        {/* Conditions et confidentialité : toujours visibles en bas, ouvertes dans l'application. */}
        <View style={[styles.legal, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('auth.legal.terms')}
            onPress={() => { openLegalPage(`${API_BASE_URL}/terms.html`).catch(() => undefined); }}
            style={[styles.legalLink, { minHeight: theme.geometry.minTarget }]}
            testID="auth-legal-terms"
          >
            <AppText variant="caption" color={theme.colors.secondary} style={styles.legalText}>{t('auth.legal.terms')}</AppText>
          </Pressable>
          <AppText variant="caption" color={theme.colors.muted}>·</AppText>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('auth.legal.privacy')}
            onPress={() => { openLegalPage(`${API_BASE_URL}/privacy.html`).catch(() => undefined); }}
            style={[styles.legalLink, { minHeight: theme.geometry.minTarget }]}
            testID="auth-legal-privacy"
          >
            <AppText variant="caption" color={theme.colors.secondary} style={styles.legalText}>{t('auth.legal.privacy')}</AppText>
          </Pressable>
        </View>
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
  link: { justifyContent: 'center' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth },
  legal: { alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 4, paddingVertical: 8 },
  legalLink: { justifyContent: 'center', paddingHorizontal: 6 },
  legalText: { textDecorationLine: 'underline' },
});
