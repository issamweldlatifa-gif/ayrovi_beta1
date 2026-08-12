import { getSessionId } from '../utils/session';

export async function customerApi<T = any>(path: string, init: RequestInit = {}, csrfToken = ''): Promise<T> {
  const method = String(init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  headers.set('x-session-id', getSessionId());
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('x-csrf-token', csrfToken);
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || 'Une erreur est survenue.') as Error & { code?: string; status?: number };
    error.code = payload.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}
