import React, { useState } from 'react';
import { adminApi } from './api';
import { Button, Field } from './components';
import { parseSocialEdition, type EditionEntry, type SocialEdition } from '../../../shared/socialCommerce';

type State = { revision: number; draft: SocialEdition | null; published: SocialEdition | null; previous: SocialEdition | null };
const path = '/social-commerce/edition';
const titleOf = (entry: EditionEntry) => entry.kind === 'article' ? `Édito · ${entry.newsId}` : entry.title;
const blank = (): SocialEdition => {
  const today = new Date();
  const end = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { number: 1, title: '', subtitle: '', cover: '', startsAt: today.toISOString(), endsAt: end.toISOString(), entries: [] };
};

export function SocialCommerceEditionPanel({ canWrite }: { canWrite: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [form, setForm] = useState<SocialEdition>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const update = (patch: Partial<SocialEdition>) => { setForm(previous => ({ ...previous, ...patch })); setDirty(true); };
  const entries = (index: number, entry: EditionEntry) => update({ entries: form.entries.map((value, i) => i === index ? entry : value) });
  const add = (kind: EditionEntry['kind']) => {
    const id = `item-${crypto.randomUUID()}`;
    const common = { id, title: '', description: '' };
    const entry: EditionEntry = kind === 'article' ? { kind, id, newsId: '' }
      : kind === 'pick' ? { ...common, kind, productId: '' } : { ...common, kind, image: '', pins: [{ productId: '', x: 50, y: 50 }] };
    update({ entries: [...form.entries, entry] });
  };
  const move = (index: number, step: number) => {
    const list = [...form.entries];
    const target = index + step;
    if (!list[target]) return;
    [list[index], list[target]] = [list[target], list[index]];
    update({ entries: list });
  };
  async function mutate(action: 'load' | 'save' | 'publish' | 'rollback') {
    if (busy || (action !== 'load' && !state)) return;
    const draft = action === 'save' ? parseSocialEdition(form) : undefined;
    if (action === 'save' && !draft) { setError('Vérifiez le numéro, les dates ISO, le média et tous les champs des blocs.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = action === 'load' ? await adminApi<{ data: State }>(path)
        : await adminApi<{ data: State }>(path, { method: 'PUT', body: JSON.stringify({ action, revision: state?.revision, draft }) });
      setState(result.data);
      if (action === 'load' || action === 'save') { setForm(result.data.draft ?? result.data.published ?? blank()); setDirty(false); }
      setNotice(action === 'save' ? 'Brouillon enregistré.' : action === 'publish' ? 'Édition programmée ou publiée suivant sa date de début.' : action === 'rollback' ? 'Publication précédente rétablie.' : '');
    } catch (err) { setError(err instanceof Error ? err.message : 'Impossible de gérer cette édition.'); }
    finally { setBusy(false); }
  }
  return <details className="admin-card" onToggle={event => { if (event.currentTarget.open && !state && !busy) void mutate('load'); }}>
    <summary><strong>Édition Social Commerce</strong> · indépendante de Pub to Shop</summary>
    {error && <p className="admin-error" role="alert">{error} <Button variant="secondary" disabled={busy} onClick={() => void mutate('load')}>Recharger</Button></p>}
    {notice && <p role="status">{notice}</p>}
    {busy && !state && <p>Chargement…</p>}
    {state && <>
      <p>{state.published ? `Édition ${state.published.number} · ${state.published.title} (${state.published.startsAt} → ${state.published.endsAt})` : 'Aucune édition publiée.'}</p>
      <fieldset disabled={!canWrite || busy}>
        <legend>Brouillon</legend>
        <div className="admin-grid-2">
          <Field label="Numéro"><input type="number" min={1} value={form.number} onChange={e => update({ number: Number(e.target.value) })} /></Field>
          <Field label="Titre"><input maxLength={120} value={form.title} onChange={e => update({ title: e.target.value })} /></Field>
          <Field label="Sous-titre"><input maxLength={220} value={form.subtitle} onChange={e => update({ subtitle: e.target.value })} /></Field>
          <Field label="Image de couverture (URL)"><input value={form.cover} onChange={e => update({ cover: e.target.value })} /></Field>
          <Field label="Début (ISO 8601 avec fuseau)"><input value={form.startsAt} onChange={e => update({ startsAt: e.target.value })} /></Field>
          <Field label="Fin (ISO 8601 avec fuseau)"><input value={form.endsAt} onChange={e => update({ endsAt: e.target.value })} /></Field>
        </div>
        {form.entries.map((entry, i) => <fieldset key={entry.id}>
          <legend>{i + 1} · {entry.kind === 'article' ? 'Édito' : entry.kind === 'pick' ? 'Choix de la rédaction' : 'Look'}</legend>
          {entry.kind === 'article' ? <Field label="Identifiant de l’article News"><input value={entry.newsId} onChange={e => entries(i, { ...entry, newsId: e.target.value })} /></Field> : <>
            <Field label="Titre du bloc"><input maxLength={120} value={entry.title} onChange={e => entries(i, { ...entry, title: e.target.value })} /></Field>
            <Field label="Description"><textarea maxLength={300} value={entry.description} onChange={e => entries(i, { ...entry, description: e.target.value })} /></Field>
            {entry.kind === 'pick' ? <Field label="Identifiant Catalogue"><input value={entry.productId} onChange={e => entries(i, { ...entry, productId: e.target.value })} /></Field> : <>
              <Field label="Image du look (URL)"><input value={entry.image} onChange={e => entries(i, { ...entry, image: e.target.value })} /></Field>
              {entry.pins.map((pin, p) => {
                const setPin = (patch: Partial<typeof pin>) => entries(i, { ...entry, pins: entry.pins.map((value, j) => j === p ? { ...value, ...patch } : value) });
                return <div key={p} className="admin-grid-2">
                  <Field label={`Produit ${p + 1} · ID Catalogue`}><input value={pin.productId} onChange={e => setPin({ productId: e.target.value })} /></Field>
                  <Field label="Coordonnée X (%)"><input type="number" min={7} max={93} value={pin.x} onChange={e => setPin({ x: Number(e.target.value) })} /></Field>
                  <Field label="Coordonnée Y (%)"><input type="number" min={7} max={93} value={pin.y} onChange={e => setPin({ y: Number(e.target.value) })} /></Field>
                  <Button variant="secondary" disabled={entry.pins.length <= 1} onClick={() => entries(i, { ...entry, pins: entry.pins.filter((_, j) => j !== p) })}>Retirer le point</Button>
                </div>;
              })}
              <Button variant="secondary" disabled={entry.pins.length >= 6} onClick={() => entries(i, { ...entry, pins: [...entry.pins, { productId: '', x: 50, y: 50 }] })}>Ajouter un point</Button>
            </>}
          </>}
          <div className="admin-actions">
            <Button variant="secondary" disabled={i === 0} onClick={() => move(i, -1)}>Monter</Button>
            <Button variant="secondary" disabled={i >= form.entries.length - 1} onClick={() => move(i, 1)}>Descendre</Button>
            <Button variant="secondary" onClick={() => update({ entries: form.entries.filter((_, j) => i !== j) })}>Retirer le bloc</Button>
          </div>
        </fieldset>)}
        <div className="admin-actions">
          <Button variant="secondary" disabled={form.entries.length >= 32} onClick={() => add('article')}>Ajouter un édito</Button>
          <Button variant="secondary" disabled={form.entries.length >= 32} onClick={() => add('look')}>Ajouter un look</Button>
          <Button variant="secondary" disabled={form.entries.length >= 32} onClick={() => add('pick')}>Ajouter un choix</Button>
        </div>
        <div className="admin-actions">
          <Button onClick={() => void mutate('save')}>Enregistrer le brouillon</Button>
          <Button disabled={dirty || !state.draft} onClick={() => void mutate('publish')}>Publier ou programmer</Button>
          <Button variant="secondary" disabled={!state.published} onClick={() => void mutate('rollback')}>Revenir en arrière</Button>
        </div>
      </fieldset>
      <Button variant="secondary" onClick={() => setPreview(!preview)}>{preview ? 'Fermer l’aperçu' : 'Aperçu du brouillon'}</Button>
      {preview && <aside className="admin-card">
        {parseSocialEdition(form) ? <img width={220} src={form.cover} alt="Couverture du brouillon" /> : null}
        <h3>Édition {form.number} · {form.title}</h3><p>{form.subtitle}</p>
        <ol>{form.entries.map(entry => <li key={entry.id}>{titleOf(entry)}</li>)}</ol>
        <p>Le fil public vérifie la publication des articles et la disponibilité des produits au moment de l’affichage.</p>
      </aside>}
    </>}
  </details>;
}
