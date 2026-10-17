import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ZayroviTrash, ZayroviSettings, ZayroviWallet, ZayroviPie, ZayroviHeadset,
  ZayroviMessage, ZayroviArabe, ZayroviPinArc, ZayroviBagFace, ZayroviShieldUser,
} from '../client/src/components/icons/zayrovi/catalog';

export function renderAll(): string {
  const icons: Array<[string, React.ComponentType<any>]> = [
    ['Supprimer', ZayroviTrash],
    ['Paramètres', ZayroviSettings],
    ['Portefeuille', ZayroviWallet],
    ['Rapports', ZayroviPie],
    ['Support', ZayroviHeadset],
    ['Message', ZayroviMessage],
    ['Arabe', ZayroviArabe],
    ['Localisation', ZayroviPinArc],
    ['Shopping 26', ZayroviBagFace],
    ['Confidentialité 20', ZayroviShieldUser],
  ];
  const cell = 120;
  const cols = 5;
  const rows = Math.ceil(icons.length / cols);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols*cell}" height="${rows*cell}" viewBox="0 0 ${cols*cell} ${rows*cell}">`;
  out += `<rect width="100%" height="100%" fill="white"/>`;
  icons.forEach(([label, Cmp], i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const x = c * cell + 16, y = r * cell + 14;
    const inner = renderToStaticMarkup(React.createElement(Cmp, { size: 88 }))
      .replace('<svg', `<svg x="${x}" y="${y}"`);
    out += inner;
    out += `<text x="${c*cell + cell/2}" y="${r*cell + cell - 8}" font-size="13" font-family="sans-serif" text-anchor="middle" fill="#333">${label}</text>`;
  });
  out += '</svg>';
  return out;
}
