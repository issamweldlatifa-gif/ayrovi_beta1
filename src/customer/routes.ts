import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { Request, Router } from 'express';
import { QatafoDatabase } from '../db/database';
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
import { deliverOtp, phoneOtpAvailable } from './otp';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_PHONE_WINDOW_MS = 15 * 60 * 1000;
const OTP_IP_WINDOW_MS = 15 * 60 * 1000;
const GOOGLE_OAUTH_COOKIE = 'ayrovi_customer_oauth';

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

function googleOauthCookie(value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(value)}; Path=/api/customer/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function normalizeTunisianPhone(value: unknown): string | null {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00216')) digits = digits.slice(5);
  else if (digits.startsWith('216') && digits.length === 11) digits = digits.slice(3);
  if (!/^[24579]\d{7}$/.test(digits)) return null;
  return `+216${digits}`;
}

function validCartSession(value: unknown): string {
  const session = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{8,128}$/.test(session) ? session : '';
}

function validReturnTo(value: unknown): string {
  const path = String(value || '/').trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/';
  return path.slice(0, 500);
}

function googleConfig() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const baseUrl = String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
  const callbackUrl = String(process.env.GOOGLE_CALLBACK_URL || (baseUrl ? `${baseUrl}/api/customer/auth/google/callback` : '')).trim();
  return { clientId, clientSecret, callbackUrl, ready: Boolean(clientId && clientSecret && callbackUrl.startsWith('https://')) };
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
        ? db.get<any>(`SELECT * FROM cart_items WHERE account_id=? AND store=? AND external_id=? AND IFNULL(variant,'')=IFNULL(?,'')`, targetId, item.store, item.external_id, item.variant || '')
        : db.get<any>(`SELECT * FROM cart_items WHERE account_id=? AND store=? AND source_url=? AND title=? AND IFNULL(variant,'')=IFNULL(?,'')`, targetId, item.store, item.source_url, item.title, item.variant || '');
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

  router.get('/auth/config', (_req, res) => {
    const google = googleConfig();
    res.json({ success: true, data: {
      phoneOtp: { enabled: customerAuthReady() && phoneOtpAvailable() },
      google: { enabled: customerAuthReady() && google.ready },
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
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS).toISOString();
    db.run('UPDATE customer_otp_challenges SET consumed_at=? WHERE phone=? AND consumed_at IS NULL', now.toISOString(), phone);
    db.run(`INSERT INTO customer_otp_challenges
      (id,phone,code_hash,expires_at,max_attempts,request_ip,created_at) VALUES (?,?,?,?,5,?,?)`,
    challengeId, phone, keyedHash(`${challengeId}:${phone}:${code}`), expiresAt, ip, now.toISOString());
    try {
      const delivery = await deliverOtp(phone, code);
      return res.status(201).json({ success: true, data: {
        challengeId,
        maskedPhone: `${phone.slice(0, 7)} ** *** ${phone.slice(-2)}`,
        expiresInSeconds: OTP_TTL_MS / 1000,
        ...(delivery.developmentCode ? { developmentCode: delivery.developmentCode } : {}),
      } });
    } catch (error) {
      db.run('DELETE FROM customer_otp_challenges WHERE id=?', challengeId);
      console.error('[Customer OTP Delivery]', error);
      return res.status(503).json({ success: false, code: 'OTP_DELIVERY_FAILED', error: 'Le SMS n’a pas pu être envoyé. Réessayez.' });
    }
  });

  router.post('/auth/otp/verify', (req, res) => {
    if (!customerAuthReady()) return res.status(503).json({ success: false, error: 'Authentification client non configurée.' });
    const challengeId = String(req.body?.challengeId || '');
    const code = String(req.body?.code || '').replace(/\D/g, '');
    const challenge = db.get<any>('SELECT * FROM customer_otp_challenges WHERE id=?', challengeId);
    const now = new Date().toISOString();
    if (!challenge || challenge.consumed_at || challenge.expires_at <= now) return res.status(400).json({ success: false, code: 'OTP_EXPIRED', error: 'Ce code a expiré. Demandez un nouveau SMS.' });
    if (Number(challenge.attempts) >= Number(challenge.max_attempts)) return res.status(429).json({ success: false, error: 'Trop de tentatives. Demandez un nouveau code.' });
    db.run('UPDATE customer_otp_challenges SET attempts=attempts+1 WHERE id=?', challengeId);
    if (code.length !== 6 || !safeEqualHash(`${challengeId}:${challenge.phone}:${code}`, challenge.code_hash)) {
      return res.status(400).json({ success: false, code: 'OTP_INVALID', error: 'Le code saisi est incorrect.' });
    }
    try {
      db.run('UPDATE customer_otp_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL', now, challengeId);
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

  router.get('/auth/google/start', (req, res) => {
    const google = googleConfig();
    if (!customerAuthReady() || !google.ready) return res.status(503).send('Connexion Google non configurée.');
    const state = randomBytes(32).toString('base64url');
    const stateId = hashToken(state);
    const now = new Date();
    const current = resolveCustomer(db, req);
    db.run(`INSERT INTO customer_oauth_states (id,account_id,cart_session_id,return_to,expires_at,created_at)
      VALUES (?,?,?,?,?,?)`, stateId, current?.id || null, validCartSession(req.query.cartSessionId), validReturnTo(req.query.returnTo),
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
      ? db.get<any>('SELECT * FROM customer_oauth_states WHERE id=? AND expires_at>?', stateHash, new Date().toISOString())
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

  router.post('/auth/logout', requireCustomer(db), (req, res) => {
    destroyCustomerSession(db, req);
    clearCustomerCookie(res);
    return res.json({ success: true });
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
    return res.json({ success: true, data: {
      ...order,
      items: db.all<any>('SELECT * FROM order_items WHERE order_id=? ORDER BY created_at', order.id),
      history: db.all<any>('SELECT * FROM order_status_history WHERE order_id=? ORDER BY created_at', order.id),
      payment: db.get<any>('SELECT * FROM payments WHERE order_id=?', order.id),
      delivery: db.get<any>('SELECT * FROM deliveries WHERE order_id=?', order.id),
    } });
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
