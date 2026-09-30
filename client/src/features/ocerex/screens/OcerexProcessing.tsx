import React from 'react';
import { Check, Loader2 } from '../../../components/QatafoIcons';
import { useLocale } from '../../../i18n/LocaleContext';
import type { OcerexStage } from '../types';

const STAGES: Array<{ id: OcerexStage; fr: string; ar: string }> = [
  { id: 'image', fr: 'Analyse de l’image', ar: 'تحليل الصورة' },
  { id: 'read', fr: 'Lecture des prix', ar: 'قراءة الأسعار' },
  { id: 'reference', fr: 'Prix de référence', ar: 'تحديد السعر المرجعي' },
  { id: 'price', fr: 'Calcul du prix Ayrovi', ar: 'حساب سعر Ayrovi' },
];

export const OcerexProcessing: React.FC<{ active: OcerexStage }> = ({ active }) => {
  const { tr } = useLocale();
  const activeIndex = STAGES.findIndex((stage) => stage.id === active);
  return (
    <div className="mx-auto w-full max-w-md px-5 py-10" role="status" aria-live="polite">
      <h2 className="font-display text-2xl font-black text-ink">{tr('Lecture de l’image…', 'جاري قراءة الصورة...')}</h2>
      <ol className="mt-8 space-y-4">
        {STAGES.map((stage, index) => {
          const done = index < activeIndex;
          const current = index === activeIndex;
          return (
            <li key={stage.id} className="flex items-center gap-3 text-sm font-bold text-ink">
              <span className="grid h-7 w-7 place-items-center" aria-hidden>
                {done ? <Check className="h-5 w-5 text-success" /> : current ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="h-2 w-2 rounded-full bg-line" />}
              </span>
              <span className={done || current ? 'text-ink' : 'text-muted'}>{tr(stage.fr, stage.ar)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
