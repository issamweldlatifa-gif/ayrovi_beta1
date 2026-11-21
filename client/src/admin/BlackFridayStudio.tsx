import { useEffect, useState } from 'react';
import { BLACK_FRIDAY_MAX_PRODUCTS, normalizeBlackFriday, type BlackFridaySettings } from '../../../shared/blackFriday';
import { adminApi } from './api';
import { Button, Field } from './components';
import { StudioMediaField } from './StudioMediaField';
import { uploadMediaFile } from './mediaUpload';

type Offer = { id: string; name: string; image: string; price: number; compareAtPrice: number; discountPercent: number };
type Response = { data: BlackFridaySettings; products: Offer[] };
export function BlackFridayStudio({ canWrite }: { canWrite: boolean }) {
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
    if (!next) { setError('Vérifiez le titre, les libellés, la photo et les produits.'); return; }
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
  const move = (index: number, delta: number) => setDraft(current => {
    if (!current || index + delta < 0 || index + delta >= current.productIds.length) return current;
    const productIds = [...current.productIds];
    [productIds[index], productIds[index + delta]] = [productIds[index + delta]!, productIds[index]!];
    return { ...current, productIds };
  });
  return <section className="admin-card">
    <h3>Black Friday Week · Accueil mobile</h3>
    <p>Le prix et la remise viennent du catalogue. Pour changer un tarif, modifiez le prix de vente et le prix barré sur la fiche produit. Masquer ce bloc ne change pas les prix.</p>
    {error ? <p role="alert">{error}</p> : null}{status ? <p role="status">{status}</p> : null}
    {draft ? <fieldset className="admin-form" disabled={busy || !canWrite}>
      <Field label="Afficher sur l’accueil mobile"><input type="checkbox" checked={draft.enabled} onChange={e => patch({ enabled: e.target.checked })} /></Field>
      <Field label="Titre (jusqu’à deux lignes)"><textarea rows={2} maxLength={80} value={draft.title} onChange={e => patch({ title: e.target.value })} /></Field>
      <Field label="Bouton FR"><input maxLength={60} value={draft.ctaFr} onChange={e => patch({ ctaFr: e.target.value })} /></Field>
      <Field label="Bouton AR"><input dir="rtl" maxLength={60} value={draft.ctaAr} onChange={e => patch({ ctaAr: e.target.value })} /></Field>
      <StudioMediaField label="Visuel de la carte finale (par défaut : photo du dernier produit)" value={draft.cover} onChange={cover => patch({ cover })} upload={(file, apply) => void upload(file, apply)} />
      <div>
        <h4>Produits affichés ({draft.productIds.length}/{BLACK_FRIDAY_MAX_PRODUCTS})</h4>
        <ol>{draft.productIds.map((id, index) => {
          const product = known[id];
          return <li key={id}>
            <strong>{product?.name ?? id}</strong>{' '}
            <span>{product ? `${product.price.toFixed(3)} TND · −${product.discountPercent} %` : 'Non éligible ou introuvable'}</span>
            <div className="admin-actions">
              <Button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Monter</Button>
              <Button type="button" disabled={index === draft.productIds.length - 1} onClick={() => move(index, 1)}>Descendre</Button>
              <Button type="button" onClick={() => patch({ productIds: draft.productIds.filter(item => item !== id) })}>Retirer</Button>
            </div>
          </li>;
        })}</ol>
      </div>
      {draft.productIds.length < BLACK_FRIDAY_MAX_PRODUCTS ? <div>
        <Field label="Chercher un produit déjà remisé"><input maxLength={100} placeholder="Produit, marque, référence" value={query} onChange={e => setQuery(e.target.value)} /></Field>
        {searchError ? <p role="alert">{searchError}</p> : null}
        <ul>{results.filter(offer => !draft.productIds.includes(offer.id)).map(offer => <li key={offer.id}>
          <Button type="button" onClick={() => { remember([offer]); patch({ productIds: [...draft.productIds, offer.id] }); }}>
            Ajouter · {offer.name} (−{offer.discountPercent} %)
          </Button>
        </li>)}</ul>
      </div> : null}
      <Button type="button" onClick={() => void save()}>Enregistrer le bloc</Button>
    </fieldset> : null}
  </section>;
}
