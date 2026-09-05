/**
 * AYROVI Administration — Catalogue screens (P2.1).
 *
 * Additive only: the legacy « Produits » and « Marques » screens (the generic CRUD loop on
 * /api/admin/products and /api/admin/brands) are untouched and keep working. These three
 * screens are the canonical catalogue surface — they talk to /api/admin/catalogue/*, where
 * the product row IS the storefront row (one product, not a copy), the SKU is unique in the
 * database, the category tree is data, and nothing is ever hard-deleted: the delete button
 * archives.
 *
 * Permission is not decided here. The server answers 403 for anything the caller's role is
 * not granted; /catalogue/meta only mirrors those grants so a button can be greyed out
 * instead of failing after a click.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, ApiError, queryString } from './api';
import {
  Button, ConfirmDialog, DataTable, Field, Filters, Form, ImageUploader, Modal,
  Pagination, Search, Select, StatusBadge, Toast,
} from './components';


type ToastValue = { message: string; tone: 'success' | 'error' } | null;
type Capabilities = Record<string, Record<string, boolean>>;

const PageHeader: React.FC<{ title: string; description: string; action?: React.ReactNode }> = ({ title, description, action }) => (
  <div className="admin-page-header"><div><span className="admin-eyebrow">AYROVI CATALOGUE</span><h1>{title}</h1><p>{description}</p></div>{action}</div>
);
const options = (values: Array<string | { value: string; label: string }>) =>
  values.map((value) => (typeof value === 'string' ? { value, label: value } : value));
const rowsOf = (value: any): any[] => (Array.isArray(value?.data) ? value.data : Array.isArray(value) ? value : []);
const emptyToNull = (value: string) => { const trimmed = String(value ?? '').trim(); return trimmed === '' ? null : trimmed; };

/** One hook for the three screens: data / error / loading / reload, and a 403 that stays visible. */
function useCatalogue<T = any>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const run = useCallback(() => {
    let active = true;
    setLoading(true);
    loader()
      .then((value) => { if (!active) return; setData(value); setError(''); setDenied(false); })
      .catch((e: any) => {
        if (!active) return;
        setError(e?.message || 'Chargement impossible.');
        setDenied(e instanceof ApiError && e.status === 403);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => run(), [run]);
  return { data, error, denied, loading, reload: run };
}

/** The catalogue API answers {success:false, code, error, details:[{field,reason}]}. */
function fieldErrors(error: unknown): { message: string; byField: Record<string, string> } {
  const byField: Record<string, string> = {};
  if (!(error instanceof ApiError)) return { message: error instanceof Error ? error.message : '', byField };
  const details: any[] = Array.isArray((error as any).details) ? (error as any).details : [];
  for (const detail of details) if (detail?.field) byField[String(detail.field)] = String(detail.reason || 'invalide');
  return { message: error.message, byField };
}

const Denied: React.FC<{ message: string }> = ({ message }) => (
  <section className="admin-list-card"><p className="admin-block-small">Accès refusé par le moteur de permissions ERP — votre rôle ne porte pas le droit
    <code> catalog:…</code> correspondant. Message du serveur: « {message} ». Ce n’est pas un bug de l’écran: les droits se gèrent dans
    « Rôles & permissions ».</p></section>
);

/* ============================ Vocabulaire partagé ============================ */

interface Meta {
  productStatuses: string[];
  variantStatuses: string[];
  mediaTypes: string[];
  brandCategories: string[];
  resources: string[];
  capabilities: Capabilities;
}

function useCatalogueMeta() {
  const state = useCatalogue<Meta>(() => adminApi<any>('/catalogue/meta').then((r) => r.data), []);
  const meta = state.data;
  const can = useCallback((resource: string, action: string) => Boolean(meta?.capabilities?.[resource]?.[action]), [meta]);
  return { meta, can, error: state.error, denied: state.denied, loading: state.loading };
}

/* ============================ Produits ============================ */

interface Draft {
  name: string; slug: string; description: string; brand_id: string; category_id: string;
  status: string; product_type: string; image: string; source_url: string; source_platform: string;
  currency: string; stock_status: string; express_available: string;
}
const emptyDraft: Draft = {
  name: '', slug: '', description: '', brand_id: '', category_id: '', status: 'DRAFT',
  product_type: 'STANDARD', image: '', source_url: '', source_platform: 'OTHER', currency: 'TND',
  stock_status: '', express_available: 'false',
};

export const CatalogueProductsPage: React.FC = () => {
  const { meta, can, denied: metaDenied, error: metaError } = useCatalogueMeta();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<ToastValue>(null);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; id?: string } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [byField, setByField] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [archiveFor, setArchiveFor] = useState<any | null>(null);
  const [reason, setReason] = useState('');

  const categories = useCatalogue<any[]>(() => adminApi<any>('/catalogue/categories').then((r) => rowsOf(r)), []);
  const brands = useCatalogue<any[]>(() => adminApi<any>('/catalogue/brands?pageSize=100').then((r) => rowsOf(r)), []);
  const declared = useCatalogue<any[]>(() => adminApi<any>('/catalogue/attributes').then((r) => rowsOf(r)), []);
  const query = useMemo(
    () => queryString({ search, status, brand_id: brandId, category_id: categoryId, include_archived: status === 'ARCHIVED' ? 1 : '', page, page_size: 20 }),
    [search, status, brandId, categoryId, page],
  );
  const list = useCatalogue<any>(() => adminApi<any>(`/catalogue/products?${query}`), [query]);
  const rows = rowsOf(list.data);
  const pagination = list.data?.pagination || { page: 1, total: rows.length, totalPages: 1 };
  const writable = can('product', 'create') || can('product', 'update');
  const productAttributes = useMemo(() => rows0(declared.data).filter((entry) => entry.applies_to === 'product'), [declared.data]);

  const openCreate = () => {
    setDraft(emptyDraft); setAttributes({}); setFormError(''); setByField({}); setEditor({ mode: 'create' });
  };
  const openEdit = async (row: any) => {
    setBusy(true);
    try {
      const full = (await adminApi<any>(`/catalogue/products/${row.id}`)).data;
      setDraft({
        name: full.name || '', slug: full.slug || '', description: full.description || '',
        brand_id: full.brand_id || '', category_id: full.category_id || '', status: full.status || 'DRAFT',
        product_type: full.product_type || 'STANDARD', image: full.image || '', source_url: full.source_url || '',
        source_platform: full.source_platform || 'OTHER', currency: full.currency || 'TND',
        stock_status: full.stock_status || '', express_available: Number(full.express_available) === 1 ? 'true' : 'false',
      });
      setAttributes(full.attributes || {});
      setFormError(''); setByField({}); setEditor({ mode: 'edit', id: full.id });
    } catch (e: any) { setToast({ message: e?.message || 'Lecture impossible.', tone: 'error' }); } finally { setBusy(false); }
  };
  // Called by the form (Enter key) and by the modal footer button alike.
  const save = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    setBusy(true); setFormError('');
    const body: Record<string, unknown> = {
      name: draft.name, description: emptyToNull(draft.description), slug: emptyToNull(draft.slug),
      brand_id: emptyToNull(draft.brand_id), category_id: emptyToNull(draft.category_id),
      status: draft.status, product_type: draft.product_type, image: emptyToNull(draft.image),
      source_url: emptyToNull(draft.source_url), source_platform: draft.source_platform,
      currency: draft.currency, stock_status: emptyToNull(draft.stock_status),
      express_available: draft.express_available === 'true',
      attributes,
    };
    try {
      if (editor?.mode === 'edit' && editor.id) await adminApi(`/catalogue/products/${editor.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await adminApi('/catalogue/products', { method: 'POST', body: JSON.stringify(body) });
      setEditor(null);
      list.reload(); categories.reload();
      setToast({ message: editor?.mode === 'edit' ? 'Produit enregistré (différentiel champ par champ).' : 'Produit créé en DRAFT — publier demande catalog:approve.', tone: 'success' });
    } catch (e: any) { const parsed = fieldErrors(e); setFormError(parsed.message); setByField(parsed.byField); } finally { setBusy(false); }
  };
  const archive = async () => {
    if (!archiveFor) return;
    setBusy(true);
    try {
      await adminApi(`/catalogue/products/${archiveFor.id}${queryString({ reason }) ? `?${queryString({ reason })}` : ''}`, { method: 'DELETE' });
      setArchiveFor(null); setReason(''); list.reload();
      setToast({ message: 'Produit archivé: la ligne, son historique et ses liens restent en base.', tone: 'success' });
    } catch (e: any) { setToast({ message: e?.message || 'Archivage refusé.', tone: 'error' }); } finally { setBusy(false); }
  };
  const openDetail = async (row: any) => {
    setBusy(true);
    try { setDetail((await adminApi<any>(`/catalogue/products/${row.id}`)).data); }
    catch (e: any) { setToast({ message: e?.message || 'Fiche introuvable.', tone: 'error' }); } finally { setBusy(false); }
  };

  if (metaDenied || list.denied) return <>
    <PageHeader title="Produits" description="Le produit canonique: une ligne, un code, un slug, ses variantes et ses médias." />
    <Denied message={list.error || metaError} />
  </>;

  // The vocabulary comes from the server (/catalogue/meta) — the screen never invents a status.
  const statuses = meta?.productStatuses || ['DRAFT', 'ACTIVE', 'ARCHIVED'];
  const canPublish = can('product', 'approve');

  return <>
    <PageHeader
      title="Produits"
      description="Le produit canonique du catalogue: une ligne, un code PRD-, un slug, ses variantes/SKU, ses médias et ses attributs. Rien n’est dupliqué pour le site ni pour le CRM."
      action={can('product', 'create') ? <Button onClick={openCreate}>Nouveau produit</Button> : null}
    />
    <section className="admin-list-card">
      <div className="admin-list-toolbar">
        <Search value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Nom, code produit ou SKU…" />
        <Filters>
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} options={[{ value: '', label: 'Tous les statuts' }, ...options(statuses)]} />
          <Select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }} options={[{ value: '', label: 'Toutes les catégories' }, ...rows0(categories.data).map((row) => ({ value: row.id, label: `${'— '.repeat(Number(row.depth || 0))}${row.name}` }))]} />
          <Select value={brandId} onChange={(event) => { setBrandId(event.target.value); setPage(1); }} options={[{ value: '', label: 'Toutes les marques' }, ...rows0(brands.data).map((row) => ({ value: row.id, label: row.name }))]} />
        </Filters>
      </div>
      <DataTable
        rows={rows} loading={list.loading}
        onRowClick={openDetail}
        columns={[
          { key: 'name', label: 'Produit', render: (row: any) => <div className="admin-cell-media">{row.image ? <img src={row.image} alt="" /> : <i className="admin-cell-placeholder" />}<div><strong>{row.name}</strong><small className="admin-block-small"><code>{row.product_code || '—'}</code> · /{row.slug}</small></div></div> },
          { key: 'brand_name', label: 'Marque', render: (row: any) => row.brand_name || '—' },
          { key: 'category', label: 'Catégorie', render: (row: any) => row.category || '—' },
          { key: 'variant_count', label: 'SKU', render: (row: any) => <strong>{Number(row.variant_count || 0)}</strong> },
          { key: 'status', label: 'Statut', render: (row: any) => <StatusBadge status={row.status} /> },
          { key: 'updated_at', label: 'Mis à jour', render: (row: any) => <small>{String(row.updated_at || '').slice(0, 16).replace('T', ' ')}</small> },
          {
            key: 'action', label: '', render: (row: any) => (
              <div className="admin-row-actions admin-row-actions--labels">
                {can('product', 'update') && <Button variant="ghost" onClick={(event) => { event.stopPropagation(); openEdit(row); }}>Modifier</Button>}
                {can('product', 'delete') && row.status !== 'ARCHIVED' && <Button variant="ghost" onClick={(event) => { event.stopPropagation(); setArchiveFor(row); setReason(''); }}>Archiver</Button>}
              </div>
            ),
          },
        ]}
      />
      <Pagination {...pagination} onChange={setPage} />
    </section>
    {list.error && !list.denied && <p className="admin-block-small">{list.error}</p>}

    <Modal
      wide open={Boolean(editor)} title={editor?.mode === 'edit' ? 'Modifier le produit' : 'Nouveau produit'} onClose={() => setEditor(null)}
      footer={<><Button variant="secondary" onClick={() => setEditor(null)}>Annuler</Button><Button busy={busy} onClick={() => void save()}>{editor?.mode === 'edit' ? 'Enregistrer' : 'Créer en brouillon'}</Button></>}
    >
      <Form onSubmit={save}>
        <p className="admin-block-small">Le statut pilote la visibilité: <strong>DRAFT</strong> reste interne, <strong>ACTIVE</strong> est une publication
          (droit <code>catalog:approve</code>), <strong>ARCHIVED</strong> retire des listes sans rien effacer. Les prix ne se saisissent pas ici: ils restent
          dans « Prix & taux ».</p>
        {formError && <p className="admin-field-error">{formError}</p>}
        <div className="admin-form-row">
          <Field label="Nom" required full error={byField.name}><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></Field>
          <Field label="Slug" hint={editor?.mode === 'edit' ? 'Vide = inchangé. Un slug pris est refusé (409), jamais volé.' : 'Vide = généré depuis le nom; en cas de collision, un suffixe est ajouté.'} full error={byField.slug}>
            <input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} placeholder="baskets-route-homme" />
          </Field>
        </div>
        <Field label="Description" full error={byField.description}><textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
        <div className="admin-form-row">
          <Field label="Marque" full error={byField.brand_id}><Select value={draft.brand_id} onChange={(event) => setDraft({ ...draft, brand_id: event.target.value })} options={[{ value: '', label: '— sans marque —' }, ...rows0(brands.data).map((row) => ({ value: row.id, label: row.name }))]} /></Field>
          <Field label="Catégorie" full error={byField.category_id}><Select value={draft.category_id} onChange={(event) => setDraft({ ...draft, category_id: event.target.value })} options={[{ value: '', label: '— non classé —' }, ...rows0(categories.data).map((row) => ({ value: row.id, label: `${'— '.repeat(Number(row.depth || 0))}${row.name}` }))]} /></Field>
        </div>
        <div className="admin-form-row">
          <Field label="Statut" full hint={!canPublish ? 'Publier (ACTIVE) demande catalog:approve — sans ce droit, le serveur refusera ce statut.' : undefined} error={byField.status}>
            <Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} options={options(statuses)} />
          </Field>
          <Field label="Type de produit" hint="STANDARD ou Bundle — la mécanique de lot vient plus tard" full error={byField.product_type}>
            <Select value={draft.product_type} onChange={(event) => setDraft({ ...draft, product_type: event.target.value })} options={options(['STANDARD', 'BUNDLE'])} />
          </Field>
        </div>
        <div className="admin-form-row">
          <Field label="Plateforme source" full error={byField.source_platform}><Select value={draft.source_platform} onChange={(event) => setDraft({ ...draft, source_platform: event.target.value })} options={options(['SHEIN', 'AMAZON', 'TEMU', 'ALIEXPRESS', 'OTHER'])} /></Field>
          <Field label="Devise" full error={byField.currency}><input value={draft.currency} maxLength={3} onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} /></Field>
        </div>
        <div className="admin-form-row">
          <Field label="URL source" full error={byField.source_url}><input value={draft.source_url} onChange={(event) => setDraft({ ...draft, source_url: event.target.value })} placeholder="https://…" /></Field>
          <Field label="Disponibilité (vitrine)" hint="état, pas quantité — le stock vient dans P6" full error={byField.stock_status}>
            <Select value={draft.stock_status} onChange={(event) => setDraft({ ...draft, stock_status: event.target.value })} options={[{ value: '', label: '— non précisé —' }, ...options(['AVAILABLE', 'LIMITED', 'OUT_OF_STOCK'])]} />
          </Field>
          <Field label="Express" full error={byField.express_available}><Select value={draft.express_available} onChange={(event) => setDraft({ ...draft, express_available: event.target.value })} options={options([{ value: 'true', label: 'Oui' }, { value: 'false', label: 'Non' }])} /></Field>
        </div>
        <Field label="Image principale" full hint="Publique uniquement: un document privé est refusé par la politique média.">
          <ImageUploader value={draft.image} onChange={(value) => setDraft({ ...draft, image: value })} />
        </Field>
        {productAttributes.length > 0 && (
          <div className="admin-form-row">
            {productAttributes.map((attribute: any) => (
              <Field key={attribute.id} label={attribute.label || attribute.attribute_key} full={attribute.data_type === 'TEXTAREA'} error={byField[`attribute:${attribute.attribute_key}`]}>
                {attribute.data_type === 'SELECT'
                  ? <Select value={attributes[attribute.attribute_key] || ''} onChange={(event) => setAttributes({ ...attributes, [attribute.attribute_key]: event.target.value })} options={[{ value: '', label: '—' }, ...options((attribute.options || []).map(String))]} />
                  : <input value={attributes[attribute.attribute_key] || ''} onChange={(event) => setAttributes({ ...attributes, [attribute.attribute_key]: event.target.value })} />}
              </Field>
            ))}
          </div>
        )}
      </Form>
    </Modal>

    <Modal wide open={Boolean(detail)} title={detail ? `Fiche — ${detail.name}` : 'Fiche'} onClose={() => setDetail(null)}>
      {detail && <ProductDetail product={detail} can={can} onChanged={() => { openDetail({ id: detail.id }); list.reload(); }} onToast={setToast} />}
    </Modal>

    <Modal
      open={Boolean(archiveFor)} title="Archiver ce produit" onClose={() => setArchiveFor(null)}
      footer={<><Button variant="secondary" onClick={() => setArchiveFor(null)}>Annuler</Button><Button variant="danger" busy={busy} onClick={() => void archive()}>Archiver</Button></>}
    >
      <p className="admin-confirm-message">{`« ${archiveFor?.name} » passera en ARCHIVED: retiré des listes, jamais effacé. Ses variantes, ses médias, les lignes de commandes et son journal d’audit restent intacts; le retour en ACTIVE demande le droit d’approbation.`}</p>
      <Field label="Motif (facultatif, journalisé avec la décision)" full><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="fin de collection, doublon de catalogue…" /></Field>
    </Modal>
    {toast && <Toast {...toast} />}
    {!writable && <p className="admin-block-small">Lecture seule: votre rôle ne porte pas catalog:create/update sur product.</p>}
  </>;
};

const rows0 = (value: any): any[] => (Array.isArray(value) ? value : []);

const ProductDetail: React.FC<{ product: any; can: (resource: string, action: string) => boolean; onChanged: () => void; onToast: (value: ToastValue) => void }> = ({ product, can, onChanged, onToast }) => {
  const [tab, setTab] = useState<'variants' | 'media'>('variants');
  const [variantDraft, setVariantDraft] = useState({ sku: '', barcode: '', size: '', color: '', status: 'ACTIVE', position: '100' });
  const [mediaDraft, setMediaDraft] = useState({ media_type: 'IMAGE', url: '', alt_text: '', sort_order: '0', variant_id: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [byField, setByField] = useState<Record<string, string>>({});

  const submit = async (path: string, body: Record<string, unknown>) => {
    setBusy(true); setError('');
    try { await adminApi(path, { method: 'POST', body: JSON.stringify(body) }); onChanged(); return true; }
    catch (e: any) { const parsed = fieldErrors(e); setError(parsed.message); setByField(parsed.byField); return false; } finally { setBusy(false); }
  };
  const act = async (method: 'PUT' | 'DELETE', path: string, success: string) => {
    setBusy(true); setError('');
    try { await adminApi(path, { method }); onToast({ message: success, tone: 'success' }); onChanged(); }
    catch (e: any) { setError(e?.message || 'Action refusée.'); } finally { setBusy(false); }
  };

  return <>
    <div className="admin-detail-grid">
      <div><span>Code</span><strong><code>{product.product_code || '—'}</code></strong></div>
      <div><span>Slug</span><strong><code>/{product.slug || '—'}</code></strong></div>
      <div><span>Statut</span><strong><StatusBadge status={product.status} /></strong></div>
      <div><span>Marque</span><strong>{product.brand?.name || product.brand_name || '—'}</strong></div>
      <div><span>Catégorie</span><strong>{product.category?.name || product.category || '—'}</strong></div>
      <div><span>Prix affiché</span><strong>{Number(product.final_price || 0).toFixed(3)} {product.currency || 'TND'}<small className="admin-block-small">calculé par le moteur de tarification</small></strong></div>
      <div><span>Créé par</span><strong>{product.created_by || '—'}</strong></div>
      <div><span>Modifié par</span><strong>{product.updated_by || '—'}</strong></div>
    </div>
    {rows0(product.attributes ? Object.entries(product.attributes) : []).length > 0 && (
      <p className="admin-block-small">Attributs produit: {Object.entries<string>(product.attributes || {}).map(([key, value]) => <code key={key}>{key}={value}</code>)} </p>
    )}
    <div className="admin-tabs">
      <button type="button" className={tab === 'variants' ? 'is-active' : ''} onClick={() => setTab('variants')}>Variantes & SKU ({rows0(product.variants).length})</button>
      <button type="button" className={tab === 'media' ? 'is-active' : ''} onClick={() => setTab('media')}>Médias ({rows0(product.media).length})</button>
    </div>
    {error && <p className="admin-field-error">{error}</p>}

    {tab === 'variants' && <>
      <DataTable
        rows={rows0(product.variants)}
        emptyText="Aucune variante: créez-en une pour ouvrir le premier SKU de ce produit."
        columns={[
          { key: 'sku', label: 'SKU', render: (row: any) => <code>{row.sku}</code> },
          { key: 'barcode', label: 'Code-barres', render: (row: any) => row.barcode || '—' },
          { key: 'size', label: 'Taille', render: (row: any) => row.size || '—' },
          { key: 'color', label: 'Couleur', render: (row: any) => row.color || '—' },
          { key: 'status', label: 'Statut', render: (row: any) => <StatusBadge status={row.status} /> },
          { key: 'attributes', label: 'Attributs', render: (row: any) => <small>{Object.entries<string>(row.attributes || {}).map(([key, value]) => `${key}=${value}`).join(' · ') || '—'}</small> },
          { key: 'action', label: '', render: (row: any) => (row.status !== 'ARCHIVED' && can('variant', 'delete')
            ? <Button variant="ghost" onClick={() => act('DELETE', `/catalogue/variants/${row.id}`, 'Variante archivée — le SKU reste réservé, il ne sera jamais réattribué.')}>Retirer</Button>
            : <small className="admin-block-small">—</small>) },
        ]}
      />
      {can('variant', 'create') && (
        <Form className="admin-inline-form" onSubmit={(event) => { event.preventDefault(); submit(`/catalogue/products/${product.id}/variants`, { ...variantDraft, position: Number(variantDraft.position), sku: variantDraft.sku }).then(() => setVariantDraft({ sku: '', barcode: '', size: '', color: '', status: 'ACTIVE', position: '100' })); }}>
          <Field label="SKU" required error={byField.sku} hint="unique en base, insensitive à la casse"><input value={variantDraft.sku} onChange={(event) => setVariantDraft({ ...variantDraft, sku: event.target.value.toUpperCase() })} required /></Field>
          <Field label="Code-barres" error={byField.barcode}><input value={variantDraft.barcode} onChange={(event) => setVariantDraft({ ...variantDraft, barcode: event.target.value })} /></Field>
          <Field label="Taille" error={byField.size}><input value={variantDraft.size} onChange={(event) => setVariantDraft({ ...variantDraft, size: event.target.value })} /></Field>
          <Field label="Couleur" error={byField.color}><input value={variantDraft.color} onChange={(event) => setVariantDraft({ ...variantDraft, color: event.target.value })} /></Field>
          <Field label="Statut" error={byField.status}><Select value={variantDraft.status} onChange={(event) => setVariantDraft({ ...variantDraft, status: event.target.value })} options={options(['DRAFT', 'ACTIVE', 'INACTIVE'])} /></Field>
          <Field label="Position" error={byField.position}><input type="number" min={0} max={9999} value={variantDraft.position} onChange={(event) => setVariantDraft({ ...variantDraft, position: event.target.value })} /></Field>
          <Button type="submit" busy={busy}>Ajouter la variante</Button>
        </Form>
      )}
      <p className="admin-block-small">Les valeurs d’attribut d’une variante se lisent ici et s’écrivent par l’API (<code>attributes</code> dans la charge utile de la variante) —
        l’éditeur d’attributs par variante arrive avec l’écran de saisie de stock, pour ne pas saisir deux fois la même chose.</p>
    </>}

    {tab === 'media' && <>
      <DataTable
        rows={rows0(product.media)}
        emptyText="Aucun média rattaché."
        columns={[
          { key: 'url', label: 'Aperçu', render: (row: any) => <div className="admin-cell-media"><img src={row.url} alt="" /><i className="admin-cell-placeholder" /></div> },
          { key: 'media_type', label: 'Type', render: (row: any) => row.media_type },
          { key: 'url', label: 'URL', render: (row: any) => <small><code>{row.url}</code></small> },
          { key: 'is_primary', label: 'Principal', render: (row: any) => (Number(row.is_primary) === 1 ? <strong>oui</strong> : '—') },
          { key: 'action', label: '', render: (row: any) => (
            <div className="admin-row-actions admin-row-actions--labels">
              {can('product_media', 'update') && Number(row.is_primary) !== 1 && <Button variant="ghost" onClick={() => act('PUT', `/catalogue/media/${row.id}/primary`, 'Média principal mis à jour (miroir produits.image).')}>Définir principal</Button>}
              {can('product_media', 'delete') && <Button variant="ghost" onClick={() => act('DELETE', `/catalogue/media/${row.id}`, 'Référence média retirée — le fichier sur le disque n’est jamais touché.')}>Retirer</Button>}
            </div>
          ) },
        ]}
      />
      {can('product_media', 'create') && (
        <Form className="admin-inline-form" onSubmit={(event) => { event.preventDefault(); submit(`/catalogue/products/${product.id}/media`, { ...mediaDraft, sort_order: Number(mediaDraft.sort_order), variant_id: emptyToNull(mediaDraft.variant_id), is_primary: rows0(product.media).length === 0 }).then(() => setMediaDraft({ ...mediaDraft, url: '', alt_text: '' })); }}>
          <Field label="Type" error={byField.media_type}><Select value={mediaDraft.media_type} onChange={(event) => setMediaDraft({ ...mediaDraft, media_type: event.target.value })} options={options(['IMAGE', 'VIDEO', '3D', 'DOCUMENT'])} /></Field>
          <Field label="URL" required full error={byField.url} hint="http(s) ou /uploads/… public — un chemin privé est refusé"><input value={mediaDraft.url} onChange={(event) => setMediaDraft({ ...mediaDraft, url: event.target.value })} required /></Field>
          <Field label="Texte alternatif" error={byField.alt_text}><input value={mediaDraft.alt_text} onChange={(event) => setMediaDraft({ ...mediaDraft, alt_text: event.target.value })} /></Field>
          <Field label="Variante liée" error={byField.variant_id}><Select value={mediaDraft.variant_id} onChange={(event) => setMediaDraft({ ...mediaDraft, variant_id: event.target.value })} options={[{ value: '', label: 'produit entier' }, ...rows0(product.variants).map((row: any) => ({ value: row.id, label: row.sku }))]} /></Field>
          <Field label="Ordre" error={byField.sort_order}><input type="number" min={0} max={999} value={mediaDraft.sort_order} onChange={(event) => setMediaDraft({ ...mediaDraft, sort_order: event.target.value })} /></Field>
          <Field label="Image" full><ImageUploader value={mediaDraft.url} onChange={(value) => setMediaDraft({ ...mediaDraft, url: value })} label="Téléverser (publié)" /></Field>
          <Button type="submit" busy={busy}>Attacher le média</Button>
        </Form>
      )}
    </>}
  </>;
};

/* ============================ Catégories ============================ */

export const CatalogueCategoriesPage: React.FC = () => {
  const { can, denied, error } = useCatalogueMeta();
  const [includeArchived, setIncludeArchived] = useState(true);
  const [toast, setToast] = useState<ToastValue>(null);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; id?: string } | null>(null);
  const [draft, setDraft] = useState({ name: '', slug: '', parent_id: '', sort_order: '100', description: '', status: 'ACTIVE' });
  const [formError, setFormError] = useState('');
  const [byField, setByField] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [archiveFor, setArchiveFor] = useState<any | null>(null);

  const tree = useCatalogue<any>(() => adminApi<any>('/catalogue/categories?shape=tree'), [includeArchived]);
  const flat = useMemo(() => flatten(rows0(tree.data?.tree)), [tree.data]);
  const list = useMemo(() => rows0(tree.data?.flat), [tree.data]);
  const visible = includeArchived ? list : list.filter((row) => row.status !== 'ARCHIVED');

  const openCreate = (parentId = '') => {
    setDraft({ name: '', slug: '', parent_id: parentId, sort_order: '100', description: '', status: 'ACTIVE' });
    setFormError(''); setByField({}); setEditor({ mode: 'create' });
  };
  const openEdit = (row: any) => {
    setDraft({ name: row.name, slug: row.slug || '', parent_id: row.parent_id || '', sort_order: String(row.sort_order ?? 100), description: row.description || '', status: row.status || 'ACTIVE' });
    setFormError(''); setByField({}); setEditor({ mode: 'edit', id: row.id });
  };
  const save = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault(); setBusy(true); setFormError('');
    const body = {
      name: draft.name, slug: emptyToNull(draft.slug), parent_id: emptyToNull(draft.parent_id),
      sort_order: Number(draft.sort_order), description: emptyToNull(draft.description), status: draft.status,
    };
    try {
      if (editor?.mode === 'edit' && editor.id) await adminApi(`/catalogue/categories/${editor.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await adminApi('/catalogue/categories', { method: 'POST', body: JSON.stringify(body) });
      setEditor(null); tree.reload();
      setToast({ message: 'Catégorie enregistrée.', tone: 'success' });
    } catch (e: any) { const parsed = fieldErrors(e); setFormError(parsed.message); setByField(parsed.byField); } finally { setBusy(false); }
  };
  const archive = async () => {
    if (!archiveFor) return;
    setBusy(true);
    try {
      await adminApi(`/catalogue/categories/${archiveFor.id}`, { method: 'DELETE' });
      setArchiveFor(null); tree.reload();
      setToast({ message: 'Catégorie archivée (ses enfants remontent d’un niveau dans la lecture, rien n’est supprimé).', tone: 'success' });
    } catch (e: any) { setToast({ message: e?.message || 'Archivage refusé — des produits sont peut-être encore rattachés.', tone: 'error' }); setArchiveFor(null); } finally { setBusy(false); }
  };

  if (denied || tree.denied) return <><PageHeader title="Catégories" description="Arborescence du catalogue." /><Denied message={tree.error || error} /></>;

  return <>
    <PageHeader
      title="Catégories"
      description="Hiérarchie libre: « Homme », « Femme », « Enfant » sont des lignes de cette table, pas du code. Profondeur, ordre et statut sont des données."
      action={can('category', 'create') ? <Button onClick={() => openCreate()}>Nouvelle catégorie</Button> : null}
    />
    <section className="admin-list-card">
      <div className="admin-list-toolbar">
        <Filters>
          <label className="admin-check"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Inclure les archivées</label>
        </Filters>
      </div>
      <DataTable
        rows={visible} loading={tree.loading}
        columns={[
          { key: 'name', label: 'Catégorie', render: (row: any) => <span style={{ paddingLeft: `${Number(row.depth || 0) * 16}px` }}><strong>{row.name}</strong> <small className="admin-block-small"><code>/{row.slug}</code></small></span> },
          { key: 'parent_id', label: 'Parent', render: (row: any) => (row.parent_id ? (list.find((entry) => entry.id === row.parent_id)?.name || row.parent_id) : <em>racine</em>) },
          { key: 'depth', label: 'Niveau', render: (row: any) => Number(row.depth || 0) + 1 },
          { key: 'sort_order', label: 'Ordre' },
          { key: 'product_count', label: 'Produits', render: (row: any) => <strong>{Number(row.product_count || 0)}</strong> },
          { key: 'status', label: 'Statut', render: (row: any) => <StatusBadge status={row.status} /> },
          {
            key: 'action', label: '', render: (row: any) => (
              <div className="admin-row-actions admin-row-actions--labels">
                {can('category', 'create') && <Button variant="ghost" onClick={() => openCreate(row.id)}>Sous-catégorie</Button>}
                {can('category', 'update') && <Button variant="ghost" onClick={() => openEdit(row)}>Modifier</Button>}
                {can('category', 'delete') && row.status !== 'ARCHIVED' && <Button variant="ghost" onClick={() => setArchiveFor(row)}>Archiver</Button>}
              </div>
            ),
          },
        ]}
      />
      {tree.error && <p className="admin-block-small">{tree.error}</p>}
    </section>

    <Modal
      open={Boolean(editor)} title={editor?.mode === 'edit' ? 'Modifier la catégorie' : 'Nouvelle catégorie'} onClose={() => setEditor(null)}
      footer={<><Button variant="secondary" onClick={() => setEditor(null)}>Annuler</Button><Button busy={busy} onClick={() => void save()}>Enregistrer</Button></>}
    >
      <Form onSubmit={save}>
        {formError && <p className="admin-field-error">{formError}</p>}
        <Field label="Nom" required full error={byField.name}><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></Field>
        <Field label="Slug" hint="Vide = généré; collision = suffixe, jamais d’écrasement" full error={byField.slug}><input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} /></Field>
        <Field label="Parent" full error={byField.parent_id} hint="Un parent qui est un descendant est refusé (boucle impossible); le garde-fou de profondeur est un anti-boucle, pas une limite métier.">
          <Select value={draft.parent_id} onChange={(event) => setDraft({ ...draft, parent_id: event.target.value })} options={[{ value: '', label: '— racine —' }, ...visible.filter((row) => row.id !== editor?.id).map((row) => ({ value: row.id, label: `${'— '.repeat(Number(row.depth || 0))}${row.name}` }))]} />
        </Field>
        <div className="admin-form-row">
          <Field label="Ordre d’affichage" error={byField.sort_order}><input type="number" min={0} max={9999} value={draft.sort_order} onChange={(event) => setDraft({ ...draft, sort_order: event.target.value })} /></Field>
          <Field label="Statut" error={byField.status}><Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} options={options(['ACTIVE', 'INACTIVE', 'ARCHIVED'])} /></Field>
        </div>
        <Field label="Description" full error={byField.description}><textarea rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
        <div className="admin-modal-actions">
          <Button variant="secondary" type="button" onClick={() => setEditor(null)}>Annuler</Button>
          <Button type="submit" busy={busy}>Enregistrer</Button>
        </div>
      </Form>
    </Modal>

    <ConfirmDialog
      open={Boolean(archiveFor)} title="Archiver cette catégorie"
      message={`« ${archiveFor?.name} » passera en ARCHIVED. Les produits encore rattachés bloquent l’archivage: réaffectez-les d’abord.`}
      confirmLabel="Archiver" busy={busy} onConfirm={archive} onCancel={() => setArchiveFor(null)}
    />
    {toast && <Toast {...toast} />}
  </>;
};

function flatten(nodes: any[], depth = 0): any[] {
  const out: any[] = [];
  for (const node of nodes || []) {
    out.push({ ...node, depth: Number.isFinite(Number(node.depth)) ? Number(node.depth) : depth });
    if (Array.isArray(node.children) && node.children.length) out.push(...flatten(node.children, depth + 1));
  }
  return out;
}

/* ============================ Marques ============================ */

export const CatalogueBrandsPage: React.FC = () => {
  const { meta, can, denied, error } = useCatalogueMeta();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<ToastValue>(null);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; id?: string } | null>(null);
  const [draft, setDraft] = useState({ name: '', slug: '', description: '', logo: '', image: '', url: '', category: 'FASHION', display_order: '100', status: 'ACTIVE' });
  const [formError, setFormError] = useState('');
  const [byField, setByField] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const query = useMemo(() => queryString({ search, page, page_size: 20 }), [search, page]);
  const list = useCatalogue<any>(() => adminApi<any>(`/catalogue/brands?${query}`), [query]);
  const rows = rowsOf(list.data);
  const pagination = list.data?.pagination || { page: 1, total: rows.length, totalPages: 1 };

  const openCreate = () => {
    setDraft({ name: '', slug: '', description: '', logo: '', image: '', url: '', category: 'FASHION', display_order: '100', status: 'ACTIVE' });
    setFormError(''); setByField({}); setEditor({ mode: 'create' });
  };
  const openEdit = (row: any) => {
    setDraft({
      name: row.name || '', slug: row.slug || '', description: row.description || '', logo: row.logo || '', image: row.image || '',
      url: row.url || '', category: row.category || 'FASHION', display_order: String(row.display_order ?? 100),
      status: Number(row.active) === 1 ? 'ACTIVE' : 'INACTIVE',
    });
    setFormError(''); setByField({}); setEditor({ mode: 'edit', id: row.id });
  };
  const save = async (event?: { preventDefault: () => void }) => {
    event?.preventDefault(); setBusy(true); setFormError('');
    const body = {
      name: draft.name, slug: emptyToNull(draft.slug), description: emptyToNull(draft.description),
      logo: emptyToNull(draft.logo), image: emptyToNull(draft.image), url: emptyToNull(draft.url),
      category: draft.category, display_order: Number(draft.display_order), status: draft.status,
    };
    try {
      if (editor?.mode === 'edit' && editor.id) await adminApi(`/catalogue/brands/${editor.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await adminApi('/catalogue/brands', { method: 'POST', body: JSON.stringify(body) });
      setEditor(null); list.reload();
      setToast({ message: 'Marque enregistrée — référence canonique des produits.', tone: 'success' });
    } catch (e: any) { const parsed = fieldErrors(e); setFormError(parsed.message); setByField(parsed.byField); } finally { setBusy(false); }
  };

  if (denied || list.denied) return <><PageHeader title="Marques" description="Référence canonique des marques." /><Denied message={list.error || error} /></>;

  return <>
    <PageHeader
      title="Marques"
      description={`Une seule table de marques pour tout le monde: produits, vitrine et CMS lisent la même ligne. Retirer une marque du catalogue se fait en la passant INACTIVE — aucune suppression physique dans cette phase.`}
      action={can('brand', 'create') ? <Button onClick={openCreate}>Nouvelle marque</Button> : null}
    />
    <section className="admin-list-card">
      <div className="admin-list-toolbar">
        <Search value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Nom de la marque…" />
        <Filters>{meta?.brandCategories ? <p className="admin-block-small">Familles: {meta.brandCategories.join(' · ')}</p> : null}</Filters>
      </div>
      <DataTable
        rows={rows} loading={list.loading}
        columns={[
          { key: 'logo', label: '', render: (row: any) => (row.logo || row.image ? <div className="admin-cell-media"><img src={row.logo || row.image} alt="" /></div> : null) },
          { key: 'name', label: 'Marque', render: (row: any) => <div><strong>{row.name}</strong><small className="admin-block-small"><code>/{row.slug || '—'}</code>{row.url ? <> · <a href={row.url} target="_blank" rel="noopener noreferrer">site</a></> : null}</small></div> },
          { key: 'category', label: 'Famille' },
          { key: 'product_count', label: 'Produits', render: (row: any) => <strong>{Number(row.product_count || 0)}</strong> },
          { key: 'display_order', label: 'Ordre' },
          { key: 'active', label: 'Statut', render: (row: any) => <StatusBadge status={Number(row.active) === 1 ? 'ACTIVE' : 'INACTIVE'} /> },
          { key: 'action', label: '', render: (row: any) => (can('brand', 'update') ? <Button variant="ghost" onClick={() => openEdit(row)}>Modifier</Button> : null) },
        ]}
      />
      <Pagination {...pagination} onChange={setPage} />
      {list.error && !list.denied && <p className="admin-block-small">{list.error}</p>}
    </section>

    <Modal
      open={Boolean(editor)} title={editor?.mode === 'edit' ? 'Modifier la marque' : 'Nouvelle marque'} onClose={() => setEditor(null)}
      footer={<><Button variant="secondary" onClick={() => setEditor(null)}>Annuler</Button><Button busy={busy} onClick={() => void save()}>Enregistrer</Button></>}
    >
      <Form onSubmit={save}>
        {formError && <p className="admin-field-error">{formError}</p>}
        <Field label="Nom" required full error={byField.name}><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></Field>
        <Field label="Slug" hint="généré si vide, collision = suffixe" full error={byField.slug}><input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} /></Field>
        <div className="admin-form-row">
          <Field label="Famille" error={byField.category}><Select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} options={options(meta?.brandCategories || ['FASHION', 'SPORT_LIFESTYLE', 'BEAUTY', 'TECH', 'HOME', 'OTHER'])} /></Field>
          <Field label="Ordre" error={byField.display_order}><input type="number" min={0} max={9999} value={draft.display_order} onChange={(event) => setDraft({ ...draft, display_order: event.target.value })} /></Field>
          <Field label="Statut" error={byField.status}><Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} options={options(['ACTIVE', 'INACTIVE'])} /></Field>
        </div>
        <Field label="Site / référence" full error={byField.url}><input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://…" /></Field>
        <Field label="Description" full error={byField.description}><textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
        <div className="admin-form-row">
          <Field label="Logo" full><ImageUploader value={draft.logo} onChange={(value) => setDraft({ ...draft, logo: value })} /></Field>
          <Field label="Bannière" full><ImageUploader value={draft.image} onChange={(value) => setDraft({ ...draft, image: value })} /></Field>
        </div>
        <div className="admin-modal-actions">
          <Button variant="secondary" type="button" onClick={() => setEditor(null)}>Annuler</Button>
          <Button type="submit" busy={busy}>Enregistrer</Button>
        </div>
      </Form>
    </Modal>
    {toast && <Toast {...toast} />}
  </>;
};
