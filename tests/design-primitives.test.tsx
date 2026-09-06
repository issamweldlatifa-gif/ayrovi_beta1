/**
 * P3/T2 — la couche des primitives du back office (client/src/design/admin/).
 *
 * Le plan demandait que `client/src/design/` cesse d'être un coin de deux composants et que le
 * moteur, qui définissait ses propres primitives dans `client/src/admin/components.tsx`, les
 * réexporte depuis cette couche sans que les appels des écrans bougent. Ces gardes vérifient les
 * quatre propriétés qui rendent l'opération réversible et non décorative :
 *
 *  1. une primitive = une définition, et elle est dans la couche primitives ;
 *  2. la façade `admin/components.tsx` ne définit rien, elle réexporte exactement les fichiers ;
 *  3. le markup rendu est celui d'avant le déplacement (contrats exacts + égalité avec la forme
 *     manuscrite qui a été remplacée dans les écrans) ;
 *  4. aucun écran ne redessine un motif devenu primitive, et aucune couleur n'est écrite à la main.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Badge, Button, CardTitle, ConfirmDialog, DataTable, DatePicker, EmptyState, Field, Filters, Form, ImageUploader,
  MetricStrip, Modal, PageHeader, Pagination, Search, Select, StatusBadge, Switch, TableCell, Toast, Toggle,
} from '../client/src/admin/components';

const DESIGN = 'client/src/design/admin';
const FAÇADE = 'client/src/admin/components.tsx';
const PRIMITIVES = [
  'Badge', 'Button', 'CardTitle', 'ConfirmDialog', 'DataTable', 'DatePicker', 'EmptyState', 'Field', 'Filters',
  'Form', 'ImageUploader', 'MetricStrip', 'Modal', 'PageHeader', 'Pagination', 'Search', 'Select', 'StatusBadge',
  'Switch', 'TableCell', 'Toast', 'Toggle',
];

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (
  entry.isDirectory() ? walk(`${dir}/${entry.name}`) : /\.(tsx|ts)$/.test(entry.name) ? [`${dir}/${entry.name}`] : []
));
const adminScreens = walk('client/src/admin').filter((file) => !file.endsWith('components.tsx'));

/** ordre des attributs ignoré : React pose des propriétés, l'ordre d'écriture n'est pas un rendu */
const normalize = (markup: string) => markup.replace(/<([a-zA-Z][\w-]*)((?:"[^"]*"|[^">])*)>/g, (all, tag, rest) => (
  `<${tag} ${rest.trim().split(/\s+/).sort().join(' ')}>`
)).replace(/\s+/g, ' ');

describe('couche des primitives — une implémentation par concept', () => {
  it('garde chaque primitive définie une seule fois, dans client/src/design/admin', () => {
    // `Button` est le seul nom porté par deux couches distinctes : son inventaire est fait par le
    // test suivant, qui refuse un troisième porteur.
    for (const name of PRIMITIVES.filter((n) => n !== 'Button')) {
      const definedIn = walk('client/src').filter((file) => new RegExp(`export (?:const|function|interface|type) ${name}\\b`).test(readFileSync(file, 'utf8')));
      // une seule collision assumée : `QatafoIcons` exporte 95 icônes et l'une d'elles s'appelle
      // `Search`. La primitive ne renomme rien, elle importe l'icône sous alias — c'est vérifié ici.
      const allowed = name === 'Search' ? ['components/QatafoIcons.tsx', 'design/admin/Search.tsx'] : [`design/admin/${name}.tsx`];
      expect(definedIn.map((file) => file.replace('client/src/', '')).sort(), name).toEqual(allowed);
      if (name === 'Search') expect(readFileSync(`${DESIGN}/Search.tsx`, 'utf8')).toContain('import { Search as SearchIcon');
    }
  });

  it('n’admet qu’un seul doublon assumé : le Button public et le Button admin, un par couche', () => {
    // D-02 borne P3 à /admin : le bouton du storefront (Tailwind, classes ay-runtime-button--) et
    // le bouton admin (classes admin-button--) sont deux rendus distincts. Ce qui est interdit,
    // c'est un troisième. Le nombre de porteurs de chaque nom est donc mesuré, pas espéré.
    const buttons = walk('client/src').filter((file) => /export const Button\b/.test(readFileSync(file, 'utf8')));
    expect(buttons.map((f) => f.replace('client/src/', '')).sort()).toEqual(['design/Button.tsx', 'design/admin/Button.tsx']);
    const publicConsumers = walk('client/src').filter((file) => /from '.*design\/Button'/.test(readFileSync(file, 'utf8')));
    const adminConsumers = walk('client/src/admin').filter((file) => /\bButton[,\s]/.test(readFileSync(file, 'utf8')) && /from '[.\/]*components'/.test(readFileSync(file, 'utf8')));
    expect(publicConsumers.length).toBeGreaterThanOrEqual(2);
    expect(adminConsumers.length).toBeGreaterThanOrEqual(10);
  });

  it('laisse la façade sans aucune définition, en miroir exact des fichiers', () => {
    const façade = readFileSync(FAÇADE, 'utf8');
    expect(façade).not.toMatch(/export (?:const|function|interface|type|default) /);
    expect(façade).not.toMatch(/import /);
    const reexported = [...façade.matchAll(/export \* from '\.\.\/design\/admin\/([A-Za-z]+)';/g)].map((m) => m[1]).sort();
    const files = readdirSync(DESIGN).filter((f) => f.endsWith('.tsx')).map((f) => f.replace(/\.tsx$/, '')).sort();
    expect(reexported).toEqual(files);
    expect(reexported.length).toBeGreaterThanOrEqual(PRIMITIVES.length);
  });

  it('refuse que le moteur redéfinisse une primitive que la couche expose déjà', () => {
    // « pas de deuxième DataTable / formulaire / permission » : la règle se lit maintenant dans
    // les sources du moteur, pas seulement dans les noms — aucun composant du back office ne peut
    // redevenir une copie locale d'un concept de la couche primitives.
    for (const name of PRIMITIVES) {
      const redefined = adminScreens.filter((file) => new RegExp(`const ${name}\\s*:\\s*React\\.FC|function ${name}\\b`).test(readFileSync(file, 'utf8')));
      expect(redefined.map((file) => file.split('/').pop()), name).toEqual([]);
    }
  });

  it('impose aux écrans de passer par la façade', () => {
    const bypassing = adminScreens.filter((file) => /from '.*design\/admin\//.test(readFileSync(file, 'utf8')));
    expect(bypassing).toEqual([]);
  });

  it('n écrit aucune couleur à la main dans la couche primitives', () => {
    const offenders: string[] = [];
    for (const file of walk(DESIGN)) {
      const source = readFileSync(file, 'utf8');
      if (/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|(?:rgba?|hsla?)\(/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('exige que toute classe rendue par une primitive soit habillée par admin.css', () => {
    // Le style des primitives vit dans la couche d'application unique (P3/T1-d) : une classe rendue
    // sans règle est un état non designé. Les deux exceptions sont listées avec leur motif — elles
    // datent d'avant P3 et relèvent de T5 (états vides et structures de chargement).
    const UNSTYLED_ALLOWED = ['admin-empty', 'admin-image-uploader'];
    const css = readFileSync('client/src/admin/admin.css', 'utf8');
    const used = new Set<string>();
    for (const file of walk(DESIGN)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/className="([^"]*)"|className=\{`([a-z0-9-]+)/g)) {
        for (const token of (match[1] ?? match[2] ?? '').split(' ')) {
          if (/^[a-z][a-z0-9-]*$/.test(token)) used.add(token);
        }
      }
    }
    const unstyled = [...used].filter((token) => token.startsWith('admin-') && !css.includes(`.${token}`)).sort();
    expect(unstyled).toEqual(UNSTYLED_ALLOWED.sort());
  });
});

describe('markup des primitives — figé par contrat', () => {
  const CONTRACTS: Array<[string, React.ReactElement, string]> = [
    ['Badge neutre', <Badge>Neutre</Badge>, '<span class="admin-badge ">Neutre</span>'],
    ['Badge succès', <Badge tone="success">OK</Badge>, '<span class="admin-badge is-success">OK</span>'],
    ['Button par défaut', <Button>Enregistrer</Button>, '<button class="admin-button admin-button--primary ">Enregistrer</button>'],
    ['CardTitle', <CardTitle title="Titre" subtitle="Sous-titre" />, '<header class="admin-card-title"><div><h3>Titre</h3><p>Sous-titre</p></div></header>'],
    ['EmptyState', <EmptyState title="Rien" description="creer" action={<b>+</b>} />, '<div class="admin-empty"><div><svg'],
    ['Field complet', <Field label="Nom" required hint="3 min." error="Trop court" full><input /></Field>,
      '<label class="admin-field admin-field--full"><span>Nom<em>*</em></span><input/><small>3 min.</small><small class="admin-field-error">Trop court</small></label>'],
    ['Filters', <Filters><span>f</span></Filters>, '<div class="admin-filters"><span>f</span></div>'],
    ['Form', <Form onSubmit={() => {}} className="x"><span /></Form>, '<form class="admin-form x"><span></span></form>'],
    ['PageHeader avec eyebrow de domaine', <PageHeader title="Stock" description="mouvements" eyebrow="AYROVI STOCK" />,
      '<div class="admin-page-header"><div><span class="admin-eyebrow">AYROVI STOCK</span><h1>Stock</h1><p>mouvements</p></div></div>'],
    ['Pagination à la première page', <Pagination page={1} totalPages={3} total={1} onChange={() => {}} />,
      '<div class="admin-pagination"><span>1 résultat</span><div><button type="button" disabled="" aria-label="Page précédente">'],
    ['Search vide', <Search value="" onChange={() => {}} />, '<label class="admin-search"><svg'],
    ['Select', <Select options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />,
      '<div class="admin-select"><select><option value="a">A</option><option value="b">B</option></select><svg'],
    ['StatusBadge connu', <StatusBadge status="OUT_OF_STOCK" />, '<span class="status-badge status-badge--danger">Épuisé</span>'],
    ['StatusBadge inconnu', <StatusBadge status="weird" />, '<span class="status-badge status-badge--neutral">weird</span>'],
    ['Switch en position haute', <Switch checked onLabel="Visible" offLabel="Masquée" onChange={() => {}} />,
      '<button type="button" class="admin-switch is-on"><i></i><span>Visible</span></button>'],
    ['Switch en position basse', <Switch checked={false} onLabel="Visible" offLabel="Masquée" onChange={() => {}} />,
      '<button type="button" class="admin-switch "><i></i><span>Masquée</span></button>'],
    ['TableCell alignée à droite', <TableCell className="is-x" align="end">9</TableCell>, '<td class="is-x is-end">9</td>'],
    ['Toast en erreur', <Toast tone="error" message="Échec" />, '<div class="admin-toast admin-toast--error" role="status">Échec</div>'],
    ['Toggle sans libellé', <Toggle checked={false} onChange={() => {}} />, '<label class="admin-toggle"><input type="checkbox"/><span></span></label>'],
    ['DatePicker', <DatePicker value="2026-09-06T10:30:00.000Z" onChange={() => {}} required />,
      '<div class="admin-date-input"><svg'],
    ['ImageUploader', <ImageUploader onChange={() => {}} />, '<div class="admin-image-uploader"><label class="admin-image-drop"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif"/>'],
    ['Modal large avec pied', <Modal open title="T" onClose={() => {}} wide footer={<b>pied</b>}><i>corps</i></Modal>,
      '<section class="admin-modal admin-modal--wide" role="dialog" aria-modal="true" aria-label="T"><header><div><span>AYROVI CMS</span><h2>T</h2></div>'],
    ['ConfirmDialog', <ConfirmDialog open message="Sûr ?" onConfirm={() => {}} onCancel={() => {}} />,
      '<p class="admin-confirm-message">Sûr ?</p>'],
    ['DataTable — cellule sans render', <DataTable columns={[{ key: 'title', label: 'Titre' }] as any} rows={[{ id: '1', title: 'A' }]} />,
      '<table class="admin-table"><thead><tr><th scope="col" class="">Titre</th></tr></thead><tbody><tr><td class="">A</td></tr></tbody></table>'],
    ['DataTable — état d’erreur', <DataTable columns={[{ key: 'title', label: 'Titre' }] as any} rows={[]} error="hors ligne" />,
      '<td colSpan="1"><div class="admin-table-state"><svg'],
    ['MetricStrip', <MetricStrip note="module Stock · P2.2" cells={[{ label: 'Unités', value: '12' }]} />,
      '<div class="admin-metrics"><div class="admin-metric"><div><span>Unités</span><strong class="admin-cell-num">12</strong><small>module Stock · P2.2</small></div></div></div>'],
  ];

  for (const [name, node, expected] of CONTRACTS) {
    it(`rend ${name} exactement comme avant le déplacement`, () => {
      expect(renderToStaticMarkup(node)).toContain(expected);
    });
  }

  it('ne rend rien quand la bande de chiffres n’a pas de cellules', () => {
    expect(renderToStaticMarkup(<MetricStrip note="x" cells={null} />)).toBe('');
    expect(renderToStaticMarkup(<MetricStrip note="x" cells={[]} />)).toBe('');
  });
});

describe('extractions — la primitive rend ce que l’écran écrivait à la main', () => {
  /* Les formes manuscrites ci-dessous sont recopiées des écrans tels qu'ils étaient avant P3/T2
     (HeroVisualsPage, HomeSectionsPage, InterfaceStudio, LensSectionPage, resource-ui, TrustBarPage,
     AdminApp, AdminPricingPage, DataTable). L'égalité est faite sur le rendu, pas sur le code. */
  const noop = () => {};

  it('remplace les six interrupteurs à bascule sans changer le rendu', () => {
    const on = true; const off = false;
    const manual = (checked: boolean, label: string, disabled?: boolean) => renderToStaticMarkup(
      <button type="button" disabled={disabled} className={`admin-switch ${checked ? 'is-on' : ''}`} onClick={noop}><i /><span>{label}</span></button>,
    );
    expect(normalize(renderToStaticMarkup(<Switch disabled checked={on} onLabel="Contenu visible" offLabel="Contenu masqué" onChange={noop} />)))
      .toBe(normalize(manual(on, 'Contenu visible', true)));
    expect(normalize(renderToStaticMarkup(<Switch checked={off} onLabel="Visible" offLabel="Masquée" onChange={noop} />)))
      .toBe(normalize(manual(off, 'Masquée')));
    // le champ booléen du formulaire du moteur (resource-ui)
    expect(normalize(renderToStaticMarkup(<Switch checked={on} onLabel="Oui" offLabel="Non" onChange={noop} />)))
      .toBe(normalize(manual(on, 'Oui')));
  });

  it('remplace les trois cases à cocher en ligne de TrustBarPage sans changer le rendu', () => {
    const manual = (checked: boolean, disabled: boolean, text: string) => renderToStaticMarkup(
      <label className="admin-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={noop} /><span />{text}</label>,
    );
    expect(normalize(renderToStaticMarkup(<Toggle checked disabled onChange={() => {}}>{' Visible sur le site'}</Toggle>)))
      .toBe(normalize(manual(true, true, ' Visible sur le site')));
    expect(normalize(renderToStaticMarkup(<Toggle checked={false} onChange={() => {}}>{' Visible'}</Toggle>)))
      .toBe(normalize(renderToStaticMarkup(<label className="admin-toggle"><input type="checkbox" checked={false} onChange={noop} /><span />{' Visible'}</label>)));
    expect(normalize(renderToStaticMarkup(<Toggle checked={false} disabled onChange={noop} />)))
      .toBe(normalize(manual(false, true, '')));
  });

  it('remplace les trois pastilles de l’écran de pilotage sans changer le rendu', () => {
    for (const configured of [true, false]) {
      const manual = renderToStaticMarkup(
        <span className={`admin-badge ${configured ? 'is-success' : 'is-warning'}`}>{configured ? '✅' : '⚠️'} AI Core Vision : {configured ? 'actifs' : 'non configuré'}</span>,
      );
      const primitive = renderToStaticMarkup(
        <Badge tone={configured ? 'success' : 'warning'}>{configured ? '✅' : '⚠️'} AI Core Vision : {configured ? 'actifs' : 'non configuré'}</Badge>,
      );
      expect(primitive).toBe(manual);
    }
  });

  it('remplace les trois titres de carte d’AdminPricingPage sans changer le rendu', () => {
    const manual = renderToStaticMarkup(<header className="admin-card-title"><div><h3>Matrice douanière</h3><p>Droit et TVA en %.</p></div></header>);
    expect(renderToStaticMarkup(<CardTitle title="Matrice douanière" subtitle="Droit et TVA en %." />)).toBe(manual);
  });

  it('délègue le rendu de la cellule de table à TableCell sans changer le markup', () => {
    // l'expression exacte que `DataTable` portait avant l'extraction (colonne -> classe d'alignement)
    const column = { className: 'c', align: 'end' as const };
    const manual = renderToStaticMarkup(<table><tbody><tr><td className={`${column.className ?? ''} ${column.align === 'end' ? 'is-end' : ''}`.trim()}>v</td></tr></tbody></table>);
    const viaTable = renderToStaticMarkup(<DataTable columns={[{ key: 'v', label: 'L', className: 'c', align: 'end' } as any]} rows={[{ id: '1', v: 'v' }]} />);
    expect(viaTable).toContain('<td class="c is-end">v</td>');
    expect(normalize(manual)).toContain('c is-end');
  });
});

describe('dette mesurée laissée à la suite', () => {
  it('compte les motifs encore écrits à la main, pour que la liste ne fasse que croître à l’envers', () => {
    const inScreen = (pattern: RegExp) => adminScreens.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((f) => f.split('/').pop());
    // `admin-metrics` : le bandeau de chiffres de l'écran de pilotage est un autre motif (cartes
    // avec évolution), la garde MetricStrip ne le revendique pas ; `interface-card` d'InterfaceStudio
    // non plus (en-tête avec icône de section).
    expect(inScreen(/className="admin-metrics"/).sort()).toEqual(['AdminApp.tsx']);
    expect(inScreen(/admin-card-title/).sort()).toEqual([]);
    expect(inScreen(/admin-switch|admin-toggle|admin-badge/).sort()).toEqual([]);
    // un seul onglet admin écrit à la main : rien à dédoublonner, donc pas de primitive Tabs (T4/T5)
    expect(inScreen(/className="admin-tabs"/).sort()).toEqual(['CataloguePages.tsx']);
  });

  it('réduit les en-têtes de domaine à une délégation, sans ombrer le nom de la primitive', () => {
    // Quatre écrans appelaient leur propre `const PageHeader` : le nom masquait la primitive et son
    // paramètre `eyebrow`. Ils portent désormais un nom de module et ne font qu’une ligne de
    // délégation vers PageHeader — le markup n’existe qu’une fois, dans design/admin/PageHeader.tsx.
    const aliased = adminScreens.filter((file) => /const [A-Za-z]+Header: React\.FC.*<PageHeader \{\.\.\.props\} eyebrow="/.test(readFileSync(file, 'utf8')));
    expect(aliased.map((f) => f.split('/').pop()).sort()).toEqual([
      'CataloguePages.tsx', 'ErpCorePages.tsx', 'InventoryPage.tsx', 'PurchasingPage.tsx',
    ]);
    for (const file of aliased) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/const PageHeader:/);
      expect(source).not.toMatch(/admin-page-header/);
    }
  });
});
