/**
 * `/api/ready` répond à PLAT (`{status,database,version,commit,branch}`), pas
 * dans l'enveloppe `{success,data}`.
 *
 * Régression : l'écran « À propos » affichait « Réponse illisible du serveur »
 * alors que le serveur était parfaitement sain, simplement parce que le client
 * exigeait l'enveloppe. On accepte les deux formes — un serveur ancien comme
 * un serveur qui envelopperait un jour — et on refuse seulement un corps qui ne
 * dit rien.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/errors';
import { fetchServerReadiness } from '../src/api/public';

const respond = (body: unknown, status = 200) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })));
};

afterEach(() => vi.unstubAllGlobals());

describe('fetchServerReadiness', () => {
  it('lit la réponse plate du serveur sans la traiter comme illisible', async () => {
    respond({ status: 'ready', database: 'ok', version: '3.10.4', commit: 'abc123', branch: 'main' });
    const readiness = await fetchServerReadiness();
    expect(readiness).toEqual({ status: 'ready', database: 'ok', version: '3.10.4', commit: 'abc123', branch: 'main' });
  });

  it('accepte aussi une réponse enveloppée', async () => {
    respond({ success: true, data: { status: 'ready', database: 'ok', version: '3.10.4', commit: 'local', branch: 'unknown' } });
    expect((await fetchServerReadiness()).commit).toBe('local');
  });

  it('refuse un corps qui ne dit pas l’état du serveur', async () => {
    respond({ hello: 'world' });
    await expect(fetchServerReadiness()).rejects.toBeInstanceOf(ApiError);
  });
});
