import React, { useEffect, useMemo, useState } from 'react';

/**
 * AYROVIX LENS — BLOC ÉDITORIAL (référence : Zalando.fr)
 * -----------------------------------------------------
 * Composition, de haut en bas : surtitre (eyebrow) → TITRE TRÈS GRAND →
 * paragraphe d'accompagnement → MÉDIA PLEINE LARGEUR → lien texte « Ouvrir LENS → ».
 * La référence Zalando place toujours un titre court et dense (2–3 lignes) au-dessus
 * d'un visuel large ; c'est ce rythme qui est repris ici, avec une respiration
 * verticale généreuse entre les sections (voir `--lens-feature-gap` dans index.css).
 *
 * Dashboard = Control · CMS = Source of Truth · Frontend = Presentation :
 * le surtitre, le titre, la description, le libellé du lien et son URL, la vidéo
 * (fichier déposé OU lien YouTube/Vimeo) et son affiche viennent tous de
 * /api/public/lens-hero (Admin → Contenu → LENS). Aucun texte n'est figé ici.
 *
 * Charte Zalando : section monochrome (blanc/gris), texte encre. La seule touche
 * orangée est la flèche du lien d'action — elle reste très en dessous du budget de 3 %.
 */

interface LensMedia {
  type: 'VIDEO' | 'IMAGE';
  videoUrl: string;
  videoPath: string;
  poster: string;
  ratio: string;
  autoplay: boolean;
  muted: boolean;
  loop: boolean;
}

interface LensPayload {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaUrl: string;
  enabled: boolean;
  media?: Partial<LensMedia>;
}

const FALLBACK_MEDIA: LensMedia = {
  type: 'VIDEO', videoUrl: '', videoPath: '', poster: '',
  ratio: '16/9', autoplay: true, muted: true, loop: true,
};

/** Reconnaît un lecteur embarqué (YouTube / Vimeo) d'un fichier vidéo direct. */
function embedKind(url: string): 'youtube' | 'vimeo' | 'file' | null {
  if (!url) return null;
  if (/youtube(-nocookie)?\.com\/(embed|shorts)\//.test(url)) return 'youtube';
  if (/player\.vimeo\.com\/video\//.test(url)) return 'vimeo';
  return 'file';
}

export const LensFeature: React.FC<{ onOpenLens: () => void }> = ({ onOpenLens }) => {
  const [data, setData] = useState<LensPayload | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/public/lens-hero')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => { if (alive && json?.success) setData(json.data as LensPayload); })
      .catch(() => { /* la section reste simplement masquée */ });
    return () => { alive = false; };
  }, []);

  const media = useMemo<LensMedia>(() => ({ ...FALLBACK_MEDIA, ...(data?.media || {}) }), [data]);

  const source = media.videoPath || media.videoUrl;
  const kind = media.type === 'VIDEO' ? embedKind(source) : null;
  const hasMedia = media.type === 'IMAGE' ? Boolean(media.poster) : Boolean(source);

  // Rien à afficher : section désactivée, ou ni vidéo ni image configurée.
  if (!data || data.enabled === false) return null;

  const ratio = String(media.ratio || '16/9').replace('/', ' / ');

  /** Le lien d'action : URL externe si elle est renseignée, sinon ouverture de LENS. */
  const activate = () => {
    if (data.ctaUrl) {
      if (data.ctaUrl.startsWith('/')) return; // laissé à la navigation du routeur
      window.open(data.ctaUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    onOpenLens();
  };

  return (
    <section className="lens-feature" aria-labelledby="lens-feature-title">
      <div className="lens-feature__inner">
        {data.eyebrow ? <p className="lens-feature__eyebrow">{data.eyebrow}</p> : null}

        <h2 className="lens-feature__title" id="lens-feature-title">{data.title}</h2>

        {data.description ? <p className="lens-feature__desc">{data.description}</p> : null}

        {hasMedia ? (
          <div className="lens-feature__media" style={{ ['--lens-feature-ratio' as string]: ratio }}>
            {media.type === 'IMAGE' || kind === null ? (
              <img
                src={media.type === 'IMAGE' ? media.poster : media.poster || ''}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : kind === 'file' ? (
              <video
                src={source}
                poster={media.poster || undefined}
                autoPlay={media.autoplay}
                muted={media.muted}
                loop={media.loop}
                playsInline
                preload="metadata"
                controls={!media.autoplay}
              />
            ) : (
              <iframe
                src={source}
                title={data.title}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            )}
          </div>
        ) : null}

        {data.ctaLabel ? (
          <button type="button" className="lens-feature__cta" onClick={activate}>
            <span>{data.ctaLabel}</span>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>
    </section>
  );
};

export default LensFeature;
