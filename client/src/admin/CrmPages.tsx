/**
 * AYROVI CRM 360 (E5) — écrans du module relationnel.
 *
 * Mêmes règles que les autres écrans métier du back office :
 *  • les listes sont dessinées par `DataTable` (jamais de table écrite à la main) ;
 *  • les droits viennent de `/crm/meta` — donc de `can()` sur `erp_role_permissions` :
 *    une action refusée reste visible mais inerte (jamais un 403 après le clic) ;
 *  • aucun état n'est inventé : les libellés restent ceux du registre serveur.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus, Trash2 } from '../components/QatafoIcons';
import { adminApi } from './api';
import {
  Button, DataTable, Field, MetricStrip, Modal, PageHeader, Pagination, Search, Select, Toast,
  type TableRowAction,
} from './components';
import { formatDate } from './back-office/resource-ui';

type Page = { page: number; pageSize: number; total: number; totalPages: number };
type Envelope<T> = { success: boolean; data: T; pagination?: Page };
type Row = Record<string, any>;

const EMPTY_PAGE: Page = { page: 1, pageSize: 20, total: 0, totalPages: 1 };

const LABELS: Record<string, string> = {
  ACTIVE: 'Actif', INACTIVE: 'Inactif', ARCHIVED: 'Archivé',
  OPEN: 'Ouvert', IN_PROGRESS: 'En cours', WAITING: 'En attente',
  COMPLETED: 'Terminé', CANCELLED: 'Annulé', RESOLVED: 'Résolu', CLOSED: 'Clôturé',
  LOW: 'Basse', NORMAL: 'Normale', HIGH: 'Haute', URGENT: 'Urgente',
  INDIVIDUAL: 'Individu', COMPANY: 'Entreprise', CUSTOMER: 'Client', PARTNER: 'Partenaire',
  SUPPLIER: 'Fournisseur', PROSPECT: 'Prospect', OTHER: 'Autre',
  CALL: 'Appel', MEETING: 'Rendez-vous', EMAIL: 'E-mail', MESSAGE: 'Message', VISIT: 'Visite',
  FOLLOW_UP: 'Suivi', INTERNAL: 'Interne',
};

const label = (value: unknown) => String(LABELS[String(value ?? '')] ?? String(value ?? '—'));
const yesNo = (value: unknown) => (Number(value) ? 'Oui' : 'Non');

/** Pastille locale de statut CRM — mêmes classes que la primitive, ton dérivé localement. */
const Chip: React.FC<{ value?: string | null; label?: string }> = ({ value, label: forced }) => {
  const normalized = String(value ?? '').toUpperCase();
  const text = forced || LABELS[normalized] || normalized;
  const tone = ['COMPLETED', 'ACTIVE', 'RESOLVED', 'CLOSED'].includes(normalized) ? 'success'
    : ['CANCELLED', 'ARCHIVED', 'OVERDUE', 'HIGH', 'URGENT'].includes(normalized) ? 'danger'
      : ['WAITING', 'IN_PROGRESS', 'OPEN', 'FOLLOW_UP'].includes(normalized) ? 'warning' : 'neutral';
  return <span className={`status-badge status-badge--${tone}`}>{text}</span>;
};

type CrmStatuses = {
  partyTypes: string[]; partyKinds: string[]; partyStatuses: string[]; partySources: string[];
  contactStatuses: string[]; activityKinds: string[]; activityStatuses: string[];
  taskStatuses: string[]; taskPriorities: string[]; issueStatuses: string[]; issuePriorities: string[];
};
type CrmMeta = { capabilities: Record<string, Record<string, boolean>>; statuses: CrmStatuses };

/** Les capacités réelles du rôle appelant (décidées côté serveur par can()). */
function useCrmMeta() {
  const [meta, setMeta] = useState<CrmMeta | null>(null);
  useEffect(() => {
    let active = true;
    adminApi<Envelope<CrmMeta>>('/crm/meta')
      .then((result) => { if (active) setMeta(result.data); })
      .catch(() => { /* sans méta l'écran reste lisible, les écritures échouent proprement */ });
    return () => { active = false; };
  }, []);
  const may = useCallback((resource: string, action: string) => Boolean(meta?.capabilities?.[resource]?.[action]), [meta]);
  return { meta, may };
}

const CrmHeader: React.FC<{ title: string; description: string; action?: React.ReactNode }> =
  (props) => <PageHeader {...props} eyebrow="AYROVI CRM 360" />;

/** Recherche une fiche CRM par nom ou référence puis enregistre son identifiant réel. */
const PartyPicker: React.FC<{ value: string; onChange: (partyId: string) => void; required?: boolean }> = ({ value, onChange, required }) => {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Row[]>([]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: '1', pageSize: '12' });
      if (query.trim()) params.set('search', query.trim());
      adminApi<Envelope<Row[]>>(`/crm/parties?${params}`)
        .then((result) => { if (active) setOptions(result.data ?? []); })
        .catch(() => { if (active) setOptions([]); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  const labelFor = (party: Row) => `${party.party_code} — ${party.name}`;

  return (
    <>
      <input
        list="crm-party-picker-options"
        required={required}
        value={query}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          const selected = options.find((party) => labelFor(party) === next);
          if (selected) onChange(String(selected.id));
        }}
        placeholder={value ? 'Fiche sélectionnée — recherchez pour remplacer' : 'Rechercher par nom ou code client…'}
        aria-label="Rechercher une fiche CRM"
      />
      <datalist id="crm-party-picker-options">
        {options.map((party) => <option key={party.id} value={labelFor(party)} />)}
      </datalist>
      {value && <small className="admin-field__hint">Fiche liée.</small>}
    </>
  );
};

/* ============================================================ */
/* Tableau de bord — KPI réels, aucune donnée de démonstration   */
/* ============================================================ */

type Dashboard = {
  parties: Record<string, number>; contacts: number;
  activities: { open: number; completed30d: number };
  tasks: { open: number; overdue: number; dueToday: number; upcoming: number; followUps: number; completed30d: number };
  issues: { open: number; inProgress: number; waiting: number; resolved30d: number; total: number };
  recentlyActive: number; ownerNextActions: Array<Record<string, any>>;
};

export const CrmDashboardPage: React.FC = () => {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true); setError('');
    adminApi<Envelope<Dashboard>>('/crm/dashboard')
      .then((result) => setDashboard(result.data))
      .catch((reason: any) => setError(reason?.message || 'Tableau de bord indisponible.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const d = dashboard;
  const cells = d ? [
    { label: 'Clients actifs', value: String(d.parties.customersActive ?? 0) },
    { label: 'Clients (30 j)', value: String(d.parties.customersNew30d ?? 0) },
    { label: 'Tâches en retard', value: String(d.tasks.overdue ?? 0) },
    { label: 'À faire aujourd’hui', value: String(d.tasks.dueToday ?? 0) },
    { label: 'Issues vivantes', value: String((d.issues.open ?? 0) + (d.issues.inProgress ?? 0) + (d.issues.waiting ?? 0)) },
  ] : null;

  const ownerColumns = [
    { key: 'owner_name', label: 'Responsable', render: (row: Row) => <strong>{row.owner_name || '—'}</strong> },
    { key: 'open_tasks', label: 'Tâches ouvertes', render: (row: Row) => String(row.open_tasks ?? 0) },
    { key: 'overdue_tasks', label: 'En retard', render: (row: Row) => Number(row.overdue_tasks ?? 0) > 0 ? <Chip value="OVERDUE" label={`${row.overdue_tasks} en retard`} /> : '—' },
    { key: 'follow_ups', label: 'Suivis', render: (row: Row) => String(row.follow_ups ?? 0) },
    { key: 'open_issues', label: 'Issues', render: (row: Row) => String(row.open_issues ?? 0) },
  ];

  return (
    <>
      <CrmHeader title="Tableau de bord relationnel"
        description="Indicateurs calculés sur les vraies données du module — une base vide affiche zéro."
        action={error ? <Button variant="ghost" onClick={() => load()}>Réessayer</Button> : undefined} />
      <MetricStrip note="module CRM 360 · E2" cells={cells} />
      {d && (
        <section className="admin-card" style={{ marginTop: 16 }}>
          <div className="admin-card__title"><h3>Prochaines actions par responsable</h3>
            <span>{d.recentlyActive} fiches actives sur 14 jours · {d.contacts} contacts actifs</span></div>
          <DataTable
            columns={ownerColumns} rows={d.ownerNextActions ?? []} loading={loading} error={error || undefined}
            onRetry={() => load()} emptyText="Aucune charge relationnelle assignée — créez une tâche ou une issue."
          />
        </section>
      )}
    </>
  );
};

/* ============================================================ */
/* Parties — listes, création, vue 360°                          */
/* ============================================================ */

type TimelineItem = { type: string; id: string; at: string; verb: string; title: string; summary?: string; actor?: string | null; meta?: Row };

export const CrmPartiesPage: React.FC = () => {
  const { meta, may } = useCrmMeta();
  const partyKinds = meta?.statuses?.partyKinds ?? ['CUSTOMER', 'PARTNER', 'SUPPLIER', 'PROSPECT', 'OTHER'];
  const [rows, setRows] = useState<Row[]>([]);
  const [pagination, setPagination] = useState<Page>(EMPTY_PAGE);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Row | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Row>({ partyType: 'INDIVIDUAL', kind: 'CUSTOMER', name: '', email: '', phone: '', governorate: '' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (kind) params.set('kind', kind);
      const result = await adminApi<Envelope<Row[]>>(`/crm/parties?${params}`);
      setRows(result.data ?? []); setPagination(result.pagination ?? EMPTY_PAGE);
    } catch (reason: any) {
      setError(reason?.status === 403 ? 'Les fiches ne sont pas consultables avec ce rôle.' : (reason?.message || 'Liste indisponible.'));
      setRows([]);
    } finally { setLoading(false); }
  }, [search, kind]);
  useEffect(() => { void load(1); }, [load]);

  const openDetail = async (row: Row) => {
    try {
      const result = await adminApi<Envelope<Row>>(`/crm/parties/${row.id}`);
      setDetail(result.data);
      const timelineResult = await adminApi<Envelope<TimelineItem[]>>(`/crm/parties/${row.id}/timeline?pageSize=25`);
      setTimeline(timelineResult.data ?? []);
    } catch (reason: any) {
      setToast({ message: reason?.message || 'Vue 360° indisponible.', tone: 'error' });
    }
  };

  // E7-bis : un résultat de la recherche globale porte `?id=party_…` — ce deep link ouvre
  // directement la vue 360° au lieu de laisser la liste silencieuse.
  const [requestedId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('id');
  });
  useEffect(() => {
    if (!requestedId) return;
    void openDetail({ id: requestedId } as Row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedId]);

  const create = async () => {
    setBusy(true);
    try {
      await adminApi<Envelope<Row>>('/crm/parties', { method: 'POST', body: JSON.stringify(form) });
      setCreating(false);
      setForm({ partyType: 'INDIVIDUAL', kind: 'CUSTOMER', name: '', email: '', phone: '', governorate: '' });
      setToast({ message: 'Fiche créée — le code a été réservé par la numérotation.', tone: 'success' });
      void load(1);
    } catch (reason: any) {
      const details = reason?.details?.length ? ` : ${reason.details.map((d: Row) => d.reason).join(' ; ')}` : '';
      setToast({ message: `${reason?.message || 'Création refusée.'}${details}`, tone: 'error' });
    } finally { setBusy(false); }
  };

  const archive = async (row: Row) => {
    setBusy(true);
    try {
      await adminApi<Envelope<Row>>(`/crm/parties/${row.id}/archive`, { method: 'POST' });
      setToast({ message: `Fiche ${row.party_code} archivée — elle reste lisible, plus modifiable.`, tone: 'success' });
      setDetail(null); void load();
    } catch (reason: any) {
      setToast({ message: reason?.message || 'Archivage refusé.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const columns = [
    { key: 'party_code', label: 'Code', render: (row: Row) => <span className="admin-code">{row.party_code}</span> },
    { key: 'name', label: 'Fiche', render: (row: Row) => <strong>{row.name}</strong> },
    { key: 'kind', label: 'Relation', render: (row: Row) => label(row.kind) },
    { key: 'party_type', label: 'Type', render: (row: Row) => label(row.party_type) },
    { key: 'email', label: 'E-mail' },
    { key: 'phone', label: 'Téléphone' },
    { key: 'governorate', label: 'Gouvernorat' },
    { key: 'owner_name', label: 'Responsable' },
    { key: 'open_task_count', label: 'Tâches', render: (row: Row) => Number(row.open_task_count ?? 0) > 0 ? <Chip value="WAITING" label={`${row.open_task_count} ouvertes`} /> : '—' },
    { key: 'status', label: 'Statut', sortable: true, render: (row: Row) => <Chip value={String(row.status)} /> },
    { key: 'updated_at', label: 'Modifiée le', sortable: true, render: (row: Row) => formatDate(row.updated_at) },
  ];

  const rowActions: TableRowAction<Row>[] = [
    { key: 'open', label: 'Vue 360°', onRun: (row) => void openDetail(row) },
    {
      key: 'archive', label: 'Archiver', hideLabel: true, tone: 'danger', icon: <Trash2 size={15} />,
      show: (row) => row.status !== 'ARCHIVED',
      disabled: !may('party', 'archive'), reason: 'Archiver exige le grant « crm360:archive » sur les fiches.',
      onRun: (row) => void archive(row),
    },
  ];

  return (
    <>
      <CrmHeader title="Fiches clients & partenaires" description="La fiche relationnelle : une identité, un historique, des prochaines actions — jamais de doublon silencieux."
        action={may('party', 'create')
          ? <Button onClick={() => setCreating(true)}>Nouvelle fiche</Button>
          : <Button disabled title="Créer une fiche exige le grant « crm360:create » sur les fiches.">Nouvelle fiche</Button>} />
      <div className="admin-toolbar">
        <Search value={search} onChange={setSearch} placeholder="Nom, code, e-mail, téléphone…" />
        <Select value={kind} onChange={(event) => setKind(event.target.value)} options={[{ value: '', label: 'Toutes les relations' }, ...partyKinds.map((value) => ({ value, label: label(value) }))]} />
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} error={error || undefined} onRetry={() => void load()}
        rowActions={rowActions} emptyText="Aucune fiche — créez la première."
      />
      <Pagination {...pagination} onChange={(page) => void load(page)} />

      <Modal open={Boolean(detail)} title={detail ? `Fiche ${detail.party.party_code} — ${detail.party.name}` : ''}
        eyebrow="AYROVI CRM 360" onClose={() => setDetail(null)} wide>
        {detail && (
          <div className="admin-stack">
            <div className="admin-kv-grid">
              <div><span>Relation</span><strong>{label(detail.party.kind)}</strong></div>
              <div><span>Statut</span><strong><Chip value={String(detail.party.status)} /></strong></div>
              <div><span>Responsable</span><strong>{detail.party.owner_name || '—'}</strong></div>
              <div><span>E-mail</span><strong>{detail.party.email || '—'}</strong></div>
              <div><span>Téléphone</span><strong>{detail.party.phone || '—'}</strong></div>
              <div><span>Localisation</span><strong>{[detail.party.governorate, detail.party.city].filter(Boolean).join(' · ') || '—'}</strong></div>
              <div><span>Prochaine action</span><strong>{formatDate(detail.party.next_follow_up_at)}</strong></div>
              <div><span>Contacts</span><strong>{detail.contacts.length}</strong></div>
              <div><span>Commandes liées</span><strong>{detail.legacy?.orderCount ?? 0} · {detail.legacy?.lifetimeValue ? `${Number(detail.legacy.lifetimeValue).toLocaleString('fr-FR')} TND` : '—'}</strong></div>
            </div>
            {detail.counters && (
              <div className="admin-kv-grid">
                <div><span>Tâches ouvertes</span><strong>{detail.counters.open_tasks}</strong></div>
                <div><span>En retard</span><strong>{detail.counters.overdue_tasks}</strong></div>
                <div><span>Suivis ouverts</span><strong>{detail.counters.open_follow_ups}</strong></div>
                <div><span>Issues vivantes</span><strong>{detail.counters.open_issues}</strong></div>
                <div><span>Activités</span><strong>{detail.counters.open_activities}</strong></div>
                <div><span>Notes</span><strong>{detail.counters.note_count}</strong></div>
              </div>
            )}
            {detail.party.status === 'ARCHIVED'
              ? <p className="admin-muted">Cette fiche est archivée : elle reste lisible, elle ne se modifie plus.</p>
              : (may('party', 'archive') && <Button variant="danger" onClick={() => void archive(detail.party)}>Archiver cette fiche</Button>)}
            <h4 style={{ margin: '12px 0 6px' }}>Contacts ({detail.contacts.length})</h4>
            <DataTable columns={[
              { key: 'name', label: 'Contact', render: (row: Row) => `${row.first_name} ${row.last_name}`.trim() || '—' },
              { key: 'title', label: 'Fonction' }, { key: 'email', label: 'E-mail' }, { key: 'phone', label: 'Téléphone' },
              { key: 'is_primary', label: 'Principal', render: (row: Row) => yesNo(row.is_primary) },
            ]} rows={detail.contacts ?? []} minWidth={620} emptyText="Aucun contact enregistré." />
            <h4 style={{ margin: '12px 0 6px' }}>Timeline 360°</h4>
            <DataTable columns={[
              { key: 'at', label: 'Quand', render: (item: TimelineItem) => formatDate(item.at) },
              { key: 'type', label: 'Type', render: (item: TimelineItem) => <Chip value={String(item.type).toUpperCase()} label={String(item.type)} /> },
              { key: 'title', label: 'Événement' },
              { key: 'summary', label: 'Détail' },
            ]} rows={timeline} minWidth={760} emptyText="Aucun événement pour l’instant." />
            <div className="admin-form-actions">
              <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={creating} title="Nouvelle fiche relationnelle" eyebrow="AYROVI CRM 360" onClose={() => setCreating(false)}>
        <div className="admin-form-grid">
          <Field label="Type de fiche"><Select value={form.partyType} onChange={(event) => setForm({ ...form, partyType: event.target.value })} options={[{ value: 'INDIVIDUAL', label: 'Individu' }, { value: 'COMPANY', label: 'Entreprise' }]} /></Field>
          <Field label="Relation" required><Select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} options={[{ value: 'CUSTOMER', label: 'Client' }, { value: 'PARTNER', label: 'Partenaire' }, { value: 'SUPPLIER', label: 'Fournisseur' }, { value: 'PROSPECT', label: 'Prospect' }, { value: 'OTHER', label: 'Autre' }]} /></Field>
          <Field label="Nom / raison sociale" required full><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Nom affiché dans le CRM" /></Field>
          <Field label="E-mail"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
          <Field label="Téléphone" hint="Numéro tunisien normalisé en +216…"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+216…" /></Field>
          <Field label="Gouvernorat"><input value={form.governorate} onChange={(event) => setForm({ ...form, governorate: event.target.value })} /></Field>
        </div>
        <div className="admin-form-actions">
          <Button variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
          <Button busy={busy} disabled={!form.name} onClick={() => void create()}>Créer la fiche</Button>
        </div>
      </Modal>
      {toast && <Toast {...toast} />}
    </>
  );
};

/* ============================================================ */
/* Contacts                                                      */
/* ============================================================ */

export const CrmContactsPage: React.FC = () => {
  const { may } = useCrmMeta();
  const [rows, setRows] = useState<Row[]>([]);
  const [pagination, setPagination] = useState<Page>(EMPTY_PAGE);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Row>({ partyId: '', firstName: '', lastName: '', email: '', phone: '', title: '', notes: '', isPrimary: false });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      const result = await adminApi<Envelope<Row[]>>(`/crm/contacts?${params}`);
      setRows(result.data ?? []); setPagination(result.pagination ?? EMPTY_PAGE);
    } catch (reason: any) {
      setError(reason?.message || 'Liste indisponible.'); setRows([]);
    } finally { setLoading(false); }
  }, [search]);
  useEffect(() => { void load(1); }, [load]);

  const persist = async () => {
    setBusy(true);
    try {
      const body = { ...form, isPrimary: Boolean(form.isPrimary) };
      if (editing) {
        await adminApi<Envelope<Row>>(`/crm/contacts/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setToast({ message: 'Contact mis à jour.', tone: 'success' });
      } else {
        await adminApi<Envelope<Row>>('/crm/contacts', { method: 'POST', body: JSON.stringify(body) });
        setToast({ message: 'Contact ajouté.', tone: 'success' });
      }
      setCreating(false); setEditing(null); void load();
    } catch (reason: any) {
      setToast({ message: reason?.message || 'Enregistrement refusé.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const remove = async (row: Row) => {
    setBusy(true);
    try {
      await adminApi(`/crm/contacts/${row.id}`, { method: 'DELETE' });
      setToast({ message: 'Contact supprimé (trace conservée dans l’audit).', tone: 'success' });
      void load();
    } catch (reason: any) { setToast({ message: reason?.message || 'Suppression refusée.', tone: 'error' }); }
    finally { setBusy(false); }
  };

  const startCreate = () => { setForm({ partyId: '', firstName: '', lastName: '', email: '', phone: '', title: '', notes: '', isPrimary: false }); setCreating(true); };
  const startEdit = (row: Row) => { setForm({
    partyId: row.party_id, firstName: row.first_name, lastName: row.last_name, email: row.email, phone: row.phone,
    title: row.title ?? '', notes: row.notes ?? '', isPrimary: Boolean(row.is_primary),
  }); setEditing(row); };

  const columns = [
    { key: 'name', label: 'Contact', render: (row: Row) => <strong>{`${row.first_name} ${row.last_name}`.trim() || '—'}</strong> },
    { key: 'party_name', label: 'Fiche rattachée', render: (row: Row) => <span>{row.party_name || row.party_id}</span> },
    { key: 'title', label: 'Fonction' }, { key: 'email', label: 'E-mail' }, { key: 'phone', label: 'Téléphone' },
    { key: 'is_primary', label: 'Principal', render: (row: Row) => yesNo(row.is_primary) },
    { key: 'status', label: 'Statut', render: (row: Row) => <Chip value={String(row.status)} /> },
  ];
  const rowActions: TableRowAction<Row>[] = [
    { key: 'edit', label: 'Modifier', show: () => may('contact', 'edit'), disabled: !may('contact', 'edit'), onRun: (row) => startEdit(row) },
    {
      key: 'delete', label: 'Supprimer', tone: 'danger', hideLabel: true, icon: <Trash2 size={15} />,
      show: () => may('contact', 'delete'), disabled: !may('contact', 'delete'), reason: 'Supprimer exige le grant « crm360:delete ».',
      onRun: (row) => void remove(row),
    },
  ];

  return (
    <>
      <CrmHeader title="Contacts" description="Interlocuteurs rattachés à une fiche — l’unicité téléphone/e-mail est garantie par la base."
        action={may('contact', 'create') ? <Button onClick={startCreate}>Nouveau contact</Button>
          : <Button disabled title="Ajouter un contact exige le grant « crm360:create ».">Nouveau contact</Button>} />
      <div className="admin-toolbar"><Search value={search} onChange={setSearch} placeholder="Nom, e-mail, téléphone…" /></div>
      <DataTable columns={columns} rows={rows} loading={loading} error={error || undefined} onRetry={() => void load()}
        rowActions={rowActions} emptyText="Aucun contact." />
      <Pagination {...pagination} onChange={(page) => void load(page)} />
      <Modal open={creating || Boolean(editing)} title={editing ? 'Modifier le contact' : 'Nouveau contact'} eyebrow="AYROVI CRM 360"
        onClose={() => { setCreating(false); setEditing(null); }}>
        <div className="admin-form-grid">
          <Field label="Identifiant de la fiche" required hint="Collé depuis la fiche (partie « Vue 360° »).">
            <input value={form.partyId} onChange={(event) => setForm({ ...form, partyId: event.target.value })} placeholder="party_…" />
          </Field>
          <Field label="Prénom"><input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></Field>
          <Field label="Nom"><input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></Field>
          <Field label="E-mail"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
          <Field label="Téléphone"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="Fonction"><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Directeur, acheteur…" /></Field>
        </div>
        <Field label="Notes" full><textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
        <label className="admin-check"><input type="checkbox" checked={Boolean(form.isPrimary)} onChange={(event) => setForm({ ...form, isPrimary: event.target.checked })} /> Interlocuteur principal</label>
        <div className="admin-form-actions">
          <Button variant="ghost" onClick={() => { setCreating(false); setEditing(null); }}>Annuler</Button>
          <Button busy={busy} disabled={!form.partyId || (!form.firstName && !form.lastName)} onClick={() => void persist()}>Enregistrer</Button>
        </div>
      </Modal>
      {toast && <Toast {...toast} />}
    </>
  );
};

/* ============================================================ */
/* Activités — interactions planifiées / réalisées               */
/* ============================================================ */

export const CrmActivitiesPage: React.FC = () => {
  const { may } = useCrmMeta();
  const [rows, setRows] = useState<Row[]>([]);
  const [pagination, setPagination] = useState<Page>(EMPTY_PAGE);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Row>({ partyId: '', kind: 'CALL', subject: '', scheduledAt: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      const result = await adminApi<Envelope<Row[]>>(`/crm/activities?${params}`);
      setRows(result.data ?? []); setPagination(result.pagination ?? EMPTY_PAGE);
    } catch (reason: any) { setError(reason?.message || 'Liste indisponible.'); setRows([]); }
    finally { setLoading(false); }
  }, [search]);
  useEffect(() => { void load(1); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await adminApi<Envelope<Row>>('/crm/activities', {
        method: 'POST',
        body: JSON.stringify({ ...form, scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null }),
      });
      setCreating(false); setForm({ partyId: '', kind: 'CALL', subject: '', scheduledAt: '', description: '' });
      setToast({ message: 'Activité planifiée.', tone: 'success' }); void load(1);
    } catch (reason: any) { setToast({ message: reason?.message || 'Création refusée.', tone: 'error' }); }
    finally { setBusy(false); }
  };

  const transition = async (row: Row, status: string) => {
    setBusy(true);
    try {
      await adminApi<Envelope<Row>>(`/crm/activities/${row.id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      setToast({ message: `Activité ${label(status)}.`, tone: 'success' }); void load();
    } catch (reason: any) { setToast({ message: reason?.message || 'Transition refusée.', tone: 'error' }); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'kind', label: 'Nature', render: (row: Row) => <Chip value={String(row.kind)} /> },
    { key: 'subject', label: 'Sujet', render: (row: Row) => <strong>{row.subject}</strong> },
    { key: 'party_name', label: 'Fiche', render: (row: Row) => row.party_name || '—' },
    { key: 'scheduled_at', label: 'Planifiée', render: (row: Row) => formatDate(row.scheduled_at) },
    { key: 'status', label: 'Statut', render: (row: Row) => <Chip value={String(row.status)} /> },
  ];
  const rowActions: TableRowAction<Row>[] = [
    {
      key: 'complete', label: 'Marquer terminée', icon: <CheckCircle2 size={15} />, show: (row) => row.status === 'OPEN' && may('activity', 'edit'),
      onRun: (row) => void transition(row, 'COMPLETED'),
    },
    {
      key: 'cancel', label: 'Annuler', tone: 'danger', show: (row) => row.status === 'OPEN' && may('activity', 'edit'),
      onRun: (row) => void transition(row, 'CANCELLED'),
    },
  ];

  return (
    <>
      <CrmHeader title="Activités" description="Appels, rendez-vous, visites, e-mails — ce qui a réellement été fait ou reste à faire sur une fiche."
        action={may('activity', 'create') ? <Button onClick={() => setCreating(true)}><Plus size={14} /> Planifier</Button>
          : <Button disabled title="Planifier exige le grant « crm360:create » sur les activités."><Plus size={14} /> Planifier</Button>} />
      <div className="admin-toolbar"><Search value={search} onChange={setSearch} placeholder="Sujet, fiche…" /></div>
      <DataTable columns={columns} rows={rows} loading={loading} error={error || undefined} onRetry={() => void load()}
        rowActions={rowActions} emptyText="Aucune activité." />
      <Pagination {...pagination} onChange={(page) => void load(page)} />
      <Modal open={creating} title="Planifier une activité" eyebrow="AYROVI CRM 360" onClose={() => setCreating(false)}>
        <div className="admin-form-grid">
          <Field label="Nature" required><Select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}
            options={['CALL', 'MEETING', 'EMAIL', 'MESSAGE', 'VISIT', 'FOLLOW_UP', 'INTERNAL', 'OTHER'].map((value) => ({ value, label: label(value) }))} /></Field>
          <Field label="Fiche liée" hint="Recherchez un client, fournisseur ou prospect. Laissez vide pour une activité interne.">
            <PartyPicker value={String(form.partyId ?? '')} onChange={(partyId) => setForm({ ...form, partyId })} />
          </Field>
          <Field label="Sujet" required full><input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></Field>
          <Field label="Planifiée pour"><input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} /></Field>
          <Field label="Description" full><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        </div>
        <div className="admin-form-actions">
          <Button variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
          <Button busy={busy} disabled={!form.subject} onClick={() => void create()}>Planifier</Button>
        </div>
      </Modal>
      {toast && <Toast {...toast} />}
    </>
  );
};

/* ============================================================ */
/* Tâches & follow-ups                                           */
/* ============================================================ */

export const CrmTasksPage: React.FC = () => {
  const { may } = useCrmMeta();
  const [rows, setRows] = useState<Row[]>([]);
  const [pagination, setPagination] = useState<Page>(EMPTY_PAGE);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [due, setDue] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Row>({ partyId: '', title: '', description: '', isFollowUp: false, priority: 'NORMAL', dueAt: '' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (due) params.set('due', due);
      const result = await adminApi<Envelope<Row[]>>(`/crm/tasks?${params}`);
      setRows(result.data ?? []); setPagination(result.pagination ?? EMPTY_PAGE);
    } catch (reason: any) { setError(reason?.message || 'Liste indisponible.'); setRows([]); }
    finally { setLoading(false); }
  }, [search, status, due]);
  useEffect(() => { void load(1); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await adminApi<Envelope<Row>>('/crm/tasks', {
        method: 'POST',
        body: JSON.stringify({ ...form, isFollowUp: Boolean(form.isFollowUp), dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null }),
      });
      setCreating(false);
      setForm({ partyId: '', title: '', description: '', isFollowUp: false, priority: 'NORMAL', dueAt: '' });
      setToast({ message: 'Tâche créée — son propriétaire est notifié.', tone: 'success' }); void load(1);
    } catch (reason: any) { setToast({ message: reason?.message || 'Création refusée.', tone: 'error' }); }
    finally { setBusy(false); }
  };

  const transition = async (row: Row, nextStatus: string) => {
    setBusy(true);
    try {
      await adminApi<Envelope<Row>>(`/crm/tasks/${row.id}/status`, { method: 'POST', body: JSON.stringify({ status: nextStatus }) });
      setToast({ message: `Tâche ${label(nextStatus)}.`, tone: 'success' }); void load();
    } catch (reason: any) { setToast({ message: reason?.message || 'Transition refusée.', tone: 'error' }); }
    finally { setBusy(false); }
  };

  const active = (row: Row) => !['COMPLETED', 'CANCELLED'].includes(String(row.status));

  const columns = [
    { key: 'task_no', label: 'Référence', render: (row: Row) => <span className="admin-code">{row.task_no}</span> },
    { key: 'title', label: 'Tâche', render: (row: Row) => <strong>{row.title}</strong> },
    { key: 'is_follow_up', label: 'Suivi', render: (row: Row) => (Number(row.is_follow_up) ? <Chip value="FOLLOW_UP" label="Suivi" /> : '—') },
    { key: 'party_name', label: 'Fiche' },
    { key: 'owner_name', label: 'Responsable' },
    { key: 'priority', label: 'Priorité', render: (row: Row) => <Chip value={String(row.priority)} /> },
    { key: 'due_at', label: 'Échéance', render: (row: Row) => formatDate(row.due_at) },
    { key: 'status', label: 'Statut', sortable: true, render: (row: Row) => <Chip value={String(row.status)} /> },
  ];
  const rowActions: TableRowAction<Row>[] = [
    {
      key: 'complete', label: 'Terminer', icon: <CheckCircle2 size={15} />, show: (row) => active(row) && may('task', 'edit'),
      onRun: (row) => void transition(row, 'COMPLETED'),
    },
    {
      key: 'cancel', label: 'Annuler', tone: 'danger', show: (row) => active(row) && may('task', 'edit'),
      onRun: (row) => void transition(row, 'CANCELLED'),
    },
    {
      key: 'reopen', label: 'Rouvrir', show: (row) => !active(row) && may('task', 'edit'),
      onRun: (row) => void transition(row, 'OPEN'),
    },
  ];

  return (
    <>
      <CrmHeader title="Tâches & suivis" description="Les prochaines actions : un propriétaire, une échéance, un statut — le retard se calcule, jamais ne se devine."
        action={may('task', 'create') ? <Button onClick={() => setCreating(true)}><Plus size={14} /> Nouvelle tâche</Button>
          : <Button disabled title="Créer une tâche exige le grant « crm360:create »."><Plus size={14} /> Nouvelle tâche</Button>} />
      <div className="admin-toolbar">
        <Search value={search} onChange={setSearch} placeholder="Titre, fiche…" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)}
            options={[{ value: '', label: 'Tous statuts' }, ...['OPEN', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'].map((value) => ({ value, label: label(value) }))]} />
        <Select value={due} onChange={(event) => setDue(event.target.value)} options={[{ value: '', label: 'Toutes échéances' }, { value: 'overdue', label: 'En retard' }, { value: 'today', label: 'Aujourd’hui' }, { value: 'upcoming', label: 'À venir' }]} />
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} error={error || undefined} onRetry={() => void load()}
        rowActions={rowActions} emptyText="Aucune tâche." />
      <Pagination {...pagination} onChange={(page) => void load(page)} />
      <Modal open={creating} title="Nouvelle tâche" eyebrow="AYROVI CRM 360" onClose={() => setCreating(false)}>
        <div className="admin-form-grid">
          <Field label="Titre" required full><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
          <Field label="Fiche liée" hint="Recherchez la fiche concernée (optionnel).">
            <PartyPicker value={String(form.partyId ?? '')} onChange={(partyId) => setForm({ ...form, partyId })} />
          </Field>
          <Field label="Priorité"><Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} options={[{ value: 'LOW', label: 'Basse' }, { value: 'NORMAL', label: 'Normale' }, { value: 'HIGH', label: 'Haute' }]} /></Field>
          <Field label="Échéance"><input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></Field>
          <Field label="Description" full><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        </div>
        <label className="admin-check"><input type="checkbox" checked={Boolean(form.isFollowUp)} onChange={(event) => setForm({ ...form, isFollowUp: event.target.checked })} /> Tâche de suivi (reste dans les prochaines actions tant qu’elle n’est pas terminée)</label>
        <div className="admin-form-actions">
          <Button variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
          <Button busy={busy} disabled={!form.title} onClick={() => void create()}>Créer la tâche</Button>
        </div>
      </Modal>
      {toast && <Toast {...toast} />}
    </>
  );
};

/* ============================================================ */
/* Issues — dossiers support / réclamations                      */
/* ============================================================ */

export const CrmIssuesPage: React.FC = () => {
  const { may } = useCrmMeta();
  const [rows, setRows] = useState<Row[]>([]);
  const [pagination, setPagination] = useState<Page>(EMPTY_PAGE);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<Row | null>(null);
  const [form, setForm] = useState<Row>({ partyId: '', subject: '', description: '', priority: 'NORMAL', category: 'GENERAL' });
  const [nextStatus, setNextStatus] = useState('IN_PROGRESS');
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const load = useCallback(async (page = 1) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const result = await adminApi<Envelope<Row[]>>(`/crm/issues?${params}`);
      setRows(result.data ?? []); setPagination(result.pagination ?? EMPTY_PAGE);
    } catch (reason: any) { setError(reason?.message || 'Liste indisponible.'); setRows([]); }
    finally { setLoading(false); }
  }, [search, status]);
  useEffect(() => { void load(1); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await adminApi<Envelope<Row>>('/crm/issues', { method: 'POST', body: JSON.stringify(form) });
      setCreating(false); setForm({ partyId: '', subject: '', description: '', priority: 'NORMAL', category: 'GENERAL' });
      setToast({ message: 'Dossier ouvert.', tone: 'success' }); void load(1);
    } catch (reason: any) { setToast({ message: reason?.message || 'Ouverture refusée.', tone: 'error' }); }
    finally { setBusy(false); }
  };

  const decide = async (row: Row) => {
    setBusy(true);
    try {
      await adminApi<Envelope<Row>>(`/crm/issues/${row.id}/status`, {
        method: 'POST', body: JSON.stringify({ status: nextStatus, ...(nextStatus === 'RESOLVED' ? { resolution } : {}) }),
      });
      setDeciding(null); setResolution('');
      setToast({ message: `Dossier ${label(nextStatus)}.`, tone: 'success' }); void load();
    } catch (reason: any) { setToast({ message: reason?.message || 'Transition refusée.', tone: 'error' }); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'issue_no', label: 'Dossier', render: (row: Row) => <span className="admin-code">{row.issue_no}</span> },
    { key: 'subject', label: 'Sujet', render: (row: Row) => <strong>{row.subject}</strong> },
    { key: 'party_name', label: 'Fiche' },
    { key: 'priority', label: 'Priorité', render: (row: Row) => <Chip value={String(row.priority)} /> },
    { key: 'status', label: 'Statut', render: (row: Row) => <Chip value={String(row.status)} /> },
    { key: 'opened_at', label: 'Ouvert le', render: (row: Row) => formatDate(row.opened_at) },
  ];
  const rowActions: TableRowAction<Row>[] = [
    {
      key: 'decide', label: 'Changer le statut', show: () => may('issue', 'edit'), disabled: !may('issue', 'edit'),
      onRun: (row) => { setDeciding(row); setNextStatus(String(row.status) === 'OPEN' ? 'IN_PROGRESS' : String(row.status) === 'RESOLVED' ? 'CLOSED' : String(row.status)); setResolution(''); },
    },
  ];

  return (
    <>
      <CrmHeader title="Issues & réclamations" description="Dossiers support rattachés aux fiches — la résolution s’écrit, la clôture se trace."
        action={may('issue', 'create') ? <Button onClick={() => setCreating(true)}><Plus size={14} /> Ouvrir un dossier</Button>
          : <Button disabled title="Ouvrir un dossier exige le grant « crm360:create »."><Plus size={14} /> Ouvrir un dossier</Button>} />
      <div className="admin-toolbar">
        <Search value={search} onChange={setSearch} placeholder="Référence, sujet…" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)}
          options={[{ value: '', label: 'Tous statuts' }, ...['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'].map((value) => ({ value, label: label(value) }))]} />
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} error={error || undefined} onRetry={() => void load()}
        rowActions={rowActions} emptyText="Aucun dossier." />
      <Pagination {...pagination} onChange={(page) => void load(page)} />
      <Modal open={creating} title="Ouvrir un dossier" eyebrow="AYROVI CRM 360" onClose={() => setCreating(false)}>
        <div className="admin-form-grid">
          <Field label="Fiche liée" hint="Identifiant de la fiche (optionnel).">
            <input value={form.partyId} onChange={(event) => setForm({ ...form, partyId: event.target.value })} placeholder="party_…" />
          </Field>
          <Field label="Priorité"><Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} options={[{ value: 'LOW', label: 'Basse' }, { value: 'NORMAL', label: 'Normale' }, { value: 'HIGH', label: 'Haute' }, { value: 'URGENT', label: 'Urgente' }]} /></Field>
          <Field label="Sujet" required full><input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></Field>
          <Field label="Description" full><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        </div>
        <div className="admin-form-actions">
          <Button variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
          <Button busy={busy} disabled={!form.subject} onClick={() => void create()}>Ouvrir</Button>
        </div>
      </Modal>
      <Modal open={Boolean(deciding)} title={`Dossier ${deciding?.issue_no ?? ''}`} eyebrow="AYROVI CRM 360" onClose={() => setDeciding(null)}>
        <div className="admin-form-grid">
          <Field label="Nouveau statut" full><Select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}
            options={['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'].map((value) => ({ value, label: label(value) }))} /></Field>
          {nextStatus === 'RESOLVED' && (
            <Field label="Résolution" required full hint="Un dossier se résout avec une réponse écrite — elle reste dans l’audit et la timeline.">
              <textarea rows={3} value={resolution} onChange={(event) => setResolution(event.target.value)} />
            </Field>
          )}
        </div>
        <div className="admin-form-actions">
          <Button variant="ghost" onClick={() => setDeciding(null)}>Annuler</Button>
          <Button busy={busy} disabled={nextStatus === 'RESOLVED' && !resolution.trim()} onClick={() => deciding && void decide(deciding)}>Appliquer</Button>
        </div>
      </Modal>
      {toast && <Toast {...toast} />}
    </>
  );
};
