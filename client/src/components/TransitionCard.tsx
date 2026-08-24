import React from 'react';

/**
 * TRANSITION CARD — Editorial Transition Card تحت الـTrust Bar
 * بطاقة برتقالية صلبة بنص أبيض، بلا CTA وبلا صور — وظيفتها انتقال بصري فقط.
 */

const TITLE = 'Découvrez AYROVI';
const DESCRIPTION = 'Des outils intelligents pour trouver, comprendre et commander plus simplement.';

export const TransitionCard: React.FC = () => (
  <section aria-label={TITLE} className="transition-card-fade relative mx-6 overflow-hidden rounded-[22px] bg-[#FF7A00] px-7 py-8 text-white lg:mx-auto lg:max-w-7xl lg:rounded-[24px] lg:px-8 lg:py-9" style={{ marginBottom: 0 }}>
    {/* شكل هندسي خفيف بدرجة برتقالية مختلفة قليلاً — الزاوية فقط */}
    <span aria-hidden className="pointer-events-none absolute -end-16 -top-20 h-48 w-48 rounded-full bg-[#FF8F33]/60" />
    <span aria-hidden className="pointer-events-none absolute -end-6 -bottom-24 h-36 w-36 rounded-full bg-[#E56A00]/50" />
    <div className="relative z-10">
      <h2 className="ay-edit-26">{TITLE}</h2>
      <p className="mt-3 max-w-2xl text-[15px] font-medium leading-[1.5] text-white/90 sm:text-base lg:text-[17px]">{DESCRIPTION}</p>
    </div>
  </section>
);
