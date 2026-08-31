import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Check, CheckCircle2, Eye, FileText, Image, Loader2,
  Package, Pencil, Plus, RefreshCw, Save, Sparkles, User,
} from '../components/QatafoIcons';
import { adminApi, ApiError } from './api';
import { Button, Field, Modal, Pagination, Search, Select, StatusBadge, Toast } from './components';
import { pushUrlPreservingNavigation } from '../navigation/NavigationHistory';
import './arrival-ingestion.css';

type ArrivalStatus = 'DRAFT' | 'PROCESSING' | 'REVIEW' | 'CONFIRMED';
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
interface ArrivalClient {
  id: string;
  arrivalId: string;
  customer: { id: string; name: string; phone: string; status: string };
  store: { id: string; code: string; name: string; active: boolean } | null;
  extractionStatus: string;
  products: { total: number; extracted: number; needsReview: number; failed: number; approved: number };
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
      const result = await adminApi<{ data: ExtractedProduct[] }>(`/arrival-ingestion/clients/${client.id}/products`);
      setProducts(result.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally { setLoading(false); }
  }, [client?.id]);

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
      await adminApi(`/arrival-ingestion/clients/${client.id}/products/approve-all`, { method: 'POST', body: '{}' });
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
  open,
  canWrite,
  onClose,
  onChanged,
}: {
  client: ArrivalClient | null;
  stores: StoreProfile[];
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
        {canWrite && <section className="arrival-upload-panel">
          <h3>Nouvelle source</h3>
          <div className="arrival-source-type" role="radiogroup" aria-label="Type de source">{supported.map((profile) => <button type="button" role="radio" aria-checked={sourceType === profile.sourceType} className={sourceType === profile.sourceType ? 'is-active' : ''} key={profile.sourceType} onClick={() => { setSourceType(profile.sourceType); setFile(null); }}>{sourceLabels[profile.sourceType]}</button>)}</div>
          {sourceType === 'EMAIL' && !file && <Field label="Contenu de l’email" hint="Collez le contenu complet, ou choisissez un fichier .eml ci-dessous." full><textarea rows={7} value={emailContent} onChange={(event) => setEmailContent(event.target.value)} /></Field>}
          <label className="arrival-file-input"><input type="file" accept={fileAccept} onChange={(event) => setFile(event.target.files?.[0] || null)} /><FileText /><strong>{file ? file.name : sourceType === 'EMAIL' ? 'Choisir un .eml (optionnel)' : 'Choisir la source'}</strong><span>20 Mo maximum · original conservé dans l’espace privé</span></label>
          <Button busy={busy === 'upload'} disabled={!file && !(sourceType === 'EMAIL' && emailContent.trim())} onClick={upload}><Package />Importer la source</Button>
          {selected && <div className={`arrival-upload-result ${duplicate ? 'is-duplicate' : ''}`} role="status"><div><strong>{duplicate ? 'Source déjà connue — aucun doublon créé' : 'Source importée'}</strong><span>{selected.originalFilename} · {formatBytes(selected.byteSize)}</span></div><Button busy={busy === selected.id} onClick={() => requestExtraction(selected)}><Sparkles />{selected.latestJob || duplicate ? 'RE-EXTRACT' : 'EXTRACT'}</Button></div>}
        </section>}
        <section className="arrival-source-list"><h3>Sources du client</h3>{client.sources.length === 0 ? <p>Aucune source importée.</p> : client.sources.map((source) => <article key={source.id}>
          <div className="arrival-source-icon">{source.mimeType.startsWith('image/') ? <Image /> : <FileText />}</div>
          <div><strong>{source.originalFilename}</strong><span>{sourceLabels[source.sourceType]} · {formatBytes(source.byteSize)} · {formatDate(source.createdAt, true)}</span>{source.latestJob?.errorMessage && <small className="arrival-job-error">{source.latestJob.errorMessage}</small>}</div>
          <div className="arrival-source-job">{source.latestJob ? <><StatusBadge status={source.latestJob.state} />{['QUEUED','PROCESSING'].includes(source.latestJob.state) && <small>{source.latestJob.progressCurrent} / {source.latestJob.progressTotal || '…'} unités · {source.latestJob.productsExtracted} extraits</small>}{source.latestJob.state === 'PARTIAL' && <small>{source.latestJob.productsExtracted} extraits · {source.latestJob.recordsNeedingReview} à vérifier</small>}</> : <StatusBadge status="NOT_STARTED" />}</div>
          <div className="arrival-source-actions"><a className="admin-button admin-button--ghost" href={`/api/admin/arrival-ingestion/sources/${source.id}/content`}><Eye />Original</a>{canWrite && <Button variant="secondary" busy={busy === source.id} disabled={source.latestJob?.state === 'QUEUED' || source.latestJob?.state === 'PROCESSING'} onClick={() => requestExtraction(source)}><RefreshCw />{source.latestJob ? 'Re-extraire' : 'Extraire'}</Button>}</div>
        </article>)}</section>
      </>}
      {reprocessSource && <div className="arrival-reprocess-confirm" role="alert" aria-label="Confirmer le retraitement"><AlertCircle /><div><strong>Retraiter cette source ?</strong><p>Le même fichier ne sera pas dupliqué. Un nouveau job sera créé et, uniquement s’il aboutit, ses lignes remplaceront les lignes courantes tout en conservant l’historique précédent.</p><span>{reprocessSource.originalFilename}</span></div><div><Button variant="secondary" onClick={() => setReprocessSource(null)}>Annuler</Button><Button busy={busy === reprocessSource.id} onClick={() => void runExtraction(reprocessSource, true)}><RefreshCw />Confirmer RE-EXTRACT</Button></div></div>}
      {error && <div className="arrival-error" role="alert"><AlertCircle />{error}</div>}
    </Modal>
  );
}

export function ArrivalIngestionPage({ canWrite }: { canWrite: boolean }) {
  const [arrivalId, setArrivalId] = useState(currentArrivalParam());
  const [arrivals, setArrivals] = useState<ArrivalListItem[]>([]);
  const [detail, setDetail] = useState<ArrivalDetail | null>(null);
  const [stores, setStores] = useState<StoreProfile[]>([]);
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
  const [sourceClientId, setSourceClientId] = useState('');
  const [reviewClientId, setReviewClientId] = useState('');
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone?: 'success' | 'error' } | null>(null);

  const loadStores = useCallback(async () => {
    const result = await adminApi<{ data: StoreProfile[] }>('/arrival-ingestion/stores');
    setStores(result.data);
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

  useEffect(() => { void loadStores().catch(() => setError('Les profils Store ne peuvent pas être chargés.')); }, [loadStores]);
  useEffect(() => { if (!arrivalId) void loadList(); else void loadDetail(); }, [arrivalId, loadList, loadDetail]);
  useEffect(() => {
    const onPop = () => setArrivalId(currentArrivalParam());
    window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop);
  }, []);
  const hasActiveJob = detail?.clients.some((client) => client.sources.some((source) => ['QUEUED','PROCESSING'].includes(source.latestJob?.state || ''))) || false;
  useEffect(() => {
    if (!arrivalId || !hasActiveJob) return;
    const timer = window.setInterval(() => void loadDetail(true), 1_500);
    return () => window.clearInterval(timer);
  }, [arrivalId, hasActiveJob, loadDetail]);
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
  const selectStore = async (clientId: string, storeId: string) => {
    setClientBusy(clientId); setError('');
    try {
      const result = await adminApi<{ data: ArrivalDetail }>(`/arrival-ingestion/clients/${clientId}`, { method: 'PATCH', body: JSON.stringify({ storeId }) });
      setDetail(result.data); setToast({ message: 'Store enregistré.' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Store non enregistré.'); }
    finally { setClientBusy(''); }
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

  const sourceClient = detail?.clients.find((client) => client.id === sourceClientId) || null;
  const reviewClient = detail?.clients.find((client) => client.id === reviewClientId) || null;

  if (loading && (arrivalId ? !detail : !arrivals.length)) return <LoadingState error={error} />;
  if (!arrivalId) return <>
    <header className="arrival-page-header"><div><span>AYROVI ADMIN · CRM</span><h1>Arrivals</h1><p>Transformez les sources Store en produits normalisés, traçables et révisables.</p></div>{canWrite && <Button onClick={() => setCreateOpen(true)}><Plus />Create Arrival</Button>}</header>
    <div className="arrival-list-toolbar"><Search value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Rechercher un Arrival…" /></div>
    {error && <div className="arrival-error" role="alert"><AlertCircle />{error}</div>}
    {arrivals.length === 0 ? <section className="arrival-empty"><Package /><h2>Aucun Arrival opérationnel</h2><p>Créez le premier lot CRM. Les Arrivages publics existants restent séparés.</p>{canWrite && <Button onClick={() => setCreateOpen(true)}><Plus />Create Arrival</Button>}</section> : <div className="arrival-list-grid">{arrivals.map((arrival) => <button key={arrival.id} type="button" className="arrival-list-card" onClick={() => openDetail(arrival.id)}><div><span>{formatDate(arrival.createdAt)}</span><StatusBadge status={arrival.status} /></div><h2>{arrival.name}</h2><dl><div><dt>Clients</dt><dd>{arrival.summary.customers}</dd></div><div><dt>Produits</dt><dd>{arrival.summary.products}</dd></div></dl><strong>Ouvrir l’Arrival →</strong></button>)}</div>}
    <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} />
    <Modal open={createOpen} eyebrow="AYROVI CRM" title="Create Arrival" onClose={() => setCreateOpen(false)} footer={<><Button variant="secondary" onClick={() => setCreateOpen(false)}>Annuler</Button><Button busy={createBusy} disabled={arrivalName.trim().length < 2} onClick={createArrival}>Créer</Button></>}><Field label="Nom" required hint="Exemple : January 2026" full><input autoFocus value={arrivalName} onChange={(event) => setArrivalName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && arrivalName.trim().length >= 2) void createArrival(); }} /></Field></Modal>
    {toast && <Toast {...toast} />}
  </>;

  if (!detail) return <LoadingState error={error} />;
  return <>
    <button type="button" className="arrival-back" onClick={back}><ArrowLeft />Tous les Arrivals</button>
    <header className="arrival-detail-header"><div><span>ARRIVAL</span><h1>{detail.name}</h1><div><StatusBadge status={detail.status} /><small>Créé le {formatDate(detail.createdAt)}</small>{detail.confirmedAt && <small>Confirmé le {formatDate(detail.confirmedAt, true)}</small>}</div></div><div>{canWrite && detail.status !== 'CONFIRMED' && <><Button variant="secondary" onClick={openClientModal}><User /><Plus />Add Client</Button><Button variant="secondary" onClick={() => { void loadDetail(); setToast({ message: 'Données enregistrées. Vous pouvez continuer.' }); }}><Save />Save / Continue</Button><Button busy={confirmBusy} onClick={() => setConfirmOpen(true)}><CheckCircle2 />Confirm Arrival</Button></>}</div></header>
    <section className="arrival-summary" aria-label="Résumé opérationnel"><article><span>Customers</span><strong>{detail.summary.customers}</strong></article><article><span>Products</span><strong>{detail.summary.products}</strong></article><article className="complete"><span>Completed</span><strong>{detail.summary.completed}</strong></article><article className="review"><span>Needs Review</span><strong>{detail.summary.needsReview}</strong></article><article className="processing"><span>Processing</span><strong>{detail.summary.processing}</strong></article></section>
    {error && <div className="arrival-error" role="alert"><AlertCircle />{error}</div>}
    <div className="sr-only" aria-live="polite">{hasActiveJob ? 'Extraction en cours.' : 'Aucune extraction en cours.'}</div>
    <section className="arrival-clients"><div className="arrival-section-title"><div><span>CLIENTS / CUSTOMER IMPORTS</span><h2>{detail.clients.length} client{detail.clients.length === 1 ? '' : 's'}</h2></div></div>
      {detail.clients.length === 0 ? <div className="arrival-empty-inline">Recherchez un client CRM ou créez-en un nouveau pour commencer.</div> : <div className="arrival-client-grid">{detail.clients.map((client) => <article key={client.id} className="arrival-client-card"><header><div className="arrival-avatar">{client.customer.name.slice(0, 2).toUpperCase()}</div><div><h3>{client.customer.name}</h3><span>{client.customer.phone}</span></div><StatusBadge status={client.extractionStatus} /></header>
        <label className="arrival-store-select"><span>Store</span><select value={client.store?.id || ''} disabled={!canWrite || detail.status === 'CONFIRMED' || clientBusy === client.id} onChange={(event) => void selectStore(client.id, event.target.value)}><option value="">Select Store…</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
        <div className="arrival-client-metrics"><div><span>Products</span><strong>{client.products.total}</strong></div><div><span>Approved</span><strong>{client.products.approved}</strong></div><div><span>Review</span><strong>{client.products.needsReview + client.products.failed}</strong></div></div>
        {client.sources.some((source) => ['QUEUED','PROCESSING'].includes(source.latestJob?.state || '')) && <div className="arrival-progress">{client.sources.filter((source) => ['QUEUED','PROCESSING'].includes(source.latestJob?.state || '')).map((source) => <div key={source.id}><span><Loader2 className="admin-spin" />Extracting {source.originalFilename}</span><strong>{source.latestJob?.progressCurrent || 0} / {source.latestJob?.progressTotal || '…'}</strong><i><em style={{ width: source.latestJob?.progressTotal ? `${Math.min(100, (source.latestJob.progressCurrent / source.latestJob.progressTotal) * 100)}%` : '8%' }} /></i></div>)}</div>}
        <footer><Button variant="secondary" disabled={!client.store} onClick={() => setSourceClientId(client.id)}><FileText />{client.sources.length ? 'Extract / Re-extract' : 'Add Source'}</Button><Button variant="secondary" disabled={!client.products.total} onClick={() => setReviewClientId(client.id)}><Eye />View Products</Button><Button disabled={!client.products.total} onClick={() => setReviewClientId(client.id)}><Check />Review</Button></footer>
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
    <Modal open={confirmOpen} eyebrow="AYROVI CRM" title="Confirm Arrival" onClose={() => !confirmBusy && setConfirmOpen(false)} footer={<><Button variant="secondary" disabled={confirmBusy} onClick={() => setConfirmOpen(false)}>Annuler</Button><Button busy={confirmBusy} onClick={() => void confirm()}><CheckCircle2 />Confirmer définitivement</Button></>}><div className="arrival-confirm-copy"><AlertCircle /><div><strong>Valider {detail.name} ?</strong><p>Le serveur vérifiera les clients, Stores, jobs, champs requis et approbations. Après confirmation, cet Arrival sera verrouillé. Aucune opération Warehouse ne sera déclenchée.</p></div></div></Modal>
    <SourceModal client={sourceClient} stores={stores} open={Boolean(sourceClientId)} canWrite={canWrite && detail.status !== 'CONFIRMED'} onClose={() => setSourceClientId('')} onChanged={() => loadDetail(true)} />
    <ProductReviewModal client={reviewClient} open={Boolean(reviewClientId)} canWrite={canWrite && detail.status !== 'CONFIRMED'} onClose={() => setReviewClientId('')} onChanged={() => { void loadDetail(true); }} />
    {toast && <Toast {...toast} />}
  </>;
}
