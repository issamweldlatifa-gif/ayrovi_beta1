import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { spawn } from 'node:child_process';
import { QatafoDatabase as AyroviDatabase } from './db/database';
import { SmartLinkScraper } from './scraper/scraper';
import { VisualProductExtractor } from './services/vision';
import { createApiRouter } from './api/routes';
import { createAyrovixRouter } from './ayrovix/routes';
import { createAdminRouter } from './admin/routes';
import { createPublicRouter } from './public/routes';
import { createCustomerRouter, facebookOAuthAvailable, googleOAuthAvailable } from './customer/routes';
import { phoneOtpAvailable } from './customer/otp';
import { mailerReady } from './services/mailer';
import { customerAuthReady } from './customer/auth';
import { createAssistantRouter } from './assistant/routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production' || process.env.RENDER) app.set('trust proxy', 1);
app.use((req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
  // Une politique unique, déclarée avant toutes les routes. Les vidéos CMS peuvent
  // provenir d'un CDN HTTPS; object-src reste interdit et l'iframe est same-origin en production.
  const frameAncestors = isProd ? "frame-ancestors 'self';" : '';
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    frameAncestors.replace(/;$/, ''),
  ].filter(Boolean).join('; ') + ';');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=()');
  const suppliedRequestId = String(req.headers['x-request-id'] || '');
  const requestId = /^[A-Za-z0-9._:-]{8,100}$/.test(suppliedRequestId) ? suppliedRequestId : randomUUID();
  res.setHeader('X-Request-ID', requestId);
  (req as any).requestId = requestId;
  if (isProd) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

// Compress JSON, JavaScript, CSS and other text responses. Hashed assets keep
// their immutable cache policy while transferring at a fraction of the size.
app.use(compression({ threshold: 1024 }));

// ===== Limitation de débit (endpoints sensibles) — en mémoire, sans dépendance =====
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const rateSweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(key);
}, 5 * 60_000);
rateSweeper.unref?.();
function rateLimit(name: string, limit: number, windowMs: number, keyFn?: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${keyFn ? keyFn(req) : req.ip || 'unknown'}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key) ?? { count: 0, resetAt: now + windowMs };
    if (bucket.resetAt <= now) { bucket.count = 0; bucket.resetAt = now + windowMs; }
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, code: 'RATE_LIMITED', error: 'Trop de tentatives — réessayez dans quelques instants.' });
    }
    next();
  };
}
// Authentification & endpoints coûteux — plafonds volontairement généreux pour l'usage réel
app.use('/api/admin/auth/login', rateLimit('admin-login', 10, 5 * 60_000));
app.use('/api/customer/auth/otp/request', rateLimit('otp-request', 5, 60_000, (req) => `${req.ip}:${String(req.body?.phone || '').slice(0, 24)}`));
app.use('/api/customer/auth/otp/verify', rateLimit('otp-verify', 12, 5 * 60_000));
app.use('/api/customer/auth/google', rateLimit('google-oauth', 30, 10 * 60_000));
app.use('/api/customer/auth/facebook', rateLimit('facebook-oauth', 30, 10 * 60_000));
app.use('/api/checkout', rateLimit('checkout', 15, 5 * 60_000));
app.use('/api/extract-image', rateLimit('vision', 25, 10 * 60_000));
app.use('/api/scrape', rateLimit('scrape', 30, 10 * 60_000));
app.use('/api/public/assistant-feedback', rateLimit('assistant-feedback', process.env.NODE_ENV === 'test' ? 1_000 : 40, 10 * 60_000));
app.use('/api/assistant/chat', rateLimit('assistant-chat', process.env.NODE_ENV === 'test' ? 1_000 : 25, 10 * 60_000));
app.use('/api/assistant/transcribe', rateLimit('assistant-voice', process.env.NODE_ENV === 'test' ? 1_000 : 20, 10 * 60_000));
const ayrovixRateLimit = rateLimit('ayrovix', process.env.NODE_ENV === 'test' ? 1_000 : 12, 10 * 60_000);
app.use('/api/ayrovix', (req, res, next) => {
  // Reading compact history is free; do not consume the paid-analysis quota.
  if (req.method === 'GET' && req.path === '/history') return next();
  return ayrovixRateLimit(req, res, next);
});

// Les lectures sociales restent publiques; toutes les mutations partagent une
// limite par IP + session navigateur. Ce middleware doit précéder PublicRouter.
const socialMutationRateLimit = rateLimit(
  'social-mutation',
  process.env.NODE_ENV === 'test' ? 12 : 120,
  10 * 60_000,
  (req) => {
    const rawSession = String(req.headers['x-session-id'] || '').trim();
    const session = /^[A-Za-z0-9._:-]{8,160}$/.test(rawSession) ? rawSession : 'no-session';
    return `${req.ip || 'unknown'}:${session}`;
  },
);
app.use('/api/public/social', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return socialMutationRateLimit(req, res, next);
});

const allowedOrigins = new Set((process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean));
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id', 'x-requested-with', 'x-csrf-token'],
}));
app.use(express.json({ limit: '14mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Database, Scraper & Vision Engine
// Tests must always be hermetic: never let a local .env DATABASE_PATH hijack the test run.
const databasePath = process.env.NODE_ENV === 'test' ? ':memory:' : (process.env.DATABASE_PATH || undefined);
const db = new AyroviDatabase(databasePath);
const scraper = new SmartLinkScraper();
const visionExtractor = new VisualProductExtractor();

// Static Assets (React Vite build outputs to public/)
const publicDir = path.resolve(process.cwd(), 'public');
app.use(express.static(publicDir, {
  setHeaders: (res, filePath) => {
    if (path.basename(filePath) === 'index.html') {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// Uploads static directory
const uploadsDir = path.resolve(process.cwd(), 'data/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d', immutable: true }));

// API Routes
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/api/admin', createAdminRouter(db));
app.use('/api/ayrovix', createAyrovixRouter(db, scraper));
app.use('/api/customer', createCustomerRouter(db));
app.use('/api/assistant', createAssistantRouter(db, scraper));
app.use('/api/public', createPublicRouter(db));
app.use('/api', createApiRouter(db, scraper, visionExtractor));

// Liveness: le processus HTTP répond. Readiness: SQLite est réellement lisible;
// les fournisseurs externes restent des capacités optionnelles clairement signalées.
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'AYROVI Universal Shopping & Vision Platform',
    version: '3.2.1',
    framework: 'React 19 + Vite + TypeScript + Express',
  });
});
app.get('/api/ready', (_req, res) => {
  try {
    db.get('SELECT 1 AS ready');
    res.json({
      status: 'ready',
      database: 'ok',
      capabilities: {
        assistant: Boolean(process.env.ANTHROPIC_API_KEY),
        visualSearch: Boolean(process.env.SERPAPI_KEY),
        voice: Boolean(process.env.GROQ_API_KEY),
        googleLogin: customerAuthReady() && googleOAuthAvailable(),
        facebookLogin: customerAuthReady() && facebookOAuthAvailable(),
        sms: phoneOtpAvailable(),
        mail: mailerReady(),
      },
    });
  } catch (error: any) {
    res.status(503).json({ status: 'not_ready', database: 'error', error: String(error?.message || 'Database unavailable') });
  }
});

// Les erreurs du parseur JSON arrivent avant les routers et doivent elles aussi
// respecter le contrat JSON de l'API.
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);
  if (!req.path.startsWith('/api')) return next(error);
  const tooLarge = error?.type === 'entity.too.large' || error?.status === 413;
  const invalidJson = error instanceof SyntaxError && Number((error as any)?.status) === 400;
  const status = tooLarge ? 413 : invalidJson ? 400 : Number(error?.status) || 500;
  if (status >= 500) {
    console.error(JSON.stringify({ level: 'error', requestId: (req as any).requestId, method: req.method, path: req.originalUrl, error: String(error?.message || error) }));
  }
  res.status(status).json({
    success: false,
    code: tooLarge ? 'PAYLOAD_TOO_LARGE' : invalidJson ? 'INVALID_JSON' : 'INTERNAL_ERROR',
    error: tooLarge ? 'Requête trop volumineuse.' : invalidJson ? 'Corps JSON invalide.' : 'Erreur interne du service.',
  });
});

// Une API inconnue doit rester une 404 JSON et ne jamais tomber sur index.html.
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, code: 'API_NOT_FOUND', error: `Route API introuvable: ${req.method} ${req.originalUrl}` });
});

// Single Page Application (SPA) Fallback Route
app.get('*', (_req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(indexPath);
  } else {
    res.status(404).send('AYROVI Frontend build not found.');
  }
});

// Nettoyage périodique : sessions clients expirées + défis OTP consommés/périmés.
const housekeeping = setInterval(() => {
  try {
    const now = new Date().toISOString();
    db.run(`DELETE FROM customer_sessions WHERE expires_at <= ?`, now);
    db.run(`DELETE FROM customer_otp_challenges WHERE expires_at <= ?`, now);
  } catch (error: any) { console.warn('[housekeeping]', error?.message || 'failed'); }
}, 3600_000);
housekeeping.unref?.();

// Sauvegarde SQLite périodique dans le même processus Render afin d'accéder au
// disque persistant. Le script peut ensuite pousser la copie vers S3/R2/B2.
const backupIntervalHours = Math.max(0, Math.min(168, Number(process.env.BACKUP_INTERVAL_HOURS || 0)));
const backupIntervalMs = backupIntervalHours * 60 * 60 * 1000;
let backupTimer: NodeJS.Timeout | null = null;
let backupRunning = false;
function runBackupIfDue() {
  if (!backupIntervalMs || backupRunning || process.env.NODE_ENV === 'test') return;
  const backupDir = path.resolve(process.cwd(), process.env.BACKUP_DIR || 'data/backups');
  const newest = fs.existsSync(backupDir)
    ? fs.readdirSync(backupDir).filter((name) => /^ayrovi-.*\.sqlite$/.test(name))
      .map((name) => fs.statSync(path.join(backupDir, name)).mtimeMs).reduce((max, value) => Math.max(max, value), 0)
    : 0;
  if (newest && Date.now() - newest < backupIntervalMs) return;
  backupRunning = true;
  const child = spawn(process.execPath, [path.resolve(process.cwd(), 'scripts/backup-sqlite.mjs')], {
    cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output = `${output}${String(chunk)}`.slice(-4000); });
  child.stderr.on('data', (chunk) => { output = `${output}${String(chunk)}`.slice(-4000); });
  child.once('error', (error) => { console.error('[backup] تعذر تشغيل النسخ المجدول:', error.message); });
  child.once('close', (code) => {
    backupRunning = false;
    if (code === 0) console.info(`[backup] اكتملت النسخة المجدولة: ${output.trim()}`);
    else console.error(`[backup] فشلت النسخة المجدولة (exit=${code}): ${output.trim()}`);
  });
}
if (backupIntervalMs && process.env.NODE_ENV !== 'test') {
  const initial = setTimeout(runBackupIfDue, 60_000);
  initial.unref?.();
  backupTimer = setInterval(runBackupIfDue, Math.min(backupIntervalMs, 60 * 60 * 1000));
  backupTimer.unref?.();
}

// Start Server
let httpServer: Server | null = null;
let shutdownStarted = false;

function shutdown(exitCode: number, reason: string) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.error(`[shutdown] ${reason} — fermeture propre…`);
  clearInterval(housekeeping);
  clearInterval(rateSweeper);
  if (backupTimer) clearInterval(backupTimer);
  const finish = () => {
    try { db.close(); } catch { /* already closed */ }
    process.exit(exitCode);
  };
  const force = setTimeout(finish, 5_000);
  force.unref?.();
  if (httpServer) httpServer.close(() => { clearTimeout(force); finish(); });
  else finish();
}

if (process.env.NODE_ENV !== 'test') {
  httpServer = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log('====================================================');
    console.log('🚀 AYROVI React + Vite Platform running');
    console.log(`📍 Web Application: http://0.0.0.0:${PORT}/`);
    console.log('====================================================');
  });
  process.once('SIGTERM', () => shutdown(0, 'SIGTERM reçu'));
  process.once('SIGINT', () => shutdown(0, 'SIGINT reçu'));
  process.once('unhandledRejection', (reason) => {
    const detail = reason instanceof Error ? reason.stack || reason.message : String(reason);
    console.error('[unhandledRejection]', detail);
    shutdown(1, 'promesse non gérée');
  });
  process.once('uncaughtException', (error) => {
    console.error('[uncaughtException]', error.stack || error.message);
    shutdown(1, 'exception non gérée');
  });
}

export { app, db, scraper, visionExtractor };
