/**
 * Bloc « Annonce promotionnelle » — piloté depuis Admin → Sections → « Annonce promotionnelle ».
 *
 * Rendu juste après le bloc Stories/Reels. Fond, texte, média (image ou vidéo), titre, sous-titre
 * et un bouton vers une destination INTERNE uniquement (liste fermée `ANNOUNCEMENT_TARGETS`).
 * Le bloc garde toujours une marge de respiration autour du contenu.
 */
import React from 'react';
import { ANNOUNCEMENT_TARGETS, type InterfaceSectionConfig } from '../config/interfaceConfig';

export const AnnouncementSection: React.FC<{
  section: InterfaceSectionConfig;
  onCta: (target: string) => void;
}> = ({ section, onCta }) => {
  if (!section.visible) return null;

  const video = section.mediaType === 'video' && section.videoUrl ? section.videoUrl : '';
  const image = !video && section.image ? section.image : '';
  const hasMedia = Boolean(video || image);
  const canNavigate = Boolean(section.ctaLabel && ANNOUNCEMENT_TARGETS.some((target) => target.value === section.ctaTarget));

  return (
    <div data-public-section="announcement">
      <section
        aria-label={section.title || 'Annonce'}
        style={{
          position: 'relative',
          isolation: 'isolate',
          overflow: 'hidden',
          width: '100%',
          // Pleine largeur de l’écran, bande basse : pas de bord arrondi ni de marge latérale.
          borderRadius: 0,
          background: section.backgroundColor,
          color: section.textColor,
          paddingBlock: 'clamp(20px, 4vw, 32px)',
          paddingInline: 'clamp(16px, 5vw, 48px)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {video && (
          <video
            src={video}
            poster={image || undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -2 }}
          />
        )}
        {!video && image && (
          <img src={image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -2 }} />
        )}
        {hasMedia && (
          <span aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: -1, background: 'linear-gradient(90deg, rgba(0,0,0,0.45), rgba(0,0,0,0.05))' }} />
        )}

        <div style={{ position: 'relative', maxWidth: 560 }}>
          {section.title && (
            <h2 style={{ margin: 0, fontSize: 'clamp(1.6rem, 4vw, 2.6rem)', fontWeight: 800, lineHeight: 1.15 }}>{section.title}</h2>
          )}
          {section.subtitle && (
            <p style={{ margin: '12px 0 0', fontSize: '1rem', lineHeight: 1.6, opacity: 0.92 }}>{section.subtitle}</p>
          )}
          {canNavigate && (
            <button
              type="button"
              onClick={() => onCta(section.ctaTarget)}
              style={{
                marginTop: 24,
                minHeight: 44,
                paddingInline: 22,
                borderRadius: 999,
                border: `2px solid ${section.textColor}`,
                background: 'transparent',
                color: section.textColor,
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              {section.ctaLabel} <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
