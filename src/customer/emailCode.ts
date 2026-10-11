/**
 * Connexion par code e-mail (façon ChatGPT) — helpers purs, sans base ni réseau.
 *
 * Le code est à usage unique, à 6 chiffres, valable 10 minutes, et haché avec le
 * secret serveur (jamais stocké en clair). La personne saisit l'adresse dans
 * l'application, reçoit le code, le tape dans l'application : aucune sortie vers
 * un navigateur.
 */
import { authMailTemplate } from './accountMail';

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
/** Plafond par adresse : 3 demandes / 15 min (protège la boîte et le quota d'envoi). */
export const EMAIL_CODE_PER_ADDRESS_MAX = 3;
/** Plafond par IP : 100 / 15 min (un opérateur mobile partage souvent une seule IP). */
export const EMAIL_CODE_PER_IP_MAX = 100;
export const EMAIL_CODE_WINDOW_MS = 15 * 60 * 1000;

/** Masque l'adresse : « ab***@ex***.tn » — assez pour reconnaître, pas assez pour l'exposer. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const domainName = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  const keepLocal = local.slice(0, Math.min(2, local.length));
  const keepDomain = domainName.slice(0, Math.min(2, domainName.length));
  return `${keepLocal}***@${keepDomain}***${tld}`;
}

/** Nom d'affichage initial d'un compte créé par code : partie avant « @ », bornée. */
export function displayNameFromEmail(email: string): string {
  const local = email.slice(0, Math.max(0, email.indexOf('@'))).replace(/[._-]+/g, ' ').trim();
  const name = local.slice(0, 100).trim();
  return name.length >= 2 ? name : 'Client AYROVI';
}

export function emailCodeSubject(ar: boolean, code: string): string {
  return ar ? `رمز الدخول إلى AYROVI: ${code}` : `Votre code de connexion AYROVI : ${code}`;
}

export function emailCodeHtml(ar: boolean, code: string): string {
  const title = ar ? 'رمز الدخول' : 'Votre code de connexion';
  const body = ar
    ? `<p>أدخل هذا الرمز في التطبيق لتسجيل الدخول. صالح لمدة 10 دقائق.</p>`
    : `<p>Saisissez ce code dans l’application pour vous connecter. Il est valable 10 minutes.</p>`;
  const codeBlock = `<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:24px 0">${code}</p>`;
  const ignore = ar
    ? `<p>إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.</p>`
    : `<p>Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.</p>`;
  return authMailTemplate(ar, title, body + codeBlock + ignore);
}
