/**
 * AYROVI — audit complet de l'admin (2026-09-22).
 *
 * Ce que cet audit mesure, écran par écran, sur l'application RÉELLE :
 *   1. l'écran se rend (titre présent, pas d'état bloqué sur « Chargement… ») ;
 *   2. aucune erreur JavaScript, aucune réponse HTTP en échec sur les surfaces admin ;
 *   3. les contrôles morts : liens `href="#"`, boutons sans nom accessible, champs sans étiquette,
 *      images sans texte alternatif, boutons désactivés sans motif lisible ;
 *   4. la densité de l'écran (nombre de contrôles, de tableaux, de titres) — pour repérer un écran
 *      vide ou, à l'inverse, un écran surchargé ;
 *   5. l'authentification : toute surface `/api/admin/*` refuse un appel sans session, toute
 *      écriture exige le jeton CSRF, et le cookie de session porte les bons drapeaux.
 *
 * Sortie : `docs/admin-model-a/audit/*.json` + un rapport lisible `audit/RAPPORT.md`.
 * Usage  : AYROVI_BASE_URL=http://127.0.0.1:3000 AYROVI_ADMIN_PASSWORD=… node verify/admin-audit.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.env.AYROVI_BASE_URL;
if (!base) { console.error('AYROVI_BASE_URL est requis.'); process.exit(1); }
const email = process.env.AYROVI_ADMIN_EMAIL || 'admin@ayrovi.tn';
const password = process.env.AYROVI_ADMIN_PASSWORD || 'AyroviBeta2026!';
const output = 'docs/admin-model-a/audit';
fs.mkdirSync(output, { recursive: true });

/** Bruit connu et légitime : un visiteur non connecté reçoit 401 sur /api/customer/*. */
const IGNORED = [/\/api\/customer\//, /favicon/];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 940 } });
const page = await context.newPage();

const consoleErrors = [];
const httpErrors = [];
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200)); });
page.on('pageerror', (error) => consoleErrors.push(`JS ${String(error).slice(0, 200)}`));
page.on('response', (response) => {
  const url = response.url();
  if (response.status() < 400) return;
  if (IGNORED.some((pattern) => pattern.test(url))) return;
  httpErrors.push(`${response.status()} ${url.replace(base, '')}`);
});

/* ── Connexion : on mesure aussi l'écran de connexion lui-même ──────────────────────────────── */
const loginScreen = {};
await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
loginScreen.fields = await page.locator('input').count();
loginScreen.passwordType = await page.locator('input[type=password]').count();
loginScreen.submit = await page.getByRole('button').allInnerTexts();
loginScreen.hasAutocomplete = await page.locator('input[autocomplete]').count();
loginScreen.labels = await page.evaluate(() => [...document.querySelectorAll('label')].map((l) => l.textContent.trim().slice(0, 40)));
loginScreen.title = await page.title();
loginScreen.status = await page.locator('.admin-login-status').getAttribute('data-state');
loginScreen.passwordToggle = await page.locator('.admin-password button').getAttribute('aria-label');
await page.screenshot({ path: `${output}/login-desktop.png` });
loginScreen.screenshots = [`${output}/login-desktop.png`];
await page.fill('input[type=email]', email);
await page.fill('input[type=password]', password);
await page.getByRole('button', { name: 'Se connecter' }).click();
await page.waitForTimeout(2500);

/* ── Le plan de l'admin vient du serveur (aucune liste recopiée ici) ────────────────────────── */
const navigation = JSON.parse(await (await context.request.get(`${base}/api/admin/back-office/navigation`)).text());
const sections = navigation.data.groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));

const audit = [];
for (const item of sections) {
  const before = { console: consoleErrors.length, http: httpErrors.length };
  await page.goto(`${base}/admin?section=${item.section}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);

  const dom = await page.evaluate(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const accessibleName = (node) => (node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '').trim();
    const main = document.querySelector('main');
    return {
      heading: (document.querySelector('main h1, main h2, .bo-workspace-header h2')?.textContent || '').trim().slice(0, 60),
      buttons: [...document.querySelectorAll('main button')].filter(visible).length,
      unnamedButtons: [...document.querySelectorAll('main button')].filter((node) => visible(node) && !accessibleName(node)).map((node) => node.className.toString().slice(0, 40)).slice(0, 6),
      disabledButtons: [...document.querySelectorAll('main button')].filter((node) => visible(node) && node.disabled).length,
      disabledWithoutReason: [...document.querySelectorAll('main button')].filter((node) => visible(node) && node.disabled && !(node.getAttribute('title') || '').trim()).length,
      deadLinks: [...document.querySelectorAll('main a')].filter((node) => visible(node) && ['#', ''].includes(node.getAttribute('href') || '')).map((node) => (node.textContent || '').trim().slice(0, 30)).slice(0, 6),
      links: [...document.querySelectorAll('main a')].filter(visible).length,
      tables: document.querySelectorAll('main table').length,
      rows: document.querySelectorAll('main table tbody tr').length,
      inputs: [...document.querySelectorAll('main input, main select, main textarea')].filter(visible).length,
      unlabeledInputs: [...document.querySelectorAll('main input, main select, main textarea')].filter((node) => {
        if (!visible(node)) return false;
        if (node.getAttribute('aria-label') || (node.getAttribute('placeholder') || '').trim()) return false;
        const id = node.getAttribute('id');
        if (id && document.querySelector(`label[for="${id}"]`)) return false;
        return !node.closest('label') && !node.closest('.admin-field');
      }).length,
      imagesWithoutAlt: [...document.querySelectorAll('main img')].filter((node) => visible(node) && node.getAttribute('alt') === null).length,
      emptyMain: !main || (main.textContent || '').trim().length < 40,
      stuck: /Chargement|Loading…|Chargement…/.test((main?.textContent || '').slice(0, 400)) && document.querySelectorAll('main table tbody tr').length === 0,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      text: (main?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
    };
  });

  audit.push({
    section: item.section,
    label: item.label,
    service: item.group,
    domain: item.domain,
    moduleStatus: item.moduleStatus,
    url: `/admin?section=${item.section}`,
    ...dom,
    consoleErrors: consoleErrors.slice(before.console),
    httpErrors: httpErrors.slice(before.http),
  });
  console.error(`  · ${item.section.padEnd(22)} ${String(dom.rows).padStart(3)} lignes · ${String(dom.buttons).padStart(3)} boutons · ${consoleErrors.length - before.console} erreur(s) JS · ${httpErrors.length - before.http} HTTP`);
}

/* ── Authentification, CSRF, révocation et fuites : la partie qui doit être VRAIE ──────────────
   Correctif d'audit : la version précédente interrogeait les surfaces protégées avec le contexte
   DÉJÀ authentifié — elle mesurait donc 200 partout et ne prouvait rien. Les sondes anonymes
   tournent désormais dans un contexte vierge, sans aucun cookie : c'est la seule façon d'obtenir
   un 401 qui veuille dire quelque chose. On ajoute trois preuves qui manquaient :
     • la révocation : un cookie volé après déconnexion ne doit plus rien ouvrir ;
     • la fuite de secrets : aucune réponse admin ne doit contenir d'empreinte ou de clé ;
     • les en-têtes et drapeaux : cookie HttpOnly/SameSite, refus de mise en cadre.
   ──────────────────────────────────────────────────────────────────────────────────────────── */
const GUARDED = [
  ['navigation', '/api/admin/back-office/navigation'],
  ['commandes', '/api/admin/orders?page=1&pageSize=1'],
  ['contenu (actualités)', '/api/admin/news'],
  ['comptes admin', '/api/admin/users'],
  ['réglages', '/api/admin/settings'],
  ['tarification', '/api/admin/pricing'],
  ['CRM', '/api/admin/crm/dashboard'],
  ['inventaire', '/api/admin/inventory/stock'],
  ['achats', '/api/admin/purchasing/orders'],
];
const anonymousContext = await browser.newContext();
const anonymousResults = {};
for (const [key, path] of GUARDED) {
  const response = await anonymousContext.request.get(`${base}${path}`);
  anonymousResults[key] = response.status();
}
const anonymousLogin = await anonymousContext.request.post(`${base}/api/admin/auth/login`, {
  data: { email: 'intrus@example.com', password: 'mot-de-passe-invente-1234' },
});
anonymousResults['connexion refusée (mauvais identifiants)'] = anonymousLogin.status();
await anonymousContext.close();

/* Drapeaux du cookie : le cookie porte Path=/api/admin, il faut donc interroger ce chemin-là,
   sinon `context.cookies(base)` ne renvoie rien — c'était le défaut de la version précédente. */
const cookies = await context.cookies(`${base}/api/admin`);
const sessionCookie = cookies.find((cookie) => cookie.name === 'ayrovi_admin_session') || cookies[0] || {};

/* Écriture sans jeton CSRF : doit être refusée (403), pas acceptée puis annulée. */
const csrfProbe = await page.evaluate(async (base) => {
  const response = await fetch(`${base}/api/admin/public-nav`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination: 'arrivals', label_fr: 'x', label_ar: 'x', display_order: 1, active: 0 }),
  });
  return { status: response.status };
}, base);

/* Fuite de secrets : aucune réponse admin ne doit ramener d'empreinte de mot de passe ni de clé. */
const leakPattern = /(password_hash|passwordHash|"password"\s*:|secret|api[_-]?key|bearer\s|BEGIN [A-Z ]*PRIVATE KEY)/i;
const leaked = [];
for (const [key, path] of GUARDED) {
  const response = await page.request.get(`${base}${path}`, { failOnStatusCode: false });
  if (!response.ok()) continue;
  const body = await response.text();
  const match = body.match(leakPattern);
  if (match) leaked.push(`${key} → « ${match[0].slice(0, 40)} »`);
}

/* En-têtes de durcissement et refus de mise en cadre. */
const headResponse = await page.request.get(`${base}/admin`, { failOnStatusCode: false });
const headers = headResponse.headers();
const hardened = {
  observed: {
    xFrameOptions: headers['x-frame-options'] || null,
    frameAncestors: (headers['content-security-policy'] || '').match(/frame-ancestors[^;]*/)?.[0] || null,
    contentSecurityPolicy: headers['content-security-policy'] ? 'présente' : null,
    xContentTypeOptions: headers['x-content-type-options'] || null,
    referrerPolicy: headers['referrer-policy'] || null,
  },
  /**
   * Projection production — DITE COMME TELLE, jamais présentée comme mesurée. La règle de mise en
   * cadre est conditionnée à NODE_ENV=production (l'aperçu de développement est lui-même encadré) :
   * un audit lancé en développement ne peut donc pas l'observer, seulement la déclarer.
   */
  productionProjection: {
    admin: { 'X-Frame-Options': 'DENY', frameAncestors: "frame-ancestors 'none'" },
    public: { 'X-Frame-Options': 'SAMEORIGIN', frameAncestors: "frame-ancestors 'self'" },
    note: 'posés quand NODE_ENV=production ou RENDER — non observables sur une base de développement',
  },
  cookieSecureInProduction: 'Secure ajouté au cookie de session quand NODE_ENV=production',
};

/* Session volée + déconnexion : la session doit être détruite côté serveur, pas seulement effacée
   dans le navigateur. On rejoue le cookie capturé APRÈS le POST /auth/logout. */
const csrfToken = await page.evaluate(() => sessionStorage.getItem('ayrovi_admin_csrf'));
const logoutOk = await page.evaluate(async (base) => {
  const response = await fetch(`${base}/api/admin/auth/logout`, {
    method: 'POST', credentials: 'include', headers: { 'x-csrf-token': sessionStorage.getItem('ayrovi_admin_csrf') || '' },
  });
  return response.status;
}, base);
const stolenContext = await browser.newContext();
await stolenContext.addCookies([{ name: sessionCookie.name, value: sessionCookie.value, domain: '127.0.0.1', path: sessionCookie.path || '/api/admin' }]);
const afterLogout = await stolenContext.request.get(`${base}/api/admin/back-office/navigation`);
const revocation = { logoutStatus: logoutOk, cookieAfterLogout: afterLogout.status() };
await stolenContext.close();

const security = {
  anonymous: anonymousResults,
  writeWithoutCsrf: csrfProbe.status,
  csrfTokenPresent: Boolean(csrfToken),
  revocation,
  leakedSecrets: leaked,
  hardened,
  cookie: { name: sessionCookie.name, httpOnly: sessionCookie.httpOnly, sameSite: sessionCookie.sameSite, secure: sessionCookie.secure, path: sessionCookie.path },
};

/* Écran de connexion sur téléphone : la mise en page change (marque masquée, cartouche conservé).
   On le capture parce que c'est le seul écran que voit un administrateur pressé depuis son mobile. */
const mobileContext = await browser.newContext({ viewport: { width: 420, height: 900 } });
const mobilePage = await mobileContext.newPage();
await mobilePage.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
await mobilePage.waitForTimeout(1200);
await mobilePage.screenshot({ path: `${output}/login-mobile.png` });
loginScreen.mobileScreenshot = `${output}/login-mobile.png`;
loginScreen.mobileBrandHidden = await mobilePage.evaluate(() => getComputedStyle(document.querySelector('.admin-login-brand')).display === 'none');
await mobileContext.close();

await browser.close();

const report = { generatedAt: new Date().toISOString(), loginScreen, security, sections: audit };
fs.writeFileSync(`${output}/audit.json`, JSON.stringify(report, null, 2));

/* ── Rapport lisible ────────────────────────────────────────────────────────────────────────── */
const problems = audit.filter((row) => row.consoleErrors.length || row.httpErrors.length || row.emptyMain || row.stuck || row.deadLinks.length || row.unnamedButtons.length || row.unlabeledInputs || row.imagesWithoutAlt || row.disabledWithoutReason);
const lines = [];
lines.push('# Audit de l’admin — résultats bruts', '');
const totalTests = audit.length;
const clean = problems.length === 0 && audit.every((row) => row.consoleErrors.length === 0 && row.httpErrors.length === 0);
lines.push('## Verdict', '');
lines.push(`- écrans inspectés : **${totalTests}** (tous ceux du plan de navigation servi par le serveur)`);
lines.push(`- écrans sans aucun défaut mesuré : **${totalTests - problems.length} / ${totalTests}** ${clean ? '✅' : '⚠️'}`);
lines.push(`- erreurs JavaScript cumulées : **${audit.reduce((total, row) => total + row.consoleErrors.length, 0)}** · réponses HTTP en échec : **${audit.reduce((total, row) => total + row.httpErrors.length, 0)}**`);
lines.push(`- sondes d’accès sans session : ${Object.values(security.anonymous || {}).every((status) => status === 401 || status === 400) ? 'toutes refusées ✅' : '⚠️ voir la section Sécurité'}`);
lines.push(`- écriture sans jeton CSRF : HTTP ${security.writeWithoutCsrf} · cookie volé après déconnexion : HTTP ${security.revocation?.cookieAfterLogout}`);
lines.push(`- fuite de secrets dans les réponses admin : ${(security.leakedSecrets || []).length === 0 ? 'aucune ✅' : '⚠️ ' + security.leakedSecrets.join(' · ')}`);
lines.push('');
lines.push(`Généré le ${new Date().toISOString()} · ${audit.length} écrans inspectés · base ${base}`, '');
lines.push('## Écran de connexion', '');
lines.push(`- champs : ${loginScreen.fields} (dont ${loginScreen.passwordType} mot de passe) · boutons : ${JSON.stringify(loginScreen.submit)}`);
lines.push(`- autocomplete : ${loginScreen.hasAutocomplete} champ(s) · titre : ${loginScreen.title}`);
lines.push(`- étiquettes : ${JSON.stringify(loginScreen.labels)}`);
lines.push(`- cartouche d’état : ${loginScreen.status} · œil du mot de passe : « ${loginScreen.passwordToggle} »`);
lines.push(`- captures : ${loginScreen.screenshots?.join(', ')} · mobile (marque masquée : ${loginScreen.mobileBrandHidden}) : ${loginScreen.mobileScreenshot}`, '');
lines.push('## Sécurité — sondes en contexte ANONYME (aucun cookie)', '');
const anon = security.anonymous || {};
const anonOk = Object.values(anon).every((status) => status === 401 || status === 400 || status === 403);
for (const [key, status] of Object.entries(anon)) {
  const expected = key.startsWith('connexion') ? 'attendu 401' : 'attendu 401';
  lines.push(`- ${key} : HTTP ${status} (${expected}) ${status === 401 || status === 400 ? '✅' : '⚠️'}`);
}
lines.push('', `**Verdict** : ${anonOk ? 'toutes les surfaces administrateur refusent un visiteur sans session ✅' : 'au moins une surface a répondu à un visiteur sans session ⛔'}`, '');
lines.push(`- jeton CSRF délivré à la connexion : ${security.csrfTokenPresent ? 'oui ✅' : 'non ⛔'}`);
lines.push(`- écriture SANS jeton CSRF : HTTP ${security.writeWithoutCsrf} (attendu 403) ${security.writeWithoutCsrf === 403 ? '✅' : '⛔'}`);
lines.push(`- déconnexion : HTTP ${security.revocation?.logoutStatus} · cookie rejoué après déconnexion : HTTP ${security.revocation?.cookieAfterLogout} (attendu 401) ${security.revocation?.cookieAfterLogout === 401 ? '✅' : '⛔'}`);
lines.push(`- fuite d'empreinte / de clé dans les réponses admin : ${(security.leakedSecrets || []).length ? '⛔ ' + security.leakedSecrets.join(' · ') : 'aucune détectée ✅'}`);
lines.push(`- en-têtes observés : ${JSON.stringify(security.hardened.observed)}`);
lines.push(`- **projection production** (non mesurable ici) : /admin → ${JSON.stringify(security.hardened.productionProjection.admin)} · site public → ${JSON.stringify(security.hardened.productionProjection.public)}`);
lines.push(`- cookie : ${security.hardened.cookieSecureInProduction}`);
lines.push(`- cookie de session : ${JSON.stringify(security.cookie)}`, '');
lines.push('## Écrans', '');
lines.push('| écran | service | lignes | boutons | liens | tableaux | erreurs JS | HTTP | remarques |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const row of audit) {
  const notes = [];
  if (row.emptyMain) notes.push('vide');
  if (row.stuck) notes.push('bloqué sur chargement');
  if (row.deadLinks.length) notes.push(`liens morts ${row.deadLinks.length}`);
  if (row.unnamedButtons.length) notes.push(`boutons sans nom ${row.unnamedButtons.length}`);
  if (row.unlabeledInputs) notes.push(`champs sans étiquette ${row.unlabeledInputs}`);
  if (row.imagesWithoutAlt) notes.push(`images sans alt ${row.imagesWithoutAlt}`);
  if (row.disabledWithoutReason) notes.push(`désactivés sans motif ${row.disabledWithoutReason}`);
  if (row.scrollWidth > row.innerWidth) notes.push(`débordement ${row.scrollWidth}>${row.innerWidth}`);
  lines.push(`| ${row.label} | ${row.service} | ${row.rows} | ${row.buttons} | ${row.links} | ${row.tables} | ${row.consoleErrors.length} | ${row.httpErrors.length} | ${notes.join(' · ') || '—'} |`);
}
lines.push('', `## Détail des écrans à problème (${problems.length})`, '');
for (const row of problems) {
  lines.push(`### ${row.label} — ${row.url}`);
  if (row.consoleErrors.length) lines.push(`- erreurs JS : ${JSON.stringify(row.consoleErrors)}`);
  if (row.httpErrors.length) lines.push(`- HTTP : ${JSON.stringify(row.httpErrors)}`);
  if (row.deadLinks.length) lines.push(`- liens morts : ${JSON.stringify(row.deadLinks)}`);
  if (row.unnamedButtons.length) lines.push(`- boutons sans nom : ${JSON.stringify(row.unnamedButtons)}`);
  if (row.unlabeledInputs) lines.push(`- champs sans étiquette : ${row.unlabeledInputs}`);
  if (row.disabledWithoutReason) lines.push(`- boutons désactivés sans motif : ${row.disabledWithoutReason}`);
  lines.push(`- extrait : « ${row.text} »`, '');
}
fs.writeFileSync(`${output}/RAPPORT.md`, lines.join('\n'));

console.log(`📋 audit : ${audit.length} écrans · ${problems.length} écran(s) à problème`);
console.log(`   erreurs JS cumulées : ${audit.reduce((total, row) => total + row.consoleErrors.length, 0)}`);
console.log(`   réponses HTTP en échec : ${audit.reduce((total, row) => total + row.httpErrors.length, 0)}`);
console.log(`   écrans vides : ${audit.filter((row) => row.emptyMain).length} · bloqués : ${audit.filter((row) => row.stuck).length}`);
console.log(`   sécurité anonyme : ${Object.entries(security.anonymous).map(([k, v]) => `${k}=${v}`).join(' ')}`);
console.log(`   CSRF ${security.writeWithoutCsrf} · révocation ${security.revocation.cookieAfterLogout} · fuites ${security.leakedSecrets.length} · cookie ${security.cookie.name || 'absent'} httpOnly=${security.cookie.httpOnly}`);
console.log(`   rapport : ${output}/RAPPORT.md`);
