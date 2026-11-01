/**
 * « Product Integration / ربط المنتج » — bloc commun aux formulaires Reel, Story et Publication.
 *
 *  • Produit à associer : aucun produit, un produit du catalogue, ou un produit temporaire
 *    créé ici (visible seulement avec ce contenu) ;
 *  • Produit : recherche dans le catalogue existant (nom, SKU ou référence) ;
 *    seuls les produits vendables (actifs, avec prix) sont proposés ;
 *  • Après choix : image, nom et prix lus dans le catalogue, changer ou délier ;
 *  • Aperçu : la carte telle qu'elle apparaîtra sur le téléphone, avant publication.
 *
 * Le bloc n'écrit JAMAIS un nom, un prix ou une image dans le contenu : il ne transmet
 * que `content_mode` et `product_id`. La validation finale est faite par le serveur.
 */
import { useEffect, useState } from 'react';
import { adminApi } from './api';
import { Button, Field } from './components';
import { ARTICLE_CARD } from '../../../shared/articleCard';

export type ShoppableKind = 'reel' | 'publication' | 'story';

export interface ProductLinkValue {
  content_mode: 'normal' | 'shoppable';
  product_id: string;
  /**
   * Articles du tiroir, dans l'ordre d'affichage (lot F1, 24/10/2026).
   * Facultatif : un contenu enregistré sans liste garde son comportement d'avant
   * (un seul `product_id`). `product_id` reste le PREMIER article.
   */
  product_ids?: string[];
}

export const EMPTY_PRODUCT_LINK: ProductLinkValue = { content_mode: 'normal', product_id: '' };

interface CatalogueProduct {
  id: string;
  name: string;
  image: string | null;
  status: string;
  final_price: number | null;
  currency: string | null;
  stock_status: string | null;
  product_code: string | null;
  /** Marque dénormalisée du catalogue — absente : la ligne n'est pas rendue. */
  brand_name?: string | null;
  /** `CONTENT` pour un produit temporaire. */
  visibility?: string;
}

/** Même règle que le serveur : actif + prix positif. */
const isSellable = (product: CatalogueProduct) => product.status === 'ACTIVE' && Number(product.final_price) > 0;

const priceLabel = (product: CatalogueProduct) => `${Number(product.final_price ?? 0).toFixed(2)} ${product.currency || 'TND'}`;

type Source = 'none' | 'catalogue' | 'temporary';

const SOURCE_HINT: Record<Source, string> = {
  none: 'Contenu sans produit : aucune carte n’est affichée sur l’application.',
  catalogue: 'Un produit du catalogue est obligatoire. Le prix et l’image sont lus dans le catalogue, jamais recopiés.',
  temporary: 'Produit temporaire : il n’apparaît ni dans le catalogue ni dans la recherche. Il n’est visible qu’avec ce contenu, une fois publié.',
};

export function ProductIntegration({ kind, value, onChange }: {
  kind: ShoppableKind;
  value: ProductLinkValue;
  onChange: (next: ProductLinkValue) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogueProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState<CatalogueProduct | null>(null);
  const [selectedMissing, setSelectedMissing] = useState(false);
  const [changing, setChanging] = useState(false);
  const [source, setSource] = useState<Source>(value.content_mode === 'shoppable' ? 'catalogue' : 'none');
  const [linked, setLinked] = useState<CatalogueProduct[]>([]);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<CatalogueProduct[]>([]);
  const [linkedBusy, setLinkedBusy] = useState(false);
  const [creating, setCreating] = useState({ name: '', image: '', price: '', currency: 'TND' });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');

  // Charge le produit déjà lié (édition) : nom, image et prix viennent du catalogue.
  useEffect(() => {
    let alive = true;
    setSelected(null); setSelectedMissing(false);
    if (value.content_mode !== 'shoppable' || !value.product_id) return undefined;
    adminApi<any>(`/catalogue/products/${encodeURIComponent(value.product_id)}`)
      .then((r) => {
        if (!alive) return;
        setSelected(r?.data ?? null);
        if (r?.data?.visibility === 'CONTENT') setSource('temporary');
      })
      .catch(() => { if (alive) setSelectedMissing(true); });
    return () => { alive = false; };
  }, [value.content_mode, value.product_id]);

  /**
   * Liste des articles : on lit chaque carte dans le CATALOGUE (nom, image, prix),
   * jamais depuis le contenu. Un produit supprimé est simplement écarté — il ne
   * bloque pas l'enregistrement du reste, et l'admin le voit disparaître.
   */
  useEffect(() => {
    const ids = value.product_ids ?? [];
    if (value.content_mode !== 'shoppable' || ids.length === 0) { setLinked([]); return undefined; }
    let alive = true;
    setLinkedBusy(true);
    Promise.all(ids.map((id) => adminApi<any>(`/catalogue/products/${encodeURIComponent(id)}`)
      .then((r) => r?.data ?? null)
      .catch(() => null)))
      .then((rows) => { if (alive) setLinked(rows.filter(Boolean) as CatalogueProduct[]); })
      .finally(() => { if (alive) setLinkedBusy(false); });
    return () => { alive = false; };
  }, [value.content_mode, (value.product_ids ?? []).join(',')]);

  /** Ajoute un article à la liste (sans doublon) et met `product_id` en tête. */
  const addToLinked = (product: CatalogueProduct) => {
    const ids = value.product_ids ?? (value.product_id ? [value.product_id] : []);
    if (ids.includes(product.id)) return;
    const next = [...ids, product.id];
    onChange({ content_mode: 'shoppable', product_id: next[0], product_ids: next });
  };

  /** Retire un article. Retirer le premier promeut le suivant — la liste reste ordonnée. */
  const removeFromLinked = (productId: string) => {
    const ids = (value.product_ids ?? []).filter((id) => id !== productId);
    onChange({
      content_mode: ids.length > 0 ? 'shoppable' : value.content_mode,
      product_id: ids[0] ?? '',
      product_ids: ids,
    });
  };

  const moveLinked = (productId: string, delta: number) => {
    const ids = [...(value.product_ids ?? [])];
    const index = ids.indexOf(productId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    onChange({ content_mode: 'shoppable', product_id: ids[0], product_ids: ids });
  };

  /** Recherche « ajouter un article » : même filtre que le produit principal. */
  useEffect(() => {
    const term = addQuery.trim();
    if (value.content_mode !== 'shoppable' || term.length < 2) { setAddResults([]); return undefined; }
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ search: term, status: 'ACTIVE', page_size: '6' });
      adminApi<any>(`/catalogue/products?${params.toString()}`)
        .then((r) => setAddResults((r?.data || []).filter(isSellable)))
        .catch(() => setAddResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [addQuery, value.content_mode]);

  // Recherche avec un léger délai : une requête par pause de frappe.
  // Seul le catalogue est cherché ici ; les produits temporaires ne s'y trouvent pas.
  useEffect(() => {
    if (value.content_mode !== 'shoppable' || source !== 'catalogue') return undefined;
    const term = query.trim();
    if (term.length < 2) { setResults([]); setSearchError(''); return undefined; }
    const timer = window.setTimeout(() => {
      setSearching(true); setSearchError('');
      const params = new URLSearchParams({ search: term, status: 'ACTIVE', page_size: '8' });
      adminApi<any>(`/catalogue/products?${params.toString()}`)
        .then((r) => setResults((r?.data || []).filter(isSellable)))
        .catch(() => setSearchError('Recherche impossible. Vérifiez vos droits sur le catalogue.'))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, value.content_mode, source]);

  const chooseSource = (next: Source) => {
    setQuery(''); setChanging(false); setCreateError(''); setSource(next);
    if (next === 'none') { onChange({ content_mode: 'normal', product_id: '' }); return; }
    // Garder le produit déjà lié seulement s'il appartient à la même famille.
    const sameFamily = selected && (next === 'temporary' ? selected.visibility === 'CONTENT' : selected.visibility !== 'CONTENT');
    onChange({ content_mode: 'shoppable', product_id: sameFamily ? value.product_id : '' });
  };

  const pick = (product: CatalogueProduct) => {
    setSelected(product); setSelectedMissing(false); setQuery(''); setResults([]); setChanging(false);
    setSource(product.visibility === 'CONTENT' ? 'temporary' : 'catalogue');
    const existing = (value.product_ids ?? []).filter((id) => id !== product.id);
    onChange({ content_mode: 'shoppable', product_id: product.id, product_ids: [product.id, ...existing] });
  };

  const unlink = () => {
    setSelected(null); setChanging(false);
    onChange({ content_mode: value.content_mode, product_id: '', product_ids: [] });
  };

  // Création rapide d'un produit temporaire, publié et associé en une étape. Un brouillon
  // se prépare dans « Produits temporaires » ; il ne peut être lié à un contenu qu'une fois publié.
  const createTemporary = async () => {
    setCreateBusy(true); setCreateError('');
    try {
      const response = await adminApi<any>('/catalogue/content-products', {
        method: 'POST',
        body: JSON.stringify({
          name: creating.name.trim(),
          image: creating.image.trim() || null,
          original_price: Number(creating.price),
          currency: creating.currency.trim().toUpperCase() || 'TND',
          status: 'ACTIVE',
          source_platform: 'OTHER',
          product_type: 'STANDARD',
        }),
      });
      pick(response.data as CatalogueProduct);
      setCreating({ name: '', image: '', price: '', currency: 'TND' });
    } catch (e: any) {
      setCreateError(e?.message || 'Création refusée. Vérifiez le nom, le prix et vos droits.');
    } finally {
      setCreateBusy(false);
    }
  };

  const shoppable = value.content_mode === 'shoppable';
  const hasLink = shoppable && Boolean(value.product_id);
  const canCreate = creating.name.trim().length >= 2 && Number(creating.price) > 0 && !createBusy;

  return (
    <Field label="Produit à associer / ربط المنتج" full>
      <div style={{ display: 'grid', gap: 12 }}>
        <div role="radiogroup" aria-label="Produit à associer" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant={source === 'none' ? undefined : 'ghost'} onClick={() => chooseSource('none')}>Aucun produit</Button>
          <Button variant={source === 'catalogue' ? undefined : 'ghost'} onClick={() => chooseSource('catalogue')}>Produit du catalogue</Button>
          <Button variant={source === 'temporary' ? undefined : 'ghost'} onClick={() => chooseSource('temporary')}>Créer un produit temporaire</Button>
        </div>
        <small style={{ opacity: 0.75 }}>{SOURCE_HINT[source]}</small>

        {shoppable ? (
          <>
            {hasLink && selected ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', border: '1px solid var(--bo-line)', borderRadius: 12, padding: 10 }}>
                {selected.image ? <img src={selected.image} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }} /> : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{selected.name}</strong>
                  <div style={{ fontSize: 13 }}>
                    {priceLabel(selected)}{selected.product_code ? ` · réf. ${selected.product_code}` : ''}
                    {selected.visibility === 'CONTENT' ? ' · produit temporaire' : ''}
                  </div>
                </div>
                <Button variant="ghost" onClick={() => setChanging(true)}>Changer</Button>
                <Button variant="ghost" onClick={unlink}>Délier</Button>
              </div>
            ) : null}

            {hasLink && selectedMissing ? (
              <div role="alert" style={{ color: 'var(--bo-danger)' }}>
                Le produit lié est introuvable dans le catalogue. Choisissez-en un autre avant d’enregistrer.
                <div><Button variant="ghost" onClick={unlink}>Délier</Button></div>
              </div>
            ) : null}

            {source === 'catalogue' && (!hasLink || changing) ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <input
                  aria-label="Rechercher un produit"
                  placeholder="Nom, SKU ou référence du produit"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {searching ? <small>Recherche…</small> : null}
                {searchError ? <small style={{ color: 'var(--bo-danger)' }}>{searchError}</small> : null}
                {results.length > 0 ? (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                    {results.map((product) => (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => pick(product)}
                          style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'center', textAlign: 'start', padding: 8, border: '1px solid var(--bo-line)', borderRadius: 10, background: 'var(--ayrovi-white)', cursor: 'pointer' }}
                        >
                          {product.image ? <img src={product.image} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} /> : null}
                          <span style={{ flex: 1 }}>
                            <strong>{product.name}</strong>
                            <span style={{ display: 'block', fontSize: 12, opacity: 0.8 }}>
                              {priceLabel(product)}{product.product_code ? ` · réf. ${product.product_code}` : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {!searching && query.trim().length >= 2 && results.length === 0 && !searchError ? (
                  <small>Aucun produit vendable ne correspond (produits actifs avec prix uniquement).</small>
                ) : null}
              </div>
            ) : null}

            {source === 'temporary' && (!hasLink || changing) ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <input
                  aria-label="Nom du produit temporaire"
                  placeholder="Nom du produit"
                  value={creating.name}
                  onChange={(e) => setCreating({ ...creating, name: e.target.value })}
                />
                <input
                  aria-label="Image du produit temporaire"
                  placeholder="URL d’image publique (https://…) — facultatif"
                  value={creating.image}
                  onChange={(e) => setCreating({ ...creating, image: e.target.value })}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    aria-label="Prix d’origine"
                    type="number" min="0" step="0.01"
                    placeholder="Prix d’origine"
                    value={creating.price}
                    onChange={(e) => setCreating({ ...creating, price: e.target.value })}
                  />
                  <input
                    aria-label="Devise"
                    maxLength={3}
                    value={creating.currency}
                    onChange={(e) => setCreating({ ...creating, currency: e.target.value.toUpperCase() })}
                  />
                </div>
                {createError ? <small role="alert" style={{ color: 'var(--bo-danger)' }}>{createError}</small> : null}
                <div>
                  <Button busy={createBusy} disabled={!canCreate} onClick={() => void createTemporary()}>Publier et associer</Button>
                </div>
              </div>
            ) : null}

            {hasLink ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>Articles du tiroir ({linked.length || 1})</strong>
                  <small style={{ opacity: 0.75 }}>L’ordre ici = l’ordre à l’écran</small>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                  {(linked.length > 0 ? linked : selected ? [selected] : []).map((product, index, list) => (
                    <li
                      key={product.id}
                      style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid var(--bo-line)', borderRadius: 10, padding: 8 }}
                    >
                      <span style={{ fontSize: 11, opacity: 0.6, width: 14 }}>{index + 1}</span>
                      {product.image ? <img src={product.image} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, background: 'var(--bo-sunken)' }} /> : null}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontSize: 13 }}>{product.name}</strong>
                        <span style={{ display: 'block', fontSize: 12, opacity: 0.8 }}>{priceLabel(product)}</span>
                      </span>
                      <Button variant="ghost" disabled={index === 0} onClick={() => moveLinked(product.id, -1)} aria-label={`Monter ${product.name}`}>↑</Button>
                      <Button variant="ghost" disabled={index === list.length - 1} onClick={() => moveLinked(product.id, 1)} aria-label={`Descendre ${product.name}`}>↓</Button>
                      <Button variant="ghost" onClick={() => removeFromLinked(product.id)} aria-label={`Retirer ${product.name}`}>Retirer</Button>
                    </li>
                  ))}
                </ul>
                {linkedBusy ? <small>Chargement des articles…</small> : null}

                <input
                  aria-label="Ajouter un article au tiroir"
                  placeholder="Ajouter un article (nom, SKU ou référence)"
                  value={addQuery}
                  onChange={(e) => setAddQuery(e.target.value)}
                />
                {addResults.length > 0 ? (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                    {addResults.map((product) => (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => { addToLinked(product); setAddQuery(''); setAddResults([]); }}
                          style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'center', textAlign: 'start', padding: 8, border: '1px solid var(--bo-line)', borderRadius: 10, background: 'var(--ayrovi-white)', cursor: 'pointer' }}
                        >
                          {product.image ? <img src={product.image} alt="" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6, background: 'var(--bo-sunken)' }} /> : null}
                          <span style={{ flex: 1 }}>
                            <strong style={{ fontSize: 13 }}>{product.name}</strong>
                            <span style={{ display: 'block', fontSize: 12, opacity: 0.8 }}>{priceLabel(product)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <ProductCardPreview kind={kind} product={hasLink ? selected : null} />
          </>
        ) : null}
      </div>
    </Field>
  );
}

/**
 * Aperçu de la carte telle qu'elle s'affichera sur le téléphone.
 *
 * Décision du 24/10/2026 : **module retenu = la carte entière est pressable**,
 * sans bouton d’action séparé. Cet aperçu ne réinvente rien : il reprend les cotes
 * canoniques (`shared/articleCard.ts`, elles-mêmes contrôlées contre la maquette
 * `docs/design/reel/assets/card.css`) et la même règle de données que
 * l'application — une information absente disparaît.
 */
export function ProductCardPreview({ kind, product }: { kind: ShoppableKind; product: CatalogueProduct | null }) {
  const [pressed, setPressed] = useState(false);
  const dark = kind !== 'publication';
  const frame: React.CSSProperties = dark
    ? { background: 'var(--ayrovi-ink-deep)', color: 'var(--ayrovi-white)' }
    : { background: 'var(--ayrovi-white)', color: 'var(--ayrovi-ink-deep)', border: '1px solid var(--bo-line)' };

  if (!product) {
    return (
      <div>
        <small style={{ opacity: 0.75 }}>Aperçu sur le téléphone</small>
        <div style={{ ...frame, marginTop: 6, borderRadius: 16, padding: 12, maxWidth: 360 }}>
          <div style={{ fontSize: 12, opacity: 0.8, textAlign: 'center', padding: 8 }}>
            Aucun produit : aucune carte ne sera affichée.
          </div>
        </div>
      </div>
    );
  }

  const price = Number.isFinite(Number(product.final_price)) && Number(product.final_price) > 0
    ? `${Number(product.final_price).toFixed(2)} ${product.currency || 'TND'}`
    : null;
  const brand = product.brand_name?.trim() ? product.brand_name.trim() : null;
  const unavailable = product.stock_status === 'OUT_OF_STOCK';
  const label = [brand, product.name, price].filter(Boolean).join(' — ');

  return (
    <div>
      <small style={{ opacity: 0.75 }}>Aperçu sur le téléphone</small>
      <div style={{ ...frame, marginTop: 6, borderRadius: 16, padding: 12, maxWidth: 360, display: 'grid', gap: 8 }}>
        {kind === 'reel' ? <div style={{ height: 90, borderRadius: 10, background: 'var(--ayrovi-text-secondary)' }} /> : null}
        {kind === 'story' ? <div style={{ height: 4, borderRadius: 2, background: 'var(--ayrovi-text-secondary)' }} /> : null}
        {kind === 'publication' ? <div style={{ height: 70, borderRadius: 10, background: 'var(--bo-sunken)' }} /> : null}

        <button
          type="button"
          aria-label={label}
          data-article-card=""
          onClick={() => setPressed(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: ARTICLE_CARD.gap,
            width: '100%', maxWidth: ARTICLE_CARD.width, height: ARTICLE_CARD.height,
            padding: ARTICLE_CARD.padding, boxSizing: 'border-box',
            background: 'var(--ayrovi-white)', color: 'var(--ayrovi-ink-deep)',
            border: '1px solid var(--bo-line)', borderRadius: ARTICLE_CARD.radius,
            textAlign: 'start', cursor: 'pointer', font: 'inherit',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: ARTICLE_CARD.thumb, height: ARTICLE_CARD.thumb, flex: '0 0 auto',
              borderRadius: ARTICLE_CARD.thumbRadius, background: 'var(--bo-sunken)',
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {product.image ? (
              <img src={product.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : null}
          </span>
          <span style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingTop: 2 }}>
            <span>
              {brand ? (
                <span style={{ display: 'block', fontSize: ARTICLE_CARD.brandSize, fontWeight: 700, letterSpacing: '-.01em' }}>{brand}</span>
              ) : null}
              <span style={{
                display: '-webkit-box', WebkitLineClamp: ARTICLE_CARD.titleLines, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', fontSize: ARTICLE_CARD.titleSize, lineHeight: 1.3, fontWeight: 400,
              }}>{product.name}</span>
            </span>
            <span style={{ display: 'grid', gap: 2 }}>
              {price ? <span style={{ fontSize: ARTICLE_CARD.priceSize, fontWeight: 600 }}>{price}</span> : null}
              {unavailable ? <span style={{ fontSize: 12, opacity: 0.7 }}>Actuellement indisponible</span> : null}
            </span>
          </span>
        </button>

        <small style={{ opacity: 0.75 }}>
          {pressed
            ? 'Appui : la fiche produit s’ouvre dans l’application (/product/[id]).'
            : 'La carte entière est l’action : aucun bouton séparé.'}
        </small>
      </div>
    </div>
  );
}

