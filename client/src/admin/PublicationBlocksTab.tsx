/**
 * CRM → Social → Publication : composition de la page Publication de l'application.
 *
 * Remplace l'ancien éditeur de posts (refonte du 13/11/2026). Chaque ligne est un
 * BLOC, rendu tel quel sur le téléphone, dans l'ordre de la liste :
 *   • Conteneur coloré + rangée de produits ;
 *   • Image ou vidéo + rangée de produits (le même modèle sert les deux) ;
 *   • Duo sponsorisé : image + encart coloré à gauche, carte produit à droite,
 *     deux cartes de même taille.
 *
 * La couleur de fond se choisit avec le sélecteur complet du navigateur (toute
 * couleur), un champ #RRGGBB et un nuancier rapide. L'éditeur affiché est
 * toujours « zayrovi team ». Aucun bouton d'interaction n'est proposé.
 *
 * Le serveur reste juge : il revalide le modèle, la couleur, les liens et la
 * vendabilité des produits ; un produit retiré du catalogue disparaît du bloc.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Heart, Pencil, Plus, Trash2, X } from '../components/QatafoIcons';
import { adminApi } from './api';
import { Button, DataTable, Field, Modal, StatusBadge, Switch } from './components';
import { uploadMediaFile } from './mediaUpload';
import { normalizeMediaLink } from '../../../shared/mediaLinks';
import {
  PUBLICATION_BLOCK_DEFAULT_COLOR,
  PUBLICATION_BLOCK_KINDS,
  PUBLICATION_BLOCK_KIND_LABELS,
  PUBLICATION_BLOCK_LIMITS,
  PUBLICATION_BLOCK_SWATCHES,
  PUBLICATION_PREVIEW_INK,
  PUBLICATION_PREVIEW_PAPER,
  PUBLICATION_PUBLISHER_NAME,
  containerPanelColor,
  isNearWhite,
  mixColor,
  normalizeHexColor,
  readableInk,
  type PublicationBlockKind,
} from '../../../shared/publicationBlocks';

export interface PublicationBlockForm {
  id?: string;
  kind: PublicationBlockKind;
  title: string;
  subtitle: string;
  bg_color: string;
  panel_color: string;
  sponsored: boolean;
  media_type: '' | 'image' | 'video';
  media_url: string;
  poster_url: string;
  product_ids: string[];
  active: boolean;
}

/** Produit tel que le catalogue du CRM le renvoie (seuls les champs utiles). */
export interface BlockCatalogueProduct {
  id: string;
  name: string;
  image: string | null;
  status: string;
  final_price: number | null;
  currency: string | null;
  brand_name?: string | null;
}

/* Encres de l'aperçu : constantes de l'écran public simulé (pas du chrome admin). */
const INK = PUBLICATION_PREVIEW_INK;
const PAPER = PUBLICATION_PREVIEW_PAPER;
const PREVIEW_WIDTH = 320;
const SCALE = PREVIEW_WIDTH / 360;
/**
 * 13/11 — SYSTÈME DE CARTES de l'app (`apps/mobile/src/design/cardSystem.ts`) :
 * marge 12, écart 8, deux cartes ENTIÈRES à parts égales, rapport 1,44, rayon 12,
 * cœur nu (sans rond blanc). Les trois modèles utilisent la même carte.
 */
export const PREVIEW_CARD = { gutter: 12, gap: 8, ratio: 1.44, radius: 12, heart: 18 } as const;
export const previewCardWidth = (perView = 2) =>
  Math.round((PREVIEW_WIDTH - PREVIEW_CARD.gutter * SCALE * 2 - PREVIEW_CARD.gap * SCALE * (perView - 1)) / perView);
const G = PREVIEW_CARD.gutter * SCALE;

export const emptyBlock = (kind: PublicationBlockKind = 'container'): PublicationBlockForm => ({
  kind,
  title: '',
  subtitle: '',
  bg_color: PUBLICATION_BLOCK_DEFAULT_COLOR[kind],
  panel_color: '',
  sponsored: kind === 'sponsored_pair',
  media_type: kind === 'media' ? 'image' : '',
  media_url: '',
  poster_url: '',
  product_ids: [],
  active: true,
});

const isSellable = (product: BlockCatalogueProduct) => product.status === 'ACTIVE' && Number(product.final_price) > 0;
const price = (product: BlockCatalogueProduct) => `${Number(product.final_price ?? 0).toFixed(3).replace('.', ',')} ${product.currency || 'TND'}`;

/** Validation côté CRM (le serveur refait tout) : messages en français, avant l'envoi. */
export function blockFormError(form: PublicationBlockForm): string {
  if (form.title.trim().length < 2) return 'Le titre est obligatoire (2 caractères minimum).';
  if (!normalizeHexColor(form.bg_color)) return 'Couleur de fond invalide (format #RRGGBB).';
  if (form.kind === 'container' && form.panel_color && !normalizeHexColor(form.panel_color)) return 'Couleur du panneau invalide (format #RRGGBB).';
  if ((form.kind === 'media' || form.kind === 'sponsored_pair') && !form.media_url.trim()) {
    return form.kind === 'media' ? 'Ajoutez une image ou une vidéo.' : 'Ajoutez l’image de la carte sponsorisée.';
  }
  const limits = PUBLICATION_BLOCK_LIMITS.products[form.kind];
  if (form.product_ids.length < limits.min) {
    return form.kind === 'sponsored_pair' ? 'Choisissez le ou les deux produits affichés sous l’image.' : 'Choisissez au moins un produit pour la rangée.';
  }
  return '';
}

/* ── Aperçu téléphone (même anatomie que l'application) ─────────────────── */

/**
 * LA carte produit des blocs (système de cartes, 13/11) : cadre gris arrondi,
 * photo ENTIÈRE (`contain`), cœur NU en haut à droite (il ne cache pas la
 * photo) ; le texte passe SOUS le cadre (Sponsorisé, marque grasse, nom, prix).
 */
function PreviewProduct({ product, width, ink = INK, sponsored = '', testId }: {
  product?: BlockCatalogueProduct; width: number; ink?: string; sponsored?: string; testId?: string;
}) {
  const height = Math.round(width * PREVIEW_CARD.ratio);
  const heart = Math.round(PREVIEW_CARD.heart * SCALE);
  return (
    <div data-testid={testId} style={{ width, height: height + 72, flex: '0 0 auto' }}>
      <div style={{ width, height, background: mixColor(INK, PAPER, 0.95), borderRadius: PREVIEW_CARD.radius * SCALE, overflow: 'hidden', position: 'relative' }}>
        {product?.image ? <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} /> : null}
        <span data-testid="preview-heart" aria-hidden="true" style={{ position: 'absolute', top: 11 * SCALE, right: 11 * SCALE, color: INK, display: 'flex' }}>
          <Heart size={heart} aria-hidden="true" />
        </span>
      </div>
      {product ? (
        <div style={{ paddingTop: 6, color: ink, fontSize: 11, lineHeight: 1.3 }}>
          {sponsored ? <div style={{ opacity: 0.7 }}>{sponsored}</div> : null}
          <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.brand_name || ' '}</div>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</div>
          <div>{price(product)}</div>
        </div>
      ) : null}
    </div>
  );
}

function PreviewMedia({ form, height }: { form: PublicationBlockForm; height: number }) {
  const shown = form.media_type === 'video' ? (form.poster_url || '') : form.media_url;
  return (
    <div style={{ height, borderRadius: 8 * SCALE, overflow: 'hidden', background: mixColor(INK, PAPER, 0.9), position: 'relative' }}>
      {form.media_type === 'video' && form.media_url && !form.poster_url
        ? <video src={form.media_url} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : shown ? <img src={shown} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
      {form.media_type === 'video' ? (
        <span style={{ position: 'absolute', right: 8, bottom: 8, background: INK, color: PAPER, fontSize: 10, padding: '2px 6px', borderRadius: 999 }}>Vidéo</span>
      ) : null}
    </div>
  );
}

/** Aperçu fidèle du bloc, à la largeur d'un téléphone (360 dp ramenés à 320 px). */
export function PublicationBlockPreview({ form, products }: { form: PublicationBlockForm; products: BlockCatalogueProduct[] }) {
  const bg = normalizeHexColor(form.bg_color) ?? PUBLICATION_BLOCK_DEFAULT_COLOR[form.kind];
  const ink = readableInk(bg, INK, PAPER);
  const muted = mixColor(ink, bg, 0.35);
  const sponsored = form.sponsored ? 'Sponsorisé' : '';
  const title = form.title || 'Titre du bloc';
  const frame: React.CSSProperties = { width: PREVIEW_WIDTH, border: '1px solid var(--admin-line)', borderRadius: 16, overflow: 'hidden', background: PAPER };

  if (form.kind === 'container') {
    const panel = normalizeHexColor(form.panel_color) ?? containerPanelColor(bg);
    const panelInk = readableInk(panel, INK, PAPER);
    // 13/11 — système de cartes : deux cartes entières à parts égales, tout sur la marge 12.
    const cardWidth = previewCardWidth();
    return (
      <div style={frame} data-testid="block-preview" data-kind="container">
        <div style={{ background: bg, color: ink, padding: `${16 * SCALE}px ${G}px ${16 * SCALE}px` }}>
          {sponsored ? <div style={{ color: muted, fontSize: 11 }}>{sponsored}</div> : null}
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, marginTop: 6 }}>{title}</div>
          {form.subtitle ? <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{form.subtitle}</div> : null}
        </div>
        {form.media_url ? <div style={{ background: bg, padding: `0 ${G}px ${16 * SCALE}px` }}><PreviewMedia form={{ ...form, media_type: 'image' }} height={Math.round((PREVIEW_WIDTH - 2 * G) / 2.07)} /></div> : null}
        <div style={{ background: panel, padding: `${56 * SCALE}px ${G}px ${16 * SCALE}px` }}>
          <div data-testid="preview-row" style={{ display: 'flex', gap: PREVIEW_CARD.gap * SCALE, overflow: 'hidden' }}>
            {(products.length ? products : [undefined, undefined]).map((product, index) => (
              <PreviewProduct key={product?.id ?? index} product={product} width={cardWidth} ink={panelInk} sponsored={sponsored} />
            ))}
          </div>
          <div style={{ color: panelInk, fontSize: 11, marginTop: 16 * SCALE }}>{PUBLICATION_PUBLISHER_NAME}</div>
        </div>
      </div>
    );
  }

  if (form.kind === 'media') {
    const width = PREVIEW_WIDTH - 2 * G;
    const cardWidth = previewCardWidth();
    const tinted = !isNearWhite(bg);
    return (
      <div style={{ ...frame, background: bg, color: ink, padding: `${tinted ? 16 * SCALE : 8}px ${G}px` }} data-testid="block-preview" data-kind="media">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}>
          <span>{PUBLICATION_PUBLISHER_NAME}</span>
          {sponsored ? <span style={{ color: muted }}>{sponsored}</span> : null}
        </div>
        <PreviewMedia form={form} height={Math.round(width / (form.media_type === 'video' ? 1 : 2.07))} />
        {/* 13/11 : le titre passe sous le média, puis LA carte commune (deux entières). */}
        <div style={{ fontWeight: 700, fontSize: 14, marginTop: 12 * SCALE }}>{title}</div>
        {form.subtitle ? <div style={{ fontSize: 14 }}>{form.subtitle}</div> : null}
        <div data-testid="preview-row" style={{ display: 'flex', gap: PREVIEW_CARD.gap * SCALE, marginTop: 12 * SCALE, overflow: 'hidden' }}>
          {(products.length ? products : [undefined, undefined]).map((product, index) => (
            <PreviewProduct key={product?.id ?? index} product={product} width={cardWidth} ink={ink} />
          ))}
        </div>
      </div>
    );
  }

  // Duo sponsorisé (planche GBox « WE Fashion ») : bandeau + image qui déborde à
  // droite, puis les DEUX cartes du système (marge 12, écart 8, rapport 1,44).
  const tileWidth = previewCardWidth();
  const cards = products.length ? products.slice(0, 2) : [undefined];
  return (
    <div style={frame} data-testid="block-preview" data-kind="sponsored_pair">
      <div style={{ background: bg, color: ink, padding: `${16 * SCALE}px 0 0 ${G}px` }}>
        {sponsored ? <div style={{ color: muted, fontSize: 11 }}>{sponsored}</div> : null}
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, marginTop: 6, paddingRight: G }}>{title}</div>
        {form.subtitle ? <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, paddingRight: G }}>{form.subtitle}</div> : null}
        <div style={{ height: Math.round((PREVIEW_WIDTH - G) / 2.09), marginTop: 16 * SCALE, background: mixColor(INK, PAPER, 0.9) }}>
          {form.media_url ? <img src={form.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
        </div>
      </div>
      <div style={{ display: 'flex', gap: PREVIEW_CARD.gap * SCALE, padding: `${56 * SCALE}px ${G}px ${16 * SCALE}px` }}>
        {cards.map((product, index) => (
          <PreviewProduct
            key={product?.id ?? index}
            testId={index === 0 ? 'pair-left' : 'pair-right'}
            product={product}
            width={tileWidth}
            sponsored={sponsored}
          />
        ))}
        {cards.length === 1 ? <div data-testid="pair-right" style={{ width: tileWidth, height: Math.round(tileWidth * PREVIEW_CARD.ratio) + 72 }} /> : null}
      </div>
    </div>
  );
}

/* ── Champs spécialisés ─────────────────────────────────────────────────── */

/** Palette complète (sélecteur natif) + saisie #RRGGBB + nuancier rapide. */
export function ColorField({ label, value, onChange, allowAuto, autoColor }: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  allowAuto?: boolean;
  autoColor?: string;
}) {
  const normalized = normalizeHexColor(value);
  const shown = normalized ?? autoColor ?? PAPER;
  return (
    <div className="admin-field admin-field--full">
      <span>{label}</span>
      <div className="admin-actions" style={{ marginTop: 0, alignItems: 'center' }}>
        <input type="color" aria-label={`${label} — palette complète`} value={shown.toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())} style={{ width: 44, height: 36, padding: 0, border: '1px solid var(--admin-line)', borderRadius: 8 }} />
        <input aria-label={`${label} — code`} value={value} placeholder={allowAuto ? `Automatique (${autoColor})` : '#RRGGBB'} maxLength={7} onChange={(e) => onChange(e.target.value.trim())} onBlur={() => { if (value && normalizeHexColor(value)) onChange(normalizeHexColor(value)!); }} style={{ width: 120 }} />
        {allowAuto && value ? <Button variant="ghost" onClick={() => onChange('')}>Automatique</Button> : null}
      </div>
      <div className="admin-actions" role="group" aria-label={`${label} — nuancier`} style={{ marginTop: 8, gap: 6 }}>
        {PUBLICATION_BLOCK_SWATCHES.map((swatch) => (
          <button key={swatch} type="button" aria-label={swatch} aria-pressed={normalized === swatch} title={swatch} onClick={() => onChange(swatch)}
            style={{ width: 28, height: 28, borderRadius: 999, background: swatch, cursor: 'pointer', border: normalized === swatch ? '2px solid var(--admin-ink-strong)' : '1px solid var(--admin-line)' }} />
        ))}
      </div>
      {value && !normalized ? <small className="admin-field-error">Format attendu : #RRGGBB</small> : null}
    </div>
  );
}

/** Média : lien (converti/refusé tout de suite) ou téléversement. */
function MediaInput({ label, kind, value, onChange, onError }: {
  label: string;
  kind: 'image' | 'video';
  value: string;
  onChange: (url: string) => void;
  onError: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  return (
    <div className="admin-field admin-field--full">
      <span>{label}</span>
      <div className="admin-actions" style={{ marginTop: 0 }}>
        <input aria-label={label} value={value} placeholder="URL ou téléversement" style={{ flex: 1 }}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            if (!value.trim()) return;
            const link = normalizeMediaLink(value, kind);
            if (link.ok === false) onError(link.error); else onChange(link.url);
          }} />
        <label className="admin-button admin-button--secondary" style={{ cursor: 'pointer' }}>
          <ArrowUp size={14} />{uploading ? 'Envoi…' : 'Téléverser'}
          <input type="file" hidden accept={kind === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp'}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try { onChange(await uploadMediaFile(file)); } catch (error: any) { onError(error?.message || 'Téléversement impossible.'); }
              finally { setUploading(false); e.target.value = ''; }
            }} />
        </label>
      </div>
    </div>
  );
}

/** Produits du bloc : recherche dans le catalogue (vendables seulement), ordre, retrait. */
function BlockProductsField({ kind, ids, products, onChange }: {
  kind: PublicationBlockKind;
  ids: string[];
  products: BlockCatalogueProduct[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BlockCatalogueProduct[]>([]);
  const [error, setError] = useState('');
  const max = PUBLICATION_BLOCK_LIMITS.products[kind].max;
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); return undefined; }
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ search: term, status: 'ACTIVE', page_size: '8' });
      adminApi<any>(`/catalogue/products?${params.toString()}`)
        .then((r) => { setError(''); setResults(((r?.data || []) as BlockCatalogueProduct[]).filter(isSellable)); })
        .catch(() => setError('Recherche impossible. Vérifiez vos droits sur le catalogue.'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const add = (id: string) => {
    if (ids.includes(id)) return;
    onChange([...ids, id].slice(0, max));
    setQuery('');
  };
  const move = (index: number, delta: number) => {
    const next = [...ids];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const byId = new Map(products.map((p) => [p.id, p]));

  return (
    <div className="admin-field admin-field--full">
      <span>{kind === 'sponsored_pair' ? `Produits sous l’image (${ids.length}/${max})` : `Produits de la rangée (${ids.length}/${max})`}<em>*</em></span>
      {ids.length ? (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          {ids.map((id, index) => {
            const product = byId.get(id);
            return (
              <li key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--admin-line)', borderRadius: 10, padding: 6 }}>
                {product?.image ? <img src={product.image} alt="" style={{ width: 36, height: 48, objectFit: 'cover', borderRadius: 6 }} /> : null}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{product?.brand_name || '—'}</strong> {product?.name || id}
                  {product ? <span className="admin-block-small"> · {price(product)}</span> : <span className="admin-block-small"> · introuvable</span>}
                </span>
                {max > 1 ? <>
                  <Button variant="ghost" aria-label="Monter" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></Button>
                  <Button variant="ghost" aria-label="Descendre" disabled={index === ids.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></Button>
                </> : null}
                <Button variant="ghost" aria-label="Retirer" onClick={() => onChange(ids.filter((x) => x !== id))}><X size={14} /></Button>
              </li>
            );
          })}
        </ol>
      ) : <small>Aucun produit choisi.</small>}
      {ids.length < max ? (
        <input aria-label="Rechercher un produit" value={query} placeholder="Rechercher par nom, marque ou référence…" onChange={(e) => setQuery(e.target.value)} style={{ marginTop: 8 }} />
      ) : null}
      {error ? <small className="admin-field-error">{error}</small> : null}
      {results.length ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', display: 'grid', gap: 4 }}>
          {results.map((product) => (
            <li key={product.id}>
              <Button variant="secondary" disabled={ids.includes(product.id)} onClick={() => add(product.id)} style={{ width: '100%', justifyContent: 'flex-start' }}>
                <Plus size={14} />{product.brand_name ? `${product.brand_name} — ` : ''}{product.name} · {price(product)}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ── Onglet ─────────────────────────────────────────────────────────────── */

const toForm = (row: any): PublicationBlockForm => ({
  id: row.id,
  kind: row.kind,
  title: row.title || '',
  subtitle: row.subtitle || '',
  bg_color: row.bg_color || PUBLICATION_BLOCK_DEFAULT_COLOR[row.kind as PublicationBlockKind],
  panel_color: row.panel_color || '',
  sponsored: Boolean(row.sponsored),
  media_type: row.media_type || '',
  media_url: row.media_url || '',
  poster_url: row.poster_url || '',
  product_ids: Array.isArray(row.product_ids) ? row.product_ids : [],
  active: row.active !== false,
});

/** Lit (et garde en mémoire) les fiches catalogue citées par les blocs. */
function useCatalogueProducts(ids: string[]) {
  const [cache, setCache] = useState<Record<string, BlockCatalogueProduct | null>>({});
  const key = ids.join(',');
  useEffect(() => {
    const missing = ids.filter((id) => !(id in cache));
    if (!missing.length) return;
    let alive = true;
    Promise.all(missing.map((id) => adminApi<any>(`/catalogue/products/${encodeURIComponent(id)}`).then((r) => r?.data ?? null).catch(() => null)))
      .then((rows) => { if (alive) setCache((current) => ({ ...current, ...Object.fromEntries(missing.map((id, i) => [id, rows[i]])) })); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useMemo(() => ids.map((id) => cache[id]).filter(Boolean) as BlockCatalogueProduct[], [key, cache]);
}

export const PublicationBlocksTab: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<PublicationBlockForm | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  const load = useCallback(() => {
    adminApi<any>('/publication-blocks').then((r) => { setRows(r.data || []); setError(''); }).catch(() => setError('Impossible de charger les blocs Publication.'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const allIds = useMemo(() => Array.from(new Set([...rows.flatMap((r) => r.product_ids || []), ...(form?.product_ids ?? [])])), [rows, form?.product_ids]);
  const products = useCatalogueProducts(allIds);
  const productsFor = (ids: string[]) => ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as BlockCatalogueProduct[];

  const patch = (next: Partial<PublicationBlockForm>) => setForm((current) => (current ? { ...current, ...next } : current));
  const changeKind = (kind: PublicationBlockKind) => setForm((current) => {
    if (!current) return current;
    const max = PUBLICATION_BLOCK_LIMITS.products[kind].max;
    const keepColor = current.bg_color && current.bg_color !== PUBLICATION_BLOCK_DEFAULT_COLOR[current.kind];
    return {
      ...current,
      kind,
      bg_color: keepColor ? current.bg_color : PUBLICATION_BLOCK_DEFAULT_COLOR[kind],
      media_type: kind === 'media' ? (current.media_type || 'image') : current.media_url ? 'image' : '',
      poster_url: kind === 'media' ? current.poster_url : '',
      sponsored: kind === 'sponsored_pair' ? true : current.sponsored,
      product_ids: current.product_ids.slice(0, max),
    };
  });

  const save = async () => {
    if (!form || busy) return;
    const message = blockFormError(form);
    if (message) { setFormError(message); return; }
    setBusy('save'); setFormError('');
    const { id, ...body } = form;
    try {
      if (id) await adminApi(`/publication-blocks/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) });
      else await adminApi('/publication-blocks', { method: 'POST', body: JSON.stringify(body) });
      setForm(null); load();
    } catch (reason: any) { setFormError(reason?.message || 'Enregistrement impossible.'); }
    finally { setBusy(''); }
  };

  const reorder = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length || busy) return;
    const ids = rows.map((r) => r.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy('order');
    try { const r = await adminApi<any>('/publication-blocks/order', { method: 'PUT', body: JSON.stringify({ ids }) }); setRows(r.data || []); }
    catch (reason: any) { setError(reason?.message || 'Ordre non enregistré.'); load(); }
    finally { setBusy(''); }
  };

  const toggleActive = async (row: any) => {
    try { await adminApi(`/publication-blocks/${encodeURIComponent(row.id)}`, { method: 'PUT', body: JSON.stringify({ active: !row.active }) }); load(); }
    catch (reason: any) { setError(reason?.message || 'Modification impossible.'); }
  };

  const remove = async (row: any) => {
    if (!window.confirm(`Supprimer le bloc « ${row.title} » ?`)) return;
    try { await adminApi(`/publication-blocks/${encodeURIComponent(row.id)}`, { method: 'DELETE' }); load(); }
    catch (reason: any) { setError(reason?.message || 'Suppression impossible.'); }
  };

  return (
    <section className="admin-card">
      {error ? <div className="admin-error">{error}</div> : null}
      <div className="admin-actions" style={{ marginTop: 0 }}>
        <Button disabled={!canWrite} onClick={() => { setFormError(''); setForm(emptyBlock()); }}><Plus size={15} />Ajouter un bloc</Button>
        <span className="admin-block-small">La page Publication de l’application affiche ces blocs dans cet ordre, sous l’en-tête. Éditeur affiché : « {PUBLICATION_PUBLISHER_NAME} ».</span>
      </div>
      <DataTable
        minWidth={760}
        emptyText="Aucun bloc : la page Publication affiche « Aucune publication pour le moment »."
        rows={rows}
        columns={[
          { key: 'order', label: '#', render: (row: any) => <span className="admin-cell-num">{rows.indexOf(row) + 1}</span> },
          { key: 'color', label: 'Couleur', render: (row: any) => <span aria-label={row.bg_color} title={row.bg_color} style={{ display: 'inline-block', width: 20, height: 20, borderRadius: 999, background: row.bg_color, border: '1px solid var(--admin-line)' }} /> },
          { key: 'title', label: 'Titre', render: (row: any) => <span><strong>{row.title}</strong>{row.subtitle ? <span className="admin-block-small"> — {row.subtitle}</span> : null}</span> },
          { key: 'kind', label: 'Modèle', render: (row: any) => `${PUBLICATION_BLOCK_KIND_LABELS[row.kind as PublicationBlockKind] ?? row.kind}${row.media_type === 'video' ? ' · vidéo' : ''}` },
          { key: 'products', label: 'Produits', align: 'end', render: (row: any) => <span className="admin-cell-num">{(row.product_ids || []).length}</span> },
          { key: 'sponsored', label: 'Sponsorisé', render: (row: any) => (row.sponsored ? 'Oui' : 'Non') },
          { key: 'active', label: 'Statut', render: (row: any) => <StatusBadge status={row.active ? 'ACTIVE' : 'INACTIVE'} /> },
        ]}
        rowActions={[
          { key: 'up', label: 'Monter', icon: <ArrowUp size={14} />, hideLabel: true, disabled: (row: any) => !canWrite || rows.indexOf(row) === 0, onRun: (row: any) => void reorder(rows.indexOf(row), -1) },
          { key: 'down', label: 'Descendre', icon: <ArrowDown size={14} />, hideLabel: true, disabled: (row: any) => !canWrite || rows.indexOf(row) === rows.length - 1, onRun: (row: any) => void reorder(rows.indexOf(row), 1) },
          { key: 'toggle', label: 'Activer / désactiver', disabled: () => !canWrite, onRun: (row: any) => void toggleActive(row) },
          { key: 'edit', label: 'Éditer', icon: <Pencil size={14} />, hideLabel: true, onRun: (row: any) => { setFormError(''); setForm(toForm(row)); } },
          { key: 'delete', label: 'Supprimer', tone: 'danger', icon: <Trash2 size={14} />, hideLabel: true, disabled: () => !canWrite, onRun: (row: any) => void remove(row) },
        ]}
      />
      <Modal open={Boolean(form)} title={form?.id ? 'Éditer le bloc' : 'Nouveau bloc'} eyebrow="Page Publication" wide onClose={() => setForm(null)}
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button><Button busy={busy === 'save'} disabled={!canWrite} onClick={() => void save()}>Enregistrer</Button></>}>
        {form ? (
          <div style={{ display: 'grid', gridTemplateColumns: `minmax(0, 1fr) ${PREVIEW_WIDTH + 2}px`, gap: 24, alignItems: 'start' }}>
            <fieldset disabled={!canWrite} className="admin-grid-2" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              {formError ? <div className="admin-error admin-field--full" role="alert">{formError}</div> : null}
              <div className="admin-field admin-field--full">
                <span>Modèle</span>
                <div className="admin-actions" role="radiogroup" aria-label="Modèle" style={{ marginTop: 0 }}>
                  {PUBLICATION_BLOCK_KINDS.map((kind) => (
                    <Button key={kind} variant="secondary" role="radio" aria-checked={form.kind === kind} aria-pressed={form.kind === kind} onClick={() => changeKind(kind)}>{PUBLICATION_BLOCK_KIND_LABELS[kind]}</Button>
                  ))}
                </div>
              </div>
              <Field label="Titre" required><input maxLength={PUBLICATION_BLOCK_LIMITS.title} value={form.title} onChange={(e) => patch({ title: e.target.value })} /></Field>
              <Field label="Sous-titre"><input maxLength={PUBLICATION_BLOCK_LIMITS.subtitle} value={form.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} /></Field>
              <ColorField label={form.kind === 'container' ? 'Couleur du bandeau' : form.kind === 'sponsored_pair' ? 'Couleur de l’encart' : 'Couleur de fond'} value={form.bg_color} onChange={(bg_color) => patch({ bg_color })} />
              {form.kind === 'container' ? (
                <ColorField label="Couleur du panneau des produits" value={form.panel_color} allowAuto autoColor={containerPanelColor(normalizeHexColor(form.bg_color) ?? PUBLICATION_BLOCK_DEFAULT_COLOR.container)} onChange={(panel_color) => patch({ panel_color })} />
              ) : null}
              {form.kind === 'media' ? (
                <div className="admin-field admin-field--full">
                  <span>Type de média</span>
                  <div className="admin-actions" role="radiogroup" aria-label="Type de média" style={{ marginTop: 0 }}>
                    {(['image', 'video'] as const).map((type) => (
                      <Button key={type} variant="secondary" role="radio" aria-checked={form.media_type === type} aria-pressed={form.media_type === type} onClick={() => patch({ media_type: type, media_url: '', poster_url: '' })}>{type === 'image' ? 'Image' : 'Vidéo'}</Button>
                    ))}
                  </div>
                </div>
              ) : null}
              <MediaInput
                key={`${form.kind}-${form.media_type}`}
                label={form.kind === 'media' ? (form.media_type === 'video' ? 'Vidéo (mp4, webm, mov)' : 'Image (format paysage conseillé)') : form.kind === 'sponsored_pair' ? 'Image de la carte sponsorisée (portrait 2:3)' : 'Image large (facultative)'}
                kind={form.kind === 'media' && form.media_type === 'video' ? 'video' : 'image'}
                value={form.media_url}
                onChange={(media_url) => patch({ media_url, media_type: form.kind === 'media' ? (form.media_type || 'image') : media_url ? 'image' : '' })}
                onError={setFormError}
              />
              {form.kind === 'media' && form.media_type === 'video' ? (
                <MediaInput label="Image de couverture (affichée avant la lecture)" kind="image" value={form.poster_url} onChange={(poster_url) => patch({ poster_url })} onError={setFormError} />
              ) : null}
              <BlockProductsField kind={form.kind} ids={form.product_ids} products={products} onChange={(product_ids) => patch({ product_ids })} />
              <div className="admin-field">
                <span>Mention « Sponsorisé »</span>
                <Switch checked={form.sponsored} onLabel="Affichée" offLabel="Masquée" onChange={() => patch({ sponsored: !form.sponsored })} />
              </div>
              <div className="admin-field">
                <span>Visible dans l’application</span>
                <Switch checked={form.active} onLabel="Actif" offLabel="Inactif" onChange={() => patch({ active: !form.active })} />
              </div>
            </fieldset>
            <div style={{ position: 'sticky', top: 0 }}>
              <div className="admin-block-small" style={{ marginBottom: 8 }}>Aperçu téléphone</div>
              <PublicationBlockPreview form={form} products={productsFor(form.product_ids)} />
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
};
