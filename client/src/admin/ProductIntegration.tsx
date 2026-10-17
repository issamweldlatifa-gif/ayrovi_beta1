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

export type ShoppableKind = 'reel' | 'publication' | 'story';

export interface ProductLinkValue {
  content_mode: 'normal' | 'shoppable';
  product_id: string;
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
    onChange({ content_mode: 'shoppable', product_id: product.id });
  };

  const unlink = () => {
    setSelected(null); setChanging(false);
    onChange({ content_mode: value.content_mode, product_id: '' });
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

            <ProductCardPreview kind={kind} product={hasLink ? selected : null} />
          </>
        ) : null}
      </div>
    </Field>
  );
}

/**
 * Aperçu de la carte telle qu'elle s'affichera sur le téléphone.
 * Sans produit vendable, l'aperçu l'indique : rien ne sera affiché.
 */
export function ProductCardPreview({ kind, product }: { kind: ShoppableKind; product: CatalogueProduct | null }) {
  const dark = kind !== 'publication';
  const frame = dark ? { background: 'var(--ayrovi-ink-deep)', color: 'var(--ayrovi-white)' } : { background: 'var(--ayrovi-white)', color: 'var(--ayrovi-ink-deep)', border: '1px solid var(--bo-line)' };
  const card = product ? (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 8, borderRadius: 12, background: dark ? 'var(--ayrovi-white)' : 'var(--bo-sunken)', color: 'var(--ayrovi-ink-deep)' }}>
      {product.image ? <img src={product.image} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }} /> : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--bo-line)' }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</div>
        <div style={{ fontSize: 12 }}>{priceLabel(product)}</div>
      </div>
      <span style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid var(--ayrovi-ink-deep)', fontSize: 12, fontWeight: 700 }}>Découvrir</span>
    </div>
  ) : (
    <div style={{ fontSize: 12, opacity: 0.8, textAlign: 'center', padding: 8 }}>Aucun produit : aucune carte ne sera affichée.</div>
  );
  return (
    <div>
      <small style={{ opacity: 0.75 }}>Aperçu sur le téléphone</small>
      <div style={{ ...frame, marginTop: 6, borderRadius: 16, padding: 12, maxWidth: 260, display: 'grid', gap: 8 }}>
        {kind === 'reel' ? <div style={{ height: 90, borderRadius: 10, background: 'var(--ayrovi-text-secondary)' }} /> : null}
        {kind === 'story' ? <div style={{ height: 4, borderRadius: 2, background: 'var(--ayrovi-text-secondary)' }} /> : null}
        {kind === 'publication' ? <div style={{ height: 70, borderRadius: 10, background: 'var(--bo-sunken)' }} /> : null}
        {card}
      </div>
    </div>
  );
}
