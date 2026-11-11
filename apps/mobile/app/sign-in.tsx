/**
 * Écran de connexion — moudal fort, noir et blanc, façon Zalando (10/11/2026).
 *
 * Parcours demandé par le propriétaire (captures Zalando à l'appui) :
 *   • adresse e-mail → le serveur dit si le compte EXISTE :
 *       – connu  → formulaire « mot de passe » (+ code par e-mail en option,
 *                  + mot de passe oublié) ;
 *       – inconnu → inscription : mot de passe, prénom et nom de famille ;
 *   • les fournisseurs restent des pastilles contour AVEC leur marque
 *     (Google/Facebook/Apple), mais le serveur seul décide qui est cliquable ;
 *   • récupération : écran dédié `/forgot` (lien de réinitialisation).
 *
 * Règles tenues par cet écran :
 *   • tout est encre sur canvas — AUCUN violet ici (demande explicite) ;
 *   • les lignes « pas encore activé », « même compte que le site »,
 *     « trousseau », le téléphone et la case marketing ont été RETIRÉES :
 *     la page ne montre que ce qui agit ;
 *   • il ne propose QUE ce que le serveur sait faire (`/auth/config`) ;
 *   • chaque échec affiche la raison réelle, dans la langue de l'utilisateur ;
 *   • en développement, quand aucun e-mail n'est configuré, le serveur renvoie
 *     le code — on l'affiche tel quel plutôt que de laisser bloqué.
 */
import { useEffect, useRef, useState } from 'react';
import { goBack } from '@/design/navigation';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoider } from '@/design/keyboard';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useResponsive } from '@/design/layout';
import { useI18n } from '@/i18n';
import { authMessage, type AuthMessageKey } from '@/api/authMessages';
import { fetchServerReadiness, mobileSessionSupport } from '@/api/public';
import { lookupEmail } from '@/api/account';
import {
  googleNativeLogin, newHandoffCode, pollHandoff, providerDoneUrl, providerStartUrl, type ProviderId,
} from '@/api/providers';
import { closeProviderBrowser, openProviderSession } from '@/features/auth/browser';
import { useRememberedAccount, type LastAccount } from '@/features/auth/lastAccount';
import { GoogleLogo } from '@/design/GoogleLogo';
import { FacebookLogo } from '@/design/FacebookLogo';
import { AppleLogo } from '@/design/AppleLogo';
import { BrandWordmark } from '@/design/BrandMark';
import { AuthField } from '@/features/auth/AuthField';
import { RADIUS } from '@/design/tokens.mobile';
import { LoadingSpinner } from '@/design/LoadingSpinner';
import { useSession } from '@/state/session';
import { signInWithGoogleNative, googleFailureCode, googleFailureDetail } from '@/features/auth/googleNative';

/** « start » = adresse e-mail ; la suite dépend de l'existence du compte. */
type Mode = 'start' | 'password' | 'register';

/** Délai avant un nouveau code (référence Zalando : compte à rebours visible). */
const RESEND_SECONDS = 60;

/** Forme minimale d'une adresse : le serveur fait foi, ceci évite un aller-retour inutile. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

/**
 * Filet de sécurité de l'écran : si le rendu lève, expo-router affiche le repli
 * (arabe + français, bouton « عاود ») à la place de l'écran — l'application
 * reste ouverte, l'utilisateur peut revenir. Voir `src/design/AppErrorBoundary.tsx`
 * et la cause du 25/10/2026 (ordre des hooks). Toute route en a un : c'est
 * vérifié par `tests/error-boundary-coverage.test.ts`.
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function SignInScreen() {
  const theme = useTheme();
  const { gutter } = useResponsive();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const session = useSession();

  const [mode, setMode] = useState<Mode>('start');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<ProviderId | null>(null);
  const [failure, setFailure] = useState<{ message: string; hint?: string } | null>(null);
  const [resendIn, setResendIn] = useState(0);
  // « Se connecter autrement » : affiche le formulaire complet même si un compte est mémorisé.
  const [otherWaysOpen, setOtherWaysOpen] = useState(false);
  const remembered = useRememberedAccount();

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

  const startGoogleNative = async (silent: boolean) => {
    setFailure(null);
    setBusy(true);
    setWaiting('google');
    try {
      let outcome = await signInWithGoogleNative({ silent });
      if (outcome.kind === 'none') outcome = await signInWithGoogleNative({ silent: false });
      if (outcome.kind !== 'token') return;
      const issue = await googleNativeLogin(outcome.idToken);
      await session.adoptSession(issue);
      if (outcome.email) {
        await remembered.remember({ provider: 'google', email: outcome.email, name: outcome.name });
      }
      closeIfSignedIn();
    } catch (error) {
      const kind = googleFailureCode(error);
      if (kind === 'play') setFailure({ message: t('auth.google.noPlayServices') });
      else if (kind === 'config') setFailure({ message: `${t('auth.google.config')} (${googleFailureDetail(error)})` });
      else show(error, 'auth.google.failed');
    } finally {
      setWaiting(null);
      setBusy(false);
    }
  };

  const closeIfSignedIn = () => goBack('/(tabs)/account');

  /* ── Connexion par code e-mail (option « Recevoir un code ») ──────────── */

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
    await remembered.remember({ provider: 'email', email: email.trim() });
    closeIfSignedIn();
  }, 'auth.emailCode.invalid');

  /* ── Mot de passe et inscription (selon l'existence du compte) ────────── */

  const emailSignIn = () => run(async () => {
    await session.signInWithEmail(email.trim(), password);
    closeIfSignedIn();
  }, 'auth.error.credentials');

  const register = () => run(async () => {
    await session.signUpWithEmail({
      displayName: `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, ' ').trim(),
      email: email.trim(),
      password,
      locale,
      marketingOptIn: false,
    });
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

  /** L'adresse décide de la suite : connue ⇒ mot de passe, inconnue ⇒ inscription. */
  const continueWithEmail = () => run(async () => {
    const clean = email.trim();
    if (!EMAIL_SHAPE.test(clean)) {
      setFailure({ message: t('auth.emailCode.invalidAddress') });
      return;
    }
    const { registered } = await lookupEmail(clean);
    setPassword('');
    setMode(registered ? 'password' : 'register');
  }, 'auth.error.unavailable');

  const backToAddress = () => {
    setFailure(null);
    setEmailCode('');
    setPassword('');
    setMode('start');
  };

  /* ── Compte à rebours du renvoi de code (référence Zalando « (60) ») ──── */

  useEffect(() => {
    if (!emailChallenge) {
      setResendIn(0);
      return;
    }
    setResendIn(RESEND_SECONDS);
  }, [emailChallenge?.challengeId]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((value) => (value <= 1 ? 0 : value - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  /* ── Titres selon l'étape ─────────────────────────────────────────────── */
  // Le code reçu par e-mail prend le dessus sur TOUT mode : c'est lui la preuve.
  let heading = { title: t('auth.title'), subtitle: t('auth.subtitle') };
  if (emailChallenge) {
    heading = { title: t('auth.emailCode.checkInbox'), subtitle: t('auth.emailCode.sentTo', { email: emailChallenge.maskedEmail || email }) };
  } else if (mode === 'start') {
    heading = { title: t('auth.start.title'), subtitle: '' };
  } else if (mode === 'register') {
    heading = { title: t('auth.register.title'), subtitle: '' };
  } else if (mode === 'password') {
    heading = { title: t('auth.title'), subtitle: '' };
  }

  // Un compte mémorisé n'est proposé que si le serveur accepte encore sa méthode.
  const rememberedUsable = (account: LastAccount | null): boolean => {
    if (!account) return false;
    if (account.provider === 'google') return config?.googleNative === true;
    return config?.emailCode !== false;
  };
  const shownAccount = remembered.ready && rememberedUsable(remembered.account) && !otherWaysOpen && !emailChallenge
    ? remembered.account
    : null;

  // L'attente se voit sur le compte mémorisé seulement si c'est lui qui l'a lancée.
  const rememberedSpinning = shownAccount?.provider === 'google' ? waiting === 'google' : busy;

  /** Un clic sur le compte mémorisé : Google silencieux, ou code envoyé à cette adresse. */
  const continueWithRemembered = (account: LastAccount) => {
    if (account.provider === 'google') {
      void startGoogleNative(true);
      return;
    }
    setEmail(account.email);
    void run(async () => {
      setEmailCode('');
      await session.requestEmailCode(account.email, locale);
    }, 'auth.error.unavailable');
  };

  const emailReady = EMAIL_SHAPE.test(email.trim());
  // La page d'accueil reste ouverte tant qu'UNE méthode e-mail existe.
  const emailPathOpen = config?.email !== false || config?.emailCode !== false;
  const passwordOpen = config?.email !== false;
  const codeOpen = config?.emailCode !== false;

  /**
   * Mentions dans le paragraphe (référence Zalando) : liens soulignés ENCRE,
   * ouverts DANS l'application — les mêmes pages que la rangée du bas.
   */
  const termsParagraph = (
    <AppText variant="caption" color={theme.colors.secondary} style={styles.terms}>
      {t('auth.terms.before')}{' '}
      <AppText
        variant="caption"
        color={theme.colors.ink}
        style={styles.termsLink}
        accessibilityRole="link"
        onPress={() => router.push('/legal/terms')}
      >
        {t('auth.legal.terms')}
      </AppText>
      {t('auth.terms.middle')}{' '}
      <AppText
        variant="caption"
        color={theme.colors.ink}
        style={styles.termsLink}
        accessibilityRole="link"
        onPress={() => router.push('/legal/privacy')}
      >
        {t('auth.legal.privacy')}
      </AppText>
      {t('auth.terms.after')}
    </AppText>
  );

  /** Champ e-mail « encoché » : étiquette dans sa boîte, corps sans bordure haute. */
  const boxedEmailField = (options: { editable: boolean; onEdit?: () => void } = { editable: true }) => (
    <View testID="auth-boxed-email">
      <View style={[styles.boxTopRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
        <View style={[styles.boxLabel, { backgroundColor: theme.colors.canvas }]}>
          <AppText variant="caption" color={theme.colors.muted}>{t('auth.email.label')}</AppText>
        </View>
        <View style={[styles.boxTopLine, { borderTopColor: theme.colors.ink }]} />
      </View>
      <View
        style={[styles.boxBody, {
          borderBottomColor: theme.colors.ink,
          borderLeftColor: theme.colors.ink,
          borderRightColor: theme.colors.ink,
          flexDirection: rowDirectionFor(theme.isRTL),
        }]}
      >
        <TextInput
          accessibilityLabel={t('auth.email.label')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          editable={options.editable && !busy}
          placeholderTextColor={theme.colors.muted}
          selectionColor={theme.colors.ink}
          cursorColor={theme.colors.ink}
          style={[
            theme.text('body'),
            styles.boxInput,
            { color: options.editable ? theme.colors.ink : theme.colors.muted, flex: 1 },
            theme.isRTL ? { textAlign: 'right' } : null,
          ]}
        />
        {options.onEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.edit')}
            onPress={options.onEdit}
            testID="auth-email-edit"
            style={styles.boxAction}
          >
            <AppText variant="label" color={theme.colors.ink} style={styles.termsLink}>{t('auth.edit')}</AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  /**
   * Pastilles sociales façon Zalando : contour encre, marque du tiers DEVANT
   * le libellé. Une méthode que le serveur n'a pas activée reste VISIBLE mais
   * non cliquable — sans ligne d'explication permanente (retirée, demande du
   * 10/11) : l'échec, lui, reste expliqué au moment où il arrive.
   */
  const providers: { id: ProviderId; label: string; enabled: boolean }[] = [
    { id: 'google', label: t('auth.providers.google'), enabled: config?.googleNative === true },
    { id: 'facebook', label: t('auth.providers.facebook'), enabled: config?.facebook === true },
    { id: 'apple', label: t('auth.providers.apple'), enabled: config?.apple === true },
  ];
  const socialStack = (
    <>
      {providers.map((provider) => (
        <Button
          key={provider.id}
          label={provider.label}
          tone="quiet"
          onPress={() => (provider.id === 'google' ? startGoogleNative(false) : startProvider(provider.id))}
          leading={
            provider.id === 'google' ? <GoogleLogo size={20} />
              : provider.id === 'facebook' ? <FacebookLogo size={20} />
                : <AppleLogo size={20} />
          }
          busy={waiting === provider.id}
          disabled={!provider.enabled || (busy && waiting !== provider.id)}
          testID={`auth-provider-${provider.id}`}
        />
      ))}
      {/* Attente « navigateur » : réservée aux fournisseurs ouverts dans un onglet.
          Google natif affiche son propre sélecteur : pas de texte d'attente ici. */}
      {waiting && waiting !== 'google' ? (
        <>
          <AppText variant="label" color={theme.colors.ink}>{t('auth.providers.waiting')}</AppText>
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

  /** Les six boîtes du code (référence Zalando) : saisie chiffre par chiffre. */
  const codeBoxes = (
    <CodeBoxes
      value={emailCode}
      onChange={setEmailCode}
      disabled={busy}
      label={t('auth.emailCode.code')}
    />
  );

  return (
    <KeyboardAvoider
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
    >
      <ScrollView
        contentContainerStyle={[
          styles.screen,
          { paddingHorizontal: gutter },
          { paddingTop: insets.top + theme.space[2], paddingBottom: insets.bottom + theme.space[5] },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => goBack('/')}
          style={[styles.close, { minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget }]}
        >
          <Ionicons name="close" size={theme.iconSize.md} color={theme.colors.ink} accessibilityElementsHidden />
        </Pressable>

        {/* Marque posée en tête sur TOUTES les étapes (référence Zalando). */}
        <View style={styles.brandMark}>
          <BrandWordmark height={25} color={theme.colors.ink} />
        </View>

        <AppText variant="h1">{heading.title}</AppText>
        {heading.subtitle ? (
          <AppText variant="body" color={theme.colors.secondary} style={styles.intro}>{heading.subtitle}</AppText>
        ) : null}

        {legacyServer ? (
          <View
            accessibilityRole="alert"
            style={[styles.alert, {
              backgroundColor: theme.colors.surface,
              borderColor: theme.status.danger.fg,
              borderRadius: theme.radius.card,
            }]}
          >
            <AppText variant="label" color={theme.status.danger.fg}>
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
            <AppText variant="label" color={theme.status.danger.fg}>{failure.message}</AppText>
          </View>
        ) : null}

        {/* Compte mémorisé : le geste le plus court (référence « Hi Essam »). */}
        {shownAccount ? (
          <>
            <RememberedAccountButton
              account={shownAccount}
              label={t('auth.remembered.continue')}
              busy={rememberedSpinning}
              disabled={busy && !rememberedSpinning}
              onPress={() => continueWithRemembered(shownAccount)}
            />
            <Button
              label={t('auth.remembered.another')}
              tone="quiet"
              onPress={() => setOtherWaysOpen(true)}
              disabled={busy}
              testID="auth-remembered-other"
            />
          </>
        ) : null}

        {/* Page d'accueil : adresse → le serveur dit connu ou inconnu. */}
        {mode === 'start' && !emailChallenge && !shownAccount ? (
          <>
            {boxedEmailField({ editable: true })}
            <Button
              label={t('auth.continue')}
              tone="solid"
              onPress={continueWithEmail}
              busy={busy && waiting === null}
              disabled={busy || !emailReady || !emailPathOpen}
              testID="auth-email-continue"
            />
            {termsParagraph}
            {socialStack}
          </>
        ) : null}

        {/* Adresse connue : mot de passe, code en option, récupération. */}
        {mode === 'password' && !emailChallenge ? (
          <>
            {boxedEmailField({ editable: false, onEdit: backToAddress })}
            <AuthField
              label={t('auth.password.label')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!reveal}
              autoComplete="current-password"
              editable={!busy}
              testID="auth-password-field"
              trailing={{
                label: reveal ? t('auth.password.hide') : t('auth.password.reveal'),
                onPress: () => setReveal((value) => !value),
                testID: 'auth-password-reveal',
              }}
            />
            <Button
              label={t('auth.title')}
              tone="solid"
              onPress={emailSignIn}
              busy={busy && waiting === null}
              disabled={busy || !passwordOpen || password.length < 8}
              testID="auth-email-submit"
            />
            <Button
              label={t('auth.code.login')}
              tone="quiet"
              onPress={sendEmailCode}
              disabled={busy || !codeOpen}
              testID="auth-email-code-send"
            />
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/forgot', params: { email: email.trim() } as never })}
              style={[styles.forgotLink, { minHeight: theme.geometry.minTarget }]}
              testID="auth-forgot-link"
            >
              <AppText variant="label" color={theme.colors.ink} style={styles.termsLink}>
                {t('auth.forgot.link')}
              </AppText>
            </Pressable>
          </>
        ) : null}

        {/* Adresse inconnue : inscription — mot de passe, prénom, nom (référence Zalando). */}
        {mode === 'register' ? (
          <>
            {boxedEmailField({ editable: false, onEdit: backToAddress })}
            <AuthField
              label={t('auth.password.label')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!reveal}
              autoComplete="new-password"
              editable={!busy}
              testID="auth-register-password"
              trailing={{
                label: reveal ? t('auth.password.hide') : t('auth.password.reveal'),
                onPress: () => setReveal((value) => !value),
                testID: 'auth-password-reveal',
              }}
            />
            <AppText variant="caption" color={theme.colors.secondary}>{t('auth.password.hint')}</AppText>
            <AuthField
              label={t('auth.firstName.label')}
              value={firstName}
              onChangeText={setFirstName}
              autoComplete="given-name"
              editable={!busy}
              testID="auth-register-first-name"
            />
            <AuthField
              label={t('auth.lastName.label')}
              value={lastName}
              onChangeText={setLastName}
              autoComplete="family-name"
              editable={!busy}
              testID="auth-register-last-name"
            />
            {termsParagraph}
            <Button
              label={t('auth.register.submit')}
              tone="solid"
              onPress={register}
              busy={busy && waiting === null}
              disabled={busy || password.length < 8 || !firstName.trim() || !lastName.trim()}
              testID="auth-register-submit"
            />
          </>
        ) : null}

        {/* Étape « code » : six boîtes, renvoi compte à rebours, autre compte.
            Elle prend le dessus sur tout mode — le code est LA preuve. */}
        {emailChallenge ? (
          <>
            {emailChallenge.developmentCode ? (
              <AppText variant="caption" color={theme.colors.ink}>
                {t('auth.emailCode.dev', { code: emailChallenge.developmentCode })}
              </AppText>
            ) : null}
            {codeBoxes}
            <Button
              label={t('auth.continue')}
              tone="solid"
              onPress={confirmEmailCode}
              busy={busy && waiting === null}
              disabled={busy || emailCode.length !== 6}
              testID="auth-email-code-verify"
            />
            <AppText variant="caption" color={theme.colors.secondary}>
              {t('auth.emailCode.noCode')} {t('auth.emailCode.spam')}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || resendIn > 0 }}
              onPress={sendEmailCode}
              disabled={busy || resendIn > 0}
              style={[styles.forgotLink, { minHeight: theme.geometry.minTarget }]}
              testID="auth-email-code-resend"
            >
              <AppText
                variant="label"
                color={busy || resendIn > 0 ? theme.colors.muted : theme.colors.ink}
                style={styles.termsLink}
              >
                {resendIn > 0
                  ? `${t('auth.emailCode.resend')} (${resendIn})`
                  : t('auth.emailCode.resend')}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => { session.cancelEmailCode(); backToAddress(); }}
              style={[styles.forgotLink, { minHeight: theme.geometry.minTarget }]}
              testID="auth-email-another"
            >
              <AppText variant="label" color={theme.colors.ink} style={styles.termsLink}>
                {t('auth.emailCode.another')}
              </AppText>
            </Pressable>
          </>
        ) : null}

        {/* Conditions et confidentialité : toujours visibles en bas, ouvertes dans l'application. */}
        <View style={[styles.legal, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('auth.legal.terms')}
            onPress={() => { router.push('/legal/terms'); }}
            style={[styles.legalLink, { minHeight: theme.geometry.minTarget }]}
            testID="auth-legal-terms"
          >
            <AppText variant="caption" color={theme.colors.ink} style={styles.legalText}>{t('auth.legal.terms')}</AppText>
          </Pressable>
          <AppText variant="caption" color={theme.colors.muted}>·</AppText>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('auth.legal.privacy')}
            onPress={() => { router.push('/legal/privacy'); }}
            style={[styles.legalLink, { minHeight: theme.geometry.minTarget }]}
            testID="auth-legal-privacy"
          >
            <AppText variant="caption" color={theme.colors.ink} style={styles.legalText}>{t('auth.legal.privacy')}</AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  // La marque tête de page s'aligne sur le titre (pas de centrage flottant).
  brandMark: { alignItems: 'flex-start' },
  // Paragraphe légal : liens encre soulignés.
  terms: { marginTop: 4 },
  termsLink: { textDecorationLine: 'underline' },
  // Champ « encoché » : l'étiquette coupe la bordure haute, sans superposition.
  boxTopRow: { alignItems: 'flex-end' },
  boxLabel: {
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: RADIUS.sm,
    borderTopRightRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingBottom: 2,
  },
  boxTopLine: { flex: 1, borderTopWidth: 1.5 },
  boxBody: {
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderBottomLeftRadius: RADIUS.sm,
    borderBottomRightRadius: RADIUS.sm,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  boxInput: { padding: 0, backgroundColor: 'transparent', borderWidth: 0 },
  boxAction: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  // Lien « Mot de passe oublié ? » aligné sur le texte, zone 44.
  forgotLink: { alignItems: 'flex-start', justifyContent: 'center' },
  alert: { borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  close: { alignItems: 'flex-start', justifyContent: 'center' },
  intro: { marginBottom: 4 },
  legal: { alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 4, paddingVertical: 8 },
  legalLink: { justifyContent: 'center', paddingHorizontal: 6 },
  legalText: { textDecorationLine: 'underline' },
  remembered: { alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, overflow: 'hidden' },
  avatar: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  rememberedText: { flex: 1, alignItems: 'flex-start', gap: 2 },
  emailRow: { alignItems: 'center', gap: 6 },
});

/**
 * Les six boîtes du code : une saisie chiffre par chiffre, l'ordre de frappe
 * reste gauche → droite même en arabe (un code n'a pas de direction). Le
 * retour arrière d'une boîte vide rend la main à la précédente.
 */
function CodeBoxes({ value, onChange, disabled, label }: {
  value: string; onChange: (next: string) => void; disabled: boolean; label: string;
}) {
  const theme = useTheme();
  const refs = useRef<Array<TextInput | null>>([]);
  const digits = Array.from({ length: 6 }, (_, index) => value.charAt(index));
  const setDigit = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = (value.slice(0, index) + digit + value.slice(index + 1)).slice(0, 6);
    onChange(next);
    if (digit && index < 5) refs.current[index + 1]?.focus();
  };
  return (
    <View
      testID="auth-code-boxes"
      style={{ flexDirection: theme.isRTL ? 'row-reverse' : 'row', gap: 8, justifyContent: 'center' }}
    >
      {digits.map((digit, index) => (
        <TextInput
          key={index}
          ref={(input) => { refs.current[index] = input; }}
          value={digit}
          onChangeText={(raw) => {
            if (!raw) {
              // Retour arrière : on vide la boîte et on rend la main à la précédente.
              onChange(value.slice(0, index) + value.slice(index + 1));
              if (index > 0) refs.current[index - 1]?.focus();
              return;
            }
            setDigit(index, raw);
          }}
          keyboardType="number-pad"
          maxLength={1}
          editable={!disabled}
          accessibilityLabel={`${label} ${index + 1}`}
          testID={`auth-code-box-${index}`}
          selectionColor={theme.colors.ink}
          cursorColor={theme.colors.ink}
          style={[
            theme.text('h3'),
            {
              flex: 1,
              minHeight: 56,
              borderWidth: 1.5,
              borderRadius: RADIUS.sm,
              borderColor: theme.colors.ink,
              textAlign: 'center',
              color: theme.colors.ink,
              backgroundColor: theme.colors.canvas,
              padding: 0,
            },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * « Continuer avec ce compte » : le dernier compte de l'appareil — encre
 * pleine désormais (aucun violet sur ces écrans, demande du 10/11).
 */
function RememberedAccountButton({ account, label, busy, disabled, onPress }: {
  account: LastAccount;
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const initial = (account.provider === 'google' && account.name ? account.name : account.email).trim().charAt(0).toUpperCase();
  const blocked = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${account.email}`}
      accessibilityState={{ disabled: blocked, busy }}
      disabled={blocked}
      onPress={onPress}
      testID="auth-remembered-account"
      style={({ pressed }) => [
        styles.remembered,
        {
          minHeight: theme.geometry.controlHeight,
          borderRadius: theme.radius.cta,
          backgroundColor: pressed ? theme.colors.secondary : theme.colors.ink,
          flexDirection: rowDirectionFor(theme.isRTL),
          opacity: disabled && !busy ? theme.opacity.disabled : 1,
        },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: theme.colors.canvas }]}>
        <AppText variant="label" color={theme.colors.ink}>{initial}</AppText>
      </View>
      <View style={styles.rememberedText}>
        <AppText variant="label" color={theme.colors.canvas}>{label}</AppText>
        <View style={[styles.emailRow, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
          {account.provider === 'google' ? <GoogleLogo size={14} /> : null}
          <AppText variant="caption" color={theme.colors.canvas}>{account.email}</AppText>
        </View>
      </View>
      {busy ? <LoadingSpinner size="sm" color={theme.colors.canvas} testID="auth-remembered-busy" /> : null}
    </Pressable>
  );
}
