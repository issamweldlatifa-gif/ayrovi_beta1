const CSRF_KEY = 'ayrovi_admin_csrf';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
  if (!response.ok) throw new ApiError(payload?.error || `Erreur HTTP ${response.status}`, response.status);
  return payload as T;
}

export async function login(email: string, password: string) {
  const result = await adminApi<any>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  setCsrfToken(result.data.csrfToken);
  return result.data.user;
}

export async function loadIdentity() {
  const result = await adminApi<any>('/auth/me');
  setCsrfToken(result.data.csrfToken);
  return result.data.user;
}

export async function logout() {
  try { await adminApi('/auth/logout', { method: 'POST' }); } finally { setCsrfToken(null); }
}

export function queryString(values: Record<string, unknown>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.toString();
}
