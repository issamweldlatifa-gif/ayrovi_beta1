/**
 * Réglages du Hero unique (activation, nombre de cartes, autoplay, transition, pagination).
 * Affiché en tête de la page « Hero » : tout le Hero se pilote au même endroit.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Field, Switch, Toast } from './components';
import { adminApi } from './api';

type Settings = {
  enabled: boolean;
  maxCards: number;
  autoplay: boolean;
  autoplayIntervalMs: number;
  transitionMs: number;
  paginationVisible: boolean;
};

const EMPTY: Settings = { enabled: true, maxCards: 6, autoplay: false, autoplayIntervalMs: 5000, transitionMs: 300, paginationVisible: true };

export function HeroSettingsPanel({ canWrite, onSaved }: { canWrite: boolean; onSaved?: () => void }) {
  const [draft, setDraft] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi<any>('/hero-carousel-settings');
      if (result?.data) setDraft({ ...EMPTY, ...result.data });
    } catch {
      setToast({ message: 'Réglages du Hero introuvables.', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const patch = (change: Partial<Settings>) => setDraft((previous) => ({ ...previous, ...change }));

  const save = async () => {
    setBusy(true);
    try {
      const result = await adminApi<any>('/hero-carousel-settings', { method: 'PUT', body: JSON.stringify(draft) });
      if (result?.data) setDraft({ ...EMPTY, ...result.data });
      setToast({ message: 'Réglages du Hero enregistrés.', tone: 'success' });
      onSaved?.();
    } catch (error: any) {
      setToast({ message: error?.message || 'Enregistrement impossible.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const disabled = !canWrite || loading;

  return (
    <section aria-label="Réglages du Hero" className="admin-card" style={{ padding: 20, borderRadius: 16, border: '1px solid var(--admin-line)', marginBottom: 24 }}>
      <h3 style={{ marginTop: 0 }}>Réglages du Hero</h3>
      {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Field label="Hero" full>
          <Switch disabled={disabled} checked={draft.enabled} onLabel="Hero visible sur l’accueil" offLabel="Hero masqué sur l’accueil" onChange={() => patch({ enabled: !draft.enabled })} />
        </Field>
        <Field label="Nombre max de cartes" hint="1 à 12 — les cartes au-delà sont ignorées.">
          <input disabled={disabled} type="number" min={1} max={12} value={draft.maxCards} onChange={(event) => patch({ maxCards: Number(event.target.value) || 1 })} />
        </Field>
        <Field label="Autoplay" full>
          <Switch disabled={disabled} checked={draft.autoplay} onLabel="Défilement automatique" offLabel="Défilement manuel" onChange={() => patch({ autoplay: !draft.autoplay })} />
        </Field>
        <Field label="Intervalle autoplay (ms)" hint="1000 à 60000 — n’a d’effet que si l’autoplay est actif.">
          <input disabled={disabled || !draft.autoplay} type="number" min={1000} max={60000} step={500} value={draft.autoplayIntervalMs} onChange={(event) => patch({ autoplayIntervalMs: Number(event.target.value) || 5000 })} />
        </Field>
        <Field label="Durée de transition (ms)" hint="100 à 2000 — fondu du fond entre deux cartes.">
          <input disabled={disabled} type="number" min={100} max={2000} step={50} value={draft.transitionMs} onChange={(event) => patch({ transitionMs: Number(event.target.value) || 300 })} />
        </Field>
        <Field label="Pagination" full>
          <Switch disabled={disabled} checked={draft.paginationVisible} onLabel="Points de pagination visibles" offLabel="Pagination masquée" onChange={() => patch({ paginationVisible: !draft.paginationVisible })} />
        </Field>
      </div>
      <div style={{ marginTop: 16 }}>
        <Button onClick={() => void save()} busy={busy} disabled={disabled}>Enregistrer les réglages</Button>
      </div>
    </section>
  );
}
