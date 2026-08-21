import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as I from '../client/src/components/icons/ayrovi/catalog';

const ORDER: Array<[string, string]> = [
  ['Menu', 'Menu'], ['Back', 'Retour'], ['Close', 'Fermer'], ['Options', 'Options'],
  ['Home', 'Accueil'], ['ChevronRight', 'Chevron'], ['ChevronLeft', 'Chevron'],
  ['ChevronDown', 'Chevron'], ['Search', 'Recherche'], ['ArrowRight', 'Arrow'],
  ['ArrowUp', 'Arrow'], ['ArrowDown', 'Arrow'], ['ArrowUpRight', 'Arrow'],
  ['Swap', 'Swap'], ['Nav', 'Nav'], ['Plus', 'Ajouter'], ['Minus', 'Minus'],
  ['Check', 'Check'], ['Edit', 'Modifier'], ['Trash', 'Supprimer'], ['Copy', 'Copier'],
  ['Save', 'Save'], ['Share', 'Partager'], ['Refresh', 'Refresh'], ['Undo', 'Undo'],
  ['Loader', 'Loader'], ['Pointer', 'Pointer'], ['Square', 'Square'], ['Pause', 'Pause'],
  ['Bag', 'Panier'], ['Heart', 'Favori'], ['HeartFilled', 'Favori plein'],
  ['Cube', 'Produit'], ['PackageCheck', 'Suivi colis'], ['Percent', 'Promo'],
  ['Tag', 'Tag'], ['Gift', 'Gift'], ['Star', 'Star'], ['Card', 'Carte'],
  ['Receipt', 'Facture'], ['Truck', 'Livraison'], ['Calculator', 'Calcul'],
  ['Clipboard', 'Commandes'], ['History', 'Historique'], ['Chart', 'Graphique'],
  ['Sparkles', 'AI'], ['Lens', 'Lens'], ['Scan', 'Scan'], ['Eye', 'Vision'],
  ['EyeOff', 'EyeOff'], ['Barcode', 'Barcode'], ['Camera', 'Camera'], ['Plug', 'Connecteur'],
  ['Link', 'Lien'], ['Image', 'Image'], ['Zap', 'Flash'],
  ['Chat', 'Chat'], ['Message', 'Message'], ['Phone', 'Appel'], ['Mail', 'Email'],
  ['Bell', 'Notification'], ['Info', 'Info'], ['Success', 'Succès'], ['Alert', 'Alerte'],
  ['ThumbsUp', 'Pouce+'], ['ThumbsDown', 'Pouce-'], ['Mic', 'Mic'], ['Video', 'Video'],
  ['Volume', 'Volume'], ['VolumeOff', 'VolumeOff'],
  ['User', 'Profil'], ['Lock', 'Sécurité'], ['Logout', 'Déconnexion'],
  ['Pin', 'Adresse'], ['Locate', 'Localiser'], ['Shield', 'Confidentialité'],
  ['Moon', 'Mode sombre'], ['Settings', 'Paramètres'], ['Sliders', 'Tri'],
  ['Grid', 'Grille'], ['Bookmark', 'Signet'],
  ['File', 'Fichier'], ['Calendar', 'Estimation'], ['Type', 'Type'], ['Monitor', 'Monitor'],
  ['Palette', 'Palette'], ['Globe', 'Langue'], ['Hourglass', 'En attente'],
  ['External', 'External'],
];

export function renderAll(): string {
  const entries: Array<[string, React.ComponentType<any>]> = [];
  for (const [key, label] of ORDER) {
    const cmp = (I as any)[`Ayrovi${key}`];
    if (typeof cmp === 'function' || (typeof cmp === 'object' && cmp !== null)) {
      entries.push([label, cmp as React.ComponentType<any>]);
    }
  }
  const CELL = 118;
  const COLS = 8;
  const ROWS = Math.ceil(entries.length / COLS);
  const W = COLS * CELL + 24;
  const H = ROWS * CELL + 64;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter,Helvetica,Arial,sans-serif">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="16" y="28" font-size="17" font-weight="800" fill="#111">AYROVI Icon System — famille compacte (${entries.length} icônes)</text>`,
    `<text x="16" y="48" font-size="11" fill="#666">monoline 1.5 · grille 24 · coins arrondis · currentColor · point signature #FF6A00</text>`,
  ];
  entries.forEach(([label, Cmp], i) => {
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    const x = 12 + c * CELL + (CELL - 84) / 2;
    const y = 60 + r * CELL + 8;
    parts.push(`<g transform="translate(${x},${y}) scale(3.5)">${renderToStaticMarkup(React.createElement(Cmp, { size: 24 }))}</g>`);
    parts.push(`<text x="${12 + c * CELL + CELL / 2}" y="${60 + r * CELL + CELL - 10}" font-size="10" fill="#555" text-anchor="middle">${label}</text>`);
  });
  parts.push('</svg>');
  return parts.join('\n');
}
