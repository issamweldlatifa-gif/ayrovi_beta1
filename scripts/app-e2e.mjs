#!/usr/bin/env node
/**
 * Parcours complet de l'APPLICATION contre un serveur, sans téléphone.
 *
 * Ce que ça prouve, et pourquoi ça existe : « l'appli ne marche pas » est un
 * symptôme, pas un diagnostic. Le seul juge est la chaîne réelle —
 *   connexion (jeton de session) → profil → panier → CAISSE → commande
 * — exécutée exactement comme l'application l'exécute : en-tête
 * `x-ayrovi-client`, `Authorization: Bearer`, `x-session-id`, `x-csrf-token`.
 *
 * Différences avec le workflow `beta-smoke.yml` (qui vise un serveur distant et
 * ne peut pas créer de commande) : ici on va jusqu'à la COMMANDE CRÉÉE, sur un
 * serveur local dont on maîtrise la base. C'est le filet qui empêche une
 * régression serveur d'arriver jusqu'au téléphone.
 *
 * Usage :
 *   node scripts/app-e2e.mjs --base http://127.0.0.1:4321
 *   APP_E2E_BASE=http://127.0.0.1:4321 node scripts/app-e2e.mjs --json
 *
 * Sortie : tableau lisible + `::notice::` (GitHub) ; code de sortie 1 si une
 * fonction de l'appli est réellement cassée. Les barrières DÉCLARÉES (compte non
 * vérifié, SMS non configuré) sont rapportées comme telles — jamais maquillées.
 */
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const BASE = String(argValue('--base') || process.env.APP_E2E_BASE || 'http://127.0.0.1:4321').replace(/\/$/, '');
const JSON_OUT = args.includes('--json');
/**
 * Sur un serveur qu'on DÉMARRE nous-mêmes (local / CI), `branch` vaut forcément
 * `unknown` : personne n'a déclaré de branche. Exiger un nom de branche n'aurait
 * donc aucun sens et ferait échouer un parcours parfaitement sain. Sur un serveur
 * distant, en revanche, l'absence de branche veut dire « le serveur ne connaît
 * pas le contrat de session de l'appli » — et là, c'est un échec.
 */
const isLoopback = (() => {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(BASE).hostname);
  } catch {
    return false;
  }
})();
const ALLOW_UNKNOWN_BRANCH = isLoopback;
void ALLOW_UNKNOWN_BRANCH;
const CLIENT = 'mobile/2.0.0';
const TIMEOUT_MS = Number(argValue('--timeout') || 60_000);

const results = [];
const cookies = [];
const record = (step, code, verdict, note) => results.push({ step, code: String(code), verdict, note });
const bad = () => results.some((entry) => entry.verdict === 'fail');
const gated = () => results.some((entry) => entry.verdict === 'skip' || entry.verdict === 'warn');

async function call(method, path, options = {}) {
  const headers = { Accept: 'application/json', 'x-ayrovi-client': CLIENT, ...(options.headers || {}) };
  if (cookies.length) headers.Cookie = cookies.join('; ');
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.csrf) headers['x-csrf-token'] = options.csrf;
  if (options.sessionId) headers['x-session-id'] = options.sessionId;
  const init = { method, headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(`${BASE}${path}`, init);
  for (const raw of response.headers.getSetCookie?.() ?? []) cookies.push(raw.split(';')[0]);
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { status: response.status, data, text, location: response.headers.get('location') || '' };
}

/** Extraction tolérante : les routes du serveur n'ont pas toutes la même enveloppe. */
function pick(payload, path) {
  let current = payload;
  for (const key of path.split('.')) {
    if (current && typeof current === 'object' && key in current) current = current[key];
    else return undefined;
  }
  return current;
}
const text = (value) => (value === undefined || value === null ? '' : String(value));

const summaryLines = [];
const say = (line) => {
  summaryLines.push(line);
  if (!JSON_OUT) console.log(line);
};

async function main() {
  say(`# Parcours complet de l'application — ${BASE}\n`);
  say('| Étape | Code | Verdict | Lecture |');
  say('|---|---|---|---|');

  // 1) Le serveur est-il celui de la BRANCHE (sinon la session mobile n'existe pas) ?
  const ready = await call('GET', '/api/ready');
  const branch = text(pick(ready.data, 'branch'));
  const commit = text(pick(ready.data, 'commit'));
  const version = text(pick(ready.data, 'version'));
  if (ready.status !== 200) {
    record('GET /api/ready', ready.status, 'fail', '❌ le serveur ne répond pas');
  } else if ((!branch || branch === 'unknown') && !ALLOW_UNKNOWN_BRANCH) {
    record('GET /api/ready', 200, 'fail', `❌ aucune branche déclarée (commit=${commit || '—'}) ⇒ ce serveur ne sert pas le contrat de session de l'appli`);
  } else if (!branch || branch === 'unknown') {
    record('GET /api/ready', 200, 'ok', `✅ serveur local démarré ici même · commit \`${commit || '—'}\` · version \`${version || '—'}\` (branche non déclarée : normal hors Render)`);
  } else {
    record('GET /api/ready', 200, 'ok', `✅ commit \`${commit || '—'}\` · branche \`${branch}\` · version \`${version || '—'}\``);
  }
  if (ready.status !== 200 || ((!branch || branch === 'unknown') && !ALLOW_UNKNOWN_BRANCH)) {
    finish('serveur inutilisable pour l\u2019appli');
    return;
  }

  // 2) Connexion par SMS (le seul moyen automatisable) → jeton de session.
  const phone = '20123456';
  const otpRequest = await call('POST', '/api/customer/auth/otp/request', { body: { phone } });
  const challengeId = text(pick(otpRequest.data, 'data.challengeId'));
  const devCode = text(pick(otpRequest.data, 'data.developmentCode'));
  if (otpRequest.status !== 201 || !challengeId) {
    record('POST /api/customer/auth/otp/request', otpRequest.status, 'fail', `❌ impossible de demander un code (code \`${text(pick(otpRequest.data, 'code')) || '—'}\`)`);
    finish('connexion impossible : pas de code SMS');
    return;
  }
  if (!devCode) {
    record('POST /api/customer/auth/otp/request', 201, 'skip', '⏭️ SMS réellement envoyé (pas de code de développement) : la connexion ne peut pas être automatisée ici — testez au téléphone');
    finish('connexion non automatisable sur ce serveur');
    return;
  }
  record('POST /api/customer/auth/otp/request', 201, 'ok', '✅ code de test délivré par le serveur');

  const otpVerify = await call('POST', '/api/customer/auth/otp/verify', { body: { challengeId, code: devCode } });
  let token = text(pick(otpVerify.data, 'data.session_token'));
  let csrf = text(pick(otpVerify.data, 'data.csrfToken'));
  if (!token) {
    record('POST /api/customer/auth/otp/verify', otpVerify.status, 'fail', `❌ aucun \`session_token\` (code \`${text(pick(otpVerify.data, 'code')) || '—'}\`) ⇒ la connexion de l'appli échouerait ici`);
    finish('session non remise à l\u2019appli');
    return;
  }
  record('POST /api/customer/auth/otp/verify', otpVerify.status, 'ok', '✅ `session_token` remis à l\'appli');

  // 3) Le jeton ouvre bien le profil (et le serveur y fait TOURNER le jeton CSRF).
  const me = await call('GET', '/api/customer/auth/me', { token });
  const account = pick(me.data, 'data.account');
  const accountEmail = text(pick(me.data, 'data.account.email'));
  const accountPhone = text(pick(me.data, 'data.account.phone'));
  const phoneVerified = pick(me.data, 'data.account.phoneVerified') === true;
  const rotated = text(pick(me.data, 'data.csrfToken'));
  if (rotated) csrf = rotated;
  if (me.status !== 200 || !account || typeof account !== 'object') {
    record('GET /api/customer/auth/me', me.status, 'fail', '❌ le jeton de session ne donne pas accès au compte');
    finish('session inutilisable');
    return;
  }
  // Un compte créé par SMS n'a PAS d'e-mail : c'est normal, pas une anomalie.
  record('GET /api/customer/auth/me', 200, 'ok', `✅ compte reconnu (téléphone \`${accountPhone || '—'}\`, e-mail ${accountEmail ? `\`${accountEmail}\`` : 'absent (connexion par SMS)'}) · téléphone vérifié : ${phoneVerified ? 'oui' : 'non'}${rotated ? ' · jeton CSRF renouvelé' : ''}`);

  const sessionId = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  // 4) Panier : l'appli n'envoie JAMAIS de prix, le serveur le calcule.
  const add = await call('POST', '/api/cart/items', {
    token,
    csrf,
    sessionId,
    body: {
      title: 'Article de test AYROVI',
      store: 'aliexpress',
      url: 'https://example.com/article-de-test',
      imageUrl: 'https://example.com/article-de-test.jpg',
      sourcePrice: 100,
      sourceCurrency: 'TND',
      quantity: 1,
      // Aucune variante (taille/couleur) : le serveur réserve la porte de
      // disponibilité (`NO_CONTRACT`) aux articles AVEC variante, parce que le
      // navigateur ne peut pas prouver une disponibilité. Le parcours de base est
      // donc sans variante — comme le dépôt manuel de l'appli.
      customerNote: '',
    },
  });
  const pricedTND = pick(add.data, 'totalTND');
  if (add.status !== 201) {
    const code = text(pick(add.data, 'code'));
    record('POST /api/cart/items', add.status, 'fail', `❌ article refusé (code \`${code || '—'}\`, ${text(pick(add.data, 'error')) || 'sans message'})`);
    finish('panier indisponible');
    return;
  }
  record('POST /api/cart/items', 201, 'ok', `✅ article accepté · total panier \`${pricedTND ?? '—'} TND\` (prix calculé par le serveur)`);

  // 5) Relecture du panier : c'est ce que l'écran Panier affiche.
  const cart = await call('GET', '/api/cart/items', { token, sessionId });
  if (cart.status !== 200) {
    record('GET /api/cart/items', cart.status, 'fail', '❌ le panier ne se relit pas');
    finish('panier illisible');
    return;
  }
  record('GET /api/cart/items', 200, 'ok', '✅ panier relu');

  // Sans e-mail de compte (connexion SMS), la commande a besoin d'une adresse de
  // facturation : l'appli la demande dans le formulaire. On en fournit une de test.
  const billingEmail = accountEmail || `e2e.${Date.now()}@ayrovi.test`;

  // 6) Caisse : la commande est créée AVANT le paiement.
  const checkout = await call('POST', '/api/checkout', {
    token,
    csrf,
    sessionId,
    body: {
      name: 'Test E2E',
      email: accountEmail || billingEmail,
      phone,
      city: 'Tunis',
      address: 'Rue de test 1',
      deliveryMode: 'home',
      paymentMethod: 'PENDING_SELECTION',
      latitude: 36.8065,
      longitude: 10.1815,
      locale: 'ar-TN',
      termsAccepted: true,
    },
  });
  const orderId = text(pick(checkout.data, 'orderId'));
  const orderNumber = text(pick(checkout.data, 'orderNumber'));
  const orderTotal = pick(checkout.data, 'totalTND');
  const refusal = text(pick(checkout.data, 'code'));
  if (checkout.status === 200 && orderNumber) {
    record('POST /api/checkout', 200, 'ok', `✅ commande créée \`${orderNumber}\` · \`${orderTotal ?? '—'} TND\` · id \`${orderId}\``);
  } else if (checkout.status === 403 && refusal === 'CONTACT_VERIFICATION_REQUIRED') {
    record('POST /api/checkout', 403, 'warn', '⚠️ compte non vérifié (barrière VOULUE du serveur) — vérifiez l\'e-mail (Google/Apple/Facebook) ou le téléphone (SMS) avant de commander');
  } else if (checkout.status === 400 && !text(pick(checkout.data, 'error'))) {
    record('POST /api/checkout', 400, 'fail', '❌ refus sans message');
  } else {
    record('POST /api/checkout', checkout.status, 'fail', `❌ commande non créée (code \`${refusal || '—'}\`, ${text(pick(checkout.data, 'error')) || 'sans message'})`);
  }

  // 7) La commande apparaît-elle dans le compte ? (onglet Commandes)
  const orders = await call('GET', '/api/customer/account/orders', { token });
  if (orders.status !== 200) {
    record('GET /api/customer/account/orders', orders.status, 'fail', '❌ la liste des commandes ne répond pas');
  } else if (orderNumber && !orders.text.includes(orderNumber)) {
    record('GET /api/customer/account/orders', 200, 'fail', `❌ la commande \`${orderNumber}\` n'apparaît pas dans la liste`);
  } else {
    record('GET /api/customer/account/orders', 200, 'ok', orderNumber ? `✅ commande \`${orderNumber}\` visible dans la liste` : '✅ liste servie');
  }

  // 8) Détail de la commande : montants + moyens de paiement proposés.
  if (orderId) {
    const detail = await call('GET', `/api/customer/account/orders/${encodeURIComponent(orderId)}`, { token });
    const options = pick(detail.data, 'data.paymentOptions') ?? pick(detail.data, 'paymentOptions');
    const keys = options && typeof options === 'object' ? Object.keys(options).join(', ') : '';
    if (detail.status !== 200) {
      record('GET /account/orders/:id', detail.status, 'fail', '❌ le détail de la commande ne répond pas');
    } else {
      record('GET /account/orders/:id', 200, 'ok', `✅ montants servis${keys ? ` · moyens de paiement : \`${keys}\`` : ''}`);
    }
  }

  finish();
}

function finish(context) {
  const failures = results.filter((entry) => entry.verdict === 'fail');
  const warnings = results.filter((entry) => entry.verdict === 'warn' || entry.verdict === 'skip');
  const headline = results.map((entry) => `${entry.step}=${entry.code}`).join(' ');
  const verdict = failures.length
    ? `❌ ÉCHEC — ${failures.length} fonction(s) de l'appli cassée(s)${context ? ` (${context})` : ''}`
    : warnings.length
      ? `⚠️ parcours non concluant — ${warnings.length} étape(s) en attente${context ? ` (${context})` : ''}`
      : '✅ le parcours complet fonctionne : connexion → panier → commande';
  say(`\n**Verdict : ${verdict}**`);
  for (const entry of results) say(`| ${entry.step} | ${entry.code} | ${entry.verdict === 'ok' ? '✅' : entry.verdict === 'warn' ? '⚠️' : entry.verdict === 'skip' ? '⏭️' : '❌'} | ${entry.note} |`);

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const table = summaryLines.slice(1).join('\n');
    appendFileSync(summary, `## Parcours complet de l application\n\nServeur : \`${BASE}\`\n\n${table}\n`);
  }
  console.log(`::notice title=Parcours complet::${verdict} {${headline}}`);
  if (failures.length) console.log(`::error title=Parcours complet::${failures.map((entry) => `${entry.step} → ${entry.code}`).join(' | ')}`);
  if (JSON_OUT) console.log(JSON.stringify({ base: BASE, verdict, results }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.log(`::error title=Parcours complet::${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
