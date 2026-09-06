/**
 * AYROVI Inventory (P2.2) — écrans « mouvements » et « inventaires ».
 *
 * Le stock n'a pas de troisième moteur : les listes sont dessinées par `DataTable` (la garde
 * `back-office-shell.test.tsx` refuse toute balise de table écrite à la main hors du moteur),
 * l'en-tête est la primitive partagée, et les droits viennent de `/inventory/meta` — donc de
 * `erp_role_permissions` via `can()`. Une action refusée reste visible mais inerte, avec son
 * motif en infobulle : jamais un 403 après le clic.
 *
 * Trois écrans, trois responsabilités distinctes, séparées comme les droits :
 *  • déplacer une quantité (ajustement motivé) ;
 *  • compter (inventaire), puis trancher les écarts — la seconde exige `inventory:approve`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Minus, Package, Plus } from '../components/QatafoIcons';
import { adminApi } from './api';
import { useBackOffice } from './back-office/framework';
import { ResourceWorkspace } from './back-office/ResourceWorkspace';
import {
  Button, DataColumn, DataTable, Field, Modal, PageHeader as SharedPageHeader, Pagination, Search, Select, StatusBadge, Toast,
  type TableRowAction,
} from './components';
import { formatDate } from './back-office/resource-ui';

type Meta = {
  capabilities: Record<string, Record<string, boolean>>;
  directions: string[];
  reasons: string[];
  stocktakeStatuses: string[];
  locations: Array<{ location: string; lines: number; units: number }>;
  summary: { lines: number; units: number; lowStock: number; outOfStock: number };
};

type Page = { page: number; pageSize: number; total: number; totalPages: number };

/** L'enveloppe réellement renvoyée par `/api/admin/*` (`adminApi<T>` tape le corps entier). */
type Envelope<T> = { success: boolean; data: T; pagination?: Page };

/** Un seul endroit sait si le rôle appelant peut telle chose — aucune règle client inventée. */
function useInventoryMeta() {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    let active = true;
    adminApi<Envelope<Meta>>('/inventory/meta')
      .then((result) => { if (active) setMeta(result.data); })
      .catch(() => { /* sans méta, l'écran reste en lecture et les écritures sont inertes */ });
    return () => { active = false; };
  }, []);
  const may = useCallback((resource: string, action: string) => Boolean(meta?.capabilities?.[resource]?.[action]), [meta]);
  return { meta, may };
}

// En-tête partagé du back office (./components) — le libellé du domaine reste local.
const PageHeader: React.FC<{ title: string; description: string; action?: React.ReactNode }> = (props) => (
  <SharedPageHeader {...props} eyebrow="AYROVI STOCK" />
);

const KpiStrip: React.FC<{ meta: Meta | null }> = ({ meta }) => {
  const summary = meta?.summary;
  if (!summary) return null;
  const cells = [
    { label: 'Unités en stock', value: summary.units },
    { label: 'Lignes suivies', value: summary.lines },
    { label: 'Sous le point de commande', value: summary.lowStock },
    { label: 'Épuisées', value: summary.outOfStock },
  ];
  return (
    <div className="admin-metrics">
      {cells.map((cell) => (
        <div className="admin-metric" key={cell.label}>
          <div><span>{cell.label}</span><strong className="admin-cell-num">{cell.value.toLocaleString('fr-FR')}</strong><small>module Stock · P2.2</small></div>
        </div>
      ))}
    </div>
  );
};

/* ==================== Stock (délégué au framework) ==================== */

/**
 * La liste de stock n'a pas de page écrite à la main : ce composant ne fait que commander
 * `ResourceWorkspace` avec le descripteur serveur. C'est la promesse de P2.0 rendue tangible
 * sur un écran réel — un module futur déclare un descripteur et obtient liste, tri, recherche,
 * formulaire, droits et audit sans ligne de JSX.
 */
export const InventoryStockPage: React.FC = () => {
  const { descriptorFor } = useBackOffice();
  const descriptor = descriptorFor('inventory');
  if (!descriptor) return <p className="bo-audit-empty">Chargement du descripteur de stock…</p>;
  return <ResourceWorkspace descriptor={descriptor} />;
};

/* ==================== Mouvements ==================== */

const EMPTY_FORM = { product_code: '', location: 'MAIN', direction: 'IN', quantity: '', reason: 'RECEPTION', note: '' };

export const InventoryMovementsPage: React.FC<{ canWriteFallback?: boolean }> = () => {
  const { meta, may } = useInventoryMeta();
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [pagination, setPagination] = useState<Page>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('');
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | undefined>({ key: 'created_at', direction: 'desc' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  // `inventory:write` et non un hypothétique `inventory:adjust` : le verbe `adjust` n'existe pas
  // dans le vocabulaire du moteur (écart écrit au rapport P2.2, §6), et la route de mouvement est
  // gardée par `write`. Demander « adjust » laissait le bouton éternellement grisé, même en
  // SUPER_ADMIN — un CTA inerte qui refuse ce que l'API autorise.
  const mayWrite = may('stock_movement', 'write');

  const load = useCallback(async (page = pagination.page) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (direction) params.set('direction', direction);
      if (sort) { params.set('sort', sort.key); params.set('direction', sort.direction); }
      const result = await adminApi<Envelope<Record<string, any>[]>>(`/inventory/movements?${params}`);
      setRows(result.data ?? []);
      setPagination(result.pagination ?? { page: 1, pageSize: 20, total: 0, totalPages: 1 });
    } catch (reason: any) {
      setError(reason?.status === 403 ? 'Le journal du stock n’est pas consultable avec ce rôle.' : (reason?.message || 'Journal indisponible.'));
      setRows([]);
    } finally { setLoading(false); }
  }, [pagination.page, search, direction, sort]);
  useEffect(() => { void load(1); }, [search, direction]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true);
    try {
      await adminApi('/inventory/movements', { method: 'POST', body: JSON.stringify({ ...form, idempotency_key: `ui-${Date.now()}` }) });
      setOpen(false);
      setForm(EMPTY_FORM);
      setToast({ message: 'Mouvement enregistré — la quantité de la ligne a suivi.', tone: 'success' });
      await load(1);
    } catch (reason: any) {
      setToast({ message: reason?.message || 'Mouvement refusé.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const columns: DataColumn<Record<string, any>>[] = useMemo(() => [
    { key: 'created_at', label: 'Horodatage', sortable: true, render: (row) => <time dateTime={row.created_at}>{formatDate(row.created_at, true)}</time> },
    {
      key: 'product_name', label: 'Produit',
      render: (row) => (
        <div className="admin-entity">
          <span><Plus /></span>
          <div>
            <strong>{row.product_name || 'Produit retiré du catalogue'}</strong>
            <small>{[row.product_code, row.location].filter(Boolean).join(' · ')}</small>
          </div>
        </div>
      ),
    },
    { key: 'direction', label: 'Sens', render: (row) => <StatusBadge status={String(row.direction)} /> },
    {
      key: 'quantity', label: 'Quantité', sortable: true, align: 'end',
      render: (row) => (
        <span className={`admin-cell-num ${Number(row.signed_quantity) < 0 ? 'is-negative' : 'is-positive'}`}>
          {Number(row.signed_quantity) > 0 ? '+' : ''}{Number(row.signed_quantity).toLocaleString('fr-FR')}
        </span>
      ),
    },
    { key: 'balance_after', label: 'Solde après', align: 'end', render: (row) => <span className="admin-cell-num">{Number(row.balance_after).toLocaleString('fr-FR')}</span> },
    { key: 'reason', label: 'Motif', render: (row) => <code>{String(row.reason ?? '—')}</code> },
    { key: 'note', label: 'Note', render: (row) => row.note ? <span title={String(row.note)}>{String(row.note).slice(0, 60)}</span> : '—' },
  ], []);

  return (
    <>
      <PageHeader
        title="Mouvements de stock"
        description="Journal append-only : chaque unité entrée, sortie ou ajustée garde son solde avant/après et son motif. Une erreur se corrige par un mouvement de plus, jamais en réécrivant le passé."
        action={mayWrite
          ? <Button onClick={() => setOpen(true)}>Enregistrer un mouvement</Button>
          : <Button disabled title="Le droit « inventory:write » n’est pas accordé à ce rôle">Enregistrer un mouvement</Button>}
      />
      <KpiStrip meta={meta} />
      <section className="admin-list-card">
        <div className="admin-list-toolbar">
          <Search value={search} onChange={setSearch} placeholder="Produit, code, note, référence…" />
          <Select value={direction} onChange={(event) => setDirection(event.target.value)}
            options={[{ value: '', label: 'Tous les sens' }, ...(meta?.directions ?? ['IN', 'OUT', 'ADJUST']).map((value) => ({ value, label: value }))]} />
        </div>
        <DataTable
          columns={columns} rows={rows} loading={loading} error={error || undefined} onRetry={() => void load()}
          sort={sort} onSortChange={(key) => setSort((current) => (current?.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'desc' }))}
          minWidth={900} caption="Le mouvement est la seule écriture du stock — l’écran n’a pas de champ « quantité »."
          emptyText="Aucun mouvement enregistré pour le moment."
        />
        <Pagination {...pagination} onChange={(page) => void load(page)} />
      </section>
      <Modal open={open} title="Enregistrer un mouvement" onClose={() => setOpen(false)} wide>
        <div className="admin-form-row">
          <Field label="Code produit" hint="Le produit doit déjà avoir une ligne de stock à cet emplacement.">
            <input value={form.product_code} onChange={(event) => setForm({ ...form, product_code: event.target.value })} placeholder="PRD-000042" />
          </Field>
          <Field label="Emplacement" required>
            <Select value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })}
              options={[{ value: 'MAIN', label: 'MAIN' }, ...(meta?.locations ?? []).filter((entry) => entry.location !== 'MAIN').map((entry) => ({ value: entry.location, label: entry.location }))]} />
          </Field>
          <Field label="Sens" required>
            <Select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value })}
              options={(meta?.directions ?? ['IN', 'OUT', 'ADJUST']).map((value) => ({ value, label: value }))} />
          </Field>
          <Field label="Quantité" required hint={form.direction === 'ADJUST' ? 'Signée : négative pour un retrait.' : 'Toujours positive — le sens est porté par le mouvement.'}>
            <input type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
          </Field>
          <Field label="Motif" required>
            <Select value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })}
              options={(meta?.reasons ?? []).map((value) => ({ value, label: value }))} />
          </Field>
          <Field label="Note" full hint={form.direction === 'ADJUST' ? 'Obligatoire pour un ajustement : sans raison écrite, l’écart n’est pas auditable.' : undefined}>
            <textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </Field>
        </div>
        <div className="admin-form-actions">
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button busy={busy} onClick={() => void submit()}>Enregistrer</Button>
        </div>
      </Modal>
      {toast && <Toast {...toast} />}
    </>
  );
};

/* ==================== Inventaires physiques ==================== */

export const InventoryStocktakesPage: React.FC = () => {
  const { meta, may } = useInventoryMeta();
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [pagination, setPagination] = useState<Page>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [newLocation, setNewLocation] = useState('MAIN');
  const [newNote, setNewNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const mayCreate = may('stocktake', 'create');
  const mayCount = may('stocktake', 'update');
  const mayDecide = may('stocktake', 'approve');

  const load = useCallback(async (page = pagination.page) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (status) params.set('status', status);
      const result = await adminApi<Envelope<Record<string, any>[]>>(`/inventory/stocktakes?${params}`);
      setRows(result.data ?? []);
      setPagination(result.pagination ?? { page: 1, pageSize: 20, total: 0, totalPages: 1 });
    } catch (reason: any) {
      setError(reason?.status === 403 ? 'Les inventaires ne sont pas consultables avec ce rôle.' : (reason?.message || 'Inventaires indisponibles.'));
      setRows([]);
    } finally { setLoading(false); }
  }, [pagination.page, status]);
  useEffect(() => { void load(1); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = async (row: Record<string, any>) => {
    try {
      const result = await adminApi<Envelope<Record<string, any>>>(`/inventory/stocktakes/${row.id}`);
      setDetail(result.data);
      setCounts(Object.fromEntries((result.data?.lines ?? []).map((line: any) => [line.id, line.counted_quantity === null || line.counted_quantity === undefined ? '' : String(line.counted_quantity)])));
    } catch (reason: any) {
      setToast({ message: reason?.message || 'Détail indisponible.', tone: 'error' });
    }
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };

  const saveCount = (line: Record<string, any>) => run(async () => {
    const value = counts[line.id];
    if (value === '' || value === undefined) return;
    try {
      await adminApi(`/inventory/stocktakes/${detail?.id}/lines/${line.id}`, { method: 'PUT', body: JSON.stringify({ counted_quantity: Number(value), comment: line.comment ?? '' }) });
      const result = await adminApi<Envelope<Record<string, any>>>(`/inventory/stocktakes/${detail?.id}`);
      setDetail(result.data);
    } catch (reason: any) { setToast({ message: reason?.message || 'Comptage refusé.', tone: 'error' }); }
  });

  const submitCounts = () => run(async () => {
    try {
      await adminApi(`/inventory/stocktakes/${detail?.id}/submit`, { method: 'POST', body: JSON.stringify({}) });
      const result = await adminApi<Envelope<Record<string, any>>>(`/inventory/stocktakes/${detail?.id}`);
      setDetail(result.data);
      setToast({ message: 'Comptage soumis : plus rien ne se modifie, la validation est ouverte.', tone: 'success' });
      await load();
    } catch (reason: any) { setToast({ message: reason?.message || 'Soumission refusée.', tone: 'error' }); }
  });

  const approve = () => run(async () => {
    try {
      const result = await adminApi<Envelope<Record<string, any>>>(`/inventory/stocktakes/${detail?.id}/approve`, { method: 'POST', body: JSON.stringify({}) });
      setDetail(result.data);
      setToast({ message: `Écarts validés — ${Number(result.data?.applied?.length ?? 0)} mouvement(s) appliqué(s).`, tone: 'success' });
      await load();
    } catch (reason: any) { setToast({ message: reason?.message || 'Validation refusée.', tone: 'error' }); }
  });

  const reject = () => run(async () => {
    try {
      await adminApi(`/inventory/stocktakes/${detail?.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: rejectReason }) });
      const result = await adminApi<Envelope<Record<string, any>>>(`/inventory/stocktakes/${detail?.id}`);
      setDetail(result.data); setRejecting(false); setRejectReason('');
      setToast({ message: 'Inventaire refusé : aucune quantité n’a bougé.', tone: 'success' });
      await load();
    } catch (reason: any) { setToast({ message: reason?.message || 'Refus refusé (motif obligatoire ?).', tone: 'error' }); }
  });

  const create = () => run(async () => {
    try {
      await adminApi('/inventory/stocktakes', { method: 'POST', body: JSON.stringify({ location: newLocation, note: newNote }) });
      setCreating(false); setNewNote('');
      setToast({ message: 'Session de comptage ouverte sur les lignes actives de cet emplacement.', tone: 'success' });
      await load(1);
    } catch (reason: any) { setToast({ message: reason?.message || 'Ouverture refusée.', tone: 'error' }); }
  });

  const columns: DataColumn<Record<string, any>>[] = [
    { key: 'code', label: 'Référence', render: (row) => <code>{String(row.code)}</code> },
    { key: 'location', label: 'Emplacement' },
    { key: 'status', label: 'Statut', render: (row) => <StatusBadge status={String(row.status)} /> },
    { key: 'lines_count', label: 'Lignes', align: 'end', render: (row) => <span className="admin-cell-num">{Number(row.lines_count)}</span> },
    { key: 'counted_count', label: 'Comptées', align: 'end', render: (row) => <span className="admin-cell-num">{Number(row.counted_count)}</span> },
    {
      key: 'variance_count', label: 'Écarts', align: 'end',
      render: (row) => <span className={`admin-cell-num ${Number(row.variance_count) > 0 ? 'is-negative' : ''}`}>{Number(row.variance_count)} <small>({Number(row.variance_units)})</small></span>,
    },
    { key: 'created_at', label: 'Ouvert le', render: (row) => formatDate(row.created_at, true) },
  ];

  const rowActions: TableRowAction<Record<string, any>>[] = [
    { key: 'open', label: 'Compter', icon: <CheckCircle2 size={14} />, onRun: (row) => void openDetail(row) },
  ];

  const lineColumns: DataColumn<Record<string, any>>[] = [
    {
      key: 'product_name', label: 'Produit',
      render: (row) => (
        <div className="admin-entity">
          <span>{Number(row.variance) > 0 ? <Plus /> : Number(row.variance) < 0 ? <Minus /> : <Package />}</span>
          <div><strong>{row.product_name}</strong><small>{[row.product_code, row.sku, row.location].filter(Boolean).join(' · ')}</small></div>
        </div>
      ),
    },
    { key: 'expected_quantity', label: 'Attendu', align: 'end', render: (row) => <span className="admin-cell-num">{Number(row.expected_quantity)}</span> },
    {
      key: 'counted_quantity', label: 'Compté', align: 'end',
      render: (row) => (detail?.status === 'DRAFT' || detail?.status === 'COUNTING') && mayCount
        ? <input className="admin-cell-input" type="number" min={0} value={counts[row.id] ?? ''}
            onChange={(event) => setCounts({ ...counts, [row.id]: event.target.value })}
            onBlur={() => void saveCount(row)} aria-label={`Quantité comptée — ${row.product_name}`} />
        : <span className="admin-cell-num">{row.counted_quantity === null || row.counted_quantity === undefined ? '—' : Number(row.counted_quantity)}</span>,
    },
    {
      key: 'variance', label: 'Écart', align: 'end',
      render: (row) => <span className={`admin-cell-num ${Number(row.variance) < 0 ? 'is-negative' : Number(row.variance) > 0 ? 'is-positive' : ''}`}>{Number(row.variance) > 0 ? '+' : ''}{Number(row.variance)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Inventaires physiques"
        description="On photographie le stock théorique, on compte, on soumet, puis la validation applique les écarts — un droit séparé, parce que trancher n’est pas compter."
        action={mayCreate
          ? <Button onClick={() => setCreating(true)}>Nouvel inventaire</Button>
          : <Button disabled title="Le droit « inventory:create » n’est pas accordé à ce rôle">Nouvel inventaire</Button>}
      />
      <section className="admin-list-card">
        <div className="admin-list-toolbar">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}
            options={[{ value: '', label: 'Tous les statuts' }, ...(meta?.stocktakeStatuses ?? []).map((value) => ({ value, label: value }))]} />
        </div>
        <DataTable columns={columns} rows={rows} loading={loading} error={error || undefined} onRetry={() => void load()}
          rowActions={rowActions} onRowClick={(row) => void openDetail(row)} minWidth={820}
          caption="Aucun écart ne touche le stock avant une validation par un rôle autorisé."
          emptyText="Aucune session d’inventaire. Ouvrez-en une pour figer le stock théorique d’un emplacement." />
        <Pagination {...pagination} onChange={(page) => void load(page)} />
      </section>

      <Modal open={Boolean(detail)} title={`Inventaire ${detail?.code ?? ''}`} eyebrow="AYROVI STOCK" onClose={() => setDetail(null)} wide>
        {detail ? (
          <>
            <div className="admin-detail-grid">
              <div><span>Statut</span><StatusBadge status={String(detail.status)} /></div>
              <div><span>Emplacement</span><strong>{detail.location}</strong></div>
              <div><span>Lignes comptées</span><strong className="admin-cell-num">{detail.counted_count}/{detail.lines_count}</strong></div>
              <div><span>Écarts</span><strong className="admin-cell-num">{detail.variance_count} ({detail.variance_units} unités)</strong></div>
              {detail.rejection_reason ? <div><span>Motif du refus</span><small>{detail.rejection_reason}</small></div> : null}
            </div>
            <DataTable columns={lineColumns} rows={detail.lines ?? []} minWidth={620}
              caption={mayCount && (detail.status === 'DRAFT' || detail.status === 'COUNTING')
                ? 'Saisissez la quantité comptée : elle part à l’enregistrement dès que vous quittez le champ.'
                : 'Comptage figé — la décision est prise.'}
              emptyText="Aucune ligne." />
            <div className="admin-form-actions">
              {(detail.status === 'DRAFT' || detail.status === 'COUNTING') && mayCount && <Button busy={busy} onClick={() => void submitCounts()}>Soumettre le comptage</Button>}
              {detail.status === 'SUBMITTED' && (mayDecide
                ? <Button busy={busy} onClick={() => void approve()}>Valider les écarts</Button>
                : <Button disabled title="« inventory:approve » est requis pour valider">Valider les écarts</Button>)}
              {detail.status === 'SUBMITTED' && mayDecide && <Button variant="ghost" onClick={() => setRejecting(true)}>Refuser</Button>}
              <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal open={creating} title="Nouvel inventaire" eyebrow="AYROVI STOCK" onClose={() => setCreating(false)}>
        <div className="admin-form-row">
          <Field label="Emplacement" required hint="Seules les lignes actives de cet emplacement sont photographiées.">
            <input value={newLocation} onChange={(event) => setNewLocation(event.target.value.toUpperCase())} />
          </Field>
          <Field label="Note de session" full><textarea rows={3} value={newNote} onChange={(event) => setNewNote(event.target.value)} /></Field>
        </div>
        <div className="admin-form-actions">
          <Button variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
          <Button busy={busy} onClick={() => void create()}>Ouvrir la session</Button>
        </div>
      </Modal>

      <Modal open={rejecting} title="Refuser cet inventaire" eyebrow="AYROVI STOCK" onClose={() => setRejecting(false)}>
        <Field label="Motif" required full hint="Un refus s’écrit : il restera lisible dans l’audit et sur la session.">
          <textarea rows={3} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
        </Field>
        <div className="admin-form-actions">
          <Button variant="ghost" onClick={() => setRejecting(false)}>Annuler</Button>
          <Button variant="danger" busy={busy} onClick={() => void reject()}>Refuser sans toucher le stock</Button>
        </div>
      </Modal>
      {toast && <Toast {...toast} />}
    </>
  );
};
