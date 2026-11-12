const CSRF_KEY = 'ayrovi_admin_csrf';
export const ADMIN_SESSION_EXPIRED_EVENT = 'ayrovi:admin-session-expired';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;
  /** Charge utile complète de la réponse (ex. `errors` par champ, `problems` par carte). */
  body?: Record<string, any>;
  constructor(message: string, status: number, payload?: { code?: string; details?: Record<string, unknown>; [key: string]: unknown }) {
    super(message);
    this.status = status;
    this.code = payload?.code;
    this.details = payload?.details;
    this.body = payload as Record<string, any> | undefined;
  }
}

export function setCsrfToken(token?: string | null) {
  if (token) sessionStorage.setItem(CSRF_KEY, token);
  else sessionStorage.removeItem(CSRF_KEY);
}

export async function adminApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const csrf = sessionStorage.getItem(CSRF_KEY);
  if (csrf && !['GET','HEAD'].includes(String(options.method || 'GET').toUpperCase())) headers.set('x-csrf-token', csrf);
  const response = await fetch(`/api/admin${endpoint}`, { ...options, headers, credentials: 'same-origin' });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401 && endpoint !== '/auth/login') {
      setCsrfToken(null);
      window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      payload?.error || `Erreur HTTP ${response.status}`,
      response.status,
      payload && typeof payload === 'object' ? payload : undefined,
    );
  }
  return payload as T;
}

/**
 * Connexion. Avec la double authentification active, le serveur répond 401
 * `TOTP_REQUIRED` au premier envoi : l'écran demande alors le code et rappelle
 * `login` avec `otp` (code à 6 chiffres ou code de secours `abcd-efgh`).
 */
export async function login(email: string, password: string, otp?: string) {
  const body: Record<string, string> = { email, password };
  if (otp && otp.trim()) body.otp = otp.trim();
  const result = await adminApi<any>('/auth/login', { method: 'POST', body: JSON.stringify(body) });
  setCsrfToken(result.data.csrfToken);
  return result.data.user;
}

export async function loadIdentity() {
  const result = await adminApi<any>('/auth/me');
  setCsrfToken(result.data.csrfToken);
  return result.data.user;
}

export async function logout() {
  try {
    await adminApi('/auth/logout', { method: 'POST' });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) throw error;
  } finally {
    setCsrfToken(null);
  }
}

export function queryString(values: Record<string, unknown>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.toString();
}
