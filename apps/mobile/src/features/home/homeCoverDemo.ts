/**
 * Mode démo de la « cover » d'accueil — même contrat que `heroDemo`.
 *
 * Activé UNIQUEMENT dans l'APK de démonstration (`EXPO_PUBLIC_HERO_DEMO=1`,
 * le même fanion de build que le Hero). Tant que le CRM n'a publié aucun média
 * (ou que le serveur déployé ne sert pas encore `/home-cover`), les visuels
 * embarqués (`assets/cover/`) prennent le relais : le bloc d'entrée reste
 * visible dans la démo au lieu de laisser un trou. Une cover réellement
 * publiée dans le CRM gagne TOUJOURS sur la démo.
 *
 * Les visuels sont sans texte : le grand titre et le bouton sont posés par
 * l'application, comme pour une cover du CRM.
 */
import type { HomeCover } from '@/api/public';

export function demoHomeCover(): HomeCover {
  return {
    enabled: true,
    title: 'NOUVEAUTÉS\nVOTRE DOSE HEBDOMADAIRE',
    ctaLabel: 'Je découvre',
    destination: 'publications',
    autoplayIntervalMs: 5000,
    slides: [
      {
        id: 'demo-cover-nouveautes',
        type: 'image',
        url: '',
        poster: '',
        alt: 'Nouveautés de la semaine',
        localImage: require('../../../assets/cover/cover-nouveautes.jpg'),
      },
      {
        id: 'demo-cover-beaute',
        type: 'image',
        url: '',
        poster: '',
        alt: 'Beauté et accessoires',
        localImage: require('../../../assets/cover/cover-beaute.jpg'),
      },
    ],
  };
}
