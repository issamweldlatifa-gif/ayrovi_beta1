import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { QatafoDatabase as AyroviDatabase } from './db/database';
import { SmartLinkScraper } from './scraper/scraper';
import { VisualProductExtractor } from './services/vision';
import { createApiRouter } from './api/routes';
import { createAdminRouter } from './admin/routes';
import { createPublicRouter } from './public/routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors *; base-uri 'self'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=()');
  next();
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
const databasePath = process.env.DATABASE_PATH || (process.env.NODE_ENV === 'test' ? ':memory:' : undefined);
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
