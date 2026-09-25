import React, { useState } from 'react';
import { EditorialIcon } from '../design/editorial/Icon';
import './shop.css';

/**
 * ADRESSE DE LIVRAISON (boutique v2).
 *
 * Trois modes, parce que la Tunisie en a trois : chez soi, au bureau AYROVI, ou
 * en point relais. Les champs CHANGENT avec le mode — un point relais n'a pas
 * besoin du numéro de rue du client, et prétendre le contraire fait abandonner.
 * Les modes proposés sont ceux que l'hôte déclare réellement servir : ce
 * composant n'en invente aucun.
 */
export type DeliveryMode = 'home' | 'desk' | 'pickup';

export interface AddressValue {
  mode: DeliveryMode;
  firstName: string;
  lastName: string;
  phone: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  /** Identifiant du bureau ou du point relais choisi, selon le mode. */
  pointId: string | null;
}

export interface AddressPageProps {
  value: AddressValue;
  /** Modes réellement servis, fournis par l'hôte — jamais supposés. */
  modes: DeliveryMode[];
  /** Points disponibles pour le mode courant (bureaux AYROVI ou relais). */
  points?: { id: string; name: string; detail: string }[];
  governorate: string;
  tr: (fr: string, ar: string) => string;
  direction?: 'ltr' | 'rtl';
  onBack?: () => void;
  onChange: (value: AddressValue) => void;
  onSubmit: (value: AddressValue) => void;
}

const MODE_ICON = { home: 'Home', desk: 'Cube', pickup: 'Pin' } as const;

export const AddressPage: React.FC<AddressPageProps> = ({
  value, modes, points = [], governorate, tr, direction = 'ltr', onBack, onChange, onSubmit,
}) => {
  const [touched, setTouched] = useState(false);
  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });

  /* Validation MINIMALE et explicite : on n'exige que ce dont le mode a besoin. */
  const needsStreet = value.mode === 'home';
  const needsPoint = value.mode !== 'home';
  const missing: string[] = [];
  if (!value.firstName.trim()) missing.push(tr('Prénom', 'الاسم'));
  if (!value.lastName.trim()) missing.push(tr('Nom', 'اللقب'));
  if (!/^\+?[0-9 ]{8,}$/.test(value.phone.trim())) missing.push(tr('Téléphone', 'الهاتف'));
  if (needsStreet && !value.line1.trim()) missing.push(tr('Adresse', 'العنوان'));
  if (needsStreet && !/^[0-9]{4}$/.test(value.postalCode.trim())) missing.push(tr('Code postal', 'الترقيم البريدي'));
  if (needsStreet && !value.city.trim()) missing.push(tr('Ville', 'المدينة'));
  if (needsPoint && !value.pointId) missing.push(tr('Point de retrait', 'نقطة الاستلام'));

  const label = (mode: DeliveryMode) => mode === 'home'
    ? tr('Mon adresse', 'عنواني')
    : mode === 'desk' ? tr('Bureau AYROVI', 'مكتب AYROVI') : tr('Point relais', 'نقطة استلام');

  return (
    <div className="s-root s-page" dir={direction} data-ay-design="editorial">
      <header className="s-appbar">
        <button type="button" className="s-iconbtn" onClick={onBack} aria-label={tr('Retour', 'رجوع')}>
          <EditorialIcon name="Back" direction={direction} />
        </button>
        <div className="s-appbar__title"><span>{tr('Adresse de livraison', 'عنوان التوصيل')}</span></div>
        <span style={{ width: 44 }} />
      </header>

      <div style={{ flex: 1, padding: '0 16px 120px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${modes.length}, 1fr)`, gap: 8, padding: '16px 0' }} role="radiogroup" aria-label={tr('Mode de livraison', 'طريقة التوصيل')}>
          {modes.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={value.mode === mode}
              onClick={() => set({ mode, pointId: mode === 'home' ? null : value.pointId })}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                minHeight: 44, padding: '14px 6px', fontSize: '0.78125rem', fontWeight: 700,
                border: `1px solid ${value.mode === mode ? 'var(--s-ink)' : 'var(--s-line)'}`,
                background: value.mode === mode ? 'var(--s-surface)' : 'var(--s-canvas)',
              }}
            >
              <EditorialIcon name={MODE_ICON[mode]} size={26} />
              <span>{label(mode)}</span>
            </button>
          ))}
        </div>

        <Field label={tr('Prénom', 'الاسم')} value={value.firstName} onChange={(v) => set({ firstName: v })} autoComplete="given-name" />
        <Field label={tr('Nom', 'اللقب')} value={value.lastName} onChange={(v) => set({ lastName: v })} autoComplete="family-name" />
        <Field
          label={tr('Téléphone', 'الهاتف')}
          value={value.phone}
          onChange={(v) => set({ phone: v })}
          inputMode="tel"
          help={tr('Le livreur appelle avant de passer.', 'الموزّع يعيّط قبل ما يوصل.')}
        />

        {needsStreet && (
          <>
            <Field label={tr('Adresse', 'العنوان')} value={value.line1} onChange={(v) => set({ line1: v })} />
            <Field label={tr('Complément (facultatif)', 'تفاصيل إضافية (اختياري)')} value={value.line2} onChange={(v) => set({ line2: v })} maxLength={50} />
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <Field label={tr('Code postal', 'الترقيم البريدي')} value={value.postalCode} onChange={(v) => set({ postalCode: v })} inputMode="numeric" maxLength={4} />
              </div>
              <div style={{ flex: 2 }}>
                <Field label={tr('Ville', 'المدينة')} value={value.city} onChange={(v) => set({ city: v })} />
              </div>
            </div>
          </>
        )}

        {needsPoint && (
          <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
            <legend style={{ fontSize: '0.84375rem', marginBottom: 6 }}>
              {value.mode === 'desk' ? tr('Choisir un bureau', 'اختار مكتب') : tr('Choisir un point relais', 'اختار نقطة استلام')}
            </legend>
            {points.length === 0
              ? <p className="s-card__desc">{tr('Aucun point disponible pour le moment.', 'ما فماش نقطة متاحة توّا.')}</p>
              : points.map((point) => (
                  <button
                    key={point.id}
                    type="button"
                    className="s-size"
                    aria-pressed={value.pointId === point.id}
                    onClick={() => set({ pointId: point.id })}
                  >
                    <span><b>{point.name}</b><small>{point.detail}</small></span>
                    {value.pointId === point.id && <EditorialIcon name="Check" size={18} />}
                  </button>
                ))}
          </fieldset>
        )}

        <p className="s-card__desc" style={{ whiteSpace: 'normal' }}>{tr('Gouvernorat', 'الولاية')} : <b>{governorate}</b></p>
      </div>

      <div className="s-buybar">
        {touched && missing.length > 0 && (
          <p className="s-refusal">{tr('À compléter : ', 'يلزم تكمّل: ')}{missing.join(' · ')}</p>
        )}
        <button
          type="button"
          className="s-cta"
          onClick={() => { setTouched(true); if (!missing.length) onSubmit(value); }}
        >
          {tr('Enregistrer l’adresse', 'سجّل العنوان')}
        </button>
      </div>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  autoComplete?: string;
  inputMode?: 'tel' | 'numeric';
  maxLength?: number;
}> = ({ label, value, onChange, help, autoComplete, inputMode, maxLength }) => (
  <label style={{ display: 'block', marginBottom: 14 }}>
    <span style={{ display: 'block', fontSize: '0.84375rem', marginBottom: 6 }}>{label}</span>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoComplete={autoComplete}
      inputMode={inputMode}
      maxLength={maxLength}
      style={{
        width: '100%', minHeight: 48, padding: '0 14px', font: 'inherit', fontSize: '0.9375rem',
        border: '1px solid var(--s-ink)', borderRadius: 0, background: 'var(--s-canvas)',
      }}
    />
    {help && <span className="s-card__desc" style={{ display: 'block', marginTop: 6, whiteSpace: 'normal' }}>{help}</span>}
  </label>
);
