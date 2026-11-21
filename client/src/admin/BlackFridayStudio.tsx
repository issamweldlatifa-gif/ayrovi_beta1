import { useEffect, useState } from 'react';
import { BLACK_FRIDAY_MAX_COLLECTIONS, BLACK_FRIDAY_MAX_PRODUCTS, normalizeBlackFriday, type BlackFridayCollection, type BlackFridaySettings } from '../../../shared/blackFriday';
import { adminApi } from './api';
import { Button, Field } from './components';
import { StudioMediaField } from './StudioMediaField';
import { uploadMediaFile } from './mediaUpload';

type Offer = { id: string; name: string; image: string; price: number; compareAtPrice: number | null; discountPercent: number; canEditPrice: boolean };
type Response = { data: BlackFridaySettings; products: Offer[] };
export function BlackFridayStudio({ canWrite, canPrice }: { canWrite: boolean; canPrice: boolean }) {
  const [draft, setDraft] = useState<BlackFridaySettings | null>(null);
  const [known, setKnown] = useState<Record<string, Offer>>({});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Offer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [searchError, setSearchError] = useState('');
  const remember = (offers: Offer[]) => setKnown(current => ({ ...current, ...Object.fromEntries(offers.map(offer => [offer.id, offer])) }));
  const patch = (next: Partial<BlackFridaySettings>) => setDraft(current => current && ({ ...current, ...next }));
  useEffect(() => {
    let live = true;
    adminApi<Response>('/home-black-friday').then(result => {
      if (live) { setDraft(result.data); remember(result.products); }
    }).catch(reason => { if (live) setError(reason.message); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!canWrite) return;
    let live = true;
    setResults([]); setSearchError('');
    const timer = setTimeout(() => {
      adminApi<{ data: Offer[] }>(`/home-black-friday/products?q=${encodeURIComponent(query.trim())}`)
        .then(result => { if (live) setResults(result.data); })
        .catch(() => { if (live) setSearchError('Recherche indisponible.'); });
    }, 240);
    return () => { live = false; clearTimeout(timer); };
  }, [canWrite, query]);
  const save = async () => {
    const next = normalizeBlackFriday(draft);
    setError(''); setStatus('');
    if (!next) { setError('Vérifiez les titres, les photos, les dates et les produits de chaque sélection.'); return; }
    setBusy(true);
    try {
      const result = await adminApi<Response>('/home-black-friday', { method: 'PUT', body: JSON.stringify(next) });
      setKnown(Object.fromEntries(result.products.map(offer => [offer.id, offer])));
      setDraft(result.data); setStatus('Bloc enregistré.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  };
  const upload = async (file: File, apply: (url: string) => void) => {
    setBusy(true); setError(''); setStatus('');
    try { apply(await uploadMediaFile(file)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Envoi impossible.'); }
    finally { setBusy(false); }
  };
  const savePrice = async (product: Offer, price: number, compareAtPrice: number) => {
    if (!canPrice || !product.canEditPrice || !window.confirm('Ces montants remplacent le prix catalogue, y compris sur la fiche produit et au panier. Continuer ?')) return;
    setBusy(true); setError(''); setStatus('');
    try {
      const result = await adminApi<{ data: Offer }>(`/home-black-friday/products/${encodeURIComponent(product.id)}/price`, {
        method: 'PUT', body: JSON.stringify({ price, compareAtPrice, expectedPrice: product.price, expectedCompareAtPrice: product.compareAtPrice }),
      });
      remember([result.data]);
      setResults(current => current.map(item => item.id === result.data.id ? result.data : item));
      setStatus('Prix catalogue enregistré.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Prix non enregistré.'); }
    finally { setBusy(false); }
  };
  const move = (index: number, delta: number) => setDraft(current => {
    if (!current || index + delta < 0 || index + delta >= current.productIds.length) return current;
    const productIds = [...current.productIds];
    [productIds[index], productIds[index + delta]] = [productIds[index + delta]!, productIds[index]!];
    return { ...current, productIds };
  });
  const patchCollection = (id: string, next: Partial<BlackFridayCollection>) => setDraft(current => current && ({ ...current,
    collections: current.collections.map(item => item.id === id ? { ...item, ...next } : item),
  }));
  const moveCollection = (index: number, delta: number) => setDraft(current => {
    if (!current || index + delta < 0 || index + delta >= current.collections.length) return current;
    const collections = [...current.collections];
    [collections[index], collections[index + delta]] = [collections[index + delta]!, collections[index]!];
    return { ...current, collections };
  });
  return <section className="admin-card">
    <h3>Black Friday Week · Accueil mobile</h3>
    <p>Les tarifs ci-dessous sont les vrais prix du catalogue. Masquer le bloc ou arriver à la fin de la campagne ne restaure pas les anciens prix. Les produits dont le prix est calculé à partir d’une devise source ne sont pas modifiables ici.</p>
    {error ? <p role="alert">{error}</p> : null}{status ? <p role="status">{status}</p> : null}
    {draft ? <fieldset className="admin-form" disabled={busy || !canWrite}>
      <Field label="Afficher sur l’accueil mobile"><input type="checkbox" checked={draft.enabled} onChange={e => patch({ enabled: e.target.checked })} /></Field>
      <Field label="Titre (jusqu’à deux lignes)"><textarea rows={2} maxLength={80} value={draft.title} onChange={e => patch({ title: e.target.value })} /></Field>
      <Field label="Bouton FR"><input maxLength={60} value={draft.ctaFr} onChange={e => patch({ ctaFr: e.target.value })} /></Field>
      <Field label="Bouton AR"><input dir="rtl" maxLength={60} value={draft.ctaAr} onChange={e => patch({ ctaAr: e.target.value })} /></Field>
      <Field label="Couleur de fond du bandeau d’accueil"><input type="color" value={draft.backgroundColor} onChange={e => patch({ backgroundColor: e.target.value })} /></Field>
      <Field label="Couleur de fond du bloc (rail et bouton)"><input type="color" value={draft.surfaceColor} onChange={e => patch({ surfaceColor: e.target.value })} /></Field>
      <Field label="Titre de la page campagne"><input maxLength={80} value={draft.landingTitle} onChange={e => patch({ landingTitle: e.target.value })} /></Field>
      <Field label="Texte de la pastille rouge"><input maxLength={32} value={draft.badge} onChange={e => patch({ badge: e.target.value })} /></Field>
      <Field label="Titre de la carte par défaut FR"><input maxLength={80} value={draft.featureTitleFr} onChange={e => patch({ featureTitleFr: e.target.value })} /></Field>
      <Field label="Titre de la carte par défaut AR"><input dir="rtl" maxLength={80} value={draft.featureTitleAr} onChange={e => patch({ featureTitleAr: e.target.value })} /></Field>
      <Field label="Bouton de la carte par défaut FR"><input maxLength={60} value={draft.featureCtaFr} onChange={e => patch({ featureCtaFr: e.target.value })} /></Field>
      <Field label="Bouton de la carte par défaut AR"><input dir="rtl" maxLength={60} value={draft.featureCtaAr} onChange={e => patch({ featureCtaAr: e.target.value })} /></Field>
      <Field label="Fin de campagne (facultative, heure locale de votre navigateur)"><input type="datetime-local" value={localDate(draft.endsAt)} onChange={e => {
        const date = new Date(e.target.value);
        if (!e.target.value || Number.isFinite(date.getTime())) patch({ endsAt: e.target.value ? date.toISOString() : '' });
      }} /></Field>
      <StudioMediaField label="Photo de la carte par défaut (sans sélections)" value={draft.featureCover} onChange={featureCover => patch({ featureCover })} upload={(file, apply) => void upload(file, apply)} />
      <StudioMediaField label="Visuel de la carte finale (par défaut : photo du dernier produit)" value={draft.cover} onChange={cover => patch({ cover })} upload={(file, apply) => void upload(file, apply)} />
      <div>
        <h4>Produits affichés ({draft.productIds.length}/{BLACK_FRIDAY_MAX_PRODUCTS})</h4>
        <ol>{draft.productIds.map((id, index) => {
          const product = known[id];
          return <li key={id}>
            <strong>{product?.name ?? id}</strong>{' '}
            <span>{product ? `${product.price.toFixed(3)} TND · −${product.discountPercent} %` : 'Non éligible ou introuvable'}</span>
            {canPrice && product?.canEditPrice ? <CataloguePriceEditor key={`${id}:${product.price}:${product.compareAtPrice}`} offer={product} onSave={(price, compare) => void savePrice(product, price, compare)} /> : null}
            <div className="admin-actions">
              <Button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Monter</Button>
              <Button type="button" disabled={index === draft.productIds.length - 1} onClick={() => move(index, 1)}>Descendre</Button>
              <Button type="button" disabled={draft.collections.some(item => item.productIds.includes(id))} onClick={() => patch({ productIds: draft.productIds.filter(item => item !== id) })}>Retirer</Button>
            </div>
          </li>;
        })}</ol>
      </div>
      {draft.productIds.length < BLACK_FRIDAY_MAX_PRODUCTS ? <div>
        <Field label="Chercher un produit du catalogue"><input maxLength={100} placeholder="Produit, marque, référence" value={query} onChange={e => setQuery(e.target.value)} /></Field>
        {searchError ? <p role="alert">{searchError}</p> : null}
        <ul>{results.filter(offer => !draft.productIds.includes(offer.id)).map(offer => <li key={offer.id}>
          <Button type="button" onClick={() => { remember([offer]); patch({ productIds: [...draft.productIds, offer.id] }); }}>
            Ajouter · {offer.name}{offer.discountPercent ? ` (−${offer.discountPercent} %)` : ' (prix non remisé)'}
          </Button>
        </li>)}</ul>
      </div> : null}
      <div>
        <h4>Cartes de campagne ({draft.collections.length}/{BLACK_FRIDAY_MAX_COLLECTIONS})</h4>
        <p>L’accueil montre les trois premières sélections actives. Chaque carte ouvre ses propres produits. Pour retirer un produit du bloc, désélectionnez-le d’abord dans les cartes qui l’utilisent.</p>
        {draft.collections.map((item, index) => <details key={item.id}>
          <summary>{index + 1}. {item.titleFr || 'Nouvelle sélection'}{item.demo ? ' · Démo' : ''}</summary>
          <Field label="Titre FR"><input maxLength={80} value={item.titleFr} onChange={e => patchCollection(item.id, { titleFr: e.target.value })} /></Field>
          <Field label="Titre AR"><input dir="rtl" maxLength={80} value={item.titleAr} onChange={e => patchCollection(item.id, { titleAr: e.target.value })} /></Field>
          <Field label="Fin de la sélection (heure locale)"><input type="datetime-local" value={localDate(item.endsAt)} onChange={e => {
            const date = new Date(e.target.value);
            if (!e.target.value || Number.isFinite(date.getTime())) patchCollection(item.id, { endsAt: e.target.value ? date.toISOString() : '' });
          }} /></Field>
          <Field label="Offres de démonstration"><input type="checkbox" checked={item.demo} onChange={e => patchCollection(item.id, { demo: e.target.checked })} /></Field>
          <StudioMediaField label="Visuel de la sélection (par défaut : premier produit)" value={item.cover} onChange={cover => patchCollection(item.id, { cover })} upload={(file, apply) => void upload(file, apply)} />
          {draft.productIds.map(id => <Field key={id} label={known[id]?.name ?? id}>
            <input type="checkbox" checked={item.productIds.includes(id)} onChange={e => patchCollection(item.id, {
              productIds: e.target.checked ? [...item.productIds, id] : item.productIds.filter(link => link !== id),
            })} />
          </Field>)}
          <div className="admin-actions">
            <Button type="button" disabled={index === 0} onClick={() => moveCollection(index, -1)}>Monter</Button>
            <Button type="button" disabled={index === draft.collections.length - 1} onClick={() => moveCollection(index, 1)}>Descendre</Button>
            <Button type="button" onClick={() => patch({ collections: draft.collections.filter(group => group.id !== item.id) })}>Supprimer la carte</Button>
          </div>
        </details>)}
        <Button type="button" disabled={!draft.productIds.length || draft.collections.length >= BLACK_FRIDAY_MAX_COLLECTIONS} onClick={() => patch({
          collections: [...draft.collections, { id: crypto.randomUUID(), titleFr: '', titleAr: '', cover: '', endsAt: '', productIds: [], demo: false }],
        })}>Ajouter une carte</Button>
      </div>
      <Button type="button" onClick={() => void save()}>Enregistrer le bloc</Button>
    </fieldset> : null}
  </section>;
}

function localDate(iso: string) {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function CataloguePriceEditor({ offer, onSave }: { offer: Offer; onSave: (price: number, compare: number) => void }) {
  const [price, setPrice] = useState(String(offer.price));
  const [compare, setCompare] = useState(offer.compareAtPrice === null ? '' : String(offer.compareAtPrice));
  return <details>
    <summary>Modifier le prix catalogue</summary>
    <Field label="Prix de vente (TND)"><input type="number" min="0.001" step="0.001" max="1000000" value={price} onChange={e => setPrice(e.target.value)} /></Field>
    <Field label="Vrai prix de référence barré (TND)"><input type="number" min="0.001" step="0.001" max="1000000" value={compare} onChange={e => setCompare(e.target.value)} /></Field>
    <Button type="button" disabled={!(Number(price) > 0 && Number(compare) > Number(price) && Number(compare) <= 1_000_000) || (Number(price) === offer.price && Number(compare) === offer.compareAtPrice)}
      onClick={() => onSave(Number(price), Number(compare))}>Appliquer au catalogue</Button>
  </details>;
}
