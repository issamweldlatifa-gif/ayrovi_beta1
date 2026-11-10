/**
 * « Cover » d'accueil — lecture de la réponse serveur (logique pure).
 *
 *  • une réponse illisible, sans média, masquée ⇒ AUCUNE section ;
 *  • les médias sans URL sont abandonnés, les textes nettoyés et bornés ;
 *  • destination inconnue et cadence hors bornes retombent sur des valeurs sûres.
 */
import { describe, expect, it } from 'vitest';
import { parseHomeCover } from '../src/api/public';

describe('parseHomeCover', () => {
  it('lit une cover complète : titre multiligne, bouton, destination, cadence', () => {
    expect(parseHomeCover({
      enabled: true,
      title: ' NOUVEAUTÉS\nVOTRE DOSE HEBDOMADAIRE ',
      ctaLabel: ' Je découvre ',
      destination: 'promotions',
      autoplayIntervalMs: 4000,
      slides: [
        { id: 's1', type: 'video', url: '/uploads/drop.mp4', poster: '/uploads/p.jpg', alt: 'Drop' },
        { id: 's2', type: 'image', url: '/uploads/look.jpg', poster: '', alt: 'Look' },
      ],
    })).toEqual({
      enabled: true,
      title: 'NOUVEAUTÉS\nVOTRE DOSE HEBDOMADAIRE',
      ctaLabel: 'Je découvre',
      destination: 'promotions',
      autoplayIntervalMs: 4000,
      slides: [
        { id: 's1', type: 'video', url: '/uploads/drop.mp4', poster: '/uploads/p.jpg', alt: 'Drop' },
        { id: 's2', type: 'image', url: '/uploads/look.jpg', poster: '', alt: 'Look' },
      ],
    });
  });

  it('médias sans URL abandonnés ; sans média restant ⇒ aucune section', () => {
    const kept = parseHomeCover({ slides: [{ type: 'image', url: ' ' }, { type: 'image', url: '/a.jpg' }] });
    expect(kept?.slides).toHaveLength(1);
    expect(kept?.slides[0]?.url).toBe('/a.jpg');
    expect(parseHomeCover({ slides: [] })).toBeNull();
  });

  it('réponse illisible ⇒ aucune section, jamais de bloc inventé', () => {
    expect(parseHomeCover(undefined)).toBeNull();
    expect(parseHomeCover('texte')).toBeNull();
    expect(parseHomeCover({})).toBeNull();
  });

  it('destination inconnue et cadence hors bornes retombent sur des valeurs sûres', () => {
    const cover = parseHomeCover({
      destination: 'instagram', autoplayIntervalMs: 12, slides: [{ type: 'image', url: '/a.jpg' }],
    });
    expect(cover?.destination).toBe('publications');
    expect(cover?.autoplayIntervalMs).toBe(2000);
    expect(parseHomeCover({ autoplayIntervalMs: 99999, slides: [{ type: 'image', url: '/a.jpg' }] })?.autoplayIntervalMs).toBe(30000);
    expect(parseHomeCover({ slides: [{ type: 'video', url: '/v.mp4' }] })?.slides[0]?.poster).toBe('');
  });

  it('masquée mais avec médias : la réponse reste exploitable (l’app la cache)', () => {
    const cover = parseHomeCover({ enabled: false, slides: [{ type: 'image', url: '/a.jpg' }] });
    expect(cover?.enabled).toBe(false);
    expect(cover?.slides).toHaveLength(1);
  });
});
