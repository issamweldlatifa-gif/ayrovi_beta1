import { useEffect, useState } from 'react';
import { NEWS_SECTIONS, NEWS_TOOLS, NEWS_SOURCES, ZAYROVI_NEWS_LIMIT, normalizeZayroviNews, type NewsCopy, type NewsEntry, type NewsSource, type ZayroviNewsSettings } from '../../../shared/zayroviNews';
import { adminApi } from './api';
import { uploadMediaFile } from './mediaUpload';
import { Button, Field } from './components';
import { StudioMediaField } from './StudioMediaField';

const labels = { notice: 'Actualité originale', story: 'Story', reel: 'Reel / vidéo', publication: 'Publication', article: 'Article du magazine' } as const;
const sectionLabel = { news: 'Dernières actualités', tools: 'Nos outils', about: 'À propos de Zayrovi' };
const toolLabel = { lens: 'Z Lens', clean: 'Clean', aywebs: 'AYWEBs' };
const blank = () => ({ fr: '', ar: '' });
function CopyFields({ label, value, max, multiline, onChange }: { label: string; value: NewsCopy; max: number; multiline?: boolean; onChange: (value: NewsCopy) => void }) {
  return <>{(['fr', 'ar'] as const).map(locale => {
    const props = { value: value[locale], maxLength: max, dir: locale === 'ar' ? 'rtl' : 'ltr',
      onChange: (event: { target: { value: string } }) => onChange({ ...value, [locale]: event.target.value }) };
    return <Field key={locale} label={`${label} ${locale.toUpperCase()}`} full>{multiline ? <textarea {...props} rows={4} /> : <input {...props} />}</Field>;
  })}</>;
}

function SourcePicker({ kind, selected, onChange }: { kind: NewsSource; selected: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<{ id: string; title: string }[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setOptions([]); setError(false);
    const timer = setTimeout(() => {
      adminApi<{ data: typeof options }>(`/zayrovi-news/sources?kind=${kind}&q=${encodeURIComponent(q.trim())}`)
        .then(result => { if (live) setOptions(result.data); }).catch(() => { if (live) setError(true); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [kind, q]);
  return <>
    <Field label={`Chercher · ${labels[kind]}`}><input value={q} maxLength={100} onChange={e => setQ(e.target.value)} placeholder="Titre ou référence" /></Field>
    <Field label="Contenu publié"><select value={selected} onChange={e => onChange(e.target.value)}>
      <option value="">Choisir un contenu</option>
      {selected && !options.some(item => item.id === selected) ? <option value={selected}>{selected}</option> : null}
      {options.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select></Field>
    {error ? <p role="alert">La recherche est indisponible.</p> : null}
  </>;
}

export function ZayroviNewsStudio({ canWrite }: { canWrite: boolean }) {
  const [draft, setDraft] = useState<ZayroviNewsSettings | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    adminApi<{ data: ZayroviNewsSettings }>('/zayrovi-news').then(result => { if (live) setDraft(result.data); })
      .catch(reason => { if (live) setError(reason.message); });
    return () => { live = false; };
  }, []);
  const updateDaily = (change: Partial<ZayroviNewsSettings['daily']>) => setDraft(current => current && ({ ...current, daily: { ...current.daily, ...change } }));
  const updateEntry = (entry: NewsEntry) => setDraft(current => current && ({ ...current, entries: current.entries.map(item => item.id === entry.id ? entry : item) }));
  const move = (index: number, delta: number) => setDraft(current => {
    if (!current || index + delta < 0 || index + delta >= current.entries.length) return current;
    const entries = [...current.entries];
    [entries[index], entries[index + delta]] = [entries[index + delta]!, entries[index]!];
    return { ...current, entries };
  });
  const save = async () => {
    const data = normalizeZayroviNews(draft);
    setError(''); setStatus('');
    if (!data) { setError('Complétez les champs FR/AR et choisissez une référence publiée pour chaque carte liée. Les doublons ne sont pas autorisés.'); return; }
    setBusy(true);
    try {
      const result = await adminApi<{ data: ZayroviNewsSettings }>('/zayrovi-news', { method: 'PUT', body: JSON.stringify(data) });
      setDraft(result.data); setStatus('Zayrovi News enregistré.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Échec de l’enregistrement.'); }
    finally { setBusy(false); }
  };
  const upload = async (file: File, apply: (url: string) => void) => {
    setBusy(true); setError('');
    try { apply(await uploadMediaFile(file)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Envoi impossible.'); }
    finally { setBusy(false); }
  };
  return <section className="admin-card">
    <h3>Zayrovi News · Application mobile</h3>
    {error ? <p role="alert">{error}</p> : null}{status ? <p role="status">{status}</p> : null}
    {draft ? <fieldset className="admin-form" disabled={!canWrite || busy}>
      <h4>Carte de l’offre du jour</h4>
      <p>Le pourcentage est calculé par le moteur dans Ventes &amp; ressources → Promotions &amp; offres. Ici, seul le contenu de la carte est modifié.</p>
      <Field label="Afficher sous les onglets de l’accueil"><input type="checkbox" checked={draft.daily.showHome} onChange={e => updateDaily({ showHome: e.target.checked })} /></Field>
      <Field label="Afficher dans Zayrovi News"><input type="checkbox" checked={draft.daily.showNews} onChange={e => updateDaily({ showNews: e.target.checked })} /></Field>
      <CopyFields label="Titre" value={draft.daily.title} max={80} onChange={title => updateDaily({ title })} />
      <CopyFields label="Accroche" value={draft.daily.teaser} max={140} onChange={teaser => updateDaily({ teaser })} />
      <CopyFields label="Bouton" value={draft.daily.cta} max={48} onChange={cta => updateDaily({ cta })} />
      <CopyFields label="Explication complète" value={draft.daily.body} max={1800} multiline onChange={body => updateDaily({ body })} />
      <div>
        <Field label="Afficher les guides Z Lens, Clean, AYWEBs et À propos fournis par Zayrovi"><input type="checkbox" checked={draft.showGuides !== false} onChange={e => setDraft({ ...draft, showGuides: e.target.checked })} /></Field>
        <h4>Fil éditorial ({draft.entries.length}/{ZAYROVI_NEWS_LIMIT})</h4>
        <p>Une carte liée n’apparaît que si le contenu source est lui-même public. L’ordre ci-dessous est celui du fil.</p>
        {draft.entries.map((entry, index) => <details key={entry.id} className="admin-card">
          <summary>{index + 1}. {entry.kind === 'notice' ? entry.title.fr || labels.notice : `${labels[entry.kind]} · ${entry.targetId || 'À sélectionner'}`}{entry.published ? '' : ' · Brouillon'}</summary>
          <Field label="Type"><select value={entry.kind} onChange={e => {
            const kind = e.target.value as NewsEntry['kind'];
            const base = { id: entry.id, published: entry.published, section: entry.section };
            updateEntry(kind === 'notice' ? { ...base, kind, title: blank(), body: blank(), image: '' } : { ...base, kind, targetId: '' });
          }}><option value="notice">{labels.notice}</option>{NEWS_SOURCES.map(kind => <option key={kind} value={kind}>{labels[kind]}</option>)}</select></Field>
          <Field label="Rubrique"><select value={entry.section ?? 'news'} onChange={e => updateEntry({ ...entry, section: e.target.value as NewsEntry['section'] })}>
            {NEWS_SECTIONS.map(section => <option key={section} value={section}>{sectionLabel[section]}</option>)}
          </select></Field>
          <Field label="Publier dans le fil"><input type="checkbox" checked={entry.published} onChange={e => updateEntry({ ...entry, published: e.target.checked })} /></Field>
          {entry.kind === 'notice' ? <>
            <CopyFields label="Titre" value={entry.title} max={120} onChange={title => updateEntry({ ...entry, title })} />
            <CopyFields label="Accroche (facultative)" value={entry.summary ?? blank()} max={240} onChange={summary => updateEntry({ ...entry, summary: summary.fr || summary.ar ? summary : undefined })} />
            <CopyFields label="Article complet (## pour un intertitre)" value={entry.body} max={6000} multiline onChange={body => updateEntry({ ...entry, body })} />
            <Field label="Bouton vers un outil (facultatif)"><select value={entry.tool ?? ''} onChange={e => updateEntry({ ...entry, tool: (e.target.value || undefined) as typeof entry.tool })}>
              <option value="">Aucun</option>{NEWS_TOOLS.map(tool => <option key={tool} value={tool}>{toolLabel[tool]}</option>)}
            </select></Field>
            <StudioMediaField label="Photo (facultative)" value={entry.image} onChange={image => updateEntry({ ...entry, image })} upload={(file, apply) => void upload(file, apply)} />
          </> : <SourcePicker key={entry.kind} kind={entry.kind} selected={entry.targetId} onChange={targetId => updateEntry({ ...entry, targetId })} />}
          <div className="admin-actions">
            <Button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Monter</Button>
            <Button type="button" disabled={index + 1 === draft.entries.length} onClick={() => move(index, 1)}>Descendre</Button>
            <Button type="button" variant="danger" onClick={() => setDraft({ ...draft, entries: draft.entries.filter(item => item.id !== entry.id) })}>Retirer du fil</Button>
          </div>
        </details>)}
        <Button type="button" disabled={draft.entries.length >= ZAYROVI_NEWS_LIMIT} onClick={() => setDraft({ ...draft, entries: [...draft.entries,
          { id: crypto.randomUUID(), kind: 'notice', published: false, title: blank(), body: blank(), image: '' }] })}>Ajouter une carte</Button>
      </div>
      <Button type="button" onClick={() => void save()}>Enregistrer</Button>
    </fieldset> : null}
  </section>;
}
