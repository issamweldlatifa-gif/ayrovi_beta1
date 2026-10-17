import React, { useCallback, useEffect, useState } from 'react';
import { Button, Switch, Toast } from './components';
import { adminApi } from './api';
import { RefreshCw } from '../components/QatafoIcons';

/**
 * SECTION « À LA UNE » — accueil de l'application mobile.
 *
 * Elle se place sous les onglets (Nouveautés · Promotions · Magazine) et montre UNE
 * publication du magazine avec un bouton qui ouvre la page Publications de l'application.
 *
 * Réglages : affichée ou non · source (la plus récente publiée, ou une publication choisie)
 * · libellé du bouton. L'aperçu reprend EXACTEMENT la règle que suit l'application :
 * une publication non publiée ou à date future n'apparaît jamais.
 */

type Source = 'latest' | 'pinned';

interface PublicationOption {
  id: string;
  title: string;
  status: string;
  publishAt: string;
}

interface FeaturedAdmin {
  enabled: boolean;
  source: Source;
  publicationId: string;
  ctaLabel: string;
  publications: PublicationOption[];
  preview: { id: string; title: string; subtitle: string; imageUrl: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  publie: 'publiée',
  brouillon: 'brouillon',
  archive: 'archivée',
};

const CTA_DEFAULT = 'Découvrir';

export const HomeFeaturedPage: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  // État du formulaire (copie modifiable de la réponse serveur).
  const [enabled, setEnabled] = useState(true);
  const [source, setSource] = useState<Source>('latest');
  const [publicationId, setPublicationId] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');

  const [publications, setPublications] = useState<PublicationOption[]>([]);
  const [preview, setPreview] = useState<FeaturedAdmin['preview']>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const apply = (data: FeaturedAdmin) => {
    setEnabled(data.enabled);
    setSource(data.source);
    setPublicationId(data.publicationId);
    setCtaLabel(data.ctaLabel);
    setPublications(data.publications || []);
    setPreview(data.preview ?? null);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi<{ data: FeaturedAdmin }>('/home-featured');
      if (result.data) apply(result.data);
    } catch (reason: any) {
      setToast({ message: reason?.message || 'Lecture impossible.', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const result = await adminApi<{ data: FeaturedAdmin }>('/home-featured', {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          source,
          publicationId: source === 'pinned' ? publicationId : '',
          ctaLabel: ctaLabel.trim(),
        }),
      });
      if (result.data) apply(result.data);
      setToast({ message: 'Section « à la une » enregistrée.', tone: 'success' });
    } catch (reason: any) {
      setToast({ message: reason?.message || 'Enregistrement impossible.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const pinnedMissing = source === 'pinned' && !publicationId;

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <span className="admin-eyebrow">Contenu → Section à la une</span>
          <h2>Section « à la une » de l’accueil</h2>
          <p>
            Affichée sous les onglets de l’application. Elle montre une publication du magazine
            et ouvre la page Publications quand on appuie sur le bouton.
          </p>
        </div>
        <div className="admin-actions">
          <Button variant="secondary" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={16} />Recharger
          </Button>
          <Button onClick={() => void save()} busy={busy} disabled={!canWrite || loading || pinnedMissing}>
            Enregistrer
          </Button>
        </div>
      </header>

      <section className="admin-card">
        {loading ? <p className="admin-block-small">Chargement…</p> : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <strong>Afficher la section</strong>
                <p className="admin-block-small" style={{ margin: '2px 0 0' }}>Désactivée, elle disparaît de l’accueil sans rien supprimer.</p>
              </div>
              <Switch disabled={!canWrite} checked={enabled} onLabel="Visible" offLabel="Masquée" onChange={() => setEnabled((value) => !value)} />
            </div>

            <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              <legend><strong>Publication affichée</strong></legend>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="radio" name="featured-source" checked={source === 'latest'} onChange={() => setSource('latest')} />
                La plus récente publiée
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="radio" name="featured-source" checked={source === 'pinned'} onChange={() => setSource('pinned')} />
                Une publication choisie
              </label>
              {source === 'pinned' ? (
                <select
                  aria-label="Publication à afficher"
                  value={publicationId}
                  onChange={(event) => setPublicationId(event.target.value)}
                  style={{ maxWidth: 480 }}
                >
                  <option value="">— Choisir une publication —</option>
                  {publications.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.title || '(sans titre)'} — {STATUS_LABELS[row.status] || row.status}
                    </option>
                  ))}
                </select>
              ) : null}
              {pinnedMissing ? (
                <p className="admin-block-small" role="alert">Choisissez une publication, ou revenez à « La plus récente publiée ».</p>
              ) : null}
            </fieldset>

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
              <span className="admin-block-small">Vide = « {CTA_DEFAULT} ». Maximum 40 caractères.</span>
            </label>

            <div>
              <strong>Aperçu sur l’application</strong>
              {preview ? (
                <div className="admin-block-small" style={{ marginTop: 6 }}>
                  <div><strong>{preview.title}</strong></div>
                  {preview.subtitle ? <div>{preview.subtitle}</div> : null}
                  <div style={{ marginTop: 6 }}>Bouton : « {ctaLabel.trim() || CTA_DEFAULT} » → page Publications</div>
                </div>
              ) : (
                <p className="admin-block-small" style={{ marginTop: 6 }}>
                  {enabled ? 'Rien à afficher : aucune publication publiée ne correspond.' : 'Section masquée : rien n’est affiché sur l’accueil.'}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  );
};
