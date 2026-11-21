import { useEffect, useState } from 'react';
import { HIGHLIGHT_LIMIT, normalizeHighlights, type HighlightSettings, type HighlightSlot } from '../../../shared/zayroviHighlights';
import { adminApi } from './api';
import { Button, Field } from './components';

type Candidate = { id: string; title: string; products: { id: string; name: string }[] };
const blank = (): HighlightSlot => ({ reelId: '', productId: '' });
const endpoint = '/zayrovi-highlights';

export function ZayroviHighlightsStudio({ canWrite }: { canWrite: boolean }) {
  const [draft, setDraft] = useState<HighlightSettings | null>(null);
  const [options, setOptions] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Record<string, Candidate>>({});
  const [query, setQuery] = useState('');
  const [searchError, setSearchError] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    adminApi<{ data: HighlightSettings }>(endpoint)
      .then(result => { if (live) setDraft(result.data); })
      .catch(reason => { if (live) setError(reason.message); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    setSearchError(false);
    const timer = setTimeout(() => {
      adminApi<{ data: Candidate[] }>(`${endpoint}/reels?q=${encodeURIComponent(query)}`)
        .then(result => { if (live) setOptions(result.data); })
        .catch(() => { if (live) { setOptions([]); setSearchError(true); } });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);

  const slots = Array.from({ length: HIGHLIGHT_LIMIT }, (_, i) => draft?.slots[i] ?? blank());
  const setSlots = (next: HighlightSlot[]) => setDraft(current => current && ({ ...current, slots: next }));
  const change = (i: number, slot: HighlightSlot) => setSlots(slots.map((item, j) => i === j ? slot : item));
  const move = (i: number, to: number) => {
    const next = [...slots];
    [next[i], next[to]] = [next[to], next[i]];
    setSlots(next);
  };
  const save = async () => {
    if (!draft) return;
    setStatus(''); setError('');
    const data = normalizeHighlights({ ...draft, slots: draft.enabled ? slots : slots.filter(slot => slot.reelId) });
    if (!data) { setError('Choisissez quatre Reels distincts pour activer la section.'); return; }
    setBusy(true);
    try {
      const result = await adminApi<{ data: HighlightSettings }>(endpoint, { method: 'PUT', body: JSON.stringify(data) });
      setDraft(result.data); setStatus('Zayrovi Highlights enregistré.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Échec de l’enregistrement.'); }
    finally { setBusy(false); }
  };

  return <section className="admin-card">
    <h3>Zayrovi Highlights · Plus qu’une vidéo</h3>
    <p>Grille 2 × 2 de l’accueil mobile. Choisissez des Reels de Zayrovi Team déjà publiés, avec une couverture et au moins un article lié disponible. Le prix et la photo proviennent du catalogue.</p>
    {error ? <p role="alert">{error}</p> : null}{status ? <p role="status">{status}</p> : null}
    {draft ? <fieldset className="admin-form" disabled={!canWrite || busy}>
      <Field label="Afficher sur l’accueil mobile"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} /></Field>
      <Field label="Chercher un Reel officiel"><input maxLength={80} value={query} onChange={e => setQuery(e.target.value)} placeholder="Titre ou référence" /></Field>
      {searchError ? <p role="alert">La recherche est indisponible.</p> : null}
      {slots.map((slot, i) => {
        const current = options.find(item => item.id === slot.reelId) ?? picked[slot.reelId];
        const choices = options.filter(item => item.products.length && !slots.some((other, j) => j !== i && other.reelId === item.id));
        return <fieldset key={i} className="admin-card">
          <legend>Carte {i + 1}</legend>
          <Field label="Reel publié"><select value={slot.reelId} onChange={e => {
            const reelId = e.target.value;
            const candidate = options.find(item => item.id === reelId);
            if (candidate) setPicked(previous => ({ ...previous, [reelId]: candidate }));
            change(i, { reelId, productId: '' });
          }}>
            <option value="">Choisir une vidéo</option>
            {slot.reelId && !choices.some(item => item.id === slot.reelId) ? <option value={slot.reelId}>{current?.title ?? `${slot.reelId} (indisponible)`}</option> : null}
            {choices.map(item => <option key={item.id} value={item.id}>{item.title || item.id}</option>)}
          </select></Field>
          <Field label="Produit vedette"><select value={slot.productId} disabled={!slot.reelId} onChange={e => change(i, { ...slot, productId: e.target.value })}>
            <option value="">Premier article disponible du Reel</option>
            {slot.productId && !current?.products.some(product => product.id === slot.productId) ? <option value={slot.productId}>{slot.productId} (indisponible)</option> : null}
            {current?.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select></Field>
          <div className="admin-actions">
            <Button type="button" disabled={i === 0} onClick={() => move(i, i - 1)}>Monter</Button>
            <Button type="button" disabled={i + 1 === HIGHLIGHT_LIMIT} onClick={() => move(i, i + 1)}>Descendre</Button>
          </div>
        </fieldset>;
      })}
      <Button type="button" onClick={() => void save()}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Button>
    </fieldset> : null}
  </section>;
}
