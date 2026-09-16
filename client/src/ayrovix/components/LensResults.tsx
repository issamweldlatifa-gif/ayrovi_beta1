import React, { useMemo, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Camera, ChevronDown, ChevronRight, Image as ImageIcon, ShieldCheck, Sparkles, Star,
} from '../../components/QatafoIcons';
import type { AyrovixCandidate, AyrovixDetectedPrice } from '../types';
import { displayRating, isDisplayableCandidate } from '../services/resultPolicy';
import { useLocale } from '../../i18n/LocaleContext';

/**
 * AYROVIX LENS — صفحة نتائج البحث (Result Screen بعد نجاح التحليل).
 * تعرض نتائج البحث الحقيقية من الـ API فقط (لا بيانات Demo).
 * Flow: Entrée → Analyse/Recherche/Vérification → [هذه الصفحة] → Produit/Commande.
 * Phase 0: amélioration UI sans invention — images favicon fallback, prix TND clarifié,
 * tailles/couleurs indisponibles signalées, empty CTA enrichi.
 */

export interface LensResultsView {
  queryLabel: string | null;
  list: AyrovixCandidate[];
  eventId: string;
  detectedPrice?: AyrovixDetectedPrice | null;
}

interface LensResultsProps {
  view: LensResultsView;
  fallbackImage: string | null;
  onChoose: (candidate: AyrovixCandidate) => void;
  onReset: () => void;
  onCommandDetected: (detected: AyrovixDetectedPrice) => void;
  onOpenHistory?: () => void;
}

function faviconUrl(sourceUrl: string): string | null {
  try {
    const host = new URL(sourceUrl).hostname;
    if (!host || host === 'localhost') return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  } catch { return null; }
}

function merchantInitial(source: string): string {
  const c = source.trim().charAt(0);
  return c ? c.toUpperCase() : '•';
}

const CandidateImage: React.FC<{ candidate?: AyrovixCandidate; fallback?: string | null; alt: string }> = ({ candidate, fallback, alt }) => {
  const urls = useMemo(() => {
    const fromCandidate = candidate ? [...new Set([...(candidate.images || []), candidate.image].filter(Boolean))] : [];
    return fromCandidate.length ? fromCandidate : [fallback].filter(Boolean) as string[];
  }, [candidate, fallback]);
  const [index, setIndex] = useState(0);
  const favicon = candidate?.sourceUrl ? faviconUrl(candidate.sourceUrl) : null;
  if (urls[index]) {
    return <img src={urls[index]} alt={alt} loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => setIndex((c) => c + 1)} className="h-full w-full object-contain" />;
  }
  // No product image — show merchant fallback (never invent product image)
  if (candidate) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-surface p-2 text-center">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-[14px] font-black text-ink shadow-sm border border-line">
          {favicon ? <img src={favicon} alt="" width={18} height={18} loading="lazy" decoding="async" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none'; }} /> : merchantInitial(candidate.source)}
        </div>
        <span className="max-w-[78px] truncate text-[10px] font-bold text-muted leading-tight">{candidate.source}</span>
      </div>
    );
  }
  return <div className="grid h-full w-full place-items-center bg-surface text-muted"><ImageIcon size={30} /></div>;
};

const MatchBadge: React.FC<{ value: number }> = ({ value }) => (
  <span className="absolute left-1.5 top-1.5 rounded-lg bg-white/95 px-1.5 py-1 text-center shadow-sm">
    <span className="block text-[12px] font-extrabold leading-none text-brand">{value}%</span>
    <span className="block text-[8px] font-bold text-ink">{/* Match */}Match</span>
  </span>
);

const RatingLine: React.FC<{ candidate: AyrovixCandidate }> = ({ candidate }) => {
  const { tr, locale } = useLocale();
  const rating = displayRating(candidate);
  const merchant = candidate.ratingKind === 'merchant';
  return (
    <p className="inline-flex items-center gap-1 text-[10.5px] font-bold text-ink">
      <Star size={13} fill="currentColor" />{rating.toFixed(1)}/5
      {Number(candidate.ratingCount) > 0 && <span className="text-muted">({Number(candidate.ratingCount).toLocaleString(locale === 'ar' ? 'ar-TN' : 'fr-FR')})</span>}
      {!merchant && <span className="text-muted">{tr('pertinence', 'تطابق')}</span>}
    </p>
  );
};

const VariantHint: React.FC<{ candidate: AyrovixCandidate }> = ({ candidate }) => {
  const { tr } = useLocale();
  const hasVariants = candidate.colors.length > 0 || candidate.sizes.length > 0;
  if (hasVariants) {
    // Real variants are shown (never invented — only from API)
    return <p className="truncate text-[11px] font-semibold text-muted">{[candidate.brand, candidate.model].filter(Boolean).join(' ') || candidate.colors.join(' / ') || candidate.sizes.join(' / ')}</p>;
  }
  // No variants in this candidate — clearly direct to merchant sheet
  return (
    <p className="text-[11px] font-medium text-muted">
      {tr('Tailles/couleurs : voir la fiche marchand', 'المقاسات/الألوان: انظر صفحة المتجر')}
    </p>
  );
};

const priceLine = (candidate: AyrovixCandidate) => ({
  tnd: candidate.priceTnd != null ? `${candidate.priceTnd.toFixed(2)} DT` : '—',
  original: candidate.price != null ? `${Number(candidate.price).toFixed(Number(candidate.price) % 1 ? 2 : 0)} ${candidate.currency || ''}` : null,
});

export const LensResults: React.FC<LensResultsProps> = ({ view, fallbackImage, onChoose, onReset, onCommandDetected, onOpenHistory }) => {
  const { tr, direction } = useLocale();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const visible = useMemo(
    () => view.list.filter(isDisplayableCandidate).slice().sort((a, b) => (b.match || 0) - (a.match || 0)),
    [view.list],
  );
  const best = visible[0];
  const others = visible.slice(1);
  const name = view.queryLabel || best?.title || tr('Produit détecté par AYROVIX', 'منتج اكتشفته AYROVIX');
  const detected = view.detectedPrice;

  return (
    <div className="mx-auto max-w-md space-y-4" dir={direction}>
      {/* ===== Résumé: Résultat Lens ===== */}
      <div className="flex items-center gap-3 rounded-[20px] border border-line bg-white p-3">
        <div className="h-16 w-16 flex-none overflow-hidden rounded-xl border border-line bg-surface p-1">
          <CandidateImage candidate={best} fallback={detected?.imageUrl || fallbackImage} alt={name} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold text-brand"><Sparkles size={13} />{tr('Résultat Lens', 'نتيجة Lens')}</p>
          <h3 className="mt-0.5 truncate text-[16px] font-extrabold text-ink" title={name}>{name}</h3>
          <p className="text-[11px] font-semibold text-muted">{visible.length} {tr('correspondances trouvées', 'نتيجة موجودة')}</p>
        </div>
        <button type="button" onClick={() => setDetailsOpen((v) => !v)} className="flex flex-none items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-[11px] font-bold text-ink">
          {tr('Détails de la recherche', 'تفاصيل البحث')}
          <ChevronDown size={14} className={`transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {detailsOpen && (
        <div className="space-y-1.5 rounded-[16px] border border-line bg-surface p-3.5 text-[11.5px] font-semibold text-muted">
          <p>{tr('Requête', 'الطلب')} : <span className="font-extrabold text-ink break-words">{name}</span></p>
          {detected && <p>{tr('Prix visible détecté', 'سعر ظاهر مكتشف')} : <span className="font-extrabold text-ink">{detected.sourcePrice.toFixed(2)} {detected.sourceCurrency}</span> <span className="text-[11px] font-medium">({tr('à vérifier sur la fiche marchand', 'يُتحقق على صفحة المتجر')})</span></p>}
          <p>{tr('Correspondances', 'التطابقات')} : <span className="font-extrabold text-ink">{visible.length}</span></p>
          <p className="text-[11px] font-medium leading-relaxed">{tr('Aucune taille/couleur/prix n’est inventé. Seules les données retournées par le marchand sont affichées.', 'لا يتم اختراع أي مقاس/لون/سعر. تُعرض فقط البيانات المرجعة من المتجر.')}</p>
        </div>
      )}

      {/* ===== Prix repéré (screenshot panier) — fonctionnalité محفوظة ===== */}
      {detected && detected.sourcePrice > 0 && (
        <div className="overflow-hidden rounded-[22px] border-2 border-brand bg-white shadow-lg">
          <div className="relative h-44 bg-surface">
            <CandidateImage fallback={detected.imageUrl || fallbackImage} alt={detected.title || name} />
            <span className="absolute start-3 top-3 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-extrabold text-ink">{tr('Prix repéré', 'سعر مكتشف')}</span>
          </div>
          <div className="space-y-3 p-4">
            <h4 className="text-[15px] font-extrabold text-ink line-clamp-2" title={detected.title || name}>{detected.title || name}</h4>
            <p className="text-[11px] font-semibold text-muted">{tr('Prix repéré dans l’image — montant marchand à confirmer', 'سعر ملتقط من الصورة — مبلغ المتجر بانتظار التأكيد')}</p>
            <div className="rounded-2xl border border-line bg-surface p-3.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{tr('Estimation finale tout inclus', 'التقدير النهائي الشامل')}</p>
              <p className="mt-1 text-[26px] font-black leading-none text-ink">{detected.totalPriceTND?.toFixed(2) || '—'} DT</p>
              <p className="mt-1 text-[11px] font-semibold text-muted">{tr('Prix boutique', 'سعر المتجر')} {detected.sourcePrice.toFixed(2)} {detected.sourceCurrency} • {tr('estimation AYROVI (douane + transport + service inclus)', 'تقدير AYROVI (يشمل الجمركة والشحن والخدمة)')}</p>
              <p className="mt-1 text-[10.5px] font-medium text-muted leading-relaxed">{tr('Montant final recalculé au panier selon les règles tarifaires en vigueur.', 'يُعاد حساب المبلغ النهائي في السلة حسب القواعد التسعيرية السارية.')}</p>
            </div>
            <button type="button" onClick={() => onCommandDetected(detected)} className="ay-btn-primary w-full text-sm">
              {tr('Commander avec ce prix', 'الطلب بهذا السعر')} • {detected.totalPriceTND?.toFixed(2) || detected.sourcePrice.toFixed(2)} DT
            </button>
            <p className="text-center text-[11px] font-medium text-muted">{tr('Un lien marchand sera demandé à l’étape suivante pour vérification.', 'سيُطلب رابط المتجر في الخطوة التالية للتحقق.')}</p>
          </div>
        </div>
      )}

      {/* ===== Meilleure correspondance ===== */}
      {best && (
        <article className="rounded-[22px] border-2 border-brand/60 bg-brand/5 p-3.5">
          <p className="mb-2.5 inline-block rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink">{tr('Meilleure correspondance', 'أفضل تطابق')}</p>
          <div className="flex gap-3">
            <div className="relative h-[110px] w-[92px] flex-none overflow-hidden rounded-xl border border-line bg-white p-1">
              <CandidateImage candidate={best} fallback={fallbackImage} alt={best.title} />
              <MatchBadge value={best.match} />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-[14px] font-extrabold leading-snug text-ink line-clamp-2" title={best.title}>{best.title}</h4>
              <VariantHint candidate={best} />
              <p className="text-[11px] font-semibold text-muted truncate">{best.source}</p>
              {/* TND clarity — label + value + merchant price */}
              <div className="mt-2 rounded-xl bg-white/70 border border-white px-2.5 py-2">
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{tr('Prix final estimé', 'السعر النهائي التقديري')}</p>
                <p className="mt-0.5 text-[19px] font-black leading-none text-ink">{priceLine(best).tnd}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-muted">
                  {priceLine(best).original ? <>{tr('Prix boutique', 'سعر المتجر')} {priceLine(best).original} • {best.source}</> : best.source}
                </p>
                <p className="mt-0.5 text-[10.5px] font-medium text-muted">{tr('Estimation tout inclus (douane + transport + service).', 'تقدير شامل (جمركة + شحن + خدمة).')}</p>
              </div>
              <div className="mt-1"><RatingLine candidate={best} /></div>
            </div>
          </div>
          <button type="button" onClick={() => onChoose(best)} className="ay-cta-orange mt-3 flex w-full items-center justify-center gap-2 rounded-full py-3 text-[14px] font-extrabold text-white">
            {tr('Choisir cette offre', 'اختر هذا العرض')} <ArrowRight size={17} className={direction === 'rtl' ? 'rotate-180' : ''} />
          </button>
          {best.sourceUrl && (
            <a href={best.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2.5 flex items-center justify-center gap-1.5 text-[12px] font-bold text-ink underline">
              {tr(`Voir chez ${best.source}`, `عرض لدى ${best.source}`)} <ArrowUpRight size={14} />
            </a>
          )}
        </article>
      )}

      {/* ===== Autres correspondances ===== */}
      {others.length > 0 && (
        <>
          <h4 className="text-[14px] font-extrabold text-ink">{tr('Autres correspondances', 'تطابقات أخرى')}</h4>
          <div className="space-y-2.5">
            {others.map((candidate) => (
              <article key={candidate.id} className="rounded-[20px] border border-line bg-white p-3">
                <div className="flex gap-3">
                  <div className="relative h-[96px] w-[80px] flex-none overflow-hidden rounded-xl border border-line bg-white p-1">
                    <CandidateImage candidate={candidate} fallback={fallbackImage} alt={candidate.title} />
                    <MatchBadge value={candidate.match} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h5 className="text-[13px] font-bold leading-snug text-ink line-clamp-2" title={candidate.title}>{candidate.title}</h5>
                    <VariantHint candidate={candidate} />
                    <p className="text-[11px] font-semibold text-muted truncate">{candidate.source}</p>
                    <div className="mt-1.5 rounded-xl bg-surface border border-line px-2.5 py-1.5">
                      <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{tr('Prix final estimé', 'السعر النهائي التقديري')}</p>
                      <p className="text-[15px] font-black leading-none text-ink">{priceLine(candidate).tnd}</p>
                      <p className="text-[10.5px] font-semibold text-muted">{priceLine(candidate).original ? <>{tr('Prix boutique', 'سعر المتجر')} {priceLine(candidate).original} • {candidate.source}</> : candidate.source}</p>
                    </div>
                    <div className="mt-1"><RatingLine candidate={candidate} /></div>
                  </div>
                  <div className="flex flex-none flex-col items-stretch justify-center gap-2">
                    <button type="button" onClick={() => onChoose(candidate)} className="ay-btn-secondary flex items-center justify-center gap-1.5 px-3 py-2 text-[11.5px] font-extrabold">
                      {tr('Choisir', 'اختيار')} <ArrowRight size={14} className={`text-brand ${direction === 'rtl' ? 'rotate-180' : ''}`} />
                    </button>
                    {candidate.sourceUrl && (
                      <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1 text-[10.5px] font-bold text-muted underline">
                        {tr(`Voir chez ${candidate.source}`, `عرض لدى ${candidate.source}`)} <ArrowUpRight size={12} />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/* ===== Empty state ===== */}
      {!best && !(detected && detected.sourcePrice > 0) && (
        <div className="space-y-4 rounded-[22px] border border-dashed border-line bg-white p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface text-muted"><ImageIcon size={22} /></div>
          <p className="text-sm font-extrabold text-ink">{tr('Aucune correspondance trouvée', 'لا توجد مطابقة')}</p>
          <p className="mx-auto max-w-[32ch] text-xs leading-relaxed text-muted">
            {view.queryLabel
              ? tr(`Aucun résultat pour « ${view.queryLabel} ». Vérifiez l’orthographe, essayez des mots-clés plus courts (marque + modèle) ou collez le lien direct de la page marchand pour un calcul exact.`, `لا نتائج لـ “${view.queryLabel}”. تحقق من الإملاء، جرّب كلمات أقصر (ماركة + موديل) أو ألصق رابط صفحة المتجر لحساب دقيق.`)
              : tr('Essayez le lien direct de la page boutique pour un calcul exact, ou relancez avec une photo plus nette.', 'جرّب الرابط المباشر لصفحة المتجر للحصول على حساب دقيق، أو أعد المحاولة بصورة أوضح.')}
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <button type="button" onClick={onReset} className="ay-btn-primary w-full sm:w-auto text-xs px-5">
              {tr('Nouvelle recherche', 'بحث جديد')} <Camera size={14} />
            </button>
            {onOpenHistory && (
              <button type="button" onClick={onOpenHistory} className="ay-btn-secondary w-full sm:w-auto text-xs px-5">
                {tr('Recherches récentes', 'عمليات البحث الأخيرة')}
              </button>
            )}
          </div>
          <p className="text-[11px] font-medium text-muted leading-relaxed">
            {tr('Astuce : le lien produit donne le prix le plus fiable. Les tailles/couleurs manquantes se vérifient sur la fiche marchand.', 'نصيحة: رابط المنتج يعطي السعر الأكثر موثوقية. المقاسات/الألوان الناقصة تُتحقق على صفحة المتجر.')}
          </p>
        </div>
      )}

      {/* ===== Trust ===== */}
      <div className="flex items-center gap-3 rounded-[16px] bg-surface px-3.5 py-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-white text-ink"><ShieldCheck size={17} /></span>
        <div className="min-w-0 flex-1">
          <strong className="block text-[12px] font-extrabold text-ink">{tr('Prix vérifiés et marchands fiables', 'أسعار متحقق منها وتجار موثوقون')}</strong>
          <p className="text-[10.5px] font-semibold text-muted">{tr('Aucune donnée n’est inventée. Les prix varient selon le marchand — vérification manuelle incluse après acompte.', 'لا يتم اختراع أي بيانات. الأسعار تختلف حسب المتجر — التحقق اليدوي مشمول بعد العربون.')}</p>
        </div>
        <ChevronRight size={15} className="text-muted" />
      </div>

      <button type="button" onClick={onReset} className="ay-btn-secondary flex w-full items-center justify-center gap-2 py-3 text-sm font-extrabold">
        <Camera size={16} />{tr('Nouvelle recherche', 'بحث جديد')}
      </button>
    </div>
  );
};
