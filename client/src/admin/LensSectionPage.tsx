import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Field, Toast } from './components';
import { adminApi } from './api';
import { ArrowDown, ArrowUp, RefreshCw, Trash2 } from '../components/QatafoIcons';

/**
 * CONTENT → LENS — مصدر الحقيقة الوحيد لقسم LENS.
 * كل نص أو صورة تظهر في قسم LENS على الموقع تُدار من هنا (لا شيء ثابت في الكود).
 * Edit → Preview → Save.
 */

interface LensPhoneDraft {
  image: string;
  statusLabel: string;
  resultLabel: string;
  productName: string;
  priceChip: string;
  metaChip: string;
  stockChip: string;
  ctaLabel: string;
}

interface LensDraft {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  proofLine: string;
  accentColor: string;
  elementOrder: string;
  bgType: 'COLOR' | 'IMAGE';
  bgColor: string;
  bgImage: string;
  overlayStrength: number;
  focalX: number;
  focalY: number;
  phoneEnabled: boolean;
  enabled: boolean;
  sortOrder: number;
  phone: LensPhoneDraft;
}

const EMPTY_DRAFT: LensDraft = {
  eyebrow: '', title: '', description: '', ctaLabel: '', ctaUrl: '', proofLine: '',
  accentColor: '#FF7A00', elementOrder: 'eyebrow,title,description,cta,proof',
  bgType: 'COLOR', bgColor: '#F6F7F9', bgImage: '', overlayStrength: 0.25, focalX: 0.5, focalY: 0.45,
  phoneEnabled: true, enabled: true, sortOrder: 40,
  phone: { image: '', statusLabel: '', resultLabel: '', productName: '', priceChip: '', metaChip: '', stockChip: '', ctaLabel: '' },
};

const ELEMENT_LABELS: Record<string, string> = {
  eyebrow: 'Label (eyebrow)', title: 'Titre principal', description: 'Description', cta: 'Bouton CTA', proof: 'Ligne de preuve',
};

export const LensSectionPage: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [draft, setDraft] = useState<LensDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [phoneFile, setPhoneFile] = useState<File | null>(null);
  const [phonePreview, setPhonePreview] = useState('');
  const [bgPreview, setBgPreview] = useState('');
  const bgInput = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(null), 3800); return () => window.clearTimeout(timer); } }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi<any>('/lens-hero');
      if (result.data) setDraft({ ...EMPTY_DRAFT, ...result.data, phone: { ...EMPTY_DRAFT.phone, ...(result.data.phone || {}) } });
    } catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patch = (changes: Partial<LensDraft>) => setDraft((current) => ({ ...current, ...changes }));
  const patchPhone = (changes: Partial<LensPhoneDraft>) => setDraft((current) => ({ ...current, phone: { ...current.phone, ...changes } }));

  const keys = useMemo(() => String(draft.elementOrder || '').split(',').map((token) => token.trim()).filter(Boolean), [draft.elementOrder]);
  const move = (index: number, direction: -1 | 1) => {
    const next = [...keys];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patch({ elementOrder: next.join(',') });
  };

  const pickFile = (file: File | null, kind: 'bg' | 'phone') => {
    if (kind === 'bg') { setBgFile(file); setBgPreview(file ? URL.createObjectURL(file) : ''); }
    else { setPhoneFile(file); setPhonePreview(file ? URL.createObjectURL(file) : ''); }
  };

  const save = async () => {
    if (!draft.title.trim()) { setToast({ message: 'Le titre LENS est obligatoire.', tone: 'error' }); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('eyebrow', draft.eyebrow);
      form.append('title', draft.title);
      form.append('description', draft.description);
      form.append('ctaLabel', draft.ctaLabel);
      form.append('ctaUrl', draft.ctaUrl);
      form.append('proofLine', draft.proofLine);
      form.append('accentColor', draft.accentColor);
      form.append('elementOrder', draft.elementOrder);
      form.append('bgType', draft.bgType);
      form.append('bgColor', draft.bgColor);
      form.append('bgImage', draft.bgImage);
      form.append('overlayStrength', String(draft.overlayStrength));
      form.append('focalX', String(draft.focalX));
      form.append('focalY', String(draft.focalY));
      form.append('phoneEnabled', draft.phoneEnabled ? 'true' : 'false');
      form.append('enabled', draft.enabled ? 'true' : 'false');
      form.append('sortOrder', String(draft.sortOrder));
      form.append('phoneImage', draft.phone.image);
      form.append('phoneStatusLabel', draft.phone.statusLabel);
      form.append('phoneResultLabel', draft.phone.resultLabel);
      form.append('phoneProductName', draft.phone.productName);
      form.append('phonePriceChip', draft.phone.priceChip);
      form.append('phoneMetaChip', draft.phone.metaChip);
      form.append('phoneStockChip', draft.phone.stockChip);
      form.append('phoneCtaLabel', draft.phone.ctaLabel);
      if (bgFile) form.append('bgImage', bgFile, bgFile.name);
      if (phoneFile) form.append('phoneImage', phoneFile, phoneFile.name);
      const result = await adminApi<any>('/lens-hero', { method: 'PUT', body: form });
      if (result.data) setDraft({ ...EMPTY_DRAFT, ...result.data, phone: { ...EMPTY_DRAFT.phone, ...(result.data.phone || {}) } });
      setBgFile(null); setPhoneFile(null); setBgPreview(''); setPhonePreview('');
      setToast({ message: 'Section LENS enregistrée — visible immédiatement sur le site.', tone: 'success' });
    } catch (reason: any) { setToast({ message: reason.message, tone: 'error' }); }
    finally { setBusy(false); }
  };

  const titleLines = draft.title.includes('\n')
    ? draft.title.split('\n').map((line) => line.trim()).filter(Boolean)
    : draft.title.split('.').map((line) => line.trim()).filter(Boolean).map((line) => `${line}.`);

  const phoneImage = phonePreview || draft.phone.image;
  const bgImage = bgPreview || draft.bgImage;

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Contenu → LENS</span>
          <h2>Section LENS</h2>
          <p>Source unique du contenu LENS : label, titre, description, CTA et son lien, ligne de preuve, fond, accent, ordre des éléments et mockup. Le site n’affiche rien qui ne vienne d’ici.</p>
        </div>
        <div className="admin-actions">
          <Button variant="secondary" onClick={() => void load()} disabled={busy}><RefreshCw size={16} />Recharger</Button>
          <Button onClick={() => void save()} busy={busy} disabled={!canWrite || loading}>Enregistrer</Button>
        </div>
      </header>

      {loading ? <p className="admin-block-small">Chargement…</p> : (
        <div className="admin-grid-2">
          <section className="admin-card">
            <h3>Contenu</h3>
            <div className="admin-form">
              <Field label="Label (eyebrow)" hint="Petit texte au-dessus du titre."><input disabled={!canWrite} value={draft.eyebrow} onChange={(event) => patch({ eyebrow: event.target.value })} maxLength={40} /></Field>
              <Field label="Titre principal" required hint="Une phrase par ligne possible (Entrée). Chaque phrase devient une ligne.">
                <textarea disabled={!canWrite} rows={3} value={draft.title} onChange={(event) => patch({ title: event.target.value })} maxLength={160} />
              </Field>
              <Field label="Description" full><textarea disabled={!canWrite} rows={3} value={draft.description} onChange={(event) => patch({ description: event.target.value })} maxLength={400} /></Field>
              <Field label="Texte du CTA"><input disabled={!canWrite} value={draft.ctaLabel} onChange={(event) => patch({ ctaLabel: event.target.value })} maxLength={40} /></Field>
              <Field label="Destination du CTA" hint="Vide = ouvre l’expérience LENS. Sinon : URL https://… ou chemin interne /…">
                <input disabled={!canWrite} value={draft.ctaUrl} onChange={(event) => patch({ ctaUrl: event.target.value })} placeholder="https://… ou /lens" />
              </Field>
              <Field label="Ligne de preuve" full><input disabled={!canWrite} value={draft.proofLine} onChange={(event) => patch({ proofLine: event.target.value })} maxLength={120} /></Field>
              <Field label="Couleur d’accent"><input disabled={!canWrite} type="color" value={draft.accentColor} onChange={(event) => patch({ accentColor: event.target.value })} /></Field>
              <Field label="Position parmi les sections" hint="Ordre dans la page d’accueil (avec Sections).">
                <input disabled={!canWrite} type="number" min={0} max={999} value={draft.sortOrder} onChange={(event) => patch({ sortOrder: Number(event.target.value) })} />
              </Field>
              <Field label="Afficher la section" full>
                <button type="button" disabled={!canWrite} className={`admin-switch ${draft.enabled ? 'is-on' : ''}`} onClick={() => patch({ enabled: !draft.enabled })}><i /><span>{draft.enabled ? 'Section visible' : 'Section masquée'}</span></button>
              </Field>
            </div>

            <h3 style={{ marginTop: 18 }}>Ordre des éléments</h3>
            <ul className="admin-list">
              {keys.map((key, index) => (
                <li key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span>{index + 1}. {ELEMENT_LABELS[key] || key}</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <Button variant="ghost" disabled={!canWrite || index === 0} onClick={() => move(index, -1)} aria-label="Monter"><ArrowUp size={15} /></Button>
                    <Button variant="ghost" disabled={!canWrite || index === keys.length - 1} onClick={() => move(index, 1)} aria-label="Descendre"><ArrowDown size={15} /></Button>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="admin-card">
            <h3>Fond & accent</h3>
            <div className="admin-form">
              <Field label="Type de fond">
                <select disabled={!canWrite} value={draft.bgType} onChange={(event) => patch({ bgType: event.target.value === 'IMAGE' ? 'IMAGE' : 'COLOR' })}>
                  <option value="COLOR">Couleur</option>
                  <option value="IMAGE">Image</option>
                </select>
              </Field>
              {draft.bgType === 'COLOR'
                ? <Field label="Couleur de fond"><input disabled={!canWrite} type="color" value={draft.bgColor} onChange={(event) => patch({ bgColor: event.target.value })} /></Field>
                : (
                  <>
                    <Field label="Image de fond" full hint="JPEG/PNG/WebP — 8 Mo maximum.">
                      <input ref={bgInput} disabled={!canWrite} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => pickFile(event.target.files?.[0] || null, 'bg')} />
                    </Field>
                    {bgImage && <img src={bgImage} alt="Aperçu du fond" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 12 }} />}
                    <Field label={`Opacité du voile · ${Math.round(draft.overlayStrength * 100)}%`} full>
                      <input disabled={!canWrite} type="range" min={0} max={1} step={0.05} value={draft.overlayStrength} onChange={(event) => patch({ overlayStrength: Number(event.target.value) })} />
                    </Field>
                    <Field label={`Point focal X · ${Math.round(draft.focalX * 100)}%`}><input disabled={!canWrite} type="range" min={0} max={1} step={0.01} value={draft.focalX} onChange={(event) => patch({ focalX: Number(event.target.value) })} /></Field>
                    <Field label={`Point focal Y · ${Math.round(draft.focalY * 100)}%`}><input disabled={!canWrite} type="range" min={0} max={1} step={0.01} value={draft.focalY} onChange={(event) => patch({ focalY: Number(event.target.value) })} /></Field>
                    {draft.bgImage && (
                      <Button variant="danger" disabled={!canWrite} onClick={() => patch({ bgImage: '' })}><Trash2 size={15} />Retirer l’image</Button>
                    )}
                  </>
                )}
            </div>

            <h3 style={{ marginTop: 18 }}>Mockup téléphone</h3>
            <div className="admin-form">
              <Field label="Afficher le mockup" full>
                <button type="button" disabled={!canWrite} className={`admin-switch ${draft.phoneEnabled ? 'is-on' : ''}`} onClick={() => patch({ phoneEnabled: !draft.phoneEnabled })}><i /><span>{draft.phoneEnabled ? 'Mockup visible' : 'Mockup masqué'}</span></button>
              </Field>
              <Field label="Image dans l’écran" full hint="Photo affichée dans la zone de scan.">
                <input ref={phoneInput} disabled={!canWrite} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => pickFile(event.target.files?.[0] || null, 'phone')} />
              </Field>
              {phoneImage && <img src={phoneImage} alt="Aperçu du mockup" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 12 }} />}
              {draft.phone.image && <Button variant="danger" disabled={!canWrite} onClick={() => patchPhone({ image: '' })}><Trash2 size={15} />Retirer l’image</Button>}
              <Field label="Libellé de la barre d’état"><input disabled={!canWrite} value={draft.phone.statusLabel} onChange={(event) => patchPhone({ statusLabel: event.target.value })} maxLength={40} /></Field>
              <Field label="Étiquette du résultat"><input disabled={!canWrite} value={draft.phone.resultLabel} onChange={(event) => patchPhone({ resultLabel: event.target.value })} maxLength={40} /></Field>
              <Field label="Nom du produit" full><input disabled={!canWrite} value={draft.phone.productName} onChange={(event) => patchPhone({ productName: event.target.value })} maxLength={80} /></Field>
              <Field label="Puce prix (mise en avant)"><input disabled={!canWrite} value={draft.phone.priceChip} onChange={(event) => patchPhone({ priceChip: event.target.value })} maxLength={40} /></Field>
              <Field label="Puce délai"><input disabled={!canWrite} value={draft.phone.metaChip} onChange={(event) => patchPhone({ metaChip: event.target.value })} maxLength={40} /></Field>
              <Field label="Puce disponibilité"><input disabled={!canWrite} value={draft.phone.stockChip} onChange={(event) => patchPhone({ stockChip: event.target.value })} maxLength={40} /></Field>
              <Field label="Bouton du mockup" full><input disabled={!canWrite} value={draft.phone.ctaLabel} onChange={(event) => patchPhone({ ctaLabel: event.target.value })} maxLength={40} /></Field>
            </div>
          </section>

          <section className="admin-card" style={{ gridColumn: '1 / -1' }}>
            <h3>Aperçu mobile</h3>
            <p className="admin-block-small">Le téléphone prend ~90% de la largeur de l’écran ; la section occupe toute la largeur. Le rendu exact dépend de la largeur réelle de l’appareil.</p>
            <div style={{ maxWidth: 390, margin: '12px auto 0', border: '1px solid rgba(17,18,23,0.12)', borderRadius: 18, overflow: 'hidden', background: draft.bgType === 'IMAGE' && bgImage ? undefined : draft.bgColor }}>
              {draft.bgType === 'IMAGE' && bgImage && <img src={bgImage} alt="" style={{ width: '100%', height: 180, objectFit: 'cover', opacity: 1 - draft.overlayStrength * 0.6 }} />}
              <div style={{ padding: '28px 24px' }}>
                {keys.map((key) => {
                  if (key === 'eyebrow') return draft.eyebrow ? <p key={key} style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.24em', textTransform: 'uppercase', color: draft.accentColor }}>{draft.eyebrow}</p> : null;
                  if (key === 'title') return <h4 key={key} style={{ margin: '10px 0 0', fontSize: 30, lineHeight: 1.06, fontWeight: 800, letterSpacing: '-0.025em' }}>{titleLines.map((line, index) => <span key={index}>{line}{index < titleLines.length - 1 && <br />}</span>)}</h4>;
                  if (key === 'description') return draft.description ? <p key={key} style={{ margin: '14px 0 0', fontSize: 14.5, lineHeight: 1.65, opacity: 0.72 }}>{draft.description}</p> : null;
                  if (key === 'cta') return draft.ctaLabel ? <span key={key} style={{ display: 'inline-block', marginTop: 24, borderRadius: 999, background: '#111217', color: '#fff', padding: '12px 24px', fontSize: 15, fontWeight: 700 }}>{draft.ctaLabel}</span> : null;
                  if (key === 'proof') return draft.proofLine ? <p key={key} style={{ margin: '14px 0 0', fontSize: 12.5, fontWeight: 700, opacity: 0.7 }}>{draft.proofLine}</p> : null;
                  return null;
                })}
                {draft.phoneEnabled && (
                  <div style={{ marginTop: 28, width: 'calc(100% - 40px)', marginInline: 'auto', borderRadius: 30, background: '#111217', padding: 10 }}>
                    <div style={{ borderRadius: 24, overflow: 'hidden', background: '#fff', aspectRatio: '9 / 17.2' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px 4px', fontSize: 10, fontWeight: 800 }}>
                        <span>9:41</span><span>{draft.phone.statusLabel}</span>
                      </div>
                      <div style={{ position: 'relative', height: '46%', margin: '8px 12px', borderRadius: 16, overflow: 'hidden', background: '#23242c' }}>
                        {phoneImage && <img src={phoneImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </div>
                      <div style={{ padding: '8px 14px 14px' }}>
                        <strong style={{ display: 'block', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: draft.accentColor }}>{draft.phone.resultLabel}</strong>
                        <span style={{ display: 'block', marginTop: 3, fontSize: 13, fontWeight: 800 }}>{draft.phone.productName}</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                          {[draft.phone.priceChip, draft.phone.metaChip, draft.phone.stockChip].filter(Boolean).map((chip, index) => (
                            <span key={index} style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '4px 9px', background: index === 0 ? draft.accentColor : '#f3f4f6', color: index === 0 ? '#fff' : '#374151' }}>{chip}</span>
                          ))}
                        </div>
                        <span style={{ display: 'block', textAlign: 'center', marginTop: 10, borderRadius: 999, background: '#111318', color: '#fff', fontSize: 11.5, fontWeight: 800, padding: '9px 12px' }}>{draft.phone.ctaLabel}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  );
};
