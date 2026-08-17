import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, Image as ImageIcon, Star } from '../../components/QatafoIcons';
import type { AyrovixCandidate } from '../types';
import { displayRating, isDisplayableCandidate } from '../services/resultPolicy';
import { useLocale } from '../../i18n/LocaleContext';

interface ProductCandidatesProps {
  candidates: AyrovixCandidate[];
  onChoose: (candidate: AyrovixCandidate) => void;
}

const Placeholder: React.FC = () => (
  <div className="flex h-full w-full items-center justify-center bg-surface text-muted"><ImageIcon size={34} strokeWidth={1.5} /></div>
);

const CandidateImage: React.FC<{ candidate: AyrovixCandidate }> = ({ candidate }) => {
  const urls = [...new Set([...(candidate.images || []), candidate.image].filter(Boolean))];
  const [index, setIndex] = React.useState(0);
  if (!urls[index]) return <Placeholder />;
  return <img src={urls[index]} alt={candidate.title} loading="lazy" referrerPolicy="no-referrer" onError={() => setIndex((current) => current + 1)} className="h-full w-full object-cover" />;
};

/** Only actionable, priced merchant listings are rendered. */
export const ProductCandidates: React.FC<ProductCandidatesProps> = ({ candidates, onChoose }) => {
  const { tr, direction, locale } = useLocale();
  const visible = candidates.filter(isDisplayableCandidate);
  if (!visible.length) return null;
  return (
    <div className="space-y-2.5" dir={direction}>
      {visible.map((candidate, index) => {
        const rating = displayRating(candidate);
        const merchantRating = candidate.ratingKind === 'merchant';
        return (
          <motion.article
            key={candidate.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.2) }}
            className={`rounded-[20px] border bg-white p-3 transition-shadow ${index === 0 ? 'border-brand shadow-lg shadow-brand/10' : 'border-line hover:shadow-md'}`}
          >
            {index === 0 && <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-brand">{tr('Meilleure correspondance', 'أفضل تطابق')}</p>}
            <div className="flex gap-3">
              <div className="relative h-[92px] w-[74px] flex-none overflow-hidden rounded-xl border border-line">
                <CandidateImage candidate={candidate} />
                <span className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${candidate.match >= 80 ? 'bg-ink text-white' : 'border border-line bg-white/90 text-ink'}`}>{candidate.match}%</span>
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="line-clamp-2 break-words text-[13px] font-bold leading-snug text-ink" title={candidate.title}>{candidate.title}</h4>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-muted">{candidate.source}{candidate.colors.length ? ` · ${candidate.colors.join(' / ')}` : ''}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-sm font-extrabold text-ink">{Number(candidate.price).toFixed(Number(candidate.price) % 1 ? 2 : 0)} {candidate.currency}{candidate.priceTnd != null && <span className="ml-1.5 font-bold text-brand">≈ {candidate.priceTnd.toFixed(2)} DT</span>}</p>
                  <p className="inline-flex items-center gap-1 text-[10px] font-bold text-accent-deep" title={merchantRating ? tr('Note publiée par le marchand', 'تقييم منشور لدى المتجر') : tr('Score de pertinence converti sur 5', 'درجة التطابق محوّلة إلى 5')}><Star size={13} fill="currentColor" />{rating.toFixed(1)}/5 <span className="text-muted">{merchantRating ? tr('marchand', 'المتجر') : tr('pertinence', 'التطابق')}</span>{merchantRating && Number(candidate.ratingCount) > 0 ? <span className="text-muted">({Number(candidate.ratingCount).toLocaleString(locale === 'ar' ? 'ar-TN' : 'fr-FR')})</span> : null}</p>
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => onChoose(candidate)} className="ay-btn-secondary min-h-11 flex-1 px-3 text-xs" title={tr('Ouvrir les détails, confirmer le prix et choisir les options', 'فتح التفاصيل وتأكيد السعر واختيار المواصفات')}>{candidate.kind === 'external' ? tr('Vérifier le prix et choisir', 'تحقق من السعر واختر') : tr('Voir les détails', 'عرض التفاصيل')}</button>
                  <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="ay-btn-secondary min-h-11 px-3 text-xs" aria-label={tr(`Ouvrir ${candidate.title} chez ${candidate.source}`, `فتح ${candidate.title} لدى ${candidate.source}`)} title={tr('Ouvrir la fiche originale du marchand dans un nouvel onglet', 'فتح صفحة المتجر الأصلية في علامة تبويب جديدة')}>{tr(`Voir chez ${candidate.source}`, `عرض في ${candidate.source}`)} <ArrowUpRight size={15} /></a>
                </div>
              </div>
            </div>
          </motion.article>
        );
      })}
    </div>
  );
};
