import React, { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from './api';
import { Button } from './components';

// ---------- types ----------
interface Carton {
  id: string;
  carton_code: string;
  carton_reference: string | null;
  qr_code_value: string;
  barcode_value: string | null;
  carton_number: number;
  total_cartons: number;
  weight: number | null;
  weight_unit: string | null;
}
interface Dispatch {
  configured?: boolean;
  status: 'SENDING' | 'SENT' | 'SEND_FAILED' | null;
  warehouse_shipment_id?: string | null;
  card_id?: string | null;
  http_status?: number | null;
  sent_at?: string | null;
  attempts?: number;
  error_code?: string | null;
  error_message?: string | null;
}
interface Shipment {
  id: string;
  shipment_code: string;
  reference: string | null;
  status: 'DRAFT' | 'CONFIRMED' | string;
  carrier_name: string | null;
  carrier_code: string | null;
  service_name: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  tracking_status: string | null;
  sender_name: string | null;
  sender_company: string | null;
  sender_country: string | null;
  sender_city: string | null;
  destination_country: string | null;
  destination_city: string | null;
  destination_code: string | null;
  shipped_at: string | null;
  estimated_arrival_at: string | null;
  total_cartons: number;
  total_products: number;
  total_units: number;
  total_weight: number | null;
  weight_unit: string | null;
  carton_count?: number;
  cartons?: Carton[];
  dispatch?: Dispatch | null;
  dispatch_status?: string | null;
  warehouse_shipment_id?: string | null;
}

const EMPTY = {
  reference: '',
  carrier_name: '', carrier_code: '', service_name: '',
  tracking_number: '', tracking_url: '', tracking_status: 'IN_TRANSIT',
  sender_name: '', sender_company: '', sender_country: '', sender_city: '',
  destination_country: 'TN', destination_city: 'Tunis', destination_code: 'AYROVI-WH-TN',
  shipped_at: '', estimated_arrival_at: '',
  total_products: '0', total_units: '0', total_weight: '', weight_unit: 'kg',
  carton_count: '1',
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: 'Brouillon', cls: 'arrival-wh-tag' },
  CONFIRMED: { text: 'Confirmé', cls: 'arrival-wh-tag' },
  SENT: { text: '✓ Envoyé', cls: 'arrival-wh-tag arrival-wh-sent' },
  SENDING: { text: 'Envoi…', cls: 'arrival-wh-tag' },
  SEND_FAILED: { text: 'Échec', cls: 'arrival-wh-tag arrival-wh-failed' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_LABEL[status] || { text: status, cls: 'arrival-wh-tag' };
  return <span className={s.cls}>{s.text}</span>;
}

export default function ArrivalShipments({ arrivalId, canWrite, arrivalConfirmed }: {
  arrivalId: string;
  canWrite: boolean;
  arrivalConfirmed: boolean;
}) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [busy, setBusy] = useState('');
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi<{ data: { configured: boolean; shipments: Shipment[] } }>(
        `/arrival-ingestion/arrivals/${arrivalId}/shipments`,
      );
      setConfigured(res.data.configured);
      setShipments(res.data.shipments);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Impossible de charger les envois.');
    } finally {
      setLoading(false);
    }
  }, [arrivalId]);

  useEffect(() => { void load(); }, [load]);

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  async function createShipment() {
    setFormError('');
    setBusy('create');
    try {
      // Nested normalized shape (matches the integration envelope); the server
      // accepts both flat and nested.
      const body = {
        shipment_reference: form.reference || undefined,
        source_type: 'MANUAL',
        carrier: { name: form.carrier_name, code: form.carrier_code, service_name: form.service_name },
        tracking: { tracking_number: form.tracking_number, tracking_url: form.tracking_url || null, status: form.tracking_status },
        sender: { name: form.sender_name, company: form.sender_company, country: form.sender_country, city: form.sender_city },
        destination: { country: form.destination_country, city: form.destination_city, destination_code: form.destination_code },
        dates: { shipped_at: form.shipped_at || null, estimated_arrival_at: form.estimated_arrival_at || null },
        total_products: Number(form.total_products) || 0,
        total_units: Number(form.total_units) || 0,
        total_weight: form.total_weight ? Number(form.total_weight) : null,
        weight_unit: form.weight_unit || null,
        cartons: Array.from({ length: Math.max(1, Number(form.carton_count) || 1) }, () => ({})),
      };
      await adminApi(`/arrival-ingestion/arrivals/${arrivalId}/shipments`, { method: 'POST', body: JSON.stringify(body) });
      setShowForm(false);
      setForm(EMPTY);
      await load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Création impossible.');
    } finally {
      setBusy('');
    }
  }

  async function confirmShipment(id: string) {
    setBusy(id);
    try {
      await adminApi(`/arrival-ingestion/shipments/${id}/confirm`, { method: 'POST', body: '{}' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Confirmation impossible.');
    } finally {
      setBusy('');
    }
  }

  async function sendShipment(id: string) {
    setBusy(id);
    setError('');
    try {
      await adminApi(`/arrival-ingestion/shipments/${id}/send-to-warehouse`, { method: 'POST', body: '{}' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Envoi impossible.');
      await load();
    } finally {
      setBusy('');
    }
  }

  if (loading) return <section className="arrival-shipments"><p>Chargement des envois…</p></section>;

  return (
    <section className="arrival-shipments">
      <div className="arrival-section-title">
        <div>
          <span>SHIPMENT CARDS · {shipments.length} envoi{shipments.length === 1 ? '' : 's'}</span>
          <h2>Envois physiques (cartons)</h2>
        </div>
        {canWrite && !showForm && (
          <Button variant="secondary" onClick={() => setShowForm(true)}>+ Nouvel envoi</Button>
        )}
      </div>

      {!configured && (
        <p className="arrival-wh-tag arrival-wh-disabled">Entrepôt non configuré (WAREHOUSE_API_URL manquant) — l’envoi est désactivé.</p>
      )}
      {error && <p className="arrival-form-error">{error}</p>}

      {showForm && (
        <div className="arrival-shipment-form">
          <h3>Nouvel envoi</h3>
          {formError && <p className="arrival-form-error">{formError}</p>}
          <div className="arrival-shipment-grid">
            <label>Référence<input value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="SHEIN-TN-…" /></label>
            <label>Transporteur — nom<input value={form.carrier_name} onChange={(e) => set('carrier_name', e.target.value)} placeholder="DHL" /></label>
            <label>Code transporteur<input value={form.carrier_code} onChange={(e) => set('carrier_code', e.target.value)} placeholder="DHL" /></label>
            <label>Service<input value={form.service_name} onChange={(e) => set('service_name', e.target.value)} placeholder="Express" /></label>
            <label>N° de suivi<input value={form.tracking_number} onChange={(e) => set('tracking_number', e.target.value)} /></label>
            <label>Statut suivi
              <select value={form.tracking_status} onChange={(e) => set('tracking_status', e.target.value)}>
                <option value="UNKNOWN">Inconnu</option>
                <option value="IN_TRANSIT">En transit</option>
                <option value="DELIVERED">Livré</option>
              </select>
            </label>
            <label>Expéditeur — nom<input value={form.sender_name} onChange={(e) => set('sender_name', e.target.value)} /></label>
            <label>Société<input value={form.sender_company} onChange={(e) => set('sender_company', e.target.value)} /></label>
            <label>Pays exp.<input value={form.sender_country} onChange={(e) => set('sender_country', e.target.value)} placeholder="CN" /></label>
            <label>Ville exp.<input value={form.sender_city} onChange={(e) => set('sender_city', e.target.value)} /></label>
            <label>Pays dest.<input value={form.destination_country} onChange={(e) => set('destination_country', e.target.value)} /></label>
            <label>Ville dest.<input value={form.destination_city} onChange={(e) => set('destination_city', e.target.value)} /></label>
            <label>Code dest.<input value={form.destination_code} onChange={(e) => set('destination_code', e.target.value)} /></label>
            <label>Date expédition<input type="datetime-local" value={form.shipped_at} onChange={(e) => set('shipped_at', e.target.value)} /></label>
            <label>Arrivée estimée<input type="datetime-local" value={form.estimated_arrival_at} onChange={(e) => set('estimated_arrival_at', e.target.value)} /></label>
            <label>Nb produits<input type="number" value={form.total_products} onChange={(e) => set('total_products', e.target.value)} /></label>
            <label>Nb unités<input type="number" value={form.total_units} onChange={(e) => set('total_units', e.target.value)} /></label>
            <label>Poids total<input type="number" step="0.1" value={form.total_weight} onChange={(e) => set('total_weight', e.target.value)} /></label>
            <label>Unité poids<input value={form.weight_unit} onChange={(e) => set('weight_unit', e.target.value)} /></label>
            <label>Nb cartons<input type="number" min={1} value={form.carton_count} onChange={(e) => set('carton_count', e.target.value)} /></label>
          </div>
          <div className="arrival-shipment-form-actions">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button busy={busy === 'create'} onClick={createShipment}>Créer (brouillon)</Button>
          </div>
        </div>
      )}

      {shipments.length === 0 && !loading && (
        <p>Aucun envoi pour cet Arrival. Créez un Shipment Card, confirmez-le puis envoyez-le à l’entrepôt.</p>
      )}

      <div className="arrival-shipment-list">
        {shipments.map((s) => {
          const integration = s.dispatch?.status ?? s.dispatch_status ?? null;
          return (
            <article key={s.id} className="arrival-shipment-card">
              <header>
                <div className="arrival-shipment-id">
                  <strong>{s.shipment_code}</strong>
                  <span>{s.reference || '—'}</span>
                </div>
                <div className="arrival-shipment-badges">
                  <StatusPill status={s.status} />
                  {integration && <StatusPill status={integration} />}
                </div>
              </header>

              <dl className="arrival-shipment-meta">
                <div><dt>Transporteur</dt><dd>{s.carrier_name ? `${s.carrier_name}${s.service_name ? ' · ' + s.service_name : ''}` : '—'}</dd></div>
                <div><dt>Suivi</dt><dd>{s.tracking_number || '—'}{s.tracking_status ? ` (${s.tracking_status})` : ''}</dd></div>
                <div><dt>Expéditeur</dt><dd>{[s.sender_company, s.sender_name, s.sender_country, s.sender_city].filter(Boolean).join(', ') || '—'}</dd></div>
                <div><dt>Destination</dt><dd>{[s.destination_city, s.destination_country, s.destination_code].filter(Boolean).join(', ') || '—'}</dd></div>
                <div><dt>Cartons</dt><dd><strong>{s.total_cartons}</strong></dd></div>
                <div><dt>Produits / Unités</dt><dd>{s.total_products} / {s.total_units}</dd></div>
              </dl>

              {/* Carton IDs (QR = stable id only) */}
              {s.cartons && s.cartons.length > 0 && (
                <div className="arrival-shipment-cartons">
                  {s.cartons.map((c) => (
                    <span key={c.id} className="arrival-carton-chip" title={`QR: ${c.qr_code_value}`}>{c.carton_code}</span>
                  ))}
                </div>
              )}

              {integration === 'SENT' && (
                <p className="arrival-shipment-sent">
                  ✓ Reçu par l’entrepôt · <strong>{s.warehouse_shipment_id || s.dispatch?.warehouse_shipment_id}</strong>
                  {s.dispatch?.sent_at ? ` · ${fmt(s.dispatch.sent_at)}` : ''}
                  {s.dispatch?.attempts && s.dispatch.attempts > 1 ? ` · ${s.dispatch.attempts} tentatives` : ''}
                </p>
              )}
              {integration === 'SEND_FAILED' && (
                <p className="arrival-form-error" title={s.dispatch?.error_message || ''}>
                  Échec d’envoi {s.dispatch?.http_status ? `(HTTP ${s.dispatch.http_status})` : ''} : {s.dispatch?.error_code || 'erreur'}
                </p>
              )}

              {canWrite && (
                <footer className="arrival-shipment-actions">
                  {s.status === 'DRAFT' && (
                    <Button variant="secondary" busy={busy === s.id} onClick={() => confirmShipment(s.id)}>Confirmer</Button>
                  )}
                  {s.status === 'CONFIRMED' && integration !== 'SENT' && configured && (
                    <Button busy={busy === s.id} onClick={() => sendShipment(s.id)}>
                      {integration === 'SEND_FAILED' ? 'Réessayer' : 'Send to Warehouse'}
                    </Button>
                  )}
                </footer>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
