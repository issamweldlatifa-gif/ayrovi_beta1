import { useEffect, useState } from 'react';
import { UPCOMING_LIMIT, UPCOMING_WEEK_MS, normalizeAywebsUpcoming, type AywebsUpcoming, type UpcomingStore } from '../../../shared/aywebsUpcoming';
import { adminApi } from './api';
import { Button, Field } from './components';
import { StudioMediaField } from './StudioMediaField';
import { uploadMediaFile } from './mediaUpload';

type Choice = { id: string; name: string };
const nextWeek = () => new Date(Date.now() + UPCOMING_WEEK_MS).toISOString();
const localDateTime = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export function AywebsUpcomingStudio({ canWrite }: { canWrite: boolean }) {
  const [draft, setDraft] = useState<AywebsUpcoming | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    adminApi<{ data: AywebsUpcoming; choices: Choice[] }>('/aywebs-upcoming').then(result => {
      setDraft(result.data); setChoices(result.choices);
    }).catch((reason: Error) => setError(reason.message));
  }, []);
  const changeStore = (index: number, patch: Partial<UpcomingStore>) => setDraft(current => current && ({
    ...current, stores: current.stores.map((store, i) => index === i ? { ...store, ...patch } : store),
  }));
  const move = (index: number, delta: number) => setDraft(current => {
    if (!current || index + delta < 0 || index + delta >= current.stores.length) return current;
    const stores = [...current.stores];
    const [store] = stores.splice(index, 1);
    if (store) stores.splice(index + delta, 0, store);
    return { ...current, stores };
  });
  const upload = async (file: File, apply: (url: string) => void) => {
    setError(''); setMessage(''); setBusy(true);
    try { apply(await uploadMediaFile(file)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Envoi impossible.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    const next = normalizeAywebsUpcoming(draft);
    setMessage(''); setError('');
    if (!next) { setError('Vérifiez les dates, boutiques et images.'); return; }
    setBusy(true);
    try {
      const result = await adminApi<{ data: AywebsUpcoming }>('/aywebs-upcoming', { method: 'PUT', body: JSON.stringify(next) });
      setDraft(result.data); setMessage('Section enregistrée.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  };
  const available = choices.find(choice => !draft?.stores.some(store => store.id === choice.id));
  return <section className="admin-card">
    <h3>AYWEBs · Prochainement</h3>
    <p>Cartes mobiles sous les Stories. Une date est affichée dans votre fuseau local. Une carte disparaît à échéance : cela n’active pas l’intégration de la boutique.</p>
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    {draft ? <>
      <fieldset className="admin-form" disabled={!canWrite || busy}>
        <Field label="Afficher sur l’accueil mobile"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} /></Field>
        {draft.stores.map((store, index) => <section className="admin-card admin-form" key={index}>
          <Field label={`Boutique ${index + 1}`}><select value={store.id} onChange={e => changeStore(index, { id: e.target.value, image: '' })}>
            {!choices.some(choice => choice.id === store.id) ? <option value={store.id} disabled>{store.id} (indisponible)</option> : null}
            {choices.filter(choice => choice.id === store.id || !draft.stores.some(row => row.id === choice.id))
              .map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
          </select></Field>
          <Field label="Date et heure"><input type="datetime-local" value={localDateTime(store.opensAt)} onChange={e => changeStore(index, { opensAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></Field>
          <StudioMediaField label="Image de la carte (logo par défaut)" value={store.image} onChange={image => changeStore(index, { image })} upload={(file, apply) => void upload(file, apply)} />
          <div className="admin-actions"><Button type="button" onClick={() => changeStore(index, { opensAt: nextWeek() })}>Dans 7 jours</Button>
            <Button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Monter</Button>
            <Button type="button" disabled={index === draft.stores.length - 1} onClick={() => move(index, 1)}>Descendre</Button>
            <Button type="button" variant="danger" onClick={() => setDraft({ ...draft, stores: draft.stores.filter((_, i) => i !== index) })}>Retirer</Button></div>
        </section>)}
        <div className="admin-actions"><Button type="button" disabled={!available || draft.stores.length >= UPCOMING_LIMIT}
          onClick={() => { if (available) setDraft({ ...draft, stores: [...draft.stores, { id: available.id, image: '', opensAt: nextWeek() }] }); }}>Ajouter une boutique</Button>
          <Button type="button" onClick={() => void save()}>Enregistrer</Button></div>
      </fieldset>
    </> : null}
  </section>;
}
