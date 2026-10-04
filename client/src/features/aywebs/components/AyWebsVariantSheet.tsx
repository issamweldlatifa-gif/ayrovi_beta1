import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, ShoppingBag, X } from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import {
  addAyWebsCartItem, getAyWebsVariants, resolveAyWebsProduct, trackAyWebsEvent,
  type AyWebsCartItemPayload, type AyWebsProductPayload,
} from '../api';

/**
 * AYWEBs — feuille de variantes PAR-DESSUS l'expérience marchand
 * (référence Add-to-Buyee, captures 1 à 4) puis confirmation d'ajout.
 *
 * Contrat permanent (AYWEBS_ADD_TO_CART_ORDER.md) :
 *  • tout vient du serveur (resolve + variants) : groupes libres, prix, dispo ;
 *  • seules les options RÉELLEMENT publiées par le marchand sont affichées ;
 *  • aucun état « New » imposé : l'état du produit n'apparaît que si la source
 *    le publie (JSON-LD `itemCondition`), et il n'est JAMAIS un critère de
 *    correspondance de variante (régression du 03/10/2026 corrigée) ;
 *  • après ajout : confirmation avec la ligne réellement enregistrée, puis deux
 *    sorties — Proceed to Checkout (panier AYROVI) ou Return to Shopping.
 *
 * Cartes de variantes (04/10/2026, captures marchand 1-2) : quand le marchand
 * publie une image ou un prix propre à chaque valeur d'un attribut (couleur…),
 * les valeurs s'affichent en CARTES façon fiche Amazon — image, nom, prix,
 * disponibilité, bordure de sélection — au lieu d'un menu déroulant anonyme.
 */
export interface AyWebsVariantSheetProps {
  url: string;
  storeId?: string | null;
  onClose: () => void;
  onCheckout: () => void;
}

type Phase = 'loading' | 'ready' | 'added' | 'error';

interface VariantCard {
  value: string;
  image: string | null;
  price: number | null;
  currency: string | null;
  availability: string;
}

export const AyWebsVariantSheet: React.FC<AyWebsVariantSheetProps> = ({ url, storeId, onClose, onCheckout }) => {
  const { tr } = useLocale();
  const [phase, setPhase] = useState<Phase>('loading');
  const [product, setProduct] = useState<AyWebsProductPayload | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState<AyWebsCartItemPayload | null>(null);
  const [linked, setLinked] = useState<{ linked: boolean; reason: string } | null>(null);
  const [cardsByAttribute, setCardsByAttribute] = useState<Record<string, VariantCard[]>>({});

  useEffect(() => {
    const controller = new AbortController();
    setPhase('loading');
    resolveAyWebsProduct({ url, ...(storeId ? { store: storeId } : {}) }, controller.signal)
      .then(async (payload) => {
        const resolved = payload.product ?? payload;
        setProduct(resolved);
        setPhase('ready');
        // Cartes marchand (image / prix / dispo par valeur) — meilleur effort :
        // un échec de l'appel variantes laisse les menus déroulants (Buyee).
        try {
          const variants = await getAyWebsVariants({ product_id: resolved.product_id }, controller.signal);
          const cards: Record<string, VariantCard[]> = {};
          for (const group of resolved.variant_groups || []) {
            if (group.values.length < 2) continue;
            const perValue = group.values.map((value) => {
              const match = (variants.variants || []).find(
                (variant) => String(variant.attributes?.[group.attribute] || '') === value,
              );
              return {
                value,
                image: match?.image || null,
                price: match?.price ?? null,
                currency: match?.currency || null,
                availability: String(match?.availability || ''),
              };
            });
            // Une valeur sur deux au moins porte une image ou un prix propre :
            // l'attribut mérite des cartes (couleur Amazon), sinon un select.
            const rich = perValue.filter((card) => card.image || card.price != null).length;
            if (rich >= 2) cards[group.attribute] = perValue;
          }
          setCardsByAttribute(cards);
        } catch {
          setCardsByAttribute({});
        }
      })
      .catch((caught) => {
        setError(String(caught?.message || caught));
        setPhase('error');
      });
    return () => controller.abort();
  }, [url, storeId]);

  const groups = useMemo(() => product?.variant_groups || [], [product]);
  const quantities = useMemo(() => Array.from({ length: 10 }, (_, index) => index + 1), []);

  /**
   * Un groupe à valeur unique est une donnée, pas un choix : il est présélectionné
   * (le serveur exige la sélection complète des attributs publiés). Un groupe à
   * plusieurs valeurs reste à choisir par le client — jamais deviné.
   */
  useEffect(() => {
    if (!groups.length) return;
    setSelected((current) => {
      const next = { ...current };
      for (const group of groups) {
        if (group.values.length === 1 && !next[group.attribute]) next[group.attribute] = group.values[0];
      }
      return next;
    });
  }, [groups]);

  const missingRequired = useMemo(
    () => groups.some((group) => group.values.length > 1 && !selected[group.attribute]),
    [groups, selected],
  );

  /** Disponibilité : affichée seulement quand le marchand (ou l'adaptateur) confirme. */
  const availabilityLabel = (state: string | undefined, short = false): string => {
    if (state === 'AVAILABLE') return short ? tr('In Stock', 'متوفر') : tr('In stock at the merchant', 'متوفّر عند التاجر');
    if (state === 'LOW_STOCK') return short ? tr('Low stock', 'كمية محدودة') : tr('Low stock at the merchant', 'الكمية محدودة عند التاجر');
    if (state === 'OUT_OF_STOCK') return short ? tr('Out of stock', 'غير متوفر') : tr('Out of stock at the merchant', 'غير متوفّر عند التاجر');
    return '';
  };

  const conditionLabel = useMemo(() => {
    const condition = product?.condition;
    if (condition === 'new') return tr('Condition: New', 'الحالة: جديد');
    if (condition === 'used') return tr('Condition: Used', 'الحالة: مستعمل');
    if (condition === 'refurbished') return tr('Condition: Refurbished', 'الحالة: مُجدَّد');
    return '';
  }, [product, tr]);

  const submit = async () => {
    if (!product || missingRequired || adding) return;
    setAdding(true);
    setError('');
    try {
      const result = await addAyWebsCartItem({
        product_id: product.product_id,
        source_url: product.source_url,
        store_id: product.store_id,
        // Uniquement les attributs publiés réellement choisis. La coque n'ajoute
        // plus `condition` : ce n'est pas un attribut de variante chez le marchand.
        variant_attributes: Object.keys(selected).length ? selected : null,
        quantity,
      });
      trackAyWebsEvent('add_to_cart_succeeded', { store: product.store_id });
      setAdded(result.item ?? null);
      setLinked(result.ayrovi ? { linked: Boolean(result.ayrovi.linked), reason: String(result.ayrovi.reason || '') } : null);
      setPhase('added');
    } catch (caught: any) {
      // Aucun faux succès : on reste sur la feuille, le message vient du serveur.
      trackAyWebsEvent('capture_failed', { code: caught?.code || 'ADD_FAILED' });
      setError(String(caught?.message || caught));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="ayw-sheet-mask" role="dialog" aria-modal="true" aria-label={tr('Select your desired item', 'اختر منتجك')}>
      <div className="ayw-sheet">
        <button type="button" className="ayw-sheet-close" onClick={onClose} aria-label={tr('Close', 'إغلاق')}>
          <X size={20} aria-hidden="true" />
        </button>

        {phase === 'loading' && (
          <div className="ayw-sheet-body ayw-center">
            <Loader2 className="animate-spin" size={26} aria-hidden="true" />
            <p>{tr('Reading the merchant page…', 'نقرأ صفحة التاجر…')}</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="ayw-sheet-body ayw-center">
            <p className="ayw-notice">{error || tr('Product unreadable on the merchant page.', 'تعذّرت قراءة المنتج من صفحة التاجر.')}</p>
          </div>
        )}

        {phase === 'ready' && product && (
          <div className="ayw-sheet-body">
            <h2 className="ayw-sheet-title">{tr('Select your desired item', 'اختر منتجك')}</h2>
            <div className="ayw-sheet-product">
              {product.images[0] && <img className="ayw-sheet-thumb" src={product.images[0]} alt="" />}
              <span className="ayw-sheet-name">{product.title}</span>
            </div>

            {conditionLabel && <p className="ayw-added-meta">{conditionLabel}</p>}
            {availabilityLabel(product.availability?.state) && (
              <p className="ayw-added-meta">{availabilityLabel(product.availability?.state)}</p>
            )}

            {groups.map((group) => {
              if (group.values.length === 1) {
                return (
                  <p className="ayw-added-meta" key={group.attribute}>
                    {group.attribute} : <strong>{group.values[0]}</strong>
                  </p>
                );
              }
              const cards = cardsByAttribute[group.attribute];
              if (cards?.length) {
                // Cartes marchand façon fiche Amazon (captures 1-2) : image,
                // nom de la valeur, prix, disponibilité, bordure de sélection.
                return (
                  <div className="ayw-cardgroup" key={group.attribute} role="radiogroup" aria-label={group.attribute}>
                    <span className="ayw-cardgroup-label">{group.attribute}</span>
                    <div className="ayw-cardrow">
                      {cards.map((card) => {
                        const isOn = selected[group.attribute] === card.value;
                        return (
                          <button
                            type="button"
                            key={card.value}
                            role="radio"
                            aria-checked={isOn}
                            className={`ayw-variantcard${isOn ? ' is-on' : ''}`}
                            onClick={() => setSelected((current) => ({ ...current, [group.attribute]: card.value }))}
                          >
                            <img className="ayw-variantcard-img" src={card.image || product.images[0] || ''} alt="" loading="lazy" />
                            <span className="ayw-variantcard-name">{card.value}</span>
                            {card.price != null && card.price > 0 && (
                              <span className="ayw-variantcard-price">
                                {card.price.toLocaleString()} {String(card.currency || product.currency || '').trim()}
                              </span>
                            )}
                            {availabilityLabel(card.availability, true) && (
                              <span className="ayw-variantcard-stock">{availabilityLabel(card.availability, true)}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              return (
                <label className="ayw-selectwrap" key={group.attribute}>
                  <span className="ayw-sr">{group.attribute}</span>
                  <select
                    className="ayw-select"
                    value={selected[group.attribute] || ''}
                    onChange={(event) => setSelected((current) => ({ ...current, [group.attribute]: event.target.value }))}
                  >
                    <option value="" disabled>{group.attribute}</option>
                    {group.values.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
              );
            })}

            <label className="ayw-selectwrap">
              <span className="ayw-sr">{tr('Quantity', 'الكمية')}</span>
              <select className="ayw-select" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>
                {quantities.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            {product.price > 0 && (
              <p className="ayw-price">
                {product.price.toLocaleString()} {product.currency}
                {product.ayrovi_pricing && (
                  <span className="ayw-price-tnd"> ≈ {product.ayrovi_pricing.total_tnd.toFixed(2)} {tr('DT', 'د.ت')}</span>
                )}
              </p>
            )}

            <button type="button" className="ayw-cta" disabled={missingRequired || adding} onClick={() => void submit()}>
              {adding ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : tr('Add to Cart', 'أضف إلى السلة')}
            </button>
            {error && <p className="ayw-notice">{error}</p>}
          </div>
        )}

        {phase === 'added' && (
          <div className="ayw-sheet-body ayw-added">
            <div className="ayw-added-icon">
              <ShoppingBag size={44} aria-hidden="true" />
              <CheckCircle2 size={22} aria-hidden="true" />
            </div>
            <h2 className="ayw-sheet-title">{tr('Item added to AYROVI cart', 'تمت الإضافة إلى سلة AYROVI')}</h2>
            <div className="ayw-added-sum">
              {(added?.images[0] || product?.images[0]) && (
                <img className="ayw-added-thumb" src={added?.images[0] || product?.images[0]} alt="" />
              )}
              <div>
                <p className="ayw-added-title">{added?.title || product?.title}</p>
                {added?.variant_label && <p className="ayw-added-meta">{added.variant_label}</p>}
                {added?.quantity ? (
                  <p className="ayw-added-meta">
                    {tr('Quantity', 'الكمية')} : <strong>{added.quantity}</strong>
                    {added.unit_price > 0 ? ` · ${added.unit_price.toLocaleString()} ${added.currency}` : ''}
                  </p>
                ) : null}
                {added?.line_total_tnd ? (
                  <p className="ayw-added-meta">{added.line_total_tnd.toFixed(2)} {tr('DT', 'د.ت')}</p>
                ) : null}
                {linked && !linked.linked && (
                  <p className="ayw-added-meta">
                    {tr('Kept in the AyWebs cart — the AYROVI cart step will confirm it.', 'محفوظ في سلة AyWebs — ستُؤكَّد الإضافة عند خطوة سلة AYROVI.')}
                  </p>
                )}
              </div>
            </div>
            <button type="button" className="ayw-cta" onClick={onCheckout}>
              {tr('Proceed to Checkout', 'متابعة الدفع')}
            </button>
            <button type="button" className="ayw-cta-outline" onClick={onClose}>
              {tr('Return to Shopping', 'مواصلة التسوق')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
