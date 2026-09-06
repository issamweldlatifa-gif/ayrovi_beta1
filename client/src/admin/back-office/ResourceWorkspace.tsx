/**
 * P2.0 — le rendu d'une ressource du framework (liste, colonnes, formulaire, détail, audit).
 *
 * C'est la pièce qui rend la promesse tangible : un module futur (Inventory, Purchasing, Finance…)
 * déclare un descripteur serveur et obtient, sans écrire de JSX, une liste triable/filtrable, un
 * formulaire validé, un workspace de détail et l'historique d'audit — avec les actions grisées et
 * justifiées par la matrice de permissions, jamais par un 403 surprise après clic.
 *
 * Aujourd'hui, aucun écran existant n'est déplacé ici : les 9 ressources du moteur gardent leur
 * `ContentPage` (mêmes libellés, mêmes colonnes) et les écrans métier gardent leurs composants.
 * `ResourceWorkspace` est le patron de référence, exercé par les tests, pas un écran de plus.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { FileText } from '../../components/QatafoIcons';
import { adminApi } from '../api';
import { Button, DataColumn, DataTable, Modal, Pagination, Search, Select, StatusBadge, Toast, type TableRowAction } from '../components';
import { formatDate, formatMoney, ResourceForm, type FieldDefinition } from './resource-ui';
import { RESOURCE_ACTION_LABELS, type ResourceDescriptor } from './framework';

/** Un seul endroit sait dessiner une cellule — les écrans ne réinventent plus le rendu. */
export function renderCell(kind: string | undefined, row: Record<string, any>, column: string): React.ReactNode {
  const raw = row[column];
  switch (kind) {
    case 'money': return <strong className="bo-cell-money">{formatMoney(raw)}</strong>;
    case 'datetime': return <time dateTime={raw ? String(raw) : undefined}>{formatDate(raw, true)}</time>;
    case 'code': return raw ? <code>{String(raw)}</code> : <span className="bo-cell-empty">—</span>;
    case 'number': return <span className="admin-cell-num">{raw === null || raw === undefined || raw === '' ? '—' : Number(raw).toLocaleString('fr-FR')}</span>;
    case 'status': return <StatusBadge status={String(raw ?? '')} />;
    case 'entity': {
      const image = row.image || row.main_image || row.logo || row.media_url;
      const subtitle = row.type || row.category || row.source_platform || row.media_type || '';
      // Structure canonique (`.admin-entity > span` porte la vignette 42×42) : identique à
      // celle des écrans du moteur, pour qu'une seule règle CSS habille toutes les listes.
      return <div className="admin-entity">
        <span>{image ? <img src={String(image)} alt="" /> : <i><FileText /></i>}</span>
        <div><strong>{String(raw || 'Sans titre')}</strong>{subtitle ? <small>{String(subtitle)}</small> : null}</div>
      </div>;
    }
    default: return raw === null || raw === undefined || raw === '' ? '—' : Array.isArray(raw) ? raw.join(', ') : String(raw);
  }
}

export function buildColumns(descriptor: ResourceDescriptor, options: { hidden?: string[] } = {}): DataColumn<Record<string, any>>[] {
  return descriptor.columns
    .filter((column) => !column.hiddenByDefault)
    .filter((column) => !(options.hidden ?? []).includes(column.key))
    .map((column) => ({
      key: column.key,
      label: column.label,
      sortable: Boolean(column.sortable),
      render: (row: Record<string, any>) => renderCell(column.render, row, column.key),
    }));
}

/** Le descripteur serveur nourrit directement le formulaire partagé (aucune copie de champs). */
export function fieldDefinitionsFor(descriptor: ResourceDescriptor): FieldDefinition[] {
  return descriptor.fields.map((field) => ({
    key: field.key, label: field.label, type: field.type, required: field.required, options: field.options, hint: field.hint, readonly: field.readonly,
    full: field.type === 'textarea' || field.type === 'list',
  }));
}

export const ResourceTableView: React.FC<{
  descriptor: ResourceDescriptor;
  rows: Record<string, any>[];
  loading?: boolean;
  error?: string;
  capabilities?: Record<string, boolean | null>;
  canWrite?: boolean;
  onEdit?: (row: Record<string, any>) => void;
  onArchive?: (row: Record<string, any>) => void;
  onRetry?: () => void;
  emptyAction?: React.ReactNode;
}> = ({ descriptor, rows, loading, error, capabilities, canWrite, onEdit, onArchive, onRetry, emptyAction }) => {
  const mayEdit = descriptor.actions.includes('edit') && capabilities?.edit !== false && (canWrite ?? true);
  const mayArchive = descriptor.actions.includes('delete') && capabilities?.delete !== false && (canWrite ?? true);
  const rowActions: TableRowAction<Record<string, any>>[] = [];
  // Une action refusée reste visible mais inerte, avec son motif : jamais un 403 après le clic.
  if (descriptor.actions.includes('edit')) rowActions.push({ key: 'edit', label: 'Modifier', disabled: !mayEdit, reason: 'Édition refusée pour ce rôle', onRun: (row) => onEdit?.(row) });
  if (descriptor.actions.includes('delete')) rowActions.push({ key: 'archive', label: 'Archiver', tone: 'danger', disabled: !mayArchive, reason: 'Archivage refusé pour ce rôle', onRun: (row) => onArchive?.(row) });
  return <DataTable
    columns={buildColumns(descriptor)} rows={rows} loading={loading} error={error} onRetry={onRetry}
    emptyText={`Aucun·e ${descriptor.singular} pour le moment.`} emptyAction={emptyAction}
    caption={`${descriptor.label} — ${descriptor.description}`}
    rowActions={rowActions.length ? rowActions : undefined}
    onRowClick={mayEdit ? onEdit : undefined}
  />;
};

/** Historique d'un enregistrement : le journal unifié, filtré, sans second lecteur d'audit. */
export const AuditTrailPanel: React.FC<{ resourceType: string; resourceId: string | null; module?: string }> = ({ resourceType, resourceId, module }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    if (!resourceId) { setRows([]); setState('ready'); return; }
    const params = new URLSearchParams({ resourceType, resourceId, pageSize: '20' });
    if (module) params.set('module', module);
    adminApi<any>(`/core/audit?${params}`)
      .then((result) => { if (active) { setRows(result.data ?? []); setState('ready'); } })
      .catch((reason: any) => { if (!active) return; setState(reason?.status === 403 ? 'denied' : 'error'); });
    return () => { active = false; };
  }, [resourceType, resourceId, module]);
  if (!resourceId) return <p className="bo-audit-empty">Sélectionnez un enregistrement pour voir son historique.</p>;
  if (state === 'loading') return <p className="bo-audit-empty">Lecture du journal…</p>;
  if (state === 'denied') return <p className="bo-audit-empty">Journal non consultable avec ce rôle.</p>;
  if (state === 'error') return <p className="bo-audit-empty">Journal indisponible.</p>;
  if (rows.length === 0) return <p className="bo-audit-empty">Aucune ligne d’audit pour cet enregistrement.</p>;
  return <ul className="bo-audit">
    {rows.map((row) => (
      <li key={row.id}>
        <time>{formatDate(row.created_at, true)}</time>
        <strong>{row.action}</strong>
        <span>{row.employee_label || row.user_name || 'Système'}</span>
        {row.changes?.length ? <ul className="bo-audit-changes">{row.changes.map((change: any) => <li key={change.field}><code>{change.field}</code> <s>{String(change.before ?? '—')}</s> → <b>{String(change.after ?? '—')}</b></li>)}</ul> : null}
      </li>
    ))}
  </ul>;
};

/**
 * La page complète, générée depuis le descripteur : recherche + filtre de statut + pagination +
 * formulaire + archive + journal. Elle ne connaît que `descriptor.api.prefix` et n'invente aucune
 * route : le préfixe est vérifié à l'enregistrement côté serveur (auto-test du framework).
 */
export const ResourceWorkspace: React.FC<{ descriptor: ResourceDescriptor; canWriteFallback?: boolean }> = ({ descriptor, canWriteFallback = false }) => {
  const prefix = descriptor.api.prefix;
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [auditOf, setAuditOf] = useState<Record<string, any> | null>(null);

  const load = useCallback(async (page = pagination.page) => {
    if (!prefix) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (status && descriptor.status) params.set(descriptor.status.field, status);
      if (sort) { params.set('sort', sort.key); params.set('direction', sort.direction); }
      const result = await adminApi<any>(`${prefix}?${params}`);
      setRows(result.data ?? []);
      setPagination(result.pagination ?? { page: 1, pageSize: 20, total: (result.data ?? []).length, totalPages: 1 });
    } catch (reason: any) {
      setError(reason?.status === 403 ? 'Permission refusée pour cette ressource.' : reason?.message || 'Liste indisponible.');
      setRows([]);
    } finally { setLoading(false); }
  }, [prefix, pagination.page, search, status, sort, descriptor.status]);

  const capabilities = descriptor.capabilities ?? {};
  const mayWrite = capabilities.create !== false && capabilities.edit !== false && (canWriteFallback || capabilities.create === true || capabilities.edit === true);

  const openCreate = () => { setEditing(null); setForm({}); setModal(true); };
  const openEdit = (row: Record<string, any>) => { setEditing(row); setForm({ ...row }); setModal(true); };
  const save = async () => {
    setBusy(true);
    try {
      const url = editing ? `${prefix}/${editing.id}` : prefix;
      await adminApi(url, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) });
      setModal(false);
      setToast({ message: `${descriptor.singular[0].toUpperCase()}${descriptor.singular.slice(1)} enregistré.`, tone: 'success' });
      await load();
    } catch (reason: any) {
      setToast({ message: reason?.message || 'Enregistrement refusé.', tone: 'error' });
    } finally { setBusy(false); }
  };
  const archive = async (row: Record<string, any>) => {
    setBusy(true);
    try {
      await adminApi(`${prefix}/${row.id}`, { method: 'DELETE' });
      setToast({ message: 'Archivé sans supprimer les références historiques.', tone: 'success' });
      await load();
    } catch (reason: any) {
      setToast({ message: reason?.message || 'Archivage refusé.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const statusValues = descriptor.status?.values ?? [];
  return <section className="admin-list-card bo-workspace">
    <header className="bo-workspace-header">
      <div>
        <span className="admin-eyebrow">{descriptor.module} · {descriptor.surface === 'framework' ? 'moteur de ressources' : 'écran métier'}</span>
        <h2>{descriptor.label}</h2>
        <p>{descriptor.description}</p>
      </div>
      {descriptor.actions.includes('create') && (mayWrite
        ? <Button type="button" onClick={openCreate}>{RESOURCE_ACTION_LABELS.create}</Button>
        : <Button type="button" disabled title="Créer n’est pas permis pour ce rôle">{RESOURCE_ACTION_LABELS.create}</Button>)}
    </header>
    <div className="admin-list-toolbar">
      <Search value={search} onChange={setSearch} />
      {statusValues.length > 0 && (
        <Select value={status} onChange={(event) => setStatus(event.target.value)}
          options={[{ value: '', label: 'Tous les statuts' }, ...statusValues.map((value) => ({ value, label: descriptor.statuses?.find((item) => item.value === value)?.label ?? value }))]} />
      )}
      <Button type="button" variant="ghost" onClick={() => setAuditOf(rows[0] ?? null)}>Journal du premier résultat</Button>
    </div>
    <ResourceTableView descriptor={descriptor} rows={rows} loading={loading} error={error} onRetry={() => void load()}
      capabilities={capabilities} canWrite={canWriteFallback} onEdit={openEdit} onArchive={archive} />
    <Pagination {...pagination} onChange={(page: number) => void load(page)} />
    <Modal open={modal} title={`${editing ? 'Modifier' : 'Créer'} ${descriptor.singular}`} onClose={() => setModal(false)} wide>
      <ResourceForm definition={{ fields: fieldDefinitionsFor(descriptor) }} value={form} onChange={setForm} onSubmit={save} busy={busy} />
    </Modal>
    <Modal open={Boolean(auditOf)} title={`Journal — ${auditOf?.id ?? ''}`} onClose={() => setAuditOf(null)} wide>
      <AuditTrailPanel resourceType={descriptor.audit.resourceType} resourceId={auditOf?.id ?? null} module={descriptor.audit.module} />
    </Modal>
    {toast && <Toast message={toast.message} tone={toast.tone} />}
  </section>;
};
