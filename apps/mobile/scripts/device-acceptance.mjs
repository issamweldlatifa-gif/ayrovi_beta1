#!/usr/bin/env node
/**
 * قبول Android على جهاز حقيقي — يفحص ما لا تنجّم CI تثبتو وحدها.
 *
 * الآلة تثبت:
 *   1) assetlinks المنشور يذكر package الديمو + بصمة الشهادة الفعلية؛
 *   2) جهاز ADB واحد ومصرّح به، والحزمة مركّبة؛
 *   3) Android يعتبر نطاق Beta verified (Android 12+)؛
 *   4) resolver الحقيقي للرابط هو ZAYROVI، موش المتصفح/Chooser؛
 *   5) اختيارياً يفتح رابط Lens على الهاتف.
 *
 * الكاميرا والمعرض وإعادة التشغيل تحتاج عين/لمسة إنسان؛ في الآخر نطبع checklist
 * صريح وما نعلنهمش ناجحين آلياً.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentBase, validateBase } from './set-api-base.mjs';

export const DEMO_PACKAGE = 'app.zayrovi.mobile.demo';
export const DEFAULT_LINK_PATH = '/lens';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FINGERPRINT_SOURCE = path.join(ROOT, 'shared/appLinks.ts');

function normalizedFingerprint(value) {
  return String(value || '').trim().toUpperCase().replace(/^SHA-?256:\s*/, '');
}

export function declaredDemoFingerprint(source = readFileSync(FINGERPRINT_SOURCE, 'utf8')) {
  const match = source.match(/export const ANDROID_APP_LINK_DEMO_SHA256 = '([^']+)'/);
  if (!match) throw new Error('ANDROID_APP_LINK_DEMO_SHA256 introuvable dans shared/appLinks.ts');
  return normalizedFingerprint(match[1]);
}

export function parseAdbDevices(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices'))
    .map((line) => {
      const [serial = '', state = 'unknown'] = line.split(/\s+/);
      return { serial, state };
    });
}

export function parseDomainVerificationStates(output) {
  const states = {};
  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.match(/^\s*([a-z0-9.-]+):\s+([a-z0-9_+-]+)\s*$/i);
    // `pm get-app-links` imprime aussi `ID: 1234`; un domaine Android
    // contient forcément au moins un point, contrairement à ces métadonnées.
    if (match && match[1].includes('.')) states[match[1].toLowerCase()] = match[2].toLowerCase();
  }
  return states;
}

export function parseResolvedPackage(output) {
  const matches = [...String(output || '').matchAll(/(?:^|\s)([a-z][a-z0-9_.]+)\/[a-z0-9_.$]+/gim)];
  return matches.length > 0 ? matches.at(-1)[1] : null;
}

export function validateAssetLinks(document, packageName, expectedFingerprint) {
  if (!Array.isArray(document)) return { ok: false, reason: 'la réponse n’est pas un tableau JSON' };
  const expected = normalizedFingerprint(expectedFingerprint);
  const entry = document.find((row) => row?.target?.package_name === packageName);
  if (!entry) return { ok: false, reason: `package absente: ${packageName}` };
  const fingerprints = Array.isArray(entry?.target?.sha256_cert_fingerprints)
    ? entry.target.sha256_cert_fingerprints.map(normalizedFingerprint)
    : [];
  if (!fingerprints.includes(expected)) {
    return { ok: false, reason: `empreinte de l’APK absente (${expected.slice(0, 17)}…)` };
  }
  return { ok: true, reason: `${packageName} · ${expected.slice(0, 17)}…` };
}

function parseArgs(argv) {
  const options = {
    packageName: DEMO_PACKAGE,
    origin: currentBase(ROOT),
    path: DEFAULT_LINK_PATH,
    apk: '',
    serial: process.env.ANDROID_SERIAL || '',
    launch: false,
    json: false,
    timeoutMs: 30_000,
  };
  const valueFlags = new Map([
    ['--package', 'packageName'],
    ['--origin', 'origin'],
    ['--path', 'path'],
    ['--apk', 'apk'],
    ['--serial', 'serial'],
    ['--timeout-ms', 'timeoutMs'],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--launch') options.launch = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (valueFlags.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`قيمة ناقصة بعد ${arg}`);
      options[valueFlags.get(arg)] = value;
      index += 1;
    } else throw new Error(`خيار غير معروف: ${arg}`);
  }
  options.timeoutMs = Number(options.timeoutMs);
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 120_000) {
    throw new Error('--timeout-ms لازم يكون بين 1000 و120000');
  }
  const origin = validateBase(options.origin).origin;
  const link = new URL(options.path, `${origin}/`);
  if (link.origin !== origin) throw new Error('--path لازم يبقى على نفس نطاق --origin');
  options.origin = origin;
  options.link = link.href;
  return options;
}

function command(binary, args, { serial = '', allowFailure = false } = {}) {
  const finalArgs = binary === 'adb' && serial ? ['-s', serial, ...args] : args;
  const result = spawnSync(binary, finalArgs, { encoding: 'utf8', windowsHide: true });
  if (result.error && !allowFailure) throw new Error(`${binary}: ${result.error.message}`);
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || result.error?.message || '').trim();
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${binary} ${finalArgs.join(' ')}: ${stderr || stdout || `code ${result.status}`}`);
  }
  return { status: result.status ?? 1, stdout, stderr };
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchAssetLinks(origin, timeoutMs) {
  const response = await fetch(`${origin}/.well-known/assetlinks.json`, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!response.ok) throw new Error(`assetlinks HTTP ${response.status}: ${text.slice(0, 180)}`);
  return body;
}

function printHelp() {
  console.log([
    'ZAYROVI — قبول Android على جهاز حقيقي',
    '',
    'الاستعمال:',
    '  npm run device:acceptance -- --launch',
    '  npm run device:acceptance -- --apk /chemin/ZAYROVI-demo.apk --launch',
    '',
    'الخيارات:',
    '  --serial <adb serial>  جهاز معيّن إذا مربوط أكثر من واحد',
    '  --origin <https://…>   خادم Beta (الافتراضي من src/api/config.ts)',
    '  --path </lens>         الرابط الذي نختبره',
    '  --package <id>         الافتراضي app.zayrovi.mobile.demo',
    '  --apk <fichier.apk>    يثبّت APK بـ adb install -r قبل الفحص',
    '  --launch               يفتح الرابط فعلياً بعد التحقق',
    '  --json                 تقرير JSON للآلة',
  ].join('\n'));
}

export async function runAcceptance(options) {
  const checks = [];
  const record = (id, status, detail) => checks.push({ id, status, detail });
  const expectedFingerprint = declaredDemoFingerprint();

  try {
    const links = await fetchAssetLinks(options.origin, options.timeoutMs);
    const validation = validateAssetLinks(links, options.packageName, expectedFingerprint);
    record('server-assetlinks', validation.ok ? 'pass' : 'fail', validation.reason);
  } catch (error) {
    record('server-assetlinks', 'fail', error instanceof Error ? error.message : String(error));
  }

  const adbVersion = command('adb', ['version'], { allowFailure: true });
  if (adbVersion.status !== 0) {
    record('adb', 'fail', adbVersion.stderr || 'adb introuvable — installe Android Platform Tools');
    return { ok: false, checks, manual: [] };
  }
  record('adb', 'pass', adbVersion.stdout.split(/\r?\n/)[0] || 'adb disponible');

  const listed = parseAdbDevices(command('adb', ['devices']).stdout);
  const authorized = listed.filter((device) => device.state === 'device');
  let serial = options.serial;
  if (serial) {
    const selected = listed.find((device) => device.serial === serial);
    if (!selected || selected.state !== 'device') {
      record('device', 'fail', `${serial}: ${selected?.state || 'absent'}`);
      return { ok: false, checks, manual: [] };
    }
  } else if (authorized.length === 1) serial = authorized[0].serial;
  else {
    const detail = authorized.length === 0
      ? `aucun appareil autorisé (${listed.map((item) => `${item.serial}:${item.state}`).join(', ') || 'liste vide'})`
      : `plusieurs appareils: ${authorized.map((item) => item.serial).join(', ')} — utilise --serial`;
    record('device', 'fail', detail);
    return { ok: false, checks, manual: [] };
  }
  record('device', 'pass', serial);

  if (options.apk) {
    const apkPath = path.resolve(options.apk);
    if (!existsSync(apkPath)) record('install', 'fail', `APK introuvable: ${apkPath}`);
    else {
      const installed = command('adb', ['install', '-r', apkPath], { serial, allowFailure: true });
      record('install', installed.status === 0 ? 'pass' : 'fail', installed.stdout || installed.stderr);
    }
  }

  const packagePath = command('adb', ['shell', 'pm', 'path', options.packageName], { serial, allowFailure: true });
  if (packagePath.status !== 0 || !packagePath.stdout.includes('package:')) {
    record('package', 'fail', `${options.packageName} n’est pas installée`);
    return { ok: false, checks, manual: [] };
  }
  record('package', 'pass', packagePath.stdout.replace(/^package:/, ''));

  const sdkRaw = command('adb', ['shell', 'getprop', 'ro.build.version.sdk'], { serial, allowFailure: true }).stdout;
  const sdk = Number.parseInt(sdkRaw, 10);
  record('android', Number.isFinite(sdk) ? 'pass' : 'warn', Number.isFinite(sdk) ? `API ${sdk}` : 'API inconnue');

  const host = new URL(options.origin).hostname.toLowerCase();
  if (sdk >= 31) {
    command('adb', ['shell', 'pm', 'verify-app-links', '--re-verify', options.packageName], { serial, allowFailure: true });
    let state = 'missing';
    let raw = '';
    const deadline = Date.now() + options.timeoutMs;
    do {
      raw = command('adb', ['shell', 'pm', 'get-app-links', options.packageName], { serial, allowFailure: true }).stdout;
      state = parseDomainVerificationStates(raw)[host] || 'missing';
      if (state === 'verified' || state === 'system_configured') break;
      await pause(2_000);
    } while (Date.now() < deadline);
    const verified = state === 'verified' || state === 'system_configured';
    record('domain-verification', verified ? 'pass' : 'fail', `${host}: ${state}`);
  } else {
    record('domain-verification', 'warn', `API ${sdkRaw || '?'}: pm get-app-links exige Android 12; le resolver ci-dessous reste décisif`);
  }

  const resolved = command('adb', [
    'shell', 'cmd', 'package', 'resolve-activity', '--brief',
    '-a', 'android.intent.action.VIEW',
    '-c', 'android.intent.category.BROWSABLE',
    '-d', options.link,
  ], { serial, allowFailure: true });
  const resolvedPackage = parseResolvedPackage(`${resolved.stdout}\n${resolved.stderr}`);
  record('resolver', resolvedPackage === options.packageName ? 'pass' : 'fail', resolvedPackage || 'aucun handler résolu');

  if (options.launch) {
    const launched = command('adb', [
      'shell', 'am', 'start', '-W',
      '-a', 'android.intent.action.VIEW',
      '-c', 'android.intent.category.BROWSABLE',
      '-d', options.link,
    ], { serial, allowFailure: true });
    record('launch', launched.status === 0 ? 'pass' : 'fail', launched.stdout || launched.stderr);
  } else record('launch', 'manual', 'ajoute --launch pour ouvrir réellement Lens sur le téléphone');

  const manual = [
    'Lens s’ouvre directement dans ZAYROVI, sans navigateur ni fenêtre de choix.',
    'Caméra: accepter l’autorisation, capturer un produit net, puis annuler/reprendre sans écran bloqué.',
    'Permission refusée: refuser CAMERA; l’écran explique le refus et le bouton Galerie reste utilisable.',
    'Galerie: choisir JPG/PNG/WebP, revenir, vérifier l’aperçu puis lancer la recherche.',
    'Arrière-plan/reprise: pendant un résultat ou un timer panier, quitter puis revenir; pas de double requête.',
    'Redémarrage: tuer ZAYROVI, rouvrir; le délai Lens vient du serveur et une ligne expirée demande une nouvelle vérification.',
    'RTL/FR et TalkBack: ordre de lecture, libellés Retour/Panier/CTA, zones tactiles et focus visibles.',
  ];
  const ok = !checks.some((check) => check.status === 'fail');
  return { ok, serial, link: options.link, packageName: options.packageName, checks, manual };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    const report = await runAcceptance(options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`\nZAYROVI Android — ${report.ok ? '✅ partie automatisable valide' : '❌ échec'}\n`);
      for (const check of report.checks) {
        const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : check.status === 'warn' ? '⚠️' : '👆';
        console.log(`${icon} ${check.id}: ${check.detail}`);
      }
      if (report.manual.length > 0) {
        console.log('\nقبول يدوي لازم يتعمل على نفس الهاتف:');
        report.manual.forEach((item, index) => console.log(`  ${index + 1}. ${item}`));
      }
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
