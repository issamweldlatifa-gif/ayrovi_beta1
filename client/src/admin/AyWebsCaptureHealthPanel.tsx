/**
 * AYWEBs — santé de la capture par boutique (12/11/2026).
 *
 * Ce que l'opérateur doit voir sans chercher : les boutiques sous 80 % de
 * captures acceptées sur 24 h, le motif de refus dominant, le script réellement
 * servi (lot + empreinte) et un levier par boutique :
 *   • Normal (`auto`) · Retour au script complet (`core`) · Capture suspendue (`paused`).
 * Toute bascule exige une raison et passe au journal d'audit AYWEBs.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, ApiError } from './api';
import { Button, CardTitle, DataTable, Select, Toast } from './components';

type Mode = 'auto' | 'core' | 'paused';

interface HealthRow {
  store_key: string;
  store_id: string | null;
  validated: number;
  accepted: number;
  rejected: number;
  acceptance_rate: number | null;
  top_rejections: Array<{ code: string; count: number }>;
  alert: boolean;
  control: Mode;
}

interface ScriptRow { store_id: string; control: Mode; bundle: string; hash: string; bytes: number }

interface Health {
  window_hours: number;
  threshold: number;
  min_samples: number;
  stores: HealthRow[];
  alerts: HealthRow[];
  controls: Array<{ storeId: string; mode: Mode; note: string; updatedBy: string; updatedAt: string }>;
  scripts: ScriptRow[];
}

const MODE_LABELS: Record<Mode, string> = {
  auto: 'Normal',
  core: 'Retour au script complet',
  paused: 'Capture suspendue',
};

function percent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)} %`;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Action impossible pour le moment.';
}

export const AyWebsCaptureHealthPanel: React.FC<{ canControl: boolean }> = ({ canControl }) => {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [storeId, setStoreId] = useState('');
  const [mode, setMode] = useState<Mode>('paused');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminApi<{ data: Health }>('/aywebs/capture/health');
      setHealth(response.data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const scriptOf = useMemo(() => {
    const map = new Map<string, ScriptRow>();
    for (const row of health?.scripts || []) map.set(row.store_id, row);
    return map;
  }, [health]);

  const apply = async () => {
    if (!storeId) return;
    setBusy(true);
    try {
      await adminApi(`/aywebs/capture/controls/${encodeURIComponent(storeId)}`, { method: 'PUT', body: JSON.stringify({ mode, note: note.trim() }) });
      setToast({ message: `${storeId} : ${MODE_LABELS[mode]}.`, tone: 'success' });
      setNote('');
      await load();
    } catch (err) {
      setToast({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const storeOptions = (health?.scripts || []).map((row) => ({
    value: row.store_id,
    label: row.control === 'auto' ? row.store_id : `${row.store_id} — ${MODE_LABELS[row.control]}`,
  }));

  return (
    <section className="admin-card" style={{ marginBottom: 24, padding: 16 }} aria-labelledby="aywebs-capture-health">
      <div id="aywebs-capture-health">
        <CardTitle
          title="Capture des boutiques"
          subtitle={health
            ? `Captures acceptées par boutique sur ${health.window_hours} h — alerte sous ${Math.round(health.threshold * 100)} % (à partir de ${health.min_samples} captures)`
            : 'Santé de la lecture des fiches produit'}
        />
      </div>
      {toast && <Toast message={toast.message} tone={toast.tone} />}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {loading && !health && <p>Chargement…</p>}

      {health && (
        <>
          {health.alerts.length > 0 ? (
            <div role="alert" style={{ border: '1px solid var(--admin-danger-strong)', borderRadius: 8, padding: 12, margin: '12px 0' }}>
              <strong>{health.alerts.length} boutique(s) en alerte</strong>
              <ul style={{ margin: '8px 0 0', paddingInlineStart: 18 }}>
                {health.alerts.map((row) => (
                  <li key={row.store_key}>
                    {row.store_key} : {percent(row.acceptance_rate)} sur {row.validated} captures
                    {row.top_rejections[0] ? ` — motif principal ${row.top_rejections[0].code} (${row.top_rejections[0].count})` : ''}
                    {row.control !== 'auto' ? ` · ${MODE_LABELS[row.control]}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>Aucune boutique en alerte.</p>
          )}

          <DataTable<HealthRow & { id: string }>
            caption="Santé de la capture par boutique"
            rows={health.stores.map((row) => ({ ...row, id: row.store_key }))}
            emptyText="Aucune capture sur la période."
            columns={[
              { key: 'store_key', label: 'Boutique', render: (row) => <>{row.alert ? <strong>Alerte · </strong> : null}{row.store_key}</> },
              { key: 'accepted', label: 'Acceptées', render: (row) => `${row.accepted} / ${row.validated}` },
              { key: 'acceptance_rate', label: 'Taux', render: (row) => percent(row.acceptance_rate) },
              { key: 'top_rejections', label: 'Motifs de refus', render: (row) => row.top_rejections.map((entry) => `${entry.code} (${entry.count})`).join(', ') || '—' },
              { key: 'script', label: 'Script servi', render: (row) => {
                const script = row.store_id ? scriptOf.get(row.store_id) : undefined;
                return script ? `${script.bundle} · ${script.hash.slice(0, 8)}` : '—';
              } },
              { key: 'control', label: 'Mode', render: (row) => MODE_LABELS[row.control] },
            ]}
          />

          {health.controls.length > 0 && (
            <>
              <h4>Leviers actifs</h4>
              <ul style={{ paddingInlineStart: 18 }}>
                {health.controls.map((control) => (
                  <li key={control.storeId}>
                    {control.storeId} : {MODE_LABELS[control.mode]} — {control.note || 'sans note'} ({new Date(control.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })})
                  </li>
                ))}
              </ul>
            </>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <Select
              aria-label="Boutique"
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
              options={[{ value: '', label: 'Choisir une boutique' }, ...storeOptions]}
              disabled={!canControl || busy}
            />
            <Select
              aria-label="Mode de capture"
              value={mode}
              onChange={(event) => setMode(event.target.value as Mode)}
              options={(['auto', 'core', 'paused'] as Mode[]).map((value) => ({ value, label: MODE_LABELS[value] }))}
              disabled={!canControl || busy}
            />
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Raison (obligatoire sauf retour au normal)"
              aria-label="Raison du changement"
              disabled={!canControl || busy}
              style={{ minWidth: 260 }}
            />
            <Button
              onClick={() => void apply()}
              disabled={!canControl || busy || !storeId || (mode !== 'auto' && note.trim().length < 3)}
              busy={busy}
              title={canControl ? undefined : 'Droit insuffisant'}
            >
              Appliquer
            </Button>
            <Button variant="secondary" onClick={() => void load()} disabled={loading}>Actualiser</Button>
          </div>
        </>
      )}
    </section>
  );
};
