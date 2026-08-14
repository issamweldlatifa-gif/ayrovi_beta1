import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, AlertCircle, Loader2, ChartLine, FileText } from '../components/QatafoIcons';
import { adminApi } from './api';
import { Button, Field } from './components';

/* ------------------------------------------------------------------ */
/* LENS TEST LAB — upload, question, run, résultats + évaluation       */
/* ------------------------------------------------------------------ */

interface LabRun {
  id: string; imageHash: string; question: string; durationMs: number; createdAt: string;
  pricing: any; confidence: number; verified: boolean;
}

export const LensLabPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [history, setHistory] = useState<LabRun[]>([]);
  const [evalFor, setEvalFor] = useState<LabRun | null>(null);
  const [expectedPrice, setExpectedPrice] = useState('');
  const [expectedCurrency, setExpectedCurrency] = useState('EUR');
  const [errorType, setErrorType] = useState('SALE_VS_ORIGINAL_PRICE');
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(() => {
    adminApi<any>('/lens-lab/history').then((payload) => setHistory(payload.data || [])).catch(() => undefined);
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const run = async () => {
    if (!file) { setError('Choisissez une image à analyser.'); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('question', question);
      const payload = await adminApi<any>('/lens-lab/run', { method: 'POST', body: form, rawBody: true } as any);
      setResult(payload.data);
      loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Analyse impossible.');
    } finally { setBusy(false); }
  };

  const saveEval = async () => {
    if (!evalFor) return;
    setBusy(true);
    try {
      await adminApi('/lens-lab/' + evalFor.id + '/evaluate', {
        method: 'POST',
        body: JSON.stringify({ expectedPrice: Number(expectedPrice), expectedCurrency, errorType, note }),
      });
      setEvalFor(null); setNote(''); setExpectedPrice('');
    } catch (err: any) { setError(err?.message || 'Évaluation impossible.'); }
    finally { setBusy(false); }
  };

  const price = (value: any) => value == null ? '—' : Number(value).toFixed(2);

  return (
    <div className="admin-page">
      <header className="admin-page-head"><div><span className="admin-eyebrow">AI → Lens Test Lab</span><h2>Tester la Lens sur des images réelles</h2><p>Upload, question, extraction, confiance, OCR et évaluation — sans toucher à la production.</p></div></header>

      <section className="admin-card">
        <Field label="Image (screenshot, photo, panier)"><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
        <Field label="Question (optionnel)" hint="Ex. : قداش السعر ؟ / Quel est le prix ?"><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="قداش السعر ؟" /></Field>
        <div className="admin-actions"><Button busy={busy} onClick={() => void run()}><Camera size={16} />Run Lens</Button></div>
        {error && <div className="admin-error"><AlertCircle size={16} />{error}</div>}
      </section>

      {result && (
        <section className="admin-card">
          <h3>Résultat ({result.durationMs} ms {result.lens?.cache_hit ? '· cache' : ''})</h3>
          <div className="admin-kv">
            <div><span>Prix produit</span><strong>{price(result.lens?.pricing?.sale_price)} {result.lens?.pricing?.currency || ''}</strong></div>
            <div><span>Ancien prix</span><strong>{price(result.lens?.pricing?.original_price)}</strong></div>
            <div><span>Livraison</span><strong>{price(result.lens?.pricing?.shipping_price)}</strong></div>
            <div><span>Total</span><strong>{price(result.lens?.pricing?.total_price)}</strong></div>
            <div><span>Remise</span><strong>{result.lens?.pricing?.discount_percent != null ? `${result.lens.pricing.discount_percent}%` : '—'}</strong></div>
            <div><span>Confiance</span><strong>{Math.round((result.lens?.confidence || 0) * 100)}% {result.lens?.verified ? '· vérifié' : ''}</strong></div>
          </div>
          {result.lens?.warnings?.length > 0 && <p className="admin-block-small">Warnings : {result.lens.warnings.join(', ')}</p>}
          <h3 style={{ marginTop: 14 }}>OCR (deuxième opinion)</h3>
          <p className="admin-block-small">Caractères : {result.lens?.sources?.ocr?.text_chars || 0} · confiance OCR : {Math.round((result.ocr?.confidence || 0) * 100)}% · segments : {result.lens?.sources?.ocr?.segments || 0}</p>
          {result.ocr?.findings?.length > 0 && (
            <table className="admin-table"><thead><tr><th>Rôle</th><th>Montant</th><th>Devise</th><th>Confiance</th><th>Extrait</th></tr></thead>
              <tbody>{result.ocr.findings.slice(0, 8).map((f: any, i: number) => (
                <tr key={i}><td>{f.role}</td><td>{f.value}</td><td>{f.currency || '—'}</td><td>{Math.round(f.confidence * 100)}%</td><td className="admin-block-small">{f.snippet}</td></tr>
              ))}</tbody></table>
          )}
          {result.lens?.products?.length > 0 && (
            <><h3 style={{ marginTop: 14 }}>Produits détectés</h3>
              <ul className="admin-list">{result.lens.products.map((p: any, i: number) => <li key={i}>{p.name} {p.brand ? `· ${p.brand}` : ''} — {p.price != null ? `${p.price} ${p.currency || ''}` : 'prix non lu'}</li>)}</ul></>
          )}
          <div className="admin-actions" style={{ marginTop: 14 }}>
            <Button variant="secondary" onClick={() => setEvalFor({ id: result.id } as LabRun)}><FileText size={15} />Évaluer ce run (dataset d'erreurs)</Button>
          </div>
        </section>
      )}

      {evalFor && (
        <section className="admin-card">
          <h3>Évaluation attendue vs détectée</h3>
          <div className="admin-grid-2">
            <Field label="Prix attendu" required><input value={expectedPrice} onChange={(e) => setExpectedPrice(e.target.value)} placeholder="39.99" /></Field>
            <Field label="Devise"><select value={expectedCurrency} onChange={(e) => setExpectedCurrency(e.target.value)}><option>EUR</option><option>USD</option><option>GBP</option><option>JPY</option><option>TND</option></select></Field>
            <Field label="Type d'erreur"><select value={errorType} onChange={(e) => setErrorType(e.target.value)}>
              {['NONE', 'SALE_VS_ORIGINAL_PRICE', 'WRONG_CURRENCY', 'PRICE_MISSED', 'PARTIAL_PRICE_READ', 'WRONG_PRICE', 'OCR_FAILURE', 'VISION_FAILURE', 'HALLUCINATION'].map((t) => <option key={t}>{t}</option>)}
            </select></Field>
            <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          <div className="admin-actions"><Button busy={busy} onClick={() => void saveEval()}>Enregistrer dans le dataset</Button><Button variant="ghost" onClick={() => setEvalFor(null)}>Annuler</Button></div>
        </section>
      )}

      <section className="admin-card">
        <h3>Historique des runs</h3>
        <table className="admin-table"><thead><tr><th>Date</th><th>Question</th><th>Prix lu</th><th>Confiance</th><th>Vérifié</th><th>Durée</th><th></th></tr></thead>
          <tbody>{history.map((row) => (
            <tr key={row.id}>
              <td>{new Date(row.createdAt).toLocaleString('fr-FR')}</td>
              <td className="admin-block-small">{row.question || '—'}</td>
              <td>{row.pricing ? `${price(row.pricing.sale_price ?? row.pricing.total_price)} ${row.pricing.currency || ''}` : '—'}</td>
              <td>{Math.round(row.confidence * 100)}%</td>
              <td>{row.verified ? <CheckCircle2 size={15} /> : '—'}</td>
              <td>{row.durationMs} ms</td>
              <td><Button variant="ghost" onClick={() => setEvalFor(row)}>Évaluer</Button></td>
            </tr>
          ))}</tbody></table>
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* AI DISCOVERY — où l'AI excelle, échoue, gaps                        */
/* ------------------------------------------------------------------ */

export const AiDiscoveryPage: React.FC = () => {
  const [data, setData] = useState<any | null>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    adminApi<any>('/ai-discovery').then((payload) => setData(payload.data)).catch(() => undefined).finally(() => setBusy(false));
  }, []);
  if (busy) return <div className="admin-page"><Loader2 className="animate-spin" size={22} /></div>;
  if (!data) return <div className="admin-page"><p>Aucune donnée.</p></div>;

  return (
    <div className="admin-page">
      <header className="admin-page-head"><div><span className="admin-eyebrow">AI → Discovery</span><h2>Intelligence & amélioration continue</h2><p>Signaux des 30 derniers jours — aucune conversation brute, uniquement des agrégats anonymisés.</p></div></header>

      <div className="admin-kpi-row">
        <article className="admin-kpi"><strong>{data.resolutionScore != null ? `${Math.round(data.resolutionScore * 100)}%` : '—'}</strong><span>Resolution score</span></article>
        <article className="admin-kpi"><strong>{data.lens?.accuracy != null ? `${Math.round(data.lens.accuracy * 100)}%` : '—'}</strong><span>Lens vérifiée ({data.lens?.runs || 0} runs)</span></article>
        <article className="admin-kpi"><strong>{data.correctionCount || 0}</strong><span>Corrections clients</span></article>
        <article className="admin-kpi"><strong>{data.humanInterventions || 0}</strong><span>Interventions humaines</span></article>
      </div>

      <div className="admin-grid-2">
        <section className="admin-card"><h3>Erreurs Lens (dataset)</h3>
          {data.topErrorTypes?.length ? <ul className="admin-list">{data.topErrorTypes.map((e: any) => <li key={e.errorType}>{e.errorType} — {e.count}</li>)}</ul> : <p className="admin-block-small">Aucune erreur enregistrée.</p>}
        </section>
        <section className="admin-card"><h3>Outils en échec</h3>
          {data.toolFailures?.length ? <ul className="admin-list">{data.toolFailures.map((t: any) => <li key={t.tool}>{t.tool} — {t.count}</li>)}</ul> : <p className="admin-block-small">Aucun échec d'outil.</p>}
        </section>
        <section className="admin-card"><h3>Termes fréquents des questions</h3>
          {data.topQuestionTerms?.length ? <p className="admin-block-small">{data.topQuestionTerms.map((t: any) => `${t.term} (${t.count})`).join(' · ')}</p> : <p className="admin-block-small">Pas encore de signal.</p>}
        </section>
        <section className="admin-card"><h3>Événements (30 j)</h3>
          <ul className="admin-list">{Object.entries(data.totals || {}).map(([type, count]) => <li key={type}>{type} — {String(count)}</li>)}</ul>
        </section>
      </div>
      <p className="admin-block-small" style={{ marginTop: 12 }}><ChartLine size={14} /> Ces données alimentent l'évaluation humaine : aucun prompt ni modèle n'est modifié automatiquement.</p>
    </div>
  );
};
