import React from 'react';

/**
 * TRANSITION CARD — Editorial Transition Card تحت الـTrust Bar
 *
 * ZALANDO STRATEGY (P4/T1) : l'ancien bloc orange plein est DÉPRÉCIÉ.
 * La carte devient une surface grise très claire (`--ayrovi-bg-surface`) avec du
 * texte noir ; la seule trace d'identité est le filet vertical de 3px sur le bord
 * amont (`border-inline-start`). Aucune image, aucun CTA : fonction de transition
 * visuelle uniquement — donc aucun bouton orange sur cette carte.
 */

const TITLE = 'Découvrez AYROVI';
const DESCRIPTION = 'Des outils intelligents pour trouver, comprendre et commander plus simplement.';

export const TransitionCard: React.FC = () => (
  <section
    aria-label={TITLE}
    className="ay-surface-card transition-card-fade relative mx-6 overflow-hidden rounded-[22px] px-7 py-8 lg:mx-auto lg:max-w-7xl lg:rounded-[24px] lg:px-8 lg:py-9"
    style={{ marginBottom: 0 }}
  >
    <div className="relative z-10">
      <h2 className="ay-edit-26 ay-surface-card__title">{TITLE}</h2>
      <p className="ay-surface-card__text mt-3 max-w-2xl text-[15px] font-medium leading-[1.5] sm:text-base lg:text-[17px]">{DESCRIPTION}</p>
    </div>
  </section>
);
