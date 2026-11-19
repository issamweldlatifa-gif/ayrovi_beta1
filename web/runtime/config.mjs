export function originFrom(value, { local = false } = {}) {
  if (!value) return null;
  const u = new URL(value);
  const localHttp = local && u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if ((!localHttp && u.protocol !== 'https:') || u.username || u.password || u.pathname !== '/' || u.search || u.hash)
    throw new Error('Expected an HTTPS origin (local HTTP is permitted only for development).');
  return u.origin;
}
