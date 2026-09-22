/**
 * Générateur de cadres Figma (SVG) — consoles d'administration AYROVI, modèles « grande entreprise ».
 *
 * Pourquoi SVG et pas un .fig : le format Figma est propriétaire. Un SVG structuré est ce qui s'en
 * approche le plus — à l'import, Figma conserve le nom des calques (`id`), le texte reste éditable,
 * les rectangles et filets restent vectoriels. Le fichier `tokens.json` (format Tokens Studio)
 * apporte les variables de couleur, d'espacement, de rayon et de typographie.
 *
 * Chaque cadre est nommé `Admin / <modèle> / <écran>` et suit la même donnée réelle que les
 * maquettes HTML (commandes en TND, acomptes, arrivages, barre sous l'en-tête).
 *
 * Usage : node docs/admin-prototypes-v2/figma/generate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, 'cadres');
fs.mkdirSync(out, { recursive: true });

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Primitives SVG nommées : chaque `id` devient le nom du calque dans Figma. */
const rect = (id, x, y, w, h, { fill = 'none', stroke = 'none', r = 0, sw = 1, opacity = 1 } = {}) =>
  `<rect id="${id}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"/>`;
const text = (id, x, y, value, { size = 13, weight = 400, fill = '#111', anchor = 'start', spacing = 0, family = 'Zalando Sans' } = {}) =>
  `<text id="${id}" x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${spacing}">${esc(value)}</text>`;
const line = (id, x1, y1, x2, y2, { stroke = '#E6E6E6', sw = 1 } = {}) =>
  `<line id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"/>`;
const group = (id, children) => `<g id="${id}">\n${children.join('\n')}\n</g>`;

const frame = (name, w, h, bg, children) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<title>${esc(name)}</title>
${rect('fond', 0, 0, w, h, { fill: bg })}
${children.join('\n')}
</svg>
`;

/* ── Données réelles partagées par les quatre modèles ───────────────────────────────────────── */
const orders = [
  ['AYR-TN-10241', 'Sonia Ben Ali', 'Confirmée', 'Acompte validé', '412 900', '4', '22/09 09:14', 'Standard · 29/09'],
  ['AYR-TN-10240', 'Mehdi Trabelsi', 'À vérifier', 'Justificatif reçu', '268 400', '2', '22/09 08:02', 'En attente'],
  ['AYR-TN-10239', 'Ines Gharbi', 'Préparation', 'Payé', '1 120 000', '6', '21/09 18:47', 'Express · 25/09'],
  ['AYR-TN-10238', 'Walid Chaabane', 'Acompte attendu', 'En attente client', '96 500', '1', '21/09 16:20', 'Relance J+2'],
  ['AYR-TN-10237', 'Nesrine Khelifi', 'Livrée', 'Payé', '154 300', '3', '21/09 11:05', 'Remise 21/09'],
  ['AYR-TN-10236', 'Anis Bouzid', 'Livrée', 'Payé', '73 200', '2', '20/09 15:41', 'Remise 21/09'],
  ['AYR-TN-10235', 'Rania Dridi', 'Annulée', 'Remboursé', '38 900', '1', '20/09 12:07', '—'],
];
const orderColumns = ['Commande', 'Client', 'Statut', 'Paiement', 'Total TND', 'Art.', 'Créée le', 'Suivi'];
const navItems = ['Tableau de bord', 'Commandes', 'Support IA', 'Clients', 'Arrivages', 'Barre sous l’en-tête', 'Magazine', 'Social', 'Arrivages CRM', 'Lens', 'Tarification', 'Stock', 'Achats', 'Rôles & permissions', 'Journal d’audit', 'Paramètres'];
const navCounts = { Commandes: '12', 'Support IA': '4', 'Barre sous l’en-tête': '3' };
const barEditor = [
  ['Arrivage', 'وصلات جديدة', 'Arrivage — /arrivage', '10', true],
  ['Gift & Cards', 'هدايا وبطاقات', 'Gift & Cards — /gift-cards', '20', true],
  ['Magazine', 'مجلة AYROVI', 'Magazine — /magazine', '30', false],
];

const STATUS_TONE = {
  'Confirmée': 'ok', 'Livrée': 'ok', 'Préparation': 'wait', 'Acompte attendu': 'wait',
  'À vérifier': 'info', 'Annulée': 'bad',
};
const toneColor = (palette, tone) => ({ ok: palette.ok, wait: palette.wait, info: palette.info, bad: palette.bad }[tone] || palette.muted);

/** Table de commandes commune, habillée par la palette de chaque modèle. */
function orderTable(palette, x, y, width, { rows = orders, rowH = 32, header = true, columns = orderColumns } = {}) {
  const widths = [0.14, 0.16, 0.14, 0.16, 0.13, 0.06, 0.12, 0.13].map((f) => f * width);
  const out = [];
  if (header) {
    out.push(rect('entete-tableau', x, y, width, 30, { fill: palette.headerBg || palette.surfaceAlt }));
    columns.forEach((column, index) => {
      const cx = x + widths.slice(0, index).reduce((a, b) => a + b, 0) + 10;
      out.push(text(`entete-${column.replace(/[^A-Za-z]/g, '') || index}`, cx, y + 20, column.toUpperCase(), { size: 9.5, weight: 700, fill: palette.muted, spacing: 0.9 }));
    });
  }
  rows.forEach((row, r) => {
    const ry = y + (header ? 30 : 0) + r * rowH;
    out.push(rect(`ligne-${r + 1}`, x, ry, width, rowH, { fill: r % 2 ? palette.card : palette.rowAlt || palette.card }));
    out.push(line(`separateur-${r + 1}`, x, ry + rowH, x + width, ry + rowH, { stroke: palette.line }));
    row.forEach((cell, c) => {
      const cx = x + widths.slice(0, c).reduce((a, b) => a + b, 0) + 10;
      const cy = ry + rowH / 2 + 4;
      if (c === 2) {
        const tone = STATUS_TONE[cell] || 'info';
        out.push(rect(`etiquette-${r + 1}`, cx - 4, cy - 13, Math.max(58, cell.length * 6.4 + 16), 19, { fill: palette.pillBg, r: 999 }));
        out.push(text(`statut-${r + 1}`, cx + 4, cy, cell, { size: 10.5, weight: 700, fill: toneColor(palette, tone) }));
        return;
      }
      const weight = c === 0 || c === 4 ? 700 : 400;
      out.push(text(`cellule-${r + 1}-${c + 1}`, cx, cy, cell, { size: 11.5, weight, fill: c === 0 ? palette.text : palette.muted, spacing: c === 4 ? 0 : 0 }));
    });
  });
  return group('tableau-commandes', out);
}

/* ── Modèle 1 — Console type Amazon Seller Central ─────────────────────────────────────────── */
function modele1() {
  const p = { chrome: '#232F3E', chromeText: '#FFFFFF', accent: '#FF9900', link: '#007185', canvas: '#EAEDED', card: '#FFFFFF', rowAlt: '#FFFFFF', headerBg: '#F3F3F4', surfaceAlt: '#F3F3F4', line: '#D5D9D9', text: '#0F1111', muted: '#565959', pillBg: '#F0F2F2', ok: '#067D62', wait: '#8A6116', info: '#0F5A94', bad: '#B12704' };
  const children = [];
  // Chrome supérieur (Amazon : bandeau encre + second niveau de navigation)
  children.push(rect('chrome-haut', 0, 0, 1440, 48, { fill: p.chrome }));
  children.push(text('marque', 20, 30, 'AYROVI', { size: 15, weight: 800, fill: p.chromeText, spacing: 2 }));
  children.push(text('compte', 120, 29, 'Vendeur · Tunisie', { size: 11, weight: 500, fill: '#C9D2DA' }));
  children.push(rect('recherche', 320, 12, 460, 25, { fill: '#FFFFFF', r: 3 }));
  children.push(text('recherche-libelle', 332, 29, 'Rechercher une commande, un client, un produit…', { size: 11.5, fill: '#8B8B8B' }));
  children.push(text('langue', 1360, 29, 'FR/Arabic', { size: 11, fill: '#C9D2DA', anchor: 'end' }));
  // Onglets de service
  children.push(rect('chrome-onglets', 0, 48, 1440, 40, { fill: '#37475A' }));
  ['Tableau de bord', 'Commandes', 'Arrivages', 'Catalogue', 'Stock', 'Tarification', 'Rapports', 'Paramètres'].forEach((tab, i) => {
    const x = 24 + i * 132;
    if (tab === 'Commandes') children.push(rect('onglet-actif', x - 12, 48, 132, 40, { fill: '#FFFFFF' }));
    children.push(text(`onglet-${i + 1}`, x, 73, tab, { size: 12.5, weight: tab === 'Commandes' ? 700 : 500, fill: tab === 'Commandes' ? '#0F1111' : '#FFFFFF' }));
  });
  // Colonne latérale
  children.push(rect('nav', 0, 88, 208, 812, { fill: '#FFFFFF' }));
  children.push(line('nav-separateur', 208, 88, 208, 900, { stroke: p.line }));
  navItems.slice(0, 14).forEach((item, i) => {
    const y = 118 + i * 30;
    if (item === 'Commandes') children.push(rect('nav-actif', 0, y - 17, 208, 28, { fill: '#F3F3F4' }));
    children.push(text(`nav-${i + 1}`, 16, y, item, { size: 12, weight: item === 'Commandes' ? 700 : 400, fill: item === 'Commandes' ? p.text : '#3A4149' }));
    if (navCounts[item]) children.push(text(`nav-badge-${i + 1}`, 192, y, navCounts[item], { size: 10.5, weight: 700, fill: p.muted, anchor: 'end' }));
  });
  // En-tête de page + cartes de performance
  children.push(text('titre', 232, 130, 'Commandes', { size: 24, weight: 800 }));
  children.push(text('sous-titre', 232, 150, 'Centre de commandes · 1 248 commandes sur 30 jours · mise à jour 09:41', { size: 11.5, fill: p.muted }));
  children.push(rect('bouton-primaire', 1180, 112, 132, 30, { fill: p.accent, r: 3 }));
  children.push(text('bouton-primaire-libelle', 1246, 132, 'Acheter la marchandise', { size: 11.5, weight: 700, fill: '#111111', anchor: 'middle' }));
  children.push(rect('bouton-secondaire', 1322, 112, 96, 30, { fill: '#FFFFFF', stroke: p.line, r: 3 }));
  children.push(text('bouton-secondaire-libelle', 1370, 132, 'Exporter', { size: 11.5, weight: 600, fill: p.text, anchor: 'middle' }));
  // Vue enregistrée + filtres (conventions « grande entreprise »)
  children.push(rect('onglets-vue', 232, 172, 1186, 34, { fill: '#FFFFFF', stroke: p.line, r: 3 }));
  ['Non expédiées (12)', 'À vérifier (7)', 'Annulées (3)', 'Toutes (1 248)'].forEach((tab, i) => {
    const x = 248 + i * 150;
    if (i === 0) { children.push(rect('vue-active', 240, 172, 143, 34, { fill: '#FFFFFF' })); children.push(line('vue-soulignement', 240, 204, 383, 204, { stroke: p.accent, sw: 3 })); }
    children.push(text(`vue-${i + 1}`, x, 194, tab, { size: 11.5, weight: i === 0 ? 700 : 500, fill: i === 0 ? p.text : p.muted }));
  });
  children.push(rect('barre-filtres', 232, 214, 1186, 44, { fill: '#FFFFFF', stroke: p.line, r: 3 }));
  ['Période : 30 derniers jours', 'Statut : tous', 'Mode de paiement : tous', 'Gouvernorat : tous', '+ Filtre', 'Colonnes ▾'].forEach((label, i) => {
    const x = 248 + i * 196;
    children.push(rect(`filtre-${i + 1}`, x - 8, 224, 180, 24, { fill: '#FFFFFF', stroke: p.line, r: 999 }));
    children.push(text(`filtre-libelle-${i + 1}`, x + 82, 240, label, { size: 11, weight: 600, fill: p.text, anchor: 'middle' }));
  });
  // Corps : table + panneau de détail
  children.push(rect('carte-tableau', 232, 272, 830, 596, { fill: p.card, stroke: p.line, r: 3 }));
  children.push(rect('barre-actions-lot', 232, 272, 830, 40, { fill: '#F3F3F4', r: 3 }));
  children.push(rect('case-tout', 248, 284, 16, 16, { fill: '#FFFFFF', stroke: p.muted, r: 2 }));
  children.push(text('actions-lot', 276, 296, '3 sélectionnées · Valider l’acompte · Préparer · Émettre la facture · Archiver', { size: 11.5, weight: 600, fill: p.text }));
  children.push(orderTable(p, 232, 312, 830, {}));
  children.push(line('pied-carte', 232, 860, 1062, 860, { stroke: p.line }));
  children.push(text('pagination', 248, 880, '1–7 sur 1 248 · Pagination 10 / 25 / 50', { size: 11, fill: p.muted }));
  // Panneau latéral : acompte + barre sous l'en-tête + performance
  children.push(rect('panneau', 1078, 272, 340, 596, { fill: p.card, stroke: p.line, r: 3 }));
  children.push(text('panneau-titre', 1094, 300, 'AYR-TN-10241 · Sonia Ben Ali', { size: 13, weight: 800 }));
  children.push(text('panneau-sous-titre', 1094, 318, 'Ariana · Virement bancaire · 4 articles', { size: 11, fill: p.muted }));
  [['Total', '412 900 TND'], ['Acompte (20 %)', '82 580 TND'], ['Tarif appliqué', 'v3 · EUR 1 → 3,412 TND'], ['Livraison', 'Standard · 29/09']].forEach(([k, v], i) => {
    const y = 348 + i * 34;
    children.push(text(`detail-cle-${i + 1}`, 1094, y, k, { size: 11.5, fill: p.muted }));
    children.push(text(`detail-valeur-${i + 1}`, 1402, y, v, { size: 11.5, weight: 700, anchor: 'end' }));
    children.push(line(`detail-separateur-${i + 1}`, 1094, y + 12, 1402, y + 12, { stroke: '#EDEDED' }));
  });
  children.push(rect('action-valider', 1094, 498, 308, 32, { fill: p.accent, r: 3 }));
  children.push(text('action-valider-libelle', 1248, 518, 'Valider l’acompte', { size: 12, weight: 700, fill: '#111111', anchor: 'middle' }));
  children.push(rect('action-secondaire', 1094, 538, 148, 30, { fill: '#FFFFFF', stroke: p.line, r: 3 }));
  children.push(text('action-secondaire-libelle', 1168, 557, 'Préparer', { size: 11.5, weight: 600, anchor: 'middle', fill: p.text }));
  children.push(rect('action-tertiaire', 1254, 538, 148, 30, { fill: '#FFFFFF', stroke: p.line, r: 3 }));
  children.push(text('action-tertiaire-libelle', 1328, 557, 'Facture', { size: 11.5, weight: 600, anchor: 'middle', fill: p.text }));
  children.push(text('barre-titre', 1094, 600, 'BARRE SOUS L’EN-TÊTE', { size: 9.5, weight: 700, fill: p.muted, spacing: 1.2 }));
  // Deux lignes par onglet : libellés FR/AR, puis la cible technique et l'ordre — aucun chevauchement.
  barEditor.forEach((row, i) => {
    const y = 622 + i * 38;
    children.push(text(`barre-libelles-${i + 1}`, 1094, y, `${row[0]}  ·  ${row[1]}`, { size: 11.5, weight: 700, fill: p.text }));
    children.push(text(`barre-etat-${i + 1}`, 1402, y, row[4] ? 'actif' : 'masqué', { size: 10.5, weight: 700, fill: row[4] ? p.ok : p.muted, anchor: 'end' }));
    children.push(text(`barre-cible-${i + 1}`, 1094, y + 14, `${row[2]}  ·  ordre ${row[3]}`, { size: 10, fill: p.muted }));
    children.push(line(`barre-separateur-${i + 1}`, 1094, y + 24, 1402, y + 24, { stroke: '#EDEDED' }));
  });
  children.push(text('barre-note', 1094, 744, 'Destination = liste fermée : aucun lien mort possible.', { size: 10.5, fill: p.muted }));
  children.push(line('journal-separateur', 1094, 762, 1402, 762, { stroke: p.line }));
  children.push(text('journal-titre', 1094, 784, 'JOURNAL (EXTRAIT)', { size: 9.5, weight: 700, fill: p.muted, spacing: 1.2 }));
  ['22/09 09:15 · APPROVE acompte 82 580 TND (Issam)', '22/09 09:14 · CREATE commande — import Lens', '21/09 18:47 · UPDATE statut CONFIRMED'].forEach((row, i) => {
    children.push(text(`journal-ligne-${i + 1}`, 1094, 806 + i * 18, row, { size: 10.5, fill: p.muted }));
  });
  return frame('Admin / Modèle 1 — Amazon Seller Central / Commandes', 1440, 900, p.canvas, [group('chrome', children.slice(0, 14)), group('navigation', children.slice(14, 32)), group('en-tete-page', children.slice(32, 41)), group('filtres', children.slice(41, 55)), group('corps', children.slice(55))]);
}

/* ── Modèle 2 — Console type Stripe Dashboard ──────────────────────────────────────────────── */
function modele2() {
  const p = { chrome: '#FFFFFF', accent: '#635BFF', link: '#0A2540', canvas: '#F6F9FC', card: '#FFFFFF', rowAlt: '#FFFFFF', headerBg: '#F7FAFC', surfaceAlt: '#F7FAFC', line: '#E3E8EE', text: '#0A2540', muted: '#425466', pillBg: '#F2F4F8', ok: '#1FB57A', wait: '#C77B21', info: '#4F5BFF', bad: '#D6403A' };
  const children = [];
  children.push(rect('nav', 0, 0, 232, 900, { fill: p.card }));
  children.push(line('nav-separateur', 232, 0, 232, 900, { stroke: p.line }));
  children.push(text('marque', 24, 40, 'AYROVI', { size: 14, weight: 800, spacing: 3 }));
  children.push(rect('recherche', 24, 60, 184, 30, { fill: p.surfaceAlt, r: 6 }));
  children.push(text('recherche-libelle', 38, 80, 'Rechercher  ⌘K', { size: 11.5, fill: p.muted }));
  navItems.forEach((item, i) => {
    const y = 122 + i * 30;
    if (item === 'Commandes') { children.push(rect('nav-actif', 12, y - 17, 208, 28, { fill: '#F2F4F8', r: 6 })); children.push(text('nav-actif-libelle', 34, y, item, { size: 12.5, weight: 700, fill: p.text })); return; }
    children.push(text(`nav-${i + 1}`, 34, y, item, { size: 12.5, fill: '#3C4257' }));
    if (navCounts[item]) children.push(text(`nav-badge-${i + 1}`, 206, y, navCounts[item], { size: 10.5, weight: 700, fill: p.muted, anchor: 'end' }));
  });
  children.push(rect('mode-test', 24, 840, 184, 28, { fill: '#FFF6E5', r: 999 }));
  children.push(text('mode-test-libelle', 116, 858, 'Mode production', { size: 11, weight: 700, fill: '#8A6116', anchor: 'middle' }));
  // En-tête : dates + métriques + graphique
  children.push(text('titre', 272, 56, 'Paiements et acomptes', { size: 22, weight: 800 }));
  children.push(text('sous-titre', 272, 76, '30 derniers jours · devise de règlement TND', { size: 12, fill: p.muted }));
  children.push(rect('bouton-primaire', 1268, 42, 148, 32, { fill: p.accent, r: 8 }));
  children.push(text('bouton-primaire-libelle', 1342, 62, 'Valider un acompte', { size: 12, weight: 700, fill: '#FFFFFF', anchor: 'middle' }));
  [['Chiffre d’affaires', '486 320 TND', '+8,4 %', p.ok], ['Volume encaissé', '312 480 TND', '+5,1 %', p.ok], ['Acomptes à vérifier', '7', '2 en attente', p.wait], ['Litiges', '3', '−1', p.muted]].forEach(([label, value, delta, color], i) => {
    const x = 272 + i * 288;
    children.push(rect(`metrique-${i + 1}`, x, 104, 268, 78, { fill: p.card, stroke: p.line, r: 10 }));
    children.push(text(`metrique-etiquette-${i + 1}`, x + 16, 128, label, { size: 11, weight: 600, fill: p.muted }));
    children.push(text(`metrique-valeur-${i + 1}`, x + 16, 158, value, { size: 20, weight: 800 }));
    children.push(text(`metrique-delta-${i + 1}`, x + 252, 128, delta, { size: 11, weight: 700, fill: color, anchor: 'end' }));
  });
  // Graphique : aire + grille
  children.push(rect('carte-graphique', 272, 198, 1144, 190, { fill: p.card, stroke: p.line, r: 10 }));
  children.push(text('graphique-titre', 292, 226, 'Encaissements par jour', { size: 13, weight: 700 }));
  children.push(text('graphique-legende', 1396, 226, 'EUR · USD · GBP', { size: 11, fill: p.muted, anchor: 'end' }));
  for (let i = 0; i <= 4; i += 1) children.push(line(`grille-${i}`, 292, 250 + i * 30, 1396, 250 + i * 30, { stroke: '#EDF1F7' }));
  const points = [22, 30, 26, 38, 34, 52, 46, 60, 55, 72, 66, 84];
  children.push(`<polyline id="courbe" points="${points.map((v, i) => `${300 + i * 92},${360 - v * 1.7}`).join(' ')}" fill="none" stroke="${p.accent}" stroke-width="2.5"/>`);
  children.push(`<polygon id="aire" points="300,360 ${points.map((v, i) => `${300 + i * 92},${360 - v * 1.7}`).join(' ')} 1312,360" fill="${p.accent}" opacity="0.08"/>`);
  children.push(rect('barre-onglets', 272, 404, 1144, 38, { fill: 'none' }));
  ['Aperçu', 'Paiements', 'Acomptes', 'Clients', 'Produits', 'Factures'].forEach((tab, i) => {
    const x = 272 + i * 118;
    if (i === 2) { children.push(text(`onglet-${i + 1}`, x, 428, tab, { size: 12.5, weight: 700, fill: p.text })); children.push(line('onglet-soulignement', x - 2, 442, x + 58, 442, { stroke: p.accent, sw: 2.5 })); return; }
    children.push(text(`onglet-${i + 1}`, x, 428, tab, { size: 12.5, weight: 500, fill: p.muted }));
  });
  children.push(rect('carte-liste', 272, 452, 848, 416, { fill: p.card, stroke: p.line, r: 10 }));
  children.push(orderTable(p, 272, 452, 848, { rowH: 40 }));
  children.push(text('pagination', 292, 852, '1–7 sur 1 248 · export CSV', { size: 11, fill: p.muted }));
  // Tiroir de détail (style Stripe : timeline d'événements)
  children.push(rect('tiroir', 1144, 452, 272, 416, { fill: p.card, stroke: p.line, r: 10 }));
  children.push(text('tiroir-titre', 1164, 482, 'AYR-TN-10241', { size: 14, weight: 800 }));
  children.push(text('tiroir-sous-titre', 1164, 500, 'Sonia Ben Ali · Confirmée', { size: 11, fill: p.muted }));
  children.push(text('tiroir-montant', 1396, 532, '412 900 TND', { size: 18, weight: 800, anchor: 'end' }));
  children.push(text('tiroir-montant-detail', 1396, 550, 'acompte 82 580 TND reçu', { size: 10.5, fill: p.muted, anchor: 'end' }));
  ['22/09 09:15 · Acompte approuvé par Issam', '22/09 09:14 · Commande créée (import Lens)', '22/09 08:02 · Justificatif reçu', '21/09 16:20 · Lien de paiement envoyé'].forEach((row, i) => {
    const y = 590 + i * 44;
    children.push(`<circle id="jalon-${i + 1}" cx="1172" cy="${y - 4}" r="4" fill="${i === 0 ? p.accent : '#D2DAE5'}"/>`);
    if (i < 3) children.push(line(`timeline-${i + 1}`, 1172, y + 2, 1172, y + 40, { stroke: '#E3E8EE' }));
    children.push(text(`evenement-${i + 1}`, 1188, y, row, { size: 11, fill: p.muted }));
  });
  children.push(rect('bouton-tiroir', 1164, 800, 108, 30, { fill: p.accent, r: 8 }));
  children.push(text('bouton-tiroir-libelle', 1218, 820, 'Valider', { size: 11.5, weight: 700, fill: '#FFFFFF', anchor: 'middle' }));
  children.push(rect('bouton-tiroir-secondaire', 1280, 800, 96, 30, { fill: '#FFFFFF', stroke: p.line, r: 8 }));
  children.push(text('bouton-tiroir-secondaire-libelle', 1328, 820, 'Rembourser', { size: 11.5, weight: 600, fill: p.text, anchor: 'middle' }));
  return frame('Admin / Modèle 2 — Stripe Dashboard / Acomptes', 1440, 900, p.canvas, [group('navigation', children.slice(0, 22)), group('entete', children.slice(22, 31)), group('graphique', children.slice(31, 44)), group('liste', children.slice(44, 48)), group('tiroir-detail', children.slice(48))]);
}

/* ── Modèle 3 — Console type Cloud (Google Cloud / AWS) ────────────────────────────────────── */
function modele3() {
  const p = { chrome: '#FFFFFF', accent: '#1A73E8', link: '#1A73E8', canvas: '#F8F9FA', card: '#FFFFFF', rowAlt: '#FFFFFF', headerBg: '#F1F3F4', surfaceAlt: '#F1F3F4', line: '#DADCE0', text: '#202124', muted: '#5F6368', pillBg: '#F1F3F4', ok: '#188038', wait: '#B06000', info: '#1A73E8', bad: '#C5221F' };
  const children = [];
  // Barre supérieure + navigation de service horizontale
  children.push(rect('chrome-haut', 0, 0, 1440, 52, { fill: p.chrome }));
  children.push(text('marque', 20, 33, 'AYROVI Cloud Console', { size: 15, weight: 700 }));
  children.push(rect('selecteur-projet', 210, 14, 236, 26, { fill: '#F1F3F4', r: 4 }));
  children.push(text('selecteur-projet-libelle', 226, 31, 'Projet : ayrovi-production', { size: 11.5, weight: 600, fill: p.text }));
  children.push(rect('recherche-globale', 470, 14, 420, 26, { fill: '#F1F3F4', r: 4 }));
  children.push(text('recherche-libelle', 486, 31, 'Rechercher une ressource, un écran, une permission…', { size: 11.5, fill: p.muted }));
  children.push(text('assistance', 1180, 31, 'Aide  ·  Journal d’activité  ·  SA', { size: 11.5, fill: p.muted, anchor: 'end' }));
  children.push(line('chrome-separateur', 0, 52, 1440, 52, { stroke: p.line }));
  ['Tableau de bord', 'Commandes', 'Arrivages', 'Catalogue', 'Stock', 'Tarification', 'Rapports', 'IAM'].forEach((tab, i) => {
    const x = 20 + i * 116;
    children.push(text(`service-${i + 1}`, x, 76, tab, { size: 12, weight: tab === 'Commandes' ? 700 : 500, fill: tab === 'Commandes' ? p.text : p.muted }));
    if (tab === 'Commandes') children.push(line('service-actif', x - 4, 88, x + 62, 88, { stroke: p.accent, sw: 3 }));
  });
  children.push(line('service-separateur', 0, 88, 1440, 88, { stroke: p.line }));
  // Fil d'Ariane + titre
  children.push(text('fil-ariane', 24, 120, 'Commerce  ›  Commandes  ›  ayr-tn-10241', { size: 11.5, fill: p.muted }));
  children.push(text('titre', 24, 152, 'Commandes', { size: 24, weight: 700 }));
  children.push(text('sous-titre', 24, 174, '1 248 ressources · 12 en attente · filtre actif : paiement = à vérifier', { size: 12, fill: p.muted }));
  // Boutons d'action globaux (convention console)
  children.push(rect('bouton-creer', 1276, 130, 140, 32, { fill: p.accent, r: 4 }));
  children.push(text('bouton-creer-libelle', 1346, 151, 'Créer une commande', { size: 12, weight: 600, fill: '#FFFFFF', anchor: 'middle' }));
  // Barre de filtre (chips) + vue
  children.push(rect('barre-filtre', 24, 196, 1392, 40, { fill: p.card, stroke: p.line, r: 8 }));
  children.push(text('filtre-libelle', 40, 221, 'Filtre :', { size: 11.5, weight: 700, fill: p.muted }));
  ['statut : à vérifier ✕', 'paiement : justificatif reçu ✕', 'gouvernorat : Ariana ✕'].forEach((chip, i) => {
    children.push(rect(`chip-${i + 1}`, 100 + i * 210, 206, 196, 22, { fill: '#E8F0FE', r: 999 }));
    children.push(text(`chip-libelle-${i + 1}`, 198 + i * 210, 221, chip, { size: 11, weight: 600, fill: p.accent, anchor: 'middle' }));
  });
  children.push(text('barre-filtre-droite', 1388, 221, 'Densité : compacte  ·  Colonnes  ·  Actualiser', { size: 11, fill: p.muted, anchor: 'end' }));
  // Liste de ressources (gauche) + inspecteur (droite)
  children.push(rect('carte-ressources', 24, 252, 820, 620, { fill: p.card, stroke: p.line, r: 8 }));
  children.push(rect('barre-selection', 24, 252, 820, 40, { fill: p.surfaceAlt, r: 8 }));
  children.push(rect('case-tout', 40, 264, 16, 16, { fill: '#FFFFFF', stroke: p.muted, r: 2 }));
  children.push(text('selection-libelle', 68, 276, '3 sélectionnées', { size: 11.5, weight: 700, fill: p.text }));
  children.push(text('selection-actions', 826, 276, 'Actions ▾   ·   Exporter   ·   Étiqueter', { size: 11.5, weight: 600, fill: p.accent, anchor: 'end' }));
  children.push(orderTable(p, 24, 292, 820, { rowH: 34 }));
  children.push(line('pied-liste', 24, 840, 844, 840, { stroke: p.line }));
  children.push(text('pied-liste-texte', 40, 864, '1–7 sur 1 248 · 50 par page', { size: 11, fill: p.muted }));
  // Inspecteur : onglets Détails / Journal / Liens, propriétés clé-valeur
  children.push(rect('inspecteur', 860, 252, 556, 620, { fill: p.card, stroke: p.line, r: 8 }));
  children.push(text('inspecteur-titre', 880, 284, 'ayr-tn-10241', { size: 15, weight: 700 }));
  ['Détails', 'Journal', 'Liens', 'Barre sous l’en-tête'].forEach((tab, i) => {
    const x = 880 + i * 104;
    children.push(text(`inspecteur-onglet-${i + 1}`, x, 314, tab, { size: 12, weight: i === 3 ? 700 : 500, fill: i === 3 ? p.text : p.muted }));
    if (i === 3) children.push(line('inspecteur-onglet-actif', x - 4, 324, x + 122, 324, { stroke: p.accent, sw: 2.5 }));
  });
  children.push(line('inspecteur-separateur', 860, 332, 1416, 332, { stroke: p.line }));
  [['Identifiant', 'ayr-tn-10241'], ['Client', 'Sonia Ben Ali · +216 21 ••• 447'], ['Statut', 'Confirmée'], ['Total', '412 900 TND'], ['Acompte', '82 580 TND (20 %)'], ['Tarif appliqué', 'v3 · EUR 1 → 3,412 TND'], ['Créée le', '22/09/2026 09:14']].forEach(([k, v], i) => {
    const y = 366 + i * 34;
    children.push(text(`propriete-cle-${i + 1}`, 880, y, k, { size: 11.5, fill: p.muted }));
    children.push(text(`propriete-valeur-${i + 1}`, 1416, y, v, { size: 11.5, weight: 600, anchor: 'end', fill: p.text }));
    children.push(line(`propriete-separateur-${i + 1}`, 880, y + 12, 1416, y + 12, { stroke: '#F1F3F4' }));
  });
  children.push(text('inspecteur-barre-titre', 880, 634, 'BARRE SOUS L’EN-TÊTE — RESSOURCES LIÉES', { size: 9.5, weight: 700, fill: p.muted, spacing: 1.2 }));
  barEditor.forEach((row, i) => {
    const y = 662 + i * 30;
    children.push(text(`barre-ressource-${i + 1}`, 880, y, `${row[0]}  →  ${row[2]}`, { size: 11.5, fill: p.text }));
    children.push(text(`barre-ressource-etat-${i + 1}`, 1416, y, row[4] ? 'actif' : 'masqué', { size: 10.5, weight: 700, fill: row[4] ? p.ok : p.muted, anchor: 'end' }));
    children.push(line(`barre-ressource-separateur-${i + 1}`, 880, y + 10, 1416, y + 10, { stroke: '#F1F3F4' }));
  });
  children.push(rect('pied-inspecteur', 860, 836, 556, 36, { fill: p.surfaceAlt, r: 8 }));
  children.push(text('pied-inspecteur-texte', 880, 859, 'Valider l’acompte  ·  Préparer  ·  Émettre la facture  ·  Archiver', { size: 11.5, weight: 600, fill: p.accent }));
  return frame('Admin / Modèle 3 — Console Cloud / Commandes', 1440, 900, p.canvas, [group('chrome', children.slice(0, 3)), group('navigation-service', children.slice(3, 14)), group('en-tete', children.slice(14, 20)), group('filtres', children.slice(20, 27)), group('liste-ressources', children.slice(27, 34)), group('inspecteur', children.slice(34))]);
}

/* ── Modèle 4 — Console type Shopify Admin ─────────────────────────────────────────────────── */
function modele4() {
  const p = { chrome: '#1A1A1A', chromeText: '#FFFFFF', accent: '#008060', link: '#005BD3', canvas: '#F6F6F7', card: '#FFFFFF', rowAlt: '#FFFFFF', headerBg: '#F7F7F7', surfaceAlt: '#F1F1F1', line: '#E1E3E5', text: '#303030', muted: '#616161', pillBg: '#F1F1F1', ok: '#008060', wait: '#916A00', info: '#005BD3', bad: '#D72C0D' };
  const children = [];
  children.push(rect('chrome-haut', 0, 0, 1440, 48, { fill: p.chrome }));
  children.push(text('marque', 20, 30, 'AYROVI', { size: 14, weight: 800, fill: p.chromeText, spacing: 3 }));
  children.push(rect('recherche', 180, 12, 420, 26, { fill: '#303030', r: 6 }));
  children.push(text('recherche-libelle', 196, 29, 'Rechercher  ⌘K', { size: 11.5, fill: '#B5B5B5' }));
  children.push(text('boutique', 1330, 29, 'Boutique AYROVI · TN', { size: 11.5, fill: '#D4D4D4', anchor: 'end' }));
  // Navigation latérale avec badges
  children.push(rect('nav', 0, 48, 224, 852, { fill: '#F1F1F1' }));
  navItems.slice(0, 15).forEach((item, i) => {
    const y = 84 + i * 30;
    if (item === 'Commandes') { children.push(rect('nav-actif', 8, y - 17, 208, 28, { fill: '#FFFFFF', r: 8 })); children.push(text('nav-actif-libelle', 24, y, item, { size: 12.5, weight: 700, fill: p.text })); return; }
    children.push(text(`nav-${i + 1}`, 24, y, item, { size: 12.5, fill: '#3A3A3A' }));
    if (navCounts[item]) { children.push(rect(`nav-badge-fond-${i + 1}`, 186, y - 14, 26, 18, { fill: p.pillBg, r: 999 })); children.push(text(`nav-badge-${i + 1}`, 199, y, navCounts[item], { size: 10.5, weight: 700, fill: p.muted, anchor: 'middle' })); }
  });
  // En-tête d'index + vues enregistrées
  children.push(text('fil-ariane', 252, 84, 'Commandes', { size: 11.5, fill: p.muted }));
  children.push(text('titre', 252, 116, 'Commandes', { size: 22, weight: 700 }));
  children.push(rect('bouton-primaire', 1300, 92, 116, 32, { fill: p.accent, r: 8 }));
  children.push(text('bouton-primaire-libelle', 1358, 113, 'Créer', { size: 12, weight: 700, fill: '#FFFFFF', anchor: 'middle' }));
  ['Tous', 'Ouverts', 'À vérifier', 'Acompte attendu', 'Expédiés', 'Archivés'].forEach((tab, i) => {
    const x = 252 + i * 108;
    children.push(text(`vue-${i + 1}`, x, 152, tab, { size: 12.5, weight: i === 2 ? 700 : 500, fill: i === 2 ? p.text : p.muted }));
    if (i === 2) children.push(line('vue-active', x - 2, 164, x + 62, 164, { stroke: p.text, sw: 2.5 }));
  });
  // Cartes « Aujourd'hui » (convention Shopify : cartes de synthèse au-dessus de l'index)
  [['Commandes aujourd’hui', '18', '+4 vs hier'], ['Chiffre d’affaires', '42 380 TND', '+6,2 %'], ['Acomptes à vérifier', '7', 'à traiter'], ['Arrivages à valider', '3', 'en révision']].forEach(([label, value, note], i) => {
    const x = 252 + i * 296;
    children.push(rect(`carte-synthese-${i + 1}`, x, 184, 278, 76, { fill: p.card, stroke: p.line, r: 10 }));
    children.push(text(`carte-synthese-etiquette-${i + 1}`, x + 14, 208, label, { size: 11, weight: 600, fill: p.muted }));
    children.push(text(`carte-synthese-valeur-${i + 1}`, x + 14, 238, value, { size: 19, weight: 800 }));
    children.push(text(`carte-synthese-note-${i + 1}`, x + 264, 208, note, { size: 10.5, weight: 700, fill: i === 2 ? p.wait : p.ok, anchor: 'end' }));
  });
  // Index : table avec règle de lot + barre de sauvegarde contextuelle (bas de page)
  children.push(rect('carte-index', 252, 276, 1164, 484, { fill: p.card, stroke: p.line, r: 10 }));
  children.push(rect('barre-lot', 252, 276, 1164, 40, { fill: p.surfaceAlt, r: 10 }));
  children.push(rect('case-tout', 268, 288, 16, 16, { fill: '#FFFFFF', stroke: p.muted, r: 2 }));
  children.push(text('lot-libelle', 296, 300, '3 sélectionnées  ·  Modifier  ·  Archiver  ·  Exporter  ·  Étiqueter', { size: 11.5, weight: 600, fill: p.text }));
  children.push(orderTable(p, 252, 316, 1164, { rowH: 36 }));
  children.push(line('index-separateur', 252, 700, 1416, 700, { stroke: p.line }));
  children.push(text('index-pied', 268, 726, '1–7 sur 1 248  ·  50 par page', { size: 11, fill: p.muted }));
  // Panneau droit : édition de la barre sous l'en-tête avec aperçu
  children.push(rect('carte-barre', 252, 772, 1164, 76, { fill: '#FFFFFF', stroke: p.line, r: 10 }));
  children.push(text('barre-titre', 272, 802, 'Barre sous l’en-tête', { size: 13, weight: 700 }));
  barEditor.forEach((row, i) => {
    const x = 452 + i * 300;
    children.push(rect(`barre-champ-${i + 1}`, x, 788, 288, 46, { fill: '#FAFAFA', stroke: p.line, r: 8 }));
    children.push(text(`barre-champ-fr-${i + 1}`, x + 12, 806, row[0], { size: 11.5, weight: 600, fill: p.text }));
    children.push(text(`barre-champ-ar-${i + 1}`, x + 12, 824, row[1], { size: 11, fill: p.muted }));
    children.push(text(`barre-champ-cible-${i + 1}`, x + 276, 806, row[2], { size: 10, fill: p.muted, anchor: 'end' }));
    children.push(text(`barre-champ-etat-${i + 1}`, x + 276, 824, row[4] ? 'actif' : 'masqué', { size: 10, weight: 700, fill: row[4] ? p.ok : p.muted, anchor: 'end' }));
  });
  // Barre de sauvegarde contextuelle, en bas du cadre, sous la carte (aucun chevauchement).
  children.push(rect('barre-sauvegarde', 252, 858, 1164, 34, { fill: '#303030', r: 8 }));
  children.push(text('barre-sauvegarde-texte', 272, 880, 'Modifications non enregistrées de la barre publique', { size: 11.5, weight: 600, fill: '#FFFFFF' }));
  children.push(text('barre-sauvegarde-actions', 1396, 880, 'Ignorer            Enregistrer', { size: 11.5, weight: 700, fill: '#FFFFFF', anchor: 'end' }));
  return frame('Admin / Modèle 4 — Shopify Admin / Index des commandes', 1440, 900, p.canvas, [group('chrome', children.slice(0, 3)), group('navigation', children.slice(3, 20)), group('en-tete', children.slice(20, 30)), group('cartes-synthese', children.slice(30, 39)), group('index-commandes', children.slice(39, 45)), group('barre-sous-entete', children.slice(45))]);
}

const frames = [
  ['modele-1-amazon-commandes.svg', modele1()],
  ['modele-2-stripe-acomptes.svg', modele2()],
  ['modele-3-cloud-commandes.svg', modele3()],
  ['modele-4-shopify-index.svg', modele4()],
];
for (const [name, svg] of frames) {
  fs.writeFileSync(path.join(out, name), svg);
  console.log(name, `${Math.round(svg.length / 1024)} Ko`);
}
console.log(`\n${frames.length} cadres générés dans ${path.relative(process.cwd(), out)}`);
