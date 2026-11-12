import { BackButton } from '@/design/BackButton';
/**
 * Mot de passe oublié — référence Zalando, noir et blanc (10/11/2026).
 *
 * Deux temps, comme la capture :
 *   1. « Réinitialiser le mot de passe » : l'adresse liée au compte, un bouton
 *      encre « Recevoir le lien », retour à la connexion souligné ;
 *   2. la confirmation : encadré gris à coche noire, conseils numérotés
 *      (courriers indésirables, adresse, délai), renvoi avec compte à
 *      rebours, retour à la connexion.
 *
 * Ce que cet écran continue de garantir :
 *   • un 202 veut dire « demande acceptée », jamais « e-mail remis » : la
 *     formulation le reflète, parce qu'un lien annoncé et jamais reçu ferait
 *     perdre plus de temps qu'un doute avoué ;
 *   • le serveur ne dit pas si le compte existe (protection contre
 *     l'énumération) — l'écran ne le devine pas non plus, LUI ;
 *   • quand l'envoi d'e-mails n'est pas configuré, le serveur répond 503 AVANT
 *     toute recherche : l'écran l'annonce et n'invite pas à réessayer en boucle.
 *
 * 12/11/2026 : même cadre que la connexion (`AuthLayout` — titre à la bonne
 * taille sur une ligne, marges 16, colonne bornée sur tablette), bouton de
 * 48 pt, et l'adresse invalide signalée SOUS le champ.
 *
 * Le changement de mot de passe lui-même se fait sur le site : le lien envoyé
 * pointe vers ayrovi.tn et le jeton n'est valable qu'une fois, 30 minutes.
 */
import { useEffect, useState } from 'react';
import { goBack } from '@/design/navigation';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { authMessage } from '@/api/authMessages';
import { requestPasswordReset } from '@/api/account';
import { useSession } from '@/state/session';
import { AuthField } from '@/features/auth/AuthField';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { rowDirectionFor } from '@/design/layoutLogic';
import { RADIUS } from '@/design/tokens.mobile';

/** Le serveur annonce ce délai dans sa réponse 202 (`retryAfterSeconds`). */
const DEFAULT_RETRY_SECONDS = 60;

/**
 * Filet de sécurité de l'écran : si le rendu lève, expo-router affiche le repli
 * (arabe + français, bouton « عاود ») à la place de l'écran — l'application
 * reste ouverte, l'utilisateur peut revenir. Voir `src/design/AppErrorBoundary.tsx`
 * et la cause du 25/10/2026 (ordre des hooks). Toute route en a un : c'est
 * vérifié par `tests/error-boundary-coverage.test.ts`.
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const session = useSession();
  // L'adresse peut arriver pré-remplie depuis l'écran de connexion (Modifier y renvoie).
  const params = useLocalSearchParams<{ email?: string }>();
  const initialEmail = typeof params.email === 'string' ? params.email : '';

  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [failure, setFailure] = useState('');

  // `passwordReset` absent = serveur trop ancien pour répondre : on n'invente
  // pas une disponibilité, on laisse l'utilisateur essayer et lire la réponse.
  const enabled = session.authConfig?.passwordReset ?? true;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => (value <= 1 ? 0 : value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const submit = async () => {
    const clean = email.trim();
    // Refus local d'abord : une adresse manifestement fausse ne doit pas
    // consommer un quota d'envoi (3 par adresse / 15 min côté serveur).
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(clean)) {
      setFailure(t('auth.forgot.badEmail'));
      return;
    }
    setBusy(true);
    setFailure('');
    try {
      await requestPasswordReset(clean, locale);
      setAccepted(true);
      setCooldown(DEFAULT_RETRY_SECONDS);
    } catch (error) {
      const message = authMessage(error, 'auth.forgot.badEmail');
      setFailure('key' in message ? t(message.key) : message[locale]);
    } finally {
      setBusy(false);
    }
  };

  const backToSignIn = () => goBack('/(tabs)/account');

  return (
    <AuthLayout
      title={t('auth.forgot.title')}
      top={<BackButton onPress={backToSignIn} label={t('common.back')} color={theme.colors.ink} />}
      testID="auth-forgot"
    >
      {/* Quand l'envoi n'est pas configuré, on ne montre NI champ NI bouton :
          un champ qui ne peut pas aboutir est un piège, pas une option. */}
      {!enabled ? (
        <>
          <AppText accessibilityRole="alert" variant="label" color={theme.status.danger.fg}>
            {t('auth.forgot.unavailable')}
          </AppText>
          <Button label={t('auth.forgot.backToSignIn')} tone="quiet" size="lg" onPress={backToSignIn} />
        </>
      ) : !accepted ? (
        <>
          <AppText variant="body" color={theme.colors.secondary}>
            {t('auth.forgot.subtitle')}
          </AppText>
          <AuthField
            label={t('auth.email.label')}
            value={email}
            onChangeText={(next) => { setEmail(next); if (failure) setFailure(''); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={submit}
            editable={!busy}
            error={failure || null}
            testID="auth-forgot-email"
          />
          <Button label={t('auth.forgot.submit')} tone="solid" size="lg" onPress={submit} busy={busy} testID="auth-forgot-submit" />
          <Pressable
            accessibilityRole="link"
            onPress={backToSignIn}
            style={[styles.backLink, { minHeight: theme.geometry.minTarget, alignItems: theme.isRTL ? 'flex-end' : 'flex-start' }]}
            testID="auth-forgot-back"
          >
            <AppText variant="label" color={theme.colors.ink} style={styles.underlined}>
              {t('auth.forgot.backToSignIn')}
            </AppText>
          </Pressable>
        </>
      ) : (
        <>
          {/* Encadré gris à coche noire (référence Zalando). */}
          <View
            accessibilityRole="alert"
            testID="auth-forgot-sent"
            style={[styles.sentBox, {
              backgroundColor: theme.colors.disabled,
              flexDirection: rowDirectionFor(theme.isRTL),
              borderRadius: RADIUS.sm,
            }]}
          >
            <Ionicons
              name="checkmark-circle"
              size={theme.iconSize.md}
              color={theme.colors.ink}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <AppText variant="body" color={theme.colors.ink} style={styles.sentText}>
              {t('auth.forgot.sentTo', { email: email.trim() })}
            </AppText>
          </View>

          <AppText variant="body" color={theme.colors.ink}>{t('auth.forgot.noEmail')}</AppText>
          <View style={styles.tips}>
            <AppText variant="body" color={theme.colors.ink}>{t('auth.forgot.tip1')}</AppText>
            <AppText variant="body" color={theme.colors.ink}>{t('auth.forgot.tip2')}</AppText>
            <AppText variant="body" color={theme.colors.ink}>{t('auth.forgot.tip3')}</AppText>
          </View>

          {failure ? (
            <AppText accessibilityRole="alert" variant="label" color={theme.status.danger.fg}>{failure}</AppText>
          ) : null}
          {/* Même hauteur pour le compte à rebours et pour le lien : rien ne
              saute quand le renvoi redevient possible. */}
          {cooldown > 0 ? (
            <View style={[styles.backLink, { minHeight: theme.geometry.minTarget, alignItems: theme.isRTL ? 'flex-end' : 'flex-start' }]}>
              <AppText variant="caption" color={theme.colors.muted}>
                {t('auth.forgot.retryIn', { seconds: cooldown })}
              </AppText>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={submit}
              disabled={busy}
              style={[styles.backLink, { minHeight: theme.geometry.minTarget, alignItems: theme.isRTL ? 'flex-end' : 'flex-start' }]}
              testID="auth-forgot-resend"
            >
              <AppText variant="label" color={theme.colors.ink} style={styles.underlined}>
                {t('auth.forgot.resend')}
              </AppText>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="link"
            onPress={backToSignIn}
            style={[styles.backLink, { minHeight: theme.geometry.minTarget, alignItems: theme.isRTL ? 'flex-end' : 'flex-start' }]}
            testID="auth-forgot-back"
          >
            <AppText variant="label" color={theme.colors.ink} style={styles.underlined}>
              {t('auth.forgot.backToSignIn')}
            </AppText>
          </Pressable>
        </>
      )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  backLink: { justifyContent: 'center' },
  underlined: { textDecorationLine: 'underline' },
  sentBox: { alignItems: 'center', gap: 12, padding: 16 },
  sentText: { flex: 1 },
  tips: { gap: 4 },
});
