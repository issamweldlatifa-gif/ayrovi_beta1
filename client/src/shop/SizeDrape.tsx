import React, { useEffect, useRef, useState } from 'react';
import { EditorialIcon } from '../design/editorial/Icon';
import { hasBrandScale, type SizeOption } from './types';

/**
 * DRAP DES TAILLES (boutique v2).
 *
 * Il rend les TROIS états du moteur de disponibilité sans jamais les confondre :
 *   • available   → commandable, avec la quantité restante SI la source la publie ;
 *   • unavailable → grisé, et l'utilisateur peut demander à être prévenu quand
 *                   l'hôte fournit réellement ce service (sinon : pas de bouton) ;
 *   • unknown     → visible, lisible, et NON commandable — la source n'a rien dit,
 *                   et une absence de réponse n'est pas une disponibilité.
 *
 * L'échelle « marque » n'apparaît que si la source donne un second libellé pour
 * au moins deux tailles : aucune table de conversion n'est écrite ici.
 */
export interface SizeDrapeProps {
  open: boolean;
  sizes: SizeOption[];
  /** Intitulé de la liste : « Pointures disponibles », « Contenances… ». */
  title?: string;
  /** Faux quand la source ne publie aucune disponibilité : rien n'est grisé. */
  availabilityKnown?: boolean;
  selected: string | null;
  scaleLabel: string | null;
  /** Traducteur fourni par l'hôte : la boutique ne porte pas son propre i18n. */
  tr: (fr: string, ar: string) => string;
  onClose: () => void;
  onSelect: (size: SizeOption) => void;
  /** Alerte de retour en stock — absent = le bouton n'est pas affiché du tout. */
  onNotifyRestock?: (size: SizeOption) => void;
}

export const SizeDrape: React.FC<SizeDrapeProps> = ({
  open, sizes, title, availabilityKnown = true, selected, scaleLabel, tr, onClose, onSelect, onNotifyRestock,
}) => {
  const [scale, setScale] = useState<'source' | 'brand'>('source');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const brandAvailable = hasBrandScale(sizes);
  const activeScale = brandAvailable ? scale : 'source';

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="s-drape" role="dialog" aria-modal="true" aria-label={tr('Choisir la taille', 'اختيار المقاس')}>
      <button type="button" className="s-drape__backdrop" aria-label={tr('Fermer', 'إغلاق')} onClick={onClose} />
      <div className="s-drape__panel" ref={panelRef} tabIndex={-1}>
        <div className="s-sheet__grab" aria-hidden="true" />
        <div className="s-drape__head">
          <h2>{title ?? tr('Choisir la taille', 'اختار المقاس')}</h2>
          {brandAvailable && (
            <div className="s-scales" role="tablist" aria-label={tr('Échelle de taille', 'مقياس المقاسات')}>
              <button type="button" role="tab" aria-selected={activeScale === 'source'} onClick={() => setScale('source')}>
                {scaleLabel ? tr(`Taille ${scaleLabel}`, `مقاس ${scaleLabel}`) : tr('Taille', 'المقاس')}
              </button>
              <button type="button" role="tab" aria-selected={activeScale === 'brand'} onClick={() => setScale('brand')}>
                {tr('Taille marque', 'مقاس الماركة')}
              </button>
            </div>
          )}
        </div>

        <div className="s-sizes">
          {sizes.map((size) => {
            const primary = activeScale === 'brand' && size.brandValue ? size.brandValue : size.value;
            const secondary = activeScale === 'brand' && size.brandValue ? size.value : size.brandValue;
            return (
              <button
                key={size.value}
                type="button"
                className="s-size"
                data-state={availabilityKnown ? size.state : 'available'}
                aria-pressed={selected === size.value}
                aria-disabled={availabilityKnown && size.state !== 'available'}
                onClick={() => onSelect(size)}
              >
                <span>
                  <strong>{primary}</strong>
                  {secondary ? <small>{secondary}</small> : null}
                </span>

                {size.state === 'available' && size.remaining != null && (
                  <span className="s-size__meta" data-low={size.remaining <= 2}>
                    {tr(`${size.remaining} disponibles`, `${size.remaining} متوفّرين`)}
                  </span>
                )}

                {availabilityKnown && size.state === 'unknown' && (
                  <span className="s-size__meta">{tr('Stock non confirmé', 'المخزون غير مؤكّد')}</span>
                )}

                {availabilityKnown && size.state === 'unavailable' && (
                  onNotifyRestock
                    ? <span
                        className="s-size__meta"
                        role="button"
                        tabIndex={0}
                        onClick={(event) => { event.stopPropagation(); onNotifyRestock(size); }}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); onNotifyRestock(size); } }}
                      >
                        <u>{tr('Prévenez-moi', 'نبّهني')}</u>
                      </span>
                    : <span className="s-size__meta">{tr('En rupture', 'مفقود')}</span>
                )}

                {size.state === 'available' && selected === size.value && (
                  <EditorialIcon name="Check" size={18} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
