import { useEffect, useMemo, useState, useId } from 'react';
import { Heart, HeartFilled, Image as ImageIcon, RefreshCw } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';
import type { AyrovixCandidate } from '../types';
import { refreshLiveStock, type LiveStockResult } from '../services/lensApi';
import { MerchantRating } from './MerchantRating';
import { QuietPromoPrice } from './quiet-card';
import { isComposedUrl, withIsolation } from '../services/mediaIsolation';
import './lens-product-card.css';

export function lensCardCopy(candidate: AyrovixCandidate) {
  const brand = candidate.brand?.trim();
  const title = candidate.title.trim();
  let description = candidate.description?.trim() || '';
  if (brand) {
    // Remove only the actual supplied brand prefix, never infer a brand from a title.
    const afterBrand = title.toLocaleLowerCase().startsWith(brand.toLocaleLowerCase() + ' ') ? title.slice(brand.length).replace(/^\s*[-–—|:]?\s*/, '') : title;
    description = afterBrand.toLocaleLowerCase() === brand.toLocaleLowerCase() ? description : afterBrand;
  } else if (!description && candidate.model?.trim() !== title) description = candidate.model?.trim() || '';
  return { heading: brand || title, description };
}

/**
 * STOCK VIVANT SUR LA CARTE (01/10/2026) — la fiche affiche ce que la source
 * affirme. Un silence reste un silence : pas de badge « en stock » inventé, et
 * une taille que le marchand déclare indisponible est montrée barrée plutôt que
 * cachée (le client doit voir POURQUOI il ne peut pas la prendre).
 */
const AVAILABILITY_LABEL: Record<string, [string, string]> = {
  in_stock: ['En stock', 'متوفر'],
  limited: ['Stock limité', 'آخر القطع'],
  out_of_stock: ['Épuisé', 'نفدت الكمية'],
};

function StockBadge({ availability }: { availability: AyrovixCandidate['availability'] }) {
  const { tr } = useLocale();
  const label = availability ? AVAILABILITY_LABEL[availability] : undefined;
  if (!label) return null;
  return (
    <span className="lens-card-stock" data-stock={availability}>
      {tr(label[0], label[1])}
    </span>
  );
}

function ColorChips({ colors }: { colors: string[] }) {
  const { tr } = useLocale();
  if (!colors.length) return null;
  return (
    <span className="lens-card-sizes" aria-label={tr('Couleurs publiées par le marchand', 'الألوان التي نشرها المتجر')}>
      {colors.slice(0, 4).map((color) => (
        <span key={color} className="lens-card-color">{color}</span>
      ))}
    </span>
  );
}

function SizeChips({ sizes, variants = [] }: { sizes: string[]; variants?: LiveStockResult['variants'] }) {
  const { tr } = useLocale();
  if (!sizes.length) return null;
  const stateOf = (size: string) => {
    const rows = variants.filter((variant) => variant.value === size);
    if (!rows.length || rows.some((row) => row.availability === 'unknown')) return 'unknown';
    return rows.some((row) => row.availability === 'available') ? 'in' : 'out';
  };
  return (
    <span className="lens-card-sizes" aria-label={tr('Tailles publiées par le marchand', 'المقاسات التي نشرها المتجر')}>
      {sizes.slice(0, 8).map((size) => {
        const state = stateOf(size);
        return <span key={size} className="lens-card-size" data-state={state} aria-disabled={state === 'out' ? true : undefined}>{size}</span>;
      })}
      {sizes.length > 8 ? <span className="lens-card-size">+{sizes.length - 8}</span> : null}
    </span>
  );
}

function CardImage({ candidate }: { candidate: AyrovixCandidate }) {
  const urls = useMemo(() => withIsolation([...new Set([candidate.image, ...(candidate.images || [])].filter(Boolean))]), [candidate.image, candidate.images]);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [candidate.id, candidate.image, candidate.images]);
  return urls[index]
    ? <img src={urls[index]} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer"
        /* composé côté serveur : le cadrage est déjà fait, donc « contain » sans blend ;
           une image de repli (brute) garde l'ancien rendu multiply. */
        data-composed={isComposedUrl(urls[index]) ? 'true' : undefined}
        onError={() => setIndex(value => value + 1)} />
    : <span className="lens-card-placeholder"><ImageIcon size={32} /><span>{candidate.source}</span></span>;
}

export function LensProductCard({ candidate, onChoose, saved, busy, onFavorite }: {
  candidate: AyrovixCandidate; onChoose: (candidate: AyrovixCandidate) => void;
  saved: boolean; busy: boolean; onFavorite: (candidate: AyrovixCandidate) => void;
}) {
  const { tr } = useLocale();
  const priceId = useId();
  const [fresh, setFresh] = useState<LiveStockResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  useEffect(() => {
    setFresh(null);
    setChecking(false);
    setCheckFailed(false);
  }, [candidate.id, candidate.sourceUrl]);

  const { heading, description } = lensCardCopy(candidate);
  const availability = fresh?.availability ?? candidate.availability;
  const sizes = fresh ? fresh.sizes : candidate.sizes || [];
  const colors = fresh ? fresh.colors : candidate.colors || [];
  const variants = fresh?.variants || [];
  const sourceUrlIsPublic = (() => {
    try {
      const parsed = new URL(candidate.sourceUrl);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch { return false; }
  })();
  const verifyStock = async () => {
    if (!sourceUrlIsPublic || checking) return;
    setChecking(true);
    setCheckFailed(false);
    try {
      const rows = await refreshLiveStock([candidate.sourceUrl]);
      const result = rows.find((row) => row.url === candidate.sourceUrl) || rows[0];
      if (!result) {
        setFresh(null);
        setCheckFailed(true);
        return;
      }
      setFresh(result);
    } catch {
      setFresh(null);
      setCheckFailed(true);
    } finally {
      setChecking(false);
    }
  };
  const priceTnd = candidate.priceTnd;
  const sourceAmount = candidate.price;
  const originalAmount = candidate.originalPrice ?? null;
  const originalTnd = candidate.originalPriceTnd ?? null;
  const merchantPromo = !candidate.promo && originalTnd != null && priceTnd != null && originalTnd > priceTnd
    && sourceAmount != null && originalAmount != null && originalAmount > sourceAmount
    ? { percent: Math.round((1 - sourceAmount / originalAmount) * 100), label: tr('Remise marchand', 'تخفيض المتجر'), priceTnd, originalPriceTnd: originalTnd }
    : null;
  const promo = candidate.promo ?? merchantPromo;
  const hasPrice = typeof priceTnd === 'number' && Number.isFinite(priceTnd) && priceTnd > 0;

  return <article className="lens-product-card" data-candidate-id={candidate.id}>
    <button type="button" className="lens-card-open" onClick={() => onChoose(candidate)} aria-describedby={priceId} aria-label={tr(`Voir le produit : ${candidate.title}`, `عرض المنتج: ${candidate.title}`)}>
      <div className="lens-card-media">
        <CardImage candidate={candidate} />
        {promo ? <span className="lens-card-promo-badge">{candidate.promo ? 'Promo' : `-${promo.percent}%`}</span> : null}
      </div>
      <h4 className="lens-card-title" dir="auto">{heading}</h4>
      {description ? <p className="lens-card-description" dir="auto">{description.length > 72 ? description.slice(0, 72).trim() + "…" : description}</p> : null}
      <MerchantRating value={candidate} stars />
      {/* Quiet Card v2 : promo rouge (barré + remisé + badge) quand elle existe. */}
      <div id={priceId} className="lens-card-price">
        {hasPrice
          ? <QuietPromoPrice priceTnd={priceTnd} promo={promo} format={(value) => `${value.toFixed(2)} DT`} variant="grid" />
          : tr('Prix à confirmer', 'السعر قيد التأكيد')}
      </div>
      <StockBadge availability={availability} />
      <SizeChips sizes={sizes} variants={variants} />
      <ColorChips colors={colors} />
      {fresh ? <span className="lens-card-verified-at" data-failed={fresh.availability === 'unknown' ? 'true' : undefined}>
        {fresh.availability === 'unknown'
          ? tr('Stock non confirmé', 'المخزون غير مؤكد')
          : tr(`Vérifié à ${new Date(fresh.checkedAt).toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' })}`, `تم التحقق ${new Date(fresh.checkedAt).toLocaleTimeString('ar-TN', { hour: '2-digit', minute: '2-digit' })}`)}
      </span> : checkFailed ? <span className="lens-card-verified-at" data-failed="true">{tr('Stock non confirmé', 'المخزون غير مؤكد')}</span> : null}
    </button>
    <button type="button" className="lens-card-favorite" aria-pressed={saved} disabled={busy} aria-busy={busy}
      aria-label={saved
        ? tr(`Retirer des favoris : ${candidate.title}`, `إزالة من المفضلة: ${candidate.title}`)
        : tr(`Ajouter aux favoris : ${candidate.title}`, `إضافة إلى المفضلة: ${candidate.title}`)}
      onClick={() => onFavorite(candidate)}>{saved ? <HeartFilled size={20} /> : <Heart size={20} />}</button>
    {sourceUrlIsPublic ? <button type="button" className="lens-card-verify" onClick={() => void verifyStock()} disabled={checking} aria-busy={checking}
      aria-label={tr(`Vérifier le stock : ${candidate.title}`, `التحقق من المخزون: ${candidate.title}`)}>
      <RefreshCw size={16} />
      <span>{checking ? tr('Vérification…', 'جارٍ التحقق…') : tr('Vérifier le stock', 'تحقق من المخزون')}</span>
    </button> : null}
  </article>;
}
