import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EditorialIcon } from '../design/editorial/Icon';
import { SizeDrape } from './SizeDrape';
import { refusalReason, type ProductActions, type ProductView, type SizeOption } from './types';
import './shop.css';

/**
 * FICHE PRODUIT (boutique v2) — la forme validée en maquette, à la lettre.
 *
 *   1. au repos, le produit est ENTIER, plein cadre, sur notre canvas ;
 *   2. les photos défilent latéralement (glissement ou flèches clavier) ;
 *   3. dès que la page remonte, la feuille d'information passe PAR-DESSUS et
 *      l'image s'éteint derrière elle — voile plafonné, recul à échelle unique ;
 *   4. les actions flottantes se posent sur la photo et s'effacent quand la
 *      feuille les recouvre : jamais de bouton à moitié cliquable ;
 *   5. la barre d'achat ne quitte jamais le bas de l'écran.
 *
 * Le composant n'a AUCUNE logique commerciale : il affiche un `ProductView` et
 * appelle les actions de l'hôte. Il ne calcule pas de prix, ne convertit pas de
 * taille, n'invente pas de texte. Ce qui est `null` ne s'affiche pas.
 */
export interface ProductPageProps {
  product: ProductView;
  actions?: ProductActions;
  tr: (fr: string, ar: string) => string;
  formatMoney: (tnd: number) => string;
  direction?: 'ltr' | 'rtl';
  /** Vrai tant que le prix est en cours de vérification à la source. */
  priceChecking?: boolean;
}

export const ProductPage: React.FC<ProductPageProps> = ({
  product, actions, tr, formatMoney, direction = 'ltr', priceChecking = false,
}) => {
  const [slide, setSlide] = useState(0);
  const [drapeOpen, setDrapeOpen] = useState(false);
  const [chosen, setChosen] = useState<SizeOption | null>(null);
  const [refusal, setRefusal] = useState<'unavailable' | 'unknown' | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [shake, setShake] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const touchStart = useRef<number | null>(null);

  /* Le voile est piloté par le RECOUVREMENT réel de l'image par la feuille,
     pas par la position de défilement : la fiche reste juste quelle que soit
     la hauteur de l'écran ou la longueur du texte. */
  const measure = useCallback(() => {
    const stage = stageRef.current;
    const media = mediaRef.current;
    const sheet = sheetRef.current;
    if (!stage || !media || !sheet) return;
    const mediaBox = media.getBoundingClientRect();
    const overlap = mediaBox.bottom - sheet.getBoundingClientRect().top;
    const travel = Math.max(1, mediaBox.height * 0.8);
    const reveal = Math.min(1, Math.max(0, overlap / travel));
    stage.style.setProperty('--s-reveal', reveal.toFixed(3));
    stage.dataset.covered = String(reveal > 0.6);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let frame = 0;
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; measure(); }); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [measure]);

  const media = product.media;
  const slides = media.length || 1;
  const go = (next: number) => setSlide(((next % slides) + slides) % slides);

  const pickSize = (size: SizeOption) => {
    const reason = refusalReason(size);
    if (reason) {
      setRefusal(reason);
      setChosen(null);
      setDrapeOpen(false);
      setShake(true);
      window.setTimeout(() => setShake(false), 300);
      return;
    }
    setRefusal(null);
    setChosen(size);
    setDrapeOpen(false);
  };

  const add = async () => {
    if (!actions?.onAddToBag || adding) return;
    if (product.sizes.length > 0 && !chosen) { setDrapeOpen(true); return; }
    setAdding(true);
    try {
      await actions.onAddToBag(chosen);
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1800);
    } finally {
      setAdding(false);
    }
  };

  const price = product.price;

  return (
    <div className="s-root s-page" dir={direction} data-ay-design="editorial">
      <header className="s-appbar">
        <button type="button" className="s-iconbtn" onClick={actions?.onBack} aria-label={tr('Retour', 'رجوع')}>
          <EditorialIcon name="Back" direction={direction} />
        </button>
        <div className="s-appbar__title">
          <span>{product.brand ?? product.merchant?.name ?? ''}</span>
          <small>{product.title}</small>
        </div>
        <span style={{ width: 44 }} />
      </header>

      <div className="s-stage" ref={stageRef}>
        <div className="s-media" ref={mediaRef}>
          <div className="s-media__zoom">
            <div
              className="s-media__viewport"
              onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
              onTouchEnd={(event) => {
                const start = touchStart.current;
                touchStart.current = null;
                if (start == null || slides < 2) return;
                const delta = (event.changedTouches[0]?.clientX ?? start) - start;
                if (Math.abs(delta) < 40) return;
                go(slide + (delta < 0 ? 1 : -1) * (direction === 'rtl' ? -1 : 1));
              }}
            >
              <div
                className="s-media__track"
                style={{ transform: `translateX(${(direction === 'rtl' ? 1 : -1) * slide * 100}%)` }}
              >
                {media.map((item, index) => (
                  <div className="s-media__slide" key={`${item.src}-${index}`}>
                    <img src={item.src} alt={item.alt} decoding="async" referrerPolicy="no-referrer" draggable={false} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="s-scrim" aria-hidden="true" />

          {product.flags.length > 0 && (
            <div className="s-card__flags" style={{ top: 10, bottom: 'auto', insetInlineStart: 10, position: 'absolute', zIndex: 6 }}>
              {product.flags.map((flag) => (
                <span key={flag.label} className={`s-flag s-flag--${flag.kind}`}>{flag.label}</span>
              ))}
            </div>
          )}

          {slides > 1 && <span className="s-counter">{slide + 1} / {slides}</span>}

          {actions?.onOpenBag && (
            <div className="s-rail" data-hidden={stageRef.current?.dataset.covered === 'true'}>
              <button type="button" className="s-rail__btn" data-solid="true" onClick={actions.onOpenBag} aria-label={tr('Ouvrir le panier', 'فتح السلة')}>
                <EditorialIcon name="Bag" size={22} />
              </button>
            </div>
          )}
        </div>

        <section className="s-sheet" ref={sheetRef}>
          <div className="s-sheet__grab" aria-hidden="true" />

          {product.colors.length > 1 && (
            <div className="s-swatches" role="group" aria-label={tr('Couleurs', 'الألوان')}>
              {product.colors.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  className="s-swatch"
                  aria-pressed={color.selected}
                  aria-label={color.name}
                  onClick={() => actions?.onSelectColor?.(color.name)}
                >
                  {color.media ? <img src={color.media.src} alt="" /> : <span>{color.name.slice(0, 3)}</span>}
                </button>
              ))}
            </div>
          )}

          {product.brand && <div className="s-brand">{product.brand}</div>}
          <h1 className="s-title">{product.title}</h1>
          {product.description && <p className="s-desc">{product.description}</p>}

          {price && (
            <>
              <div className="s-price" data-deal={Boolean(price.reference)}>
                <strong>{formatMoney(price.current.tnd)}</strong>
                {priceChecking && (
                  <span className="s-price__note" role="status">
                    {tr('Vérification à la source…', 'نتثبّتو عند المصدر…')}
                  </span>
                )}
              </div>
              {price.reference && (
                <p className="s-was">
                  {tr('Prix de référence : ', 'السعر المرجعي: ')}
                  <s>{formatMoney(price.reference.tnd)}</s>
                  {price.discountPercent != null && <b> −{price.discountPercent}%</b>}
                </p>
              )}
              {price.current.source && (
                <p className="s-was">
                  {price.current.source.amount} {price.current.source.currency}
                  {price.verifiedAtSource ? ` · ${tr('prix vérifié à la source', 'السعر متثبّت عند المصدر')}` : ''}
                </p>
              )}
            </>
          )}

          {product.sizes.length > 0 && (
            <div className="s-stock">
              <h3>{tr('Disponibilité constatée', 'التوفّر المثبّت')}</h3>
              <ul>
                {(['available', 'unavailable', 'unknown'] as const).map((state) => {
                  const values = product.sizes.filter((size) => size.state === state).map((size) => size.value);
                  if (!values.length) return null;
                  const label = state === 'available'
                    ? tr('en stock chez la source', 'متوفّر عند المصدر')
                    : state === 'unavailable'
                      ? tr('rupture constatée', 'مفقود عند المصدر')
                      : tr('stock non confirmé', 'المخزون غير مؤكّد');
                  const icon = state === 'available' ? 'Success' : state === 'unavailable' ? 'Close' : 'Alert';
                  return (
                    <li key={state}>
                      <EditorialIcon name={icon} size={16} />
                      <span>{values.join(', ')} — {label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>

      <div className="s-buybar">
        {product.sizes.length > 0 && (
          <button
            type="button"
            className="s-select"
            data-error={shake || undefined}
            onClick={() => setDrapeOpen(true)}
            aria-expanded={drapeOpen}
          >
            <span>{chosen ? tr(`Taille : ${chosen.value}`, `المقاس: ${chosen.value}`) : tr('Choisir la taille', 'اختار المقاس')}</span>
            <EditorialIcon name="ChevronDown" size={20} />
          </button>
        )}

        {refusal && (
          <p className="s-refusal" role="status">
            {refusal === 'unavailable'
              ? tr('Cette taille est en rupture chez la source. Choisissez-en une autre.', 'هذا المقاس مفقود عند المصدر. اختار مقاس آخر.')
              : tr('La source ne confirme pas le stock de cette taille : la commande est bloquée.', 'المصدر ما أكّدش توفّر هذا المقاس: الطلب مسدود.')}
          </p>
        )}

        <button type="button" className="s-cta" data-done={added || undefined} onClick={add} disabled={adding || !actions?.onAddToBag}>
          {added
            ? <><EditorialIcon name="Check" size={18} />{tr('Ajouté au panier', 'تزاد للسلة')}</>
            : adding
              ? tr('Ajout…', 'جارٍ الإضافة…')
              : tr('Ajouter au panier', 'زيد للسلة')}
        </button>
      </div>

      <SizeDrape
        open={drapeOpen}
        sizes={product.sizes}
        selected={chosen?.value ?? null}
        scaleLabel={product.sizeScaleLabel}
        tr={tr}
        onClose={() => setDrapeOpen(false)}
        onSelect={pickSize}
      />
    </div>
  );
};
