import { createSign, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { Request, Router } from 'express';
import { QatafoDatabase } from '../db/database';
import { uploadsDir, invoiceAbsolutePath } from '../services/invoice';
import { sendMail } from '../services/mailer';
import { cardGatewayAvailable, initiateKonnectCardPayment, verifyKonnectCardPayment } from '../services/paymentGateway';
import { normalizeTunisianPhone } from './phone';
import {
  cleanupCustomerAuth,
  clearCustomerCookie,
  createCustomerSession,
  customerAuthReady,
  customerFromRequest,
  destroyCustomerSession,
  hashToken,
  keyedHash,
  requireCustomer,
  resolveCustomer,
  rotateCustomerCsrf,
  safeEqualHash,
  setCustomerCookie,
} from './auth';
import { deliverOtp, otpProviderName, phoneOtpAvailable, verifyProviderOtp } from './otp';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_PHONE_WINDOW_MS = 15 * 60 * 1000;
const OTP_IP_WINDOW_MS = 15 * 60 * 1000;
const GOOGLE_OAUTH_COOKIE = 'ayrovi_customer_oauth';
const FACEBOOK_OAUTH_COOKIE = 'ayrovi_customer_facebook_oauth';

function requestCookie(req: Request, name: string): string {
  const header = req.headers.cookie;
  if (!header) return '';
  for (const item of header.split(';')) {
    const [key, ...value] = item.trim().split('=');
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join('='));
    } catch {
      return '';
    }
  }
  return '';
}

function oauthCookie(name: string, routePath: string, value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' || process.env.RENDER ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=${routePath}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function googleOauthCookie(value: string, maxAgeSeconds: number): string {
  return oauthCookie(GOOGLE_OAUTH_COOKIE, '/api/customer/auth/google', value, maxAgeSeconds);
}

function facebookOauthCookie(value: string, maxAgeSeconds: number): string {
  return oauthCookie(FACEBOOK_OAUTH_COOKIE, '/api/customer/auth/facebook', value, maxAgeSeconds);
}

export { normalizeTunisianPhone } from './phone';

function validCartSession(value: unknown): string {
  const session = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{8,128}$/.test(session) ? session : '';
}

function validReturnTo(value: unknown): string {
  const path = String(value || '/').trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/';
  return path.slice(0, 500);
}

function oauthBaseUrl(): string {
  return String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
}

function googleConfig() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const baseUrl = oauthBaseUrl();
  const callbackUrl = String(process.env.GOOGLE_CALLBACK_URL || (baseUrl ? `${baseUrl}/api/customer/auth/google/callback` : '')).trim();
  return { clientId, clientSecret, callbackUrl, ready: Boolean(clientId && clientSecret && callbackUrl.startsWith('https://')) };
}

function facebookConfig() {
  const appId = String(process.env.FACEBOOK_APP_ID || '').trim();
  const appSecret = String(process.env.FACEBOOK_APP_SECRET || '').trim();
  const baseUrl = oauthBaseUrl();
  const callbackUrl = String(process.env.FACEBOOK_CALLBACK_URL || (baseUrl ? `${baseUrl}/api/customer/auth/facebook/callback` : '')).trim();
  const configuredVersion = String(process.env.FACEBOOK_GRAPH_VERSION || 'v26.0').trim();
  const graphVersion = /^v\d{1,2}\.\d{1,2}$/.test(configuredVersion) ? configuredVersion : 'v26.0';
  return { appId, appSecret, callbackUrl, graphVersion, ready: Boolean(appId && appSecret && callbackUrl.startsWith('https://')) };
}

export function googleOAuthAvailable(): boolean {
  return googleConfig().ready;
}

export function facebookOAuthAvailable(): boolean {
  return facebookConfig().ready;
}

/** Apple Sign in — requiert des clés Apple Developer (Services ID + clé ES256). */
function appleConfig() {
  const clientId = String(process.env.APPLE_CLIENT_ID || '').trim();
  const teamId = String(process.env.APPLE_TEAM_ID || '').trim();
  const keyId = String(process.env.APPLE_KEY_ID || '').trim();
  const privateKey = String(process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const baseUrl = String(process.env.PUBLIC_BASE_URL || '').trim();
  const callbackUrl = String(process.env.APPLE_CALLBACK_URL || (baseUrl ? `${baseUrl}/api/customer/auth/apple/callback` : '')).trim();
  return { clientId, teamId, keyId, privateKey, callbackUrl, ready: Boolean(clientId && teamId && keyId && privateKey && callbackUrl) };
}

export function appleOAuthAvailable(): boolean {
  return appleConfig().ready;
}

/** Client-secret JWT ES256 exigé par le point d'échange de jetons Apple. */
function appleClientSecretJwt(apple: ReturnType<typeof appleConfig>): string {
  const header = { alg: 'ES256', kid: apple.keyId };
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = { iss: apple.teamId, iat: nowSec, exp: nowSec + 30 * 60, aud: 'https://appleid.apple.com', sub: apple.clientId };
  const b64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  // JWT ES256 attend la signature brute r||s (64 octets), pas l'enveloppe DER de Node.
  const der = signer.sign(apple.privateKey);
  let offset = 2;
  if (der[1] & 0x80) offset += der[1] & 0x7f;
  const readInteger = (): Buffer => {
    const length = der[offset + 1];
    const start = offset + 2;
    offset = start + length;
    let value = der.slice(start, start + length);
    let i = 0;
    while (i < value.length - 1 && value[i] === 0) i++;
    value = value.slice(i);
    return Buffer.concat([Buffer.alloc(32 - value.length), value]);
  };
  const rawSignature = Buffer.concat([readInteger(), readInteger()]);
  return `${signingInput}.${rawSignature.toString('base64url')}`;
}

/** Mots de passe e-mail — scrypt avec sel unique et comparaison en temps constant. */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (typeof stored !== 'string' || !stored) return false;
  const [scheme, salt, digest] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !digest) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

function normalizedEmail(value: any): string {
  return String(value || '').trim().toLowerCase().slice(0, 180);
}

/** Limiteur mémoire simple : 5 échecs de connexion e-mail par IP sur 15 minutes. */
const emailLoginFailures = new Map<string, number[]>();
const EMAIL_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_LOGIN_MAX_FAILURES = 5;

function emailLoginAllowed(ip: string): boolean {
  const since = Date.now() - EMAIL_LOGIN_WINDOW_MS;
  const failures = (emailLoginFailures.get(ip) || []).filter((stamp) => stamp > since);
  emailLoginFailures.set(ip, failures);
  return failures.length < EMAIL_LOGIN_MAX_FAILURES;
}

function registerEmailFailure(ip: string): void {
  const failures = emailLoginFailures.get(ip) || [];
  failures.push(Date.now());
  emailLoginFailures.set(ip, failures);
}

function publicAccount(row: any) {
  return {
    id: row.id || row.account_id,
    displayName: String(row.display_name || row.displayName || ''),
    email: row.email || null,
    phone: row.phone || null,
    avatarUrl: String(row.avatar_url || row.avatarUrl || ''),
    emailVerified: Boolean(row.email_verified_at ?? row.emailVerified),
    phoneVerified: Boolean(row.phone_verified_at ?? row.phoneVerified),
    status: row.status,
    locale: String(row.locale || 'fr-TN'),
    marketingOptIn: Boolean(row.marketing_opt_in ?? row.marketingOptIn),
  };
}

function accountRow(db: QatafoDatabase, accountId: string) {
  return db.get<any>('SELECT * FROM customer_accounts WHERE id=?', accountId);
}

function notification(db: QatafoDatabase, accountId: string, type: string, title: string, message: string, actionUrl = '') {
  db.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
    VALUES (?,?,?,?,?,?,?)`, `notification_${randomUUID()}`, accountId, type, title, message, actionUrl, new Date().toISOString());
}

function mergeAccounts(db: QatafoDatabase, sourceId: string, targetId: string): string {
  if (sourceId === targetId) return targetId;
  return db.transaction(() => {
    const source = accountRow(db, sourceId);
    const target = accountRow(db, targetId);
    if (!source || !target) throw new Error('ACCOUNT_MERGE_FAILED');
    if (source.phone && target.phone && source.phone !== target.phone) throw new Error('ACCOUNT_PHONE_CONFLICT');
    const now = new Date().toISOString();
    const email = target.email || source.email || null;
    const emailVerifiedAt = target.email
      ? (target.email === source.email ? (target.email_verified_at || source.email_verified_at) : target.email_verified_at)
      : source.email_verified_at;
    const phone = target.phone || source.phone || null;
    const phoneVerifiedAt = target.phone
      ? (target.phone === source.phone ? (target.phone_verified_at || source.phone_verified_at) : target.phone_verified_at)
      : source.phone_verified_at;
    // Release unique account values before copying them to the surviving account.
    db.run('UPDATE customer_accounts SET email=NULL,phone=NULL,updated_at=? WHERE id=?', now, sourceId);
    db.run(`UPDATE customer_accounts SET
      display_name=CASE WHEN display_name='' OR display_name='Client AYROVI' THEN ? ELSE display_name END,
      email=?,phone=?,avatar_url=CASE WHEN avatar_url='' THEN ? ELSE avatar_url END,
      email_verified_at=?,phone_verified_at=?,marketing_opt_in=CASE WHEN marketing_opt_in=1 OR ?=1 THEN 1 ELSE 0 END,
      updated_at=? WHERE id=?`, source.display_name, email, phone, source.avatar_url,
    emailVerifiedAt, phoneVerifiedAt, source.marketing_opt_in, now, targetId);
    db.run('UPDATE OR IGNORE customer_auth_identities SET account_id=? WHERE account_id=?', targetId, sourceId);
    db.run('DELETE FROM customer_auth_identities WHERE account_id=?', sourceId);
    db.run('UPDATE customer_sessions SET account_id=? WHERE account_id=?', targetId, sourceId);
    db.run('UPDATE customer_oauth_states SET account_id=? WHERE account_id=?', targetId, sourceId);
    db.run('UPDATE orders SET account_id=? WHERE account_id=?', targetId, sourceId);
    for (const item of db.all<any>('SELECT * FROM cart_items WHERE account_id=? ORDER BY created_at', sourceId)) {
      const existing = item.external_id
        ? db.get<any>(`SELECT * FROM cart_items WHERE account_id=? AND store=? AND external_id=? AND source_url=?
            AND IFNULL(variant,'')=IFNULL(?,'') AND requested_size=? AND requested_color=? AND customer_note=?`,
          targetId, item.store, item.external_id, item.source_url, item.variant || '', item.requested_size || '', item.requested_color || '', item.customer_note || '')
        : db.get<any>(`SELECT * FROM cart_items WHERE account_id=? AND store=? AND source_url=? AND title=?
            AND IFNULL(variant,'')=IFNULL(?,'') AND requested_size=? AND requested_color=? AND customer_note=?`,
          targetId, item.store, item.source_url, item.title, item.variant || '', item.requested_size || '', item.requested_color || '', item.customer_note || '');
      if (existing) {
        db.run('UPDATE cart_items SET quantity=?,updated_at=? WHERE id=?', Math.min(99, Number(existing.quantity) + Number(item.quantity)), now, existing.id);
        db.run('DELETE FROM cart_items WHERE id=?', item.id);
      } else db.run('UPDATE cart_items SET account_id=?,updated_at=? WHERE id=?', targetId, now, item.id);
    }
    const preferredAddress = db.get<any>('SELECT id FROM customer_addresses WHERE account_id=? AND is_default=1 ORDER BY created_at DESC LIMIT 1', targetId)
      || db.get<any>('SELECT id FROM customer_addresses WHERE account_id=? AND is_default=1 ORDER BY created_at DESC LIMIT 1', sourceId)
      || db.get<any>('SELECT id FROM customer_addresses WHERE account_id IN (?,?) ORDER BY created_at DESC LIMIT 1', targetId, sourceId);
    db.run('UPDATE customer_addresses SET account_id=?,is_default=0,updated_at=? WHERE account_id=?', targetId, now, sourceId);
    if (preferredAddress) db.run('UPDATE customer_addresses SET is_default=CASE WHEN id=? THEN 1 ELSE 0 END,updated_at=? WHERE account_id=?', preferredAddress.id, now, targetId);
    for (const favorite of db.all<any>('SELECT * FROM customer_favorites WHERE account_id=?', sourceId)) {
      db.run(`INSERT OR IGNORE INTO customer_favorites
        (id,account_id,product_id,source_url,title,image_url,price_tnd,created_at) VALUES (?,?,?,?,?,?,?,?)`,
      favorite.id, targetId, favorite.product_id, favorite.source_url, favorite.title, favorite.image_url, favorite.price_tnd, favorite.created_at);
    }
    db.run('DELETE FROM customer_favorites WHERE account_id=?', sourceId);
    db.run('UPDATE customer_notifications SET account_id=? WHERE account_id=?', targetId, sourceId);
    if (db.get<any>("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ayrovix_search_history'")) {
      db.run('UPDATE ayrovix_search_history SET account_id=? WHERE account_id=?', targetId, sourceId);
    }
    if (db.get<any>("SELECT 1 FROM sqlite_master WHERE type='table' AND name='assistant_feedback'")) {
      db.run('UPDATE assistant_feedback SET account_id=? WHERE account_id=?', targetId, sourceId);
    }
    if (db.get<any>("SELECT 1 FROM sqlite_master WHERE type='table' AND name='assistant_support_tickets'")) {
      db.run('UPDATE assistant_support_tickets SET account_id=? WHERE account_id=?', targetId, sourceId);
    }
    db.run('DELETE FROM customer_accounts WHERE id=?', sourceId);
    return targetId;
  });
}

function linkHistoricalOrders(db: QatafoDatabase, accountId: string, verifiedPhone: string): number {
  return db.transaction(() => {
    let linked = 0;
    for (const order of db.all<any>('SELECT id,phone FROM orders WHERE account_id IS NULL')) {
      if (normalizeTunisianPhone(order.phone) === verifiedPhone) {
        linked += db.run('UPDATE orders SET account_id=? WHERE id=? AND account_id IS NULL', accountId, order.id).changes;
      }
    }
    if (!linked) return 0;
    const latest = db.get<any>(`SELECT o.*,c.name customer_name FROM orders o
      JOIN customers c ON c.id=o.customer_id WHERE o.account_id=? ORDER BY o.created_at DESC LIMIT 1`, accountId);
    const current = accountRow(db, accountId);
    const now = new Date().toISOString();
    if (latest && current && (!current.display_name || current.display_name === 'Client AYROVI')) {
      db.run('UPDATE customer_accounts SET display_name=?,updated_at=? WHERE id=?', latest.customer_name || 'Client AYROVI', now, accountId);
    }
    const count = db.get<any>('SELECT COUNT(*) count FROM customer_addresses WHERE account_id=?', accountId)?.count || 0;
    if (!count && latest?.address && latest?.governorate) {
      db.run(`INSERT INTO customer_addresses
        (id,account_id,label,recipient_name,phone,governorate,city,postal_code,address_line,delivery_notes,is_default,created_at,updated_at)
        VALUES (?,?, 'Adresse précédente',?,?,?,?, '',?, '',1,?,?)`,
      `address_${randomUUID()}`, accountId, latest.customer_name || 'Client AYROVI', verifiedPhone,
      latest.governorate, latest.governorate, latest.address, now, now);
    }
    notification(db, accountId, 'ACCOUNT', 'Historique retrouvé', `${linked} commande${linked > 1 ? 's ont' : ' a'} été rattachée${linked > 1 ? 's' : ''} à votre compte.`, '/compte/commandes');
    return linked;
  });
}

function ensurePhoneIdentity(db: QatafoDatabase, accountId: string, phone: string) {
  db.run(`INSERT OR IGNORE INTO customer_auth_identities (id,account_id,provider,provider_subject,created_at)
    VALUES (?,?,'PHONE',?,?)`, `identity_${randomUUID()}`, accountId, phone, new Date().toISOString());
}

function completePhoneVerification(db: QatafoDatabase, req: Request, phone: string) {
  const current = resolveCustomer(db, req);
  const byPhone = db.get<any>('SELECT * FROM customer_accounts WHERE phone=?', phone);
  if (current?.phone && current.phone !== phone) throw new Error('PHONE_CHANGE_NOT_SUPPORTED');
  let accountId: string;
  let created = false;
  if (current && byPhone && current.id !== byPhone.id) accountId = mergeAccounts(db, current.id, byPhone.id);
  else if (current) accountId = current.id;
  else if (byPhone) accountId = byPhone.id;
  else {
    accountId = `account_${randomUUID()}`;
    const now = new Date().toISOString();
    db.run(`INSERT INTO customer_accounts
      (id,display_name,phone,phone_verified_at,status,created_at,updated_at)
      VALUES (?,'Client AYROVI',?,?,'ACTIVE',?,?)`, accountId, phone, now, now, now);
    created = true;
  }
  const now = new Date().toISOString();
  db.run('UPDATE customer_accounts SET phone=?,phone_verified_at=?,status=\'ACTIVE\',last_login_at=?,updated_at=? WHERE id=?', phone, now, now, now, accountId);
  ensurePhoneIdentity(db, accountId, phone);
  const linked = linkHistoricalOrders(db, accountId, phone);
  if (created && !linked) notification(db, accountId, 'ACCOUNT', 'Bienvenue chez AYROVI', 'Votre compte est actif. Votre panier et vos commandes sont maintenant accessibles sur tous vos appareils.', '/compte');
  return { accountId, linked };
}

function validateAddress(body: any) {
  const address = {
    label: String(body?.label || 'Maison').trim().slice(0, 40),
    recipientName: String(body?.recipientName || '').trim().slice(0, 100),
    phone: normalizeTunisianPhone(body?.phone),
    governorate: String(body?.governorate || '').trim().slice(0, 80),
    city: String(body?.city || '').trim().slice(0, 100),
    postalCode: String(body?.postalCode || '').trim().slice(0, 20),
    addressLine: String(body?.addressLine || '').trim().slice(0, 500),
    deliveryNotes: String(body?.deliveryNotes || '').trim().slice(0, 500),
    isDefault: Boolean(body?.isDefault),
  };
  if (!address.recipientName || !address.phone || !address.governorate || !address.addressLine) return null;
  return address;
}

export function createCustomerRouter(db: QatafoDatabase): Router {
  const router = Router();
  cleanupCustomerAuth(db);

  // Konnect sends only a payment reference. AYROVI always fetches the payment
  // server-to-server and validates amount, currency and merchant order identity.
  router.get('/payments/konnect/webhook', async (req, res) => {
    const paymentRef = String(req.query.payment_ref || '').trim();
    if (!/^[A-Za-z0-9_-]{8,160}$/.test(paymentRef)) return res.status(400).json({ success: false, error: 'Référence de paiement invalide.' });
    const transaction = db.get<any>(`SELECT t.*,o.order_number FROM payment_transactions t
      JOIN orders o ON o.id=t.order_id WHERE t.provider='KONNECT' AND t.provider_reference=?`, paymentRef);
    if (!transaction) return res.status(404).json({ success: false, error: 'Transaction introuvable.' });
    if (['PAID','FAILED'].includes(String(transaction.status))) return res.json({ success: true });
    try {
      const verification = await verifyKonnectCardPayment({
        paymentRef,
        expectedAmountTnd: Number(transaction.amount_tnd),
        expectedOrderNumber: String(transaction.order_number),
        expectedTransactionNumber: String(transaction.transaction_number),
      });
      if (verification.state === 'PAID') db.confirmCardTransaction(transaction.id, verification.auditPayload);
      else if (verification.state === 'FAILED') db.markCardTransactionFailed(transaction.id, 'Paiement refusé ou expiré par la passerelle.', verification.auditPayload);
      return res.json({ success: true });
    } catch (error) {
      console.error('[Konnect webhook]', error);
      return res.status(502).json({ success: false, error: 'Vérification de la passerelle indisponible.' });
    }
  });

  router.get('/auth/config', (_req, res) => {
    const google = googleConfig();
    const facebook = facebookConfig();
    const apple = appleConfig();
    res.json({ success: true, data: {
      phoneOtp: { enabled: customerAuthReady() && phoneOtpAvailable() },
      google: { enabled: customerAuthReady() && google.ready },
      facebook: { enabled: customerAuthReady() && facebook.ready },
      apple: { enabled: customerAuthReady() && apple.ready },
      email: { enabled: customerAuthReady() },
      checkoutRequiresAuthentication: true,
    } });
  });

  router.get('/auth/me', (req, res) => {
    const customer = resolveCustomer(db, req);
    if (!customer) {
      clearCustomerCookie(res);
      return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'Non authentifié.' });
    }
    const cartSession = validCartSession(req.headers['x-session-id']);
    if (cartSession) db.attachCartToAccount(cartSession, customer.id);
    const csrfToken = rotateCustomerCsrf(db, req);
    return res.json({ success: true, data: { account: publicAccount(accountRow(db, customer.id)), csrfToken } });
  });

  router.post('/auth/otp/request', async (req, res) => {
    if (!customerAuthReady() || !phoneOtpAvailable()) return res.status(503).json({ success: false, code: 'OTP_UNAVAILABLE', error: 'La connexion par SMS n’est pas encore configurée.' });
    const phone = normalizeTunisianPhone(req.body?.phone);
    if (!phone) return res.status(400).json({ success: false, error: 'Saisissez un numéro tunisien valide.' });
    const now = new Date();
    const phoneSince = new Date(now.getTime() - OTP_PHONE_WINDOW_MS).toISOString();
    const ipSince = new Date(now.getTime() - OTP_IP_WINDOW_MS).toISOString();
    const ip = req.ip || '';
    const phoneCount = Number(db.get<any>('SELECT COUNT(*) count FROM customer_otp_challenges WHERE phone=? AND created_at>=?', phone, phoneSince)?.count || 0);
    const ipCount = Number(db.get<any>('SELECT COUNT(*) count FROM customer_otp_challenges WHERE request_ip=? AND created_at>=?', ip, ipSince)?.count || 0);
    if (phoneCount >= 3 || ipCount >= 10) return res.status(429).json({ success: false, error: 'Trop de demandes. Réessayez dans 15 minutes.' });

    const challengeId = `otp_${randomUUID()}`;
    const code = String(randomInt(100000, 1000000));
    const provider = otpProviderName();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS).toISOString();
    db.run('UPDATE customer_otp_challenges SET consumed_at=? WHERE phone=? AND consumed_at IS NULL', now.toISOString(), phone);
    db.run(`INSERT INTO customer_otp_challenges
      (id,phone,code_hash,provider,expires_at,max_attempts,request_ip,created_at) VALUES (?,?,?,?,?,5,?,?)`,
    challengeId, phone, keyedHash(`${challengeId}:${phone}:${code}`), provider || 'local', expiresAt, ip, now.toISOString());
    try {
      const delivery = await deliverOtp(phone, code);
      return res.status(201).json({ success: true, data: {
        challengeId,
        maskedPhone: `${phone.slice(0, 7)} ** *** ${phone.slice(-2)}`,
        expiresInSeconds: OTP_TTL_MS / 1000,
        ...(delivery.developmentCode ? { developmentCode: delivery.developmentCode } : {}),
      } });
    } catch (error: any) {
      db.run('DELETE FROM customer_otp_challenges WHERE id=?', challengeId);
      console.error('[Customer OTP Delivery]', error?.message || error);
      if (error?.message === 'OTP_RATE_LIMITED') {
        return res.status(429).json({ success: false, code: 'OTP_RATE_LIMITED', error: 'Trop de demandes SMS. Réessayez plus tard.' });
      }
      return res.status(503).json({ success: false, code: 'OTP_DELIVERY_FAILED', error: 'Le SMS n’a pas pu être envoyé. Réessayez.' });
    }
  });

  router.post('/auth/otp/verify', async (req, res) => {
    if (!customerAuthReady()) return res.status(503).json({ success: false, error: 'Authentification client non configurée.' });
    const challengeId = String(req.body?.challengeId || '');
    const code = String(req.body?.code || '').replace(/\D/g, '');
    const challenge = db.get<any>('SELECT * FROM customer_otp_challenges WHERE id=?', challengeId);
    const now = new Date().toISOString();
    if (!challenge || challenge.consumed_at || challenge.expires_at <= now) return res.status(400).json({ success: false, code: 'OTP_EXPIRED', error: 'Ce code a expiré. Demandez un nouveau SMS.' });
    if (Number(challenge.attempts) >= Number(challenge.max_attempts)) return res.status(429).json({ success: false, error: 'Trop de tentatives. Demandez un nouveau code.' });
    if (code.length !== 6) {
      db.run('UPDATE customer_otp_challenges SET attempts=attempts+1 WHERE id=?', challengeId);
      return res.status(400).json({ success: false, code: 'OTP_INVALID', error: 'Le code saisi est incorrect.' });
    }

    let approved = false;
    try {
      const providerResult = await verifyProviderOtp(String(challenge.provider || 'local'), challenge.phone, code);
      approved = providerResult ?? safeEqualHash(`${challengeId}:${challenge.phone}:${code}`, challenge.code_hash);
    } catch (error: any) {
      console.error('[Customer OTP Provider Verification]', error?.message || error);
      if (error?.message === 'OTP_RATE_LIMITED') {
        return res.status(429).json({ success: false, code: 'OTP_RATE_LIMITED', error: 'Trop de tentatives chez le fournisseur SMS. Réessayez plus tard.' });
      }
      return res.status(503).json({ success: false, code: 'OTP_VERIFICATION_FAILED', error: 'Le service SMS ne répond pas. Réessayez.' });
    }
    if (!approved) {
      db.run('UPDATE customer_otp_challenges SET attempts=attempts+1 WHERE id=?', challengeId);
      return res.status(400).json({ success: false, code: 'OTP_INVALID', error: 'Le code saisi est incorrect.' });
    }

    try {
      const claimed = db.run('UPDATE customer_otp_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL', now, challengeId);
      if (!claimed.changes) return res.status(409).json({ success: false, code: 'OTP_ALREADY_USED', error: 'Ce code a déjà été utilisé.' });
      const { accountId, linked } = completePhoneVerification(db, req, challenge.phone);
      const cartSession = validCartSession(req.body?.cartSessionId || req.headers['x-session-id']);
      if (cartSession) db.attachCartToAccount(cartSession, accountId);
      const prior = resolveCustomer(db, req) as any;
      if (prior?.sessionId) db.run('DELETE FROM customer_sessions WHERE id=?', prior.sessionId);
      const session = createCustomerSession(db, accountId, req);
      setCustomerCookie(res, session.token);
      return res.json({ success: true, data: {
        account: publicAccount(accountRow(db, accountId)),
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
        linkedHistoricalOrders: linked,
      } });
    } catch (error: any) {
      if (error?.message === 'PHONE_CHANGE_NOT_SUPPORTED') return res.status(409).json({ success: false, error: 'Ce compte possède déjà un autre numéro vérifié.' });
      console.error('[Customer OTP Verification]', error);
      return res.status(500).json({ success: false, error: 'La connexion n’a pas pu être finalisée.' });
    }
  });

  router.post('/auth/email/register', (req, res) => {
    if (!customerAuthReady()) return res.status(503).json({ success: false, error: 'Authentification client non configurée.' });
    const displayName = String(req.body?.displayName || '').trim().slice(0, 100);
    const email = normalizedEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const marketingOptIn = Boolean(req.body?.marketingOptIn);
    if (displayName.length < 2) return res.status(400).json({ success: false, code: 'NAME_INVALID', error: 'Indiquez votre nom complet.' });
    if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ success: false, code: 'EMAIL_INVALID', error: 'Adresse e-mail invalide.' });
    if (password.length < 8) return res.status(400).json({ success: false, code: 'PASSWORD_WEAK', error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    const existing = db.get<any>('SELECT id FROM customer_accounts WHERE email=? COLLATE NOCASE', email);
    if (existing) return res.status(409).json({ success: false, code: 'EMAIL_TAKEN', error: 'Un compte existe déjà avec cette adresse e-mail.' });
    try {
      const now = new Date().toISOString();
      const accountId = `account_${randomUUID()}`;
      db.run(`INSERT INTO customer_accounts
        (id,display_name,email,password_hash,marketing_opt_in,status,last_login_at,created_at,updated_at)
        VALUES (?,?,?,?,?,'ACTIVE',?,?,?)`,
        accountId, displayName, email, hashPassword(password), marketingOptIn ? 1 : 0, now, now, now);
      notification(db, accountId, 'ACCOUNT', 'Bienvenue chez AYROVI', 'Votre compte est actif. Vérifiez votre téléphone avant votre première commande.', '/compte');
      const cartSession = validCartSession(req.body?.cartSessionId || req.headers['x-session-id']);
      if (cartSession) db.attachCartToAccount(cartSession, accountId);
      const prior = resolveCustomer(db, req) as any;
      if (prior?.sessionId) db.run('DELETE FROM customer_sessions WHERE id=?', prior.sessionId);
      const session = createCustomerSession(db, accountId, req);
      setCustomerCookie(res, session.token);
      return res.json({ success: true, data: {
        account: publicAccount(accountRow(db, accountId)),
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
      } });
    } catch (error) {
      console.error('[Customer Email Register]', error);
      return res.status(500).json({ success: false, error: 'La création du compte a échoué.' });
    }
  });

  router.post('/auth/email/login', (req, res) => {
    if (!customerAuthReady()) return res.status(503).json({ success: false, error: 'Authentification client non configurée.' });
    const email = normalizedEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const fail = () => res.status(401).json({ success: false, code: 'INVALID_CREDENTIALS', error: 'E-mail ou mot de passe incorrect.' });
    if (!EMAIL_PATTERN.test(email) || password.length < 8) return fail();
    if (!emailLoginAllowed(req.ip || '')) return res.status(429).json({ success: false, code: 'LOGIN_RATE_LIMITED', error: 'Trop de tentatives. Réessayez dans un quart d’heure.' });
    const account = db.get<any>('SELECT * FROM customer_accounts WHERE email=? COLLATE NOCASE', email);
    if (!account || !verifyPassword(password, account.password_hash)) { registerEmailFailure(req.ip || ''); return fail(); }
    if (account.status !== 'ACTIVE') return res.status(403).json({ success: false, code: 'ACCOUNT_BLOCKED', error: 'Ce compte est bloqué. Contactez le support.' });
    const cartSession = validCartSession(req.body?.cartSessionId || req.headers['x-session-id']);
    if (cartSession) db.attachCartToAccount(cartSession, account.id);
    const prior = resolveCustomer(db, req) as any;
    if (prior?.sessionId) db.run('DELETE FROM customer_sessions WHERE id=?', prior.sessionId);
    const session = createCustomerSession(db, account.id, req);
    setCustomerCookie(res, session.token);
    return res.json({ success: true, data: {
      account: publicAccount(accountRow(db, account.id)),
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    } });
  });

  router.get('/auth/apple/start', (req, res) => {
    const apple = appleConfig();
    if (!customerAuthReady() || !apple.ready) return res.status(503).send('Connexion Apple non configurée.');
    const state = randomBytes(32).toString('base64url');
    const stateId = hashToken(state);
    const now = new Date();
    const current = resolveCustomer(db, req);
    db.run(`INSERT INTO customer_oauth_states (id,account_id,provider,cart_session_id,return_to,expires_at,created_at)
      VALUES (?,?,'APPLE',?,?,?,?)`, stateId, current?.id || null, validCartSession(req.query.cartSessionId), validReturnTo(req.query.returnTo),
      new Date(now.getTime() + 10 * 60 * 1000).toISOString(), now.toISOString());
    const params = new URLSearchParams({
      client_id: apple.clientId,
      redirect_uri: apple.callbackUrl,
      response_type: 'code',
      scope: 'name email',
      state,
      response_mode: 'query',
    });
    return res.redirect(`https://appleid.apple.com/auth/authorize?${params}`);
  });

  router.get('/auth/apple/callback', async (req, res) => {
    const apple = appleConfig();
    const stateValue = String(req.query.state || '');
    const stateHash = hashToken(stateValue);
    const state = db.get<any>("SELECT * FROM customer_oauth_states WHERE id=? AND provider='APPLE' AND expires_at>?", stateHash, new Date().toISOString());
    const failure = () => res.redirect('/?customerAuth=error');
    if (!customerAuthReady() || !apple.ready || !state || typeof req.query.code !== 'string') {
      if (state) db.run('DELETE FROM customer_oauth_states WHERE id=?', state.id);
      return failure();
    }
    db.run('DELETE FROM customer_oauth_states WHERE id=?', state.id);
    try {
      const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: req.query.code,
          client_id: apple.clientId,
          client_secret: appleClientSecretJwt(apple),
          grant_type: 'authorization_code',
          redirect_uri: apple.callbackUrl,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!tokenResponse.ok) throw new Error('APPLE_TOKEN_FAILED');
      const tokens: any = await tokenResponse.json();
      const [, payloadB64] = String(tokens.id_token || '').split('.');
      const payload = payloadB64 ? JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) : {};
      const subject = String(payload.sub || '');
      if (!subject) throw new Error('APPLE_IDENTITY_INVALID');
      const email = String(payload.email || '').trim().toLowerCase();
      const emailVerifiedHere = Boolean(payload.email_verified === true || payload.email_verified === 'true');
      const nowIso = new Date().toISOString();
      const identityOwnerId = db.get<any>(`SELECT account_id FROM customer_auth_identities WHERE provider='APPLE' AND provider_subject=?`, subject)?.account_id as string | undefined;
      const emailOwner = email
        ? db.get<any>('SELECT id,email_verified_at FROM customer_accounts WHERE email=? COLLATE NOCASE', email)
        : undefined;
      const verifiedEmailOwnerId = emailOwner?.email_verified_at ? emailOwner.id as string : undefined;
      let accountId = (state.account_id || identityOwnerId || verifiedEmailOwnerId) as string | undefined;
      if (!accountId) {
        accountId = `account_${randomUUID()}`;
        db.run(`INSERT INTO customer_accounts
          (id,display_name,email,email_verified_at,status,last_login_at,created_at,updated_at)
          VALUES (?,?,?,?, 'ACTIVE', ?, ?, ?)`,
          accountId, 'Client AYROVI', emailVerifiedHere ? email : null, emailVerifiedHere ? nowIso : null, nowIso, nowIso, nowIso);
        notification(db, accountId, 'ACCOUNT', 'Bienvenue chez AYROVI', 'Votre compte Apple est actif. Vérifiez votre téléphone avant votre première commande.', '/compte');
      } else {
        const currentAccount = accountRow(db, accountId);
        if (!currentAccount) throw new Error('ACCOUNT_MISSING');
        const adoptAppleEmail = email && (!currentAccount.email || !currentAccount.email_verified_at);
        db.run(`UPDATE customer_accounts SET
          email=CASE WHEN ?!='' AND ? THEN ? ELSE email END,
          email_verified_at=CASE WHEN ?!='' AND ? THEN ? ELSE email_verified_at END,
          last_login_at=?,updated_at=? WHERE id=?`,
          email, adoptAppleEmail ? 1 : 0, email,
          email, adoptAppleEmail ? 1 : 0, nowIso,
          nowIso, nowIso, accountId);
      }
      db.run(`INSERT OR IGNORE INTO customer_auth_identities (id,account_id,provider,provider_subject,created_at)
        VALUES (?,?,'APPLE',?,?)`, `identity_${randomUUID()}`, accountId, subject, nowIso);
      if (state.cart_session_id) db.attachCartToAccount(state.cart_session_id, accountId);
      const prior = resolveCustomer(db, req) as any;
      if (prior?.sessionId) db.run('DELETE FROM customer_sessions WHERE id=?', prior.sessionId);
      const session = createCustomerSession(db, accountId, req);
      setCustomerCookie(res, session.token);
      const returnTo = validReturnTo(state.return_to);
      return res.redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}customerAuth=success`);
    } catch (error) {
      console.error('[Customer Apple OAuth]', error);
      return failure();
    }
  });

  router.get('/auth/google/start', (req, res) => {
    const google = googleConfig();
    if (!customerAuthReady() || !google.ready) return res.status(503).send('Connexion Google non configurée.');
    const state = randomBytes(32).toString('base64url');
    const stateId = hashToken(state);
    const now = new Date();
    const current = resolveCustomer(db, req);
    db.run(`INSERT INTO customer_oauth_states (id,account_id,provider,cart_session_id,return_to,expires_at,created_at)
      VALUES (?,?,'GOOGLE',?,?,?,?)`, stateId, current?.id || null, validCartSession(req.query.cartSessionId), validReturnTo(req.query.returnTo),
    new Date(now.getTime() + 10 * 60 * 1000).toISOString(), now.toISOString());
    const params = new URLSearchParams({
      client_id: google.clientId,
      redirect_uri: google.callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    res.append('Set-Cookie', googleOauthCookie(state, 10 * 60));
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  router.get('/auth/google/callback', async (req, res) => {
    const google = googleConfig();
    const stateValue = String(req.query.state || '');
    const browserState = requestCookie(req, GOOGLE_OAUTH_COOKIE);
    const stateHash = hashToken(stateValue);
    const browserStateMatches = Boolean(stateValue && browserState && hashToken(browserState) === stateHash);
    const state = browserStateMatches
      ? db.get<any>("SELECT * FROM customer_oauth_states WHERE id=? AND provider='GOOGLE' AND expires_at>?", stateHash, new Date().toISOString())
      : null;
    res.append('Set-Cookie', googleOauthCookie('', 0));
    const failure = () => res.redirect('/?customerAuth=error');
    if (!customerAuthReady() || !google.ready || !state || typeof req.query.code !== 'string') return failure();
    db.run('DELETE FROM customer_oauth_states WHERE id=?', state.id);
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: req.query.code,
          client_id: google.clientId,
          client_secret: google.clientSecret,
          redirect_uri: google.callbackUrl,
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!tokenResponse.ok) throw new Error('GOOGLE_TOKEN_FAILED');
      const tokens: any = await tokenResponse.json();
      const userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!userResponse.ok) throw new Error('GOOGLE_USERINFO_FAILED');
      const profile: any = await userResponse.json();
      const subject = String(profile.sub || '');
      const email = String(profile.email || '').trim().toLowerCase();
      if (!subject || !email || profile.email_verified !== true) throw new Error('GOOGLE_IDENTITY_INVALID');
      const now = new Date().toISOString();
      const identityOwnerId = db.get<any>(`SELECT account_id FROM customer_auth_identities WHERE provider='GOOGLE' AND provider_subject=?`, subject)?.account_id as string | undefined;
      const emailOwner = db.get<any>('SELECT id,email_verified_at FROM customer_accounts WHERE email=? COLLATE NOCASE', email);
      const emailOwnerGoogleIdentity = emailOwner
        ? db.get<any>(`SELECT provider_subject FROM customer_auth_identities WHERE account_id=? AND provider='GOOGLE' LIMIT 1`, emailOwner.id)
        : null;
      const verifiedLegacyEmailOwnerId = emailOwner?.email_verified_at && !emailOwnerGoogleIdentity ? emailOwner.id as string : undefined;
      if (emailOwner && !emailOwner.email_verified_at && emailOwner.id !== state.account_id && emailOwner.id !== identityOwnerId) {
        // An unverified profile address must never pre-hijack a later verified Google login.
        db.run('UPDATE customer_accounts SET email=NULL,email_verified_at=NULL,updated_at=? WHERE id=? AND email_verified_at IS NULL', now, emailOwner.id);
        notification(db, emailOwner.id, 'ACCOUNT', 'Adresse e-mail retirée', 'Une adresse e-mail non vérifiée a été retirée de votre profil car elle a été vérifiée sur un autre compte.', '/compte/profil');
      }
      if (emailOwner?.email_verified_at && emailOwnerGoogleIdentity && emailOwner.id !== identityOwnerId) {
        throw new Error('GOOGLE_EMAIL_CONFLICT');
      }
      // A flow started while authenticated explicitly links into that account. For a
      // normal sign-in, the stable Google subject takes precedence over a legacy email.
      let accountId = (state.account_id || identityOwnerId || verifiedLegacyEmailOwnerId) as string | undefined;
      if (!accountId) {
        accountId = `account_${randomUUID()}`;
        db.run(`INSERT INTO customer_accounts
          (id,display_name,email,avatar_url,email_verified_at,status,last_login_at,created_at,updated_at)
          VALUES (?,?,?,?,?,'ACTIVE',?,?,?)`, accountId, String(profile.name || 'Client AYROVI').slice(0, 100), email,
        String(profile.picture || '').slice(0, 1000), now, now, now, now);
        notification(db, accountId, 'ACCOUNT', 'Bienvenue chez AYROVI', 'Votre compte Google est actif. Vérifiez votre téléphone avant votre première commande.', '/compte');
      } else {
        for (const ownerId of new Set([identityOwnerId, verifiedLegacyEmailOwnerId].filter((id): id is string => Boolean(id)))) {
          if (ownerId !== accountId && accountRow(db, ownerId)) accountId = mergeAccounts(db, ownerId, accountId);
        }
        const currentAccount = accountRow(db, accountId);
        if (!currentAccount) throw new Error('ACCOUNT_MERGE_FAILED');
        const adoptGoogleEmail = !currentAccount.email || !currentAccount.email_verified_at || currentAccount.email.toLowerCase() === email;
        db.run(`UPDATE customer_accounts SET display_name=CASE WHEN display_name='' OR display_name='Client AYROVI' THEN ? ELSE display_name END,
          email=?,avatar_url=CASE WHEN ?!='' THEN ? ELSE avatar_url END,email_verified_at=?,last_login_at=?,updated_at=? WHERE id=?`,
        String(profile.name || 'Client AYROVI').slice(0, 100), adoptGoogleEmail ? email : currentAccount.email,
        String(profile.picture || ''), String(profile.picture || '').slice(0, 1000),
        adoptGoogleEmail ? now : currentAccount.email_verified_at, now, now, accountId);
      }
      db.run(`INSERT OR IGNORE INTO customer_auth_identities (id,account_id,provider,provider_subject,created_at)
        VALUES (?,?,'GOOGLE',?,?)`, `identity_${randomUUID()}`, accountId, subject, now);
      if (state.cart_session_id) db.attachCartToAccount(state.cart_session_id, accountId);
      const prior = resolveCustomer(db, req) as any;
      if (prior?.sessionId) db.run('DELETE FROM customer_sessions WHERE id=?', prior.sessionId);
      const session = createCustomerSession(db, accountId, req);
      setCustomerCookie(res, session.token);
      const returnTo = validReturnTo(state.return_to);
      return res.redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}customerAuth=success`);
    } catch (error) {
      console.error('[Customer Google OAuth]', error);
      return failure();
    }
  });

  router.get('/auth/facebook/start', (req, res) => {
    const facebook = facebookConfig();
    if (!customerAuthReady() || !facebook.ready) return res.status(503).send('Connexion Facebook non configurée.');
    const state = randomBytes(32).toString('base64url');
    const stateId = hashToken(state);
    const now = new Date();
    const current = resolveCustomer(db, req);
    db.run(`INSERT INTO customer_oauth_states (id,account_id,provider,cart_session_id,return_to,expires_at,created_at)
      VALUES (?,?,'FACEBOOK',?,?,?,?)`, stateId, current?.id || null, validCartSession(req.query.cartSessionId), validReturnTo(req.query.returnTo),
    new Date(now.getTime() + 10 * 60 * 1000).toISOString(), now.toISOString());
    const params = new URLSearchParams({
      client_id: facebook.appId,
      redirect_uri: facebook.callbackUrl,
      response_type: 'code',
      scope: 'public_profile,email',
      state,
    });
    res.append('Set-Cookie', facebookOauthCookie(state, 10 * 60));
    return res.redirect(`https://www.facebook.com/${facebook.graphVersion}/dialog/oauth?${params}`);
  });

  router.get('/auth/facebook/callback', async (req, res) => {
    const facebook = facebookConfig();
    const stateValue = String(req.query.state || '');
    const browserState = requestCookie(req, FACEBOOK_OAUTH_COOKIE);
    const stateHash = hashToken(stateValue);
    const browserStateMatches = Boolean(stateValue && browserState && hashToken(browserState) === stateHash);
    const state = browserStateMatches
      ? db.get<any>("SELECT * FROM customer_oauth_states WHERE id=? AND provider='FACEBOOK' AND expires_at>?", stateHash, new Date().toISOString())
      : null;
    res.append('Set-Cookie', facebookOauthCookie('', 0));
    const failure = () => res.redirect('/?customerAuth=facebook_error');
    if (!customerAuthReady() || !facebook.ready || !state || typeof req.query.code !== 'string') return failure();
    db.run('DELETE FROM customer_oauth_states WHERE id=?', state.id);
    try {
      const tokenUrl = new URL(`https://graph.facebook.com/${facebook.graphVersion}/oauth/access_token`);
      tokenUrl.search = new URLSearchParams({
        client_id: facebook.appId,
        client_secret: facebook.appSecret,
        redirect_uri: facebook.callbackUrl,
        code: req.query.code,
      }).toString();
      const tokenResponse = await fetch(tokenUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!tokenResponse.ok) throw new Error('FACEBOOK_TOKEN_FAILED');
      const tokens: any = await tokenResponse.json();
      const accessToken = String(tokens.access_token || '');
      if (!accessToken) throw new Error('FACEBOOK_TOKEN_INVALID');

      // Confirm that Meta issued the token for this exact AYROVI app before trusting /me.
      const debugUrl = new URL(`https://graph.facebook.com/${facebook.graphVersion}/debug_token`);
      debugUrl.search = new URLSearchParams({
        input_token: accessToken,
        access_token: `${facebook.appId}|${facebook.appSecret}`,
      }).toString();
      const debugResponse = await fetch(debugUrl, { signal: AbortSignal.timeout(10_000) });
      if (!debugResponse.ok) throw new Error('FACEBOOK_TOKEN_DEBUG_FAILED');
      const debugPayload: any = await debugResponse.json();
      const debugData = debugPayload?.data || {};
      if (debugData.is_valid !== true || String(debugData.app_id || '') !== facebook.appId || !debugData.user_id) {
        throw new Error('FACEBOOK_TOKEN_REJECTED');
      }

      const profileUrl = new URL(`https://graph.facebook.com/${facebook.graphVersion}/me`);
      profileUrl.searchParams.set('fields', 'id,name,email,picture.width(256).height(256)');
      const userResponse = await fetch(profileUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!userResponse.ok) throw new Error('FACEBOOK_USERINFO_FAILED');
      const profile: any = await userResponse.json();
      const subject = String(profile.id || '');
      if (!subject || subject !== String(debugData.user_id) || !/^[A-Za-z0-9._-]{1,128}$/.test(subject)) {
        throw new Error('FACEBOOK_IDENTITY_INVALID');
      }
      const rawEmail = String(profile.email || '').trim().toLowerCase();
      const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail.slice(0, 254) : '';
      const displayName = String(profile.name || 'Client AYROVI').trim().slice(0, 100) || 'Client AYROVI';
      const rawAvatar = profile.picture?.data?.is_silhouette ? '' : String(profile.picture?.data?.url || '');
      const avatarUrl = rawAvatar.startsWith('https://') ? rawAvatar.slice(0, 1000) : '';
      const now = new Date().toISOString();
      const identityOwnerId = db.get<any>(`SELECT account_id FROM customer_auth_identities WHERE provider='FACEBOOK' AND provider_subject=?`, subject)?.account_id as string | undefined;

      // Facebook email is optional and is not used as proof to merge accounts. A
      // signed-in user may explicitly link; otherwise only the stable app-scoped ID
      // can reopen an existing Facebook account.
      let accountId = (state.account_id || identityOwnerId) as string | undefined;
      if (state.account_id && identityOwnerId && state.account_id !== identityOwnerId) {
        accountId = mergeAccounts(db, identityOwnerId, state.account_id);
      }
      if (!accountId) {
        accountId = `account_${randomUUID()}`;
        const emailOwner = email ? db.get<any>('SELECT id FROM customer_accounts WHERE email=? COLLATE NOCASE', email) : null;
        db.run(`INSERT INTO customer_accounts
          (id,display_name,email,avatar_url,status,last_login_at,created_at,updated_at)
          VALUES (?,?,?,?, 'ACTIVE',?,?,?)`, accountId, displayName, email && !emailOwner ? email : null, avatarUrl, now, now, now);
        notification(db, accountId, 'ACCOUNT', 'Bienvenue chez AYROVI', 'Votre compte Facebook est actif. Vous pouvez ajouter un téléphone à votre profil à tout moment.', '/compte');
      } else {
        const currentAccount = accountRow(db, accountId);
        if (!currentAccount) throw new Error('ACCOUNT_MERGE_FAILED');
        const emailOwner = email
          ? db.get<any>('SELECT id FROM customer_accounts WHERE email=? COLLATE NOCASE AND id!=?', email, accountId)
          : null;
        const nextEmail = !currentAccount.email && email && !emailOwner ? email : currentAccount.email;
        const nextAvatar = currentAccount.avatar_url || avatarUrl;
        db.run(`UPDATE customer_accounts SET
          display_name=CASE WHEN display_name='' OR display_name='Client AYROVI' THEN ? ELSE display_name END,
          email=?,avatar_url=?,last_login_at=?,updated_at=? WHERE id=?`,
        displayName, nextEmail || null, nextAvatar, now, now, accountId);
      }
      db.run(`INSERT OR IGNORE INTO customer_auth_identities (id,account_id,provider,provider_subject,created_at)
        VALUES (?,?,'FACEBOOK',?,?)`, `identity_${randomUUID()}`, accountId, subject, now);
      if (state.cart_session_id) db.attachCartToAccount(state.cart_session_id, accountId);
      const prior = resolveCustomer(db, req) as any;
      if (prior?.sessionId) db.run('DELETE FROM customer_sessions WHERE id=?', prior.sessionId);
      const session = createCustomerSession(db, accountId, req);
      setCustomerCookie(res, session.token);
      const returnTo = validReturnTo(state.return_to);
      return res.redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}customerAuth=facebook_success`);
    } catch (error) {
      console.error('[Customer Facebook OAuth]', error);
      return failure();
    }
  });

  router.post('/auth/logout', requireCustomer(db), (req, res) => {
    destroyCustomerSession(db, req);
    clearCustomerCookie(res);
    return res.json({ success: true });
  });

  router.delete('/account', requireCustomer(db), (req, res) => {
    if (String(req.body?.confirmation || '') !== 'SUPPRIMER') {
      return res.status(400).json({ success: false, code: 'DELETION_CONFIRMATION_REQUIRED', error: 'Confirmez explicitement la suppression du compte.' });
    }
    const account = customerFromRequest(req);
    db.transaction(() => {
      // Les commandes et documents comptables restent dissociés du compte pour
      // respecter les obligations opérationnelles; le profil, les identités OAuth,
      // sessions, adresses, favoris et données personnelles de compte sont supprimés.
      db.run('UPDATE orders SET account_id=NULL WHERE account_id=?', account.id);
      db.run('DELETE FROM story_interactions WHERE account_id=?', account.id);
      if (db.get<any>("SELECT 1 FROM sqlite_master WHERE type='table' AND name='assistant_feedback'")) {
        db.run('DELETE FROM assistant_feedback WHERE account_id=?', account.id);
      }
      if (db.get<any>("SELECT 1 FROM sqlite_master WHERE type='table' AND name='assistant_support_tickets'")) {
        db.run('DELETE FROM assistant_support_tickets WHERE account_id=?', account.id);
      }
      db.run('DELETE FROM customer_accounts WHERE id=?', account.id);
    });
    clearCustomerCookie(res);
    return res.json({ success: true, data: { deleted: true } });
  });

  router.get('/account/overview', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const summary = db.get<any>(`SELECT COUNT(*) order_count,COALESCE(SUM(CASE WHEN status!='CANCELLED' THEN total_tnd ELSE 0 END),0) total_spent
      FROM orders WHERE account_id=?`, account.id);
    const unread = Number(db.get<any>('SELECT COUNT(*) count FROM customer_notifications WHERE account_id=? AND read_at IS NULL', account.id)?.count || 0);
    const addressCount = Number(db.get<any>('SELECT COUNT(*) count FROM customer_addresses WHERE account_id=?', account.id)?.count || 0);
    const favoriteCount = Number(db.get<any>('SELECT COUNT(*) count FROM customer_favorites WHERE account_id=?', account.id)?.count || 0);
    const cartCount = Number(db.get<any>('SELECT COALESCE(SUM(quantity),0) count FROM cart_items WHERE account_id=?', account.id)?.count || 0);
    const recentOrders = db.all<any>(`SELECT o.id,o.order_number,o.status,o.payment_status,o.total_tnd,o.created_at,
      (SELECT image_url FROM order_items WHERE order_id=o.id ORDER BY created_at LIMIT 1) image_url,
      (SELECT COUNT(*) FROM order_items WHERE order_id=o.id) item_count
      FROM orders o WHERE o.account_id=? ORDER BY o.created_at DESC LIMIT 3`, account.id);
    return res.json({ success: true, data: {
      account: publicAccount(accountRow(db, account.id)),
      counts: { orders: Number(summary?.order_count || 0), addresses: addressCount, favorites: favoriteCount, cartItems: cartCount, unreadNotifications: unread },
      totalSpent: Number(summary?.total_spent || 0),
      recentOrders,
    } });
  });

  router.put('/account/profile', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const displayName = String(req.body?.displayName || '').trim().slice(0, 100);
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase().slice(0, 254) : null;
    if (!displayName) return res.status(400).json({ success: false, error: 'Le nom est obligatoire.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, error: 'Adresse e-mail invalide.' });
    const existingEmail = email ? db.get<any>('SELECT id FROM customer_accounts WHERE email=? COLLATE NOCASE AND id!=?', email, account.id) : null;
    if (existingEmail) return res.status(409).json({ success: false, error: 'Cette adresse e-mail est déjà utilisée.' });
    const current = accountRow(db, account.id);
    const emailChanged = String(current?.email || '') !== String(email || '');
    db.run(`UPDATE customer_accounts SET display_name=?,email=?,email_verified_at=CASE WHEN ? THEN NULL ELSE email_verified_at END,
      marketing_opt_in=?,updated_at=? WHERE id=?`, displayName, email, emailChanged ? 1 : 0, req.body?.marketingOptIn ? 1 : 0, new Date().toISOString(), account.id);
    return res.json({ success: true, data: publicAccount(accountRow(db, account.id)) });
  });

  router.get('/account/addresses', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    return res.json({ success: true, data: db.all<any>('SELECT * FROM customer_addresses WHERE account_id=? ORDER BY is_default DESC,created_at DESC', account.id) });
  });

  router.post('/account/addresses', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const address = validateAddress(req.body);
    if (!address) return res.status(400).json({ success: false, error: 'Complétez le destinataire, le téléphone, le gouvernorat et l’adresse.' });
    const now = new Date().toISOString();
    const count = Number(db.get<any>('SELECT COUNT(*) count FROM customer_addresses WHERE account_id=?', account.id)?.count || 0);
    const makeDefault = address.isDefault || count === 0;
    const id = `address_${randomUUID()}`;
    db.transaction(() => {
      if (makeDefault) db.run('UPDATE customer_addresses SET is_default=0,updated_at=? WHERE account_id=?', now, account.id);
      db.run(`INSERT INTO customer_addresses
        (id,account_id,label,recipient_name,phone,governorate,city,postal_code,address_line,delivery_notes,is_default,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, account.id, address.label, address.recipientName, address.phone,
      address.governorate, address.city, address.postalCode, address.addressLine, address.deliveryNotes, makeDefault ? 1 : 0, now, now);
    });
    return res.status(201).json({ success: true, data: db.get<any>('SELECT * FROM customer_addresses WHERE id=?', id) });
  });

  router.put('/account/addresses/:id', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const existing = db.get<any>('SELECT * FROM customer_addresses WHERE id=? AND account_id=?', req.params.id, account.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Adresse introuvable.' });
    const address = validateAddress(req.body);
    if (!address) return res.status(400).json({ success: false, error: 'Adresse incomplète.' });
    const now = new Date().toISOString();
    const makeDefault = address.isDefault || Boolean(existing.is_default);
    db.transaction(() => {
      if (makeDefault) db.run('UPDATE customer_addresses SET is_default=0,updated_at=? WHERE account_id=?', now, account.id);
      db.run(`UPDATE customer_addresses SET label=?,recipient_name=?,phone=?,governorate=?,city=?,postal_code=?,
        address_line=?,delivery_notes=?,is_default=?,updated_at=? WHERE id=? AND account_id=?`, address.label, address.recipientName,
      address.phone, address.governorate, address.city, address.postalCode, address.addressLine, address.deliveryNotes,
      makeDefault ? 1 : 0, now, existing.id, account.id);
    });
    return res.json({ success: true, data: db.get<any>('SELECT * FROM customer_addresses WHERE id=?', existing.id) });
  });

  router.delete('/account/addresses/:id', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const existing = db.get<any>('SELECT * FROM customer_addresses WHERE id=? AND account_id=?', req.params.id, account.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Adresse introuvable.' });
    db.run('DELETE FROM customer_addresses WHERE id=? AND account_id=?', existing.id, account.id);
    if (existing.is_default) {
      const next = db.get<any>('SELECT id FROM customer_addresses WHERE account_id=? ORDER BY created_at DESC LIMIT 1', account.id);
      if (next) db.run('UPDATE customer_addresses SET is_default=1,updated_at=? WHERE id=?', new Date().toISOString(), next.id);
    }
    return res.json({ success: true });
  });

  router.get('/account/orders', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const rows = db.all<any>(`SELECT o.id,o.order_number,o.status,o.payment_status,o.payment_method,o.total_tnd,o.governorate,o.created_at,
      COALESCE(SUM(oi.quantity),0) item_count,(SELECT image_url FROM order_items WHERE order_id=o.id ORDER BY created_at LIMIT 1) image_url
      FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.account_id=? GROUP BY o.id ORDER BY o.created_at DESC`, account.id);
    return res.json({ success: true, data: rows });
  });

  router.get('/account/orders/:id', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const order = db.get<any>('SELECT * FROM orders WHERE id=? AND account_id=?', req.params.id, account.id);
    if (!order) return res.status(404).json({ success: false, error: 'Commande introuvable.' });
    const payment = db.get<any>('SELECT * FROM payments WHERE order_id=?', order.id);
    const deliveryRow = db.get<any>('SELECT * FROM deliveries WHERE order_id=?', order.id);
    const trackingVisible = ['SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED'].includes(String(order.status));
    const delivery = deliveryRow ? {
      ...deliveryRow,
      carrier: trackingVisible ? deliveryRow.carrier : '',
      tracking_number: trackingVisible ? deliveryRow.tracking_number : '',
      tracking_url: trackingVisible ? deliveryRow.tracking_url : '',
      shipped_at: trackingVisible ? deliveryRow.shipped_at : null,
    } : null;
    const paidAmount = payment?.status === 'PAID' ? Number(payment.amount_tnd) : 0;
    const setting = (key: string) => String(db.get<any>('SELECT setting_value FROM settings WHERE setting_key=?', key)?.setting_value || '');
    return res.json({ success: true, data: {
      ...order,
      deposit_proof_path: undefined,
      paid_amount_tnd: paidAmount,
      remainder_tnd: Math.max(0, Math.round((Number(order.total_tnd) - paidAmount) * 1000) / 1000),
      items: db.all<any>('SELECT * FROM order_items WHERE order_id=? ORDER BY created_at', order.id),
      history: db.all<any>('SELECT * FROM order_status_history WHERE order_id=? ORDER BY created_at', order.id),
      payment,
      transactions: db.all<any>(`SELECT id,transaction_number,provider,provider_reference,amount_tnd,currency,status,failure_reason,confirmed_at,created_at
        FROM payment_transactions WHERE order_id=? AND account_id=? ORDER BY created_at DESC`, order.id, account.id),
      proofs: db.all<any>(`SELECT id,original_name,mime_type,size_bytes,transfer_reference,status,submitted_at,reviewed_at,rejection_reason
        FROM payment_proofs WHERE order_id=? AND account_id=? ORDER BY submitted_at DESC`, order.id, account.id),
      invoice: db.get<any>(`SELECT id,invoice_number,status,issued_at FROM invoices WHERE order_id=? AND account_id=?`, order.id, account.id) || null,
      delivery,
      paymentOptions: {
        choices: ['CARD','BANK_TRANSFER','POSTE'],
        cardGatewayAvailable: cardGatewayAvailable(),
        transfer: {
          companyName: setting('company_legal_name') || setting('company_name') || 'AYROVI',
          bankRib: setting('bank_rib'),
          posteAccount: setting('poste_account'),
          reviewDelay: setting('deposit_review_delay'),
        },
      },
    } });
  });

  router.post('/account/orders/:id/deposit/method', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const requested = String(req.body?.method || '').trim().toUpperCase();
    if (!['CARD','BANK_TRANSFER','POSTE'].includes(requested)) return res.status(400).json({ success: false, error: 'Choisissez carte bancaire, virement bancaire ou transfert postal.' });
    if (requested === 'BANK_TRANSFER' || requested === 'POSTE') {
      const settingKey = requested === 'POSTE' ? 'poste_account' : 'bank_rib';
      const coordinates = String(db.get<any>('SELECT setting_value FROM settings WHERE setting_key=?', settingKey)?.setting_value || '').trim();
      if (!coordinates) return res.status(503).json({ success: false, code: 'TRANSFER_DETAILS_UNAVAILABLE', error: 'Les coordonnées officielles de ce moyen de paiement ne sont pas encore publiées par AYROVI.' });
    }
    try {
      const selected = db.selectDepositMethod(req.params.id, requested as 'CARD' | 'BANK_TRANSFER' | 'POSTE', account.id);
      return res.json({ success: true, data: {
        method: requested,
        paymentStatus: selected.payment.status,
        quote: selected.quote,
        cardGatewayAvailable: cardGatewayAvailable(),
      } });
    } catch (error: any) {
      if (error?.message === 'ORDER_NOT_FOUND') return res.status(404).json({ success: false, error: 'Commande introuvable.' });
      return res.status(409).json({ success: false, error: 'Le mode de paiement ne peut plus être modifié pour cette commande.' });
    }
  });

  router.post('/account/orders/:id/payments/card/initiate', requireCustomer(db), async (req, res) => {
    const account = customerFromRequest(req);
    if (!cardGatewayAvailable()) return res.status(503).json({ success: false, code: 'CARD_GATEWAY_UNAVAILABLE', error: 'La passerelle carte n’est pas configurée. Aucun débit n’a été tenté.' });
    let created: any;
    try {
      created = db.createCardTransaction(req.params.id, account.id);
      if (created.reused) return res.json({ success: true, data: {
        payUrl: created.transaction.checkout_url,
        transactionNumber: created.transaction.transaction_number,
        amountTnd: created.transaction.amount_tnd,
        status: 'PENDING',
      } });
      const names = String(account.displayName || 'Client AYROVI').trim().split(/\s+/);
      const gateway = await initiateKonnectCardPayment({
        orderId: String(created.order.id),
        orderNumber: String(created.order.order_number),
        transactionNumber: String(created.transaction.transaction_number),
        amountTnd: Number(created.transaction.amount_tnd),
        firstName: names.shift() || 'Client',
        lastName: names.join(' ') || 'AYROVI',
        phone: String(created.order.phone || account.phone || ''),
        email: String(created.order.contact_email || account.email || ''),
      });
      db.bindCardGatewayReference(created.transaction.id, gateway.paymentRef, gateway.payUrl);
      return res.status(201).json({ success: true, data: {
        payUrl: gateway.payUrl,
        transactionNumber: created.transaction.transaction_number,
        amountTnd: created.transaction.amount_tnd,
        status: 'PENDING',
      } });
    } catch (error: any) {
      if (created?.transaction?.id && !created?.reused) db.markCardTransactionFailed(created.transaction.id, error?.message || 'Gateway initiation failed');
      if (error?.message === 'ORDER_NOT_FOUND') return res.status(404).json({ success: false, error: 'Commande introuvable.' });
      if (error?.message === 'CARD_TRANSACTION_PENDING') return res.status(409).json({ success: false, error: 'Un démarrage de paiement est déjà en cours. Réessayez dans un instant.' });
      if (error?.message === 'PAYMENT_METHOD_NOT_SELECTABLE') return res.status(409).json({ success: false, error: 'Cette commande ne peut plus être payée.' });
      console.error('[Card initiation]', error);
      return res.status(502).json({ success: false, code: 'CARD_GATEWAY_ERROR', error: 'La passerelle carte n’a pas pu démarrer le paiement. Aucun succès n’a été enregistré.' });
    }
  });

  router.get('/account/orders/:id/payments/card/verify', requireCustomer(db), async (req, res) => {
    const account = customerFromRequest(req);
    const transactionNumber = String(req.query.transaction || '').trim();
    const transaction = db.get<any>(`SELECT t.*,o.order_number FROM payment_transactions t
      JOIN orders o ON o.id=t.order_id WHERE t.order_id=? AND t.account_id=? AND t.transaction_number=? AND t.provider='KONNECT'`,
    req.params.id, account.id, transactionNumber);
    if (!transaction) return res.status(404).json({ success: false, error: 'Transaction carte introuvable.' });
    if (transaction.status === 'PAID') return res.json({ success: true, data: { status: 'PAID', transactionNumber } });
    if (transaction.status === 'FAILED') return res.json({ success: true, data: { status: 'FAILED', transactionNumber } });
    if (!transaction.provider_reference) return res.status(409).json({ success: false, error: 'La passerelle n’a pas encore fourni de référence.' });
    try {
      const verification = await verifyKonnectCardPayment({
        paymentRef: String(transaction.provider_reference),
        expectedAmountTnd: Number(transaction.amount_tnd),
        expectedOrderNumber: String(transaction.order_number),
        expectedTransactionNumber: String(transaction.transaction_number),
      });
      if (verification.state === 'PAID') db.confirmCardTransaction(transaction.id, verification.auditPayload);
      else if (verification.state === 'FAILED') db.markCardTransactionFailed(transaction.id, 'Paiement carte refusé ou expiré.', verification.auditPayload);
      return res.json({ success: true, data: { status: verification.state, transactionNumber } });
    } catch (error) {
      console.error('[Card verification]', error);
      return res.status(502).json({ success: false, error: 'La vérification bancaire est temporairement indisponible.' });
    }
  });

  router.get('/account/payments', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const payments = db.all<any>(`SELECT p.id,p.payment_number,p.order_id,o.order_number,p.method,p.status,p.amount_tnd,p.currency,p.reference,
      p.provider,p.confirmed_at,p.created_at,p.updated_at FROM payments p JOIN orders o ON o.id=p.order_id
      WHERE o.account_id=? ORDER BY p.created_at DESC`, account.id);
    const transactions = db.all<any>(`SELECT t.id,t.transaction_number,t.payment_id,t.order_id,o.order_number,t.provider,t.provider_reference,
      t.amount_tnd,t.currency,t.status,t.failure_reason,t.confirmed_at,t.created_at FROM payment_transactions t JOIN orders o ON o.id=t.order_id
      WHERE t.account_id=? ORDER BY t.created_at DESC`, account.id);
    return res.json({ success: true, data: { payments, transactions } });
  });

  router.get('/account/invoices', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    return res.json({ success: true, data: db.all<any>(`SELECT i.id,i.invoice_number,i.order_id,o.order_number,i.status,i.issued_at
      FROM invoices i JOIN orders o ON o.id=i.order_id WHERE i.account_id=? ORDER BY i.issued_at DESC`, account.id) });
  });

  router.get('/account/tracking', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    return res.json({ success: true, data: db.all<any>(`SELECT d.id,d.order_id,o.order_number,o.status,d.status delivery_status,d.carrier,
      d.tracking_number,d.tracking_url,d.shipped_at,d.expected_at,d.delivered_at FROM deliveries d JOIN orders o ON o.id=d.order_id
      WHERE o.account_id=? AND o.status IN ('SHIPPED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED')
        AND d.tracking_number!='' ORDER BY d.shipped_at DESC`, account.id) });
  });

  router.get('/account/security', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const row = accountRow(db, account.id);
    return res.json({ success: true, data: {
      emailVerified: Boolean(row?.email_verified_at), phoneVerified: Boolean(row?.phone_verified_at),
      identities: db.all<any>('SELECT provider,created_at FROM customer_auth_identities WHERE account_id=? ORDER BY created_at', account.id),
      activeSessions: Number(db.get<any>('SELECT COUNT(*) count FROM customer_sessions WHERE account_id=? AND expires_at>?', account.id, new Date().toISOString())?.count || 0),
      lastLoginAt: row?.last_login_at || null,
    } });
  });

  router.get('/account/preferences', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const preferences = db.get<any>('SELECT * FROM customer_preferences WHERE account_id=?', account.id);
    return res.json({ success: true, data: preferences || {
      account_id: account.id, dark_mode: 0, order_updates: 1, payment_updates: 1, shipping_updates: 1, invoice_updates: 1,
    } });
  });

  router.put('/account/preferences', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const value = (key: string, fallback = true) => req.body?.[key] === undefined ? (fallback ? 1 : 0) : (req.body[key] ? 1 : 0);
    const now = new Date().toISOString();
    db.run(`INSERT INTO customer_preferences (account_id,dark_mode,order_updates,payment_updates,shipping_updates,invoice_updates,updated_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET dark_mode=excluded.dark_mode,order_updates=excluded.order_updates,
      payment_updates=excluded.payment_updates,shipping_updates=excluded.shipping_updates,invoice_updates=excluded.invoice_updates,updated_at=excluded.updated_at`,
    account.id, value('darkMode', false), value('orderUpdates'), value('paymentUpdates'), value('shippingUpdates'), value('invoiceUpdates'), now);
    return res.json({ success: true, data: db.get<any>('SELECT * FROM customer_preferences WHERE account_id=?', account.id) });
  });

  // ===== Justificatif du virement bancaire/postal (upload != paiement) =====
  const proofUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });
  const PROOF_SIGNATURES: Array<{ ext: string; mime: string; test: (b: Buffer) => boolean }> = [
    { ext: 'jpg', mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { ext: 'png', mime: 'image/png', test: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 },
    { ext: 'pdf', mime: 'application/pdf', test: (b) => b.length > 5 && b.toString('ascii', 0, 5) === '%PDF-' },
  ];

  router.post('/account/orders/:id/deposit-proof', requireCustomer(db), proofUpload.single('proof'), (req: Request, res) => {
    const account = customerFromRequest(req);
    const order = db.get<any>('SELECT id,account_id,status,payment_status,payment_method,deposit_status,order_number FROM orders WHERE id=?', req.params.id);
    if (!order || order.account_id !== account.id) return res.status(404).json({ success: false, error: 'Commande introuvable.' });
    if (order.status !== 'AWAITING_DEPOSIT' || !['BANK_TRANSFER','POSTE'].includes(String(order.payment_method))
      || !['PENDING','FAILED','REJECTED'].includes(String(order.payment_status))) {
      return res.status(409).json({ success: false, error: 'Cette commande n’accepte pas de justificatif de virement.' });
    }
    const coordinateKey = order.payment_method === 'POSTE' ? 'poste_account' : 'bank_rib';
    const coordinates = String(db.get<any>('SELECT setting_value FROM settings WHERE setting_key=?', coordinateKey)?.setting_value || '').trim();
    if (!coordinates) return res.status(503).json({ success: false, code: 'TRANSFER_DETAILS_UNAVAILABLE', error: 'Les coordonnées officielles de ce moyen de paiement ne sont pas publiées.' });
    const transferReference = String(req.body?.transferReference || '').trim().slice(0, 120);
    if (!transferReference) return res.status(400).json({ success: false, error: 'Indiquez la référence du virement ou du versement postal.' });
    const file = req.file;
    if (!file || !file.buffer?.length) return res.status(400).json({ success: false, error: 'Fichier de preuve manquant (JPG, PNG ou PDF, 10 Mo max).' });
    const signature = PROOF_SIGNATURES.find((candidate) => candidate.test(file.buffer));
    if (!signature) return res.status(415).json({ success: false, error: 'Format non supporté : JPG, PNG ou PDF uniquement.' });

    const filename = `${order.id}-${Date.now()}-${randomInt(1000, 9999)}.${signature.ext}`;
    const absolute = path.join(uploadsDir('deposits'), filename);
    fs.writeFileSync(absolute, file.buffer);
    try {
      const updated = db.attachDepositProof(order.id, {
        path: absolute,
        accountId: account.id,
        originalName: file.originalname || filename,
        mimeType: signature.mime,
        sizeBytes: file.size,
        transferReference,
      });
      // تنبيه بريدي اختياري للإدارة (وصل جديد بانتظار المراجعة) — لا يُفشل الطلب إن تعذّر
      const alertEmail = String(db.get<any>("SELECT setting_value FROM settings WHERE setting_key='admin_alert_email'")?.setting_value || '').trim();
      if (alertEmail) {
        void sendMail({
          to: alertEmail,
          subject: `🔔 Acompte à vérifier — commande ${order.order_number}`,
          html: `<p>Un justificatif vient d'être téléversé pour la commande <strong>${order.order_number}</strong> (${Number(updated.order.deposit_amount_tnd).toFixed(3)} DT).</p><p>Ouvrez le tableau des commandes pour le vérifier.</p>`,
        }).catch(() => undefined);
      }
      res.json({ success: true, data: { paymentStatus: updated.order.payment_status, proofStatus: updated.proof.status, submittedAt: updated.proof.submitted_at } });
    } catch (error: any) {
      fs.rmSync(absolute, { force: true });
      res.status(error?.message === 'DEPOSIT_NOT_SUBMITTABLE' ? 409 : 500).json({ success: false, error: 'La preuve n’a pas pu être enregistrée.' });
    }
  });

  // ===== تحميل الفاتورة الإلكترونية (مالك الطلب فقط) =====
  router.get('/account/orders/:id/invoice', requireCustomer(db), (req: Request, res) => {
    const account = customerFromRequest(req);
    const order = db.get<any>('SELECT id,account_id FROM orders WHERE id=?', req.params.id);
    if (!order || order.account_id !== account.id) return res.status(404).json({ success: false, error: 'Commande introuvable.' });
    const invoice = db.get<any>("SELECT * FROM invoices WHERE order_id=? AND account_id=? AND status='ISSUED'", order.id, account.id);
    if (!invoice?.invoice_number || !invoice?.file_path) return res.status(404).json({ success: false, error: 'Facture non émise ou fichier pas encore disponible.' });
    const absolute = invoiceAbsolutePath(String(invoice.invoice_number));
    if (path.resolve(invoice.file_path) !== path.resolve(absolute) || !fs.existsSync(absolute)) {
      return res.status(404).json({ success: false, error: 'Fichier de facture indisponible.' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${String(invoice.invoice_number).replace(/[^A-Z0-9-]/gi, '')}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(absolute).pipe(res);
  });

  router.get('/account/favorites', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    return res.json({ success: true, data: db.all<any>('SELECT * FROM customer_favorites WHERE account_id=? ORDER BY created_at DESC', account.id) });
  });

  router.post('/account/favorites', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const productId = req.body?.productId ? String(req.body.productId) : null;
    const product = productId ? db.get<any>("SELECT * FROM products WHERE id=? AND status='ACTIVE'", productId) : null;
    const sourceUrl = String(req.body?.sourceUrl || product?.source_url || '').trim().slice(0, 2000);
    const title = String(req.body?.title || product?.name || '').trim().slice(0, 250);
    if (!title || (!sourceUrl && !product)) return res.status(400).json({ success: false, error: 'Produit favori invalide.' });
    const existing = product
      ? db.get<any>('SELECT * FROM customer_favorites WHERE account_id=? AND product_id=?', account.id, product.id)
      : db.get<any>('SELECT * FROM customer_favorites WHERE account_id=? AND source_url=?', account.id, sourceUrl);
    if (existing) return res.json({ success: true, data: existing });
    const id = `favorite_${randomUUID()}`;
    db.run(`INSERT INTO customer_favorites (id,account_id,product_id,source_url,title,image_url,price_tnd,created_at)
      VALUES (?,?,?,?,?,?,?,?)`, id, account.id, product?.id || null, sourceUrl, title,
    String(req.body?.imageUrl || product?.image || '').slice(0, 2000), Number(req.body?.priceTND ?? product?.final_price) || null, new Date().toISOString());
    return res.status(201).json({ success: true, data: db.get<any>('SELECT * FROM customer_favorites WHERE id=?', id) });
  });

  router.delete('/account/favorites/:id', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const removed = db.run('DELETE FROM customer_favorites WHERE id=? AND account_id=?', req.params.id, account.id).changes;
    return removed ? res.json({ success: true }) : res.status(404).json({ success: false, error: 'Favori introuvable.' });
  });

  router.get('/account/notifications', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    return res.json({ success: true, data: db.all<any>('SELECT * FROM customer_notifications WHERE account_id=? ORDER BY created_at DESC LIMIT 100', account.id) });
  });

  router.put('/account/notifications/read', requireCustomer(db), (req, res) => {
    const account = customerFromRequest(req);
    const now = new Date().toISOString();
    if (req.body?.id) db.run('UPDATE customer_notifications SET read_at=? WHERE id=? AND account_id=?', now, String(req.body.id), account.id);
    else db.run('UPDATE customer_notifications SET read_at=? WHERE account_id=? AND read_at IS NULL', now, account.id);
    return res.json({ success: true });
  });

  return router;
}
