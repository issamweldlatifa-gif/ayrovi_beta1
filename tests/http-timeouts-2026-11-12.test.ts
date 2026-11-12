/**
 * Délais keep-alive du serveur HTTP (audit d'architecture 12/11/2026) :
 * l'application doit garder ses connexions inactives PLUS longtemps que le
 * proxy de Render, sinon 502 / ECONNRESET intermittents.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyHttpTimeouts, DEFAULT_KEEP_ALIVE_TIMEOUT_MS, httpTimeouts } from '../src/services/httpTimeouts';

describe('délais HTTP', () => {
  it('par défaut : 120 s de keep-alive, en-têtes au-delà (Node seul : 5 s)', () => {
    expect(DEFAULT_KEEP_ALIVE_TIMEOUT_MS).toBe(120_000);
    const server = http.createServer();
    expect(server.keepAliveTimeout).toBeLessThan(60_000); // défaut Node, plus court que le proxy
    expect(applyHttpTimeouts(server, {})).toEqual({ keepAliveTimeout: 120_000, headersTimeout: 125_000 });
    expect(server.keepAliveTimeout).toBe(120_000);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });

  it('réglable, borné, et une valeur invalide retombe sur le défaut', () => {
    expect(httpTimeouts({ HTTP_KEEP_ALIVE_TIMEOUT_MS: '65000' })).toEqual({ keepAliveTimeout: 65_000, headersTimeout: 70_000 });
    for (const bad of ['', 'abc', '1000', '9999999', '-5']) {
      expect(httpTimeouts({ HTTP_KEEP_ALIVE_TIMEOUT_MS: bad }).keepAliveTimeout).toBe(120_000);
    }
  });

  it('le serveur applique ces délais dès l’écoute', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.ts'), 'utf8');
    expect(source).toMatch(/httpServer = app\.listen\([\s\S]*?\n  applyHttpTimeouts\(httpServer\);/);
  });
});
