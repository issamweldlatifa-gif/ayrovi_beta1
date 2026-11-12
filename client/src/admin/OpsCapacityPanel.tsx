/**
 * CAPACITÉ DU SERVEUR — audit d'architecture du 12/11/2026.
 *
 * La question « faut-il un serveur de plus ? » se tranche ici, sur des mesures
 * SOUTENUES (fenêtre de 5 min + historique horaire), pas au nombre d'inscrits :
 *  • CPU en % de la part ALLOUÉE (0,5 vCPU sur Render Starter) ;
 *  • mémoire en % de la limite du conteneur ;
 *  • boucle d'événements (p99) : bloquée = CPU/base, libre = attente externe ;
 *  • latence p95, erreurs 5xx, disque persistant ;
 *  • les familles de routes qui consomment le temps — la première chose à
 *    optimiser avant d'acheter quoi que ce soit.
 *
 * Grille et raisonnement : docs/AYROVI_ARCHITECTURE_SCALABLE_AR_2026-11-12.md (§5).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from './api';
import { Button, CardTitle, DataTable, MetricStrip, StatusBadge } from './components';

interface WindowSummary {
  requests: number; rps: number; errorRate: number;
  p50: number | null; p95: number | null; p99: number | null;
  cpuAvg: number | null; cpuMax: number | null; rssMaxMb: number | null; eventLoopP99Ms: number | null;
}
interface RouteRow { group: string; requests: number; errors5xx: number; avgMs: number; shareOfTime: number }
interface Signal { code: string; level: 'warning' | 'critical'; value: number; threshold: number; hint: string }
interface HourRow { hour: string; instance: string; requests: number; errors_5xx: number; p95_ms: number | null; cpu_avg: number | null; cpu_max: number | null; rss_max_mb: number | null; event_loop_p99_ms: number | null; disk_used_pct: number | null }
interface Snapshot {
  instance: string; at: string; uptimeSeconds: number; node: string; backgroundJobs: boolean;
  limits: { cpu: number; memoryMb: number; source: { cpu: string; memory: string } };
  inFlight: number;
  windows: Record<'1m' | '5m' | '15m' | '60m', WindowSummary>;
  routes: RouteRow[];
  disk: { root: string; totalBytes: number | null; usedBytes: number | null; usedPercent: number | null; breakdown: Array<{ name: string; bytes: number; files: number; truncated: boolean }> };
  signals: Signal[];
  history: HourRow[];
}

const SIGNAL_LABELS: Record<string, string> = {
  CPU_SATURATED: 'CPU saturé',
  MEMORY_PRESSURE: 'Mémoire presque pleine',
  LATENCY_HIGH: 'Temps de réponse élevé',
  EVENT_LOOP_BLOCKED: 'Boucle d’événements bloquée',
  ERRORS_HIGH: 'Erreurs serveur',
  DISK_FILLING: 'Disque presque plein',
};

const dash = (value: number | null | undefined, unit = '') => (value === null || value === undefined ? '—' : `${value}${unit}`);
const megabytes = (bytes: number | null) => (bytes === null ? '—' : `${Math.round(bytes / (1024 * 1024))} Mo`);
const uptime = (seconds: number) => (seconds >= 86_400 ? `${Math.floor(seconds / 86_400)} j` : seconds >= 3_600 ? `${Math.floor(seconds / 3_600)} h` : `${Math.floor(seconds / 60)} min`);

export const OpsCapacityPanel: React.FC = () => {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminApi<{ data: Snapshot }>('/ops/metrics')
      .then((result) => { setData(result.data); setError(null); })
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Mesures indisponibles pour le moment.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const w5 = data?.windows['5m'];
  const memoryPercent = data && w5?.rssMaxMb ? Math.round((w5.rssMaxMb * 100) / data.limits.memoryMb) : null;

  return (
    <section className="admin-card">
      <CardTitle
        title="Capacité du serveur"
        subtitle={data
          ? `${data.instance} · ${data.limits.cpu} vCPU · ${data.limits.memoryMb} Mo · en ligne depuis ${uptime(data.uptimeSeconds)} · tâches planifiées ${data.backgroundJobs ? 'actives' : 'déléguées'}`
          : 'Mesures soutenues sur 5 minutes et historique horaire'}
      />
      {error ? <p className="admin-block-small">{error}</p> : null}
      {data && w5 ? (
        <>
          <MetricStrip
            note="5 dernières minutes"
            cells={[
              { label: 'CPU (part allouée)', value: `${dash(w5.cpuAvg, ' %')} · pic ${dash(w5.cpuMax, ' %')}` },
              { label: 'Mémoire', value: `${dash(w5.rssMaxMb, ' Mo')} · ${dash(memoryPercent, ' %')}` },
              { label: 'Boucle d’événements p99', value: dash(w5.eventLoopP99Ms, ' ms') },
              { label: 'Latence p50 / p95 / p99', value: `${dash(w5.p50)} / ${dash(w5.p95)} / ${dash(w5.p99, ' ms')}` },
              { label: 'Débit', value: `${w5.rps} req/s · ${w5.requests} requêtes` },
              { label: 'Erreurs 5xx', value: `${(w5.errorRate * 100).toFixed(2)} %` },
              { label: 'Disque persistant', value: `${dash(data.disk.usedPercent, ' %')} · ${megabytes(data.disk.usedBytes)} / ${megabytes(data.disk.totalBytes)}` },
            ]}
          />
          <div className="admin-settings-list">
            {data.signals.length === 0 ? (
              <div className="admin-cat-row"><span><strong>Aucun seuil franchi</strong><small className="admin-block-small">Rien ne justifie aujourd’hui une machine de plus.</small></span><StatusBadge status="ACTIVE" /></div>
            ) : data.signals.map((signal) => (
              <div key={signal.code} className="admin-cat-row">
                <span>
                  <strong>{SIGNAL_LABELS[signal.code] || signal.code} — {signal.value} (seuil {signal.threshold})</strong>
                  <small className="admin-block-small">{signal.hint}</small>
                </span>
                <StatusBadge status={signal.level === 'critical' ? 'FAILED' : 'PENDING'} />
              </div>
            ))}
          </div>
          <DataTable<RouteRow & { id: string }>
            caption="Où part le temps de calcul (5 dernières minutes)"
            rows={data.routes.map((row) => ({ ...row, id: row.group }))}
            emptyText="Aucune requête sur la période."
            columns={[
              { key: 'group', label: 'Famille de routes' },
              { key: 'shareOfTime', label: 'Part du temps', align: 'end', render: (row) => `${row.shareOfTime} %` },
              { key: 'requests', label: 'Requêtes', align: 'end' },
              { key: 'avgMs', label: 'Moyenne', align: 'end', render: (row) => `${row.avgMs} ms` },
              { key: 'errors5xx', label: 'Erreurs 5xx', align: 'end' },
            ]}
          />
          <DataTable<HourRow & { id: string }>
            caption="Historique horaire (48 h) — juger le soutenu, pas le pic"
            rows={data.history.map((row) => ({ ...row, id: `${row.hour}-${row.instance}` }))}
            emptyText="L’historique se remplit à chaque heure écoulée."
            columns={[
              { key: 'hour', label: 'Heure (UTC)', render: (row) => row.hour.slice(0, 13).replace('T', ' ') + ' h' },
              { key: 'requests', label: 'Requêtes', align: 'end' },
              { key: 'cpu_avg', label: 'CPU moy. / pic', align: 'end', render: (row) => `${dash(row.cpu_avg, ' %')} / ${dash(row.cpu_max, ' %')}` },
              { key: 'rss_max_mb', label: 'Mémoire pic', align: 'end', render: (row) => dash(row.rss_max_mb, ' Mo') },
              { key: 'p95_ms', label: 'Latence p95', align: 'end', render: (row) => dash(row.p95_ms, ' ms') },
              { key: 'event_loop_p99_ms', label: 'Boucle p99', align: 'end', render: (row) => dash(row.event_loop_p99_ms, ' ms') },
              { key: 'errors_5xx', label: 'Erreurs 5xx', align: 'end' },
              { key: 'disk_used_pct', label: 'Disque', align: 'end', render: (row) => dash(row.disk_used_pct, ' %') },
            ]}
          />
          <div className="admin-settings-list">
            {data.disk.breakdown.map((entry) => (
              <div key={entry.name} className="admin-cat-row">
                <span>{entry.name}<small className="admin-block-small">{entry.files} fichier(s){entry.truncated ? ' — comptage partiel' : ''}</small></span>
                <strong>{megabytes(entry.bytes)}</strong>
              </div>
            ))}
          </div>
        </>
      ) : loading ? <p className="admin-block-small">Mesure en cours…</p> : null}
      <Button variant="secondary" onClick={load} disabled={loading}>Actualiser</Button>
    </section>
  );
};
