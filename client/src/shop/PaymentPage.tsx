import React from 'react';
import { EditorialIcon } from '../design/editorial/Icon';
import './shop.css';

/**
 * MOYEN DE PAIEMENT (boutique v2).
 *
 * L'écran AFFICHE le paysage tunisien complet, mais n'en rend sélectionnable
 * aucun que l'hôte n'ait déclaré encaissable. Un moyen bloqué garde sa place et
 * dit POURQUOI il l'est — « indisponible » tout court fait croire à une panne.
 * Aucune règle de disponibilité n'est écrite ici : elle vient telle quelle.
 */
export interface PaymentChoice {
  id: string;
  label: string;
  hint: string;
  /** Raison factuelle du blocage, quand `available` est faux. */
  blocked: string;
  available: boolean;
  mark: { kind: 'image'; src: string } | { kind: 'word'; text: string } | { kind: 'glyph' };
}

export interface PaymentPageProps {
  methods: PaymentChoice[];
  selected: string | null;
  totalTnd: number;
  /** Réseaux acceptés derrière la carte — des marques, pas des options. */
  networks?: { id: string; src: string; label: string }[];
  tr: (fr: string, ar: string) => string;
  formatMoney: (tnd: number) => string;
  direction?: 'ltr' | 'rtl';
  onBack?: () => void;
  onSelect: (id: string) => void;
  onConfirm?: () => void;
}

export const PaymentPage: React.FC<PaymentPageProps> = ({
  methods, selected, totalTnd, networks = [], tr, formatMoney, direction = 'ltr', onBack, onSelect, onConfirm,
}) => {
  const anyAvailable = methods.some((method) => method.available);
  return (
    <div className="s-root s-page" dir={direction} data-ay-design="editorial">
      <header className="s-appbar">
        <button type="button" className="s-iconbtn" onClick={onBack} aria-label={tr('Retour', 'رجوع')}>
          <EditorialIcon name="Back" direction={direction} />
        </button>
        <div className="s-appbar__title"><span>{tr('Moyen de paiement', 'وسيلة الخلاص')}</span></div>
        <span style={{ width: 44 }} />
      </header>

      <div style={{ flex: 1 }} role="radiogroup" aria-label={tr('Moyens de paiement', 'وسائل الدفع')}>
        {methods.map((method) => (
          <button
            key={method.id}
            type="button"
            role="radio"
            aria-checked={selected === method.id}
            aria-disabled={!method.available}
            onClick={() => method.available && onSelect(method.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 64,
              padding: '14px 16px', borderBottom: '1px solid var(--s-line)', textAlign: 'start',
              opacity: method.available ? 1 : 0.55,
            }}
          >
            <span style={{ flex: '0 0 56px', height: 34, display: 'grid', placeItems: 'center', border: '1px solid var(--s-line)' }}>
              {method.mark.kind === 'image'
                ? <img src={method.mark.src} alt="" style={{ maxHeight: 20, maxWidth: 48, objectFit: 'contain' }} />
                : method.mark.kind === 'word'
                  ? <span style={{ fontSize: '0.6875rem', fontWeight: 700 }}>{method.mark.text}</span>
                  : <EditorialIcon name="Bank" size={20} />}
            </span>

            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: '0.90625rem' }}>{method.label}</b>
              <small style={{ display: 'block', fontSize: '0.78125rem', color: 'var(--s-muted)' }}>
                {method.available ? method.hint : method.blocked}
              </small>
            </span>

            <span style={{
              width: 20, height: 20, borderRadius: 999, flex: 'none', position: 'relative',
              border: `1.5px solid ${selected === method.id ? 'var(--s-ink)' : 'var(--s-line)'}`,
            }}>
              {selected === method.id && (
                <span style={{ position: 'absolute', inset: 3, borderRadius: 999, background: 'var(--s-ink)' }} />
              )}
            </span>
          </button>
        ))}

        {networks.length > 0 && (
          <div style={{ display: 'flex', gap: 8, padding: 16 }} aria-label={tr('Réseaux acceptés', 'الشبكات المقبولة')}>
            {networks.map((network) => (
              <span key={network.id} style={{ display: 'grid', placeItems: 'center', minWidth: 46, height: 30, padding: '0 8px', border: '1px solid var(--s-line)' }}>
                <img src={network.src} alt={network.label} style={{ maxHeight: 16, maxWidth: 40, objectFit: 'contain' }} />
              </span>
            ))}
          </div>
        )}

        {!anyAvailable && (
          <p className="s-refusal" style={{ margin: 16 }}>
            {tr("Aucun moyen n'est encaissable pour l'instant : la commande peut être créée, le paiement restera en attente.",
                'ما فماش وسيلة تخلّص توّا: الطلب ينجّم يتعمل والخلاص يبقى في الانتظار.')}
          </p>
        )}
      </div>

      <div className="s-buybar">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.0625rem', marginBottom: 8 }}>
          <span>{tr('Total', 'المجموع')}</span><span>{formatMoney(totalTnd)}</span>
        </div>
        <button type="button" className="s-cta" onClick={onConfirm} disabled={!selected || !onConfirm}>
          {tr('Confirmer et payer', 'أكّد وخلّص')}
        </button>
      </div>
    </div>
  );
};
