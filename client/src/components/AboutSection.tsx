import React from 'react';
import { ArrowRightLeft, ShieldCheck, Sparkles, Truck } from './QatafoIcons';
import aboutParallaxImage from '../assets/about-parallax.jpg';

const BENEFITS = [
  {
    step: '01',
    title: 'Taux Fixe & Garanti',
    description:
      'Un taux clair et garanti vous permet de connaître le montant exact en Dinars dès la validation de votre panier.',
    icon: ArrowRightLeft,
    iconClassName: 'bg-[#ffc24b] text-[#1d2130]',
    accentClassName: 'from-[#ffc24b] to-[#ff9f43]',
  },
  {
    step: '02',
    title: 'Dédouanement Inclus',
    description:
      "Toutes les démarches administratives, taxes d’importation et dédouanement sont entièrement prises en charge.",
    icon: ShieldCheck,
    iconClassName: 'bg-[#673de6] text-white',
    accentClassName: 'from-[#673de6] to-[#9b7cf7]',
  },
  {
    step: '03',
    title: 'Livraison 24 Gouvernorats',
    description:
      "Expédition sécurisée jusqu’à votre domicile partout en Tunisie avec option de paiement en espèces à la livraison.",
    icon: Truck,
    iconClassName: 'bg-emerald-500 text-white',
    accentClassName: 'from-emerald-500 to-[#43b1de]',
  },
];

export const AboutSection: React.FC = () => {
  return (
    <section className="relative bg-white" aria-labelledby="why-ayrovi-title">
      <header className="px-4 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#673de6]/20 bg-[#673de6]/10 px-3.5 py-1 text-[11px] font-bold text-[#673de6] shadow-sm sm:text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Pourquoi choisir AYROVI ?</span>
          </div>
          <h2
            id="why-ayrovi-title"
            className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-[#1d2130] sm:text-5xl"
          >
            La simplicité d’un achat local pour vos marques mondiales
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm font-medium leading-7 text-[#697180] sm:text-base">
            Plus besoin de carte bancaire internationale ni de formalités douanières complexes.
            AYROVI s’occupe de l’importation de A à Z.
          </p>
        </div>
      </header>

      {/* One fixed portrait remains visible while the three cards scroll over it. */}
      <div className="relative isolate min-h-[300svh] overflow-clip bg-[#edf9ff]">
        <div className="sticky top-0 h-[100svh] overflow-hidden" aria-hidden="true">
          <img
            src={aboutParallaxImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[38%_center] sm:object-center lg:object-[34%_center]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-[#081426]/40 sm:bg-gradient-to-r sm:from-transparent sm:via-white/10 sm:to-[#f8fcff]/90" />
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/65 to-transparent" />
        </div>

        <div className="relative z-10 -mt-[100svh]">
          {BENEFITS.map(
            ({ step, title, description, icon: Icon, iconClassName, accentClassName }) => (
              <article key={title} className="flex min-h-[100svh] w-full items-center py-16 sm:py-20">
                <div className="relative w-full overflow-hidden border-y border-white/85 bg-white/85 p-7 shadow-[0_30px_80px_-28px_rgba(12,65,94,0.45)] backdrop-blur-xl transition-[box-shadow,background-color] duration-500 ease-out hover:bg-white/90 hover:shadow-[0_38px_90px_-30px_rgba(12,65,94,0.55)] sm:p-10 lg:p-14">
                  <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${accentClassName}`} />

                  <div className="flex items-start justify-between gap-5">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-md sm:h-14 sm:w-14 ${iconClassName}`}>
                      <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
                    </span>
                    <span className="text-5xl font-black leading-none text-[#1d2130]/[0.07] sm:text-6xl">
                      {step}
                    </span>
                  </div>

                  <div className="my-7 h-px w-full bg-gradient-to-r from-[#673de6]/55 via-[#dfeaf0] to-transparent" />

                  <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#673de6]">
                    Avantage AYROVI
                  </p>
                  <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-[#1d2130] sm:text-3xl lg:text-4xl">
                    {title}
                  </h3>
                  <p className="mt-4 max-w-3xl text-sm font-medium leading-7 text-[#697180] sm:text-base sm:leading-8">
                    {description}
                  </p>
                </div>
              </article>
            ),
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 bg-white px-4 py-16 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#673de6] sm:text-xs">
        <span className="h-px w-10 bg-[#fbbf24]" />
        Simple · Transparent · Local
        <span className="h-px w-10 bg-[#fbbf24]" />
      </div>
    </section>
  );
};
