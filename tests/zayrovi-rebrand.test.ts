/**
 * ZAYROVI partout (16/10/2026, puis 16/11/2026).
 *
 * Le 16/10 la marque affichée est devenue ZAYROVI. Le 16/11, le nom de domaine
 * proche de l'ancienne marque ayant été réservé par un tiers, TOUT ce qui portait
 * encore l'ancien nom a été renommé : domaine (zayrovi.com), e-mails, identifiant
 * Android/iOS, schéma de lien, routes, en-têtes, cookies, tables, variables
 * d'environnement, fichiers.
 *
 * Ce fichier verrouille :
 *   1. le logo (Z officiel) : un seul tracé, identique sur le site, l'application et
 *      l'écran de chargement statique ;
 *   2. l'ancien nom n'apparaît plus NULLE PART dans le dépôt, hors une liste courte
 *      d'exceptions nommées ici avec leur raison ;
 *   3. l'identité technique : domaine, identifiant Android/iOS, schéma de lien ;
 *   4. la migration one-shot des textes enregistrés (graines d'origine seulement) ;
 *   5. l'APK de démo : le libellé réécrit par la CI suit le nom de l'application.
 *
 * L'ancien nom n'est jamais écrit ici en clair : il vient de `shared/formerBrand.ts`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import { BRAND_SYMBOL } from '../client/src/design/brandSymbol';
import { FORMER_BRAND, FORMER_ENV_PREFIX } from '../shared/formerBrand';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const OLD = FORMER_BRAND.toUpperCase();
const Old = FORMER_BRAND[0].toUpperCase() + FORMER_BRAND.slice(1);

describe('1. Z zébré (v7) : un seul tracé partout', () => {
  test('site, application et écran de chargement statique partagent exactement le même tracé', () => {
    const mobile = read('apps/mobile/src/design/brandSymbol.ts');
    expect(mobile).toContain(JSON.stringify(BRAND_SYMBOL.d));
    expect(mobile).toContain(JSON.stringify(BRAND_SYMBOL.viewBox));
    expect(read('client/index.html')).toContain(`d="${BRAND_SYMBOL.d}"`);
    // tracé normalisé : une hauteur de 1000, un seul chemin fermé par sous-tracé
    expect(BRAND_SYMBOL.height).toBe(1000);
    // le Z est presque carré (≈ 0,96 : 1) — l'ancien cœur-poignée de main faisait 1,19 : 1
    expect(BRAND_SYMBOL.width).toBeGreaterThan(940);
    expect(BRAND_SYMBOL.width).toBeLessThan(980);
    expect(BRAND_SYMBOL.d.startsWith('M')).toBe(true);
  });

  test('l’application dessine le nouveau symbole (BrandMark) et l’anneau de chargement avec les jetons du thème', () => {
    const mark = read('apps/mobile/src/design/BrandMark.tsx');
    expect(mark).toContain('<Path d={shape.d} fill={color} />');
    expect(mark).toContain('? BRAND_SYMBOL_SOLID\n      : BRAND_SYMBOL;');
    expect(mark).toContain('ZAYROVI');
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code(mark)).not.toMatch(/#[0-9a-f]{3,8}\b/i); // aucune couleur en dur : encre du thème
    const loading = read('apps/mobile/src/design/LoadingScreen.tsx');
    for (const token of ['theme.colors.canvas', 'theme.colors.line', 'theme.colors.muted']) expect(loading).toContain(token);
    expect(loading).toContain('strokeLinecap="round"');
    expect(loading).toContain('useReduceMotion');
    expect(code(loading)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe('2. l’ancien nom a disparu du dépôt', () => {
  /**
   * Exceptions — et seulement elles :
   *  • `shared/formerBrand.ts` : étiquettes cryptographiques figées (sinon secrets
   *    TOTP, codes de secours et e-mails chiffrés deviennent illisibles), nom à
   *    migrer dans les bases existantes, préfixe des anciennes variables Render ;
   *  • les noms d'INFRASTRUCTURE qui appartiennent au propriétaire et ne se
   *    renomment pas depuis le code : sous-domaines `onrender.com` des services,
   *    nom du dépôt GitHub et de ses branches ;
   *  • `render.yaml` : nom du service et du disque persistant — les renommer dans
   *    le blueprint créerait un NOUVEAU disque vide (base de données perdue) ;
   *  • le repli `secrets.<ancien>_…` des workflows, tant que les secrets GitHub
   *    n'ont pas été recréés sous le nouveau nom.
   */
  const former = new RegExp(`(?<![zZ])${FORMER_BRAND}`, 'i');
  const infrastructure = new RegExp(`${FORMER_BRAND}[-_]beta1`, 'gi');
  const allowedLine = (rel: string, line: string): boolean => {
    if (rel === 'render.yaml') return line.trim() === `name: ${FORMER_BRAND}` || line.trim() === `name: ${FORMER_BRAND}-data`;
    if (rel.startsWith('.github/workflows/')) return !former.test(line.replace(new RegExp(`secrets\\.${FORMER_ENV_PREFIX}_[A-Z0-9_]+`, 'g'), ''));
    return false;
  };

  test('aucun fichier, aucun chemin ne porte l’ancien nom (hors exceptions)', () => {
    const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT })
      .toString('utf8').split('\0').filter((rel) => rel && fs.existsSync(path.resolve(ROOT, rel)));
    const offenders: string[] = [];
    for (const rel of listed) {
      if (former.test(rel.replace(infrastructure, ''))) offenders.push(`${rel} (chemin)`);
      if (rel === 'shared/formerBrand.ts') continue;
      const raw = fs.readFileSync(path.resolve(ROOT, rel));
      if (raw.subarray(0, 8192).includes(0)) {
        // binaire : polices (table `name` en ASCII ou UTF-16BE), images, archives
        const latin = raw.toString('latin1');
        const utf16 = raw.toString('latin1').replace(/\0/g, '');
        if (former.test(latin.replace(infrastructure, '')) || former.test(utf16.replace(infrastructure, ''))) offenders.push(`${rel} (contenu binaire)`);
        continue;
      }
      raw.toString('utf8').split('\n').forEach((line, index) => {
        if (!former.test(line.replace(infrastructure, ''))) return;
        if (allowedLine(rel, line)) return;
        offenders.push(`${rel}:${index + 1}: ${line.trim().slice(0, 140)}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  test('le nom affiché de l’application, du site et de la coquille Android est ZAYROVI', () => {
    expect(JSON.parse(read('apps/mobile/app.json')).expo.name).toBe('ZAYROVI');
    expect(read('capacitor.config.ts')).toContain("appName: 'ZAYROVI',");
    expect(read('android/app/src/main/res/values/strings.xml')).toContain('<string name="app_name">ZAYROVI</string>');
    expect(JSON.parse(read('client/public/manifest.webmanifest')).name).toMatch(/^ZAYROVI — /);
    expect(read('client/index.html')).toMatch(/<title>ZAYROVI — /);
    expect(read('shared/publicSeo.ts')).toContain("const HOME_TITLE_AR = 'زايروفي — ");
  });
});

describe('3. identité technique ZAYROVI', () => {
  test('domaine zayrovi.com, identifiant app.zayrovi.mobile, schéma zayrovi://', () => {
    const app = JSON.parse(read('apps/mobile/app.json')).expo;
    expect(app.slug).toBe('zayrovi');
    expect(app.android.package).toBe('app.zayrovi.mobile');
    expect(app.ios.bundleIdentifier).toBe('app.zayrovi.mobile');
    expect(app.scheme).toBe('zayrovi');
    const hosts = app.android.intentFilters[0].data.map((d: { host: string }) => d.host);
    expect(hosts).toEqual(expect.arrayContaining(['zayrovi.com', 'www.zayrovi.com']));
    expect(read('capacitor.config.ts')).toContain("appId: 'app.zayrovi.mobile',");
    expect(read('client/index.html')).toContain('<link rel="canonical" href="https://zayrovi.com/" />');
    expect(read('android/app/build.gradle')).toContain('applicationId "app.zayrovi.mobile"');
  });
});

describe('4. migration one-shot des valeurs enregistrées', () => {
  test('les graines d’origine passent à ZAYROVI ; un texte édité reste intact', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zayrovi-rebrand-'));
    const file = path.join(dir, 'db.sqlite');
    try {
      const fresh = new QatafoDatabase(file);
      // base neuve : les graines disent déjà ZAYROVI
      expect(fresh.get<any>("SELECT setting_value AS v FROM settings WHERE setting_key='company_name'").v).toBe('ZAYROVI');
      // on simule une base d'avant le changement de nom…
      fresh.run(`UPDATE settings SET setting_value='${OLD}' WHERE setting_key IN ('company_name','company_legal_name')`);
      fresh.run(`UPDATE settings SET setting_value='Acompte remboursé si ${OLD} ne peut pas valider ou acheter l’article demandé' WHERE setting_key='unavailable_refund_policy'`);
      fresh.run(`UPDATE stories_showcase_settings SET title='Social ${OLD}' WHERE id='global'`);
      fresh.run(`UPDATE lens_hero_settings SET phone_status_label='${OLD} LENS', sections_json=REPLACE(sections_json,'Propulsé par l’IA ZAYROVI','Propulsé par l’IA ${OLD}') WHERE id='global'`);
      fresh.run(`UPDATE story_publishers SET name='${Old}' WHERE id='pub_zayrovi'`);
      fresh.run(`UPDATE erp_organizations SET name='${OLD} SARL', legal_name='${OLD} SARL' WHERE code='ORG-0001'`);
      fresh.run(`UPDATE ai_knowledge SET answer='${OLD} livre dans les 24 gouvernorats. Le délai indicatif configuré est de 5 à 8 jours ouvrés.' WHERE id='ai_delivery'`);
      fresh.run(`UPDATE public_nav_items SET label_ar='مجلة ${OLD}' WHERE destination='news'`);
      fresh.run(`UPDATE erp_sequences SET description='Colis consolidé en entrepôt ${OLD}' WHERE sequence_key='ayweb_package_number'`);
      // … avec un texte déjà personnalisé par l'admin, qui ne doit pas bouger
      fresh.run(`UPDATE ai_knowledge SET answer='Réponse écrite par l’équipe ${OLD}, à garder.' WHERE id='ai_payment'`);
      fresh.run("DELETE FROM applied_data_migrations WHERE key='rebrand_zayrovi_v1'");
      fresh.close?.();

      const migrated = new QatafoDatabase(file);
      const setting = (key: string) => migrated.get<any>('SELECT setting_value AS v FROM settings WHERE setting_key=?', key).v;
      expect(setting('company_name')).toBe('ZAYROVI');
      expect(setting('company_legal_name')).toBe('ZAYROVI');
      expect(setting('unavailable_refund_policy')).toBe('Acompte remboursé si ZAYROVI ne peut pas valider ou acheter l’article demandé');
      expect(migrated.get<any>("SELECT title FROM stories_showcase_settings WHERE id='global'").title).toBe('Social ZAYROVI');
      const lens = migrated.get<any>("SELECT phone_status_label, sections_json FROM lens_hero_settings WHERE id='global'");
      expect(lens.phone_status_label).toBe('ZAYROVI LENS');
      expect(lens.sections_json).toContain('Propulsé par l’IA ZAYROVI');
      expect(lens.sections_json).not.toContain(`IA ${OLD}`);
      expect(migrated.get<any>("SELECT name FROM story_publishers WHERE id='pub_zayrovi'").name).toBe('Zayrovi');
      // texte libre qui n'est PAS une graine : la migration n'y touche pas
      expect(migrated.get<any>("SELECT name FROM erp_organizations WHERE code='ORG-0001'").name).toBe(`${OLD} SARL`);
      expect(migrated.get<any>("SELECT answer FROM ai_knowledge WHERE id='ai_delivery'").answer).toMatch(/^ZAYROVI livre/);
      expect(migrated.get<any>("SELECT label_ar FROM public_nav_items WHERE destination='news'").label_ar).toBe('مجلة ZAYROVI');
      expect(migrated.get<any>("SELECT description FROM erp_sequences WHERE sequence_key='ayweb_package_number'").description).toBe('Colis consolidé en entrepôt ZAYROVI');
      expect(migrated.get<any>("SELECT answer FROM ai_knowledge WHERE id='ai_payment'").answer).toBe(`Réponse écrite par l’équipe ${OLD}, à garder.`);
      expect(migrated.get<any>("SELECT 1 AS ok FROM applied_data_migrations WHERE key='rebrand_zayrovi_v1'")).toBeTruthy();
      migrated.close?.();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('5. APK de démo', () => {
  test('le libellé réécrit par la CI suit le nom de l’application (sinon le build échoue)', () => {
    const name = JSON.parse(read('apps/mobile/app.json')).expo.name;
    const workflow = read('.github/workflows/mobile-android.yml');
    expect(workflow).toContain(`s|<string name="app_name">${name}</string>|<string name="app_name">${name} Démo</string>|`);
    expect(workflow).toContain(`grep -q '<string name="app_name">${name} Démo</string>'`);
    expect(workflow).toContain('APK="$RUNNER_TEMP/ZAYROVI-demo-${SHORT}.apk"');
  });

  // Ouverture blanche + symbole bleu depuis f80504cb (« blue native entrance ») ;
  // même contrat que apps/mobile/tests/brand-colors.test.ts.
  test('écran d’ouverture (logo v7, 14/11) : fond blanc plat #FFFFFF et Z zébré encre, dans les deux thèmes', () => {
    const app = JSON.parse(read('apps/mobile/app.json')).expo;
    const splash = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    expect(splash.backgroundColor).toBe('#FFFFFF');
    expect(splash.dark.backgroundColor).toBe('#FFFFFF');
    expect(app.android.adaptiveIcon.backgroundColor).toBe('#FFFFFF');
  });
});
