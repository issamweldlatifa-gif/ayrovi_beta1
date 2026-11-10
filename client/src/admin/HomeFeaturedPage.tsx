import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Switch, Toast } from './components';
import { adminApi } from './api';
import { uploadMediaFile } from './mediaUpload';
import { RefreshCw, Trash2 } from '../components/QatafoIcons';
import { COVER_DESTINATIONS, MAX_COVER_SLIDES, type CoverSlide } from '../../../shared/homeCover';

/**
 * « COVER » D'ACCUEIL — le NOUVEAU bloc d'entrée de l'application mobile
 * (remplace l'ancienne section « à la une »).
 *
 * Plein écran sous les onglets : médias (images, vidéos, ou une suite des deux),
 * GRAND texte posé SUR le média, bouton contour TRANSPARENT par-dessus
 * (référence « Nouveautés — votre dose hebdomadaire · Je découvre »).
 *
 * Tout est piloté ici : visibilité, médias téléversés et ordonnés, titre
 * (les sauts de ligne sont respectés à l'écran), libellé du bouton, destination
 * (pages de l'APPLICATION uniquement) et cadence du carrousel.
 */

interface CoverAdmin {
  enabled: boolean;
  title: string;
  ctaLabel: string;
  destination: string;
  autoplayIntervalMs: number;
  slides: CoverSlide[];
  preview: { title: string; ctaLabel: string; destination: string; slides: CoverSlide[] } | null;
}

const CTA_DEFAULT = 'Je découvre';

const DESTINATION_LABELS: Record<string, string> = {
  publications: 'Page Publications',
  catalog: 'Catalogue',
  promotions: 'Promotions',
};

const mediaLabel = (url: string) => url.split('/').pop() || url;

export const HomeFeaturedPage: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [title, setTitle] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [destination, setDestination] = useState('publications');
  const [autoplayIntervalMs, setAutoplayIntervalMs] = useState(5000);
  const [slides, setSlides] = useState<CoverSlide[]>([]);
  const [uploading, setUploading] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const apply = (data: CoverAdmin) => {
    setEnabled(data.enabled);
    setTitle(data.title);
    setCtaLabel(data.ctaLabel);
    setDestination(data.destination);
    setAutoplayIntervalMs(data.autoplayIntervalMs);
    setSlides(data.slides || []);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi<{ data: CoverAdmin }>('/home-cover');
      if (result.data) apply(result.data);
    } catch (reason: any) {
      setToast({ message: reason?.message || 'Lecture impossible.', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (override?: Partial<CoverAdmin>) => {
    setBusy(true);
    try {
      const result = await adminApi<{ data: CoverAdmin }>('/home-cover', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: override?.enabled ?? enabled,
          title,
          ctaLabel: ctaLabel.trim(),
          destination,
          autoplayIntervalMs,
          slides: override?.slides ?? slides,
        }),
      });
      if (result.data) apply(result.data);
      setToast({ message: 'Cover enregistrée.', tone: 'success' });
    } catch (reason: any) {
      setToast({ message: reason?.message || 'Enregistrement impossible.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  /** Téléversement réel (même voie que Stories/Reels), puis insertion en fin de liste. */
  const addMedia = async (files: FileList | null, type: 'image' | 'video') => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadMediaFile(file);
      const slide: CoverSlide = {
        id: `cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        url,
        poster: '',
        alt: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 120),
      };
      setSlides((current) => (current.length >= MAX_COVER_SLIDES ? current : [...current, slide]));
      setToast({ message: 'Média ajouté : pensez à enregistrer.', tone: 'success' });
    } catch (reason: any) {
      setToast({ message: reason?.message || 'Téléversement impossible.', tone: 'error' });
    } finally {
      setUploading(false);
      if (imageInput.current) imageInput.current.value = '';
      if (videoInput.current) videoInput.current.value = '';
    }
  };

  const addPoster = async (index: number, files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadMediaFile(file);
      setSlides((current) => current.map((row, i) => (i === index ? { ...row, poster: url } : row)));
      setToast({ message: 'Image d’attente ajoutée : pensez à enregistrer.', tone: 'success' });
    } catch (reason: any) {
      setToast({ message: reason?.message || 'Téléversement impossible.', tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const move = (index: number, delta: number) => {
    setSlides((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const preview = enabled && slides.length ? (
    <div className="admin-block-small" style={{ marginTop: 6 }}>
      <div className="admin-cover-preview">
        <strong className="admin-cover-preview-title">{title || '(sans titre)'}</strong>
        <span className="admin-cover-preview-pill">{ctaLabel.trim() || CTA_DEFAULT}</span>
        <span className="admin-cover-preview-meta">
          {slides.length} média{slides.length > 1 ? 's' : ''} · cadence {Math.round(autoplayIntervalMs / 1000)} s
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        Bouton « {ctaLabel.trim() || CTA_DEFAULT} » → {DESTINATION_LABELS[destination] || destination}
      </div>
    </div>
  ) : (
    <p className="admin-block-small" style={{ marginTop: 6 }}>
      {enabled ? 'Rien à afficher : ajoutez au moins un média.' : 'Cover masquée : rien n’est affiché sur l’accueil.'}
    </p>
  );

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Contenu → Cover d’accueil</span>
          <h2>Cover d’accueil — le nouveau bloc d’entrée</h2>
          <p>
            Plein écran sous les onglets : images ou vidéos, grand texte posé sur le média et
            bouton contour transparent. Le bouton ouvre une page de l’application.
          </p>
        </div>
        <div className="admin-actions">
          <Button variant="secondary" onClick={() => void load()} disabled={busy || uploading}>
            <RefreshCw size={16} />Recharger
          </Button>
          <Button onClick={() => void save()} busy={busy} disabled={!canWrite || loading || uploading}>
            Enregistrer
          </Button>
        </div>
      </header>

      <section className="admin-card">
        {loading ? <p className="admin-block-small">Chargement…</p> : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong>Afficher la cover</strong>
                <p className="admin-block-small" style={{ margin: '2px 0 0' }}>Désactivée, elle disparaît de l’accueil sans rien supprimer.</p>
              </div>
              <Switch disabled={!canWrite} checked={enabled} onLabel="Visible" offLabel="Masquée" onChange={() => setEnabled((value) => !value)} />
            </div>

            <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 10 }}>
              <legend><strong>Médias ({slides.length}/{MAX_COVER_SLIDES}) — images ou vidéos</strong></legend>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" busy={uploading} disabled={!canWrite || slides.length >= MAX_COVER_SLIDES} onClick={() => imageInput.current?.click()}>
                  + Image
                </Button>
                <Button variant="secondary" busy={uploading} disabled={!canWrite || slides.length >= MAX_COVER_SLIDES} onClick={() => videoInput.current?.click()}>
                  + Vidéo
                </Button>
                <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => void addMedia(event.target.files, 'image')} />
                <input ref={videoInput} type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" hidden onChange={(event) => void addMedia(event.target.files, 'video')} />
              </div>
              {slides.length ? (
                <ol style={{ display: 'grid', gap: 8, margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                  {slides.map((slide, index) => (
                    <li key={slide.id} style={{ border: '1px solid var(--admin-line)', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="admin-eyebrow">{slide.type === 'video' ? 'VIDÉO' : 'IMAGE'}</span>
                        <span style={{ fontSize: 12, flex: 1, minWidth: 160, overflowWrap: 'anywhere' }}>{mediaLabel(slide.url)}</span>
                        <Button variant="secondary" disabled={!canWrite || index === 0} onClick={() => move(index, -1)}>↑</Button>
                        <Button variant="secondary" disabled={!canWrite || index === slides.length - 1} onClick={() => move(index, 1)}>↓</Button>
                        <Button variant="secondary" disabled={!canWrite} onClick={() => setSlides((current) => current.filter((_, i) => i !== index))}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                      <label style={{ display: 'grid', gap: 4, maxWidth: 420 }}>
                        <span className="admin-block-small">Texte alternatif (accessibilité)</span>
                        <input
                          type="text"
                          value={slide.alt}
                          maxLength={120}
                          disabled={!canWrite}
                          onChange={(event) => setSlides((current) => current.map((row, i) => (i === index ? { ...row, alt: event.target.value.slice(0, 120) } : row)))}
                        />
                      </label>
                      {slide.type === 'video' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="admin-block-small">Image d’attente : {slide.poster ? mediaLabel(slide.poster) : 'aucune (première image de la vidéo)'}</span>
                          <Button variant="secondary" busy={uploading} disabled={!canWrite} onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/png,image/jpeg,image/webp';
                            input.onchange = () => void addPoster(index, input.files);
                            input.click();
                          }}>Changer</Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="admin-block-small" style={{ margin: 0 }}>Aucun média : la cover reste invisible sur l’accueil.</p>
              )}
            </fieldset>

            <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 10 }}>
              <legend><strong>Texte et bouton posés sur le média</strong></legend>
              <label style={{ display: 'grid', gap: 4, maxWidth: 420 }}>
                <strong>Grand titre (les sauts de ligne sont respectés)</strong>
                <textarea
                  value={title}
                  rows={3}
                  maxLength={120}
                  placeholder={'NOUVEAUTÉS\nVOTRE DOSE HEBDOMADAIRE'}
                  disabled={!canWrite}
                  onChange={(event) => setTitle(event.target.value.slice(0, 120))}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, maxWidth: 360 }}>
                <strong>Libellé du bouton</strong>
                <input
                  type="text"
                  value={ctaLabel}
                  maxLength={40}
                  placeholder={CTA_DEFAULT}
                  disabled={!canWrite}
                  onChange={(event) => setCtaLabel(event.target.value)}
                />
                <span className="admin-block-small">Vide = « {CTA_DEFAULT} ». Bouton contour transparent sur le média.</span>
              </label>
              <label style={{ display: 'grid', gap: 4, maxWidth: 360 }}>
                <strong>Destination du bouton</strong>
                <select value={destination} disabled={!canWrite} onChange={(event) => setDestination(event.target.value)}>
                  {COVER_DESTINATIONS.map((value) => (
                    <option key={value} value={value}>{DESTINATION_LABELS[value] || value}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, maxWidth: 240 }}>
                <strong>Cadence du carrousel</strong>
                <input
                  type="number"
                  min={2}
                  max={30}
                  step={1}
                  value={Math.round(autoplayIntervalMs / 1000)}
                  disabled={!canWrite || slides.length < 2}
                  onChange={(event) => setAutoplayIntervalMs(Math.min(30, Math.max(2, Number(event.target.value) || 5)) * 1000)}
                />
                <span className="admin-block-small">Secondes entre deux médias (2 à 30). Un bouton pause est affiché dans l’application.</span>
              </label>
            </fieldset>

            <div>
              <strong>Aperçu sur l’application</strong>
              {preview}
            </div>
          </div>
        )}
      </section>

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  );
};
