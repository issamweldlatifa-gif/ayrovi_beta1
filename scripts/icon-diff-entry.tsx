import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as OLD from '/tmp/old-icons/client/src/components/icons/ayrovi/catalog';
import * as NEW from '../client/src/components/icons/ayrovi/catalog';

const isCmp = (v: unknown) => typeof v === 'function' || (typeof v === 'object' && v !== null && '$$typeof' in v);
const pick = (ns: Record<string, unknown>) =>
  Object.entries(ns)
    .filter(([n, v]) => n.startsWith('Ayrovi') && isCmp(v))
    .filter(([n]) => !['AyroviSignature', 'AyroviSvg'].includes(n));

export function renderDiff(): string {
  const oldMap = new Map(pick(OLD as Record<string, unknown>).map(([n, v]) => [n, v as React.ComponentType<any>]));
  const newMap = new Map(pick(NEW as Record<string, unknown>).map(([n, v]) => [n, v as React.ComponentType<any>]));
  const names = [...new Set([...oldMap.keys(), ...newMap.keys()])].sort();

  const rows: string[] = [];
  let changed = 0, added = 0;
  for (const name of names) {
    const O = oldMap.get(name);
    const N = newMap.get(name);
    const oldMark = O ? renderToStaticMarkup(React.createElement(O, { size: 52 })) : '';
    const newMark = N ? renderToStaticMarkup(React.createElement(N, { size: 52 })) : '';
    const isChanged = O && N && oldMark !== newMark;
    const isNew = !O && N;
    if (!isChanged && !isNew) continue;
    if (isChanged) changed++; if (isNew) added++;
    const label = name.replace(/^Ayrovi/, '');
    rows.push(`<div class="row ${isChanged ? 'changed' : ''}">
  <div class="box"><span class="tag">قبل (git HEAD)</span>${O ? oldMark : '<span style="color:#9ca3af">—</span>'}</div>
  <div class="box"><span class="tag">بعد (الحالي)</span>${N ? newMark : ''}</div>
  <div class="name">${label}${isNew ? '<span class="badge">جديدة</span>' : isChanged ? '<span class="badge">تغيّرت</span>' : ''}</div>
</div>`);
  }
  rows.unshift(`<p style="font-size:13px;color:#374151;margin:0 0 14px"><strong>${changed}</strong> أيقونة تغيّرت · <strong>${added}</strong> أيقونة جديدة · باقي العائلة (≈${names.length - changed - added}) بدون تغيير عمداً (كانت مطابقة للوحات أصلاً).</p>`);
  return rows.join('\n');
}
