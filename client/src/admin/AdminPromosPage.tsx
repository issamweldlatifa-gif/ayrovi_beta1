import React, { useEffect, useState } from 'react';
import { adminApi } from './api';
import { Button, CardTitle, Field, Form, Select, Toast } from './components';

/**
 * Promotions & offres (management 23/09/2026) — pilotage du moteur promo :
 * grille jour de la semaine (l'échelle légère 1-4 %) + règles ciblées
 * catégorie/produit. Garde-fou affiché : la remise s'applique sur le prix
 * produit converti et ne peut jamais faire passer la commission sous le
 * plancher (3 %) — cap automatique côté serveur.
 */

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const money = (value: unknown) => `${Number(value || 0).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND`;

interface PromoRule {
  id: string;
  scope: 'DAY' | 'CATEGORY' | 'PRODUCT';
  target: string;
  percent: number;
  label: string;
  active: boolean;
  starts_at: string;
  ends_at: string;
}

export const PromosPage: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [data, setData] = useState<{ rules: PromoRule[]; today: { percent: number; label: string; source: string } | null; commissionPercent: number; floorPercent: number; capPercent: number } | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; label: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [draft, setDraft] = useState({ scope: 'CATEGORY', target: '', percent: 5, label: '', starts_at: '', ends_at: '' });

  const load = async () => {
    const result = await adminApi<any>('/promos');
    setData(result.data);
    const pricing = await adminApi<any>('/pricing');
    setCategories((pricing.data.categories || []).map((item: any) => ({ id: item.id, label: item.label })));
  };
  useEffect(() => { void load(); }, []);
  if (!data) return <div className="admin-page-loading"><span /><p>Chargement des promotions…</p></div>;

  const dayRules = data.rules.filter((rule) => rule.scope === 'DAY')
    .sort((a, b) => Number(a.target) - Number(b.target));
  const targetedRules = data.rules.filter((rule) => rule.scope !== 'DAY');

  const patchRule = async (id: string, patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await adminApi<any>(`/promos/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
      await load();
      setToast({ message: 'Règle mise à jour. Les nouvelles commandes appliquent la promo immédiatement.', tone: 'success' });
    } catch (error: any) {
      setToast({ message: error.message, tone: 'error' });
    } finally { setBusy(false); }
  };

  const saveDayGrid = async () => {
    setBusy(true);
    try {
      for (const rule of dayRules) {
        await adminApi<any>(`/promos/${rule.id}`, {
          method: 'PUT',
          body: JSON.stringify({ percent: Number(rule.percent), active: rule.active, label: rule.label }),
        });
      }
      await load();
      setToast({ message: 'Grille jour enregistrée — les devis futurs appliquent la nouvelle échelle.', tone: 'success' });
    } catch (error: any) {
      setToast({ message: error.message, tone: 'error' });
    } finally { setBusy(false); }
  };

  const createRule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      await adminApi<any>('/promos', { method: 'POST', body: JSON.stringify(draft) });
      setDraft({ scope: draft.scope, target: '', percent: 5, label: '', starts_at: '', ends_at: '' });
      await load();
      setToast({ message: 'Règle ciblée créée — elle surcharge la grille jour pour sa cible.', tone: 'success' });
    } catch (error: any) {
      setToast({ message: error.message, tone: 'error' });
    } finally { setBusy(false); }
  };

  const deleteRule = async (id: string) => {
    setBusy(true);
    try {
      await adminApi<any>(`/promos/${id}`, { method: 'DELETE' });
      await load();
      setToast({ message: 'Règle supprimée.', tone: 'success' });
    } catch (error: any) {
      setToast({ message: error.message, tone: 'error' });
    } finally { setBusy(false); }
  };

  const updateDay = (index: number, patch: Partial<PromoRule>) => {
    const next = [...dayRules];
    next[index] = { ...next[index], ...patch };
    setData({ ...data, rules: [...next, ...targetedRules] });
  };

  return <>
    <div className="admin-page-header">
      <div>
        <span className="admin-eyebrow">AYROVI ADMIN</span>
        <h1>Promotions &amp; offres</h1>
        <p>
          {data.today
            ? `Offre active aujourd'hui : −${data.today.percent} % (${data.today.label || data.today.source.toLowerCase()}) — appliquée sur le prix produit.`
            : 'Aucune promo active aujourd\'hui — la grille jour peut être désactivée jour par jour.'}
        </p>
      </div>
      {canWrite ? <Button busy={busy} onClick={saveDayGrid}>Enregistrer la grille</Button> : undefined}
    </div>

    <section className="admin-card" style={{ marginBottom: 16 }}>
      <CardTitle
        title="Garde-fou marge"
        subtitle={`Commission ${data.commissionPercent} % · plancher ${data.floorPercent} % · remise maximale applicable : ${data.capPercent} %`}
      />
      <p style={{ margin: 0, fontSize: 13, color: 'var(--admin-text-soft)' }}>
        La remise s'applique sur le prix produit converti (jamais sur le total CIF : 7 % sur le total dépasseraient toute la commission).
        Un pourcentage saisi au-dessus du cap est automatiquement ramené au cap.
      </p>
    </section>

    <div className="admin-pricing-layout">
      <section className="admin-card">
        <CardTitle title="Grille jour de la semaine" subtitle="L'échelle légère : 1-2 % en semaine, 3-4 % le week-end — réglable jour par jour" />
        <div className="admin-category-grid">
          {dayRules.map((rule, index) => (
            <article key={rule.id} className="admin-category-card">
              <strong>{DAY_NAMES[Number(rule.target) - 1] || rule.target}</strong>
              <div className="admin-form-row">
                <Field label="Remise %">
                  <input disabled={!canWrite || busy} type="number" min="0.1" max={data.capPercent} step="0.1" value={rule.percent}
                    onChange={(event) => updateDay(index, { percent: Number(event.target.value) })} />
                </Field>
                <Field label="Active">
                  <input disabled={!canWrite || busy} type="checkbox" checked={rule.active}
                    onChange={(event) => updateDay(index, { active: event.target.checked })} />
                </Field>
              </div>
              <Field label="Libellé (badge, optionnel)">
                <input disabled={!canWrite || busy} type="text" maxLength={80} value={rule.label}
                  onChange={(event) => updateDay(index, { label: event.target.value })} />
              </Field>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-card">
        <CardTitle title="Règles ciblées" subtitle="Surchargent la grille jour : produit > catégorie > jour" />
        {targetedRules.length === 0 && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--admin-text-soft)' }}>Aucune règle ciblée pour l'instant.</p>}
        {targetedRules.map((rule) => (
          <div key={rule.id} className="admin-form-row" style={{ alignItems: 'center', marginBottom: 8 }}>
            <span className="admin-block-small" style={{ minWidth: 110 }}><strong>{rule.scope === 'CATEGORY' ? 'Catégorie' : 'Produit'}</strong> {rule.target}</span>
            <span className="admin-block-small">−{rule.percent} % {rule.active ? '' : '(inactive)'}</span>
            <span className="admin-block-small">{rule.label || '—'}</span>
            {canWrite ? <Button busy={busy} onClick={() => void patchRule(rule.id, { active: !rule.active })}>{rule.active ? 'Désactiver' : 'Activer'}</Button> : undefined}
            {canWrite ? <Button busy={busy} onClick={() => void deleteRule(rule.id)}>Supprimer</Button> : undefined}
          </div>
        ))}
        {canWrite && (
          <Form onSubmit={createRule}>
            <div className="admin-form-row">
              <Field label="Portée">
                <Select value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value })}
                  options={[{ value: 'CATEGORY', label: 'Catégorie' }, { value: 'PRODUCT', label: 'Produit' }]} />
              </Field>
              <Field label={draft.scope === 'CATEGORY' ? 'Catégorie (id matrice)' : 'Id produit'}>
                {draft.scope === 'CATEGORY' ? (
                  <Select value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })}
                    options={[{ value: '', label: '— choisir —' }, ...categories.map((item) => ({ value: item.id, label: `${item.id} (${item.label})` }))]} />
                ) : (
                  <input value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })} placeholder="product_…" />
                )}
              </Field>
              <Field label="Remise %">
                <input type="number" min="0.1" max={data.capPercent} step="0.1" value={draft.percent}
                  onChange={(event) => setDraft({ ...draft, percent: Number(event.target.value) })} />
              </Field>
            </div>
            <div className="admin-form-row">
              <Field label="Libellé"><input value={draft.label} maxLength={80} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></Field>
              <Field label="Début (ISO, optionnel)"><input value={draft.starts_at} onChange={(event) => setDraft({ ...draft, starts_at: event.target.value })} placeholder="2026-10-01T00:00:00.000Z" /></Field>
              <Field label="Fin (ISO, optionnel)"><input value={draft.ends_at} onChange={(event) => setDraft({ ...draft, ends_at: event.target.value })} placeholder="2026-10-31T23:59:59.000Z" /></Field>
            </div>
            <Button type="submit" busy={busy}>Créer la règle</Button>
          </Form>
        )}
      </section>
    </div>

    <section className="admin-card" style={{ marginTop: 16 }}>
      <CardTitle title="Comment ça marche" subtitle="Prix affiché au client" />
      <p style={{ margin: 0, fontSize: 13, color: 'var(--admin-text-soft)' }}>
        Le client voit le prix total original barré, le prix remisé en grand et un badge « offre du jour −X % ».
        Exemple : {money(347.110)} − 2 % → <strong>{money(340.168)}</strong> de remise sur le prix produit, recalculés par le moteur CIF officiel.
        Les commandes passées gardent leur gel (promo_json) comme pour les taux de change.
      </p>
    </section>
    {toast && <Toast message={toast.message} tone={toast.tone} />}
  </>;
};
