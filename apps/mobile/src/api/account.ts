/**
 * Compte client — appel de l'API et lecture STRICTE de ce qu'elle renvoie.
 *
 * Le serveur renvoie du JSON non typé (SQLite → `any`). Chaque réponse est donc
 * relue champ par champ ici : une forme inattendue doit produire une erreur
 * visible, jamais un écran à moitié peint avec des valeurs inventées.
 *
 * Contrat côté serveur (`src/customer/routes.ts`, `src/customer/accountSettings.ts`) :
 *   GET  /api/customer/auth/config          → { phoneOtp, email, google, facebook, apple, passwordReset }
 *   POST /api/customer/auth/otp/request     → { challengeId, maskedPhone, expiresInSeconds, developmentCode? }
 *   POST /api/customer/auth/otp/verify      → { account, csrfToken, session_token?, session_expires_at? }
 *   POST /api/customer/auth/email/register  → { account, csrfToken, session_token?, … }
 *   POST /api/customer/auth/email/login     → { account, csrfToken, session_token?, … }
 *   GET  /api/customer/auth/me              → { account, csrfToken, expiresAt }
 *   POST /api/customer/auth/logout          → {}            (écriture : CSRF exigé)
 *   GET  /api/customer/account/overview     → { account, counts, totalSpent, recentOrders }
 *   GET  /api/customer/account/orders       → [ { id, order_number, status, total_tnd, … } ]
 *
 * Le jeton (`session_token`) n'est présent que si le client s'est déclaré avec
 * `x-ayrovi-client` — c'est la couche réseau qui le pose (client.ts).
 */
import { apiGet, apiGetData, apiSend, apiSendForm, type RequestOptions } from './client';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface CustomerAccount {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  status: string;
  locale: string;
  marketingOptIn: boolean;
}

/** Ce que le serveur sait faire MAINTENANT — l'écran ne propose rien d'autre. */
export interface AuthConfig {
  phoneOtp: boolean;
  email: boolean;
  google: boolean;
  facebook: boolean;
  apple: boolean;
  passwordReset: boolean;
  /** Connexion par code envoyé à l'adresse e-mail (dans l'application). */
  emailCode: boolean;
  /** Google natif : seul l'identifiant Web doit être configuré côté serveur. */
  googleNative: boolean;
}

export interface SessionIssue {
  account: CustomerAccount;
  csrfToken: string;
  /** Présent uniquement pour un client mobile déclaré. */
  sessionToken: string;
  /** Date ISO d'expiration, quand le serveur l'annonce. */
  expiresAt: string;
  linkedHistoricalOrders: number;
}

export interface OtpChallenge {
  challengeId: string;
  maskedPhone: string;
  expiresInSeconds: number;
  /** Code affiché par le serveur quand aucun SMS réel n'est configuré (dev). */
  developmentCode: string;
}

/** Défi envoyé par e-mail : le code n'est jamais montré hors développement. */
export interface EmailCodeChallenge {
  challengeId: string;
  maskedEmail: string;
  expiresInSeconds: number;
  /** Code renvoyé par le serveur quand aucun service mail n'est configuré (dev). */
  developmentCode: string;
}

export interface OverviewCounts {
  orders: number;
  addresses: number;
  favorites: number;
  cartItems: number;
  unreadNotifications: number;
}

export interface RecentOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalTnd: number;
  createdAt: string;
  imageUrl: string;
  itemCount: number;
}

export interface AccountOverview {
  account: CustomerAccount;
  counts: OverviewCounts;
  totalSpent: number;
  recentOrders: RecentOrder[];
}

/* ── Profil, adresses, favoris, notifications, préférences ─────────────────── */

export interface Address {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  governorate: string;
  city: string;
  postalCode: string;
  addressLine: string;
  deliveryNotes: string;
  isDefault: boolean;
}

export interface Favorite {
  id: string;
  productId: string;
  sourceUrl: string;
  title: string;
  imageUrl: string;
  priceTnd: number | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl: string;
  readAt: string;
  createdAt: string;
}

export interface Preferences {
  darkMode: boolean;
  orderUpdates: boolean;
  paymentUpdates: boolean;
  shippingUpdates: boolean;
  invoiceUpdates: boolean;
}

export interface OrderItem {
  id: string;
  title: string;
  quantity: number;
  unitPriceTnd: number;
  totalTnd: number;
  imageUrl: string;
  sourceUrl: string;
  variant: string;
}

export interface OrderEvent {
  id: string;
  status: string;
  note: string;
  createdAt: string;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  totalTnd: number;
  paidTnd: number;
  remainderTnd: number;
  governorate: string;
  addressLine: string;
  createdAt: string;
  items: OrderItem[];
  history: OrderEvent[];
  tracking: { carrier: string; trackingNumber: string; trackingUrl: string; shippedAt: string };
  invoiceNumber: string;
  transfer: { companyName: string; bankRib: string; posteAccount: string; reviewDelay: string };
  /** ما يسمح بيه الخادم فعلاً لهذا الطلب (`paymentOptions`). */
  paymentOptions: { choices: string[]; cardGatewayAvailable: boolean };
}

export interface SecurityStatus {
  emailVerified: boolean;
  phoneVerified: boolean;
  hasPassword: boolean;
  identities: Array<{ provider: string; createdAt: string }>;
  activeSessions: number;
  lastLoginAt: string;
}

/* ── Lecture défensive ─────────────────────────────────────────────────────── */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (value: unknown): boolean => value === true || value === 1 || value === '1';

/** Identifiant SQLite : entier ou texte, toujours rendu en chaîne. */
const idOf = (value: unknown): string =>
  (typeof value === 'string' ? value
    : typeof value === 'number' && Number.isFinite(value) ? String(value) : '');

export function parseAccount(payload: unknown): CustomerAccount {
  if (!isRecord(payload)) {
    throw new Error('Compte illisible : le serveur n’a pas renvoyé d’objet.');
  }
  const id = idOf(payload.id);
  if (!id) throw new Error('Compte illisible : identifiant manquant.');
  return {
    id,
    displayName: str(payload.displayName).trim(),
    email: str(payload.email).trim(),
    phone: str(payload.phone).trim(),
    avatarUrl: str(payload.avatarUrl).trim(),
    emailVerified: bool(payload.emailVerified),
    phoneVerified: bool(payload.phoneVerified),
    status: str(payload.status),
    locale: str(payload.locale),
    marketingOptIn: bool(payload.marketingOptIn),
  };
}

export function parseAuthConfig(payload: unknown): AuthConfig {
  const row = isRecord(payload) ? payload : {};
  const enabled = (key: string) => isRecord(row[key]) && (row[key] as Record<string, unknown>).enabled === true;
  return {
    phoneOtp: enabled('phoneOtp'),
    email: enabled('email'),
    google: enabled('google'),
    facebook: enabled('facebook'),
    apple: enabled('apple'),
    passwordReset: enabled('passwordReset'),
    emailCode: enabled('emailCode'),
    googleNative: enabled('googleNative'),
  };
}

/**
 * Session issue d'une connexion. `sessionToken` vide = le serveur ne nous a PAS
 * reconnu comme client mobile (déclaration absente ou refusée) : l'appelant doit
 * le traiter comme un échec, pas comme une session valide sans jeton.
 */
export function parseSessionIssue(payload: unknown): SessionIssue {
  if (!isRecord(payload)) throw new Error('Réponse de connexion illisible.');
  return {
    account: parseAccount(payload.account),
    csrfToken: str(payload.csrfToken),
    // Les routes de reprise nomment le jeton `native_session_token` (même
    // valeur, même contrat) : on lit les deux plutôt que de laisser
    // l'application démarrer sans jeton et échouer au premier appel.
    sessionToken: str(payload.session_token) || str(payload.native_session_token),
    expiresAt: str(payload.session_expires_at) || str(payload.expiresAt),
    linkedHistoricalOrders: num(payload.linkedHistoricalOrders),
  };
}

export function parseOtpChallenge(payload: unknown): OtpChallenge {
  if (!isRecord(payload)) throw new Error('Défi SMS illisible.');
  const challengeId = str(payload.challengeId);
  if (!challengeId) throw new Error('Défi SMS illisible : identifiant manquant.');
  return {
    challengeId,
    maskedPhone: str(payload.maskedPhone),
    expiresInSeconds: num(payload.expiresInSeconds, 300),
    developmentCode: str(payload.developmentCode),
  };
}

export function parseEmailCodeChallenge(payload: unknown): EmailCodeChallenge {
  if (!isRecord(payload)) throw new Error('Défi e-mail illisible.');
  const challengeId = str(payload.challengeId);
  if (!challengeId) throw new Error('Défi e-mail illisible : identifiant manquant.');
  return {
    challengeId,
    maskedEmail: str(payload.maskedEmail),
    expiresInSeconds: num(payload.expiresInSeconds, 600),
    developmentCode: str(payload.developmentCode),
  };
}

export function parseRecentOrder(payload: unknown): RecentOrder | null {
  if (!isRecord(payload)) return null;
  const id = idOf(payload.id);
  if (!id) return null;
  return {
    id,
    orderNumber: str(payload.order_number),
    status: str(payload.status),
    paymentStatus: str(payload.payment_status),
    totalTnd: num(payload.total_tnd),
    createdAt: str(payload.created_at),
    imageUrl: str(payload.image_url),
    itemCount: num(payload.item_count),
  };
}

export function parseOverview(payload: unknown): AccountOverview {
  if (!isRecord(payload)) throw new Error('Synthèse de compte illisible.');
  const counts = isRecord(payload.counts) ? payload.counts : {};
  return {
    account: parseAccount(payload.account),
    counts: {
      orders: num(counts.orders),
      addresses: num(counts.addresses),
      favorites: num(counts.favorites),
      cartItems: num(counts.cartItems),
      unreadNotifications: num(counts.unreadNotifications),
    },
    totalSpent: num(payload.totalSpent),
    recentOrders: Array.isArray(payload.recentOrders)
      ? payload.recentOrders.flatMap((row) => {
        const parsed = parseRecentOrder(row);
        return parsed ? [parsed] : [];
      })
      : [],
  };
}

export function parseAddress(payload: unknown): Address | null {
  if (!isRecord(payload)) return null;
  const id = idOf(payload.id);
  if (!id) return null;
  return {
    id,
    label: str(payload.label),
    recipientName: str(payload.recipient_name),
    phone: str(payload.phone),
    governorate: str(payload.governorate),
    city: str(payload.city),
    postalCode: str(payload.postal_code),
    addressLine: str(payload.address_line),
    deliveryNotes: str(payload.delivery_notes),
    isDefault: bool(payload.is_default),
  };
}

export function parseAddresses(payload: unknown): Address[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((row) => {
    const parsed = parseAddress(row);
    return parsed ? [parsed] : [];
  });
}

export function parseFavorite(payload: unknown): Favorite | null {
  if (!isRecord(payload)) return null;
  const id = idOf(payload.id);
  if (!id) return null;
  const price = payload.price_tnd;
  return {
    id,
    productId: str(payload.product_id),
    sourceUrl: str(payload.source_url),
    title: str(payload.title),
    imageUrl: str(payload.image_url),
    priceTnd: price === null || price === undefined || price === '' ? null : num(price),
    createdAt: str(payload.created_at),
  };
}

export function parseFavorites(payload: unknown): Favorite[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((row) => {
    const parsed = parseFavorite(row);
    return parsed ? [parsed] : [];
  });
}

export function parseNotification(payload: unknown): NotificationItem | null {
  if (!isRecord(payload)) return null;
  const id = idOf(payload.id);
  if (!id) return null;
  return {
    id,
    type: str(payload.type),
    title: str(payload.title),
    message: str(payload.message),
    actionUrl: str(payload.action_url),
    readAt: str(payload.read_at),
    createdAt: str(payload.created_at),
  };
}

/** Préférences : la base répond en colonnes `snake_case`, l'écran parle booléens. */
export function parsePreferences(payload: unknown): Preferences {
  const row = isRecord(payload) ? payload : {};
  // Absent = actif (le serveur applique la même règle par défaut) ; `dark_mode`
  // est le seul dont le défaut est « éteint ».
  const on = (key: string) => row[key] === undefined ? true : bool(row[key]);
  return {
    darkMode: bool(row.dark_mode),
    orderUpdates: on('order_updates'),
    paymentUpdates: on('payment_updates'),
    shippingUpdates: on('shipping_updates'),
    invoiceUpdates: on('invoice_updates'),
  };
}

export function parseSecurity(payload: unknown): SecurityStatus {
  const row = isRecord(payload) ? payload : {};
  const identities = Array.isArray(row.identities)
    ? row.identities.flatMap((entry) => (isRecord(entry) && str(entry.provider)
      ? [{ provider: str(entry.provider), createdAt: str(entry.created_at) }]
      : []))
    : [];
  return {
    emailVerified: bool(row.emailVerified),
    phoneVerified: bool(row.phoneVerified),
    hasPassword: bool(row.hasPassword),
    identities,
    activeSessions: num(row.activeSessions),
    lastLoginAt: str(row.lastLoginAt),
  };
}

export function parseOrderItem(payload: unknown): OrderItem | null {
  if (!isRecord(payload)) return null;
  const id = idOf(payload.id);
  if (!id) return null;
  // Colonnes réelles du serveur : `product_name`, `converted_price_tnd` (prix
  // unitaire en dinars après conversion), `requested_size/color` quand la
  // variante n'est pas figée. Lire `title`/`unit_price_tnd` affichait un article
  // sans nom à 0.00 DT — vu en vérification réelle, pas en théorie.
  const variant = str(payload.variant)
    || [str(payload.requested_size), str(payload.requested_color)].filter(Boolean).join(' / ');
  return {
    id,
    title: str(payload.product_name) || str(payload.title),
    quantity: num(payload.quantity),
    unitPriceTnd: num(payload.converted_price_tnd ?? payload.unit_price_tnd),
    totalTnd: num(payload.total_tnd),
    imageUrl: str(payload.image_url),
    sourceUrl: str(payload.source_url) || str(payload.reference_url),
    variant,
  };
}

export function parseOrderDetail(payload: unknown): OrderDetail {
  if (!isRecord(payload)) throw new Error('Commande illisible.');
  const id = idOf(payload.id);
  if (!id) throw new Error('Commande illisible : identifiant manquant.');
  const delivery = isRecord(payload.delivery) ? payload.delivery : {};
  const payment = isRecord(payload.payment) ? payload.payment : {};
  const invoice = isRecord(payload.invoice) ? payload.invoice : {};
  const options = isRecord(payload.paymentOptions) ? payload.paymentOptions : {};
  const transfer = isRecord(options.transfer) ? options.transfer : {};
  return {
    id,
    orderNumber: str(payload.order_number),
    status: str(payload.status),
    paymentStatus: str(payload.payment_status) || str(payment.status),
    paymentMethod: str(payload.payment_method) || str(payment.method),
    totalTnd: num(payload.total_tnd),
    paidTnd: num(payload.paid_amount_tnd),
    // Le reste à payer vient du serveur : on ne le recalcule pas ici.
    remainderTnd: num(payload.remainder_tnd),
    governorate: str(payload.governorate),
    addressLine: str(payload.address_line),
    createdAt: str(payload.created_at),
    items: Array.isArray(payload.items)
      ? payload.items.flatMap((row) => {
        const parsed = parseOrderItem(row);
        return parsed ? [parsed] : [];
      })
      : [],
    history: Array.isArray(payload.history)
      ? payload.history.flatMap((row) => (isRecord(row)
        ? [{ id: idOf(row.id), status: str(row.status), note: str(row.note), createdAt: str(row.created_at) }]
        : []))
      : [],
    tracking: {
      carrier: str(delivery.carrier),
      trackingNumber: str(delivery.tracking_number),
      trackingUrl: str(delivery.tracking_url),
      shippedAt: str(delivery.shipped_at),
    },
    invoiceNumber: str(invoice.invoice_number),
    transfer: {
      companyName: str(transfer.companyName),
      bankRib: str(transfer.bankRib),
      posteAccount: str(transfer.posteAccount),
      reviewDelay: str(transfer.reviewDelay),
    },
    paymentOptions: {
      // القائمة المغلقة من الخادم؛ ما نزيدوش عليها وسيلة من عندنا.
      choices: Array.isArray(options.choices)
        ? options.choices.filter((value): value is string => typeof value === 'string')
        : [],
      cardGatewayAvailable: options.cardGatewayAvailable === true,
    },
  };
}

/* ── Appels ────────────────────────────────────────────────────────────────── */

export async function fetchAuthConfig(options?: RequestOptions): Promise<AuthConfig> {
  return parseAuthConfig(await apiGetData<unknown>('/api/customer/auth/config', options));
}

export async function requestOtp(phone: string, options?: RequestOptions): Promise<OtpChallenge> {
  const { data } = await apiSend<unknown>('POST', '/api/customer/auth/otp/request', {
    ...options,
    body: { phone },
  });
  return parseOtpChallenge(data);
}

export async function verifyOtp(challengeId: string, code: string, options?: RequestOptions): Promise<SessionIssue> {
  const { data } = await apiSend<unknown>('POST', '/api/customer/auth/otp/verify', {
    ...options,
    body: { challengeId, code },
  });
  return parseSessionIssue(data);
}

/** Demande un code à usage unique envoyé à l'adresse (connexion dans l'application). */
export async function requestEmailCode(email: string, locale: 'fr' | 'ar', options?: RequestOptions): Promise<EmailCodeChallenge> {
  const { data } = await apiSend<unknown>('POST', '/api/customer/auth/email-code/request', {
    ...options,
    body: { email, locale },
  });
  return parseEmailCodeChallenge(data);
}

export async function verifyEmailCode(challengeId: string, code: string, options?: RequestOptions): Promise<SessionIssue> {
  const { data } = await apiSend<unknown>('POST', '/api/customer/auth/email-code/verify', {
    ...options,
    body: { challengeId, code },
  });
  return parseSessionIssue(data);
}

export async function emailLogin(email: string, password: string, options?: RequestOptions): Promise<SessionIssue> {
  const { data } = await apiSend<unknown>('POST', '/api/customer/auth/email/login', {
    ...options,
    body: { email, password },
  });
  return parseSessionIssue(data);
}

export async function emailRegister(
  input: { displayName: string; email: string; password: string; locale: 'fr' | 'ar'; marketingOptIn?: boolean },
  options?: RequestOptions,
): Promise<SessionIssue> {
  const { data } = await apiSend<unknown>('POST', '/api/customer/auth/email/register', {
    ...options,
    body: {
      displayName: input.displayName,
      email: input.email,
      password: input.password,
      locale: input.locale,
      marketingOptIn: input.marketingOptIn === true,
      termsAccepted: true,
    },
  });
  return parseSessionIssue(data);
}

/** Session courante. `null` = plus de session valide (401 ou session absente). */
export async function fetchMe(options?: RequestOptions): Promise<{ account: CustomerAccount; csrfToken: string; expiresAt: string } | null> {
  try {
    const { data } = await apiGet<unknown>('/api/customer/auth/me', options);
    if (!isRecord(data)) throw new Error('Session illisible.');
    return {
      account: parseAccount(data.account),
      csrfToken: str(data.csrfToken),
      expiresAt: str(data.expiresAt),
    };
  } catch (error) {
    // Un 401 est une réponse normale ici : personne n'est connecté. Tout le
    // reste (réseau, 5xx) remonte — on ne confond pas « pas connecté » avec
    // « serveur injoignable », sinon l'application effacerait une session
    // valide parce que le réseau est tombé une seconde.
    if ((error as { status?: number })?.status === 401) return null;
    throw error;
  }
}

export async function logout(options?: RequestOptions): Promise<void> {
  await apiSend<unknown>('POST', '/api/customer/auth/logout', options);
}

export async function fetchOverview(options?: RequestOptions): Promise<AccountOverview> {
  return parseOverview(await apiGetData<unknown>('/api/customer/account/overview', options));
}

export async function fetchOrders(options?: RequestOptions): Promise<RecentOrder[]> {
  const data = await apiGetData<unknown>('/api/customer/account/orders', options);
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = parseRecentOrder(row);
    return parsed ? [parsed] : [];
  });
}

/* ── Appels du compte (suite) ──────────────────────────────────────────────── */

export async function updateProfile(
  input: { displayName: string; email?: string; marketingOptIn: boolean },
  options?: RequestOptions,
): Promise<CustomerAccount> {
  const { data } = await apiSend<unknown>('PUT', '/api/customer/account/profile', { ...options, body: input });
  return parseAccount(data);
}

export async function fetchAddresses(options?: RequestOptions): Promise<Address[]> {
  return parseAddresses(await apiGetData<unknown>('/api/customer/account/addresses', options));
}

/** Champs réellement exigés par le serveur (`validateAddress`) + les facultatifs. */
export interface AddressInput {
  label: string;
  recipientName: string;
  phone: string;
  governorate: string;
  addressLine: string;
  city?: string;
  postalCode?: string;
  deliveryNotes?: string;
  isDefault?: boolean;
}

export async function createAddress(input: AddressInput, options?: RequestOptions): Promise<Address | null> {
  const { data } = await apiSend<unknown>('POST', '/api/customer/account/addresses', { ...options, body: input });
  return parseAddress(data);
}

export async function updateAddress(id: string, input: AddressInput, options?: RequestOptions): Promise<Address | null> {
  const { data } = await apiSend<unknown>('PUT', `/api/customer/account/addresses/${encodeURIComponent(id)}`, { ...options, body: input });
  return parseAddress(data);
}

export async function deleteAddress(id: string, options?: RequestOptions): Promise<void> {
  await apiSend<unknown>('DELETE', `/api/customer/account/addresses/${encodeURIComponent(id)}`, options);
}

export async function fetchFavorites(options?: RequestOptions): Promise<Favorite[]> {
  return parseFavorites(await apiGetData<unknown>('/api/customer/account/favorites', options));
}

export async function removeFavorite(id: string, options?: RequestOptions): Promise<void> {
  await apiSend<unknown>('DELETE', `/api/customer/account/favorites/${encodeURIComponent(id)}`, options);
}

/**
 * منتوج الكتالوج للمفضلة — **بـ`productId`**.
 *
 * لماذا بالمعرّف موش بالحقول: الخادم يقرا المنتوج من جدوله ويأخذ الاسم
 * والصورة والسعر من المصدر الرسمي. تمريرها من التطبيق كان يعني أننا نبعث
 * سعراً نحنا من حسبناه — والسعر قرار الخادم وحدو.
 */
export async function addCatalogFavorite(productId: string, options?: RequestOptions): Promise<Favorite | null> {
  const { data } = await apiSend<unknown>('POST', '/api/customer/account/favorites', {
    ...options,
    body: { productId },
  });
  return parseFavorite(data);
}

export async function fetchNotifications(options?: RequestOptions): Promise<NotificationItem[]> {
  const data = await apiGetData<unknown>('/api/customer/account/notifications', options);
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = parseNotification(row);
    return parsed ? [parsed] : [];
  });
}

export async function markNotificationsRead(id?: string, options?: RequestOptions): Promise<void> {
  await apiSend<unknown>('PUT', '/api/customer/account/notifications/read', {
    ...options,
    body: id ? { id } : {},
  });
}

export async function fetchPreferences(options?: RequestOptions): Promise<Preferences> {
  return parsePreferences(await apiGetData<unknown>('/api/customer/account/preferences', options));
}

export async function savePreferences(next: Partial<Preferences>, options?: RequestOptions): Promise<void> {
  await apiSend<unknown>('PUT', '/api/customer/account/preferences', { ...options, body: next });
}

export async function fetchSecurity(options?: RequestOptions): Promise<SecurityStatus> {
  return parseSecurity(await apiGetData<unknown>('/api/customer/account/security', options));
}

/**
 * Changement de mot de passe. Le serveur ferme TOUTES les sessions du compte et
 * en ouvre une nouvelle : la réponse porte donc un jeton neuf, que l'appelant
 * doit adopter — sinon l'application se retrouve déconnectée après un succès.
 */
export async function changePassword(currentPassword: string, newPassword: string, options?: RequestOptions): Promise<SessionIssue> {
  const { data } = await apiSend<unknown>('POST', '/api/customer/account/security/password', {
    ...options,
    body: { currentPassword, newPassword },
  });
  return parseSessionIssue(data);
}

export async function fetchOrderDetail(id: string, options?: RequestOptions): Promise<OrderDetail> {
  return parseOrderDetail(await apiGetData<unknown>(`/api/customer/account/orders/${encodeURIComponent(id)}`, options));
}

/* ── Photo de profil et récupération de mot de passe ───────────────────────── */

/**
 * Envoie une photo de profil. Le serveur accepte JPG/PNG/WebP non animés jusqu'à
 * 2 Mo, la recadre en 256×256 et la range avec le compte (aucune URL publique).
 *
 * `uri` vient du sélecteur d'images ; on joint un nom et un type parce que
 * certains serveurs refusent une partie sans `filename`.
 */
export async function uploadAvatar(
  picked: { uri: string; name?: string; type?: string; blob?: Blob },
  options?: RequestOptions,
): Promise<CustomerAccount> {
  const form = new FormData();
  // Deux formes, un seul champ `avatar` (celui qu'attend multer) :
  //   • web / aperçu : un vrai `File` — le navigateur remplit l'en-tête lui-même ;
  //   • natif : React Native accepte `{ uri, name, type }` et va lire le fichier.
  // Se tromper de forme donne un envoi sans fichier : le serveur répond alors
  // AVATAR_REQUIRED, ce qui vaut mieux qu'un faux succès.
  form.append(
    'avatar',
    (picked.blob ?? {
      uri: picked.uri,
      name: picked.name || 'avatar.jpg',
      type: picked.type || 'image/jpeg',
    }) as unknown as Blob,
  );
  const { data } = await apiSendForm<unknown>('/api/customer/account/avatar', form, options);
  return parseAccount(data);
}

export async function deleteAvatar(options?: RequestOptions): Promise<CustomerAccount> {
  const { data } = await apiSend<unknown>('DELETE', '/api/customer/account/avatar', options);
  return parseAccount(data);
}

/**
 * Demande un lien de réinitialisation. Le serveur répond 202 « accepté » —
 * jamais « envoyé » : il ne dit pas non plus si l'adresse existe (on ne révèle
 * pas quels comptes existent). L'écran doit donc parler d'un envoi POSSIBLE.
 */
export async function requestPasswordReset(email: string, locale: 'fr' | 'ar', options?: RequestOptions): Promise<void> {
  await apiSend<unknown>('POST', '/api/customer/auth/password/request', {
    ...options,
    body: { email: email.trim(), locale },
  });
}
