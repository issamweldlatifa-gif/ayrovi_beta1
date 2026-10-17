import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as C from '../client/src/components/icons/zayrovi/catalog';

export function renderSheet(): string {
  const entries = Object.entries(C)
    .filter(([name, v]) => name.startsWith('Zayrovi') && (typeof v === 'function' || (typeof v === 'object' && v !== null && '$$typeof' in v)))
    .filter(([name]) => !['ZayroviSignature', 'ZayroviSvg'].includes(name))
    .sort(([a], [b]) => a.localeCompare(b));

  const cards = entries.map(([name, Cmp]) => {
    const label = (name as string).replace(/^Zayrovi/, '');
    return `<div class="card">${renderToStaticMarkup(React.createElement(Cmp as React.ComponentType<any>, { size: 56 }))}<span>${label}</span></div>`;
  });
  return `<div class="grid">${cards.join('\n')}</div>`;
}
