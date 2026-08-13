import React from 'react';
import type { AyrovixCandidate } from '../types';

interface ProductCandidatesProps {
  candidates: AyrovixCandidate[];
  onChoose: (candidate: AyrovixCandidate) => void;
}

const Placeholder: React.FC = () => (
  <div className="flex h-full w-full items-center justify-center bg-surface text-muted">
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2" /><path d="M8 6V5a4 4 0 0 1 8 0v1" />
    </svg>
  </div>
);

/**
 * Jamais de réponse unique : plusieurs candidats, le meilleur en tête —
 * c'est l'utilisateur qui confirme le bon produit (principe central AYROVIX).
 */
export const ProductCandidates: React.FC<ProductCandidatesProps> = ({ candidates, onChoose }) => (
  <div className="space-y-2.5">
    {candidates.map((candidate, index) => (
      <article
        key={candidate.id}
        className={`rounded-[20px] border bg-white p-3 transition ${index === 0 ? 'border-brand shadow-lg shadow-brand/10' : 'border-line'}`}
      >
        {index === 0 && (
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-brand">Meilleure correspondance</p>
        )}
        <div className="flex gap-3">
          <div className="relative h-[84px] w-[68px] flex-none overflow-hidden rounded-xl border border-line">
            {candidate.image
              ? <img src={candidate.image} alt="" loading="lazy" className="h-full w-full object-cover" />
              : <Placeholder />}
            <span className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${candidate.match >= 80 ? 'bg-ink text-white' : 'bg-white/90 text-ink border border-line'}`}>
              {candidate.match}%
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="line-clamp-2 text-[13px] font-bold leading-snug text-ink">{candidate.title}</h4>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-muted">
              {candidate.source}{candidate.colors.length ? ` · ${candidate.colors.join(' / ')}` : ''}
            </p>
            <p className="mt-1 text-sm font-extrabold text-ink">
              {candidate.price != null && candidate.currency
                ? <>{candidate.price.toFixed(candidate.price % 1 ? 2 : 0)} {candidate.currency}
                    {candidate.priceTnd != null && <span className="ml-1.5 font-bold text-brand">≈ {candidate.priceTnd.toFixed(2)} DT</span>}</>
                : <span className="text-xs font-semibold text-muted">Prix à vérifier sur la fiche</span>}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => onChoose(candidate)}
                // Le lien direct est ensuite analysé pour confirmer les données et le prix.
                className="min-h-[40px] flex-1 rounded-xl bg-ink px-3 text-xs font-bold text-white transition active:scale-95 disabled:opacity-40"
              >
                Choisir
              </button>
              {candidate.sourceUrl && (
                <a
                  href={candidate.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[40px] items-center rounded-xl border border-line px-3 text-xs font-bold text-ink transition hover:border-ink"
                >
                  Voir le produit
                </a>
              )}
            </div>
          </div>
        </div>
      </article>
    ))}
  </div>
);
