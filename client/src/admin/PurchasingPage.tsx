/**
 * AYROVI Purchasing (P2.3) — écrans fournisseurs, commandes d'achat, réceptions.
 *
 * Aucun troisième moteur ici : les listes sont dessinées par `DataTable` (la garde
 * `back-office-shell.test.tsx` refuse toute balise de table écrite à la main hors du moteur),
 * l'en-tête est la primitive partagée, et les droits viennent de `/purchasing/meta` — donc de
 * `erp_role_permissions` via `can()`. Une action refusée reste visible mais inerte, avec son
 * motif en infobulle : jamais un 403 après le clic.
 *
 * Trois responsabilités distinctes, séparées comme les droits :
 *  • la fiche fournisseur (lecture, création, édition, désactivation) ;
 *  • la commande : engager, soumettre, approuver — `purchasing:approve` ;
 *  • la réception : compter ce qui arrive et l'afficher en stock — `purchasing:write`.
 * Le stock lui-même ne s'édite pas sur cet écran : l'affichage délègue au module Stock.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Package, Plus, Trash2 } from '../components/QatafoIcons';
import { adminApi } from './api';
import { useBackOffice } from './back-office/framework';
import { ResourceWorkspace } from './back-office/ResourceWorkspace';
import {
  Button, DataColumn, DataTable, Field, MetricStrip, Modal, PageHeader, Pagination, Search,
  Select, StatusBadge, Toast,
  type TableRowAction,
} from './components';
import { formatDate } from './back-office/resource-ui';

type Meta = {
  capabilities: Record<string, Record<string, boolean>>;
  orderStatuses: string[];
  receiptStatuses: string[];
  qualities: string[];
  supplierStatuses: string[];
  currencies: string[];
  limits: { maxLinesPerOrder: number };
  summary: { orders_pending: number; orders_pending_amount: number; receipts_draft: number; suppliers_active: number };
  rules: { lines: string; receipt: string };
};

type Page = { page: number; pageSize: number; total: number; totalPages: number };

/** L'enveloppe réellement renvoyée par `/api/admin/*` (`adminApi<T>` tape le corps entier). */
type Envelope<T> = { success: boolean; data: T; pagination?: Page };

/** Un seul endroit sait si le rôle appelant peut telle chose — aucune règle client inventée. */
function usePurchasingMeta() {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    let active = true;
    adminApi<Envelope<Meta>>('/purchasing/meta')
      .then((result) => { if (active) setMeta(result.data); })
      .catch(() => { /* sans méta, l'écran reste en lecture et les écritures sont inertes */ });
    return () => { active = false; };
  }, []);
  const may = useCallback((resource: string, action: string) => Boolean(meta?.capabilities?.[resource]?.[action]), [meta]);
  return { meta, may };
}

// En-tête partagé du back office (./components) — le libellé du domaine reste local.
const PurchasingHeader: React.FC<{ title: string; description: string; action?: React.ReactNode }> = (props) => <PageHeader {...props} eyebrow="AYROVI ACHATS" />;

const money = (value: unknown, currency = 'TND') => {
  const number = Number(value ?? 0);
  return `${number.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};

/* Idem Stock : la bande de chiffres est la primitive MetricStrip (P3/T2), l'écran ne fait que
   mapper ses compteurs. Les valeurs sont déjà formatées côté écran (la primitive ne connaît ni
   nombre ni devise), donc le rendu reste identique au caractère près. */
const kpiCells = (meta: Meta | null) => {
  const summary = meta?.summary;
  if (!summary) return null;
  return [
    { label: 'Commandes en attente', value: String(summary.orders_pending) },
    { label: 'Montant engagé (attente)', value: money(summary.orders_pending_amount) },
    { label: 'Bons de réception en brouillon', value: String(summary.receipts_draft) },
    { label: 'Fournisseurs actifs', value: String(summary.suppliers_active) },
  ];
};

/* ==================== Fournisseurs (délégué au framework) ==================== */

/**
 * La liste des fournisseurs n'a pas de page écrite à la main : ce composant ne fait que commander
 * `ResourceWorkspace` avec le descripteur serveur — colonnes, tri, recherche, formulaire, droits
 * et audit viennent du registre, pas d'une copie locale.
 */
export const PurchasingSuppliersPage: React.FC = () => {
  const { descriptorFor } = useBackOffice();
  const descriptor = descriptorFor('purchasing');
  if (!descriptor) return <p className="bo-audit-empty">Chargement du descripteur des fournisseurs…</p>;
  return <ResourceWorkspace descriptor={descriptor} />;
};

/* ==================== Commandes d'achat ==================== */

type DraftLine = { product_id: string; product_label: string; variant_id: string; quantity: string; unit_cost: string; description: string };

const EMPTY_ORDER = { supplier_id: '', currency: 'TND', exchange_rate: '1', note: '' };
const EMPTY_LINE: DraftLine = { product_id: '', product_label: '', variant_id: '', quantity: '', unit_cost: '', description: '' };

export const PurchasingOrdersPage: React.FC = () => {
  const { meta, may } = usePurchasingMeta();
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [pagination, setPagination] = useState<Page>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, any>>(EMPTY_ORDER);
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState<'reject' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const mayCreate = may('purchase_order', 'create');
  const mayEdit = may('purchase_order', 'update');
  const mayApprove = may('purchase_order', 'approve');

  const load = useCallback(async (page = pagination.page) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const result = await adminApi<Envelope<Record<string, any>[]>>(`/purchasing/orders?${params}`);
      setRows(result.data ?? []);
      setPagination(result.pagination ?? { page: 1, pageSize: 20, total: 0, totalPages: 1 });
    } catch (reasonError: any) {
      setError(reasonError?.status === 403 ? 'Les commandes d’achat ne sont pas consultables avec ce rôle.' : (reasonError?.message || 'Liste indisponible.'));
      setRows([]);
    } finally { setLoading(false); }
  }, [pagination.page, search, status]);
  useEffect(() => { void load(1); }, [search, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = async (row: Record<string, any>) => {
    try {
      const result = await adminApi<Envelope<Record<string, any>>>(`/purchasing/orders/${row.id}`);
      setDetail(result.data);
    } catch (reasonError: any) { setToast({ message: reasonError?.message || 'Détail indisponible.', tone: 'error' }); }
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };

  const call = async (path: string, body?: Record<string, any>) => {
    const result = await adminApi<Envelope<Record<string, any>>>(`/purchasing${path}`, { method: 'POST', body: JSON.stringify(body ?? {}) });
    return result?.data ?? null;
  };

  const act = (verb: 'submit' | 'approve' | 'reject' | 'cancel', withReason = false) => run(async () => {
    try {
      const updated = await call(`/orders/${detail?.id}/${verb}`, withReason ? { reason } : undefined);
      setDetail(updated);
      setDeciding(null); setReason('');
      setToast({ message: 'Statut de la commande mis à jour — la transition est écrite dans l’audit.', tone: 'success' });
      await load();
    } catch (reasonError: any) { setToast({ message: reasonError?.message || 'Transition refusée.', tone: 'error' }); }
  });

  const create = () => run(async () => {
    try {
      const payload = {
        ...form,
        exchange_rate: Number(form.exchange_rate || 1),
        lines: lines.filter((line) => line.product_id).map((line) => ({
          product_id: line.product_id,
          variant_id: line.variant_id || null,
          quantity_ordered: Number(line.quantity),
          unit_cost: Number(line.unit_cost || 0),
          description: line.description,
        })),
      };
      await call('/orders', payload);
      setCreating(false); setForm(EMPTY_ORDER); setLines([{ ...EMPTY_LINE }]);
      setToast({ message: 'Commande créée en brouillon : à soumettre, puis à approuver.', tone: 'success' });
      await load(1);
    } catch (reasonError: any) { setToast({ message: reasonError?.message || 'Création refusée.', tone: 'error' }); }
  });

  const subtotal = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0), 0);

  const columns: DataColumn<Record<string, any>>[] = useMemo(() => [
    { key: 'po_number', label: 'Référence', sortable: true, render: (row) => <code>{String(row.po_number)}</code> },
    {
      key: 'supplier_name', label: 'Fournisseur', sortable: true,
      render: (row) => (
        <div className="admin-entity">
          <span><Package /></span>
          <div><strong>{row.supplier_name}</strong><small>{String(row.supplier_code ?? '')}</small></div>
        </div>
      ),
    },
    { key: 'status', label: 'Statut', sortable: true, render: (row) => <StatusBadge status={String(row.status)} /> },
    { key: 'subtotal', label: 'Montant', sortable: true, align: 'end', render: (row) => <span className="admin-cell-num">{money(row.subtotal, String(row.currency ?? 'TND'))}</span> },
    { key: 'total_tnd', label: 'Équivalent TND', align: 'end', render: (row) => <span className="admin-cell-num">{money(row.total_tnd)}</span> },
    {
      key: 'received_units', label: 'Reçu / commandé', align: 'end',
      render: (row) => (
        <span className={`admin-cell-num ${Number(row.received_units) >= Number(row.ordered_units) ? 'is-positive' : ''}`}>
          {Number(row.received_units)}/{Number(row.ordered_units)}
        </span>
      ),
    },
    { key: 'updated_at', label: 'Modifiée le', sortable: true, render: (row) => formatDate(row.updated_at, true) },
  ], []);

  const rowActions: TableRowAction<Record<string, any>>[] = [
    { key: 'open', label: 'Ouvrir', icon: <CheckCircle2 size={14} />, onRun: (row) => void openDetail(row) },
  ];

  const lineColumns: DataColumn<Record<string, any>>[] = [
    {
      key: 'product_name', label: 'Produit',
      render: (row) => (
        <div className="admin-entity">
          <span><Package /></span>
          <div><strong>{row.product_name || 'Produit retiré du catalogue'}</strong><small>{[row.product_code, row.sku, row.description].filter(Boolean).join(' · ')}</small></div>
        </div>
      ),
    },
    { key: 'quantity_ordered', label: 'Commandées', align: 'end', render: (row) => <span className="admin-cell-num">{Number(row.quantity_ordered)}</span> },
    {
      key: 'received_quantity', label: 'Reçues', align: 'end',
      render: (row) => <span className={`admin-cell-num ${Number(row.received_quantity) >= Number(row.quantity_ordered) ? 'is-positive' : ''}`}>{Number(row.received_quantity)}</span>,
    },
    { key: 'remaining', label: 'Reste', align: 'end', render: (row) => <span className="admin-cell-num">{Number(row.remaining)}</span> },
    { key: 'unit_cost', label: 'Coût unitaire', align: 'end', render: (row) => <span className="admin-cell-num">{money(row.unit_cost, String(detail?.currency ?? 'TND'))}</span> },
    { key: 'line_total', label: 'Total ligne', align: 'end', render: (row) => <span className="admin-cell-num">{money(row.line_total, String(detail?.currency ?? 'TND'))}</span> },
    { key: 'state', label: 'État', render: (row) => <StatusBadge status={String(row.state)} /> },
  ];

  return (
    <>
      <PurchasingHeader
        title="Commandes d’achat"
        description="Une commande engage l’argent : brouillon, soumission, approbation, puis réception. Les totaux sont lus sur les lignes — aucune colonne ne les recopie."
        action={mayCreate
          ? <Button onClick={() => setCreating(true)}>Nouvelle commande</Button>
          : <Button disabled title="Le droit « purchasing:create » n’est pas accordé à ce rôle">Nouvelle commande</Button>}
      />
      <MetricStrip note="module Achats · P2.3" cells={kpiCells(meta)} />
      <section className="admin-list-card">
        <div className="admin-list-toolbar">
          <Search value={search} onChange={setSearch} placeholder="Référence, fournisseur, note…" />
          <Select value={status} onChange={(event) => setStatus(event.target.value)}
            options={[{ value: '', label: 'Tous les statuts' }, ...(meta?.orderStatuses ?? []).map((value) => ({ value, label: value }))]} />
        </div>
        <DataTable
          columns={columns} rows={rows} loading={loading} error={error || undefined} onRetry={() => void load()}
          rowActions={rowActions} onRowClick={(row) => void openDetail(row)} minWidth={980}
          caption="Une commande soumise n’est plus modifiable : c’est ce que le fournisseur a reçu."
          emptyText="Aucune commande d’achat." />
        <Pagination {...pagination} onChange={(page) => void load(page)} />
      </section>

      <Modal open={Boolean(detail)} title={`Commande ${detail?.po_number ?? ''}`} eyebrow="AYROVI ACHATS" onClose={() => setDetail(null)} wide>
        {detail ? (
          <>
            <div className="admin-detail-grid">
              <div><span>Statut</span><StatusBadge status={String(detail.status)} /></div>
              <div><span>Fournisseur</span><strong>{detail.supplier_name}</strong></div>
              <div><span>Devise / taux</span><strong>{detail.currency} · {Number(detail.exchange_rate)}</strong></div>
              <div><span>Montant</span><strong className="admin-cell-num">{money(detail.subtotal, String(detail.currency))}</strong></div>
              <div><span>Équivalent TND</span><strong className="admin-cell-num">{money(detail.total_tnd)}</strong></div>
              <div><span>Reçu / commandé</span><strong className="admin-cell-num">{Number(detail.received_units)}/{Number(detail.ordered_units)}</strong></div>
              {(detail.status === 'APPROVED' || detail.status === 'PARTIALLY_RECEIVED')
                ? <div><span>Reste à réceptionner</span><strong className="admin-cell-num">{Number(detail.ordered_units) - Number(detail.received_units)}</strong></div> : null}
              {detail.arrival_name ? <div><span>Arrivage CRM</span><strong>{detail.arrival_name}</strong></div> : null}
              {detail.cancellation_reason ? <div><span>Motif d’annulation</span><small>{detail.cancellation_reason}</small></div> : null}
              {detail.rejection_reason ? <div><span>Motif de refus</span><small>{detail.rejection_reason}</small></div> : null}
              {detail.note ? <div><span>Note d’achat</span><small>{detail.note}</small></div> : null}
            </div>
            <DataTable columns={lineColumns} rows={detail.lines ?? []} minWidth={760}
              caption={meta?.rules?.lines ?? ''} emptyText="Aucune ligne : rien ne peut être soumis." />
            {detail.receipts?.length ? (
              <DataTable
                columns={[
                  { key: 'receipt_number', label: 'Bon', render: (row) => <code>{String(row.receipt_number)}</code> },
                  { key: 'status', label: 'Statut', render: (row) => <StatusBadge status={String(row.status)} /> },
                  { key: 'location', label: 'Emplacement' },
                  { key: 'units', label: 'Pièces', align: 'end', render: (row) => <span className="admin-cell-num">{Number(row.units)}</span> },
                  { key: 'created_at', label: 'Créée le', render: (row) => formatDate(row.created_at, true) },
                ] as DataColumn<Record<string, any>>[]}
                rows={detail.receipts} minWidth={560} caption="Les bons en brouillon ne consomment rien : la quantité reste disponible jusqu’à l’affichage." />
            ) : null}
            <div className="admin-form-actions">
              {detail.status === 'DRAFT' && (mayEdit
                ? <Button busy={busy} onClick={() => void act('submit')}>Soumettre au fournisseur</Button>
                : <Button disabled title="« purchasing:update » est requis pour soumettre">Soumettre au fournisseur</Button>)}
              {detail.status === 'SUBMITTED' && (mayApprove
                ? <>
                  <Button busy={busy} onClick={() => void act('approve')}>Approuver</Button>
                  <Button variant="ghost" onClick={() => { setDeciding('reject'); setReason(''); }}>Refuser</Button>
                </>
                : <Button disabled title="« purchasing:approve » est requis pour approuver">Approuver</Button>)}
              {['DRAFT', 'SUBMITTED', 'APPROVED'].includes(String(detail.status)) && (mayEdit
                ? <Button variant="danger" onClick={() => { setDeciding('cancel'); setReason(''); }}>Annuler la commande</Button>
                : null)}
              <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal open={creating} title="Nouvelle commande d’achat" eyebrow="AYROVI ACHATS" onClose={() => setCreating(false)} wide>
        <div className="admin-form-row">
          <Field label="Identifiant fournisseur" required hint="Collé depuis la fiche fournisseur ; seul un fournisseur actif engage une commande.">
            <input value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value })} placeholder="sup_…" />
          </Field>
          <Field label="Devise de la commande">
            <Select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}
              options={(meta?.currencies ?? ['TND', 'EUR', 'USD']).map((value) => ({ value, label: value }))} />
          </Field>
          <Field label="Taux vers TND" hint="Le coût saisi n’est jamais réécrit : la conversion est une lecture.">
            <input type="number" step="0.00001" value={form.exchange_rate} onChange={(event) => setForm({ ...form, exchange_rate: event.target.value })} />
          </Field>
          <Field label="Note d’achat" full>
            <textarea rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </Field>
        </div>
        <DataTable
          columns={[
            { key: 'product_label', label: 'Produit', render: (row: Record<string, any>, index: number) => (
              <div className="admin-cell-input">
                <input value={row.product_label} placeholder="Désignation ou code produit"
                  onChange={(event) => setLines(lines.map((line, position) => (position === index ? { ...line, product_label: event.target.value } : line)))} />
                <input value={row.product_id} placeholder="product_id" aria-label="Identifiant produit"
                  onChange={(event) => setLines(lines.map((line, position) => (position === index ? { ...line, product_id: event.target.value } : line)))} />
              </div>
            ) },
            { key: 'quantity', label: 'Quantité', align: 'end', render: (row: Record<string, any>, index: number) => (
              <input className="admin-cell-input" type="number" min={1} value={row.quantity} aria-label="Quantité commandée"
                onChange={(event) => setLines(lines.map((line, position) => (position === index ? { ...line, quantity: event.target.value } : line)))} />
            ) },
            { key: 'unit_cost', label: 'Coût unitaire', align: 'end', render: (row: Record<string, any>, index: number) => (
              <input className="admin-cell-input" type="number" min={0} step="0.0001" value={row.unit_cost} aria-label="Coût unitaire"
                onChange={(event) => setLines(lines.map((line, position) => (position === index ? { ...line, unit_cost: event.target.value } : line)))} />
            ) },
            { key: 'remove', label: '', render: (_row: Record<string, any>, index: number) => (
              <Button variant="ghost" disabled={lines.length <= 1} onClick={() => setLines(lines.filter((_, position) => position !== index))}
                title={lines.length <= 1 ? 'Une commande garde au moins une ligne' : 'Retirer cette ligne'}><Trash2 size={14} /></Button>
            ) },
          ] as DataColumn<Record<string, any>>[]}
          rows={lines} minWidth={640}
          caption={`Au moins une ligne, ${meta?.limits?.maxLinesPerOrder ?? 200} au maximum. Total saisi : ${money(subtotal, String(form.currency))}.`} />
        <div className="admin-form-actions">
          <Button variant="ghost" onClick={() => setLines([...lines, { ...EMPTY_LINE }])}><Plus size={14} /> Ajouter une ligne</Button>
          <Button variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
          <Button busy={busy} onClick={() => void create()}>Créer en brouillon</Button>
        </div>
      </Modal>

      <Modal open={Boolean(deciding)} title={deciding === 'cancel' ? 'Annuler la commande' : 'Refuser la commande'} eyebrow="AYROVI ACHATS" onClose={() => { setDeciding(null); setReason(''); }}>
        <Field label="Motif" required full hint="Un refus ou une annulation s’écrit : il reste lisible sur la commande et dans l’audit.">
          <textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <div className="admin-form-actions">
          <Button variant="ghost" onClick={() => { setDeciding(null); setReason(''); }}>Revenir</Button>
          <Button variant="danger" busy={busy} onClick={() => void act(deciding === 'cancel' ? 'cancel' : 'reject', true)}>
            {deciding === 'cancel' ? 'Annuler la commande' : 'Renvoyer en brouillon'}
          </Button>
        </div>
      </Modal>
      {toast && <Toast {...toast} />}
    </>
  );
};

/* ==================== Réceptions ==================== */

type ReceiptLine = { purchase_order_line_id: string; label: string; remaining: number; quantity: string; quality: string; quality_note: string };

export const PurchasingReceiptsPage: React.FC = () => {
  const { meta, may } = usePurchasingMeta();
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [pagination, setPagination] = useState<Page>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const [draftLines, setDraftLines] = useState<ReceiptLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const mayCreate = may('goods_receipt', 'create');
  const mayWrite = may('goods_receipt', 'write');

  const load = useCallback(async (page = pagination.page) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const result = await adminApi<Envelope<Record<string, any>[]>>(`/purchasing/receipts?${params}`);
      setRows(result.data ?? []);
      setPagination(result.pagination ?? { page: 1, pageSize: 20, total: 0, totalPages: 1 });
    } catch (reasonError: any) {
      setError(reasonError?.status === 403 ? 'Les réceptions ne sont pas consultables avec ce rôle.' : (reasonError?.message || 'Liste indisponible.'));
      setRows([]);
    } finally { setLoading(false); }
  }, [pagination.page, search, status]);
  useEffect(() => { void load(1); }, [search, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };

  const openDetail = async (row: Record<string, any>) => {
    try {
      const result = await adminApi<Envelope<Record<string, any>>>(`/purchasing/receipts/${row.id}`);
      setDetail(result.data);
    } catch (reasonError: any) { setToast({ message: reasonError?.message || 'Détail indisponible.', tone: 'error' }); }
  };

  /** Le brouillon se construit depuis ce qui RESTE à recevoir : la sur-réception n'est pas une surprise à la fin. */
  const startDraft = async (orderId: string) => {
    try {
      const order = await adminApi<Envelope<Record<string, any>>>(`/purchasing/orders/${orderId}`);
      const open = (order.data?.lines ?? []).filter((line: any) => Number(line.remaining) > 0);
      setDraft({ orderId: order.data?.id, po_number: order.data?.po_number, location: 'MAIN', note: '' });
      setDraftLines(open.map((line: any) => ({
        purchase_order_line_id: line.id,
        label: [line.product_name, line.sku, line.product_code].filter(Boolean).join(' · '),
        remaining: Number(line.remaining), quantity: String(line.remaining),
        quality: 'GOOD', quality_note: '',
      })));
    } catch (reasonError: any) { setToast({ message: reasonError?.message || 'Commande introuvable.', tone: 'error' }); }
  };

  const saveDraft = () => run(async () => {
    try {
      const created = await adminApi<Envelope<Record<string, any>>>(`/purchasing/orders/${draft?.orderId}/receipts`, {
        method: 'POST',
        body: JSON.stringify({
          location: draft?.location, note: draft?.note,
          lines: draftLines.filter((line) => Number(line.quantity) > 0).map((line) => ({
            purchase_order_line_id: line.purchase_order_line_id, quantity: Number(line.quantity),
            quality: line.quality, quality_note: line.quality_note,
          })),
        }),
      });
      setDraft(null);
      setToast({ message: 'Bon de réception créé en brouillon — rien n’est encore entré en stock.', tone: 'success' });
      await load(1);
      if (created?.data?.id) await openDetail(created.data);
    } catch (reasonError: any) { setToast({ message: reasonError?.message || 'Brouillon refusé.', tone: 'error' }); }
  });

  const post = (id: string) => run(async () => {
    try {
      const result = await adminApi<Envelope<Record<string, any>>>(`/purchasing/receipts/${id}/post`, { method: 'POST', body: JSON.stringify({}) });
      setDetail(result.data);
      setToast({ message: `Bon affiché — ${Number(result.data?.movements?.length ?? 0)} mouvement(s) écrit(s) par le module Stock.`, tone: 'success' });
      await load();
    } catch (reasonError: any) { setToast({ message: reasonError?.message || 'Affichage refusé.', tone: 'error' }); }
  });

  const discard = (id: string) => run(async () => {
    try {
      const result = await adminApi<Envelope<Record<string, any>>>(`/purchasing/receipts/${id}/discard`, { method: 'POST', body: JSON.stringify({ reason: 'Bon écarté depuis l’écran réceptions' }) });
      setDetail(result.data);
      setToast({ message: 'Bon écarté : aucune quantité n’a bougé.', tone: 'success' });
      await load();
    } catch (reasonError: any) { setToast({ message: reasonError?.message || 'Écartement refusé.', tone: 'error' }); }
  });

  const columns: DataColumn<Record<string, any>>[] = useMemo(() => [
    { key: 'receipt_number', label: 'Bon', sortable: true, render: (row) => <code>{String(row.receipt_number)}</code> },
    { key: 'po_number', label: 'Commande', sortable: true, render: (row) => <code>{String(row.po_number)}</code> },
    { key: 'supplier_name', label: 'Fournisseur', render: (row) => <strong>{row.supplier_name}</strong> },
    { key: 'status', label: 'Statut', sortable: true, render: (row) => <StatusBadge status={String(row.status)} /> },
    { key: 'location', label: 'Emplacement' },
    { key: 'units', label: 'Pièces', align: 'end', render: (row) => <span className="admin-cell-num">{Number(row.units)}</span> },
    { key: 'cost', label: 'Coût', align: 'end', render: (row) => <span className="admin-cell-num">{money(row.cost, String(row.currency ?? 'TND'))}</span> },
    { key: 'created_at', label: 'Créée le', sortable: true, render: (row) => formatDate(row.created_at, true) },
  ], []);

  const lineColumns: DataColumn<Record<string, any>>[] = [
    {
      key: 'product_name', label: 'Produit',
      render: (row) => (
        <div className="admin-entity">
          <span><Package /></span>
          <div><strong>{row.product_name}</strong><small>{[row.product_code, row.sku].filter(Boolean).join(' · ')}</small></div>
        </div>
      ),
    },
    { key: 'quantity', label: 'Reçues', align: 'end', render: (row) => <span className="admin-cell-num">{Number(row.quantity)}</span> },
    { key: 'quantity_ordered', label: 'Commandées', align: 'end', render: (row) => <span className="admin-cell-num">{Number(row.quantity_ordered)}</span> },
    { key: 'quality', label: 'Qualité', render: (row) => <StatusBadge status={String(row.quality)} /> },
    { key: 'quality_note', label: 'Observation', render: (row) => row.quality_note ? <span title={String(row.quality_note)}>{String(row.quality_note).slice(0, 60)}</span> : '—' },
  ];

  const movementColumns: DataColumn<Record<string, any>>[] = [
    { key: 'created_at', label: 'Horodatage', render: (row) => formatDate(row.created_at, true) },
    { key: 'direction', label: 'Sens', render: (row) => <StatusBadge status={String(row.direction)} /> },
    { key: 'signed_quantity', label: 'Signée', align: 'end', render: (row) => (
      <span className={`admin-cell-num ${Number(row.signed_quantity) < 0 ? 'is-negative' : 'is-positive'}`}>
        {Number(row.signed_quantity) > 0 ? '+' : ''}{Number(row.signed_quantity)}
      </span>
    ) },
    { key: 'balance_after', label: 'Solde après', align: 'end', render: (row) => <span className="admin-cell-num">{Number(row.balance_after)}</span> },
    { key: 'reason', label: 'Motif', render: (row) => <code>{String(row.reason)}</code> },
    { key: 'location', label: 'Emplacement' },
  ];

  return (
    <>
      <PurchasingHeader
        title="Réceptions"
        description="La réception partielle est normale, la sur-réception est refusée. Un bon endommagé entre puis sort du stock — deux mouvements, jamais un oubli."
        action={mayCreate
          ? <Button onClick={() => { setDraft({ orderId: '', location: 'MAIN', note: '' }); setDraftLines([]); }}>Nouveau bon de réception</Button>
          : <Button disabled title="Le droit « purchasing:write » n’est pas accordé à ce rôle">Nouveau bon de réception</Button>}
      />
      <section className="admin-list-card">
        <div className="admin-list-toolbar">
          <Search value={search} onChange={setSearch} placeholder="Bon, commande, fournisseur…" />
          <Select value={status} onChange={(event) => setStatus(event.target.value)}
            options={[{ value: '', label: 'Tous les statuts' }, ...(meta?.receiptStatuses ?? []).map((value) => ({ value, label: value }))]} />
        </div>
        <DataTable columns={columns} rows={rows} loading={loading} error={error || undefined} onRetry={() => void load()}
          rowActions={[{ key: 'open', label: 'Ouvrir', icon: <CheckCircle2 size={14} />, onRun: (row) => void openDetail(row) }]}
          onRowClick={(row) => void openDetail(row)} minWidth={900}
          caption="Un bon affiché est immuable : l’écart se corrige par un mouvement côté stock."
          emptyText="Aucune réception enregistrée." />
        <Pagination {...pagination} onChange={(page) => void load(page)} />
      </section>

      <Modal open={Boolean(detail)} title={`Réception ${detail?.receipt_number ?? ''}`} eyebrow="AYROVI ACHATS" onClose={() => setDetail(null)} wide>
        {detail ? (
          <>
            <div className="admin-detail-grid">
              <div><span>Statut</span><StatusBadge status={String(detail.status)} /></div>
              <div><span>Commande</span><strong>{detail.po_number} · {detail.supplier_name}</strong></div>
              <div><span>Emplacement</span><strong>{detail.location}</strong></div>
              <div><span>Pièces</span><strong className="admin-cell-num">{Number(detail.units)}</strong></div>
              {detail.discard_reason ? <div><span>Motif d’écartement</span><small>{detail.discard_reason}</small></div> : null}
              {detail.note ? <div><span>Note de quai</span><small>{detail.note}</small></div> : null}
            </div>
            <DataTable columns={lineColumns} rows={detail.lines ?? []} minWidth={680} emptyText="Aucune ligne." />
            {detail.movements?.length ? (
              <DataTable columns={movementColumns} rows={detail.movements} minWidth={620}
                caption="Lus dans le journal du stock par référence de bon — le module Achats ne détient aucune quantité." />
            ) : null}
            <div className="admin-form-actions">
              {detail.status === 'DRAFT' && (mayWrite
                ? <>
                  <Button busy={busy} onClick={() => void post(String(detail.id))}>Afficher en stock</Button>
                  <Button variant="ghost" onClick={() => void discard(String(detail.id))}>Écarter le bon</Button>
                </>
                : <Button disabled title="« purchasing:write » est requis pour afficher">Afficher en stock</Button>)}
              <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal open={Boolean(draft)} title="Nouveau bon de réception" eyebrow="AYROVI ACHATS" onClose={() => setDraft(null)} wide>
        <div className="admin-form-row">
          <Field label="Identifiant de la commande approuvée" required hint="Seule une commande APPROVED ou PARTIELLEMENT_REÇUE peut être réceptionnée.">
            <input value={draft?.orderId ?? ''} onChange={(event) => { void startDraft(event.target.value); }} placeholder="po_…" />
          </Field>
          <Field label="Emplacement de réception" required hint="Si la ligne de stock n’existe pas, le module Stock l’ouvre à zéro.">
            <input value={draft?.location ?? 'MAIN'} onChange={(event) => setDraft({ ...draft, location: event.target.value.toUpperCase() })} />
          </Field>
          <Field label="Note de quai" full>
            <textarea rows={2} value={draft?.note ?? ''} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
          </Field>
        </div>
        <DataTable
          columns={[
            { key: 'label', label: 'Ligne commandée', render: (row: Record<string, any>) => <span><strong>{row.label}</strong><small> reste {Number(row.remaining)}</small></span> },
            { key: 'quantity', label: 'Reçu', align: 'end', render: (row: Record<string, any>, index: number) => (
              <input className="admin-cell-input" type="number" min={0} max={Number(row.remaining)} value={row.quantity} aria-label="Quantité reçue"
                onChange={(event) => setDraftLines(draftLines.map((line, position) => (position === index ? { ...line, quantity: event.target.value } : line)))} />
            ) },
            { key: 'quality', label: 'Qualité', render: (row: Record<string, any>, index: number) => (
              <Select value={row.quality} onChange={(event) => setDraftLines(draftLines.map((line, position) => (position === index ? { ...line, quality: event.target.value } : line)))}
                options={(meta?.qualities ?? ['GOOD', 'DAMAGED', 'REJECTED']).map((value) => ({ value, label: value }))} />
            ) },
            { key: 'quality_note', label: 'Observation', render: (row: Record<string, any>, index: number) => (
              <input className="admin-cell-input" value={row.quality_note} aria-label="Observation de qualité"
                onChange={(event) => setDraftLines(draftLines.map((line, position) => (position === index ? { ...line, quality_note: event.target.value } : line)))} />
            ) },
          ] as DataColumn<Record<string, any>>[]}
          rows={draftLines} minWidth={720}
          caption="REJECTED = refusé au quai, rien n’entre ; DAMAGED = entré puis sorti du stock disponible."
          emptyText="Aucune ligne à recevoir sur cette commande." />
        <div className="admin-form-actions">
          <Button variant="ghost" onClick={() => setDraft(null)}>Annuler</Button>
          <Button busy={busy} onClick={() => void saveDraft()}>Enregistrer le brouillon</Button>
        </div>
      </Modal>
      {toast && <Toast {...toast} />}
    </>
  );
};

/** Le cadre de saisie des quantités est celui du stock ; aucune couleur littérale sur cet écran. */
export const PURCHASING_PAGE_RULES = {
  overReceipt: 'La sur-réception est refusée à la saisie comme à l’affichage : la borne vient des bons déjà affichés.',
  immutable: 'Un bon affiché est immuable.',
};
