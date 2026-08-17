import React from 'react';
import { Check } from './QatafoIcons';
import { useLocale } from '../i18n/LocaleContext';

interface JourneyProgressProps {
  active: 1 | 2 | 3 | 4;
}

export const JourneyProgress: React.FC<JourneyProgressProps> = ({ active }) => {
  const { tr, direction } = useLocale();
  const steps = [
    tr('Panier', 'السلة'),
    tr('Livraison', 'التوصيل'),
    tr('Paiement', 'الدفع'),
    tr('Confirmé', 'التأكيد'),
  ];
  return (
    <ol className="ay-journey-progress" dir={direction} aria-label={tr('Progression de la commande', 'مراحل إتمام الطلب')}>
      {steps.map((label, index) => {
        const number = index + 1;
        const complete = number < active;
        const current = number === active;
        return <li key={label} className={current ? 'is-current' : complete ? 'is-complete' : ''} aria-current={current ? 'step' : undefined}>
          <span>{complete ? <Check size={14} /> : number}</span><small>{label}</small>
        </li>;
      })}
    </ol>
  );
};
