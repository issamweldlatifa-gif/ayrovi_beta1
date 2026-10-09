/**
 * Mot de passe oublié — demande de lien, et rien d'autre.
 *
 * Ce que cet écran fait, exactement :
 *   • il envoie l'adresse au serveur et rapporte ce que le serveur a RÉPONDU ;
 *   • un 202 veut dire « demande acceptée », jamais « e-mail remis » : la
 *     formulation le reflète, parce qu'un lien annoncé et jamais reçu ferait
 *     perdre plus de temps qu'un doute avoué ;
 *   • le serveur ne dit pas si le compte existe (protection contre
 *     l'énumération) — l'écran ne le devine donc pas non plus ;
 *   • quand l'envoi d'e-mails n'est pas configuré, le serveur répond 503 AVANT
 *     toute recherche : l'écran l'annonce et n'invite pas à réessayer en boucle.
 *
 * Le changement de mot de passe lui-même se fait sur le site : le lien envoyé
 * pointe vers ayrovi.tn et le jeton n'est valable qu'une fois, 30 minutes.
 */
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText, Button, Card, Field } from '@/design/ui';
import { startAlignFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';
import { authMessage } from '@/api/authMessages';
import { requestPasswordReset } from '@/api/account';
import { useSession } from '@/state/session';

/** Le serveur annonce ce délai dans sa réponse 202 (`retryAfterSeconds`). */
const DEFAULT_RETRY_SECONDS = 60;

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const session = useSession();

  const [email, setEmail] = useState('');
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
          accessibilityLabel={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/account'))}
          style={[styles.close, { alignItems: startAlignFor(theme.isRTL) }, { minHeight: theme.geometry.minTarget, minWidth: theme.geometry.minTarget }]}
        >
          <Ionicons name={locale === 'ar' ? 'arrow-forward' : 'arrow-back'} size={26} color={theme.colors.ink} />
        </Pressable>

        <AppText variant="title">{t('auth.forgot.title')}</AppText>
        {/* Le sous-titre promet un envoi : il disparaît quand aucun envoi n'est possible. */}
        {enabled ? (
          <AppText variant="body" color={theme.colors.secondary} style={styles.intro}>{t('auth.forgot.subtitle')}</AppText>
        ) : null}

        <Card title={t('auth.forgot.title')}>
          {/* Quand l'envoi n'est pas configuré, on ne montre NI champ NI bouton :
              un champ qui ne peut pas aboutir est un piège, pas une option. */}
          {!enabled ? (
            <>
              <AppText accessibilityRole="alert" variant="label" weight="bold" color={theme.status.danger.fg}>
                {t('auth.forgot.unavailable')}
              </AppText>
              <Button
                label={t('auth.forgot.backToSignIn')}
                tone="quiet"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/account'))}
              />
            </>
          ) : !accepted ? (
            <>
              <Field
                label={t('auth.forgot.email')}
                accessibilityLabel={t('auth.forgot.email')}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!busy}
              />
              {failure ? (
                <AppText accessibilityRole="alert" variant="label" weight="bold" color={theme.status.danger.fg}>{failure}</AppText>
              ) : null}
              <Button label={t('auth.forgot.submit')} onPress={submit} busy={busy} testID="auth-forgot-submit" />
              <AppText variant="caption" color={theme.colors.muted}>{t('auth.forgot.socialOnly')}</AppText>
            </>
          ) : (
            <>
              <AppText accessibilityRole="alert" variant="body" color={theme.status.success.fg}>
                {t('auth.forgot.accepted')}
              </AppText>
              <AppText variant="caption" color={theme.colors.muted}>{t('auth.forgot.openLink')}</AppText>
              {cooldown > 0 ? (
                <AppText variant="caption" color={theme.colors.muted}>
                  {t('auth.forgot.retryIn', { seconds: cooldown })}
                </AppText>
              ) : (
                <Button label={t('auth.forgot.resend')} onPress={submit} tone="quiet" busy={busy} />
              )}
            </>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 16, gap: 12 },
  close: { alignItems: 'flex-start', justifyContent: 'center' },
  intro: { marginBottom: 4 },
});
