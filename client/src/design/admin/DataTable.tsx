/**
 * DataTable — primitive du design system AYROVI.
 *
 * Primitive d'interface du back office, déplacée telle quelle depuis client/src/admin/components.tsx
 * (P3/T2) : le moteur ne définit plus ses propres composants, il les réexporte depuis la couche
 * client/src/design/. Markup et classes inchangés — le style reste dans admin/admin.css, la couche
 * d'application unique sans aucun littéral de couleur.
 */
import React, { useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Grip, AlertCircle, Loader2, RefreshCw } from '../../components/QatafoIcons';
import { Button } from './Button';
import { TableCell } from './TableCell';

/**
 * La table du back office — un seul composant pour toutes les listes.
 *
 * P2.0 ne crée pas une seconde table : il généralise `DataTable` (23 appels existants) avec des
 * capacités optionnelles, pour que les listes écrites à la main `<table className="admin-table">`
 * (8 dans les écrans admin + 1 dans `ArrivalIngestionPage`, fichier gelé) puissent migrer, et que
 * toute ressource du framework obtienne gratuitement tri, sélection, actions groupées, états
 * d'erreur, réordonnancement et colonnes configurables. Tout est optionnel : les appels existants
 * rendent exactement le même markup qu'avant.
 */

export interface DataColumn<T> {
  key: string;
  /** Un nœud, pas seulement une chaîne : les en-têtes à icône existent déjà (studio stories). */
  label: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  className?: string;
  /** Tri côté serveur : le parent reçoit la colonne et le sens. */
  sortable?: boolean;
  align?: 'start' | 'end' | 'center';
  /** Colonne masquée par défaut, activable par l'appelant (le framework la connaît). */
  hidden?: boolean;
}


export interface TableRowAction<T> {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onRun: (row: T) => void;
  /** Permission refusée : le bouton reste visible mais inerte, avec le motif (jamais un 403 surprise). */
  disabled?: boolean | ((row: T) => boolean);
  reason?: string | ((row: T) => string);
  /** Action conditionnelle : « Publier » n'existe que sur un brouillon, etc. */
  show?: (row: T) => boolean;
  /** Bouton icône seul (le libellé reste le `title`/`aria-label`) — préserve les écrans denses. */
  hideLabel?: boolean;
  tone?: 'default' | 'danger';
}


export interface TableBulkAction<T> {
  key: string;
  label: string;
  onRun: (rows: T[]) => void;
  disabled?: boolean;
  reason?: string;
  tone?: 'default' | 'danger';
}


export function DataTable<T extends { id?: string }>({
  columns, rows, loading, emptyText = 'Aucune donnée disponible.', onRowClick,
  error, onRetry, emptyAction, selectable, selection, onSelectionChange, rowActions, bulkActions, sort, onSortChange, density, caption,
  rowKey, rowClassName, minWidth, reorder,
}: {
  columns: DataColumn<T>[]; rows: T[]; loading?: boolean; emptyText?: string; onRowClick?: (row: T) => void;
  error?: string; onRetry?: () => void; emptyAction?: React.ReactNode;
  /** Sélection multiple + actions groupées (uniquement quand le parent les déclare). */
  selectable?: boolean; selection?: string[]; onSelectionChange?: (ids: string[]) => void;
  rowActions?: TableRowAction<T>[]; bulkActions?: TableBulkAction<T>[];
  sort?: { key: string; direction: 'asc' | 'desc' }; onSortChange?: (key: string) => void;
  density?: 'comfortable' | 'compact'; caption?: string;
  /** Clé de ligne quand l'enregistrement n'a pas d'`id` (journaux, runs IA). */
  rowKey?: (row: T, index: number) => string;
  /** Classe par ligne (ex. ligne désactivée) — la table ne connaît pas le métier. */
  rowClassName?: (row: T) => string;
  /** Défilement horizontal des listes larges (social, stories). */
  minWidth?: number | string;
  /** Réordonnancement par glisser-déposer : la table déplace, le parent persiste l'ordre. */
  reorder?: { onReorder: (from: number, to: number) => void };
}) {
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const keyOf = (row: T, index: number) => rowKey ? rowKey(row, index) : String(row.id ?? index);
  const visibleColumns = columns.filter((column) => !column.hidden);
  const withActions: DataColumn<T>[] = [
    ...(reorder ? [{ key: '__drag', label: '', className: 'admin-table-cell--drag' } as DataColumn<T>] : []),
    ...visibleColumns,
    ...(rowActions && rowActions.length ? [{ key: '__actions', label: '', className: 'admin-table-cell--actions' } as DataColumn<T>] : []),
  ];
  const ids = rows.map((row) => String(row.id ?? '')).filter(Boolean);
  const selected = selection ?? [];
  const allSelected = selectable && ids.length > 0 && ids.every((id) => selected.includes(id));
  const toggleAll = () => onSelectionChange?.(allSelected ? [] : ids);
  const toggleOne = (id: string) => onSelectionChange?.(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  const colSpan = withActions.length + (selectable ? 1 : 0);
  const stateRow = (content: React.ReactNode) => <tr><td colSpan={colSpan}><div className="admin-table-state">{content}</div></td></tr>;

  return (
    <div className={`admin-table-wrap ${density === 'compact' ? 'is-compact' : ''}`.trim()} style={minWidth ? { overflowX: 'auto' } : undefined}>
      {bulkActions && bulkActions.length > 0 && selected.length > 0 && (
        <div className="admin-table-bulkbar" role="toolbar" aria-label="Actions groupées">
          <strong>{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</strong>
          {bulkActions.map((action) => (
            <Button key={action.key} type="button" variant={action.tone === 'danger' ? 'danger' : 'secondary'} disabled={action.disabled} title={action.disabled ? action.reason : undefined}
              onClick={() => action.onRun(rows.filter((row) => selected.includes(String(row.id ?? ''))))}>
              {action.label}
            </Button>
          ))}
          <button type="button" className="admin-table-bulkbar-clear" onClick={() => onSelectionChange?.([])}>Annuler</button>
        </div>
      )}
      <table className="admin-table" style={minWidth ? { minWidth } : undefined}>
        {caption && <caption className="admin-table-caption">{caption}</caption>}
        <thead>
          <tr>
            {selectable && <th scope="col" className="admin-table-cell--select"><input type="checkbox" checked={Boolean(allSelected)} onChange={toggleAll} aria-label="Tout sélectionner" /></th>}
            {withActions.map((column) => (
              <th key={column.key} scope="col" className={`${column.className ?? ''} ${column.align === 'end' ? 'is-end' : ''}`.trim()}
                aria-sort={column.sortable && onSortChange && sort?.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}>
                {column.sortable && onSortChange ? (
                  <button type="button" className="admin-table-sort" onClick={() => onSortChange(column.key)} data-active={sort?.key === column.key ? 'true' : undefined}>
                    {column.label}{sort?.key === column.key && <span aria-hidden>{sort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}</span>}
                  </button>
                ) : column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? stateRow(<><Loader2 className="admin-spin" /> Chargement…</>)
            : error ? stateRow(<>
              <AlertCircle /> <strong>{error}</strong>
              {onRetry && <Button type="button" variant="ghost" onClick={onRetry}><RefreshCw size={16} /> Réessayer</Button>}
            </>)
              : rows.length === 0 ? stateRow(<>{emptyText}{emptyAction}</>)
                : rows.map((row, index) => {
                  const id = keyOf(row, index);
                  const rowClass = `${onRowClick ? 'admin-table-row--clickable' : ''} ${rowClassName ? rowClassName(row) : ''} ${reorder && dragOver === index && dragFrom.current !== index ? 'is-drag-over' : ''}`.trim();
                  return (
                    <tr key={id} onClick={() => onRowClick?.(row)} className={rowClass || undefined}
                      {...(reorder ? {
                        draggable: true,
                        onDragStart: () => { dragFrom.current = index; },
                        onDragOver: (event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOver(index); },
                        onDragLeave: () => setDragOver((value) => (value === index ? null : value)),
                        onDrop: (event: React.DragEvent) => {
                          event.preventDefault();
                          const from = dragFrom.current;
                          dragFrom.current = null; setDragOver(null);
                          if (from !== null && from !== index) reorder.onReorder(from, index);
                        },
                        onDragEnd: () => { dragFrom.current = null; setDragOver(null); },
                      } : {})}>
                      {selectable && <td className="admin-table-cell--select" onClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" checked={selected.includes(String((row as any).id ?? ''))} onChange={() => toggleOne(String((row as any).id ?? ''))} aria-label={`Sélectionner ${id}`} />
                      </td>}
                      {withActions.map((column) => (
                        <TableCell key={column.key} className={column.className} align={column.align}>
                          {column.key === '__drag' ? <span className="admin-table-grip" title="Glisser pour réordonner" aria-hidden="true"><Grip size={16}/></span>
                            : column.key === '__actions' ? (
                            <div className="admin-row-actions">
                              {(rowActions ?? []).filter((action) => !action.show || action.show(row)).map((action) => {
                                const blocked = typeof action.disabled === 'function' ? action.disabled(row) : Boolean(action.disabled);
                                const reason = typeof action.reason === 'function' ? action.reason(row) : action.reason;
                                return (
                                  <button key={action.key} type="button" disabled={blocked} title={blocked ? reason : action.label}
                                    aria-label={action.label} className={`admin-table-action ${action.tone === 'danger' ? 'is-danger' : ''}`.trim()}
                                    onClick={(event) => { event.stopPropagation(); action.onRun(row); }}>
                                    {action.icon}{action.hideLabel ? null : action.label}
                                  </button>
                                );
                              })}
                            </div>
                          ) : column.render ? column.render(row) : String((row as any)[column.key] ?? '—')}
                        </TableCell>
                      ))}
                    </tr>
                  );
                })}
        </tbody>
      </table>
    </div>
  );
}
