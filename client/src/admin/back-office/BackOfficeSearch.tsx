/**
 * P2.0 — recherche globale et palette de commandes.
 *
 * Une seule abstraction pour les deux : la même liste de ressources permises sert à trouver un
 * enregistrement (recherche serveur, une requête groupée) et à atteindre un écran / déclencher une
 * action (palette, résolue depuis la navigation + les descripteurs). Aucun écran n'ajoute son
 * propre launcher, et aucune action n'apparaît si la permission la refuse.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search as SearchIcon, Sparkles } from '../../components/QatafoIcons';
import { runGlobalSearch, useBackOffice, type BackOfficeNavItem, type SearchHit } from './framework';

export interface PaletteEntry {
  key: string;
  label: string;
  hint: string;
  /** Navigation simple, ou action sur un écran (le deep-link reste la seule voie autorisée). */
  section: string;
  kind: 'écran' | 'ressource';
}

/** Entrées de la palette : uniquement ce que la navigation a rendu visible pour ce rôle. */
export function buildPaletteEntries(items: BackOfficeNavItem[]): PaletteEntry[] {
  return items.map((item) => ({
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
      placeholder="Rechercher un produit, une commande, un client…" aria-label="Recherche globale" />
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

/** Palette ⌘K : navigation + actions permises uniquement, au clavier, sans souris obligatoire. */
export const CommandPalette: React.FC<{ open: boolean; onClose: () => void; onNavigate: (section: string) => void }> = ({ open, onClose, onNavigate }) => {
  const { navigation, resources } = useBackOffice();
  const [term, setTerm] = useState('');
  const [cursor, setCursor] = useState(0);

  const items = useMemo(() => {
    const visible = (navigation?.groups ?? []).flatMap((group) => group.items);
    const entries: Array<PaletteEntry | { key: string; label: string; hint: string; section: string; kind: 'ressource' }> = buildPaletteEntries(visible);
    // Une ressource du framework ajoute « Créer » quand la capacité serveur le permet.
    for (const descriptor of resources.filter((item) => item.visible !== false)) {
      if (descriptor.capabilities?.create === false) continue;
      if (!descriptor.actions.includes('create')) continue;
      entries.push({ key: `create:${descriptor.key}`, label: `Créer un·e ${descriptor.singular}`, hint: descriptor.api.prefix || descriptor.module, section: descriptor.section, kind: 'ressource' });
    }
    const query = term.trim().toLowerCase();
    const filtered = query ? entries.filter((entry) => `${entry.label} ${entry.hint}`.toLowerCase().includes(query)) : entries;
    return filtered.slice(0, 12);
  }, [navigation, resources, term]);

  const run = useCallback((entry: PaletteEntry) => { onNavigate(entry.section); onClose(); }, [onNavigate, onClose]);

  useEffect(() => { if (open) { setTerm(''); setCursor(0); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); setCursor((value) => Math.min(value + 1, Math.max(items.length - 1, 0))); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((value) => Math.max(value - 1, 0)); return; }
      if (event.key === 'Enter' && items[cursor]) { event.preventDefault(); run(items[cursor]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, cursor, run, onClose]);

  if (!open) return null;
  return <div className="bo-palette-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="bo-palette" role="dialog" aria-modal="true" aria-label="Palette de commandes">
      <header><Sparkles size={17} /><input autoFocus value={term} onChange={(event) => { setTerm(event.target.value); setCursor(0); }} placeholder="Aller à… ou créer…" aria-label="Commande" /><kbd>esc</kbd></header>
      <ul>
        {items.length === 0 && <li className="bo-palette-empty">Aucune commande permise pour ce texte.</li>}
        {items.map((entry, index) => (
          <li key={entry.key}>
            <button type="button" data-active={index === cursor ? 'true' : undefined} onMouseEnter={() => setCursor(index)} onClick={() => run(entry)}>
              <span>{entry.label}</span><small>{entry.kind}</small><code>{entry.hint}</code>
            </button>
          </li>
        ))}
      </ul>
      <footer>{items.length} commande{items.length > 1 ? 's' : ''} · seules les actions autorisées apparaissent</footer>
    </div>
  </div>;
};
