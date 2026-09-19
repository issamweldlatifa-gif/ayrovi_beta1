import React, { useEffect, useState } from 'react';
import { Button } from '../design/Button';
import { Field, Input } from '../design/ui/Field';
import { ArrowLeft, Eye, EyeOff, Loader2, CheckCircle2 } from './QatafoIcons';
import { useLocale } from '../i18n/LocaleContext';
import { customerApi } from '../customer/api';

/** Same mobile DS as sign-in. No fake success: accepted request != delivery confirmation. */
export function CustomerPasswordRecovery({ reset = false, onBack, initialEmail = '' }: { reset?: boolean; onBack?: () => void; initialEmail?: string }) {
  const { tr, isArabic, direction } = useLocale();
  const [token, setToken] = useState(() => reset ? new URLSearchParams(window.location.hash.slice(1)).get('token') || '' : '');
  const [mode, setMode] = useState<'request' | 'reset'>(reset ? 'reset' : 'request');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(reset);
  const [valid, setValid] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const locale = isArabic ? 'ar' : 'fr';
  const back = onBack || (() => window.location.assign('/?customerAuth=login'));
  useEffect(() => {
    if (reset) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [reset]);
  useEffect(() => {
    if (mode !== 'request') return;
    let cancelled = false;
    setAvailable(null); setConfigFailed(false);
    customerApi<any>('/api/customer/auth/config').then(result => {
      if (!cancelled) setAvailable(Boolean(result.data.passwordReset?.enabled));
    }).catch(() => { if (!cancelled) { setAvailable(false); setConfigFailed(true); } });
    return () => { cancelled = true; };
  }, [mode, retry]);
  useEffect(() => {
    if (mode !== 'reset' || done) return;
    let cancelled = false;
    setChecking(true); setError('');
    customerApi('/api/customer/auth/password/check', { method: 'POST', body: JSON.stringify({ token, locale }) })
      .then(() => { if (!cancelled) setValid(true); })
      .catch((reason: Error) => { if (!cancelled) { setValid(false); setError(reason.message); } })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [mode, locale, token, done]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown > 0]);
  const requestLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || cooldown || !available) return;
    setBusy(true); setError(''); setAccepted(false);
    try {
      await customerApi('/api/customer/auth/password/request', { method: 'POST', body: JSON.stringify({ email: email.trim(), locale }) });
      setAccepted(true); setCooldown(60);
    } catch (reason: any) { setError(reason.message); }
    finally { setBusy(false); }
  };
  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !valid) return;
    if (password !== confirm) { setError(tr('Les mots de passe ne correspondent pas.', 'كلمتا المرور غير متطابقتين.')); return; }
    setBusy(true); setError('');
    try {
      await customerApi('/api/customer/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, password, locale }) });
      setDone(true); setToken(''); setPassword(''); setConfirm(''); setVisible(false);
    } catch (reason: any) { setError(reason.message); if (reason.code === 'RESET_LINK_INVALID') setValid(false); }
    finally { setBusy(false); }
  };
  const requestNew = () => { setMode('request'); setError(''); setAccepted(false); setPassword(''); setConfirm(''); setVisible(false); setToken(''); };
  return <div className="ay-auth min-h-screen" dir={direction}>
    <div className="ay-auth__container"><div className="ay-auth__main">
      <header className="ay-auth__hero">
        <div className="ay-auth__header">
          <Button variant="ghost" size="icon" onClick={back} disabled={busy} aria-label={tr('Retour à la connexion', 'العودة لتسجيل الدخول')}><ArrowLeft className={`h-5 w-5 ${isArabic ? 'rotate-180' : ''}`} aria-hidden /></Button>
          <div className="ay-auth__brand" dir="ltr"><img src="/media/logo-ayrovi.png" alt="" width={32} height={32} className="ay-auth__logo" /><span>AYROVI</span></div><span aria-hidden />
        </div>
        <div className="ay-auth__intro">
          <h1>{done ? tr('C’est fait !', 'تم بنجاح!') : mode === 'request' ? tr('Mot de passe oublié ?', 'نسيت كلمة المرور؟') : tr('Un nouveau départ.', 'بداية جديدة.')}</h1>
          <p>{mode === 'request' ? tr('Retrouvez l’accès à votre compte.', 'استعد الدخول إلى حسابك.') : tr('Choisissez un nouveau mot de passe.', 'اختر كلمة مرور جديدة.')}</p>
        </div>
      </header>
      <main className="ay-auth__card ay-auth__recovery">
        {error && <div role="alert" id="recovery-error" className="ay-auth__message ay-auth__message--error">{error}</div>}
        {done ? <>
          <div role="status" className="ay-auth__message"><CheckCircle2 className="h-6 w-6 mb-3" aria-hidden /><p>{tr('Votre mot de passe a été modifié. Les anciennes sessions ont été fermées. Connectez-vous avec votre nouveau mot de passe.', 'تم تغيير كلمة المرور وإغلاق الجلسات السابقة. سجّل دخولك بكلمة المرور الجديدة.')}</p></div>
          <Button className="ay-auth__submit" onClick={() => window.location.assign('/?customerAuth=password_reset')}>{tr('Se connecter', 'تسجيل الدخول')}</Button>
        </> : mode === 'request' ? <>
          <p className="ay-auth__explanation">{tr('Indiquez l’adresse e-mail utilisée lors de votre inscription. Le lien de récupération est valable 30 minutes.', 'أدخل البريد المستخدم لإنشاء حسابك. رابط الاسترجاع صالح لمدة 30 دقيقة.')}</p>
          {available === null && <p role="status">{tr('Chargement…', 'جارٍ التحميل…')}</p>}
          {available === false && <div className="ay-auth__message" role="status"><p>{configFailed
            ? tr('Impossible de vérifier la disponibilité du service.', 'تعذّر التحقق من توفر الخدمة.')
            : tr('L’envoi des e-mails de récupération n’est pas disponible pour le moment. Utilisez votre moyen de connexion habituel ou réessayez plus tard.', 'إرسال بريد الاسترجاع غير متاح حاليًا. استخدم وسيلة دخولك المعتادة أو أعد المحاولة لاحقًا.')}</p><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>{tr('Réessayer', 'إعادة المحاولة')}</Button></div>}
          {accepted && <div role="status" className="ay-auth__message"><strong>{tr('Demande enregistrée', 'تم تسجيل الطلب')}</strong><p>{tr('Si cette adresse correspond à un compte créé avec un mot de passe, un lien sera envoyé. Vérifiez aussi les indésirables. Cette confirmation ne garantit pas la livraison du message.', 'إذا كان البريد مرتبطًا بحساب أُنشئ بكلمة مرور، سيُرسل رابط استرجاع. تفقد الرسائل غير المرغوب فيها أيضًا. تأكيد الطلب لا يعني ضمان وصول البريد.')}</p></div>}
          <form onSubmit={requestLink} aria-busy={busy} aria-describedby={error ? 'recovery-error' : undefined}>
            <fieldset disabled={busy} className="ay-auth__fields"><legend className="sr-only">{tr('Récupérer mon compte', 'استرجاع حسابي')}</legend>
              <Field label={tr('Adresse e-mail', 'البريد الإلكتروني')} htmlFor="recovery-email"><Input id="recovery-email" type="email" name="email" dir="ltr" inputMode="email" autoComplete="email" autoCapitalize="none" maxLength={180} value={email} onChange={event => { setEmail(event.target.value); setAccepted(false); }} placeholder={tr('Votre adresse e-mail', 'بريدك الإلكتروني')} required /></Field>
              <Button type="submit" disabled={busy || !available || cooldown > 0} className="ay-auth__submit">{busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}{busy ? tr('En cours…', 'جارٍ الإرسال…') : cooldown ? tr(`Réessayer dans ${cooldown} s`, `أعد المحاولة بعد ${cooldown} ث`) : tr('Envoyer le lien', 'إرسال الرابط')}</Button>
            </fieldset>
          </form>
          <p className="ay-auth__hint">{tr('Compte créé avec Google, Apple ou Facebook ? Utilisez ce même bouton sur la page de connexion.', 'أنشأت حسابك عبر Google أو Apple أو Facebook؟ استخدم زر الخدمة نفسها في شاشة الدخول.')}</p>
          <Button variant="secondary" onClick={back} disabled={busy}>{tr('Retour à la connexion', 'العودة لتسجيل الدخول')}</Button>
        </> : checking ? <div role="status" className="ay-auth__config"><Loader2 className="h-5 w-5 animate-spin" aria-hidden />{tr('Vérification du lien…', 'جارٍ التحقق من الرابط…')}</div> : !valid ? <Button className="ay-auth__submit" onClick={requestNew}>{tr('Demander un nouveau lien', 'طلب رابط جديد')}</Button> : <form onSubmit={resetPassword} aria-busy={busy} aria-describedby={error ? 'recovery-error' : undefined}>
          <fieldset disabled={busy} className="ay-auth__fields"><legend className="sr-only">{tr('Changer mon mot de passe', 'تغيير كلمة المرور')}</legend>
            <Field label={tr('Nouveau mot de passe', 'كلمة المرور الجديدة')} htmlFor="recovery-password"><div className="ay-auth__password"><Input id="recovery-password" name="new-password" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={100} value={password} onChange={event => setPassword(event.target.value)} aria-describedby="recovery-hint" required /><button type="button" className="ay-auth__password-toggle" aria-controls="recovery-password recovery-confirm" aria-pressed={visible} aria-label={visible ? tr('Masquer les mots de passe', 'إخفاء كلمتي المرور') : tr('Afficher les mots de passe', 'إظهار كلمتي المرور')} onClick={() => setVisible(!visible)}>{visible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}</button></div></Field>
            <p id="recovery-hint" className="ay-auth__hint">{tr('8 à 100 caractères. Choisissez un mot de passe unique.', 'من 8 إلى 100 حرف. اختر كلمة مرور فريدة.')}</p>
            <Field label={tr('Confirmer le mot de passe', 'تأكيد كلمة المرور')} htmlFor="recovery-confirm"><Input id="recovery-confirm" name="confirm-password" type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={100} value={confirm} onChange={event => setConfirm(event.target.value)} required /></Field>
            <Button type="submit" disabled={busy} className="ay-auth__submit">{busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}{tr('Enregistrer le mot de passe', 'حفظ كلمة المرور')}</Button>
          </fieldset>
        </form>}
      </main>
    </div></div>
  </div>;
}
