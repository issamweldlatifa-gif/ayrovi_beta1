import { MerchantRating } from './MerchantRating';
import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, MessageCircle, ArrowRightLeft, ShoppingBag } from '../../components/QatafoIcons';
import type { AyrovixCandidate } from '../types';
import { isDisplayableOrPending } from '../services/resultPolicy';
import { presentCandidate } from '../services/presentCandidate';
import { validateProductForCart } from '../../../../shared/commerceProduct';
import { useLocale } from '../../i18n/LocaleContext';
import { StudioImageFrame, QuietPromoPrice, QuietCardActions } from './quiet-card';

interface ProductCandidatesProps {
  candidates: AyrovixCandidate[];
  onChoose: (candidate: AyrovixCandidate) => void;
  /** Quiet Card v2 : ajout direct depuis la carte (bouton principal encre). */
  onQuickAdd?: (candidate: AyrovixCandidate) => void;
  quickAddBusyId?: string | null;
  /** 💬 — ouvre l'assistant avec une question prête sur ce produit. */
  onAskAssistant?: (candidate: AyrovixCandidate) => void;
  /** ⇄ — relance une recherche de produits similaires. */
  onFindSimilar?: (candidate: AyrovixCandidate) => void;
}

/** Only actionable, priced merchant listings are rendered. */
export const ProductCandidates: React.FC<ProductCandidatesProps> = ({ candidates, onChoose, onQuickAdd, quickAddBusyId, onAskAssistant, onFindSimilar }) => {
  const { tr, direction, formatMoney } = useLocale();
  const visible = candidates.filter(isDisplayableOrPending);
  if (!visible.length) return null;
  return (
    <div className="space-y-2.5" dir={direction}>
      {visible.map((candidate, index) => {
        // Quiet Card v2 : canvas blanc, UN hairline, zéro boîte interne.
        const item = presentCandidate(candidate);
        const canQuickAdd = Boolean(candidate.canonical?.quoteToken && candidate.canonical.variants.groups.length === 0
          && validateProductForCart(candidate.canonical, {}, 1).ok);
        const quickAddBusy = quickAddBusyId === candidate.id;
        return (
          <motion.article
            key={candidate.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.2) }}
            className="rounded-card border border-line bg-white p-3 transition-shadow hover:shadow-card"
          >
            {index === 0 && <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.1em] text-ink">{tr('Sélection Lens', 'اختيار Lens')}</p>}
            <div className="flex gap-3">
              {/* Cadre studio unifié : neutre + hairline, photo originale conservée. Toute la zone ouvre les détails. */}
              <button
                type="button"
                onClick={() => onChoose(candidate)}
                className="relative w-[92px] flex-none self-start"
                aria-label={tr(`Voir le produit : ${item.title}`, `عرض المنتج: ${item.title}`)}
              >
                <StudioImageFrame
                  src={item.image}
                  fallbackSources={item.images}
                  alt={item.title}
                  ratio="1 / 1"
                  placeholderLabel={item.source}
                />
                <span
                  className={`absolute start-1 top-1 rounded-control px-1.5 py-0.5 text-xs font-extrabold ${candidate.match >= 80 ? 'bg-ink text-white' : 'border border-line bg-white/90 text-ink'}`}
                  title={tr('Similarité estimée', 'تشابه تقديري')}
                >{Number.isFinite(candidate.match) ? Math.round(Math.min(100, Math.max(0, candidate.match))) + '%' : '—'}</span>
              </button>
              <div className="min-w-0 flex-1">
                <h4 className="ay-readable text-sm font-bold leading-snug text-ink" title={item.title}>{item.title}</h4>
                <p className="ay-readable mt-0.5 text-xs font-semibold text-muted">{item.source}{item.colors.length ? ` · ${item.colors.join(' / ')}` : ''}</p>
                {item.description && <p className="ay-readable mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{item.description}</p>}
                <div className="mt-1.5">
                  <QuietPromoPrice
                    priceTnd={item.priceTnd}
                    promo={item.promo ?? null}
                    format={formatMoney}
                    variant="list"
                    note={item.price != null && Number.isFinite(item.price) && item.currency
                      ? `${tr('Prix boutique', 'سعر المتجر')} ${Number(item.price).toFixed(Number(item.price) % 1 ? 2 : 0)} ${item.currency}`
                      : tr('Prix boutique à confirmer', 'سعر المتجر بانتظار التأكيد')}
                  />
                </div>
                <div className="mt-1"><MerchantRating value={item} /></div>
                <div className="mt-2.5">
                  <QuietCardActions
                    primaryLabel={canQuickAdd && onQuickAdd ? tr('Ajouter au panier', 'زيد للسلة') : item.kind === 'external' ? tr('Vérifier le prix', 'تحقق من السعر') : tr('Voir les détails', 'عرض التفاصيل')}
                    primaryTitle={canQuickAdd && onQuickAdd ? tr('Ajouter directement au panier — le prix sera vérifié par l’équipe', 'إضافة مباشرة إلى السلة — سيتحقق الفريق من السعر') : tr('Ouvrir les détails, confirmer le prix et choisir les options', 'فتح التفاصيل وتأكيد السعر واختيار المواصفات')}
                    primaryIcon={canQuickAdd && onQuickAdd ? ShoppingBag : undefined}
                    primaryBusy={quickAddBusy}
                    onPrimary={() => (canQuickAdd && onQuickAdd ? onQuickAdd(candidate) : onChoose(candidate))}
                    icons={[
                      ...(onAskAssistant ? [{ key: 'ask', icon: MessageCircle, label: tr(`Demander à Sonim : ${item.title}`, `اسأل سُنيم: ${item.title}`), title: tr('En discuter avec l’assistant', 'ناقشه مع المساعد'), onClick: () => onAskAssistant(candidate) }] : []),
                      ...(onFindSimilar ? [{ key: 'similar', icon: ArrowRightLeft, label: tr(`Produits similaires : ${item.title}`, `منتجات مشابهة: ${item.title}`), title: tr('Me montrer des articles similaires', 'أرني منتجات مشابهة'), onClick: () => onFindSimilar(candidate) }] : []),
                    ]}
                  />
                </div>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ay-readable-label mt-2 inline-flex items-center gap-1 text-xs font-bold text-ink underline decoration-ink/20 underline-offset-4 hover:decoration-ink"
                  aria-label={tr(`Ouvrir ${item.title} chez ${item.source}`, `فتح ${item.title} لدى ${item.source}`)}
                >
                  {tr(`Voir chez ${item.source}`, `عرض في ${item.source}`)}<ArrowUpRight size={14} />
                </a>
              </div>
            </div>
          </motion.article>
        );
      })}
    </div>
  );
};
