/**
 * P2.0 — recherche globale et palette de commandes.
 *
 * La recherche trouve des enregistrements; le lanceur ouvre uniquement des écrans autorisés.
 * Une entrée ne se présente pas comme une création quand elle ne fait que naviguer.
 */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Search as SearchIcon, Sparkles } from '../../components/QatafoIcons';
import { OfficeLanguageContext, useOfficeText } from './OfficeLocale';
import { officeItemLabel } from './workspaces';
import { runGlobalSearch, useBackOffice, type BackOfficeNavItem, type SearchHit } from './framework';

export interface PaletteEntry {
  key: string;
  label: string;
  hint: string;
  section: string;
  kind: 'écran';
}

/** Entrées de la palette : uniquement ce que la navigation a rendu visible pour ce rôle. */
export function buildPaletteEntries(items: BackOfficeNavItem[]): PaletteEntry[] {
  return items.filter(item => item.permitted).map((item) => ({
    key: `screen:${item.section}`,
    label: item.label,
    hint: `${item.group} · ${item.moduleKey}`,
    section: item.section,
    kind: 'écran' as const,
  }));
}

function highlight(text: string, term: string) {
  if (!term) return text;
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + term.length)}</mark>{text.slice(index + term.length)}</>;
}

/** Champ de recherche de l'entête : 5 lignes par ressource permise, deep-link en résultat. */
export const GlobalSearch: React.FC<{ onNavigate: (section: string, target?: string) => void }> = ({ onNavigate }) => {
  const t = useOfficeText();
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    if (term.trim().length < 2) { setHits([]); setState('idle'); return; }
    setState('loading');
    const timer = window.setTimeout(() => {
      runGlobalSearch(term.trim())
        .then((result) => { if (!active) return; setHits(result.hits); setState('ready'); })
        .catch(() => { if (active) setState('error'); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [term]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const go = (hit: SearchHit) => { setOpen(false); setTerm(''); onNavigate(hit.section, hit.id); };
  const grouped = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const hit of hits) map.set(hit.label, [...(map.get(hit.label) ?? []), hit]);
    return [...map.entries()];
  }, [hits]);

  return <div className="bo-search" ref={boxRef}>
    <SearchIcon size={17} />
    <input value={term} onChange={(event) => { setTerm(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
      placeholder={t('Rechercher une commande, un produit, un client…', 'ابحث على طلب، منتج أو حريف…')} aria-label={t('Recherche globale', 'البحث العام')} />
    {open && term.trim().length >= 2 && (
      <div className="bo-search-panel" role="listbox" aria-label="Résultats de recherche">
        {state === 'loading' && <p className="bo-search-state">Recherche dans les ressources autorisées…</p>}
        {state === 'error' && <p className="bo-search-state">Recherche indisponible — réessayez.</p>}
        {state === 'ready' && grouped.length === 0 && <p className="bo-search-state">Aucun résultat pour « {term.trim()} ».</p>}
        {grouped.map(([label, items]) => (
          <section key={label}>
            <span>{label}</span>
            {items.map((hit) => (
              <button type="button" key={`${hit.resource}-${hit.id}`} onClick={() => go(hit)} role="option">
                <strong>{highlight(hit.title, term.trim())}</strong>
                {hit.code && <code>{hit.code}</code>}
                {hit.secondary && <small>{hit.secondary}</small>}
              </button>
            ))}
          </section>
        ))}
        <footer><kbd>⌘K</kbd> pour la palette de commandes</footer>
      </div>
    )}
  </div>;
};

/** Search and open a permitted page, with keyboard navigation scoped to the dialog. */
export const CommandPalette: React.FC<{ open: boolean; onClose: () => void; onNavigate: (section: string) => void }> = ({ open, onClose, onNavigate }) => {
  const { navigation } = useBackOffice();
  const lang = useContext(OfficeLanguageContext);
  const t = useOfficeText();
  const [term, setTerm] = useState('');
  const [cursor, setCursor] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const items = useMemo(() => {
    const normalized = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
    const visible = (navigation?.groups ?? []).flatMap((group) => group.items);
    const labels = new Map(visible.map(item => [item.section, officeItemLabel(item, lang)]));
    const entries = buildPaletteEntries(visible).map(entry => ({ ...entry, label: labels.get(entry.section) ?? entry.label }));
    const query = normalized(term.trim());
    return entries.filter(entry => normalized(`${entry.label} ${entry.hint} ${entry.section}`).includes(query)).slice(0, 12);
  }, [lang, navigation, term]);
  const run = (entry: PaletteEntry) => { onNavigate(entry.section); onClose(); };

  useEffect(() => {
    if (!open) return;
    setTerm(''); setCursor(0);
    const previous = document.activeElement;
    input.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [open]);
  useEffect(() => {
    if (open) dialog.current?.querySelector('[data-active=true]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, cursor]);
  if (!open) return null;
  return <div className="bo-palette-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div ref={dialog} className="bo-palette" role="dialog" aria-modal="true" aria-label={t('Palette de commandes', 'قائمة الاختصارات')} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
      if (event.key === 'Tab' && dialog.current) {
        const focusable = dialog.current.querySelectorAll<HTMLElement>('input,button');
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1]?.focus(); }
        else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0]?.focus(); }
      }
      if (event.target !== input.current) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(value => Math.min(value + 1, Math.max(items.length - 1, 0))); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(value => Math.max(value - 1, 0)); }
      if (event.key === 'Enter' && items[cursor]) { event.preventDefault(); run(items[cursor]); }
    }}>
      <header><Sparkles size={17} /><input ref={input} value={term} onChange={(event) => { setTerm(event.target.value); setCursor(0); }} placeholder={t('Rechercher un écran…', 'لوّج على شاشة…')} aria-label={t('Commande', 'الاختصار')} /><button type="button" className="office-palette-escape" onClick={onClose} aria-label={t('Fermer', 'سكّر')}><kbd>Esc</kbd></button></header>
      <ul>
        {items.length === 0 && <li className="bo-palette-empty">{t('Aucune commande permise pour ce texte.', 'ما فماش نتائج مسموحة للبحث هذا.')}</li>}
        {items.map((entry, index) => (
          <li key={entry.key}>
            <button type="button" data-active={index === cursor ? 'true' : undefined} onMouseEnter={() => setCursor(index)} onClick={() => run(entry)}>
              <span>{entry.label}</span><small>{t('Écran', 'شاشة')}</small><code>{entry.hint}</code>
            </button>
          </li>
        ))}
      </ul>
      <footer><span><kbd>↑</kbd> <kbd>↓</kbd> {t('Parcourir', 'تنقّل')}</span><span><kbd>↵</kbd> {t('Ouvrir', 'افتح')}</span></footer>
    </div>
  </div>;
};
