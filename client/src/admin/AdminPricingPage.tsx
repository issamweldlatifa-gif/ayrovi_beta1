import React, { useEffect, useState } from 'react';
import { adminApi } from './api';
import { Button, Field, Form, Select, Toast } from './components';

const money = (value: unknown) => `${Number(value || 0).toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} TND`;
const currencies = [
  { value: 'EUR', label: 'EUR' }, { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP' }, { value: 'JPY', label: 'JPY' }, { value: 'TND', label: 'TND' },
];
const statuses = [
  { value: 'ALLOWED', label: 'Autorisé' },
  { value: 'WARNING', label: 'Autorisé + alerte' },
  { value: 'RESTRICTED', label: 'Bloqué' },
];

export const PricingPage: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [form, setForm] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  useEffect(() => { adminApi<any>('/pricing').then((result) => setForm(result.data)); }, []);
  if (!form) return <div className="admin-page-loading"><span /><p>Chargement des tarifs…</p></div>;

  const fields: Array<[string, string]> = [
    ['rateEUR', 'Taux EUR'], ['rateUSD', 'Taux USD'], ['rateGBP', 'Taux GBP'], ['rateJPY', 'Taux JPY'],
    ['exchangeBufferPercent', 'Marge change (%)'], ['freightPerKgTND', 'Fret international (TND/kg)'],
    ['localDeliveryTND', 'Livraison locale (TND)'], ['commissionPercent', 'Commission AYSONIC (%)'],
    ['minimumCommissionTND', 'Minimum commission (TND)'], ['rpdPercent', 'Redevance douane (%)'],
    ['rpdMinimumTND', 'Minimum redevance (TND)'], ['expressFeeTND', 'Supplément Express (TND)'],
  ];

  const save = async () => {
    setBusy(true);
    try {
      const result = await adminApi<any>('/pricing', {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          categories: (form.categories || []).map((category: any) => ({
            id: category.id,
            label: category.label,
            keywords: String(category.keywordsText ?? (category.keywords || []).join(', ')).split(',').map((word: string) => word.trim()).filter(Boolean),
            customsRate: Number(category.customsPercent ?? category.customsRate * 100) / 100,
            tvaRate: Number(category.tvaPercent ?? category.tvaRate * 100) / 100,
            defaultWeightKg: Number(category.defaultWeightKg),
            status: category.status,
          })),
          depositPercent: Number(form.depositPercent),
        }),
      });
      setForm(result.data);
      setToast({ message: 'Tarifs, catégories et acompte enregistrés. Les commandes déjà créées gardent leur snapshot.', tone: 'success' });
    } catch (error: any) {
      setToast({ message: error.message, tone: 'error' });
    } finally { setBusy(false); }
  };

  const calculate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await adminApi<any>('/pricing/preview', {
        method: 'POST',
        body: JSON.stringify({
          originalPrice: Number(data.get('price')),
          currency: data.get('currency'),
          quantity: Number(data.get('quantity')),
          express: data.get('express') === 'on',
          title: String(data.get('title') || ''),
        }),
      });
      setPreview(result.data);
    } catch (error: any) {
      setToast({ message: error.message, tone: 'error' });
    }
  };

  const categories = (form.categories || []).map((category: any) => ({
    ...category,
    keywordsText: category.keywordsText ?? (category.keywords || []).join(', '),
    customsPercent: category.customsPercent ?? Math.round(Number(category.customsRate || 0) * 1000) / 10,
    tvaPercent: category.tvaPercent ?? Math.round(Number(category.tvaRate || 0) * 1000) / 10,
  }));

  return <>
    <div className="admin-page-header">
      <div>
        <span className="admin-eyebrow">AYSONIC ADMIN</span>
        <h1>Prix, douane & acompte</h1>
        <p>Moteur CIF v{form.version}. Tout est calculé côté serveur au millime. Les commandes existantes ne bougent pas.</p>
      </div>
      {canWrite ? <Button busy={busy} onClick={save}>Enregistrer</Button> : undefined}
    </div>

    <div className="admin-pricing-layout">
      <section className="admin-card">
        <header className="admin-card-title"><div><h3>Paramètres du moteur</h3><p>Mise à jour {form.updatedAt ? new Date(form.updatedAt).toLocaleString('fr-TN') : '—'}</p></div></header>
        <div className="admin-pricing-grid">
          {fields.map(([key, label]) => (
            <Field key={key} label={label}>
              <input disabled={!canWrite} type="number" min="0" step="0.0001" value={form[key] ?? ''} onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })} />
            </Field>
          ))}
          <Field label="Acompte de confirmation (%)">
            <input disabled={!canWrite} type="number" min="1" max="100" step="1" value={form.depositPercent ?? 20} onChange={(event) => setForm({ ...form, depositPercent: Number(event.target.value) })} />
          </Field>
        </div>
      </section>

      <section className="admin-card admin-price-preview">
        <header className="admin-card-title"><div><h3>Simulateur TND</h3><p>Acompte inclus selon le % enregistré</p></div></header>
        <Form onSubmit={calculate}>
          <Field label="Prix source"><input name="price" type="number" min="0.01" step="0.01" defaultValue="50" required /></Field>
          <Field label="Devise"><Select name="currency" defaultValue="EUR" options={currencies} /></Field>
          <Field label="Quantité"><input name="quantity" type="number" min="1" defaultValue="1" /></Field>
          <Field label="Titre / mots-clés"><input name="title" type="text" defaultValue="sneakers Nike" /></Field>
          <Field label="Express"><input name="express" type="checkbox" /></Field>
          <Button type="submit">Calculer</Button>
        </Form>
        {preview && (
          <div className="admin-price-result">
            <div><span>Catégorie</span><b>{preview.categoryLabel}{preview.restricted ? ' · bloqué' : ''}</b></div>
            <div><span>Converti</span><b>{money(preview.convertedPriceTND)}</b></div>
            <div><span>Fret</span><b>{money(preview.freightTND)}</b></div>
            <div><span>CIF</span><b>{money(preview.cifTND)}</b></div>
            <div><span>Droit</span><b>{money(preview.dutyTND)}</b></div>
            <div><span>TVA</span><b>{money(preview.tvaTND)}</b></div>
            <div><span>Redevance</span><b>{money(preview.rpdTND)}</b></div>
            <div><span>Commission</span><b>{money(preview.serviceFeeTND)}</b></div>
            <div><span>Local</span><b>{money(preview.localDeliveryTND)}</b></div>
            <strong><span>Total</span><b>{money(preview.totalTND)}</b></strong>
            <div><span>Acompte {preview.depositPercent}%</span><b>{money(preview.depositTND)}</b></div>
          </div>
        )}
      </section>
    </div>

    <section className="admin-card" style={{ marginTop: 16 }}>
      <header className="admin-card-title"><div><h3>Matrice douanière</h3><p>Les identifiants ne se créent pas depuis le navigateur. Droit et TVA en %.</p></div></header>
      <div className="admin-category-grid">
        {categories.map((category: any, index: number) => (
          <article key={category.id} className="admin-category-card">
            <strong>{category.id}</strong>
            <Field label="Libellé"><input disabled={!canWrite} value={category.label} onChange={(event) => {
              const next = [...(form.categories || [])]; next[index] = { ...next[index], label: event.target.value }; setForm({ ...form, categories: next });
            }} /></Field>
            <div className="admin-form-row">
              <Field label="Droit %"><input disabled={!canWrite} type="number" min="0" max="100" step="0.1" value={category.customsPercent} onChange={(event) => {
                const next = [...(form.categories || [])]; next[index] = { ...next[index], customsRate: Number(event.target.value) / 100, customsPercent: Number(event.target.value) }; setForm({ ...form, categories: next });
              }} /></Field>
              <Field label="TVA %"><input disabled={!canWrite} type="number" min="0" max="100" step="0.1" value={category.tvaPercent} onChange={(event) => {
                const next = [...(form.categories || [])]; next[index] = { ...next[index], tvaRate: Number(event.target.value) / 100, tvaPercent: Number(event.target.value) }; setForm({ ...form, categories: next });
              }} /></Field>
              <Field label="Poids kg"><input disabled={!canWrite} type="number" min="0.01" max="80" step="0.01" value={category.defaultWeightKg} onChange={(event) => {
                const next = [...(form.categories || [])]; next[index] = { ...next[index], defaultWeightKg: Number(event.target.value) }; setForm({ ...form, categories: next });
              }} /></Field>
            </div>
            <Field label="Statut"><Select disabled={!canWrite} value={category.status} onChange={(event) => {
              const next = [...(form.categories || [])]; next[index] = { ...next[index], status: event.target.value }; setForm({ ...form, categories: next });
            }} options={statuses} /></Field>
            <Field label="Mots-clés" full><textarea rows={2} disabled={!canWrite} value={category.keywordsText} onChange={(event) => {
              const next = [...(form.categories || [])]; next[index] = { ...next[index], keywordsText: event.target.value, keywords: event.target.value.split(',').map((word) => word.trim()).filter(Boolean) }; setForm({ ...form, categories: next });
            }} /></Field>
          </article>
        ))}
      </div>
    </section>
    {toast && <Toast message={toast.message} tone={toast.tone} />}
  </>;
};
