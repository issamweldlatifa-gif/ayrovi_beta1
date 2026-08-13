import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { QatafoDatabase as AyroviDatabase } from './db/database';
import { SmartLinkScraper } from './scraper/scraper';
import { VisualProductExtractor } from './services/vision';
import { createApiRouter } from './api/routes';
import { createAyrovixRouter } from './ayrovix/routes';
import { createAdminRouter } from './admin/routes';
import { createPublicRouter } from './public/routes';
import { createCustomerRouter } from './customer/routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production' || process.env.RENDER) app.set('trust proxy', 1);
app.use((_req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
  // En production : frame-ancestors 'self' (anti-clickjacking). En dev : ouvert pour la prévisualisation sandbox.
  const frameAncestors = isProd ? "frame-ancestors 'self';" : '';
  res.setHeader('Content-Security-Policy', `default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; connect-src 'self' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; ${frameAncestors} base-uri 'self'; form-action 'self'`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=()');
  if (isProd) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

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
app.use('/api/checkout', rateLimit('checkout', 15, 5 * 60_000));
app.use('/api/extract-image', rateLimit('vision', 25, 10 * 60_000));
app.use('/api/scrape', rateLimit('scrape', 30, 10 * 60_000));
app.use('/api/ayrovix', rateLimit('ayrovix', 12, 10 * 60_000));

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
app.use('/api/public', createPublicRouter(db));
app.use('/api', createApiRouter(db, scraper, visionExtractor));

// Healthcheck Route
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'AYROVI Universal Shopping & Vision Platform',
    version: '3.0.0',
    framework: 'React 19 + Vite + TypeScript + Express',
    features: ['Link Scraper', 'Visual Screenshot OCR', 'Dynamic Pricing', 'Unified Cart'],
    supportedStores: ['SHEIN', 'Amazon', 'TEMU', 'AliExpress']
  });
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

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log('====================================================');
    console.log(`🚀 AYROVI React + Vite Platform running`);
    console.log(`📍 Web Application: http://0.0.0.0:${PORT}/`);
    console.log('====================================================');
  });
}

export { app, db, scraper, visionExtractor };
