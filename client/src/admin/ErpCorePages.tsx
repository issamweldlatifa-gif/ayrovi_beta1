/**
 * AYROVI Administration — ERP Core screens (P1 foundation).
 *
 * Additive only: nothing here replaces an existing admin screen. The legacy
 * `Utilisateurs` page keeps managing login accounts (admin_users); these screens
 * add the ERP layer on top of it — employee identity, organization, the permission
 * model as data, the module registry and the unified event log. Every endpoint
 * lives under `/api/admin/core/*` and inherits the admin session, CSRF token and
 * legacy permission guards (no new auth mechanism).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, queryString } from './api';
import { Button, DataTable, Field, Filters, Form, Modal, Pagination, Search, Select, StatusBadge, Toast } from './components';

type ToastValue = { message: string; tone: 'success' | 'error' } | null;

const PageHeader: React.FC<{ title: string; description: string; action?: React.ReactNode }> = ({ title, description, action }) => (
  <div className="admin-page-header"><div><span className="admin-eyebrow">AYROVI ERP</span><h1>{title}</h1><p>{description}</p></div>{action}</div>
);
const CardTitle: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <header className="admin-card-title"><div><h3>{title}</h3><p>{subtitle}</p></div></header>
);

interface Employee {
  id: string;
  employeeCode: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string;
  email?: string | null;
  role?: string | null;
  status: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED';
  branchId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  managerEmployeeId?: string | null;
  branchName?: string | null;
  departmentName?: string | null;
  teamName?: string | null;
  managerName?: string | null;
  joinedAt?: string | null;
  leftAt?: string | null;
}

interface OrgUnit { id: string; code: string; name: string; city?: string; status?: string }
interface Organization { id: string; code: string; name: string; legal_name?: string; status?: string }
interface OrgTree { organizations: Organization[]; branches: OrgUnit[]; departments: OrgUnit[]; teams: OrgUnit[] }

const EMPLOYEE_STATUS = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'];
const options = (values: string[]) => values.map((value) => ({ value, label: value }));
const rowsOf = (value: any): any[] => (Array.isArray(value?.data) ? value.data : Array.isArray(value) ? value : []);

/** Small data hook: same shape as the other admin screens (data / error / loading / reload). */
function useAsync<T = any>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const run = useCallback(() => {
    let active = true;
    setLoading(true);
    loader()
      .then((value) => { if (!active) return; setData(value); setError(''); })
      .catch((e: any) => { if (active) setError(e?.message || 'Chargement impossible.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => run(), [run]);
  return { data, error, loading, reload: run };
}

/* ============================ Employés ============================ */

export const ErpEmployeesPage: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<ToastValue>(null);
  const [busy, setBusy] = useState(false);
  const tree = useAsync<OrgTree>(() => adminApi<any>('/core/organization').then((r) => r.data), []);
  const query = useMemo(() => queryString({ search, status, page, pageSize: 20 }), [search, status, page]);
  const list = useAsync<any>(() => adminApi<any>(`/core/employees?${query}`), [query]);
  const rows = rowsOf(list.data);
  const pagination = list.data?.pagination || { page: 1, total: rows.length, totalPages: 1 };

  const open = (employee: Employee) => {
    setEditing(employee);
    setForm({
      firstName: employee.firstName || '', lastName: employee.lastName || '', jobTitle: employee.jobTitle || '',
      status: employee.status || 'ACTIVE', branchId: employee.branchId || '', departmentId: employee.departmentId || '',
      teamId: employee.teamId || '', managerEmployeeId: employee.managerEmployeeId || '', joinedAt: String(employee.joinedAt || '').slice(0, 10),
    });
  };
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await adminApi(`/core/employees/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      list.reload();
      setEditing(null);
      setToast({ message: 'Fiche employé enregistrée — le compte de connexion reste inchangé.', tone: 'success' });
    } catch (e: any) { setToast({ message: e?.message || 'Enregistrement impossible.', tone: 'error' }); } finally { setBusy(false); }
  };

  return <>
    <PageHeader title="Employés" description="Identité ERP lisible (EMP-…), poste et rattachement. Elle complète le compte de connexion, elle ne le remplace jamais." />
    <Filters>
      <Search value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Code EMP-, nom, poste, email…" />
      <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} options={[{ value: '', label: 'Tous les statuts' }, ...options(EMPLOYEE_STATUS)]} />
    </Filters>
    {list.error && <p className="admin-block-small">{list.error}</p>}
    <section className="admin-list-card">
      <DataTable rows={rows} loading={list.loading} columns={[
        { key: 'employee_code', label: 'Code', render: (row: Employee) => <code>{row.employeeCode}</code> },
        { key: 'name', label: 'Employé', render: (row: Employee) => <div><strong>{row.fullName}</strong><small className="admin-block-small">{row.email || '—'}</small></div> },
        { key: 'job_title', label: 'Poste', render: (row: Employee) => row.jobTitle || '—' },
        { key: 'department', label: 'Département', render: (row: Employee) => row.departmentName || row.branchName || '—' },
        { key: 'manager', label: 'Manager', render: (row: Employee) => row.managerName || '—' },
        { key: 'status', label: 'Statut', render: (row: Employee) => <StatusBadge status={row.status} /> },
        { key: 'action', label: '', render: (row: Employee) => <Button variant="ghost" onClick={() => open(row)}>{canManage ? 'Fiche' : 'Consulter'}</Button> },
      ]} />
      <Pagination page={pagination.page} total={pagination.total} totalPages={pagination.totalPages} onChange={setPage} />
    </section>

    <Modal open={!!editing} title={editing ? `${editing.fullName} · ${editing.employeeCode}` : ''} onClose={() => setEditing(null)}>
      {editing && <Form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <p className="admin-block-small">Connexion&nbsp;: <strong>{editing.email || 'aucune'}</strong> · rôle {editing.role || '—'}. Email et mot de passe se gèrent dans « Utilisateurs ».</p>
        <div className="admin-form-row">
          <Field label="Prénom"><input value={form.firstName} disabled={!canManage} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></Field>
          <Field label="Nom"><input value={form.lastName} disabled={!canManage} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></Field>
        </div>
        <Field label="Poste" full><input value={form.jobTitle} disabled={!canManage} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} /></Field>
        <div className="admin-form-row">
          <Field label="Statut"><Select disabled={!canManage} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} options={options(EMPLOYEE_STATUS)} /></Field>
          <Field label="Arrivée"><input type="date" disabled={!canManage} value={form.joinedAt} onChange={(event) => setForm({ ...form, joinedAt: event.target.value })} /></Field>
        </div>
        <div className="admin-form-row">
          <Field label="Succursale"><Select disabled={!canManage} value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })} options={[{ value: '', label: '—' }, ...(tree.data?.branches || []).map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` }))]} /></Field>
          <Field label="Département"><Select disabled={!canManage} value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })} options={[{ value: '', label: '—' }, ...(tree.data?.departments || []).map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` }))]} /></Field>
        </div>
        <div className="admin-form-row">
          <Field label="Équipe"><Select disabled={!canManage} value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value })} options={[{ value: '', label: '—' }, ...(tree.data?.teams || []).map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` }))]} /></Field>
          <Field label="Manager"><Select disabled={!canManage} value={form.managerEmployeeId} onChange={(event) => setForm({ ...form, managerEmployeeId: event.target.value })} options={[{ value: '', label: '—' }, ...rows.filter((row) => row.id !== editing.id).map((row) => ({ value: row.id, label: `${row.employeeCode} · ${row.fullName}` }))]} /></Field>
        </div>
        {canManage && <Button type="submit" busy={busy}>Enregistrer la fiche</Button>}
      </Form>}
    </Modal>
    {toast && <Toast {...toast} />}
  </>;
};

/* ============================ Organisation ============================ */

export const ErpOrganizationPage: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const tree = useAsync<OrgTree>(() => adminApi<any>('/core/organization').then((r) => r.data), []);
  const [creating, setCreating] = useState<'branch' | 'department' | 'team' | null>(null);
  const [form, setForm] = useState({ name: '', city: '', branchId: '', departmentId: '' });
  const [toast, setToast] = useState<ToastValue>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!creating) return;
    setBusy(true);
    try {
      await adminApi('/core/organization/units', { method: 'POST', body: JSON.stringify({ kind: creating, ...form }) });
      tree.reload();
      setCreating(null);
      setForm({ name: '', city: '', branchId: '', departmentId: '' });
      setToast({ message: 'Entité créée.', tone: 'success' });
    } catch (e: any) { setToast({ message: e?.message || 'Création impossible.', tone: 'error' }); } finally { setBusy(false); }
  };

  const unitCard = (kind: 'branch' | 'department' | 'team', title: string, rows: OrgUnit[]) => (
    <section className="admin-card" key={kind}>
      <CardTitle title={title} subtitle={`${rows.length} entité(s)`} />
      <div className="admin-settings-list">
        {rows.length === 0 && <p className="admin-block-small">Aucune entité.</p>}
        {rows.map((row) => <div key={row.id} className="admin-cat-row"><span><strong>{row.name}</strong>
          <small className="admin-block-small"><code>{row.code}</code>{row.city ? ` · ${row.city}` : ''}</small></span><StatusBadge status={row.status || 'ACTIVE'} /></div>)}
        {canManage && <Button variant="secondary" onClick={() => setCreating(kind)}>Nouveau</Button>}
      </div>
    </section>
  );

  return <>
    <PageHeader title="Organisation" description="Organisation juridique, succursales, départements et équipes — base des portées de permission (all / organization / branch / department / team / own)." />
    {tree.error && <p className="admin-block-small">{tree.error}</p>}
    <div className="admin-report-grid">
      <section className="admin-card"><CardTitle title="Organisation" subtitle={tree.loading ? 'Chargement…' : `${tree.data?.organizations?.length || 0} enregistrée(s)`} />
        <div className="admin-settings-list">{(tree.data?.organizations || []).map((row) => <div key={row.id} className="admin-cat-row"><span><strong>{row.name}</strong>
          <small className="admin-block-small"><code>{row.code}</code>{row.legal_name ? ` · ${row.legal_name}` : ''}</small></span><StatusBadge status={row.status || 'ACTIVE'} /></div>)}</div>
      </section>
      {unitCard('branch', 'Succursales', tree.data?.branches || [])}
      {unitCard('department', 'Départements', tree.data?.departments || [])}
      {unitCard('team', 'Équipes', tree.data?.teams || [])}
    </div>
    <Modal open={!!creating} title={creating === 'branch' ? 'Nouvelle succursale' : creating === 'department' ? 'Nouveau département' : 'Nouvelle équipe'} onClose={() => setCreating(null)}>
      <Form onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <Field label="Nom" required full><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
        {creating === 'branch' && <Field label="Ville" full><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></Field>}
        {creating === 'department' && <Field label="Succursale" full><Select value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })} options={[{ value: '', label: 'Rattachée à l’organisation' }, ...(tree.data?.branches || []).map((row) => ({ value: row.id, label: row.name }))]} /></Field>}
        {creating === 'team' && <Field label="Département" full><Select value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })} options={[{ value: '', label: 'Sans département' }, ...(tree.data?.departments || []).map((row) => ({ value: row.id, label: row.name }))]} /></Field>}
        <p className="admin-block-small">Le code ({creating === 'branch' ? 'BRC' : creating === 'department' ? 'DEP' : 'TMB'}) vient de la séquence partagée, jamais d’une saisie libre.</p>
        <Button type="submit" busy={busy}>Créer</Button>
      </Form>
    </Modal>
    {toast && <Toast {...toast} />}
  </>;
};

/* ============================ Permissions ============================ */

interface PermissionPayload {
  role: string;
  legacyPermissions: string[];
  grants: { id: string; module: string; action: string; resourceType: string; scope: string; granted: boolean; origin: string; moduleLabel: string }[];
  effective: { legacy: string; allowed: boolean; module: string; action: string; scope: string; origin: string }[];
}

export const ErpPermissionsPage: React.FC<{ canManage: boolean; role: string }> = ({ canManage, role }) => {
  const [probe, setProbe] = useState({ module: 'catalog', action: 'delete', resourceType: 'product' });
  const [decision, setDecision] = useState<any>(null);
  const [toast, setToast] = useState<ToastValue>(null);
  const [busy, setBusy] = useState(false);
  const me = useAsync<PermissionPayload>(() => adminApi<any>('/core/permissions/me').then((r) => r.data), []);
  const payload = me.data;

  const test = async () => {
    setBusy(true);
    try { setDecision((await adminApi<any>('/core/permissions/check', { method: 'POST', body: JSON.stringify(probe) })).data); }
    catch (e: any) { setToast({ message: e?.message || 'Test impossible.', tone: 'error' }); } finally { setBusy(false); }
  };
  const reseed = async () => {
    setBusy(true);
    try {
      const result = await adminApi<any>('/core/permissions/seed', { method: 'POST', body: JSON.stringify({}) });
      me.reload();
      setToast({ message: `Miroir régénéré (${result?.data?.inserted ?? 0} droit(s) ajouté(s)).`, tone: 'success' });
    } catch (e: any) { setToast({ message: e?.message || 'Reseed impossible.', tone: 'error' }); } finally { setBusy(false); }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionPayload['grants']>();
    for (const grant of payload?.grants || []) map.set(grant.module, [...(map.get(grant.module) || []), grant]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [payload]);

  return <>
    <PageHeader title="Rôles & permissions" description={`Modèle module:action:resource:scope stocké en table. Le rôle hérité (${payload?.role || role}) reste la référence : aucune ligne ERP ne peut le réduire.`}
      action={canManage ? <Button variant="secondary" busy={busy} onClick={reseed}>Régénérer le miroir</Button> : undefined} />
    <div className="admin-report-grid">
      <section className="admin-card"><CardTitle title="Décision héritée" subtitle="Ce que le rôle peut déjà faire aujourd’hui" />
        <div className="admin-settings-list">{(payload?.legacyPermissions || []).map((permission) => <div key={permission} className="admin-cat-row"><span><code>{permission}</code></span><StatusBadge status="ACTIVE" /></div>)}</div>
      </section>
      <section className="admin-card"><CardTitle title="Tester une permission" subtitle="Lecture seule — n’enregistre aucune décision" />
        <div className="admin-form-row">
          <Field label="Module"><input value={probe.module} onChange={(event) => setProbe({ ...probe, module: event.target.value })} /></Field>
          <Field label="Action"><Select value={probe.action} onChange={(event) => setProbe({ ...probe, action: event.target.value })} options={options(['read', 'write', 'create', 'update', 'delete', 'approve', 'export', 'assign', 'manage'])} /></Field>
        </div>
        <Field label="Ressource" full><input value={probe.resourceType} onChange={(event) => setProbe({ ...probe, resourceType: event.target.value })} placeholder="product, order, invoice…" /></Field>
        <Button busy={busy} onClick={test}>Tester</Button>
        {decision && <p className="admin-block-small"><StatusBadge status={decision.allowed ? 'ACTIVE' : 'INACTIVE'} />{' '}
          <code>{decision.allowed ? 'AUTORISÉ' : 'REFUSÉ'}</code> · raison&nbsp;: {decision.reason} · portée&nbsp;: {decision.scope}</p>}
      </section>
    </div>
    <section className="admin-card"><CardTitle title="Droits stockés en table" subtitle={`${payload?.grants?.length || 0} ligne(s) — origin SEED = miroir du rôle`} />
      <div className="admin-settings-list">
        {grouped.length === 0 && <p className="admin-block-small">Aucune ligne&nbsp;: le moteur n’est pas encore amorcé.</p>}
        {grouped.map(([moduleKey, grants]) => <div key={moduleKey} className="admin-cat-row"><span><strong>{grants[0]?.moduleLabel || moduleKey}</strong>
          <small className="admin-block-small">{grants.map((grant) => `${grant.action}${grant.resourceType !== '*' ? `:${grant.resourceType}` : ''}${grant.scope !== 'all' ? `@${grant.scope}` : ''}${grant.granted ? '' : ' ✕'}`).join(' · ')}</small></span>
          <StatusBadge status={grants.every((grant) => grant.granted) ? 'ACTIVE' : 'INACTIVE'} /></div>)}
      </div>
    </section>
    <section className="admin-card"><CardTitle title="Portée effective" subtitle="Hérité + table, calculé à la demande" />
      <DataTable rows={payload?.effective || []} columns={[
        { key: 'legacy', label: 'module:action' },
        { key: 'module', label: 'Module' },
        { key: 'action', label: 'Action' },
        { key: 'scope', label: 'Portée' },
        { key: 'origin', label: 'Origine', render: (row: any) => <code>{row.origin}</code> },
        { key: 'allowed', label: 'Autorisé', render: (row: any) => <StatusBadge status={row.allowed ? 'ACTIVE' : 'INACTIVE'} /> },
      ]} />
    </section>
    {toast && <Toast {...toast} />}
  </>;
};

/* ============================ Modules & environnement ============================ */

interface RegistrySection { section: string; modules: { key: string; label: string; status: string; basePermission: string; adminSection: string | null; description: string }[] }

export const ErpEnvironmentPage: React.FC = () => {
  const registry = useAsync<RegistrySection[]>(() => adminApi<any>('/core/modules').then((r) => r.data?.sections || []), []);
  const environment = useAsync<any>(() => adminApi<any>('/core/environment').then((r) => r.data), []);
  const selfTest = useAsync<any>(() => adminApi<any>('/core/environment/self-test').then((r) => r.data), []);
  const [total, setTotal] = useState(0);
  useEffect(() => { adminApi<any>('/core/modules').then((r) => setTotal(r.data?.total || 0)).catch(() => setTotal(0)); }, []);
  const env = environment.data;

  return <>
    <PageHeader title="Modules & environnement" description="Registre des modules (actif / hérité / planifié), politique de stockage des fichiers, auto-test de sécurité et séquences de numérotation." />
    {registry.error && <p className="admin-block-small">{registry.error}</p>}
    <div className="admin-report-grid">
      <section className="admin-card"><CardTitle title="Registre des modules" subtitle={`${total} module(s) déclarés`} />
        <div className="admin-settings-list">{(registry.data || []).map((group) => <div key={group.section}>
          <p className="admin-block-small"><strong>{group.section}</strong></p>
          {group.modules.map((module) => <div key={module.key} className="admin-cat-row"><span><strong>{module.label}</strong>
            <small className="admin-block-small">{module.description || '—'}{module.adminSection ? ` · écran : ${module.adminSection}` : ''} · {module.basePermission}</small></span>
            <StatusBadge status={module.status === 'active' ? 'ACTIVE' : module.status === 'planned' ? 'PENDING' : 'INACTIVE'} /></div>)}
        </div>)}</div>
      </section>
      <section className="admin-card"><CardTitle title="Stockage des fichiers" subtitle="Médias publics vs documents privés" />
        <div className="admin-settings-list">
          <div className="admin-cat-row"><span><strong>Public</strong><small className="admin-block-small">{env?.publicUploads?.root || '—'} · {(env?.policy?.publicSubDirectories || []).join(', ') || '—'}</small></span><StatusBadge status="ACTIVE" /></div>
          <div className="admin-cat-row"><span><strong>Privé</strong><small className="admin-block-small">{env?.privateDocumentsRoot || '—'} · {(env?.policy?.privateSubDirectories || []).join(', ')}</small></span><StatusBadge status="PENDING" /></div>
          <p className="admin-block-small">{env?.policy?.directPrivateUrlAccess || ''}</p>
          {(selfTest.data?.probes || []).map((probe: any) => <div key={probe.path} className="admin-cat-row"><span><code>{probe.path}</code></span>
            <StatusBadge status={probe.private ? 'PENDING' : 'ACTIVE'} /></div>)}
          <p className="admin-block-small">{selfTest.data?.allPrivateBlocked ? 'Auto-test OK : aucun chemin privé n’est publiquement servi.' : 'Auto-test en attente.'}</p>
        </div>
      </section>
      <section className="admin-card"><CardTitle title="Capacités optionnelles" subtitle="Lisibles par l’administration uniquement" />
        <div className="admin-settings-list">{Object.entries(env?.readiness || {}).map(([key, value]) => <div key={key} className="admin-cat-row"><span>{key}</span><strong>{String(value)}</strong></div>)}</div>
      </section>
      <SequencesCard />
    </div>
  </>;
};

const SequencesCard: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [preview, setPreview] = useState<Record<string, string>>({});
  const load = useCallback(() => { adminApi<any>('/core/sequences').then((r) => setRows(r.data || [])).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  const show = async (key: string) => {
    try {
      const result = await adminApi<any>('/core/sequences/preview', { method: 'POST', body: JSON.stringify({ key }) });
      setPreview((current) => ({ ...current, [key]: result.data.next }));
    } catch { /* lecture seule : un aperçu raté ne bloque pas l’écran */ }
  };
  return <section className="admin-card"><CardTitle title="Séquences de numérotation" subtitle="Un compteur par objet — l’aperçu ne consomme aucun numéro" />
    <DataTable rows={rows} columns={[
      { key: 'sequence_key', label: 'Clé', render: (row: any) => <code>{row.sequence_key}</code> },
      { key: 'prefix', label: 'Préfixe' },
      { key: 'next_value', label: 'Prochain rang' },
      { key: 'preview', label: 'Aperçu', render: (row: any) => <code>{preview[row.sequence_key] || '—'}</code> },
      { key: 'action', label: '', render: (row: any) => <Button variant="ghost" onClick={() => void show(row.sequence_key)}>Aperçu</Button> },
    ]} />
  </section>;
};

/* ============================ Journal d’audit unifié ============================ */

interface AuditRow {
  id: string; created_at: string; action: string; module: string; user_name: string; entity_id: string | null;
  employee_code?: string | null; resource_type?: string | null; resource_id?: string | null; request_id?: string | null;
  session_id?: string | null; user_agent?: string | null; changed_fields?: string[];
  old_value?: any; new_value?: any; ip_address?: string | null;
  changes?: { field_name: string; old_value: string | null; new_value: string | null; value_kind: string }[];
}

export const ErpAuditPage: React.FC = () => {
  const [filters, setFilters] = useState({ module: '', employeeCode: '', action: '', resourceType: '', resourceId: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState('');
  const [coverage, setCoverage] = useState<any>(null);
  const query = useMemo(() => queryString({ ...filters, page, pageSize: 30 }), [filters, page]);
  const list = useAsync<any>(() => adminApi<any>(`/core/audit?${query}`), [query]);
  useEffect(() => { adminApi<any>('/core/audit/coverage?days=30').then((r) => setCoverage(r.data)).catch(() => setCoverage(null)); }, [query]);
  const rows: AuditRow[] = rowsOf(list.data);
  const pagination = list.data?.pagination || { page: 1, total: rows.length, totalPages: 1 };
  const set = (patch: Record<string, string>) => { setFilters((current) => ({ ...current, ...patch })); setPage(1); };

  return <>
    <PageHeader title="Journal d’audit (ERP)" description="Un seul système pour le back-office et le CRM : qui (employé), quoi (action), quand, où (écran), sur quel enregistrement, avant/après champ par champ, IP, session et user-agent." />
    <Filters>
      <Search value={filters.employeeCode} onChange={(value) => set({ employeeCode: value })} placeholder="Code EMP-…" />
      <Search value={filters.module} onChange={(value) => set({ module: value })} placeholder="Module (SOCIAL_REELS, TRUST_BAR…)" />
      <Search value={filters.resourceId} onChange={(value) => set({ resourceId: value })} placeholder="Identifiant de la ressource" />
      <input type="date" value={filters.from} onChange={(event) => set({ from: event.target.value })} aria-label="Du" />
      <input type="date" value={filters.to} onChange={(event) => set({ to: event.target.value })} aria-label="Au" />
    </Filters>
    {coverage && <p className="admin-block-small">30 derniers jours&nbsp;: <strong>{coverage.total ?? 0}</strong> écriture(s) auditée(s) ·
      {' '}<strong>{coverage.withEmployee ?? 0}</strong> avec identité employé · <strong>{coverage.withRequestId ?? 0}</strong> avec request-id ·
      {' '}{(coverage.byModule || []).length} module(s) · {coverage.denials ?? 0} refus enregistré(s) · {coverage.fieldLevelRows ?? 0} diff(s) champ par champ</p>}
    {list.error && <p className="admin-block-small">{list.error}</p>}
    <section className="admin-list-card">
      <DataTable rows={rows} loading={list.loading} onRowClick={(row: AuditRow) => setExpanded(row.id === expanded ? '' : row.id)} columns={[
        { key: 'created_at', label: 'Date', render: (row: AuditRow) => new Date(String(row.created_at)).toLocaleString('fr-TN') },
        { key: 'actor', label: 'Acteur', render: (row: AuditRow) => <div><strong>{row.user_name}</strong>
          <small className="admin-block-small">{row.employee_code ? <code>{row.employee_code}</code> : 'compte sans fiche employé'}</small></div> },
        { key: 'action', label: 'Action', render: (row: AuditRow) => <StatusBadge status={row.action} /> },
        { key: 'module', label: 'Module', render: (row: AuditRow) => <div>{row.module}<small className="admin-block-small">{row.resource_type || '—'}</small></div> },
        { key: 'target', label: 'Cible', render: (row: AuditRow) => <code>{row.resource_id || row.entity_id || '—'}</code> },
        { key: 'fields', label: 'Champs modifiés', render: (row: AuditRow) => <small className="admin-block-small">{(row.changed_fields || []).slice(0, 6).join(', ') || '—'}</small> },
        { key: 'trace', label: 'Trace', render: (row: AuditRow) => <small className="admin-block-small">{row.request_id ? `req ${String(row.request_id).slice(0, 8)}` : 'sans request-id'}{row.ip_address ? ` · ${row.ip_address}` : ''}</small> },
      ]} />
      <Pagination page={pagination.page} total={pagination.total} totalPages={pagination.totalPages} onChange={setPage} />
    </section>
    {expanded && (() => {
      const row = rows.find((entry) => entry.id === expanded);
      if (!row) return null;
      return <section className="admin-card"><CardTitle title="Détail de l’écriture" subtitle={`${row.module} · ${row.action} · ${row.resource_type || 'ressource'}${row.resource_id ? ` · ${row.resource_id}` : ''}`} />
        <div className="admin-settings-list">
          <div className="admin-cat-row"><span><strong>Session</strong><small className="admin-block-small">{row.session_id || '—'} · agent&nbsp;: {row.user_agent || '—'}</small></span><code>{row.request_id || '—'}</code></div>
          {(row.changes || []).length === 0 && <p className="admin-block-small">Aucun diff champ par champ (création, suppression ou écriture antérieure à P1).</p>}
          {(row.changes || []).map((change, index) => <div key={`${change.field_name}-${index}`} className="admin-cat-row">
            <span><strong>{change.field_name}</strong><small className="admin-block-small">{change.value_kind}</small></span>
            <span><small className="admin-block-small">{change.old_value ?? '∅'}</small> → <strong>{change.new_value ?? '∅'}</strong></span>
          </div>)}
        </div>
      </section>;
    })()}
  </>;
};

/* ============================ Événements ============================ */

export const ErpEventsPage: React.FC = () => {
  const [moduleKey, setModuleKey] = useState('');
  const query = useMemo(() => queryString({ limit: 50, module: moduleKey }), [moduleKey]);
  const events = useAsync<any>(() => adminApi<any>(`/core/events?${query}`), [query]);
  return <>
    <PageHeader title="Événements" description="Événements de domaine dérivés de chaque écriture auditée — la base des notifications, automatisations et réconciliations à venir." />
    <Filters><Search value={moduleKey} onChange={setModuleKey} placeholder="Filtrer par module (catalog, sales, crm…)" /></Filters>
    <section className="admin-list-card"><DataTable rows={rowsOf(events.data)} loading={events.loading} columns={[
      { key: 'created_at', label: 'Date', render: (row: any) => new Date(String(row.created_at)).toLocaleString('fr-TN') },
      { key: 'event_name', label: 'Événement', render: (row: any) => <code>{row.event_name}</code> },
      { key: 'module_key', label: 'Module' },
      { key: 'resource_type', label: 'Ressource', render: (row: any) => `${row.resource_type || '—'}${row.resource_id ? ` · ${String(row.resource_id).slice(0, 8)}…` : ''}` },
      { key: 'payload', label: 'Charge', render: (row: any) => <small className="admin-block-small">{String(row.payload || '').slice(0, 160)}</small> },
    ]} /></section>
  </>;
};
