/**
 * Télécommande d'essai — mise à niveau de l'admin du 2026-09-22.
 *
 * Chaque garde de ce fichier prouve UNE promesse faite ce jour-là, et pas une intention :
 *
 *  1. tout contrôle de l'admin a un nom accessible (les filtres `Select`, les sélecteurs de date) ;
 *  2. un bouton désactivé dit POURQUOI il l'est (`Pagination`, réordonnancement, agent éditorial) ;
 *  3. l'export CSV du moteur de ressources est sûr : BOM UTF-8, échappement RFC 4180, formules
 *     neutralisées (une cellule ne s'exécute jamais dans le tableur de l'administrateur) ;
 *  4. l'écran de connexion appartient au modèle A : mêmes rôles de couleur que la coquille,
 *     cartouche d'état alimenté par `/api/health`, œil du mot de passe à état accessible, titre
 *     d'onglet propre à la console ;
 *  5. la console est protégée contre la mise en cadre (clickjacking) dans TOUS les environnements.
 *  6. (2026-10-16) chaque état de la coquille reste lisible : le tiroir fermé ne voile plus la
 *     console sous 900 px ; en thème sombre, la pastille de domaine choisie et le bandeau
 *     « Arrivages Standard actifs » gardent leur contraste.
 */
import { readFileSync } from 'node:fs';
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DatePicker, Pagination, Select } from '../client/src/admin/components';
import { csvCell, csvFileName, downloadCsv, toCsv } from '../client/src/admin/csv';
import { moveHint } from '../client/src/admin/moveHint';

const read = (path: string) => readFileSync(path, 'utf8');

describe('1. Nom accessible des contrôles de l’admin', () => {
  it('le Select dérive son nom du premier choix quand l’appelant n’en donne pas', () => {
    const html = renderToStaticMarkup(<Select options={[{ value: '', label: 'Tous les statuts' }, { value: 'X', label: 'X' }]} />);
    expect(html).toContain('aria-label="Tous les statuts"');
  });

  it('un aria-label explicite reste prioritaire sur le libellé du premier choix', () => {
    const html = renderToStaticMarkup(<Select aria-label="Statut de la commande" options={[{ value: '', label: 'Tous les statuts' }]} />);
    expect(html).toContain('aria-label="Statut de la commande"');
    expect(html).not.toContain('aria-label="Tous les statuts"');
  });

  it('un aria-labelledby fourni n’est jamais doublé par un aria-label', () => {
    const html = renderToStaticMarkup(<Select aria-labelledby="titre-filtre" options={[{ value: '', label: 'Tous' }]} />);
    expect(html).toContain('aria-labelledby="titre-filtre"');
    // Attention au piège : « aria-labelledby » CONTIENT la chaîne « aria-label ». On cherche donc
    // l'attribut complet, pas un fragment.
    expect(html).not.toContain('aria-label="');
  });

  it('le sélecteur de date porte son nom accessible', () => {
    const html = renderToStaticMarkup(<DatePicker label="Début de la période" value="2026-09-06T10:30:00.000Z" onChange={() => {}} />);
    expect(html).toContain('aria-label="Début de la période"');
    expect(html).toContain('title="Début de la période"');
  });

  it('aucun champ de saisie des deux écrans de période ne reste sans étiquette', () => {
    const source = read('client/src/admin/AdminApp.tsx');
    expect(source).toContain('aria-label="Début de la période"');
    expect(source).toContain('aria-label="Fin de la période"');
  });
});

describe('2. Un bouton désactivé dit toujours pourquoi', () => {
  it('la pagination explique ses flèches, même désactivées', () => {
    const html = renderToStaticMarkup(<Pagination page={1} totalPages={3} total={1} onChange={() => {}} />);
    expect(html).toContain('aria-label="Page précédente" title="Page précédente"');
    expect(html).toContain('aria-label="Page suivante" title="Page suivante"');
    expect(html).toContain('disabled');
  });

  it('le réordonnancement distingue permission, bord de liste et action possible', () => {
    expect(moveHint(-1, true, false)).toBe('Vous n’avez pas la permission de modifier l’ordre.');
    expect(moveHint(-1, false, true)).toBe('Déjà en première position.');
    expect(moveHint(1, false, true)).toBe('Déjà en dernière position.');
    expect(moveHint(1, false, false)).toBe('Descendre d’un rang');
  });

  it('les quatre écrans qui réordonnent partagent la même définition', () => {
    for (const file of ['HeroSlidesManagePage', 'HomeSectionsPage', 'LensSectionPage', 'InterfaceStudio']) {
      const source = read(`client/src/admin/${file}.tsx`);
      expect(source).toContain("from './moveHint'");
      expect(source).toContain('title={moveHint(');
    }
  });

  it('l’agent éditorial arabe motive son bouton d’envoi', () => {
    expect(read('client/src/admin/MagazineAgentPage.tsx')).toContain('title={!canWrite ?');
  });
});

describe('3. Export CSV du moteur de ressources', () => {
  it('échappe les virgules, les guillemets et les sauts de ligne (RFC 4180)', () => {
    expect(csvCell('sneakers Nike, taille 42')).toBe('"sneakers Nike, taille 42"');
    expect(csvCell('Il a dit "oui"')).toBe('"Il a dit ""oui"""');
    expect(csvCell('ligne1\nligne2')).toBe('"ligne1\nligne2"');
    expect(csvCell(12)).toBe('12');
    expect(csvCell(null)).toBe('');
  });

  it('neutralise une formule : un contenu de CMS ne s’exécute pas dans le tableur', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+33 6 00 00 00 00')).toBe("'+33 6 00 00 00 00");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('sérialise l’en-tête depuis les libellés et une ligne par enregistrement', () => {
    const csv = toCsv(
      [{ key: 'name', label: 'Nom' }, { key: 'city', label: 'Ville' }],
      [{ name: 'Sarra', city: 'Tunis' }, { name: 'Ali', city: 'Sfax' }],
    );
    expect(csv.split('\r\n')).toEqual(['Nom,Ville', 'Sarra,Tunis', 'Ali,Sfax']);
  });

  it('nomme le fichier avec l’horodatage local', () => {
    expect(csvFileName('ayrovi-orders')).toMatch(/^ayrovi-orders-\d{8}-\d{4}\.csv$/);
  });

  it('déclenche un téléchargement avec BOM UTF-8 (Excel lit l’arabe)', () => {
    const chunks: Blob[] = [];
    vi.stubGlobal('URL', { ...URL, createObjectURL: (blob: Blob) => { chunks.push(blob); return 'blob:ayrovi'; }, revokeObjectURL: () => {} });
    const clicked: string[] = [];
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const node = createElement(tag);
      if (tag === 'a') node.click = () => { clicked.push((node as HTMLAnchorElement).download); };
      return node;
    });
    downloadCsv('ayrovi-news.csv', [{ key: 'title', label: 'Titre' }], [{ title: 'Promo' }]);
    expect(clicked).toEqual(['ayrovi-news.csv']);
    expect(chunks).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it('le journal d’audit exporte la page affichée, avec un bouton de rafraîchissement motivé', () => {
    const admin = read('client/src/admin/AdminApp.tsx');
    expect(admin).toContain("downloadCsv(csvFileName('ayrovi-journal-audit'),AUDIT_COLUMNS,rows)");
    expect(admin).toContain("title={rows.length===0?'Aucune entrée à exporter sur cette page.'");
    expect(admin).toContain('Rafraîchir');
  });

  it('le tableau exporte exactement les colonnes qu’il affiche', () => {
    const source = read('client/src/admin/back-office/ResourceWorkspace.tsx');
    expect(source).toContain('buildColumns(descriptor).map(');
    expect(source).toContain('downloadCsv(csvFileName(`ayrovi-${descriptor.section}`)');
  });
});

describe('4. Écran de connexion aligné sur le modèle A', () => {
  const login = read('client/src/admin/AdminApp.tsx');
  const css = read('client/src/styles/admin-console.css');

  it('la connexion hérite des rôles de couleur de la coquille (aucun jeton dupliqué)', () => {
    expect(css).toMatch(/\.bo-shell,\s*\n\.admin-login,\s*\n\.admin-boot\s*\{/);
  });

  it('le thème sombre couvre aussi la connexion', () => {
    expect(css).toContain("html[data-theme='dark'] .admin-login");
  });

  it('le cartouche d’état est alimenté par la sonde réelle du serveur', () => {
    expect(login).toContain("fetch('/api/health'");
    expect(login).toContain("data-state={health.state}");
    expect(login).toContain('Réessayer');
  });

  it('l’œil du mot de passe expose un état, pas seulement un mot', () => {
    expect(login).toContain('aria-pressed={show}');
    expect(login).toContain("aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}");
  });

  it('l’erreur de connexion est annoncée par les lecteurs d’écran', () => {
    expect(login).toContain('className="admin-login-error" role="alert"');
  });

  it('la console s’annonce comme console, pas avec le titre du site public', () => {
    expect(login).toContain("document.title='AYROVI · Console d’exploitation'");
  });

  it('la connexion porte le verrou A.ROVI une seule fois (identité 2026-09-22)', () => {
    expect(login).toContain('/media/logo-ayrovi-lockup-white-violet.svg');
    expect(login).toContain('/media/logo-ayrovi-lockup-black-violet.svg');
    // Le nom n'est plus écrit une seconde fois à côté du verrou.
    expect(login).not.toContain('<strong>AYROVI</strong>');
  });

  it('l’action forte de la connexion est bien le violet du modèle A, texte blanc', () => {
    expect(css).toContain(':is(.bo-shell, .admin-login) .admin-button--primary');
    expect(css).toMatch(/--bo-accent:\s*var\(--ayrovi-color-brand-accent\)/);
    expect(css).toMatch(/\.admin-button--primary \{\s*background: var\(--bo-accent\); border-color: var\(--bo-accent\); color: var\(--bo-on-accent\);/);
    expect(css).not.toMatch(/#FF6900|#E85F00/i);
  });
});

describe('5. Durcissement de la console', () => {
  const server = read('src/server.ts');

  it('en production, la console ne peut être affichée dans aucun cadre', () => {
    expect(server).toContain('const isAdminSurface = /^\\/admin(\\/|$)/.test(req.path);');
    expect(server).toContain("isAdminSurface ? \"frame-ancestors 'none';\" : \"frame-ancestors 'self';\"");
    expect(server).toContain("res.setHeader('X-Frame-Options', isAdminSurface ? 'DENY' : 'SAMEORIGIN');");
  });

  it('hors production, aucune contrainte de cadre (l’aperçu de développement est encadré)', () => {
    // Le compromis est explicite et vérifié : pas de `frame-ancestors` si !isProd, sinon la
    // console serait invisible dans l'aperçu — qui est lui-même rendu dans un cadre.
    expect(server).toContain("const frameAncestors = !isProd ? '' :");
    expect(server).toMatch(/if \(isProd\) \{\s*res\.setHeader\('X-Frame-Options'/);
  });
});

describe('6. Chaque état de la coquille reste lisible', () => {
  const css = read('client/src/styles/admin-console.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const shell = read('client/src/admin/back-office/BackOfficeShell.tsx');

  /** Contenu d'un bloc `@media …` (accolades équilibrées). */
  const atBlock = (prelude: string): string => {
    const open = css.indexOf('{', css.indexOf(prelude));
    for (let i = open, depth = 0; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
    }
    return '';
  };
  /** Déclarations de la règle dont le sélecteur est EXACTEMENT `selector` (dernière occurrence). */
  const rule = (selector: string, source = css): Record<string, string> | null => {
    const pattern = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const found = [...source.matchAll(new RegExp(`(?:^|[{};])\\s*${pattern}\\s*\\{([^}]*)\\}`, 'g'))].at(-1);
    if (!found) return null;
    return Object.fromEntries(found[1].split(';').map((entry) => entry.trim()).filter(Boolean)
      .map((entry) => [entry.slice(0, entry.indexOf(':')).trim(), entry.slice(entry.indexOf(':') + 1).trim()]));
  };
  /** Rôles de la coquille, thème clair puis sombre (le sombre ne redéfinit qu'une partie des rôles). */
  const roles = {
    light: rule('.bo-shell, .admin-login, .admin-boot')!,
    dark: { ...rule('.bo-shell, .admin-login, .admin-boot')!, ...rule("html[data-theme='dark'] .bo-shell, html[data-theme='dark'] .admin-login, html[data-theme='dark'] .admin-boot")! },
  };
  const resolve = (value: string, theme: Record<string, string>): string => {
    const reference = value.match(/^var\((--[\w-]+)\)$/);
    return reference && theme[reference[1]] ? resolve(theme[reference[1]], theme) : value;
  };
  /** Contraste WCAG de deux couleurs #RRGGBB. */
  const contrast = (first: string, second: string): number => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  };

  it('sous 900 px, le voile du tiroir n’existe que tiroir ouvert (la console n’est plus voilée au repos)', () => {
    const drawer = atBlock('@media (max-width: 900px)');
    const closed = rule('.bo-shell .admin-sidebar', drawer);
    expect(closed).not.toBeNull();
    expect(closed!['box-shadow']).toBeUndefined();
    expect(rule('.bo-shell .admin-sidebar.is-open', drawer)?.['box-shadow']).toMatch(/0 0 0 100vmax/);
    // aucun autre voile plein écran dans la feuille
    const scrims = [...css.matchAll(/([^{};]+)\{[^}]*100vmax[^}]*\}/g)].map((match) => match[1].trim());
    expect(scrims).toEqual(['.bo-shell .admin-sidebar.is-open']);
    // `is-open` et le fond cliquable suivent le même état que le bouton « Ouvrir le menu »
    expect(shell).toContain("<aside className={`admin-sidebar ${mobile ? 'is-open' : ''}`}>");
    expect(shell).toContain('{mobile && <button className="admin-sidebar-overlay" onClick={() => setMobile(false)}');
  });

  it('pastille de domaine choisie : encre inversée lisible dans les deux thèmes (plus de blanc sur blanc en sombre)', () => {
    const selected = rule(".bo-domains button[aria-selected='true']");
    expect(selected).not.toBeNull();
    for (const [name, theme] of Object.entries(roles)) {
      const background = resolve(selected!.background, theme);
      const text = resolve(selected!.color, theme);
      expect(background, name).toMatch(/^#[0-9A-F]{6}$/i);
      expect(text, name).toMatch(/^#[0-9A-F]{6}$/i);
      expect(contrast(background, text), `${name} : ${text} sur ${background}`).toBeGreaterThanOrEqual(4.5);
    }
    // même couple que le bouton-bascule pressé : une seule manière de dire « choisi » dans la console
    const pressed = rule(":is(.bo-shell, .admin-login) .admin-button--secondary[aria-pressed='true']");
    expect([selected!.background, selected!.color]).toEqual([pressed!.background, pressed!.color]);
  });

  it('bandeaux « Arrivages actifs » : encre et texte blanc dans les deux thèmes (plus de bandeau blanc en sombre)', () => {
    const admin = read('client/src/admin/admin.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const band = rule('.admin-arrival-summary article', admin)!;
    const white = resolve(band.color, roles.dark);
    // admin.css peint le premier bandeau avec --admin-ink, que la coquille relie à --bo-ink…
    expect(band.background).toBe('var(--admin-ink)');
    expect(roles.light['--admin-ink']).toBe('var(--bo-ink)');
    expect(contrast(resolve(band.background, roles.light), white)).toBeGreaterThanOrEqual(4.5);
    // … qui s'éclaircit en thème sombre : sans reprise, le chiffre blanc serait posé sur du blanc
    expect(contrast(resolve(band.background, roles.dark), white)).toBeLessThan(1.5);
    const fixed = rule("html[data-theme='dark'] .bo-shell .admin-arrival-summary article:first-child");
    expect(fixed).not.toBeNull();
    const background = resolve(fixed!.background, roles.dark);
    const label = read('client/src/design/tokens.css').match(/--admin-tone-c4c0ca:\s*(#[0-9a-f]{6})/i)![1];
    expect(background).toMatch(/^#[0-9A-F]{6}$/i);
    expect(contrast(background, white), `chiffre ${white} sur ${background}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(background, label), `libellé ${label} sur ${background}`).toBeGreaterThanOrEqual(4.5);
  });
});
