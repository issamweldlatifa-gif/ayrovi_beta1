/**
 * AYROVI → ZAYROVI (2026-10-16) — la marque change partout (site, back-office, application,
 * courriels, factures, pages légales, documents), SAUF le serveur et le nom de domaine.
 *
 * Ce fichier verrouille :
 *   1. le nouveau logo (Z officiel) : un seul tracé, identique sur le site, l'application et
 *      l'écran de chargement statique ;
 *   2. aucun « AYROVI » visible ne revient dans les sources produit — les seules occurrences
 *      restantes sont des IDENTIFIANTS, nommés ici avec leur raison ;
 *   3. ce qui ne doit PAS changer : domaine, identifiant Android, schéma de lien ;
 *   4. la migration one-shot des valeurs enregistrées (graines d'origine seulement) ;
 *   5. l'APK de démo : le libellé réécrit par la CI suit le nom de l'application.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import { Z_MARK } from '../client/src/design/zMark';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
function walk(rel: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.resolve(ROOT, rel), { withFileTypes: true })) {
    const child = path.posix.join(rel, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') out.push(...walk(child, pattern)); }
    else if (pattern.test(entry.name)) out.push(child);
  }
  return out;
}

describe('1. le Z officiel : un seul tracé partout', () => {
  test('site, application et écran de chargement statique partagent exactement le même tracé', () => {
    const mobile = read('apps/mobile/src/design/zMark.ts');
    expect(mobile).toContain(`d: '${Z_MARK.d}'`);
    expect(mobile).toContain(`viewBox: '${Z_MARK.viewBox}'`);
    expect(read('client/index.html')).toContain(`d="${Z_MARK.d}"`);
    // tracé normalisé : une hauteur de 1000, un seul chemin fermé par sous-tracé
    expect(Z_MARK.height).toBe(1000);
    expect(Z_MARK.width).toBeGreaterThan(1600);
    expect(Z_MARK.d.startsWith('M ')).toBe(true);
  });

  test('l’application dessine le Z (BrandMark) et l’anneau de chargement avec les jetons du thème', () => {
    const mark = read('apps/mobile/src/design/BrandMark.tsx');
    expect(mark).toContain('<Path d={Z_MARK.d} fill={color} />');
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

describe('2. plus aucun « AYROVI » visible dans les sources produit', () => {
  /** Les seules occurrences autorisées : des identifiants, jamais du texte affiché. */
  const ALLOWED: Array<[RegExp, string]> = [
    [/'AYROVI'(?=,'INFORMATION'|,\s*'INFORMATION')/, 'valeur d’énumération de la catégorie de news (CHECK en base)'],
    [/category(?:: | TEXT NOT NULL DEFAULT )'AYROVI'/, 'catégorie de news par défaut (valeur stockée)'],
    [/value: 'AYROVI'/, 'valeur de la catégorie de news (libellé affiché : ZAYROVI)'],
    [/^\s*'AYROVI',$/, 'liste des codes de catégorie de news (application)'],
    [/news\.category\.AYROVI/, 'clé de traduction de la catégorie de news'],
    [/(?:^|[\s{,])AYROVI: '/, 'clé d’un dictionnaire indexé par la catégorie de news'],
    [/=== 'AYROVI'|!== 'AYROVI'/, 'comparaison avec le code de catégorie de news'],
    [/: 'AYROVI';$/, 'catégorie de news par défaut (service magazine)'],
    [/\|\| 'AYROVI', 80\) \|\| 'AYROVI'|allowed\.includes\(category\) \? category : 'AYROVI'/, 'catégorie de news par défaut (service magazine)'],
    [/^\s*'AYROVI', cleanText\(input\.adminId/, 'catégorie de news d’un brouillon (service magazine)'],
    [/: 'AYROVI',$/, 'catégorie de news par défaut (API admin)'],
    [/Client AYROVI/, 'nom provisoire des comptes clients, stocké et comparé tel quel'],
    [/lastName: names\.join\(' '\) \|\| 'AYROVI'/, 'nom transmis au marchand pour l’expédition vers l’entrepôt (logistique)'],
    [/AYROVI-WH-TN/, 'code d’emplacement de l’entrepôt'],
    [/\['AYROVI', '1'\]/, 'marqueur de format du QR des factures déjà imprimées'],
    [/AYROVI → ZAYROVI|catégorie de news `AYROVI`/, 'commentaire qui documente la migration de données'],
    [/'AYROVI', 'ZAYROVI'\]|'(?:مجلة|Identité|Colis consolidé en entrepôt) [^']*AYROVI[^']*', '/, 'anciennes valeurs recherchées par la migration (miroir employé, séquences, barre publique)'],
    [/setting_value='AYROVI'|name='AYROVI Admin'|'AYROVI LENS'|AYROVI Admin'|'Équipe AYROVI'|AYROVI est ouvert|AYROVI centralise|tendance AYROVI|Social AYROVI|'Ayrovi', 'Zayrovi'|AYROVI en mouvement|équipe AYROVI a sélectionné|AYROVI livre dans|gérés par AYROVI|IA AYROVI|"AYROVI LENS"|'AYROVI', 'ZAYROVI'|si AYROVI ne peut/, 'anciennes valeurs recherchées par les migrations de données'],
  ];
  const files = [
    ...walk('client/src', /\.(tsx?|css|json)$/),
    ...walk('src', /\.(ts|tsx)$/),
    ...walk('shared', /\.ts$/),
    ...walk('apps/mobile/src', /\.(tsx?|json)$/),
    ...walk('apps/mobile/app', /\.tsx?$/),
    ...walk('client/public', /\.(html|webmanifest|txt)$/),
    'client/index.html', 'apps/mobile/app.json', 'capacitor.config.ts',
    ...walk('android/app/src/main/res', /^strings\.xml$/),
  ];

  test('chaque occurrence restante est un identifiant nommé ici', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      read(rel).split('\n').forEach((line, index) => {
        if (!/(?<![A-Za-z0-9_.\/-])(?:AYROVI|Ayrovi)(?![A-Za-z0-9_]|\$\{)|أيروفي/.test(line)) return;
        if (ALLOWED.some(([pattern]) => pattern.test(line))) return;
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

describe('3. ce qui ne change pas tant que le domaine n’est pas acheté', () => {
  test('domaine, identifiant Android et schéma de lien restent ceux d’AYROVI', () => {
    const app = JSON.parse(read('apps/mobile/app.json')).expo;
    expect(app.android.package).toBe('app.ayrovi.mobile');
    expect(app.ios.bundleIdentifier).toBe('app.ayrovi.mobile');
    expect(app.scheme).toBe('ayrovi');
    expect(app.android.intentFilters[0].data.map((d: { host: string }) => d.host)).toContain('ayrovi.tn');
    expect(read('capacitor.config.ts')).toContain("appId: 'app.ayrovi.mobile',");
    expect(read('client/index.html')).toContain('<link rel="canonical" href="https://ayrovi.tn/" />');
  });
});

describe('4. migration one-shot des valeurs enregistrées', () => {
  test('les graines d’origine passent à ZAYROVI ; un texte édité et les identifiants restent intacts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zayrovi-rebrand-'));
    const file = path.join(dir, 'db.sqlite');
    try {
      const fresh = new QatafoDatabase(file);
      // base neuve : les graines disent déjà ZAYROVI
      expect(fresh.get<any>("SELECT setting_value AS v FROM settings WHERE setting_key='company_name'").v).toBe('ZAYROVI');
      // on simule une base d'avant le changement de nom…
      fresh.run("UPDATE settings SET setting_value='AYROVI' WHERE setting_key IN ('company_name','company_legal_name')");
      fresh.run("UPDATE settings SET setting_value='Acompte remboursé si AYROVI ne peut pas valider ou acheter l’article demandé' WHERE setting_key='unavailable_refund_policy'");
      fresh.run("UPDATE stories_showcase_settings SET title='Social AYROVI' WHERE id='global'");
      fresh.run("UPDATE lens_hero_settings SET phone_status_label='AYROVI LENS', sections_json=REPLACE(sections_json,'Propulsé par l’IA ZAYROVI','Propulsé par l’IA AYROVI') WHERE id='global'");
      fresh.run("UPDATE story_publishers SET name='Ayrovi' WHERE id='pub_ayrovi'");
      fresh.run("UPDATE erp_organizations SET name='AYROVI', legal_name='AYROVI' WHERE code='ORG-0001'");
      fresh.run("UPDATE ai_knowledge SET answer='AYROVI livre dans les 24 gouvernorats. Le délai indicatif configuré est de 5 à 8 jours ouvrés.' WHERE id='ai_delivery'");
      fresh.run("UPDATE public_nav_items SET label_ar='مجلة AYROVI' WHERE destination='news'");
      fresh.run("UPDATE erp_sequences SET description='Colis consolidé en entrepôt AYROVI' WHERE sequence_key='ayweb_package_number'");
      // … avec un texte déjà personnalisé par l'admin, qui ne doit pas bouger
      fresh.run("UPDATE ai_knowledge SET answer='Réponse écrite par l’équipe AYROVI, à garder.' WHERE id='ai_payment'");
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
      expect(lens.sections_json).not.toContain('IA AYROVI');
      expect(migrated.get<any>("SELECT name FROM story_publishers WHERE id='pub_ayrovi'").name).toBe('Zayrovi');
      expect(migrated.get<any>("SELECT name, legal_name FROM erp_organizations WHERE code='ORG-0001'")).toEqual({ name: 'ZAYROVI', legal_name: 'ZAYROVI' });
      expect(migrated.get<any>("SELECT answer FROM ai_knowledge WHERE id='ai_delivery'").answer).toMatch(/^ZAYROVI livre/);
      expect(migrated.get<any>("SELECT label_ar FROM public_nav_items WHERE destination='news'").label_ar).toBe('مجلة ZAYROVI');
      expect(migrated.get<any>("SELECT description FROM erp_sequences WHERE sequence_key='ayweb_package_number'").description).toBe('Colis consolidé en entrepôt ZAYROVI');
      expect(migrated.get<any>("SELECT answer FROM ai_knowledge WHERE id='ai_payment'").answer).toBe('Réponse écrite par l’équipe AYROVI, à garder.');
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

  test('écran d’ouverture : fond noir #0A0A0A et Z blanc, dans les deux thèmes', () => {
    const app = JSON.parse(read('apps/mobile/app.json')).expo;
    const splash = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    expect(splash.backgroundColor).toBe('#0A0A0A');
    expect(splash.dark.backgroundColor).toBe('#0A0A0A');
    expect(app.android.adaptiveIcon.backgroundColor).toBe('#0A0A0A');
  });
});
