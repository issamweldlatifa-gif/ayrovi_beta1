import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, Image as ImageIcon, Star } from '../../components/QatafoIcons';
import type { AyrovixCandidate } from '../types';
import { displayRating, isDisplayableCandidate } from '../services/resultPolicy';

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
  const visible = candidates.filter(isDisplayableCandidate);
  if (!visible.length) return null;
  return (
    <div className="space-y-2.5">
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
            {index === 0 && <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-brand">Meilleure correspondance</p>}
            <div className="flex gap-3">
              <div className="relative h-[92px] w-[74px] flex-none overflow-hidden rounded-xl border border-line">
                <CandidateImage candidate={candidate} />
                <span className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${candidate.match >= 80 ? 'bg-ink text-white' : 'border border-line bg-white/90 text-ink'}`}>{candidate.match}%</span>
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="line-clamp-2 text-[13px] font-bold leading-snug text-ink">{candidate.title}</h4>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-muted">{candidate.source}{candidate.colors.length ? ` · ${candidate.colors.join(' / ')}` : ''}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-sm font-extrabold text-ink">{Number(candidate.price).toFixed(Number(candidate.price) % 1 ? 2 : 0)} {candidate.currency}{candidate.priceTnd != null && <span className="ml-1.5 font-bold text-brand">≈ {candidate.priceTnd.toFixed(2)} DT</span>}</p>
                  <p className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700" title={merchantRating ? 'Note publiée par le marchand' : 'Score de pertinence converti sur 5'}><Star size={13} fill="currentColor" />{rating.toFixed(1)}/5 <span className="text-muted">{merchantRating ? 'marchand' : 'pertinence'}</span>{merchantRating && Number(candidate.ratingCount) > 0 ? <span className="text-muted">({Number(candidate.ratingCount).toLocaleString('fr-FR')})</span> : null}</p>
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => onChoose(candidate)} className="min-h-11 flex-1 rounded-xl bg-ink px-3 text-xs font-bold text-white transition active:scale-95">{candidate.kind === 'external' ? 'Vérifier et choisir' : 'Choisir'}</button>
                  <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line px-3 text-xs font-bold text-ink transition hover:border-ink" aria-label={`Ouvrir ${candidate.title} chez ${candidate.source}`}>Lien <ArrowUpRight size={15} /></a>
                </div>
              </div>
            </div>
          </motion.article>
        );
      })}
    </div>
  );
};
