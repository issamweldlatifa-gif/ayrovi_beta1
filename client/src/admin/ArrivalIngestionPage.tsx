import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Check, CheckCircle2, Eye, FileText, Image, Loader2,
  Package, Pencil, Plus, RefreshCw, Save, Sparkles, Trash2, User,
} from '../components/QatafoIcons';
import { adminApi, ApiError } from './api';
import { Button, Field, Modal, Pagination, Search, Select, StatusBadge, Toast } from './components';
import { pushUrlPreservingNavigation } from '../navigation/NavigationHistory';
import './arrival-ingestion.css';

type ArrivalStatus = 'DRAFT' | 'PROCESSING' | 'REVIEW' | 'CONFIRMED';

interface WarehouseDispatch {
  configured?: boolean;
  status?: 'READY_TO_SEND' | 'SENDING' | 'SENT' | 'SEND_FAILED';
  warehouseArrivalId?: string | null;
  cardId?: string | null;
  httpStatus?: number | null;
  sentAt?: string | null;
  attempts?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
}
type SourceType = 'PDF' | 'EMAIL' | 'IMAGE' | 'INVOICE';
type JobState = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
type ProductStatus = 'EXTRACTED' | 'NEEDS_REVIEW' | 'FAILED';

interface StoreProfile {
  id: string;
  code: string;
  name: string;
  active: boolean;
  supportedSources: Array<{ sourceType: SourceType; strategyKey: string }>;
}
interface ExtractionJob {
  id: string;
  sourceId: string;
  state: JobState;
  progressCurrent: number;
  progressTotal: number;
  productsExtracted: number;
  recordsNeedingReview: number;
  warningCodes: string[];
  errorCode: string | null;
  errorMessage: string | null;
  retryAt: string | null;
  attempt: number;
}
interface ArrivalSource {
  id: string;
  sourceType: SourceType;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  sourceHash: string;
  createdAt: string;
  latestJob: ExtractionJob | null;
}
interface ProductSummary {
  total: number;
  extracted: number;
  needsReview: number;
  failed: number;
  approved: number;
  pending?: number;
}
interface ArrivalClientStore {
  id: string;
  arrivalClientId: string;
  storeId: string;
  store: { id: string; code: string; name: string; active: boolean };
  extractionStatus: string;
  products: ProductSummary;
  sources: ArrivalSource[];
}
interface ArrivalClient {
  id: string;
  arrivalId: string;
  displayAlias: string | null;
  displayName: string;
  customer: { id: string; name: string; phone: string; status: string };
  stores: ArrivalClientStore[];
  // Compatibility projection used by the existing review/import modal.
  activeStoreAssignmentId?: string;
  store: { id: string; code: string; name: string; active: boolean } | null;
  extractionStatus: string;
  products: ProductSummary;
  sources: ArrivalSource[];
}
interface ArrivalSummary {
  customers: number;
  products: number;
  completed: number;
  needsReview: number;
  processing: number;
  failed: number;
  notStarted: number;
}
interface ArrivalDetail {
  id: string;
  name: string;
  status: ArrivalStatus;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  summary: ArrivalSummary;
  clients: ArrivalClient[];
}
interface ArrivalListItem {
  id: string;
  name: string;
  status: ArrivalStatus;
  createdAt: string;
  updatedAt: string;
  summary: { customers: number; products: number };
}
interface CustomerChoice { id: string; name: string; phone: string; status: string }
interface ArrivalAiStatus {
  capability: 'arrival-ingestion';
  configured: boolean;
  state: 'READY' | 'NOT_CONFIGURED' | 'PAUSED_RATE_LIMIT' | 'PAUSED_FAILURES';
  circuitOpen: boolean;
  retryAllowed: boolean;
  retryAt: string | null;
  message: string;
  lastFailure: { errorCode: string; errorMessage: string; retryAt: string | null; occurredAt: string } | null;
}
interface ExtractedProduct {
  id: string;
  sourceId: string;
  productName: string | null;
  sku: string | null;
  reference: string | null;
  variant: string | null;
  color: string | null;
  quantity: number | null;
  productImage: string | null;
  sourceType: SourceType;
  sourceReference: string;
  extractionConfidence: number;
  extractionStatus: ProductStatus;
  fieldEvidence: Record<string, string | null>;
  reviewReasons: string[];
  approvedAt: string | null;
}

const sourceLabels: Record<SourceType, string> = {
  PDF: 'PDF', EMAIL: 'Email', IMAGE: 'Screenshot / Image', INVOICE: 'Invoice',
};

function formatDate(value: string, time = false): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('fr-TN', time
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(date);
}
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}
function WarehouseSendButton({
  dispatch, configured, busy, onSend,
}: {
  dispatch: WarehouseDispatch | null;
  configured: boolean;
  busy: boolean;
  onSend: () => void;
}) {
  const status = dispatch?.status;
  if (!configured) {
    return <span className="arrival-wh-tag arrival-wh-disabled" title="WAREHOUSE_API_URL non configuré">Entrepôt non configuré</span>;
  }
  if (status === 'SENT') {
    return (
      <span className="arrival-wh-tag arrival-wh-sent" title={dispatch?.sentAt ? `Envoyé le ${formatDate(dispatch.sentAt, true)}` : ''}>
        ✓ Envoyé · {dispatch?.warehouseArrivalId || 'Expected Arrival'}
      </span>
    );
  }
  if (status === 'SENDING' || busy) {
    return <Button variant="secondary" busy disabled>Envoi…</Button>;
  }
  if (status === 'SEND_FAILED') {
    return (
      <span className="arrival-wh-fail-wrap">
        <span className="arrival-wh-tag arrival-wh-failed" title={dispatch?.errorMessage || ''}>Échec</span>
        <Button variant="secondary" busy={busy} onClick={onSend}>Réessayer</Button>
      </span>
    );
  }
  // READY_TO_SEND / never attempted.
  return <Button variant="secondary" busy={busy} onClick={onSend}>Send to Warehouse</Button>;
}

function currentArrivalParam(): string {
  return new URLSearchParams(window.location.search).get('arrival') || '';
}
function setArrivalUrl(id?: string): void {
  const params = new URLSearchParams(window.location.search);
  params.set('section', 'arrival-ingestion');
  if (id) params.set('arrival', id); else params.delete('arrival');
  pushUrlPreservingNavigation(`/admin?${params.toString()}`);
}

const LoadingState = ({ error }: { error?: string }) => (
  <div className="arrival-loading" role="status">
    {error ? <><AlertCircle /><strong>{error}</strong></> : <><Loader2 className="admin-spin" /><span>Chargement de l’Arrival…</span></>}
  </div>
);

function ProductReviewModal({
  client,
  open,
  canWrite,
  onClose,
  onChanged,
}: {
  client: ArrivalClient | null;
  open: boolean;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [products, setProducts] = useState<ExtractedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState<Partial<ExtractedProduct>>({});
  const [manual, setManual] = useState({ sourceId: '', productName: '', sku: '', reference: '', variant: '', color: '', quantity: '1' });
  const [showManual, setShowManual] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true); setError('');
    try {
      const storeQuery = client.activeStoreAssignmentId
        ? `?arrivalClientStoreId=${encodeURIComponent(client.activeStoreAssignmentId)}` : '';
      const result = await adminApi<{ data: ExtractedProduct[] }>(`/arrival-ingestion/clients/${client.id}/products${storeQuery}`);
      setProducts(result.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally { setLoading(false); }
  }, [client?.id, client?.activeStoreAssignmentId]);

  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => {
    if (client?.sources.length && !manual.sourceId) setManual((value) => ({ ...value, sourceId: client.sources[0].id }));
  }, [client?.id, client?.sources.length]);

  const startEdit = (product: ExtractedProduct) => {
    setEditingId(product.id);
    setDraft({
      productName: product.productName,
      sku: product.sku,
      reference: product.reference,
      variant: product.variant,
      color: product.color,
      quantity: product.quantity,
    });
  };
  const save = async (productId: string) => {
    setBusyId(productId); setError('');
    try {
      await adminApi(`/arrival-ingestion/products/${productId}`, { method: 'PATCH', body: JSON.stringify(draft) });
      setEditingId(''); await load(); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Correction impossible.'); }
    finally { setBusyId(''); }
  };
  const approve = async (productId: string) => {
    setBusyId(productId); setError('');
    try {
      await adminApi(`/arrival-ingestion/products/${productId}/approve`, { method: 'POST', body: '{}' });
      await load(); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Approbation impossible.'); }
    finally { setBusyId(''); }
  };
  const approveAll = async () => {
    if (!client) return;
    setBusyId('all'); setError('');
    try {
      await adminApi(`/arrival-ingestion/clients/${client.id}/products/approve-all`, {
        method: 'POST', body: JSON.stringify({ arrivalClientStoreId: client.activeStoreAssignmentId || undefined }),
      });
      await load(); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Approbation impossible.'); }
    finally { setBusyId(''); }
  };
  const createManual = async () => {
    if (!client) return;
    setBusyId('manual'); setError('');
    try {
      await adminApi(`/arrival-ingestion/clients/${client.id}/products`, {
        method: 'POST', body: JSON.stringify({ ...manual, quantity: manual.quantity ? Number(manual.quantity) : null }),
      });
      setManual((value) => ({ ...value, productName: '', sku: '', reference: '', variant: '', color: '', quantity: '1' }));
      setShowManual(false); await load(); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Ajout impossible.'); }
    finally { setBusyId(''); }
  };

  return (
    <Modal open={open} wide eyebrow="AYROVI CRM · REVIEW" title={client ? `${client.customer.name} · ${client.store?.code || 'Store requis'}` : 'Produits'} onClose={onClose}>
      <div className="arrival-review-head">
        <div><strong>{products.length} produit{products.length === 1 ? '' : 's'}</strong><span>Chaque correction est auditée. Les champs inconnus restent vides.</span></div>
        {canWrite && <div><Button variant="secondary" onClick={() => setShowManual(!showManual)}><Plus />Produit manquant</Button><Button busy={busyId === 'all'} onClick={approveAll}><CheckCircle2 />Approuver les lignes valides</Button></div>}
      </div>
      {showManual && (
        <section className="arrival-manual-product" aria-label="Ajouter un produit manquant">
          <h3>Produit manquant</h3>
          <div className="arrival-inline-fields">
            <label><span>Source</span><select value={manual.sourceId} onChange={(event) => setManual({ ...manual, sourceId: event.target.value })}>{client?.sources.map((source) => <option key={source.id} value={source.id}>{source.originalFilename}</option>)}</select></label>
            <label><span>Produit</span><input value={manual.productName} onChange={(event) => setManual({ ...manual, productName: event.target.value })} /></label>
            <label><span>SKU</span><input value={manual.sku} onChange={(event) => setManual({ ...manual, sku: event.target.value })} /></label>
            <label><span>Référence</span><input value={manual.reference} onChange={(event) => setManual({ ...manual, reference: event.target.value })} /></label>
            <label><span>Variante</span><input value={manual.variant} onChange={(event) => setManual({ ...manual, variant: event.target.value })} /></label>
            <label><span>Couleur</span><input value={manual.color} onChange={(event) => setManual({ ...manual, color: event.target.value })} /></label>
            <label><span>Quantité</span><input type="number" min="1" max="10000" value={manual.quantity} onChange={(event) => setManual({ ...manual, quantity: event.target.value })} /></label>
          </div>
          <Button busy={busyId === 'manual'} disabled={!manual.sourceId} onClick={createManual}><Save />Ajouter pour révision</Button>
        </section>
      )}
      {error && <div className="arrival-error" role="alert"><AlertCircle />{error}</div>}
      {loading ? <LoadingState /> : products.length === 0 ? <div className="arrival-empty-inline">Aucun produit extrait. Importez une source puis lancez EXTRACT.</div> : (
        <div className="arrival-product-table-wrap">
          <table className="arrival-product-table">
            <thead><tr><th>Image</th><th>Produit</th><th>SKU</th><th>Référence</th><th>Variante</th><th>Couleur</th><th>Qty</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>{products.map((product) => {
              const editing = editingId === product.id;
              const input = (field: keyof Pick<ExtractedProduct, 'productName' | 'sku' | 'reference' | 'variant' | 'color'>, label: string) => editing
                ? <input aria-label={label} value={String(draft[field] ?? '')} onChange={(event) => setDraft({ ...draft, [field]: event.target.value || null })} />
                : <span title={product.fieldEvidence[field] || undefined}>{product[field] || '—'}</span>;
              return <tr key={product.id} className={product.extractionStatus !== 'EXTRACTED' || !product.approvedAt ? 'needs-review' : ''}>
                <td>{product.productImage ? <img src={product.productImage} alt={product.productName || 'Image extraite du produit'} loading="lazy" /> : <span className="arrival-no-image"><Image /></span>}</td>
                <td>{input('productName', 'Nom du produit')}</td>
                <td>{input('sku', 'SKU')}</td>
                <td>{input('reference', 'Référence')}</td>
                <td>{input('variant', 'Variante')}</td>
                <td>{input('color', 'Couleur')}</td>
                <td>{editing ? <input className="qty" aria-label="Quantité" type="number" min="1" max="10000" value={draft.quantity ?? ''} onChange={(event) => setDraft({ ...draft, quantity: event.target.value ? Number(event.target.value) : null })} /> : product.quantity ?? '—'}</td>
                <td><StatusBadge status={product.extractionStatus} /><small>{Math.round(product.extractionConfidence * 100)}% · {product.sourceReference}</small>{product.reviewReasons[0] && <small className="review-reason" title={product.reviewReasons.join(', ')}>{product.reviewReasons[0]}</small>}{product.approvedAt && <small className="approved"><Check />Approuvé</small>}</td>
                <td>{canWrite && (editing
                  ? <div className="arrival-row-actions"><Button busy={busyId === product.id} onClick={() => save(product.id)}><Save />Sauver</Button><Button variant="ghost" onClick={() => setEditingId('')}>Annuler</Button></div>
                  : <div className="arrival-row-actions"><Button variant="secondary" onClick={() => startEdit(product)}><Pencil />Corriger</Button><Button busy={busyId === product.id} disabled={Boolean(product.approvedAt) && product.extractionStatus === 'EXTRACTED'} onClick={() => approve(product.id)}><Check />Approuver</Button></div>)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function SourceModal({
  client,
  stores,
  aiStatus,
  open,
  canWrite,
  onClose,
  onChanged,
}: {
  client: ArrivalClient | null;
  stores: StoreProfile[];
  aiStatus: ArrivalAiStatus | null;
  open: boolean;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const store = stores.find((item) => item.id === client?.store?.id);
  const supported = store?.supportedSources || [];
  const [sourceType, setSourceType] = useState<SourceType>('PDF');
  const [file, setFile] = useState<File | null>(null);
  const [emailContent, setEmailContent] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState<ArrivalSource | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [reprocessSource, setReprocessSource] = useState<ArrivalSource | null>(null);

  useEffect(() => {
    if (open) {
      setSourceType(supported[0]?.sourceType || 'PDF'); setFile(null); setEmailContent(''); setError(''); setUploaded(null); setDuplicate(false); setReprocessSource(null);
    }
  }, [open, client?.id, supported.map((item) => item.sourceType).join(',')]);

  const upload = async () => {
    if (!client) return;
    setBusy('upload'); setError('');
    try {
      const body = new FormData(); body.set('sourceType', sourceType);
      if (client.activeStoreAssignmentId) body.set('arrivalClientStoreId', client.activeStoreAssignmentId);
      if (file) body.set('source', file); else body.set('emailContent', emailContent);
      const result = await adminApi<{ data: { duplicate: boolean; source: ArrivalSource } }>(`/arrival-ingestion/clients/${client.id}/sources`, { method: 'POST', body });
      setUploaded(result.data.source); setDuplicate(result.data.duplicate); await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Import impossible.'); }
    finally { setBusy(''); }
  };
  const runExtraction = async (source: ArrivalSource, reprocess: boolean) => {
    setBusy(source.id); setError('');
    try {
      await adminApi(`/arrival-ingestion/sources/${source.id}/extractions`, {
        method: 'POST', body: JSON.stringify({ reprocess }),
      });
      setUploaded(null); setDuplicate(false); setReprocessSource(null); await onChanged();
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'EXTRACTION_EXISTS') setReprocessSource(source);
      setError(reason instanceof Error ? reason.message : 'Extraction impossible.');
    } finally { setBusy(''); }
  };
  const requestExtraction = (source: ArrivalSource) => {
    if (source.latestJob || duplicate) setReprocessSource(source);
    else void runExtraction(source, false);
  };

  const fileAccept = sourceType === 'PDF' ? '.pdf,application/pdf'
    : sourceType === 'IMAGE' ? 'image/jpeg,image/png,image/webp'
      : sourceType === 'INVOICE' ? '.pdf,application/pdf,image/jpeg,image/png,image/webp'
        : '.eml,.txt,.html,message/rfc822,text/plain,text/html';
  const selected = uploaded || null;
  return (
    <Modal open={open} wide eyebrow="AYROVI CRM · INGESTION" title={client ? `Source · ${client.customer.name}` : 'Source'} onClose={onClose}>
      {!client?.store ? <div className="arrival-error"><AlertCircle />Sélectionnez d’abord le magasin.</div> : <>
        <div className="arrival-source-profile"><span>Store</span><strong>{client.store.code}</strong><i />{supported.map((profile) => <small key={profile.sourceType}>{sourceLabels[profile.sourceType]}</small>)}</div>
        {aiStatus && !aiStatus.retryAllowed && <div className="arrival-error"><AlertCircle /><span>{aiStatus.message}{aiStatus.retryAt ? ` Réessayez après ${formatDate(aiStatus.retryAt, true)}.` : ''}</span></div>}
        {canWrite && <section className="arrival-upload-panel">
          <h3>Nouvelle source</h3>
          <div className="arrival-source-type" role="radiogroup" aria-label="Type de source">{supported.map((profile) => <button type="button" role="radio" aria-checked={sourceType === profile.sourceType} className={sourceType === profile.sourceType ? 'is-active' : ''} key={profile.sourceType} onClick={() => { setSourceType(profile.sourceType); setFile(null); }}>{sourceLabels[profile.sourceType]}</button>)}</div>
          {sourceType === 'EMAIL' && !file && <Field label="Contenu de l’email" hint="Collez le contenu complet, ou choisissez un fichier .eml ci-dessous." full><textarea rows={7} value={emailContent} onChange={(event) => setEmailContent(event.target.value)} /></Field>}
          <label className="arrival-file-input"><input type="file" accept={fileAccept} onChange={(event) => setFile(event.target.files?.[0] || null)} /><FileText /><strong>{file ? file.name : sourceType === 'EMAIL' ? 'Choisir un .eml (optionnel)' : 'Choisir la source'}</strong><span>20 Mo maximum · original conservé dans l’espace privé</span></label>
          <Button busy={busy === 'upload'} disabled={!file && !(sourceType === 'EMAIL' && emailContent.trim())} onClick={upload}><Package />Importer la source</Button>
          {selected && <div className={`arrival-upload-result ${duplicate ? 'is-duplicate' : ''}`} role="status"><div><strong>{duplicate ? 'Source déjà connue — aucun doublon créé' : 'Source importée'}</strong><span>{selected.originalFilename} · {formatBytes(selected.byteSize)}</span></div><Button busy={busy === selected.id} disabled={Boolean(aiStatus && !aiStatus.retryAllowed)} onClick={() => requestExtraction(selected)}><Sparkles />{selected.latestJob || duplicate ? 'RE-EXTRACT' : 'EXTRACT'}</Button></div>}
        </section>}
        <section className="arrival-source-list"><h3>Sources de ce Store</h3>{client.sources.length === 0 ? <p>Aucune source importée.</p> : client.sources.map((source) => <article key={source.id}>
          <div className="arrival-source-icon">{source.mimeType.startsWith('image/') ? <Image /> : <FileText />}</div>
          <div><strong>{source.originalFilename}</strong><span>{sourceLabels[source.sourceType]} · {formatBytes(source.byteSize)} · {formatDate(source.createdAt, true)}</span>{source.latestJob?.errorMessage && <div className="arrival-job-diagnostic"><strong>{source.latestJob.errorCode || 'EXTRACTION_FAILED'}</strong><small>{source.latestJob.errorMessage}</small>{source.latestJob.retryAt && <small>Nouvel essai possible après {formatDate(source.latestJob.retryAt, true)}</small>}</div>}{Boolean(source.latestJob?.warningCodes.length) && <div className="arrival-warning-codes" aria-label="Avertissements extraction">{source.latestJob!.warningCodes.map((code) => <code key={code}>{code}</code>)}</div>}</div>
          <div className="arrival-source-job">{source.latestJob ? <><StatusBadge status={source.latestJob.state} />{['QUEUED','PROCESSING'].includes(source.latestJob.state) && <small>{source.latestJob.progressCurrent} / {source.latestJob.progressTotal || '…'} unités · {source.latestJob.productsExtracted} extraits</small>}{source.latestJob.state === 'PARTIAL' && <small>{source.latestJob.productsExtracted} extraits · {source.latestJob.recordsNeedingReview} à vérifier</small>}</> : <StatusBadge status="NOT_STARTED" />}</div>
          <div className="arrival-source-actions"><a className="admin-button admin-button--ghost" href={`/api/admin/arrival-ingestion/sources/${source.id}/content`}><Eye />Original</a>{canWrite && <Button variant="secondary" busy={busy === source.id} disabled={source.latestJob?.state === 'QUEUED' || source.latestJob?.state === 'PROCESSING' || Boolean(aiStatus && !aiStatus.retryAllowed)} onClick={() => requestExtraction(source)}><RefreshCw />{source.latestJob ? 'Re-extraire' : 'Extraire'}</Button>}</div>
        </article>)}</section>
      </>}
      {reprocessSource && <div className="arrival-reprocess-confirm" role="alert" aria-label="Confirmer le retraitement"><AlertCircle /><div><strong>Retraiter cette source ?</strong><p>Le même fichier ne sera pas dupliqué. Un nouveau job sera créé et, uniquement s’il aboutit, ses lignes remplaceront les lignes courantes tout en conservant l’historique précédent.</p><span>{reprocessSource.originalFilename}</span></div><div><Button variant="secondary" onClick={() => setReprocessSource(null)}>Annuler</Button><Button busy={busy === reprocessSource.id} disabled={Boolean(aiStatus && !aiStatus.retryAllowed)} onClick={() => void runExtraction(reprocessSource, true)}><RefreshCw />Confirmer RE-EXTRACT</Button></div></div>}
      {error && <div className="arrival-error" role="alert"><AlertCircle />{error}</div>}
    </Modal>
  );
}

export function ArrivalIngestionPage({ canWrite, canManageStores = false }: { canWrite: boolean; canManageStores?: boolean }) {
  const [arrivalId, setArrivalId] = useState(currentArrivalParam());
  const [arrivals, setArrivals] = useState<ArrivalListItem[]>([]);
  const [detail, setDetail] = useState<ArrivalDetail | null>(null);
  const [stores, setStores] = useState<StoreProfile[]>([]);
  const [aiStatus, setAiStatus] = useState<ArrivalAiStatus | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [arrivalName, setArrivalName] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [clientMode, setClientMode] = useState<'search' | 'create'>('search');
  const [clientSearch, setClientSearch] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
  const [customers, setCustomers] = useState<CustomerChoice[]>([]);
  const [clientBusy, setClientBusy] = useState('');
  const [clientError, setClientError] = useState('');
  // These IDs point to nested Arrival Client Store assignments.
  const [sourceClientId, setSourceClientId] = useState('');
  const [reviewClientId, setReviewClientId] = useState('');
  const [storeClientId, setStoreClientId] = useState('');
  const [storeChoice, setStoreChoice] = useState('');
  const [aliasClientId, setAliasClientId] = useState('');
  const [aliasDraft, setAliasDraft] = useState('');
  const [unlinkClientId, setUnlinkClientId] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [storeManagerOpen, setStoreManagerOpen] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState('');
  const [newStore, setNewStore] = useState({ code: '', name: '', active: true, sourceTypes: ['PDF', 'EMAIL', 'IMAGE', 'INVOICE'] as SourceType[] });
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone?: 'success' | 'error' } | null>(null);
  // Warehouse integration dispatch state (per arrival client card).
  const [warehouseConfigured, setWarehouseConfigured] = useState(false);
  const [dispatches, setDispatches] = useState<Record<string, WarehouseDispatch | null>>({});
  const [dispatchBusy, setDispatchBusy] = useState('');

  const loadWarehouseState = useCallback(async () => {
    if (!arrivalId) return;
    try {
      const result = await adminApi<{ data: { warehouseConfigured: boolean; clients: Array<{ id: string; dispatch: WarehouseDispatch | null }> } }>(
        `/arrival-ingestion/arrivals/${arrivalId}/warehouse-config`,
      );
      setWarehouseConfigured(result.data.warehouseConfigured);
      const map: Record<string, WarehouseDispatch | null> = {};
      for (const c of result.data.clients) map[c.id] = c.dispatch;
      setDispatches(map);
    } catch {
      /* warehouse state is non-blocking */
    }
  }, [arrivalId]);

  const sendToWarehouse = useCallback(async (clientId: string) => {
    setDispatchBusy(clientId);
    try {
      const result = await adminApi<{ data: WarehouseDispatch }>(
        `/arrival-ingestion/clients/${clientId}/send-to-warehouse`,
        { method: 'POST', body: '{}' },
      );
      setDispatches((prev) => ({ ...prev, [clientId]: result.data }));
      setToast({ message: `Carte envoyée à l’entrepôt — Expected Arrival ${result.data.warehouseArrivalId || ''}`.trim(), tone: 'success' });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Échec de l’envoi.';
      setDispatches((prev) => ({
        ...prev,
        [clientId]: { configured: true, status: 'SEND_FAILED', errorMessage: message } as WarehouseDispatch,
      }));
      setToast({ message: `Envoi échoué : ${message}`, tone: 'error' });
    } finally {
      setDispatchBusy('');
    }
  }, []);

  const loadStores = useCallback(async () => {
    const result = await adminApi<{ data: StoreProfile[] }>('/arrival-ingestion/stores');
    setStores(result.data);
  }, []);
  const loadAiStatus = useCallback(async () => {
    const result = await adminApi<{ data: ArrivalAiStatus }>('/arrival-ingestion/ai/status');
    setAiStatus(result.data);
  }, []);
  const loadList = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20' }); if (search) query.set('search', search);
      const result = await adminApi<{ data: ArrivalListItem[]; pagination: typeof pagination }>(`/arrival-ingestion/arrivals?${query}`);
      setArrivals(result.data); setPagination(result.pagination);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chargement impossible.'); }
    finally { setLoading(false); }
  }, [page, search]);
  const loadDetail = useCallback(async (quiet = false) => {
    if (!arrivalId) return;
    if (!quiet) setLoading(true); setError('');
    try {
      const result = await adminApi<{ data: ArrivalDetail }>(`/arrival-ingestion/arrivals/${arrivalId}`);
      setDetail(result.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Arrival introuvable.'); }
    finally { if (!quiet) setLoading(false); }
  }, [arrivalId]);

  useEffect(() => {
    void loadStores().catch(() => setError('Les profils Store ne peuvent pas être chargés.'));
    void loadAiStatus().catch(() => setAiStatus(null));
  }, [loadStores, loadAiStatus]);
  useEffect(() => { if (!arrivalId) { void loadList(); } else { void loadDetail(); void loadWarehouseState(); } }, [arrivalId, loadList, loadDetail, loadWarehouseState]);
  useEffect(() => {
    const onPop = () => setArrivalId(currentArrivalParam());
    window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop);
  }, []);
  const hasActiveJob = detail?.clients.some((client) => client.stores.some((assignment) =>
    assignment.sources.some((source) => ['QUEUED','PROCESSING'].includes(source.latestJob?.state || '')))) || false;
  useEffect(() => {
    if (!arrivalId || !hasActiveJob) return;
    const timer = window.setInterval(() => { void loadDetail(true); void loadAiStatus(); }, 1_500);
    return () => window.clearInterval(timer);
  }, [arrivalId, hasActiveJob, loadDetail, loadAiStatus]);
  useEffect(() => {
    if (!clientOpen || clientMode !== 'search') return;
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ search: clientSearch, limit: '30' });
      void adminApi<{ data: CustomerChoice[] }>(`/arrival-ingestion/customers?${query}`)
        .then((result) => { setCustomers(result.data); setClientError(''); })
        .catch((reason) => { setCustomers([]); setClientError(reason instanceof Error ? reason.message : 'Recherche impossible.'); });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [clientOpen, clientMode, clientSearch]);

  const openDetail = (id: string) => { setArrivalUrl(id); setArrivalId(id); setDetail(null); };
  const back = () => { setArrivalUrl(); setArrivalId(''); setDetail(null); };
  const openClientModal = () => {
    setClientMode('search'); setClientSearch(''); setNewCustomer({ name: '', phone: '' }); setClientError(''); setClientOpen(true);
  };
  const closeClientModal = () => { if (!clientBusy) setClientOpen(false); };
  const createArrival = async () => {
    setCreateBusy(true); setError('');
    try {
      const result = await adminApi<{ data: ArrivalListItem }>('/arrival-ingestion/arrivals', { method: 'POST', body: JSON.stringify({ name: arrivalName }) });
      setCreateOpen(false); setArrivalName(''); openDetail(result.data.id); setToast({ message: 'Arrival créé.', tone: 'success' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Création impossible.'); }
    finally { setCreateBusy(false); }
  };
  const addClient = async (customerId: string) => {
    if (!detail) return;
    setClientBusy(customerId); setClientError('');
    try {
      const result = await adminApi<{ data: ArrivalDetail }>(`/arrival-ingestion/arrivals/${detail.id}/clients`, { method: 'POST', body: JSON.stringify({ customerId }) });
      setDetail(result.data); setClientOpen(false); setClientSearch(''); setToast({ message: 'Client CRM ajouté à l’Arrival.' });
    } catch (reason) { setClientError(reason instanceof Error ? reason.message : 'Ajout impossible.'); }
    finally { setClientBusy(''); }
  };
  const createAndAddClient = async () => {
    if (!detail) return;
    setClientBusy('create'); setClientError('');
    try {
      const result = await adminApi<{ data: ArrivalDetail; meta: { customerCreated: boolean } }>(`/arrival-ingestion/arrivals/${detail.id}/clients`, {
        method: 'POST', body: JSON.stringify({ customer: newCustomer }),
      });
      setDetail(result.data); setClientOpen(false); setNewCustomer({ name: '', phone: '' });
      setToast({
        message: result.meta.customerCreated
          ? 'Nouveau client créé dans le CRM et ajouté à l’Arrival.'
          : 'Ce téléphone existe déjà : le client CRM existant a été ajouté à l’Arrival.',
        tone: 'success',
      });
    } catch (reason) { setClientError(reason instanceof Error ? reason.message : 'Création impossible.'); }
    finally { setClientBusy(''); }
  };
  const assignStore = async () => {
    if (!storeClientId || !storeChoice) return;
    setActionBusy('assign-store'); setError('');
    try {
      const result = await adminApi<{ data: ArrivalDetail }>(`/arrival-ingestion/clients/${storeClientId}/stores`, {
        method: 'POST', body: JSON.stringify({ storeId: storeChoice }),
      });
      setDetail(result.data); setStoreClientId(''); setStoreChoice(''); setToast({ message: 'Store ajouté au client.' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Store non ajouté.'); }
    finally { setActionBusy(''); }
  };
  const removeStore = async (clientId: string, assignment: ArrivalClientStore) => {
    if (!window.confirm(`Retirer ${assignment.store.name} de ce client ? Cette action est possible uniquement si aucune source n’y est rattachée.`)) return;
    setActionBusy(assignment.id); setError('');
    try {
      const result = await adminApi<{ data: ArrivalDetail }>(`/arrival-ingestion/clients/${clientId}/stores/${assignment.id}`, { method: 'DELETE' });
      setDetail(result.data); setToast({ message: 'Store retiré de ce client.' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Store non retiré.'); }
    finally { setActionBusy(''); }
  };
  const saveAlias = async () => {
    if (!aliasClientId) return;
    setActionBusy('alias'); setError('');
    try {
      const result = await adminApi<{ data: ArrivalDetail }>(`/arrival-ingestion/clients/${aliasClientId}`, {
        method: 'PATCH', body: JSON.stringify({ displayAlias: aliasDraft }),
      });
      setDetail(result.data); setAliasClientId(''); setToast({ message: aliasDraft.trim() ? 'Alias Arrival enregistré.' : 'Alias Arrival supprimé.' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Alias non enregistré.'); }
    finally { setActionBusy(''); }
  };
  const unlinkClient = async () => {
    if (!unlinkClientId) return;
    setActionBusy('unlink'); setError('');
    try {
      const result = await adminApi<{ data: ArrivalDetail; meta: { customerPreserved: boolean } }>(`/arrival-ingestion/clients/${unlinkClientId}`, { method: 'DELETE' });
      setDetail(result.data); setUnlinkClientId('');
      setToast({ message: result.meta.customerPreserved ? 'Client dissocié de cet Arrival. Le client CRM, ses commandes et ses données site sont conservés.' : 'Client dissocié.' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Dissociation impossible.'); }
    finally { setActionBusy(''); }
  };
  const createStore = async () => {
    setActionBusy('create-store'); setError('');
    try {
      await adminApi(editingStoreId ? `/arrival-ingestion/stores/${editingStoreId}` : '/arrival-ingestion/stores', {
        method: editingStoreId ? 'PATCH' : 'POST', body: JSON.stringify(newStore),
      });
      await loadStores(); setStoreManagerOpen(false); setEditingStoreId('');
      setNewStore({ code: '', name: '', active: true, sourceTypes: ['PDF', 'EMAIL', 'IMAGE', 'INVOICE'] });
      setToast({ message: editingStoreId ? 'Store global mis à jour.' : 'Store global créé et disponible pour les Arrivals.' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Store non enregistré.'); }
    finally { setActionBusy(''); }
  };
  const confirm = async () => {
    if (!detail) return;
    setConfirmBusy(true); setError('');
    try {
      const result = await adminApi<{ data: ArrivalDetail }>(`/arrival-ingestion/arrivals/${detail.id}/confirm`, { method: 'POST', body: '{}' });
      setDetail(result.data); setConfirmOpen(false); setToast({ message: 'Arrival confirmé. Il est maintenant verrouillé.', tone: 'success' });
    } catch (reason) {
      const message = reason instanceof ApiError && Array.isArray(reason.details?.issues)
        ? `${reason.message} (${(reason.details.issues as Array<{ code: string }>).map((issue) => issue.code).join(', ')})`
        : reason instanceof Error ? reason.message : 'Confirmation impossible.';
      setError(message); setToast({ message, tone: 'error' });
    } finally { setConfirmBusy(false); }
  };

  const scopedClient = (assignmentId: string): ArrivalClient | null => {
    for (const client of detail?.clients || []) {
      const assignment = client.stores.find((item) => item.id === assignmentId);
      if (assignment) return {
        ...client,
        activeStoreAssignmentId: assignment.id,
        store: assignment.store,
        extractionStatus: assignment.extractionStatus,
        products: assignment.products,
        sources: assignment.sources,
      };
    }
    return null;
  };
  const sourceClient = scopedClient(sourceClientId);
  const reviewClient = scopedClient(reviewClientId);
  const aliasClient = detail?.clients.find((client) => client.id === aliasClientId) || null;
  const unlinkClientChoice = detail?.clients.find((client) => client.id === unlinkClientId) || null;
  const storeClient = detail?.clients.find((client) => client.id === storeClientId) || null;
  const resetStoreDraft = () => {
    setEditingStoreId('');
    setNewStore({ code: '', name: '', active: true, sourceTypes: ['PDF', 'EMAIL', 'IMAGE', 'INVOICE'] });
  };
  const storeManagerModal = <Modal open={storeManagerOpen} wide eyebrow="AYROVI CRM" title={editingStoreId ? 'Modifier un Store global' : 'Gérer les Stores globaux'} onClose={() => { if (!actionBusy) { setStoreManagerOpen(false); resetStoreDraft(); } }} footer={<><Button variant="secondary" disabled={Boolean(actionBusy)} onClick={() => { setStoreManagerOpen(false); resetStoreDraft(); }}>Annuler</Button><Button busy={actionBusy === 'create-store'} disabled={newStore.code.trim().length < 2 || newStore.name.trim().length < 2 || !newStore.sourceTypes.length} onClick={() => void createStore()}><Save />{editingStoreId ? 'Mettre à jour' : 'Créer le Store'}</Button></>}>
    <p className="arrival-modal-copy">Les Stores sont globaux et réutilisables. Chaque client d’un Arrival peut recevoir plusieurs Stores.</p>
    <div className="arrival-store-manager-list">{stores.map((store) => <button type="button" key={store.id} className={editingStoreId === store.id ? 'is-active' : ''} onClick={() => { setEditingStoreId(store.id); setNewStore({ code: store.code, name: store.name, active: store.active, sourceTypes: store.supportedSources.map((profile) => profile.sourceType) }); }}><div><strong>{store.name}</strong><span>{store.code} · {store.active ? 'Actif' : 'Inactif'}</span></div><small>{store.supportedSources.map((profile) => sourceLabels[profile.sourceType]).join(' · ') || 'Aucun profil actif'}</small><Pencil /></button>)}</div>
    <div className="arrival-store-manager-form"><div className="arrival-inline-fields"><Field label="Code" required><input value={newStore.code} disabled={Boolean(editingStoreId)} maxLength={32} placeholder="Ex. AMAZON" onChange={(event) => setNewStore({ ...newStore, code: event.target.value.toUpperCase() })} /></Field><Field label="Nom" required><input value={newStore.name} maxLength={120} placeholder="Nom affiché" onChange={(event) => setNewStore({ ...newStore, name: event.target.value })} /></Field></div>
    {editingStoreId && <label className="arrival-store-active"><input type="checkbox" checked={newStore.active} onChange={(event) => setNewStore({ ...newStore, active: event.target.checked })} />Store actif</label>}
    <fieldset className="arrival-store-source-types"><legend>Types de source actifs</legend>{(['PDF', 'EMAIL', 'IMAGE', 'INVOICE'] as SourceType[]).map((sourceType) => <label key={sourceType}><input type="checkbox" checked={newStore.sourceTypes.includes(sourceType)} onChange={(event) => setNewStore({ ...newStore, sourceTypes: event.target.checked ? [...newStore.sourceTypes, sourceType] : newStore.sourceTypes.filter((item) => item !== sourceType) })} />{sourceLabels[sourceType]}</label>)}</fieldset>
    {editingStoreId && <Button variant="ghost" onClick={resetStoreDraft}><Plus />Créer un autre Store</Button>}</div>
  </Modal>;

  if (loading && (arrivalId ? !detail : !arrivals.length)) return <LoadingState error={error} />;
  if (!arrivalId) return <>
    <header className="arrival-page-header"><div><span>AYROVI ADMIN · CRM</span><h1>Arrivals</h1><p>Un client Arrival peut regrouper plusieurs Stores, chacun avec ses propres Sources et extractions.</p></div><div className="arrival-header-actions">{canManageStores && <Button variant="secondary" onClick={() => setStoreManagerOpen(true)}><Package />Gérer les Stores</Button>}{canWrite && <Button onClick={() => setCreateOpen(true)}><Plus />Create Arrival</Button>}</div></header>
    {aiStatus && <div className={`arrival-ai-readiness is-${aiStatus.state.toLowerCase()}`}><Sparkles /><div><strong>AI Extraction · {aiStatus.state}</strong><span>{aiStatus.message}{aiStatus.retryAt ? ` Réessai après ${formatDate(aiStatus.retryAt, true)}.` : ''}</span></div></div>}
    <div className="arrival-list-toolbar"><Search value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Rechercher un Arrival…" /></div>
    {error && <div className="arrival-error" role="alert"><AlertCircle />{error}</div>}
    {arrivals.length === 0 ? <section className="arrival-empty"><Package /><h2>Aucun Arrival opérationnel</h2><p>Créez le premier lot CRM. Les Arrivages publics existants restent séparés.</p>{canWrite && <Button onClick={() => setCreateOpen(true)}><Plus />Create Arrival</Button>}</section> : <div className="arrival-list-grid">{arrivals.map((arrival) => <button key={arrival.id} type="button" className="arrival-list-card" onClick={() => openDetail(arrival.id)}><div><span>{formatDate(arrival.createdAt)}</span><StatusBadge status={arrival.status} /></div><h2>{arrival.name}</h2><dl><div><dt>Clients</dt><dd>{arrival.summary.customers}</dd></div><div><dt>Produits</dt><dd>{arrival.summary.products}</dd></div></dl><strong>Ouvrir l’Arrival →</strong></button>)}</div>}
    <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} />
    <Modal open={createOpen} eyebrow="AYROVI CRM" title="Create Arrival" onClose={() => setCreateOpen(false)} footer={<><Button variant="secondary" onClick={() => setCreateOpen(false)}>Annuler</Button><Button busy={createBusy} disabled={arrivalName.trim().length < 2} onClick={createArrival}>Créer</Button></>}><Field label="Nom" required hint="Exemple : January 2026" full><input autoFocus value={arrivalName} onChange={(event) => setArrivalName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && arrivalName.trim().length >= 2) void createArrival(); }} /></Field></Modal>
    {storeManagerModal}
    {toast && <Toast {...toast} />}
  </>;

  if (!detail) return <LoadingState error={error} />;
  return <>
    <button type="button" className="arrival-back" onClick={back}><ArrowLeft />Tous les Arrivals</button>
    <header className="arrival-detail-header"><div><span>ARRIVAL</span><h1>{detail.name}</h1><div><StatusBadge status={detail.status} /><small>Créé le {formatDate(detail.createdAt)}</small>{detail.confirmedAt && <small>Confirmé le {formatDate(detail.confirmedAt, true)}</small>}</div></div><div>{canManageStores && <Button variant="secondary" onClick={() => setStoreManagerOpen(true)}><Package />Gérer les Stores</Button>}{canWrite && detail.status !== 'CONFIRMED' && <><Button variant="secondary" onClick={openClientModal}><User /><Plus />Add Client</Button><Button variant="secondary" onClick={() => { void loadDetail(); void loadAiStatus(); setToast({ message: 'Données enregistrées. Vous pouvez continuer.' }); }}><Save />Save / Continue</Button><Button busy={confirmBusy} onClick={() => setConfirmOpen(true)}><CheckCircle2 />Confirm Arrival</Button></>}</div></header>
    {aiStatus && <div className={`arrival-ai-readiness is-${aiStatus.state.toLowerCase()}`}><Sparkles /><div><strong>AI Extraction · {aiStatus.state}</strong><span>{aiStatus.message}{aiStatus.retryAt ? ` Réessai après ${formatDate(aiStatus.retryAt, true)}.` : ''}</span>{aiStatus.lastFailure && <small>Dernier échec sécurisé : {aiStatus.lastFailure.errorCode}</small>}</div></div>}
    <section className="arrival-summary" aria-label="Résumé opérationnel"><article><span>Customers</span><strong>{detail.summary.customers}</strong></article><article><span>Products</span><strong>{detail.summary.products}</strong></article><article className="complete"><span>Completed</span><strong>{detail.summary.completed}</strong></article><article className="review"><span>Needs Review</span><strong>{detail.summary.needsReview}</strong></article><article className="processing"><span>Processing</span><strong>{detail.summary.processing}</strong></article></section>
    {error && <div className="arrival-error" role="alert"><AlertCircle />{error}</div>}
    <div className="sr-only" aria-live="polite">{hasActiveJob ? 'Extraction en cours.' : 'Aucune extraction en cours.'}</div>
    <section className="arrival-clients"><div className="arrival-section-title"><div><span>ARRIVAL → CLIENTS → STORES → SOURCES</span><h2>{detail.clients.length} client{detail.clients.length === 1 ? '' : 's'}</h2></div></div>
      {detail.clients.length === 0 ? <div className="arrival-empty-inline">Recherchez un client CRM ou créez-en un nouveau pour commencer.</div> : <div className="arrival-client-grid">{detail.clients.map((client) => <article key={client.id} className="arrival-client-card arrival-client-card--nested">
        <header><div className="arrival-avatar">{client.displayName.slice(0, 2).toUpperCase()}</div><div className="arrival-client-identity"><h3>{client.displayName}</h3>{client.displayAlias ? <span>Client CRM : {client.customer.name} · {client.customer.phone}</span> : <span>{client.customer.phone}</span>}</div><StatusBadge status={client.extractionStatus} />{canWrite && detail.status !== 'CONFIRMED' && <div className="arrival-client-head-actions"><Button variant="ghost" onClick={() => { setAliasDraft(client.displayAlias || ''); setAliasClientId(client.id); }}><Pencil />Alias</Button><Button variant="ghost" onClick={() => setUnlinkClientId(client.id)}><Trash2 />Dissocier</Button></div>}{canWrite && detail.status === 'CONFIRMED' && <div className="arrival-client-head-actions arrival-warehouse-actions"><WarehouseSendButton dispatch={dispatches[client.id] ?? null} configured={warehouseConfigured} busy={dispatchBusy === client.id} onSend={() => void sendToWarehouse(client.id)} /></div>}</header>
        <div className="arrival-client-metrics"><div><span>Stores</span><strong>{client.stores.length}</strong></div><div><span>Products</span><strong>{client.products.total}</strong></div><div><span>Approved</span><strong>{client.products.approved}</strong></div><div><span>Review</span><strong>{client.products.needsReview + client.products.failed}</strong></div></div>
        <div className="arrival-store-stack">{client.stores.length === 0 ? <div className="arrival-store-empty"><Package /><div><strong>Aucun Store affecté</strong><span>Ajoutez SHEIN, TEMU, ZALANDO ou un Store configuré.</span></div></div> : client.stores.map((assignment) => <section key={assignment.id} className="arrival-store-card">
          <header><div className="arrival-store-mark"><Package /></div><div><span>STORE</span><strong>{assignment.store.name}</strong><small>{assignment.store.code} · {assignment.sources.length} source{assignment.sources.length === 1 ? '' : 's'}</small></div><StatusBadge status={assignment.extractionStatus} />{canWrite && detail.status !== 'CONFIRMED' && assignment.sources.length === 0 && <Button variant="ghost" busy={actionBusy === assignment.id} onClick={() => void removeStore(client.id, assignment)}><Trash2 />Retirer</Button>}</header>
          <div className="arrival-store-metrics"><div><span>Produits</span><strong>{assignment.products.total}</strong></div><div><span>Approuvés</span><strong>{assignment.products.approved}</strong></div><div><span>À revoir</span><strong>{assignment.products.needsReview + assignment.products.failed}</strong></div></div>
          {assignment.sources.some((source) => ['QUEUED','PROCESSING'].includes(source.latestJob?.state || '')) && <div className="arrival-progress">{assignment.sources.filter((source) => ['QUEUED','PROCESSING'].includes(source.latestJob?.state || '')).map((source) => <div key={source.id}><span><Loader2 className="admin-spin" />Extracting {source.originalFilename}</span><strong>{source.latestJob?.progressCurrent || 0} / {source.latestJob?.progressTotal || '…'}</strong><i><em style={{ width: source.latestJob?.progressTotal ? `${Math.min(100, (source.latestJob.progressCurrent / source.latestJob.progressTotal) * 100)}%` : '8%' }} /></i></div>)}</div>}
          {assignment.sources.some((source) => source.latestJob?.errorCode) && <div className="arrival-store-failures">{assignment.sources.filter((source) => source.latestJob?.errorCode).map((source) => <span key={source.id}><AlertCircle />{source.latestJob?.errorCode}{source.latestJob?.retryAt ? ` · retry ${formatDate(source.latestJob.retryAt, true)}` : ''}</span>)}</div>}
          <footer><Button variant="secondary" onClick={() => setSourceClientId(assignment.id)}><FileText />{assignment.sources.length ? 'Extract / Re-extract' : 'Add Source'}</Button><Button variant="secondary" disabled={!assignment.products.total} onClick={() => setReviewClientId(assignment.id)}><Eye />View Products</Button><Button disabled={!assignment.products.total} onClick={() => setReviewClientId(assignment.id)}><Check />Review</Button></footer>
        </section>)}</div>
        {canWrite && detail.status !== 'CONFIRMED' && <footer className="arrival-client-footer"><Button variant="secondary" onClick={() => { setStoreChoice(''); setStoreClientId(client.id); }}><Plus />Add Store</Button><span>Une seule fiche client, plusieurs Stores imbriqués.</span></footer>}
      </article>)}</div>}
    </section>
    <Modal open={clientOpen} eyebrow="AYROVI CRM" title="Ajouter un client à l’Arrival" onClose={closeClientModal}>
      <div className="arrival-customer-modes" role="tablist" aria-label="Mode d’ajout du client">
        <button type="button" role="tab" aria-selected={clientMode === 'search'} className={clientMode === 'search' ? 'is-active' : ''} onClick={() => { setClientMode('search'); setClientError(''); }}>Rechercher un client</button>
        <button type="button" role="tab" aria-selected={clientMode === 'create'} className={clientMode === 'create' ? 'is-active' : ''} onClick={() => { setClientMode('create'); setClientError(''); setNewCustomer((value) => ({ ...value, name: value.name || clientSearch.trim() })); }}>Nouveau client</button>
      </div>
      {clientMode === 'search' ? <>
        <Search value={clientSearch} onChange={setClientSearch} placeholder="Nom ou téléphone…" />
        <div className="arrival-customer-choices">{customers.map((customer) => <button key={customer.id} type="button" disabled={clientBusy === customer.id || detail.clients.some((client) => client.customer.id === customer.id)} onClick={() => void addClient(customer.id)}><span>{customer.name.slice(0, 2).toUpperCase()}</span><div><strong>{customer.name}</strong><small>{customer.phone}</small></div>{detail.clients.some((client) => client.customer.id === customer.id) ? <small>Déjà ajouté</small> : clientBusy === customer.id ? <Loader2 className="admin-spin" /> : <Plus />}</button>)}</div>
        {customers.length === 0 && !clientError && <div className="arrival-customer-empty"><User /><strong>Aucun client trouvé</strong><span>Vous pouvez créer « {clientSearch.trim() || 'un nouveau client'} » dans la même base CRM.</span><Button variant="secondary" onClick={() => { setNewCustomer({ name: clientSearch.trim(), phone: '' }); setClientMode('create'); }}>Créer un client</Button></div>}
      </> : <section className="arrival-new-customer" aria-label="Créer un nouveau client CRM">
        <p>Le client sera enregistré dans la base CRM existante puis lié automatiquement à cet Arrival.</p>
        <Field label="Nom du client" required full><input autoFocus value={newCustomer.name} maxLength={160} onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })} placeholder="Nom et prénom" /></Field>
        <Field label="Téléphone tunisien" required hint="8 chiffres — les formats +216 et 00216 sont acceptés." full><input type="tel" inputMode="tel" value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} placeholder="22 123 456" /></Field>
        <div className="arrival-new-customer-actions"><Button variant="secondary" disabled={Boolean(clientBusy)} onClick={() => setClientMode('search')}>Retour à la recherche</Button><Button busy={clientBusy === 'create'} disabled={newCustomer.name.trim().length < 2 || newCustomer.phone.replace(/\D/g, '').length < 8} onClick={() => void createAndAddClient()}><User /><Plus />Créer et ajouter</Button></div>
      </section>}
      {clientError && <div className="arrival-error" role="alert"><AlertCircle />{clientError}</div>}
    </Modal>
    <Modal open={Boolean(storeClientId)} eyebrow="AYROVI CRM" title={storeClient ? `Add Store · ${storeClient.displayName}` : 'Add Store'} onClose={() => !actionBusy && setStoreClientId('')} footer={<><Button variant="secondary" disabled={Boolean(actionBusy)} onClick={() => setStoreClientId('')}>Annuler</Button><Button busy={actionBusy === 'assign-store'} disabled={!storeChoice} onClick={() => void assignStore()}><Plus />Ajouter ce Store</Button></>}>
      <p className="arrival-modal-copy">Le Store sera imbriqué dans cette fiche client. Ses Sources, jobs et produits resteront isolés des autres Stores.</p>
      <Field label="Store" required full><select value={storeChoice} onChange={(event) => setStoreChoice(event.target.value)}><option value="">Sélectionner…</option>{stores.filter((store) => store.active && !storeClient?.stores.some((assignment) => assignment.storeId === store.id)).map((store) => <option key={store.id} value={store.id}>{store.name} · {store.supportedSources.map((profile) => profile.sourceType).join(', ')}</option>)}</select></Field>
      {canManageStores && <Button variant="ghost" onClick={() => { setStoreClientId(''); setStoreManagerOpen(true); }}><Plus />Créer un nouveau Store global</Button>}
    </Modal>
    <Modal open={Boolean(aliasClientId)} eyebrow="AYROVI CRM · ARRIVAL ONLY" title="Alias du client dans cet Arrival" onClose={() => !actionBusy && setAliasClientId('')} footer={<><Button variant="secondary" disabled={Boolean(actionBusy)} onClick={() => setAliasClientId('')}>Annuler</Button><Button busy={actionBusy === 'alias'} onClick={() => void saveAlias()}><Save />Enregistrer l’alias</Button></>}>
      <p className="arrival-modal-copy">L’alias modifie uniquement l’affichage de ce client dans « {detail.name} ». Le nom CRM canonique « {aliasClient?.customer.name || ''} », les commandes et le site ne seront pas modifiés.</p>
      <Field label="Alias Arrival" hint="Laissez vide pour réutiliser le nom CRM canonique." full><input autoFocus value={aliasDraft} maxLength={160} onChange={(event) => setAliasDraft(event.target.value)} placeholder={aliasClient?.customer.name || ''} /></Field>
    </Modal>
    <Modal open={Boolean(unlinkClientId)} eyebrow="AYROVI CRM · SAFE UNLINK" title="Dissocier ce client de l’Arrival" onClose={() => !actionBusy && setUnlinkClientId('')} footer={<><Button variant="secondary" disabled={Boolean(actionBusy)} onClick={() => setUnlinkClientId('')}>Annuler</Button><Button busy={actionBusy === 'unlink'} onClick={() => void unlinkClient()}><Trash2 />Dissocier uniquement de cet Arrival</Button></>}>
      <div className="arrival-confirm-copy"><AlertCircle /><div><strong>{unlinkClientChoice?.displayName}</strong><p>Cette action supprime le lien avec « {detail.name} » et les Stores, Sources, jobs et produits opérationnels propres à cet Arrival. Le client CRM canonique, ses commandes, factures, comptes et données du site restent intacts.</p></div></div>
    </Modal>
    <Modal open={confirmOpen} eyebrow="AYROVI CRM" title="Confirm Arrival" onClose={() => !confirmBusy && setConfirmOpen(false)} footer={<><Button variant="secondary" disabled={confirmBusy} onClick={() => setConfirmOpen(false)}>Annuler</Button><Button busy={confirmBusy} onClick={() => void confirm()}><CheckCircle2 />Confirmer définitivement</Button></>}><div className="arrival-confirm-copy"><AlertCircle /><div><strong>Valider {detail.name} ?</strong><p>Le serveur vérifiera les clients, Stores, jobs, champs requis et approbations. Après confirmation, cet Arrival sera verrouillé. Aucune opération Warehouse ne sera déclenchée.</p></div></div></Modal>
    {storeManagerModal}
    <SourceModal client={sourceClient} stores={stores} aiStatus={aiStatus} open={Boolean(sourceClientId)} canWrite={canWrite && detail.status !== 'CONFIRMED'} onClose={() => setSourceClientId('')} onChanged={() => { void loadAiStatus(); return loadDetail(true); }} />
    <ProductReviewModal client={reviewClient} open={Boolean(reviewClientId)} canWrite={canWrite && detail.status !== 'CONFIRMED'} onClose={() => setReviewClientId('')} onChanged={() => { void loadDetail(true); }} />
    {toast && <Toast {...toast} />}
  </>;
}
