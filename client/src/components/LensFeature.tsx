import { ArrowRight } from './QatafoIcons';
import { safePublicHref } from '../utils/publicLinks';
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

  const href = safePublicHref(data.ctaUrl);
  const Action = href ? 'a' : 'button';

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

        {data.ctaLabel && (!data.ctaUrl || href) ? (
          <Action type={href ? undefined : "button"} href={href || undefined} target={href && /^https?:/i.test(href) ? '_blank' : undefined} rel={href ? 'noopener noreferrer' : undefined} className="lens-feature__cta" onClick={href ? undefined : onOpenLens}>
            <span>{data.ctaLabel}</span>
            <ArrowRight size={20} />
          </Action>
        ) : null}
      </div>
    </section>
  );
};

export default LensFeature;
