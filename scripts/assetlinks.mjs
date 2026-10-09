#!/usr/bin/env node
/**
 * Android App Links — fabrique (et VÉRIFIE) `.well-known/assetlinks.json`.
 *
 * ── Pourquoi ce script existe ───────────────────────────────────────────────
 * `app.json` déclare des `intentFilters` avec `autoVerify`. Sans le fichier
 * `assetlinks.json` correspondant sur le domaine, Android ne VALIDE pas le
 * lien : il ouvre l'application mais en passant par une boîte de choix. Vu de
 * l'extérieur, « les liens profonds marchent mal » — alors que l'application
 * est juste et que la pièce manquante est sur le SERVEUR du domaine.
 *
 * Ce script ferme ce trou de deux façons :
 *   1. il FABRIQUE le fichier depuis le keystore de signature (la seule source
 *      sûre de l'empreinte — la recopier à la main est une erreur classique) ;
 *   2. il VÉRIFIE le fichier déjà publié : l'empreinte annoncée correspond-elle
 *      à celle du keystore, et les hôtes sont-ils bons ?
 *
 * ── Honnêteté ───────────────────────────────────────────────────────────────
 * Aucune empreinte n'est inventée. Sans keystore ET sans `--fingerprint`, le
 * script s'arrête en expliquant quoi faire — il ne produit pas de faux JSON.
 *
 * Usage :
 *   node scripts/assetlinks.mjs --keystore ./ayrovi.jks --alias ayrovi
 *   node scripts/assetlinks.mjs --fingerprint AB:CD:…            ( hors ligne )
 *   node scripts/assetlinks.mjs --fingerprint AB:CD:… --check    ( publier ? )
 *   node scripts/assetlinks.mjs --keystore ./ayrovi.jks --alias ayrovi --write public/.well-known/assetlinks.json
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULTS = {
  package: 'app.ayrovi.mobile',
  hosts: ['ayrovi.tn', 'www.ayrovi.tn'],
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { out[name] = true; continue; }
    out[name] = next;
    i += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write([
    'assetlinks.mjs — fabrique et vérifie .well-known/assetlinks.json',
    '',
    '  --keystore <fichier>   keystore de SIGNATURE (release), source de l’empreinte',
    '  --alias <nom>          alias de la clé dans le keystore',
    '  --storepass <mot>      mot de passe du keystore (sinon demandé par keytool)',
    '  --fingerprint <sha>    empreinte SHA-256 déjà connue (mode hors ligne)',
    '  --package <id>         identifiant Android (défaut : app.ayrovi.mobile)',
    '  --hosts <a,b>          hôtes à déclarer (défaut : ayrovi.tn,www.ayrovi.tn)',
    '  --write <chemin>       écrit le fichier à cet emplacement',
    '  --check                compare avec le fichier DÉJÀ PUBLIÉ sur les hôtes',
    '',
  ].join('\n'));
  process.exit(0);
}

const packageName = String(args.package || DEFAULTS.package);
const hosts = String(args.hosts || DEFAULTS.hosts.join(',')).split(',').map((h) => h.trim()).filter(Boolean);

/** Empreinte SHA-256 lue dans le keystore — jamais recopiée à la main. */
function fingerprintFromKeystore(keystore, alias, storepass) {
  const keytoolArgs = ['-list', '-v', '-keystore', keystore, '-alias', alias];
  if (storepass) keytoolArgs.push('-storepass', storepass);
  let output = '';
  try {
    output = execFileSync('keytool', keytoolArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const message = String(error?.stderr || error?.message || '');
    throw new Error(
      `keytool n’a pas pu lire « ${alias} » dans « ${keystore} ».\n`
      + `Cause : ${message.split('\n').filter(Boolean).slice(-1)[0] || 'inconnue'}\n`
      + 'Rappel : l’empreinte doit venir du keystore de SIGNATURE RELEASE, pas de celui de débogage.',
    );
  }
  const match = output.match(/SHA256:\s*([0-9A-Fa-f:]{95})/);
  if (!match) throw new Error(`Aucune empreinte SHA256 trouvée pour l’alias « ${alias} ».`);
  return match[1].toUpperCase();
}

function normalizeFingerprint(value) {
  const clean = String(value || '').trim().toUpperCase().replace(/[^0-9A-F]/g, '');
  if (clean.length !== 64) {
    throw new Error('Empreinte invalide : il faut 64 caractères hexadécimaux (SHA-256).');
  }
  return clean;
}

function buildAssetLinks(fingerprint) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: [fingerprint],
      },
    },
  ];
}

let fingerprint;
try {
  if (args.keystore && args.alias) {
    fingerprint = normalizeFingerprint(fingerprintFromKeystore(String(args.keystore), String(args.alias), args.storepass ? String(args.storepass) : ''));
  } else if (args.fingerprint) {
    fingerprint = normalizeFingerprint(args.fingerprint);
  } else {
    throw new Error('Aucune source d’empreinte : donnez --keystore ET --alias, ou --fingerprint.');
  }
} catch (error) {
  process.stderr.write(`\n✗ ${error.message}\n\n`);
  process.exit(2);
}

const body = buildAssetLinks(fingerprint);
const json = `${JSON.stringify(body, null, 2)}\n`;

process.stdout.write(`\nEmpreinte SHA-256 : ${fingerprint}\n`);
process.stdout.write(`Paquet            : ${packageName}\n`);
process.stdout.write(`Hôtes             : ${hosts.join(', ')}\n\n`);

if (args.write) {
  const target = String(args.write);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, json, 'utf8');
  process.stdout.write(`✓ écrit : ${target}\n`);
} else if (!args.check) {
  process.stdout.write(`${json}`);
}

/* ── Vérification du fichier publié ───────────────────────────────────────── */

if (args.check) {
  let failures = 0;
  let unreachable = 0;
  for (const host of hosts) {
    const url = `https://${host}/.well-known/assetlinks.json`;
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
      const text = await response.text();
      if (!response.ok) {
        process.stdout.write(`✗ ${host} → HTTP ${response.status} (fichier absent)\n`);
        failures += 1;
        continue;
      }
      const parsed = JSON.parse(text);
      const prints = (parsed ?? [])
        .flatMap((entry) => entry?.target?.sha256_cert_fingerprints ?? [])
        .map((value) => String(value).toUpperCase());
      const rightPackage = (parsed ?? []).some((entry) => entry?.target?.package_name === packageName);
      if (prints.includes(fingerprint) && rightPackage) {
        process.stdout.write(`✓ ${host} → empreinte et paquet conformes\n`);
      } else {
        process.stdout.write(`✗ ${host} → publié mais NON conforme\n`);
        if (!rightPackage) process.stdout.write(`    paquet attendu ${packageName}, absent du fichier\n`);
        if (!prints.includes(fingerprint)) {
          process.stdout.write(`    empreinte attendue ${fingerprint}\n`);
          process.stdout.write(`    empreintes publiées : ${prints.join(', ') || '(aucune)'}\n`);
        }
        failures += 1;
      }
    } catch (error) {
      // « Injoignable » et « non conforme » ne sont PAS la même chose : le
      // premier dit qu'on n'a pas pu regarder, le second qu'on a regardé et
      // que c'est faux. Les confondre ferait croire à un défaut constaté.
      process.stdout.write(`? ${host} → injoignable (${String(error?.message || error).slice(0, 80)})\n`);
      unreachable += 1;
    }
  }
  if (failures === 0 && unreachable === 0) {
    process.stdout.write('\n✓ App Links validés : Android ouvrira l’application sans demander.\n\n');
  } else if (failures === 0) {
    process.stdout.write(`\n? ${unreachable} hôte(s) INJOIGNABLE(S) : rien n’a pu être vérifié — ce n’est pas un défaut constaté.\n\n`);
  } else {
    process.stdout.write(`\n✗ ${failures} hôte(s) non conforme(s) : Android affichera une boîte de choix.\n\n`);
  }
  process.exit(failures === 0 && unreachable === 0 ? 0 : 1);
}
