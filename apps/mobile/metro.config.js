/**
 * Configuration Metro.
 *
 * Le seul ajout au réglage par défaut d'Expo : un **proxy de développement**
 * qui relaie `/api` et `/media` vers le serveur AYROVI local (port 3000, ou
 * `AYROVI_DEV_API`).
 *
 * Pourquoi c'est nécessaire et pas un confort :
 *  • le navigateur qui affiche l'aperçu n'est PAS dans la machine de
 *    développement — il ne peut pas joindre `localhost:3000` ;
 *  • l'application utilise donc une base d'API RELATIVE en développement, et
 *    tout passe par l'origine de l'aperçu : aucune adresse à connaître, aucun
 *    CORS à configurer ;
 *  • en production (build natif), `EXPO_PUBLIC_API_BASE_URL` est défini à
 *    l'origine réelle (`https://ayrovi.tn`) : le proxy n'existe plus.
 */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const DEV_API_TARGET = process.env.AYROVI_DEV_API || 'http://localhost:3000';
const PROXY_PREFIXES = ['/api', '/media', '/uploads', '/stores'];

/** Relais minimal, sans dépendance : suffisant pour du JSON et des médias. */
function createProxy(target) {
  const http = require('node:http');
  const https = require('node:https');
  const { URL } = require('node:url');
  const upstream = new URL(target);
  const client = upstream.protocol === 'https:' ? https : http;

  return (req, res, next) => {
    if (!PROXY_PREFIXES.some((prefix) => req.url === prefix || req.url.startsWith(`${prefix}/`) || req.url.startsWith(`${prefix}?`))) {
      return next();
    }
    const options = {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: upstream.host },
    };
    const forwarded = client.request(options, (upstreamResponse) => {
      res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(res);
    });
    forwarded.on('error', (error) => {
      // Le serveur local est éteint : on le dit, on ne renvoie pas un 200 vide
      // que l'application prendrait pour une réponse valide.
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        code: 'DEV_PROXY_UNAVAILABLE',
        error: `Serveur AYROVI injoignable sur ${target} (${error.code || error.message}).`,
      }));
    });
    req.pipe(forwarded);
  };
}

config.server = config.server || {};
const previousEnhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const withProxy = previousEnhance ? previousEnhance(middleware, server) : middleware;
  const proxy = createProxy(DEV_API_TARGET);
  return (req, res, next) => proxy(req, res, () => withProxy(req, res, next));
};

module.exports = config;
