import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash, createHmac } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const projectRoot = process.cwd();
const databasePath = path.resolve(projectRoot, process.env.DATABASE_PATH || 'data/qatafo.sqlite');
const backupDirectory = path.resolve(projectRoot, process.env.BACKUP_DIR || 'data/backups');
const retentionDays = Math.max(1, Math.min(365, Number(process.env.BACKUP_RETENTION_DAYS || 14)));

if (!fs.existsSync(databasePath)) {
  console.error(`[backup] قاعدة البيانات غير موجودة: ${databasePath}`);
  process.exit(1);
}
fs.mkdirSync(backupDirectory, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.join(backupDirectory, `ayrovi-${timestamp}.sqlite`);
const source = new Database(databasePath, { readonly: true, fileMustExist: true });

try {
  await source.backup(destination);
} finally {
  source.close();
}

const copy = new Database(destination, { readonly: true, fileMustExist: true });
let integrity = '';
try {
  integrity = String(copy.pragma('quick_check', { simple: true }) || '');
} finally {
  copy.close();
}
if (integrity.toLowerCase() !== 'ok') {
  fs.rmSync(destination, { force: true });
  console.error(`[backup] فشل فحص النسخة: ${integrity || 'unknown'}`);
  process.exit(1);
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (key, value, encoding) => createHmac('sha256', key).update(value).digest(encoding);
const encodePath = (value) => value.split('/').filter(Boolean).map((part) => encodeURIComponent(part)).join('/');

async function uploadS3Compatible(filePath) {
  const config = {
    endpoint: String(process.env.BACKUP_S3_ENDPOINT || '').trim().replace(/\/$/, ''),
    bucket: String(process.env.BACKUP_S3_BUCKET || '').trim(),
    region: String(process.env.BACKUP_S3_REGION || 'auto').trim(),
    accessKeyId: String(process.env.BACKUP_S3_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: String(process.env.BACKUP_S3_SECRET_ACCESS_KEY || '').trim(),
    prefix: String(process.env.BACKUP_S3_PREFIX || 'ayrovi/sqlite').trim().replace(/^\/+|\/+$/g, ''),
  };
  const values = [config.endpoint, config.bucket, config.accessKeyId, config.secretAccessKey];
  const configured = values.every(Boolean);
  const partiallyConfigured = values.some(Boolean) && !configured;
  const required = /^(1|true|yes)$/i.test(String(process.env.BACKUP_REQUIRE_EXTERNAL || ''));
  if (partiallyConfigured) throw new Error('BACKUP_S3_CONFIGURATION_INCOMPLETE');
  if (!configured) {
    if (required) throw new Error('BACKUP_EXTERNAL_REQUIRED_BUT_NOT_CONFIGURED');
    return null;
  }

  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== 'https:') throw new Error('BACKUP_S3_ENDPOINT_MUST_USE_HTTPS');
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const objectKey = `${config.prefix ? `${config.prefix}/` : ''}${dateStamp.slice(0, 4)}/${dateStamp.slice(4, 6)}/${path.basename(filePath)}`;
  const basePath = endpoint.pathname.replace(/^\/+|\/+$/g, '');
  endpoint.pathname = `/${[basePath, encodeURIComponent(config.bucket), encodePath(objectKey)].filter(Boolean).join('/')}`;
  endpoint.search = '';

  const body = fs.readFileSync(filePath);
  const payloadHash = sha256(body);
  const canonicalHeaders = [
    'content-type:application/vnd.sqlite3',
    `host:${endpoint.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['PUT', endpoint.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256(canonicalRequest)].join('\n');
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/vnd.sqlite3',
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`BACKUP_S3_UPLOAD_FAILED_HTTP_${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return { bucket: config.bucket, key: objectKey, endpoint: endpoint.origin, etag: response.headers.get('etag') || null };
}

let external = null;
try {
  external = await uploadS3Compatible(destination);
} catch (error) {
  console.error(`[backup] فشل رفع النسخة الخارجية: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
let removed = 0;
for (const entry of fs.readdirSync(backupDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || !/^ayrovi-.*\.sqlite$/.test(entry.name)) continue;
  const filePath = path.join(backupDirectory, entry.name);
  if (filePath === destination) continue;
  if (fs.statSync(filePath).mtimeMs < cutoff) {
    fs.rmSync(filePath, { force: true });
    removed += 1;
  }
}

console.log(JSON.stringify({
  success: true,
  database: databasePath,
  backup: destination,
  bytes: fs.statSync(destination).size,
  integrity,
  external,
  retentionDays,
  removed,
}, null, 2));
