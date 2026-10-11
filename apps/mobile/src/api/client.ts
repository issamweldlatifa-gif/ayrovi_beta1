/**
 * عميل HTTP — الطريق الوحيدة للخادم.
 *
 * القواعد:
 *  • URL مطلق دائماً مَبني من `API_BASE_URL`. التطبيق ما عندوش «نفس الأصل»
 *    كيما المتصفّح، فـ `/api/...` وحدها ما تعني شي.
 *  • مهلة زمنية لكل طلب، وإلغاء يقبل إلغاء الطرف الطالب (خروج من الشاشة).
 *  • كل فشل يولي `ApiError` — ما فماش `throw` متاع نص خام.
 */
import { API_BASE_URL } from './config';
import { failureFrom, parseRetryAfter, unwrap } from './envelope';
import { ApiError } from './errors';

/* ── Contexte d'authentification ────────────────────────────────────────────
 *
 * L'application ne s'authentifie pas comme un navigateur :
 *   • elle DÉCLARE son type (`x-ayrovi-client: mobile/<version>`) pour que le
 *     serveur lui remette un jeton dans le corps de la réponse. Sans cette
 *     déclaration, le serveur pose un cookie HttpOnly que l'application ne peut
 *     ni lire ni ranger dans un trousseau ;
 *   • elle présente ensuite ce jeton en `Authorization: Bearer` — un en-tête
 *     secret, non automatique, donc insensible au CSRF ;
 *   • le serveur exige quand même `x-csrf-token` sur toute écriture : c'est une
 *     seconde barrière, et elle est volontairement conservée côté application
 *     (un jeton volé sur l'appareil ne suffit pas à écrire).
 *
 * Ce contexte vit ICI, en mémoire, et n'est jamais écrit sur le disque par ce
 * module : la persistance est la responsabilité du trousseau (`state/session`).
 * Ce fichier reste ainsi sans dépendance à React Native — donc testable en Node.
 */
export interface AuthContext {
  /** Jeton de session (chaîne vide = visiteur). */
  token: string;
  /** Jeton CSRF à présenter sur les écritures. */
  csrfToken: string;
  /** Déclaration `mobile/<version>` (chaîne vide = ne rien déclarer). */
  clientHeader: string;
}

const EMPTY_AUTH: AuthContext = { token: '', csrfToken: '', clientHeader: '' };
let authContext: AuthContext = { ...EMPTY_AUTH };

export function setAuthContext(next: Partial<AuthContext>): void {
  authContext = { ...authContext, ...next };
}

export function getAuthContext(): AuthContext {
  return authContext;
}

/** Remet le client à l'état visiteur (déconnexion, session expirée). */
export function resetAuthContext(): void {
  authContext = { ...EMPTY_AUTH, clientHeader: authContext.clientHeader };
}

/**
 * Renouvellement du jeton CSRF, fourni par la couche session.
 *
 * Le serveur fait tourner le jeton CSRF à chaque `GET /auth/me` : deux appels
 * concurrents (démarrage de l'application + rafraîchissement d'un écran) laissent
 * forcément un des deux jetons périmé. Sans renouvellement, l'écriture suivante
 * échoue avec `INVALID_CSRF` — l'utilisateur voit « session de sécurité invalide »
 * au milieu d'une commande. On recharge donc une fois, silencieusement.
 */
let csrfRefresher: (() => Promise<boolean>) | null = null;

export function setCsrfRefresher(refresher: (() => Promise<boolean>) | null): void {
  csrfRefresher = refresher;
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * En-têtes d'authentification pour une méthode donnée. Exporté pour être testé
 * directement — c'est le contrat avec le serveur, pas un détail interne.
 */
export function authHeaders(method: string, context: AuthContext = authContext): Record<string, string> {
  const headers: Record<string, string> = {};
  const upper = method.toUpperCase();
  if (context.clientHeader) headers['x-ayrovi-client'] = context.clientHeader;
  if (context.token) headers.Authorization = `Bearer ${context.token}`;
  if (context.csrfToken && WRITE_METHODS.has(upper)) headers['x-csrf-token'] = context.csrfToken;
  return headers;
}

/** مهلة الخادم الافتراضية: قراءة فاتورة/صفحة عامة ما تعدّيش 12 ثانية. */
export const DEFAULT_TIMEOUT_MS = 12_000;

export interface RequestOptions {
  /** إشارة إلغاء خارجية (من useQuery مثلاً). */
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * URL absolue depuis un chemin de l'API.
 *
 * Sans origine configurée (développement), le chemin reste RELATIF : le
 * navigateur et le proxy Metro s'occupent du reste. Avec une origine
 * (production), on la préfixe une seule fois.
 */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const suffix = `${path.startsWith('/') ? '' : '/'}${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${suffix}` : suffix;
}

/**
 * يحوّل مساراً متاع أصل (صورة، ملف) إلى URL مطلق.
 * الخادم يرجّع `/media/hero-default.jpg` — بلا هذا التحويل، React Native
 * ما يلقى شي ويعرض صورة فارغة بلا أي رسالة.
 */
export function mediaUrl(path: string | null | undefined): string {
  const value = String(path ?? '').trim();
  if (!value) return '';
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:')) return value;
  return apiUrl(value);
}

const isAbort = (error: unknown): boolean =>
  typeof error === 'object' && error !== null
  && ((error as { name?: string }).name === 'AbortError'
    || (error as { name?: string }).name === 'CanceledError');

/**
 * يجمع إلغاء الطالب مع المهلة في إشارة واحدة.
 * (لا نستعمل `AbortSignal.any` : موش مضمونة على كل إصدارات Hermes.)
 */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort);
  }
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  return {
    signal: controller.signal,
    /** true إذا كان الإلغاء من المهلة موش من الطالب. */
    timedOut: () => controller.signal.reason === 'timeout',
    dispose: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); },
  };
}

export interface RequestResult<T> {
  data: T;
  /** ترويسة `serverTime` إن وُجدت (تستعملها الأقسام ذات الوقت). */
  serverTime: string;
}

export interface SendOptions extends RequestOptions {
  /** جسم الطلب — يُرسَل كـ JSON. `undefined` = بلا جسم. */
  body?: unknown;
  /**
   * جسم متعدّد الأجزاء (رفع ملف). حضور هذا الحقل يُلغي JSON ويترك
   * `Content-Type` للطبقة السفلى: هي وحدها تعرف الحدّ (boundary) العشوائي.
   * كتابته يدوياً = خادم لا يفهم الحدود.
   */
  form?: FormData;
  /**
   * يرجّع الغلاف كامل (`{success, data, capture, quote_token…}`) بدل `data` وحدها.
   * يحتاجو AYWEBs: قرار الخادم (`capture.used/rejection`) وفاتورة السعر
   * (`quote_token`) حقول **جنب** `data`، وتضييعها يعني شاشة ما تعرفش تحكي
   * الحقيقة. المغلّف يُتحقّق منو في `apiSendEnvelope`.
   */
  envelope?: boolean;
}

/**
 * ينفّذ الطلب كاملاً: مهلة، إلغاء، قراءة الجسم، ثم فكّ الغلاف.
 * كل الدوال العمومية تمرّ من هنا — مسار واحد يعني معالجة أخطاء واحدة.
 */
async function perform<T>(method: string, path: string, options: SendOptions = {}): Promise<RequestResult<T>> {
  const first = await attempt<T>(method, path, options);
  if (first.kind !== 'csrf') return first.result;
  // Jeton CSRF périmé : on le renouvelle depuis `/auth/me` et on rejoue UNE fois.
  const refreshed = await csrfRefresher?.().catch(() => false);
  if (!refreshed) throw first.error;
  const second = await attempt<T>(method, path, options);
  if (second.kind === 'csrf') throw second.error;
  return second.result;
}

/** Résultat interne : soit une réponse, soit un refus CSRF à rejouer. */
type Attempt<T> =
  | { kind: 'ok'; result: RequestResult<T> }
  | { kind: 'csrf'; error: ApiError };

async function attempt<T>(method: string, path: string, options: SendOptions = {}): Promise<Attempt<T>> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, headers, body, form } = options;
  const gate = withTimeout(signal, timeoutMs);
  const payloadHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...authHeaders(method),
    ...headers,
  };
  if (!form && body !== undefined) payloadHeaders['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      signal: gate.signal,
      headers: payloadHeaders,
      ...(form ? { body: form } : body !== undefined ? { body: JSON.stringify(body) } : null),
    });
  } catch (error) {
    if (isAbort(error)) {
      if (gate.timedOut()) {
        throw new ApiError('timeout', `Délai dépassé (${timeoutMs} ms) : ${path}`, { cause: error });
      }
      throw new ApiError('aborted', `Requête annulée : ${path}`, { cause: error });
    }
    throw new ApiError('network', `Réseau injoignable : ${path}`, { cause: error });
  } finally {
    gate.dispose();
  }

  // Corps lu en texte d'abord : une passerelle peut répondre du HTML d'erreur,
  // et `response.json()` lèverait alors une erreur de syntaxe trompeuse.
  const raw = await response.text().catch(() => '');
  let payload: unknown = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = failureFrom(response.status, payload, parseRetryAfter(response.headers.get('retry-after')));
    // `INVALID_CSRF` est le seul refus qui vaut une seconde tentative : le jeton
    // a simplement tourné côté serveur, la session est intacte.
    if (response.status === 403 && error.code === 'INVALID_CSRF') return { kind: 'csrf', error };
    throw error;
  }

  const serverTime = typeof (payload as { serverTime?: unknown } | null)?.serverTime === 'string'
    ? String((payload as { serverTime: string }).serverTime)
    : '';

  /* الغلاف الكامل مطلوب (AYWEBs) : هنا ما نفكّوش `data` — `apiSendEnvelope`
     يتولّى التحقّق من الغلاف، ويرمي بنفس معاني `unwrap` بالضبط. */
  if (options.envelope === true) {
    return { kind: 'ok', result: { data: payload as T, serverTime } };
  }

  const data = unwrap<T>(payload, { status: response.status, source: path });
  return { kind: 'ok', result: { data, serverTime } };
}

/**
 * طلب GET. يرمي `ApiError` فقط — لا يرجّع `null` صامتاً.
 */
export async function apiGet<T>(path: string, options: RequestOptions = {}): Promise<RequestResult<T>> {
  return perform<T>('GET', path, options);
}

/**
 * طلب كاتب (POST/PUT/PATCH/DELETE) بجسم JSON اختياري.
 * `apiSend('POST', …)` وليس `apiPost`: الواجهة تُقرأ كسطر واحد في كل مكان.
 */
export async function apiSend<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: SendOptions = {},
): Promise<RequestResult<T>> {
  return perform<T>(method, path, options);
}

/**
 * طلب كاتب بجسم متعدّد الأجزاء (رفع صورة). الدالة منفصلة بالاسم لأن رفع ملف
 * قرار واضح، ولأن `Content-Type` يختلف اختلافاً جوهرياً.
 */
export async function apiSendForm<T>(path: string, form: FormData, options: SendOptions = {}): Promise<RequestResult<T>> {
  return perform<T>('POST', path, { ...options, form });
}

/* ── مسارات بخروج عن الغلاف ─────────────────────────────────────────────── */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * طلب GET يرجّع نصّاً خاماً — لسكريبت الكابتشر.
 *
 * `GET /api/v1/aywebs/capture/script.js` يرجّع JavaScript، موش غلاف JSON:
 * تمريرو على `unwrap` كان باش يفشل، وهذا **مقصود**: السكريبت يتصلّح من
 * الخادم بلا تحديث للتطبيق. الفشل الوحيد المقبول: غير 2xx أو جسم فارغ.
 */
export async function apiGetText(path: string, options: RequestOptions = {}): Promise<string> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, headers } = options;
  const gate = withTimeout(signal, timeoutMs);

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: 'GET',
      signal: gate.signal,
      headers: { Accept: 'text/javascript, text/plain, */*', ...authHeaders('GET'), ...headers },
    });
  } catch (error) {
    if (isAbort(error)) {
      if (gate.timedOut()) {
        throw new ApiError('timeout', `Délai dépassé (${timeoutMs} ms) : ${path}`, { cause: error });
      }
      throw new ApiError('aborted', `Requête annulée : ${path}`, { cause: error });
    }
    throw new ApiError('network', `Réseau injoignable : ${path}`, { cause: error });
  } finally {
    gate.dispose();
  }

  const raw = await response.text().catch(() => '');
  if (!response.ok) {
    throw failureFrom(response.status, null, parseRetryAfter(response.headers.get('retry-after')));
  }
  if (!raw.trim()) throw new ApiError('malformed', `Réponse vide : ${path}`, { status: response.status });
  return raw;
}

/**
 * طلب كاتب يرجّع الغلاف كامل (`{success, data, capture, quote_token…}`).
 *
 * AYWEBs يرجّع قرار الخادم وفاتورة السعر **جنب** `data`؛ فكّ `data` وحدها
 * يضيّع `capture.rejection` و`quote_token`، والشاشة تولّي ما تعرفش تحكي
 * الحقيقة. التحقّق هنا هو نفس عقد `unwrap` (لا غلاف = خطأ، لا نجاح صامت).
 */
function readEnvelope<T>(payload: unknown, path: string): T {
  if (!isRecord(payload)) throw new ApiError('malformed', `Enveloppe absente (${path})`);
  if (payload.success === false) {
    const code = typeof payload.code === 'string' ? payload.code : '';
    const message = typeof payload.error === 'string' && payload.error.trim()
      ? payload.error
      : `Réponse refusée (${path})`;
    throw new ApiError('http', message, { code });
  }
  if (payload.success !== true) throw new ApiError('malformed', `Enveloppe absente (${path})`);
  return payload as T;
}

export async function apiSendEnvelope<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: SendOptions = {},
): Promise<T> {
  return readEnvelope<T>((await perform<unknown>(method, path, { ...options, envelope: true })).data, path);
}

/**
 * طلب GET يرجّع الغلاف كامل — لمسارات AYROVI (`/cart/items`، `/checkout`):
 * حقولها في الجذر مع `success`، بلا `data`. فكّ `data` هنا كان يرجّع
 * `undefined` ويولّي كل شي «مالفورمِ» بلا سبب حقيقي.
 */
export async function apiGetEnvelope<T>(path: string, options: SendOptions = {}): Promise<T> {
  return readEnvelope<T>((await perform<unknown>('GET', path, { ...options, envelope: true })).data, path);
}

/** واجهة مختصرة: تعيد `data` فقط. */
export async function apiGetData<T>(path: string, options?: RequestOptions): Promise<T> {
  return (await apiGet<T>(path, options)).data;
}

export async function apiSendData<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options?: SendOptions): Promise<T> {
  return (await apiSend<T>(method, path, options)).data;
}
