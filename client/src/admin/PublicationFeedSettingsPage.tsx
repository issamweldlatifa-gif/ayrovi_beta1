import { useEffect, useState } from 'react';
import { type PublicationFeedSettings } from '../../../shared/publicationFeed';
import { adminApi } from './api';
import { Button, Field, Switch } from './components';

export function PublicationFeedSettingsPage({ canWrite }: { canWrite: boolean }) {
  const [settings, setSettings] = useState<PublicationFeedSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => {
    setMessage(''); setBusy(true);
    try { const response = await adminApi<{ data: PublicationFeedSettings }>('/publication-feed-settings'); setSettings(response.data); }
    catch (error: any) { setMessage(error?.message || 'Lecture impossible.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    if (!canWrite || !settings || busy) return;
    setBusy(true); setMessage('');
    try { const response = await adminApi<{ data: PublicationFeedSettings }>('/publication-feed-settings', { method: 'PUT', body: JSON.stringify(settings) }); setSettings(response.data); setMessage('Réglages Feed enregistrés.'); }
    catch (error: any) { setMessage(error?.message || 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  };
  const move = (index: number, direction: number) => {
    if (!settings) return;
    const categories = [...settings.categories];
    [categories[index], categories[index + direction]] = [categories[index + direction], categories[index]];
    setSettings({ ...settings, categories });
  };
  return <section className="admin-card">
    <h3>Réglages Publication Feed</h3>
    <p>Écran existant /publications. Les contenus se gèrent dans l’onglet Publication. Les catégories masquées restent dans For You ; elles ne sont pas supprimées.</p>
    <Button variant="secondary" disabled={busy} onClick={() => void load()}>Recharger les réglages</Button>
    {message ? <p role="status">{message}</p> : null}
    {!settings ? <p>{busy ? 'Chargement…' : 'Réessayez la lecture.'}</p> : <>
      <fieldset disabled={!canWrite || busy} style={{ border: 0, padding: 0, margin: '16px 0', display: 'grid', gap: 16 }}>
        <Switch checked={settings.enabled} onLabel="Feed visible" offLabel="Feed masqué" onChange={() => setSettings({ ...settings, enabled: !settings.enabled })} disabled={!canWrite || busy} />
        <Field label="Titre du Feed FR"><input maxLength={80} value={settings.titleFr} onChange={e => setSettings({ ...settings, titleFr: e.target.value })} /></Field>
        <Field label="Titre du Feed AR"><input dir="rtl" maxLength={80} value={settings.titleAr} onChange={e => setSettings({ ...settings, titleAr: e.target.value })} /></Field>
        <Field label="Présentation des cartes"><select aria-label="Présentation des cartes" value={settings.layout} onChange={e => setSettings({ ...settings, layout: e.target.value as PublicationFeedSettings['layout'] })}>
          <option value="mixed">Éditoriale mixte</option><option value="portrait">Grandes images portrait</option><option value="compact">Cartes compactes</option>
        </select></Field>
        <h4>Catégories — ordre, visibilité et libellés</h4>
        <p>For You reste toujours disponible comme filtre général. Les clés techniques ne changent pas.</p>
        {settings.categories.map((category, index) => <div key={category.key} className="admin-card" role="group" aria-label={`Catégorie ${category.key || 'For You'}`}>
          <strong>{category.key || 'For You'}</strong>
          <Field label={`Libellé FR ${category.key || 'all'}`}><input maxLength={40} value={category.labelFr} onChange={e => setSettings({ ...settings, categories: settings.categories.map(c => c.key === category.key ? { ...c, labelFr: e.target.value } : c) })} /></Field>
          <Field label={`Libellé AR ${category.key || 'all'}`}><input dir="rtl" maxLength={40} value={category.labelAr} onChange={e => setSettings({ ...settings, categories: settings.categories.map(c => c.key === category.key ? { ...c, labelAr: e.target.value } : c) })} /></Field>
          <Switch checked={category.enabled} disabled={!category.key || !canWrite || busy} onLabel="Visible" offLabel="Masquée" onChange={() => setSettings({ ...settings, categories: settings.categories.map(c => c.key === category.key ? { ...c, enabled: !c.enabled } : c) })} />
          <div className="admin-actions"><Button variant="secondary" disabled={index === 0 || !canWrite || busy} onClick={() => move(index, -1)}>Monter {category.key || 'For You'}</Button><Button variant="secondary" disabled={index === settings.categories.length - 1 || !canWrite || busy} onClick={() => move(index, 1)}>Descendre {category.key || 'For You'}</Button></div>
        </div>)}
      </fieldset>
      <Button busy={busy} disabled={!canWrite} onClick={() => void save()}>Enregistrer les réglages Feed</Button>
    </>}
  </section>;
}
