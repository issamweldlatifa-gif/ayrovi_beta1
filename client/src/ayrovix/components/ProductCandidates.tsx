import { MerchantRating } from './MerchantRating';
import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, Image as ImageIcon, Star } from '../../components/QatafoIcons';
import type { AyrovixCandidate } from '../types';
import { isDisplayableCandidate } from '../services/resultPolicy';
import { useLocale } from '../../i18n/LocaleContext';

interface ProductCandidatesProps {
  candidates: AyrovixCandidate[];
  onChoose: (candidate: AyrovixCandidate) => void;
}

const Placeholder: React.FC = () => (
  <div className="flex h-full w-full items-center justify-center bg-surface text-muted"><ImageIcon size={34} /></div>
);

const CandidateImage: React.FC<{ candidate: AyrovixCandidate }> = ({ candidate }) => {
  const urls = [...new Set([...(candidate.images || []), candidate.image].filter(Boolean))];
  const [index, setIndex] = React.useState(0);
  if (!urls[index]) return <Placeholder />;
  return <img src={urls[index]} alt={candidate.title} loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => setIndex((current) => current + 1)} className="ayrovix-product-media-contain" />;
};

/** Only actionable, priced merchant listings are rendered. */
export const ProductCandidates: React.FC<ProductCandidatesProps> = ({ candidates, onChoose }) => {
  const { tr, direction, locale } = useLocale();
  const visible = candidates.filter(isDisplayableCandidate);
  if (!visible.length) return null;
  return (
    <div className="space-y-2.5" dir={direction}>
      {visible.map((candidate, index) => {
        return (
          <motion.article
            key={candidate.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.2) }}
            className={`bg-white p-3 transition-shadow ${index === 0 ? 'border-line shadow-lg shadow-black/5' : 'border-line hover:shadow-md'}`}
          >
            {index === 0 && <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.1em] text-ink">{tr('Sélection Lens', 'اختيار Lens')}</p>}
            <div className="flex gap-3">
              <div className="relative grid h-[92px] w-[74px] flex-none place-items-center overflow-hidden rounded-card border border-line bg-surface p-1.5">
                <CandidateImage candidate={candidate} />
                <span className={`absolute start-1 top-1 rounded-control px-1.5 py-0.5 text-xs font-extrabold ${candidate.match >= 80 ? 'bg-ink text-white' : 'border border-line bg-white/90 text-ink'}`}title={tr('Similarité estimée', 'تشابه تقديري')}>{Number.isFinite(candidate.match) ? Math.round(Math.min(100, Math.max(0,candidate.match)))+'%' : '—'}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="ay-readable text-sm font-bold leading-snug text-ink" title={candidate.title}>{candidate.title}</h4>
                <p className="ay-readable mt-0.5 text-xs font-semibold text-muted">{candidate.source}{candidate.colors.length ? ` · ${candidate.colors.join(' / ')}` : ''}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-base font-black leading-none text-ink">{candidate.priceTnd != null ? `${candidate.priceTnd.toFixed(2)} DT` : '—'}</p>
                  <p className="text-xs font-semibold text-muted">{Number(candidate.price).toFixed(Number(candidate.price) % 1 ? 2 : 0)} {candidate.currency}</p>
                  <MerchantRating value={candidate}/>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => onChoose(candidate)} className="ay-btn-primary min-h-11 flex-1 px-3 text-xs" title={tr('Ouvrir les détails, confirmer le prix et choisir les options', 'فتح التفاصيل وتأكيد السعر واختيار المواصفات')}>{candidate.kind === 'external' ? tr('Vérifier le prix et choisir', 'تحقق من السعر واختر') : tr('Voir les détails', 'عرض التفاصيل')}</button>
                  <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="ay-btn-secondary ay-readable-label min-h-11 px-3 text-xs" aria-label={tr(`Ouvrir ${candidate.title} chez ${candidate.source}`, `فتح ${candidate.title} لدى ${candidate.source}`)} title={tr('Ouvrir la fiche originale du marchand dans un nouvel onglet', 'فتح صفحة المتجر الأصلية في علامة تبويب جديدة')}>{tr(`Voir chez ${candidate.source}`, `عرض في ${candidate.source}`)} <ArrowUpRight size={15} /></a>
                </div>
              </div>
            </div>
          </motion.article>
        );
      })}
    </div>
  );
};
