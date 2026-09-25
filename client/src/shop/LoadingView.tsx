import React from 'react';
import { EditorialIcon } from '../design/editorial/Icon';
import './shop.css';

/**
 * ÉCRAN DE CHARGEMENT (boutique v2).
 * Il dit ce qui se passe RÉELLEMENT — « on vérifie » n'est pas « ça a échoué ».
 * Le message est fourni par l'appelant : aucun texte générique par défaut.
 */
export const LoadingView: React.FC<{
  title: string;
  message?: string;
  direction?: 'ltr' | 'rtl';
}> = ({ title, message, direction = 'ltr' }) => (
  <div className="s-root" dir={direction} data-ay-design="editorial">
    <header className="s-appbar">
      <span style={{ width: 44 }} />
      <div className="s-appbar__title"><span>{title}</span></div>
      <span style={{ width: 44 }} />
    </header>
    <div className="s-loading" role="status" aria-live="polite">
      <span className="s-loading__spin"><EditorialIcon name="Loader" size={40} /></span>
      {message ? <p>{message}</p> : null}
    </div>
  </div>
);
